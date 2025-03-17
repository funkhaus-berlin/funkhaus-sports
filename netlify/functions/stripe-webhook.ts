// netlify/functions/stripe-webhook-handler.ts
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

async function handler(request: Request, _context: any): Promise<Response> {
	// Handle preflight CORS requests
	if (request.method === 'OPTIONS') {
		return new Response('', { status: 200, headers: corsHeaders })
	}

	if (request.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: corsHeaders })
	}

	try {
		// Get the Stripe signature from headers
		const signature = request.headers.get('stripe-signature')
		if (!signature) {
			return new Response(JSON.stringify({ error: 'Missing Stripe signature' }), { status: 400, headers: corsHeaders })
		}

		// Get the raw request body as text (needed for Stripe signature verification)
		const rawBody = await request.text()

		// Verify and construct the Stripe event
		const stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET as string)

		// Log the event to Firestore for auditing and recovery purposes
		await logWebhookEvent(stripeEvent)

		// Check if this event has already been processed (idempotency)
		const eventProcessed = await checkEventProcessed(stripeEvent.id)
		if (eventProcessed) {
			console.log(`Event ${stripeEvent.id} has already been processed. Skipping.`)
			return new Response(JSON.stringify({ received: true, alreadyProcessed: true }), {
				status: 200,
				headers: corsHeaders,
			})
		}

		// Handle different event types
		let result: any
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

		return new Response(
			JSON.stringify({
				received: true,
				processed: true,
				result: result || 'Event type not specifically handled',
			}),
			{ status: 200, headers: corsHeaders },
		)
	} catch (error: any) {
		console.error('Webhook error:', error)
		// Log error for debugging
		await logWebhookError(error)
		return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })
	}
}

async function logWebhookEvent(event: Stripe.Event): Promise<void> {
	try {
		await db
			.collection('webhookEvents')
			.doc(event.id)
			.set({
				id: event.id,
				type: event.type,
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
				data: JSON.parse(JSON.stringify(event.data.object)),
				processed: false,
				apiVersion: event.api_version,
			})
	} catch (error) {
		console.error('Error logging webhook event:', error)
		// Continue processing even if logging fails
	}
}

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

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment succeeded:', paymentIntent.id)
	const { bookingId, courtId, date, userId } = paymentIntent.metadata || {}

	if (!bookingId) {
		await logPaymentTransaction(paymentIntent, 'succeeded', 'No booking ID associated with payment')
		return { success: false, reason: 'no_booking_id' }
	}

	try {
		const bookingRef = db.collection('bookings').doc(bookingId)
		const bookingDoc = await bookingRef.get()

		if (bookingDoc.exists) {
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
			const customerEmail = paymentIntent.receipt_email
			const customerName = paymentIntent.shipping?.name || 'Guest User'
			const startTime = paymentIntent.metadata?.startTime
			const endTime = paymentIntent.metadata?.endTime
			const amount = paymentIntent.amount / 100

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
				recoveredFromPayment: true,
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
	} catch (error: any) {
		console.error('Error handling payment success webhook:', error)
		await logPaymentTransaction(paymentIntent, 'error', `Error updating booking: ${error.message}`)
		return { success: false, error: error.message }
	}
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment failed:', paymentIntent.id)
	const { bookingId } = paymentIntent.metadata || {}

	if (bookingId) {
		try {
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
		} catch (error: any) {
			console.error('Error handling payment failure webhook:', error)
			await logPaymentTransaction(paymentIntent, 'error', `Error updating failed payment booking: ${error.message}`)
			return { success: false, error: error.message }
		}
	}
	await logPaymentTransaction(paymentIntent, 'failed', paymentIntent.last_payment_error?.message || 'Payment failed')
	return { success: true, action: 'logged_payment_failure' }
}

async function handlePaymentIntentProcessing(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment processing:', paymentIntent.id)
	const { bookingId } = paymentIntent.metadata || {}

	if (bookingId) {
		try {
			const bookingRef = db.collection('bookings').doc(bookingId)
			const bookingDoc = await bookingRef.get()

			if (bookingDoc.exists) {
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
		} catch (error: any) {
			console.error('Error handling payment processing webhook:', error)
			await logPaymentTransaction(paymentIntent, 'error', `Error updating processing status: ${error.message}`)
			return { success: false, error: error.message }
		}
	}
	await logPaymentTransaction(paymentIntent, 'processing', 'Payment is being processed')
	return { success: true, action: 'logged_processing_status' }
}

async function handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment canceled:', paymentIntent.id)
	const { bookingId } = paymentIntent.metadata || {}

	if (bookingId) {
		try {
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
		} catch (error: any) {
			console.error('Error handling payment cancellation webhook:', error)
			await logPaymentTransaction(paymentIntent, 'error', `Error updating cancelled status: ${error.message}`)
			return { success: false, error: error.message }
		}
	}
	await logPaymentTransaction(paymentIntent, 'cancelled', 'Payment was cancelled')
	return { success: true, action: 'logged_cancellation' }
}

async function logPaymentTransaction(
	paymentIntent: Stripe.PaymentIntent,
	status: 'succeeded' | 'failed' | 'processing' | 'cancelled' | 'error',
	notes: string,
) {
	try {
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
