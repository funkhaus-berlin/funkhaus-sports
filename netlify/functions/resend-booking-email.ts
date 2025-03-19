// netlify/functions/resend-booking-email.ts
import { Handler } from '@netlify/functions'
import { corsHeaders } from './_shared/cors'
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

/**
 * Function to manually resend a booking confirmation email
 * This is a fallback in case the automatic email wasn't sent
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

	// Only allow POST requests
	if (event.httpMethod !== 'POST') {
		return {
			statusCode: 405,
			headers: corsHeaders,
			body: JSON.stringify({ error: 'Method Not Allowed' }),
		}
	}

	try {
		// Parse the request body
		const data = JSON.parse(event.body || '{}')

		// Validate required fields
		if (!data.bookingId || !data.customerEmail || !data.bookingDetails) {
			return {
				statusCode: 400,
				headers: corsHeaders,
				body: JSON.stringify({ error: 'Missing required fields' }),
			}
		}

		// Check if booking exists
		const bookingRef = db.collection('bookings').doc(data.bookingId)
		const bookingDoc = await bookingRef.get()

		if (!bookingDoc.exists) {
			return {
				statusCode: 404,
				headers: corsHeaders,
				body: JSON.stringify({ error: 'Booking not found' }),
			}
		}

		// Import the email sending function to reuse its logic
		const { handler: emailHandler } = require('./send-booking-email')

		// Create a mock event to pass to the email sending function
		const mockEvent = {
			body: event.body,
			httpMethod: 'POST',
			headers: {},
		}

		// Send the email
		const emailResponse = await emailHandler(mockEvent, {})
		const emailResult = JSON.parse(emailResponse.body)

		if (emailResult.success) {
			// Update the booking record to indicate email was sent
			await bookingRef.update({
				emailSent: true,
				emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
				emailResent: true, // Flag to indicate this was a manual resend
			})

			return {
				statusCode: 200,
				headers: corsHeaders,
				body: JSON.stringify({
					success: true,
					message: 'Email resent successfully',
				}),
			}
		} else {
			return {
				statusCode: 500,
				headers: corsHeaders,
				body: JSON.stringify({
					success: false,
					error: emailResult.error || 'Failed to resend email',
				}),
			}
		}
	} catch (error) {
		console.error('Error resending booking email:', error)

		return {
			statusCode: 500,
			headers: corsHeaders,
			body: JSON.stringify({
				error: `Error resending email: ${error.message || 'Unknown error'}`,
			}),
		}
	}
}

export { handler }
