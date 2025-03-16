import { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { corsHeaders } from './_shared/cors'
import stripe from './_shared/stripe'
import admin from 'firebase-admin'

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

		// Handle different event types
		switch (stripeEvent.type) {
			case 'payment_intent.succeeded':
				await handlePaymentIntentSucceeded(stripeEvent.data.object as Stripe.PaymentIntent)
				break
			case 'payment_intent.payment_failed':
				await handlePaymentIntentFailed(stripeEvent.data.object as Stripe.PaymentIntent)
				break
			// Add more event handlers as needed
		}

		return {
			statusCode: 200,
			headers: corsHeaders,
			body: JSON.stringify({ received: true }),
		}
	} catch (error) {
		console.error('Webhook error:', error)
		return {
			statusCode: 400,
			headers: corsHeaders,
			body: JSON.stringify({ error: error.message }),
		}
	}
}

/**
 * Handle successful payment intent events
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment succeeded:', paymentIntent.id)

	// Extract booking information from payment intent metadata
	const { bookingId, courtId, date, userId } = paymentIntent.metadata || {}

	if (!bookingId) {
		// If no bookingId in metadata, this is a payment without a booking
		// Log it for reconciliation purposes
		await logPaymentTransaction(paymentIntent, 'succeeded', 'No booking ID associated with payment')
		return
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
		} else {
			// Booking doesn't exist yet - likely payment succeeded before booking creation
			// Log this for manual reconciliation
			await logPaymentTransaction(paymentIntent, 'succeeded', 'Payment succeeded but no booking record exists')
		}
	} catch (error) {
		console.error('Error handling payment success webhook:', error)
		await logPaymentTransaction(paymentIntent, 'error', `Error updating booking: ${error.message}`)
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
			}
		} catch (error) {
			console.error('Error handling payment failure webhook:', error)
			await logPaymentTransaction(paymentIntent, 'error', `Error updating failed payment booking: ${error.message}`)
		}
	}

	// Log the failed payment regardless
	await logPaymentTransaction(paymentIntent, 'failed', paymentIntent.last_payment_error?.message || 'Payment failed')
}

/**
 * Log payment transactions for audit and reconciliation
 */
async function logPaymentTransaction(
	paymentIntent: Stripe.PaymentIntent,
	status: 'succeeded' | 'failed' | 'error',
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
