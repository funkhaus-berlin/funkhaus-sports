// netlify/functions/booking-recovery.ts
import { Handler } from '@netlify/functions'
import admin from 'firebase-admin'
import moment from 'moment'
import { corsHeaders } from './_shared/cors'
import stripe from './_shared/stripe'
import { Booking } from './types/booking.types'
import { db } from './_shared/firebase-admin'
import { from, of, throwError } from 'rxjs'
import { retry, delay, catchError, tap, map } from 'rxjs/operators'
import { lastValueFrom } from 'rxjs'


/**
 * Booking recovery function
 *
 * This function helps recover bookings that might be in an inconsistent state
 * by reconciling payment data with booking records.
 *
 * It can be triggered:
 * 1. Manually via an admin panel
 * 2. On a schedule (daily)
 * 3. When a user reports an issue
 */
const handler: Handler = async (event, context) => {
	// Handle preflight request for CORS
	if (event.httpMethod === 'OPTIONS') {
		return {
			statusCode: 200,
			headers: corsHeaders,
			body: '',
		}
	}

	// Require API key for security
	const apiKey = event.headers['x-api-key']
	if (apiKey !== process.env.RECOVERY_API_KEY) {
		return {
			statusCode: 401,
			headers: corsHeaders,
			body: JSON.stringify({ error: 'Unauthorized' }),
		}
	}

	try {
		const params = event.queryStringParameters || {}
		const mode = params.mode || 'scan'
		const bookingId = params.bookingId
		const paymentIntentId = params.paymentIntentId
		const days = params.days ? parseInt(params.days, 10) : 7

		let result: any = { recovered: 0, checked: 0, errors: 0 }

		// Choose recovery approach based on mode
		switch (mode) {
			case 'single':
				// Recover a specific booking by ID
				if (bookingId) {
					result = await recoverSingleBooking(bookingId)
				} else if (paymentIntentId) {
					result = await recoverByPaymentIntent(paymentIntentId)
				} else {
					return {
						statusCode: 400,
						headers: corsHeaders,
						body: JSON.stringify({ error: 'bookingId or paymentIntentId required for single mode' }),
					}
				}
				break

			case 'scan':
				// Scan for inconsistent bookings and fix them
				result = await scanAndRecoverInconsistentBookings(days)
				break

			case 'cleanup':
				// Clean up stuck pending bookings
				result = await cleanupStuckPendingBookings(days)
				break

			default:
				return {
					statusCode: 400,
					headers: corsHeaders,
					body: JSON.stringify({ error: 'Invalid mode. Use "single", "scan", or "cleanup"' }),
				}
		}

		return {
			statusCode: 200,
			headers: corsHeaders,
			body: JSON.stringify(result),
		}
	} catch (error) {
		console.error('Error in booking recovery function:', error)

		return {
			statusCode: 500,
			headers: corsHeaders,
			body: JSON.stringify({ error: 'Internal server error during recovery process' }),
		}
	}
}

/**
 * Recover a single booking by ID
 */
async function recoverSingleBooking(bookingId: string): Promise<any> {
	try {
		// Get the booking
		const bookingRef = db.collection('bookings').doc(bookingId)
		const bookingDoc = await bookingRef.get()

		if (!bookingDoc.exists) {
			return { error: 'Booking not found', recovered: 0 }
		}

		const booking = bookingDoc.data() as Booking

		// If booking has a payment intent ID, check its status
		if (booking.paymentIntentId) {
			return await recoverByPaymentIntent(booking.paymentIntentId, bookingId)
		}

		// If booking has 'pending' status for too long, mark as abandoned
		if (booking.paymentStatus === 'pending' || booking.status === 'holding') {
			const createdAt = moment(booking.createdAt)
			const hoursSincePending = (Date.now() - createdAt.valueOf()) / (1000 * 60 * 60)

			if (hoursSincePending > 2) {
				// 2 hours is enough time to complete payment
				const markAbandoned$ = from(bookingRef.update({
					paymentStatus: 'abandoned',
					status: 'cancelled',
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					recoveryNotes: 'Marked as abandoned due to prolonged pending status',
				})).pipe(
					retry({
						count: 2,
						delay: 1000
					}),
					catchError(error => {
						console.error('Failed to mark booking as abandoned:', error)
						return throwError(() => error)
					})
				)

				await lastValueFrom(markAbandoned$)

				return {
					recovered: 1,
					action: 'marked_abandoned',
					bookingId,
					message: 'Booking marked as abandoned due to being in pending state for too long',
				}
			}
		}

		return { recovered: 0, message: 'No recovery action needed', bookingId }
	} catch (error) {
		console.error(`Error recovering booking ${bookingId}:`, error)
		return { error: error.message, recovered: 0, bookingId }
	}
}

