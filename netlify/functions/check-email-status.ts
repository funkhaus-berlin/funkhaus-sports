// netlify/functions/check-email-status.ts
import { Handler } from '@netlify/functions'
import admin from 'firebase-admin'
import { corsHeaders } from './_shared/cors'
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

/**
 * Function to check if an email was sent for a booking
 * Used by the frontend to display the correct status
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

	// Get booking ID from query parameters
	const bookingId = event.queryStringParameters?.bookingId

	if (!bookingId) {
		return {
			statusCode: 400,
			headers: corsHeaders,
			body: JSON.stringify({ error: 'Missing bookingId parameter' }),
		}
	}

	try {
		// Get booking from Firestore
		const bookingRef = db.collection('bookings').doc(bookingId)
		const bookingDoc = await bookingRef.get()

		if (!bookingDoc.exists) {
			return {
				statusCode: 404,
				headers: corsHeaders,
				body: JSON.stringify({ error: 'Booking not found' }),
			}
		}

		const bookingData: Booking = bookingDoc.data() as Booking

		// Return email status
		return {
			statusCode: 200,
			headers: corsHeaders,
			body: JSON.stringify({
				emailSent: !!bookingData.emailSent,
				emailSentAt: bookingData.emailSentAt ? bookingData.emailSentAt.toDate().toISOString() : null,
			}),
		}
	} catch (error) {
		console.error('Error checking email status:', error)

		return {
			statusCode: 500,
			headers: corsHeaders,
			body: JSON.stringify({
				error: `Error checking email status: ${error.message || 'Unknown error'}`,
			}),
		}
	}
}

export { handler }
