// netlify/functions/create-payment-intent.ts
import { corsHeaders } from './_shared/cors'
import stripe from './_shared/stripe'

async function handler(request: Request): Promise<Response> {
	// Handle preflight CORS requests
	if (request.method === 'OPTIONS') {
		return new Response('', {
			status: 200,
			headers: corsHeaders,
		})
	}

	if (request.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
			status: 405,
			headers: corsHeaders,
		})
	}

	let data
	try {
		data = await request.json()
	} catch (e) {
		return new Response(JSON.stringify({ error: 'Invalid request body' }), {
			status: 400,
			headers: corsHeaders,
		})
	}

	const {
		amount,
		currency = 'eur',
		email,
		name,
		phone,
		address,
		postalCode,
		city,
		country,
		courtId,
		eventID,
		uid,
		bookingId,
		date,
		startTime,
		endTime,
	} = data

	if (!amount || typeof amount !== 'number' || amount <= 0) {
		return new Response(JSON.stringify({ error: 'Invalid amount' }), {
			status: 400,
			headers: corsHeaders,
		})
	}

	if (!email) {
		return new Response(JSON.stringify({ error: 'Email is required' }), {
			status: 400,
			headers: corsHeaders,
		})
	}

	// Prepare metadata for the booking
	const metadata: Record<string, string> = {
		userId: uid || 'anonymous',
		email: email || 'guest@example.com',
		product: eventID || 'court-booking',
	}

	if (bookingId) metadata.bookingId = bookingId
	if (courtId) metadata.courtId = courtId
	if (date) metadata.date = date
	if (startTime) metadata.startTime = typeof startTime === 'string' ? startTime : new Date(startTime).toISOString()
	if (endTime) metadata.endTime = typeof endTime === 'string' ? endTime : new Date(endTime).toISOString()

	const description = `Court Booking - ${courtId ? `Court ${courtId}` : 'Tennis Court'} - ${
		date || new Date().toISOString().split('T')[0]
	}`

	try {
		const paymentIntent = await stripe.paymentIntents.create({
			amount: Math.round(amount),
			currency: currency,
			automatic_payment_methods: { enabled: true },
			metadata: metadata,
			receipt_email: email,
			description: description,
			shipping: {
				name: name || 'Guest',
				phone: phone || '',
				address: {
					line1: address || '',
					postal_code: postalCode || '',
					city: city || '',
					country: country || '',
				},
			},
		})

		return new Response(
			JSON.stringify({
				clientSecret: paymentIntent.client_secret,
				orderId: paymentIntent.id,
				paymentIntentId: paymentIntent.id,
			}),
			{
				status: 200,
				headers: corsHeaders,
			},
		)
	} catch (stripeError: any) {
		console.error('Stripe error creating payment intent:', stripeError)

		const errorMessage = stripeError.message || 'Error creating payment intent'
		const errorCode = stripeError.code || 'unknown_error'

		return new Response(
			JSON.stringify({
				error: errorMessage,
				code: errorCode,
				type: stripeError.type,
			}),
			{
				status: 400,
				headers: corsHeaders,
			},
		)
	}
}

export { handler }
