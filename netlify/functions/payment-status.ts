// netlify/functions/payment-status.ts
import { Handler } from '@netlify/functions'
import admin from 'firebase-admin'
import { corsHeaders } from './_shared/cors'
import stripe from './_shared/stripe'
import { Booking } from './types/booking.types'
import { db } from './_shared/firebase-admin'
import { from, of, throwError } from 'rxjs'
import { retry, delay, catchError, tap, map } from 'rxjs/operators'
import { lastValueFrom } from 'rxjs'



/**
 * Payment status endpoint
 *
 * This endpoint allows checking the status of a payment and its associated booking.
 * It provides a mechanism for recovery in case the client disconnects during payment completion.
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

	// Only allow GET requests
	if (event.httpMethod !== 'GET') {
		return {
			statusCode: 405,
			headers: corsHeaders,
			body: JSON.stringify({ error: 'Method Not Allowed' }),
		}
	}

	try {
		const params = event.queryStringParameters || {}
		let paymentIntentId = params.paymentIntentId
		const bookingId = params.bookingId

		// Check for required parameters
		if (!paymentIntentId && !bookingId) {
			return {
				statusCode: 400,
				headers: corsHeaders,
				body: JSON.stringify({ error: 'Either paymentIntentId or bookingId must be provided' }),
			}
		}

		let paymentStatus: any = null
		let bookingData: Booking | null = null
		let attempts = 0

		// If bookingId is provided, get booking data with retry logic
		if (bookingId) {
			try {
				const bookingRef = db.collection('bookings').doc(bookingId)
				const bookingDoc$ = from(bookingRef.get()).pipe(
					tap(() => console.log(`Fetching booking ${bookingId}...`)),
					retry({
						count: 3,
						delay: (error, retryCount) => {
							// Exponential backoff: 500ms, 1s, 2s
							const delayMs = Math.pow(2, retryCount - 1) * 500
							console.log(`Retry attempt ${retryCount} for booking fetch after ${delayMs}ms...`)
							return of(error).pipe(delay(delayMs))
						}
					}),
					catchError(error => {
						console.error('Failed to fetch booking after retries:', error)
						return of(null)
					})
				)

				const bookingDoc = await lastValueFrom(bookingDoc$)
				if (bookingDoc && bookingDoc.exists) {
					bookingData = bookingDoc.data() as Booking
					// If booking has payment intent, use it for checking status
					if (bookingData.paymentIntentId && !paymentIntentId) {
						paymentIntentId = bookingData.paymentIntentId
					}
				}
			} catch (error) {
				console.error('Error retrieving booking:', error)
				// Continue to check payment if paymentIntentId was provided
			}
		}

		// If paymentIntentId is provided, get payment status from Stripe with retry logic
		if (paymentIntentId) {
			try {
				const paymentIntent$ = from(stripe.paymentIntents.retrieve(paymentIntentId)).pipe(
					tap(() => console.log(`Retrieving payment intent ${paymentIntentId}...`)),
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
					map(paymentIntent => ({
						id: paymentIntent.id,
						status: paymentIntent.status,
						amount: paymentIntent.amount / 100, // Convert from cents
						currency: paymentIntent.currency,
						customerId: paymentIntent.customer,
						receiptEmail: paymentIntent.receipt_email,
						metadata: paymentIntent.metadata,
						_raw: paymentIntent // Keep raw for recovery
					})),
					catchError(error => {
						console.error('Failed to retrieve payment intent after retries:', error)
						return of({ error: 'Unable to retrieve payment status' })
					})
				)

				paymentStatus = await lastValueFrom(paymentIntent$)

				// If booking doesn't exist but payment is successful, create a booking recovery record
				if (paymentStatus._raw && paymentStatus._raw.status === 'succeeded' && (!bookingData || bookingData.paymentStatus !== 'paid')) {
					const recoveryId = await handlePaymentBookingRecovery(paymentStatus._raw, bookingId)
					if (recoveryId) {
						attempts = 1 // Signal that recovery was attempted
					}
				}
			} catch (error) {
				console.error('Error retrieving payment intent:', error)
				// Don't fail the request, just note that payment status couldn't be retrieved
				paymentStatus = { error: 'Unable to retrieve payment status' }
			}
		}

		return {
			statusCode: 200,
			headers: corsHeaders,
			body: JSON.stringify({
				booking: bookingData || null,
				payment: paymentStatus || null,
				recoveryAttempted: attempts > 0,
			}),
		}
	} catch (error) {
		console.error('Error in payment status endpoint:', error)

		return {
			statusCode: 500,
			headers: corsHeaders,
			body: JSON.stringify({ error: 'Internal server error checking payment status' }),
		}
	}
}

/**
 * Handle recovery for successful payments with missing or incomplete bookings
 */
