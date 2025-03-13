// netlify/functions/stripe-webhook.ts
import { Handler } from '@netlify/functions'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
	apiVersion: '2025-01-27.acacia',
})

const handler: Handler = async (event, _context) => {
	const signature = event.headers['stripe-signature']
	let stripeEvent

	try {
		// Verify webhook signature
		if (!signature || !event.body) {
			return {
				statusCode: 400,
				body: JSON.stringify({ error: 'Missing signature or request body' }),
			}
		}

		stripeEvent = stripe.webhooks.constructEvent(event.body, signature, process.env.STRIPE_WEBHOOK_SECRET as string)

		// Handle different event types
		switch (stripeEvent.type) {
			case 'payment_intent.succeeded':
				await handleSuccessfulPayment(stripeEvent.data.object)
				break

			case 'payment_intent.payment_failed':
				await handleFailedPayment(stripeEvent.data.object)
				break

			// Add more event handlers as needed
		}

		return {
			statusCode: 200,
			body: JSON.stringify({ received: true }),
		}
	} catch (error) {
		console.error(`Webhook error: ${error.message}`)
		return {
			statusCode: 400,
			body: JSON.stringify({ error: `Webhook Error: ${error.message}` }),
		}
	}
}

// Handler for successful payments
async function handleSuccessfulPayment(paymentIntent: Stripe.PaymentIntent) {
	const orderId = paymentIntent.id

	// Implement your logic here
	// For example, store in a database, create tickets, send confirmation emails, etc.
	console.log(`Payment succeeded for order ${orderId}`)

	// You could use another Netlify function to handle database operations
	// or directly integrate with your database here
}

// Handler for failed payments
async function handleFailedPayment(paymentIntent: Stripe.PaymentIntent) {
	const orderId = paymentIntent.id

	// Implement your failure handling logic
	console.log(`Payment failed for order ${orderId}: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`)
}

export { handler }
