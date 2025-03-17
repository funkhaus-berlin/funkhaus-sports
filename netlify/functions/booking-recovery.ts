// netlify/functions/booking-recovery.ts
import admin from 'firebase-admin'
import { corsHeaders } from './_shared/cors'
import stripe from './_shared/stripe'
import { Booking } from './types/booking.types'

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
	admin.initializeApp({
		credential: admin.credential.cert({
			projectId: process.env.FIREBASE_PROJECT_ID,
			clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
			privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
		}),
	})
}

const db = admin.firestore()

async function handler(request: Request, context: any): Promise<Response> {
	// Handle preflight OPTIONS request for CORS
	if (request.method === 'OPTIONS') {
		return new Response('', { status: 200, headers: corsHeaders })
	}

	// Require API key for security
	const apiKey = request.headers.get('x-api-key')
	if (apiKey !== process.env.RECOVERY_API_KEY) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
	}

	try {
		const url = new URL(request.url)
		const mode = url.searchParams.get('mode') || 'scan'
		const bookingId = url.searchParams.get('bookingId') || undefined
		const paymentIntentId = url.searchParams.get('paymentIntentId') || undefined
		const daysParam = url.searchParams.get('days')
		const days = daysParam ? parseInt(daysParam, 10) : 7

		let result: any = { recovered: 0, checked: 0, errors: 0 }

		// Choose recovery approach based on mode
		switch (mode) {
			case 'single':
				if (bookingId) {
					result = await recoverSingleBooking(bookingId)
				} else if (paymentIntentId) {
					result = await recoverByPaymentIntent(paymentIntentId)
				} else {
					return new Response(JSON.stringify({ error: 'bookingId or paymentIntentId required for single mode' }), {
						status: 400,
						headers: corsHeaders,
					})
				}
				break

			case 'scan':
				result = await scanAndRecoverInconsistentBookings(days)
				break

			case 'cleanup':
				result = await cleanupStuckPendingBookings(days)
				break

			default:
				return new Response(JSON.stringify({ error: 'Invalid mode. Use "single", "scan", or "cleanup"' }), {
					status: 400,
					headers: corsHeaders,
				})
		}

		return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders })
	} catch (error: any) {
		console.error('Error in booking recovery function:', error)
		return new Response(JSON.stringify({ error: 'Internal server error during recovery process' }), {
			status: 500,
			headers: corsHeaders,
		})
	}
}

/**
 * Recover a single booking by ID.
 */
async function recoverSingleBooking(bookingId: string): Promise<any> {
	try {
		const bookingRef = db.collection('bookings').doc(bookingId)
		const bookingDoc = await bookingRef.get()

		if (!bookingDoc.exists) {
			return { error: 'Booking not found', recovered: 0 }
		}

		const booking = bookingDoc.data() as Booking

		// If booking has a payment intent ID, recover by payment intent
		if (booking.paymentIntentId) {
			return await recoverByPaymentIntent(booking.paymentIntentId, bookingId)
		}

		// If booking has 'pending' status for too long, mark as abandoned
		if (booking.paymentStatus === 'pending') {
			const createdAt = booking.createdAt.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt)
			const hoursSincePending = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60)

			if (hoursSincePending > 2) {
				await bookingRef.update({
					paymentStatus: 'abandoned',
					status: 'cancelled',
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					recoveryNotes: 'Marked as abandoned due to prolonged pending status',
				})

				return {
					recovered: 1,
					action: 'marked_abandoned',
					bookingId,
					message: 'Booking marked as abandoned due to being in pending state for too long',
				}
			}
		}

		return { recovered: 0, message: 'No recovery action needed', bookingId }
	} catch (error: any) {
		console.error(`Error recovering booking ${bookingId}:`, error)
		return { error: error.message, recovered: 0, bookingId }
	}
}

/**
 * Recover booking by payment intent ID.
 */
