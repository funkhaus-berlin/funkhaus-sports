// // netlify/functions/check-email-status.ts
// import { Handler } from '@netlify/functions'
// import admin from 'firebase-admin'
// import { corsHeaders } from './_shared/cors'
// import { Booking, CheckEmailStatusRequest, CheckEmailStatusResponse } from './types/shared-types'

// // Initialize Firebase Admin if not already initialized
// if (!admin.apps.length) {
// 	admin.initializeApp({
// 		credential: admin.credential.cert({
// 			projectId: process.env.FIREBASE_PROJECT_ID,
// 			clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
// 			privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
// 		}),
// 	})
// }

// const db = admin.firestore()

// /**
//  * Function to check if an email was sent for a booking
//  * Used by the frontend to display the correct status
//  */
// const handler: Handler = async (event, context) => {
// 	// Handle preflight request for CORS
// 	if (event.httpMethod === 'OPTIONS') {
// 		return {
// 			statusCode: 200,
// 			headers: corsHeaders,
// 			body: '',
// 		}
// 	}

// 	// Allow both GET and POST requests for flexibility
// 	if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
// 		const response: CheckEmailStatusResponse = {
// 			success: false,
// 			emailSent: false,
// 			error: 'Method Not Allowed'
// 		}
		
// 		return {
// 			statusCode: 405,
// 			headers: corsHeaders,
// 			body: JSON.stringify(response),
// 		}
// 	}

// 	// Get booking ID (either from query parameters or request body)
// 	let bookingId: string | undefined;
	
// 	if (event.httpMethod === 'GET') {
// 		bookingId = event.queryStringParameters?.bookingId;
// 	} else {
// 		// For POST requests, parse the body
// 		try {
// 			const data = JSON.parse(event.body || '{}') as CheckEmailStatusRequest;
// 			bookingId = data.bookingId;
// 		} catch (error) {
// 			console.error('Error parsing request body:', error);
// 		}
// 	}

// 	if (!bookingId) {
// 		const response: CheckEmailStatusResponse = {
// 			success: false,
// 			emailSent: false,
// 			error: 'Missing bookingId parameter'
// 		}
		
// 		return {
// 			statusCode: 400,
// 			headers: corsHeaders,
// 			body: JSON.stringify(response),
// 		}
// 	}

// 	try {
// 		// Get booking from Firestore
// 		const bookingRef = db.collection('bookings').doc(bookingId)
// 		const bookingDoc = await bookingRef.get()

// 		if (!bookingDoc.exists) {
// 			const response: CheckEmailStatusResponse = {
// 				success: false,
// 				emailSent: false,
// 				error: 'Booking not found'
// 			}
			
// 			return {
// 				statusCode: 404,
// 				headers: corsHeaders,
// 				body: JSON.stringify(response),
// 			}
// 		}

// 		const bookingData: Booking = bookingDoc.data() as Booking

// 		// Return email status
// 		const response: CheckEmailStatusResponse = {
// 			success: true,
// 			emailSent: !!bookingData.emailSent,
// 			emailSentAt: bookingData.emailSentAt ? bookingData.emailSentAt.toDate().toISOString() : undefined
// 		}
		
// 		return {
// 			statusCode: 200,
// 			headers: corsHeaders,
// 			body: JSON.stringify(response),
// 		}
// 	} catch (error: any) {
// 		console.error('Error checking email status:', error)

// 		const response: CheckEmailStatusResponse = {
// 			success: false,
// 			emailSent: false,
// 			error: `Error checking email status: ${error.message || 'Unknown error'}`
// 		}
		
// 		return {
// 			statusCode: 500,
// 			headers: corsHeaders,
// 			body: JSON.stringify(response),
// 		}
// 	}
// }

// export { handler }
