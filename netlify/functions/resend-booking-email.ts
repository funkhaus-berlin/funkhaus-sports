// netlify/functions/resend-booking-email.ts
import { Handler } from '@netlify/functions'
import admin from 'firebase-admin'
import { corsHeaders } from './_shared/cors'
import {
  BookingEmailRequest,
  BookingEmailResponse,
  Court
} from './types/shared-types'
import { db } from './_shared/firebase-admin'

/**
 * Function to manually resend a booking confirmation email
 * Supports both full email data request and simple bookingId-only request
 */
const handler: Handler = async (event) => {
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
		const body = JSON.parse(event.body || '{}')
		
		// Support both full BookingEmailRequest and simple bookingId-only request
		let data: BookingEmailRequest
		
		if (typeof body.bookingId === 'string' && !body.customerEmail) {
			// Simple retry request - fetch booking details from database
			const bookingDoc = await db.collection('bookings').doc(body.bookingId).get()
			
			if (!bookingDoc.exists) {
				return {
					statusCode: 404,
					headers: corsHeaders,
					body: JSON.stringify({ success: false, error: 'Booking not found' }),
				}
			}
			
			const booking = bookingDoc.data()
			
			// Fetch court and venue data
			let courtData: Court | null = null
			let venueData: { name: string; address?: string; city?: string; postalCode?: string; country?: string } | null = null
			
			if (booking?.courtId) {
				const courtDoc = await db.collection('courts').doc(booking.courtId).get()
				if (courtDoc.exists) {
					courtData = courtDoc.data() as Court
					
					if (courtData?.venueId) {
						const venueDoc = await db.collection('venues').doc(courtData.venueId).get()
						if (venueDoc.exists) {
							const data = venueDoc.data()
							if (data) {
								venueData = {
									name: data.name || 'Funkhaus Sports',
									address: data.address || '',
									city: data.city,
									postalCode: data.postalCode,
									country: data.country
								}
							}
						}
					}
				}
			}
			
			// Prepare email data
			
			data = {
				bookingId: body.bookingId,
				customerEmail: booking?.customerEmail || booking?.userEmail,
				customerName: booking?.userName || 'Customer',
				customerPhone: booking?.customerPhone || '',
				bookingDetails: {
					date: new Date(booking?.date).toLocaleDateString('en-US', {
						weekday: 'long',
						year: 'numeric',
						month: 'long',
						day: 'numeric',
					}),
					startTime: booking?.startTime,
					endTime: booking?.endTime,
					userTimezone: 'Europe/Berlin',
					court: courtData?.name || 'Court',
					venue: venueData?.name || 'Funkhaus Sports',
					price: booking?.price?.toFixed(2) || '0.00',
				},
				venueInfo: venueData ? {
					name: venueData.name,
					address: venueData.address || '',
				} : {
					name: 'Funkhaus Sports',
					address: 'Nalepastrasse 18, 12459 Berlin, Germany'
				},
				invoiceNumber: booking?.invoiceNumber,
			}
		} else {
			// Full request with all data provided
			data = body as BookingEmailRequest
		}

		// Validate required fields
		if (!data.bookingId || !data.customerEmail || !data.bookingDetails) {
			const response: BookingEmailResponse = {
				success: false,
				error: 'Missing required fields'
			}
			return {
				statusCode: 400,
				headers: corsHeaders,
				body: JSON.stringify(response),
			}
		}

		// Get booking reference
		const bookingRef = db.collection('bookings').doc(data.bookingId)

		// Import the email sending function to reuse its logic
		const { handler: emailHandler } = require('./send-booking-email')

		// Create a mock event to pass to the email sending function
		const mockEvent = {
			body: JSON.stringify(data),
			httpMethod: 'POST',
			headers: {},
		}

		// Send the email
		const emailResponse = await emailHandler(mockEvent, {})
		const emailResult = JSON.parse(emailResponse.body)

		if (emailResult.success) {
			// Update the booking record to indicate email was sent
			const updateData: any = {
				emailSent: true,
				emailSentAt: new Date().toISOString(),
				emailResent: true, // Flag to indicate this was a manual resend
			}
			
			// Clear any error fields
			updateData.emailError = admin.firestore.FieldValue.delete()
			updateData.emailFailedAt = admin.firestore.FieldValue.delete()
			updateData.emailPermanentlyFailed = admin.firestore.FieldValue.delete()
			
			await bookingRef.update(updateData)

			const response: BookingEmailResponse = {
				success: true,
				message: 'Email resent successfully'
			}

			return {
				statusCode: 200,
				headers: corsHeaders,
				body: JSON.stringify(response),
			}
		} else {
			// Update booking with error information
			const bookingDoc = await bookingRef.get()
			const retryCount = bookingDoc.data()?.emailRetryCount || 0
			
			await bookingRef.update({
				emailRetryCount: retryCount + 1,
				emailFailedAt: new Date().toISOString(),
				emailError: emailResult.error || 'Failed to send email',
				lastRetryAt: new Date().toISOString()
			})
			
			const response: BookingEmailResponse = {
				success: false,
				error: emailResult.error || 'Failed to resend email'
			}
			
			return {
				statusCode: 500,
				headers: corsHeaders,
				body: JSON.stringify(response),
			}
		}
	} catch (error: any) {
		console.error('Error resending booking email:', error)

		const response: BookingEmailResponse = {
			success: false,
			error: `Error resending email: ${error.message || 'Unknown error'}`
		}

		return {
			statusCode: 500,
			headers: corsHeaders,
			body: JSON.stringify(response),
		}
	}
}

export { handler }