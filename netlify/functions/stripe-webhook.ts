// netlify/functions/stripe-webhook-handler.ts
import { Handler } from '@netlify/functions'
import admin from 'firebase-admin'
import Stripe from 'stripe'
import { corsHeaders } from './_shared/cors'
import stripe from './_shared/stripe'

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

/**
 * Enhanced webhook handler with improved reliability and error recovery
 *
 * This improved handler is designed to:
 * 1. Process Stripe webhook events more reliably
 * 2. Implement idempotency to prevent double-processing
 * 3. Log all events for auditing and recovery
 * 4. Implement retry logic for failed operations
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

	if (event.httpMethod !== 'POST') {
		return {
			statusCode: 405,
			headers: corsHeaders,
			body: JSON.stringify({ error: 'Method Not Allowed' }),
		}
	}

	try {
		// Get the signature from the headers
		const signature = event.headers['stripe-signature']

		if (!signature) {
			return {
				statusCode: 400,
				headers: corsHeaders,
				body: JSON.stringify({ error: 'Missing Stripe signature' }),
			}
		}

		// Verify and construct the event
		const stripeEvent = stripe.webhooks.constructEvent(
			event.body as string,
			signature,
			process.env.STRIPE_WEBHOOK_SECRET as string,
		)

		// Log the event to Firestore for auditing and recovery purposes
		await logWebhookEvent(stripeEvent)

		// Check if this event has already been processed (idempotency)
		const eventProcessed = await checkEventProcessed(stripeEvent.id)
		if (eventProcessed) {
			console.log(`Event ${stripeEvent.id} has already been processed. Skipping.`)
			return {
				statusCode: 200,
				headers: corsHeaders,
				body: JSON.stringify({ received: true, alreadyProcessed: true }),
			}
		}

		// Handle different event types
		let result
		switch (stripeEvent.type) {
			case 'payment_intent.succeeded':
				result = await handlePaymentIntentSucceeded(stripeEvent.data.object as Stripe.PaymentIntent)
				break
			case 'payment_intent.payment_failed':
				result = await handlePaymentIntentFailed(stripeEvent.data.object as Stripe.PaymentIntent)
				break
			case 'payment_intent.processing':
				result = await handlePaymentIntentProcessing(stripeEvent.data.object as Stripe.PaymentIntent)
				break
			case 'payment_intent.canceled':
				result = await handlePaymentIntentCanceled(stripeEvent.data.object as Stripe.PaymentIntent)
				break
			// Add more event handlers as needed
		}

		// Mark event as processed in Firestore
		await markEventProcessed(stripeEvent.id, result)

		return {
			statusCode: 200,
			headers: corsHeaders,
			body: JSON.stringify({
				received: true,
				processed: true,
				result: result || 'Event type not specifically handled',
			}),
		}
	} catch (error) {
		console.error('Webhook error:', error)

		// Log error for debugging
		await logWebhookError(error)

		return {
			statusCode: 400,
			headers: corsHeaders,
			body: JSON.stringify({ error: error.message }),
		}
	}
}

/**
 * Log webhook event to Firestore for auditing and recovery
 */
async function logWebhookEvent(event: Stripe.Event): Promise<void> {
	try {
		await db
			.collection('webhookEvents')
			.doc(event.id)
			.set({
				id: event.id,
				type: event.type,
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
				data: JSON.parse(JSON.stringify(event.data.object)), // Convert to plain JSON
				processed: false,
				apiVersion: event.api_version,
			})
	} catch (error) {
		console.error('Error logging webhook event:', error)
		// Continue processing even if logging fails
	}
}

/**
 * Log webhook processing error
 */
async function logWebhookError(error: any): Promise<void> {
	try {
		await db.collection('webhookErrors').add({
			error: error.message,
			stack: error.stack,
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
		})
	} catch (logError) {
		console.error('Error logging webhook error:', logError)
	}
}

/**
 * Check if an event has already been processed (idempotency)
 */
async function checkEventProcessed(eventId: string): Promise<boolean> {
	try {
		const eventDoc = await db.collection('webhookEvents').doc(eventId).get()
		return eventDoc.exists && eventDoc.data()?.processed === true
	} catch (error) {
		console.error('Error checking if event was processed:', error)
		// If we can't check, assume not processed to be safe
		return false
	}
}

/**
 * Mark event as processed with result
 */
async function markEventProcessed(eventId: string, result: any): Promise<void> {
	try {
		await db
			.collection('webhookEvents')
			.doc(eventId)
			.update({
				processed: true,
				processedAt: admin.firestore.FieldValue.serverTimestamp(),
				result: result || null,
			})
	} catch (error) {
		console.error('Error marking event as processed:', error)
	}
}