/**
 * Recover booking by payment intent ID
 */
async function recoverByPaymentIntent(paymentIntentId: string, knownBookingId?: string): Promise<any> {
	try {
		// First, get the payment intent from Stripe with retry logic
		const paymentIntent$ = from(stripe.paymentIntents.retrieve(paymentIntentId)).pipe(
			tap(() => console.log(`Retrieving payment intent ${paymentIntentId} for recovery...`)),
			retry({
				count: 3,
				delay: (error, retryCount) => {
					// Check if error is retryable
					const isRetryable = 
						error.type === 'StripeConnectionError' ||
						error.type === 'StripeAPIError' ||
						error.code === 'rate_limit' ||
						error.statusCode >= 500
					
					if (!isRetryable) {
						return throwError(() => error)
					}
					
					// Exponential backoff: 1s, 2s, 4s
					const delayMs = Math.pow(2, retryCount - 1) * 1000
					console.log(`Retry attempt ${retryCount} for Stripe API after ${delayMs}ms...`)
					return of(error).pipe(delay(delayMs))
				}
			}),
			catchError(error => {
				console.error('Failed to retrieve payment intent after retries:', error)
				return throwError(() => error)
			})
		)

		const paymentIntent = await lastValueFrom(paymentIntent$)

		// Try to find the booking ID, either from parameter or metadata
		const bookingId = knownBookingId || paymentIntent.metadata?.bookingId

		if (!bookingId) {
			return { error: 'No booking ID found in payment intent metadata', recovered: 0 }
		}

		// Get the booking
		const bookingRef = db.collection('bookings').doc(bookingId)
		const bookingDoc = await bookingRef.get()

		if (!bookingDoc.exists) {
			// Handle case where payment exists but booking doesn't - create emergency booking
			if (paymentIntent.status === 'succeeded') {
				const recoveryBooking = createEmergencyBookingFromPayment(paymentIntent, bookingId)
				
				const createBooking$ = from(bookingRef.set(recoveryBooking)).pipe(
					tap(() => console.log(`Creating emergency booking ${bookingId}...`)),
					retry({
						count: 3,
						delay: (error, retryCount) => {
							const delayMs = Math.pow(2, retryCount - 1) * 500
							console.log(`Retry attempt ${retryCount} for booking creation after ${delayMs}ms...`)
							return of(error).pipe(delay(delayMs))
						}
					}),
					catchError(error => {
						console.error('Failed to create emergency booking after retries:', error)
						return throwError(() => error)
					})
				)

				await lastValueFrom(createBooking$)
				await logRecoveryAction(bookingId, paymentIntentId, 'created_missing_booking')

				return {
					recovered: 1,
					action: 'created_booking',
					bookingId,
					message: 'Created missing booking record from payment data',
				}
			}

			return { error: 'Booking not found and payment not succeeded', recovered: 0 }
		}

		const booking = bookingDoc.data() as Booking

		// Check if payment status in booking matches Stripe
		const bookingPaymentStatus = booking.paymentStatus
		const stripeStatus = paymentIntent.status

		if (bookingPaymentStatus === 'paid' && stripeStatus === 'succeeded') {
			// Everything is consistent, no action needed
			return { recovered: 0, message: 'Booking and payment are in sync', bookingId }
		}

		// Handle mismatched statuses
		if (stripeStatus === 'succeeded' && bookingPaymentStatus !== 'paid') {
			// Payment succeeded in Stripe but not marked in booking
			const updateBooking$ = from(bookingRef.update({
				paymentStatus: 'paid',
				status: 'confirmed',
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				recoveryNotes: 'Updated via recovery process - payment was successful in Stripe',
			})).pipe(
				tap(() => console.log(`Updating booking ${bookingId} to paid status...`)),
				retry({
					count: 3,
					delay: (error, retryCount) => {
						const delayMs = Math.pow(2, retryCount - 1) * 500
						console.log(`Retry attempt ${retryCount} for booking update after ${delayMs}ms...`)
						return of(error).pipe(delay(delayMs))
					}
				}),
				catchError(error => {
					console.error('Failed to update booking status after retries:', error)
					return throwError(() => error)
				})
			)

			await lastValueFrom(updateBooking$)

			await logRecoveryAction(bookingId, paymentIntentId, 'updated_booking_status_to_paid')

			return {
				recovered: 1,
				action: 'updated_to_paid',
				bookingId,
				message: 'Updated booking status to paid based on Stripe payment status',
			}
		}

		if (stripeStatus === 'canceled' && bookingPaymentStatus !== 'cancelled') {
			// Payment canceled in Stripe but not in booking
			const updateToCancelled$ = from(bookingRef.update({
				paymentStatus: 'cancelled',
				status: 'cancelled',
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				recoveryNotes: 'Updated via recovery process - payment was cancelled in Stripe',
			})).pipe(
				tap(() => console.log(`Updating booking ${bookingId} to cancelled status...`)),
				retry({
					count: 3,
					delay: (error, retryCount) => {
						const delayMs = Math.pow(2, retryCount - 1) * 500
						console.log(`Retry attempt ${retryCount} for booking cancellation after ${delayMs}ms...`)
						return of(error).pipe(delay(delayMs))
					}
				}),
				catchError(error => {
					console.error('Failed to update booking to cancelled after retries:', error)
					return throwError(() => error)
				})
			)

			await lastValueFrom(updateToCancelled$)

			await logRecoveryAction(bookingId, paymentIntentId, 'updated_booking_status_to_cancelled')

			return {
				recovered: 1,
				action: 'updated_to_cancelled',
				bookingId,
				message: 'Updated booking status to cancelled based on Stripe payment status',
			}
		}

		// Other status transitions can be handled as needed

		return {
			recovered: 0,
			message: `No recovery action taken. Booking status: ${bookingPaymentStatus}, Stripe status: ${stripeStatus}`,
			bookingId,
		}
	} catch (error) {
		console.error(`Error recovering by payment intent ${paymentIntentId}:`, error)
		return { error: error.message, recovered: 0, paymentIntentId }
	}
}