async function handlePaymentBookingRecovery(paymentIntent: any, existingBookingId?: string): Promise<string | null> {
	try {
		// Extract booking information from payment intent metadata
		const { bookingId, courtId, date, userId, venueId } = paymentIntent.metadata || {}

		// Use existing booking ID, metadata booking ID, or generate a new one
		const targetBookingId = existingBookingId || bookingId || `recovery-${Date.now()}`

		// Check if booking exists
		const bookingRef = db.collection('bookings').doc(targetBookingId)
		const bookingDoc = await bookingRef.get()

		if (bookingDoc.exists) {
			// Update existing booking to paid if not already
			const bookingData = bookingDoc.data() as Booking
			if (bookingData.paymentStatus !== 'paid') {
				const updateBooking$ = from(bookingRef.update({
					paymentStatus: 'paid',
					status: 'confirmed',
					paymentIntentId: paymentIntent.id,
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				})).pipe(
					tap(() => console.log(`Updating booking ${targetBookingId} to paid status...`)),
					retry({
						count: 3,
						delay: (error, retryCount) => {
							const delayMs = Math.pow(2, retryCount - 1) * 500
							console.log(`Retry attempt ${retryCount} for booking update after ${delayMs}ms...`)
							return of(error).pipe(delay(delayMs))
						}
					}),
					catchError(error => {
						console.error('Failed to update booking after retries:', error)
						return throwError(() => error)
					})
				)

				await lastValueFrom(updateBooking$)
				console.log(`Recovery update: Updated existing booking ${targetBookingId} to confirmed status`)
			}
		} else {
			// Create a new booking record from payment data
			const customerEmail = paymentIntent.receipt_email || paymentIntent.customer_details?.email
			const customerName = paymentIntent.shipping?.name || paymentIntent.customer_details?.name || 'Recovered User'

			// Extract time information from metadata or use defaults
			const startTime = paymentIntent.metadata?.startTime || new Date().toISOString()
			const endTime =
				paymentIntent.metadata?.endTime || new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString() // Default to 1 hour
			const amount = paymentIntent.amount / 100 // Convert from cents

			// Create recovery booking record with all available data
			const recoveryBooking = {
				id: targetBookingId,
				courtId: courtId || 'unknown',
				date: date || new Date().toISOString().split('T')[0],
				startTime: startTime,
				endTime: endTime,
				userId: userId || 'recovered-user',
				userName: customerName,
				customerEmail: customerEmail,
				customerAddress: paymentIntent.shipping?.address || {},
				customerPhone: paymentIntent.customer_details?.phone || '',
				price: amount,
				paymentStatus: 'paid',
				status: 'confirmed',
				paymentIntentId: paymentIntent.id,
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				venueId: venueId || 'unknown', // Include venueId
				recoveredFromPayment: true, // Flag to indicate this was created from payment data
			}

			const createBooking$ = from(bookingRef.set(recoveryBooking)).pipe(
				tap(() => console.log(`Creating recovery booking ${targetBookingId}...`)),
				retry({
					count: 3,
					delay: (error, retryCount) => {
						const delayMs = Math.pow(2, retryCount - 1) * 500
						console.log(`Retry attempt ${retryCount} for booking creation after ${delayMs}ms...`)
						return of(error).pipe(delay(delayMs))
					}
				}),
				catchError(error => {
					console.error('Failed to create recovery booking after retries:', error)
					return throwError(() => error)
				})
			)

			await lastValueFrom(createBooking$)
			console.log(`Recovery creation: Created booking record for ${targetBookingId}`)

			// Log this recovery for auditing with retry
			const logRecovery$ = from(db.collection('bookingRecoveries').add({
				bookingId: targetBookingId,
				paymentIntentId: paymentIntent.id,
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
				recoverySource: 'payment_status_endpoint',
			})).pipe(
				retry({
					count: 2,
					delay: 1000
				}),
				catchError(error => {
					console.error('Failed to log recovery audit:', error)
					return of(null) // Don't fail recovery if audit log fails
				})
			)

			await lastValueFrom(logRecovery$)
		}

		return targetBookingId
	} catch (error) {
		console.error('Error in payment booking recovery:', error)
		return null
	}
}

export { handler }
