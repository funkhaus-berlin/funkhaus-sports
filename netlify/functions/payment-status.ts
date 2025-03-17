// netlify/functions/payment-status.ts
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

async function handler(request: Request): Promise<Response> {
	// Handle preflight request for CORS
	if (request.method === 'OPTIONS') {
		return new Response('', { status: 200, headers: corsHeaders })
	}

	// Only allow GET requests
	if (request.method !== 'GET') {
		return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: corsHeaders })
	}

	try {
		const url = new URL(request.url)
		let paymentIntentId = url.searchParams.get('paymentIntentId')
		const bookingId = url.searchParams.get('bookingId')

		// Check for required parameters
		if (!paymentIntentId && !bookingId) {
			return new Response(JSON.stringify({ error: 'Either paymentIntentId or bookingId must be provided' }), {
				status: 400,
				headers: corsHeaders,
			})
		}

		let paymentStatus: any = null
		let bookingData: Booking | null = null
		let attempts = 0

		// If bookingId is provided, retrieve booking data from Firestore
		if (bookingId) {
			try {
				const bookingRef = db.collection('bookings').doc(bookingId)
				const bookingDoc = await bookingRef.get()
				if (bookingDoc.exists) {
					bookingData = bookingDoc.data() as Booking
					// Use booking's payment intent if available and not already provided
					if (bookingData.paymentIntentId && !paymentIntentId) {
						paymentIntentId = bookingData.paymentIntentId
					}
				}
			} catch (error) {
				console.error('Error retrieving booking:', error)
				// Continue processing if booking retrieval fails
			}
		}

		// If paymentIntentId is provided, get payment status from Stripe
		if (paymentIntentId) {
			try {
				const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
				paymentStatus = {
					id: paymentIntent.id,
					status: paymentIntent.status,
					amount: paymentIntent.amount / 100, // Convert from cents
					currency: paymentIntent.currency,
					customerId: paymentIntent.customer,
					receiptEmail: paymentIntent.receipt_email,
					metadata: paymentIntent.metadata,
				}

				// If payment succeeded and there is no valid booking, trigger recovery
				if (paymentIntent.status === 'succeeded' && (!bookingData || bookingData.paymentStatus !== 'paid')) {
					const recoveryId = await handlePaymentBookingRecovery(paymentIntent, bookingId || undefined)
					if (recoveryId) {
						attempts = 1 // Indicate that recovery was attempted
					}
				}
			} catch (error) {
				console.error('Error retrieving payment intent:', error)
				// Do not fail the request—note that payment status couldn't be retrieved
				paymentStatus = { error: 'Unable to retrieve payment status' }
			}
		}

		return new Response(
			JSON.stringify({
				booking: bookingData || null,
				payment: paymentStatus || null,
				recoveryAttempted: attempts > 0,
			}),
			{ status: 200, headers: corsHeaders },
		)
	} catch (error: any) {
		console.error('Error in payment status endpoint:', error)
		return new Response(JSON.stringify({ error: 'Internal server error checking payment status' }), {
			status: 500,
			headers: corsHeaders,
		})
	}
}

/**
 * Handle recovery for successful payments with missing or incomplete bookings.
 * This function attempts to update an existing booking to "paid" or creates a new booking record.
 */
async function handlePaymentBookingRecovery(paymentIntent: any, existingBookingId?: string): Promise<string | null> {
	try {
		// Extract booking info from payment metadata
		const { bookingId, courtId, date, userId } = paymentIntent.metadata || {}
		// Determine target booking ID: use the existing one, metadata's value, or generate a new one
		const targetBookingId = existingBookingId || bookingId || `recovery-${Date.now()}`

		// Check if booking exists in Firestore
		const bookingRef = db.collection('bookings').doc(targetBookingId)
		const bookingDoc = await bookingRef.get()

		if (bookingDoc.exists) {
			// Update the existing booking if its payment status is not "paid"
			const bookingData = bookingDoc.data() as Booking
			if (bookingData.paymentStatus !== 'paid') {
				await bookingRef.update({
					paymentStatus: 'paid',
					status: 'confirmed',
					paymentIntentId: paymentIntent.id,
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				})
				console.log(`Recovery update: Updated existing booking ${targetBookingId} to confirmed status`)
			}
		} else {
			// Create a new booking record using payment data
			const customerEmail = paymentIntent.receipt_email || paymentIntent.customer_details?.email
			const customerName = paymentIntent.shipping?.name || paymentIntent.customer_details?.name || 'Recovered User'
			const startTime = paymentIntent.metadata?.startTime || new Date().toISOString()
			const endTime =
				paymentIntent.metadata?.endTime || new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString() // Default duration: 1 hour
			const amount = paymentIntent.amount / 100

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
				recoveredFromPayment: true, // Flag indicating recovery creation
			}

			await bookingRef.set(recoveryBooking)
			console.log(`Recovery creation: Created booking record for ${targetBookingId}`)

			// Log the recovery event for auditing purposes
			await db.collection('bookingRecoveries').add({
				bookingId: targetBookingId,
				paymentIntentId: paymentIntent.id,
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
				recoverySource: 'payment_status_endpoint',
			})
		}

		return targetBookingId
	} catch (error: any) {
		console.error('Error in payment booking recovery:', error)
		// Log the error for manual intervention
		await db.collection('recoveryErrors').add({
			paymentIntentId: paymentIntent.id,
			error: error.message,
			stack: error.stack,
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
		})
		return null
	}
}

export { handler }