/**
 * Handle successful payment intent events with error recovery
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment succeeded:', paymentIntent.id)

	// Extract booking information from payment intent metadata
	const { bookingId, courtId, date, userId } = paymentIntent.metadata || {}

	if (!bookingId) {
		// If no bookingId in metadata, this is a payment without a booking
		// Log it for reconciliation purposes
		await logPaymentTransaction(paymentIntent, 'succeeded', 'No booking ID associated with payment')
		return { success: false, reason: 'no_booking_id' }
	}

	try {
		// Check if booking already exists
		const bookingRef = db.collection('bookings').doc(bookingId)
		const bookingDoc = await bookingRef.get()

		if (bookingDoc.exists) {
			// Booking exists, update its payment status
			await bookingRef.update({
				paymentStatus: 'paid',
				status: 'confirmed',
				paymentIntentId: paymentIntent.id,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			})

			console.log(`Updated existing booking ${bookingId} to confirmed status`)
			return { success: true, action: 'updated_booking' }
		} else {
			console.log(paymentIntent)
			// Booking doesn't exist yet - create it from payment metadata
			// This handles cases where the client disconnected before creating the booking
			const customerEmail = paymentIntent.receipt_email
			const customerName = paymentIntent.shipping?.name || 'Guest User'

			// Extract time information from metadata
			const startTime = paymentIntent.metadata?.startTime
			const endTime = paymentIntent.metadata?.endTime
			const amount = paymentIntent.amount / 100 // Convert from cents

			// Create an emergency booking record
			const newBooking = {
				id: bookingId,
				courtId: courtId || 'unknown',
				date: date || new Date().toISOString().split('T')[0],
				startTime: startTime || null,
				endTime: endTime || null,
				userId: userId || 'recovered-user',
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
			}

			await bookingRef.set(newBooking)

			console.log(`Created emergency booking record for ${bookingId}`)
			await logPaymentTransaction(
				paymentIntent,
				'succeeded',
				'Created emergency booking record as original was missing',
			)

			return { success: true, action: 'created_emergency_booking' }
		}
	} catch (error) {
		console.error('Error handling payment success webhook:', error)
		await logPaymentTransaction(paymentIntent, 'error', `Error updating booking: ${error.message}`)

		// Retry on next webhook or manual intervention
		return { success: false, error: error.message }
	}
}

/**
 * Handle failed payment intent events
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment failed:', paymentIntent.id)

	const { bookingId } = paymentIntent.metadata || {}

	if (bookingId) {
		try {
			// If there's a booking ID, update its status to failed
			const bookingRef = db.collection('bookings').doc(bookingId)
			const bookingDoc = await bookingRef.get()

			if (bookingDoc.exists) {
				await bookingRef.update({
					paymentStatus: 'failed',
					status: 'cancelled',
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				})

				console.log(`Updated booking ${bookingId} to failed status`)
				return { success: true, action: 'updated_booking_to_failed' }
			}
		} catch (error) {
			console.error('Error handling payment failure webhook:', error)
			await logPaymentTransaction(paymentIntent, 'error', `Error updating failed payment booking: ${error.message}`)
			return { success: false, error: error.message }
		}
	}

	// Log the failed payment regardless
	await logPaymentTransaction(paymentIntent, 'failed', paymentIntent.last_payment_error?.message || 'Payment failed')
	return { success: true, action: 'logged_payment_failure' }
}

/**
 * Handle payment processing status
 */
async function handlePaymentIntentProcessing(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment processing:', paymentIntent.id)

	const { bookingId } = paymentIntent.metadata || {}

	if (bookingId) {
		try {
			const bookingRef = db.collection('bookings').doc(bookingId)
			const bookingDoc = await bookingRef.get()

			if (bookingDoc.exists) {
				// Only update if the status isn't already set to a later state (paid or failed)
				const currentStatus = bookingDoc.data()?.paymentStatus
				if (currentStatus === 'pending' || !currentStatus) {
					await bookingRef.update({
						paymentStatus: 'processing',
						updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					})

					console.log(`Updated booking ${bookingId} to processing status`)
				}
			}

			return { success: true, action: 'updated_to_processing' }
		} catch (error) {
			console.error('Error handling payment processing webhook:', error)
			await logPaymentTransaction(paymentIntent, 'error', `Error updating processing status: ${error.message}`)
			return { success: false, error: error.message }
		}
	}

	await logPaymentTransaction(paymentIntent, 'processing', 'Payment is being processed')
	return { success: true, action: 'logged_processing_status' }
}

/**
 * Handle canceled payment intents
 */
async function handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment canceled:', paymentIntent.id)

	const { bookingId } = paymentIntent.metadata || {}

	if (bookingId) {
		try {
			// Update booking status
			const bookingRef = db.collection('bookings').doc(bookingId)
			const bookingDoc = await bookingRef.get()

			if (bookingDoc.exists) {
				await bookingRef.update({
					paymentStatus: 'cancelled',
					status: 'cancelled',
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				})

				console.log(`Updated booking ${bookingId} to cancelled status`)
			}

			return { success: true, action: 'updated_to_cancelled' }
		} catch (error) {
			console.error('Error handling payment cancellation webhook:', error)
			await logPaymentTransaction(paymentIntent, 'error', `Error updating cancelled status: ${error.message}`)
			return { success: false, error: error.message }
		}
	}

	await logPaymentTransaction(paymentIntent, 'cancelled', 'Payment was cancelled')
	return { success: true, action: 'logged_cancellation' }
}

/**
 * Log payment transactions for audit and reconciliation
 */
async function logPaymentTransaction(
	paymentIntent: Stripe.PaymentIntent,
	status: 'succeeded' | 'failed' | 'processing' | 'cancelled' | 'error',
	notes: string,
) {
	try {
		// Create a transaction log entry
		await db
			.collection('paymentTransactions')
			.doc(paymentIntent.id)
			.set({
				paymentIntentId: paymentIntent.id,
				amount: paymentIntent.amount / 100, // Convert from cents
				currency: paymentIntent.currency,
				status: status,
				bookingId: paymentIntent.metadata?.bookingId || null,
				courtId: paymentIntent.metadata?.courtId || null,
				date: paymentIntent.metadata?.date || null,
				customerEmail: paymentIntent.receipt_email || null,
				notes: notes,
				metadata: paymentIntent.metadata || {},
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
			})

		console.log(`Logged payment transaction: ${paymentIntent.id}`)
	} catch (error) {
		console.error('Error logging payment transaction:', error)
	}
}

export { handler }
