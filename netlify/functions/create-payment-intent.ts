// netlify/functions/create-payment-intent.ts
import { Handler } from '@netlify/functions'
import { corsHeaders } from './_shared/cors'
import stripe from './_shared/stripe'
import { from, of, throwError } from 'rxjs'
import { retry, delay, catchError, tap } from 'rxjs/operators'
import { lastValueFrom } from 'rxjs'

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
		// Parse and validate the request body
		let data
		try {
			data = JSON.parse(event.body || '{}')
		} catch (e) {
			return {
				statusCode: 400,
				headers: corsHeaders,
				body: JSON.stringify({ error: 'Invalid request body' }),
			}
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
			uid,
			bookingId,
			date,
			startTime,
			endTime,
		} = data

		console.log('Received data:', data)
		// Validate required fields
		if (!amount || typeof amount !== 'number' || amount <= 0) {
			return {
				statusCode: 400,
				headers: corsHeaders,
				body: JSON.stringify({ error: 'Invalid amount' }),
			}
		}

		if (!email) {
			return {
				statusCode: 400,
				headers: corsHeaders,
				body: JSON.stringify({ error: 'Email is required' }),
			}
		}

		// Prepare metadata for the booking - include all relevant fields
		const metadata: Record<string, string> = {
			userId: uid || 'anonymous',
			email: email!,
		}

		// Add booking details to metadata if available
		if (bookingId) metadata.bookingId = bookingId
		if (courtId) metadata.courtId = courtId
		if (date) metadata.date = date
		if (startTime) metadata.startTime = typeof startTime === 'string' ? startTime : new Date(startTime).toISOString()
		if (endTime) metadata.endTime = typeof endTime === 'string' ? endTime : new Date(endTime).toISOString()

		// Format description including booking details
		const description = `Court Booking - ${courtId ? `Court ${courtId}` : 'Tennis Court'} - ${
			date || new Date().toISOString().split('T')[0]
		}`

		try {
			// Create a payment intent with retry logic for transient failures
			const paymentIntent$ = from(
				stripe.paymentIntents.create({
					amount: Math.round(amount), // Ensure it's an integer
					currency: currency,
					automatic_payment_methods: { enabled: true },
					metadata: metadata,
					description: description,
					// Store customer info for the payment record
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
			).pipe(
				tap(() => console.log('Attempting to create payment intent...')),
				retry({
					count: 3, // Retry up to 3 times
					delay: (error, retryCount) => {
						// Check if error is retryable (network errors, rate limits, etc.)
						const isRetryable = 
							error.type === 'StripeConnectionError' ||
							error.type === 'StripeAPIError' ||
							error.code === 'rate_limit' ||
							error.statusCode >= 500
						
						if (!isRetryable) {
							// Don't retry non-retryable errors
							return throwError(() => error)
						}
						
						// Exponential backoff: 1s, 2s, 4s
						const delayMs = Math.pow(2, retryCount - 1) * 1000
						console.log(`Retry attempt ${retryCount} after ${delayMs}ms delay...`)
						return of(error).pipe(delay(delayMs))
					}
				}),
				catchError(error => {
					console.error('Failed to create payment intent after retries:', error)
					return throwError(() => error)
				})
			)

			// Wait for the observable to complete
			const paymentIntent = await lastValueFrom(paymentIntent$)

			// Return all necessary information to the client
			return {
				statusCode: 200,
				headers: corsHeaders,
				body: JSON.stringify({
					clientSecret: paymentIntent.client_secret,
					orderId: paymentIntent.id,
					paymentIntentId: paymentIntent.id,
				}),
			}
		} catch (stripeError) {
			// Handle Stripe-specific errors
			console.error('Stripe error creating payment intent:', stripeError)

			const errorMessage = stripeError.message || 'Error creating payment intent'
			const errorCode = stripeError.code || 'unknown_error'

			return {
				statusCode: 400,
				headers: corsHeaders,
				body: JSON.stringify({
					error: errorMessage,
					code: errorCode,
					type: stripeError.type,
				}),
			}
		}
	} catch (error) {
		// Handle generic errors
		console.error('Error creating payment intent:', error)

		return {
			statusCode: 500,
			headers: corsHeaders,
			body: JSON.stringify({
				error: 'Internal server error processing payment',
				details: error.message,
			}),
		}
	}
}

export { handler }
