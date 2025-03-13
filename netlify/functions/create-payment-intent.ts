// netlify/functions/create-payment-intent.ts
import { Handler } from '@netlify/functions'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
	apiVersion: '2025-01-27.acacia', // Use a specific API version for consistency
})

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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
		const data = JSON.parse(event.body || '{}')
		const { amount, currency = 'usd', metadata = {} } = data

		// Validate the amount
		if (!amount || typeof amount !== 'number' || amount <= 0) {
			return {
				statusCode: 400,
				headers: corsHeaders,
				body: JSON.stringify({ error: 'Invalid amount' }),
			}
		}

		// Create a payment intent
		const paymentIntent = await stripe.paymentIntents.create({
			amount: Math.round(amount * 100), // Stripe uses cents - ensure integer
			currency: currency,
			automatic_payment_methods: { enabled: true },
			metadata: metadata,
		})

		// Return client secret to the frontend
		return {
			statusCode: 200,
			headers: corsHeaders,
			body: JSON.stringify({
				clientSecret: paymentIntent.client_secret,
				orderId: paymentIntent.id,
			}),
		}
	} catch (error) {
		console.error('Error creating payment intent:', error)
		return {
			statusCode: 500,
			headers: corsHeaders,
			body: JSON.stringify({ error: error.message }),
		}
	}
}

export { handler }