/**
 * Create an emergency booking record from payment data
 */
function createEmergencyBookingFromPayment(paymentIntent: any, bookingId: string): any {
	const { courtId, date, startTime, endTime, userId } = paymentIntent.metadata || {}
	const customerEmail = paymentIntent.receipt_email || null
	const customerName = paymentIntent.shipping?.name || 'Emergency Recovery'

	// Extract time information from metadata or use defaults
	const bookingStartTime = startTime || new Date().toISOString()
	const bookingEndTime = endTime || new Date(new Date(bookingStartTime).getTime() + 60 * 60 * 1000).toISOString() // Default to 1 hour
	const amount = paymentIntent.amount / 100 // Convert from cents

	return {
		id: bookingId,
		courtId: courtId || 'recovery-unknown',
		date: date || new Date().toISOString().split('T')[0],
		startTime: bookingStartTime,
		endTime: bookingEndTime,
		userId: userId || 'emergency-recovery',
		userName: customerName,
		customerEmail: customerEmail,
		customerAddress: paymentIntent.shipping?.address || {},
		customerPhone: '',
		price: amount,
		paymentStatus: 'paid',
		status: 'confirmed',
		paymentIntentId: paymentIntent.id,
		createdAt: admin.firestore.FieldValue.serverTimestamp(),
		updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		recoveredFromPayment: true, // Flag to indicate this was created from payment data
		emergencyRecovery: true,
	}
}