async function recoverByPaymentIntent(paymentIntentId: string, knownBookingId?: string): Promise<any> {
	try {
		const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
		const bookingId = knownBookingId || paymentIntent.metadata?.bookingId

		if (!bookingId) {
			return { error: 'No booking ID found in payment intent metadata', recovered: 0 }
		}

		const bookingRef = db.collection('bookings').doc(bookingId)
		const bookingDoc = await bookingRef.get()

		if (!bookingDoc.exists) {
			// Handle case where payment exists but booking doesn't – create emergency booking if payment succeeded
			if (paymentIntent.status === 'succeeded') {
				const recoveryBooking = createEmergencyBookingFromPayment(paymentIntent, bookingId)
				await bookingRef.set(recoveryBooking)
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
		const bookingPaymentStatus = booking.paymentStatus
		const stripeStatus = paymentIntent.status

		if (bookingPaymentStatus === 'paid' && stripeStatus === 'succeeded') {
			return { recovered: 0, message: 'Booking and payment are in sync', bookingId }
		}

		if (stripeStatus === 'succeeded' && bookingPaymentStatus !== 'paid') {
			await bookingRef.update({
				paymentStatus: 'paid',
				status: 'confirmed',
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				recoveryNotes: 'Updated via recovery process - payment was successful in Stripe',
			})
			await logRecoveryAction(bookingId, paymentIntentId, 'updated_booking_status_to_paid')
			return {
				recovered: 1,
				action: 'updated_to_paid',
				bookingId,
				message: 'Updated booking status to paid based on Stripe payment status',
			}
		}

		if (stripeStatus === 'canceled' && bookingPaymentStatus !== 'cancelled') {
			await bookingRef.update({
				paymentStatus: 'cancelled',
				status: 'cancelled',
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				recoveryNotes: 'Updated via recovery process - payment was cancelled in Stripe',
			})
			await logRecoveryAction(bookingId, paymentIntentId, 'updated_booking_status_to_cancelled')
			return {
				recovered: 1,
				action: 'updated_to_cancelled',
				bookingId,
				message: 'Updated booking status to cancelled based on Stripe payment status',
			}
		}

		return {
			recovered: 0,
			message: `No recovery action taken. Booking status: ${bookingPaymentStatus}, Stripe status: ${stripeStatus}`,
			bookingId,
		}
	} catch (error: any) {
		console.error(`Error recovering by payment intent ${paymentIntentId}:`, error)
		return { error: error.message, recovered: 0, paymentIntentId }
	}
}

/**
 * Create an emergency booking record from payment data.
 */
function createEmergencyBookingFromPayment(paymentIntent: any, bookingId: string): any {
	const { courtId, date, startTime, endTime, userId } = paymentIntent.metadata || {}
	const customerEmail = paymentIntent.receipt_email || null
	const customerName = paymentIntent.shipping?.name || 'Emergency Recovery'
	const bookingStartTime = startTime || new Date().toISOString()
	const bookingEndTime = endTime || new Date(new Date(bookingStartTime).getTime() + 60 * 60 * 1000).toISOString() // Default to 1 hour
	const amount = paymentIntent.amount / 100

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
		recoveredFromPayment: true,
		emergencyRecovery: true,
	}
}

/**
 * Scan for inconsistent bookings and recover them.
 */
async function scanAndRecoverInconsistentBookings(daysToScan: number): Promise<any> {
	try {
		const startDate = new Date()
		startDate.setDate(startDate.getDate() - daysToScan)

		const bookingsSnapshot = await db.collection('bookings').where('createdAt', '>=', startDate).get()

		const results = {
			checked: bookingsSnapshot.size,
			recovered: 0,
			errors: 0,
			actions: [] as any[],
		}

		for (const doc of bookingsSnapshot.docs) {
			const booking = doc.data()
			if (!booking.paymentIntentId) {
				continue
			}
			try {
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
	} catch (error: any) {
		console.error('Error scanning for inconsistent bookings:', error)
		return { error: error.message, checked: 0, recovered: 0 }
	}
}

/**
 * Clean up bookings stuck in pending status.
 */
async function cleanupStuckPendingBookings(daysToScan: number): Promise<any> {
	try {
		const startDate = new Date()
		startDate.setDate(startDate.getDate() - daysToScan)
		const twoHoursAgo = new Date()
		twoHoursAgo.setHours(twoHoursAgo.getHours() - 2)

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

		for (const doc of bookingsSnapshot.docs) {
			try {
				const bookingRef = doc.ref
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
	} catch (error: any) {
		console.error('Error cleaning up stuck bookings:', error)
		return { error: error.message, checked: 0, abandoned: 0 }
	}
}

/**
 * Log recovery actions for auditing.
 */
async function logRecoveryAction(
	bookingId: string,
	paymentIntentId: string | undefined,
	action: string,
): Promise<void> {
	try {
		await db.collection('recoveryActions').add({
			bookingId,
			paymentIntentId,
			action,
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
			source: 'recovery_function',
		})
	} catch (error) {
		console.error('Error logging recovery action:', error)
	}
}

export { handler }