/**
 * Scan for inconsistent bookings and recover them
 */
async function scanAndRecoverInconsistentBookings(daysToScan: number): Promise<any> {
	try {
		// Calculate date range
		const startDate = new Date()
		startDate.setDate(startDate.getDate() - daysToScan)

		// Get bookings created within the time range
		const bookingsSnapshot = await db.collection('bookings').where('createdAt', '>=', startDate).get()

		const results = {
			checked: bookingsSnapshot.size,
			recovered: 0,
			errors: 0,
			actions: [] as any[],
		}

		// Check each booking
		for (const doc of bookingsSnapshot.docs) {
			const booking = doc.data()

			// Skip bookings without payment intent
			if (!booking.paymentIntentId) {
				continue
			}

			try {
				// Recover this booking
				const recoveryResult = await recoverByPaymentIntent(booking.paymentIntentId, doc.id)

				if (recoveryResult.recovered > 0) {
					results.recovered += recoveryResult.recovered
					results.actions.push({
						bookingId: doc.id,
						action: recoveryResult.action,
						message: recoveryResult.message,
					})
				}
			} catch (error) {
				results.errors++
				console.error(`Error processing booking ${doc.id}:`, error)
			}
		}

		return results
	} catch (error) {
		console.error('Error scanning for inconsistent bookings:', error)
		return { error: error.message, checked: 0, recovered: 0 }
	}
}

/**
 * Clean up bookings stuck in pending status
 */
async function cleanupStuckPendingBookings(daysToScan: number): Promise<any> {
	try {
		// Calculate date range
		const startDate = new Date()
		startDate.setDate(startDate.getDate() - daysToScan)
		const twoHoursAgo = new Date()
		twoHoursAgo.setHours(twoHoursAgo.getHours() - 2)

		// Get pending bookings that are older than 2 hours
		const bookingsSnapshot = await db
			.collection('bookings')
			.where('paymentStatus', '==', 'pending')
			.where('createdAt', '<=', twoHoursAgo)
			.where('createdAt', '>=', startDate)
			.get()

		const results = {
			checked: bookingsSnapshot.size,
			abandoned: 0,
			errors: 0,
			bookings: [] as any[],
		}

		// Process each stuck pending booking
		for (const doc of bookingsSnapshot.docs) {
			try {
				const bookingRef = doc.ref

				// Mark as abandoned
				await bookingRef.update({
					paymentStatus: 'abandoned',
					status: 'cancelled',
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					recoveryNotes: 'Marked as abandoned during stuck booking cleanup',
				})

				results.abandoned++
				results.bookings.push({
					bookingId: doc.id,
					createdAt: doc.data().createdAt.toDate ? doc.data().createdAt.toDate() : doc.data().createdAt,
				})

				await logRecoveryAction(doc.id, doc.data().paymentIntentId, 'marked_stuck_booking_abandoned')
			} catch (error) {
				results.errors++
				console.error(`Error processing stuck booking ${doc.id}:`, error)
			}
		}

		return results
	} catch (error) {
		console.error('Error cleaning up stuck bookings:', error)
		return { error: error.message, checked: 0, abandoned: 0 }
	}
}

/**
 * Log recovery actions for auditing
 */
async function logRecoveryAction(
	bookingId: string,
	paymentIntentId: string | undefined,
	action: string,
): Promise<void> {
	try {
		const logAction$ = from(db.collection('recoveryActions').add({
			bookingId,
			paymentIntentId,
			action,
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
			source: 'recovery_function',
		})).pipe(
			retry({
				count: 2,
				delay: 500
			}),
			catchError(error => {
				console.error('Failed to log recovery action after retries:', error)
				return of(null) // Don't fail recovery if logging fails
			})
		)

		await lastValueFrom(logAction$)
	} catch (error) {
		console.error('Error logging recovery action:', error)
	}
}

export default { handler }
