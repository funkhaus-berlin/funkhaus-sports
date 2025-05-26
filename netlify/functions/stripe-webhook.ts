// netlify/functions/stripe-webhook.ts
import { Handler } from '@netlify/functions'
import admin from 'firebase-admin'
import type { Stripe } from 'stripe'
import { corsHeaders } from './_shared/cors'
import stripe from './_shared/stripe'
import { db } from './_shared/firebase-admin'



/**
 * Reserve time slots for a booking that's transitioning from holding to confirmed
 * 
 * @param booking The booking data
 * @param bookingId The booking ID
 */
async function reserveSlotsForBooking(booking: any, bookingId: string): Promise<void> {
	try {
		// Parse date to get month document ID
		const [year, month] = booking.date.split('-')
		const monthDocId = `${year}-${month}`
		
		// Create a transaction to ensure atomicity
		await db.runTransaction(async (transaction) => {
			// Get availability document
			const availabilityRef = db.collection('availability').doc(monthDocId)
			const availabilityDoc = await transaction.get(availabilityRef)

			if (!availabilityDoc.exists) {
				console.log(`No availability document for ${monthDocId}, skipping slot reservation`)
				return
			}

			const availabilityData = availabilityDoc.data()

			// Check if slots exist for this court and date
			if (!availabilityData?.courts?.[booking.courtId]?.[booking.date]?.slots) {
				console.log(`No slots data for court ${booking.courtId} on ${booking.date}, skipping slot reservation`)
				return
			}

			// Get the slots for this court and date
			const slots = availabilityData.courts[booking.courtId][booking.date].slots

			// Calculate time slots to reserve
			const startDate = new Date(booking.startTime)
			const endDate = new Date(booking.endTime)
			const startHour = startDate.getHours()
			const startMinute = startDate.getMinutes()
			const endHour = endDate.getHours()
			const endMinute = endDate.getMinutes()
			const adjustedEndHour = endMinute === 0 ? endHour : endHour + 1

			// Check if all slots are available (they should be for a holding booking)
			for (let hour = startHour; hour < adjustedEndHour; hour++) {
				// Check full hour slot
				const timeSlot = `${hour.toString().padStart(2, '0')}:00`

				if (slots[timeSlot] && !slots[timeSlot].isAvailable) {
					console.warn(`Time slot ${timeSlot} is already booked when trying to reserve for booking ${bookingId}`)
					// Don't throw error, just log warning - the payment is already successful
				}

				// Skip half-hour check for start/end hours if needed
				if ((hour === startHour && startMinute === 30) || (hour === endHour - 1 && endMinute === 0)) {
					continue
				}

				// Check half-hour slot
				const halfHourSlot = `${hour.toString().padStart(2, '0')}:30`
				if (slots[halfHourSlot] && !slots[halfHourSlot].isAvailable) {
					console.warn(`Time slot ${halfHourSlot} is already booked when trying to reserve for booking ${bookingId}`)
					// Don't throw error, just log warning - the payment is already successful
				}
			}

			// Mark slots as unavailable
			const updates: Record<string, any> = {}
			for (let hour = startHour; hour < adjustedEndHour; hour++) {
				// Update full hour slot
				const timeSlot = `${hour.toString().padStart(2, '0')}:00`
				const slotPath = `courts.${booking.courtId}.${booking.date}.slots.${timeSlot}`

				updates[`${slotPath}.isAvailable`] = false
				updates[`${slotPath}.bookedBy`] = booking.userId || null
				updates[`${slotPath}.bookingId`] = bookingId

				// Skip half-hour update for start/end hours if needed
				if ((hour === startHour && startMinute === 30) || (hour === endHour - 1 && endMinute === 0)) {
					continue
				}

				// Update half-hour slot
				const halfHourSlot = `${hour.toString().padStart(2, '0')}:30`
				const halfSlotPath = `courts.${booking.courtId}.${booking.date}.slots.${halfHourSlot}`

				updates[`${halfSlotPath}.isAvailable`] = false
				updates[`${halfSlotPath}.bookedBy`] = booking.userId || null
				updates[`${halfSlotPath}.bookingId`] = bookingId
			}

			// Update availability and timestamp
			updates.updatedAt = admin.firestore.FieldValue.serverTimestamp()
			transaction.update(availabilityRef, updates)

			console.log(`Reserved slots for booking ${bookingId}`)
		})
	} catch (error) {
		console.error('Error reserving slots for booking:', error)
		// Don't fail the payment confirmation - the payment is already successful
		// We'll log this for manual intervention if needed
		await db.collection('bookingSlotReservationErrors').add({
			bookingId,
			error: error.message || 'Unknown error',
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
			bookingData: booking
		})
	}
}

/**
 * Generate an invoice number for a booking
 * 
 * @param db Firestore instance
 * @param bookingId The booking ID
 * @param initialValue The initial counter value if not exists
 * @returns The generated invoice number
 */
async function generateInvoiceNumber(db: FirebaseFirestore.Firestore, bookingId: string, initialValue: number = 1000): Promise<string> {
	// First, check if this booking already has an invoice number
	const bookingRef = db.collection('bookings').doc(bookingId)
	const bookingDoc = await bookingRef.get()
	
	// If booking already has an invoice number, return it
	if (bookingDoc.exists && bookingDoc.data()?.invoiceNumber) {
		console.log(`Booking ${bookingId} already has invoice number: ${bookingDoc.data()?.invoiceNumber}`)
		return bookingDoc.data()?.invoiceNumber
	}
	
	// Otherwise, generate a new invoice number using a transaction
	const counterRef = db.collection('counters').doc('invoices')
	
	try {
		// Use a transaction to ensure atomicity
		const invoiceNumber = await db.runTransaction(async (transaction) => {
			const counterDoc = await transaction.get(counterRef)
			
			// If counter doesn't exist, initialize it
			if (!counterDoc.exists) {
				transaction.set(counterRef, { 
					value: initialValue,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				})
				return initialValue
			}
			
			// Otherwise, increment the counter
			const currentValue = counterDoc.data()?.value || 0
			const nextValue = currentValue + 1
			
			transaction.update(counterRef, { 
				value: nextValue,
				updatedAt: new Date().toISOString()
			})
			
			return nextValue
		})
		
		// Format the invoice number
		const formattedInvoiceNumber = `${invoiceNumber.toString().padStart(6, '0')}`;
		
		// Update the booking with the new invoice number
		await bookingRef.update({
			invoiceNumber: formattedInvoiceNumber,
			invoiceSequence: invoiceNumber
		})
		
		console.log(`Generated invoice number ${formattedInvoiceNumber} for booking ${bookingId}`)
		return formattedInvoiceNumber
	} catch (error) {
		console.error('Error generating invoice number:', error)
		// Fallback to a simple invoice number based on timestamp (without prefix)
		const fallbackNumber = `${Date.now().toString().substring(3)}`
		await bookingRef.update({ invoiceNumber: fallbackNumber })
		return fallbackNumber
	}
}

/**
 * Enhanced webhook handler with improved reliability and error recovery
 */
/**
 * Cleanup abandoned temporary bookings that are older than a certain time threshold
 * This helps prevent court slots from being blocked by incomplete bookings
 */
async function cleanupAbandonedBookings() {
	try {
		// Calculate cutoff time (5 minutes ago)
		const cutoffTime = new Date()
		cutoffTime.setMinutes(cutoffTime.getMinutes() - 5)
		const cutoffTimeString = cutoffTime.toISOString()
		
		// Query for abandoned holding bookings based on lastActive
		const bookingsRef = db.collection('bookings')
		const query = bookingsRef
			.where('status', '==', 'holding')
			.where('lastActive', '<', cutoffTimeString)
			.where('paymentStatus', '==', 'pending')
			.limit(50) // Process in batches
			
		const snapshot = await query.get()
		console.log(`Found ${snapshot.size} abandoned holding bookings to clean up`)
		
		if (snapshot.empty) {
			return
		}
		
		// Mark bookings as cancelled
		const batch = db.batch()
		
		snapshot.forEach(doc => {
			const bookingRef = bookingsRef.doc(doc.id)
			batch.update(bookingRef, {
				status: 'cancelled',
				paymentStatus: 'cancelled',
				updatedAt: new Date().toISOString(),
				cancellationReason: 'auto_cleanup_abandoned_booking'
			})
			console.log(`Marking abandoned booking ${doc.id} as cancelled`)
		})
		
		await batch.commit()
		console.log(`Successfully cancelled ${snapshot.size} abandoned bookings`)
	} catch (error) {
		console.error('Error cleaning up abandoned bookings:', error)
	}
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
	
	// Run cleanup for abandoned bookings (non-blocking)
	cleanupAbandonedBookings().catch(error => 
		console.error('Background cleanup task failed:', error)
	)

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

		// Check if webhook secret is configured
		const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
		if (!webhookSecret) {
			// Log the error but don't expose in response
			console.error('STRIPE_WEBHOOK_SECRET is not configured in environment variables')
			await logWebhookError({
				message: 'Missing webhook secret configuration',
				stack: 'STRIPE_WEBHOOK_SECRET environment variable is not set',
			})

			return {
				statusCode: 500,
				headers: corsHeaders,
				body: JSON.stringify({ error: 'Internal server configuration error' }),
			}
		}

		// Verify and construct the event
		let stripeEvent: Stripe.Event

		try {
			stripeEvent = stripe.webhooks.constructEvent(event.body || '', signature, webhookSecret)
		} catch (err) {
			console.error('Webhook signature verification failed:', err.message)
			return {
				statusCode: 400,
				headers: corsHeaders,
				body: JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }),
			}
		}

		// Log the event to Firestore for auditing and recovery purposes
		await logWebhookEvent(stripeEvent)

		// Check if this event has already been processed (idempotency)
		const eventProcessed = await checkEventProcessed(stripeEvent.id)
		if (eventProcessed) {
			console.log(`Event ${stripeEvent.id} has already been processed. Skipping.`)
			return {
				statusCode: 200,
				headers: corsHeaders,
				body: JSON.stringify({ received: true, alreadyProcessed: true }),
			}
		}

		// Handle different event types
		let result
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
			default:
				result = `Unhandled event type: ${stripeEvent.type}`
				console.log(result)
		}

		// Mark event as processed in Firestore
		await markEventProcessed(stripeEvent.id, result)

		return {
			statusCode: 200,
			headers: corsHeaders,
			body: JSON.stringify({
				received: true,
				processed: true,
				result: result || 'Event type not specifically handled',
			}),
		}
	} catch (error) {
		console.error('Webhook error:', error)

		// Log error for debugging
		await logWebhookError(error)

		return {
			statusCode: 400,
			headers: corsHeaders,
			body: JSON.stringify({ error: error.message || 'Unknown webhook processing error' }),
		}
	}
}

/**
 * Log webhook event to Firestore for auditing and recovery
 */
async function logWebhookEvent(event: Stripe.Event): Promise<void> {
	try {
		await db
			.collection('webhookEvents')
			.doc(event.id)
			.set({
				id: event.id,
				type: event.type,
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
				data: JSON.parse(JSON.stringify(event.data.object)), // Convert to plain JSON
				processed: false,
				apiVersion: event.api_version,
			})
	} catch (error) {
		console.error('Error logging webhook event:', error)
		// Continue processing even if logging fails
	}
}

/**
 * Log webhook processing error
 */
async function logWebhookError(error: any): Promise<void> {
	try {
		await db.collection('webhookErrors').add({
			error: error.message || 'Unknown error',
			stack: error.stack || 'No stack trace available',
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
		})
	} catch (logError) {
		console.error('Error logging webhook error:', logError)
	}
}

/**
 * Check if an event has already been processed (idempotency)
 */
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

/**
 * Mark event as processed with result
 */
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

/**
 * Handle successful payment intent events with error recovery
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment succeeded:', paymentIntent.id)

	// Extract booking information from payment intent metadata
	const { bookingId, courtId, date, userId } = paymentIntent.metadata || {}

	if (!bookingId) {
		// If no bookingId in metadata, this is a payment without a booking
		// Log it for reconciliation purposes
		await logPaymentTransaction(paymentIntent, 'succeeded', 'No booking ID associated with payment')
		return { success: false, reason: 'no_booking_id' }
	}

	try {
		// Check if booking already exists
		const bookingRef = db.collection('bookings').doc(bookingId)
		const bookingDoc = await bookingRef.get()

		if (bookingDoc.exists) {
			const bookingData = bookingDoc.data()
			
			// Generate invoice number if one doesn't exist already (during payment confirmation)
			// This is the primary place where invoice numbers should be created
			let invoiceNumber: string | undefined = undefined
			if (!bookingData?.invoiceNumber) {
				invoiceNumber = await generateInvoiceNumber(db, bookingId)
				console.log(`Generated invoice number ${invoiceNumber} for booking ${bookingId} during payment confirmation`)
			} else {
				invoiceNumber = bookingData?.invoiceNumber
				console.log(`Using existing invoice number ${invoiceNumber} for booking ${bookingId}`)
			}

			// If booking is in holding status, we need to reserve slots
			if (bookingData?.status === 'holding') {
				console.log(`Booking ${bookingId} is in holding status, will reserve slots`)
				
				// Reserve slots for the booking
				await reserveSlotsForBooking(bookingData, bookingId)
			}

			// Booking exists, update its payment status (and include invoice number if just generated)
			const updateData: any = {
				paymentStatus: 'paid',
				status: 'confirmed',
				paymentIntentId: paymentIntent.id,
				updatedAt: new Date().toISOString(),
			}

			// Only include invoiceNumber field if we just generated one
			if (invoiceNumber && !bookingData?.invoiceNumber) {
				updateData.invoiceNumber = invoiceNumber
			}

			await bookingRef.update(updateData)

			console.log(`Updated existing booking ${bookingId} to confirmed status`)

			// Now fetch the complete booking data to prepare for email
			const updatedBookingDoc = await bookingRef.get()
			const updatedBookingData = updatedBookingDoc.data() as any

			// Only send email if it hasn't been sent already
			if (!updatedBookingData.emailSent) {
				// Fetch related court and venue data needed for the email
				let courtData: any | null = null
				let venueData: any | null = null

				if (updatedBookingData.courtId) {
					const courtDoc = await db.collection('courts').doc(updatedBookingData.courtId).get()
					if (courtDoc.exists) {
						courtData = courtDoc.data()

						// If we have court data, also fetch venue data
						if (courtData.venueId) {
							const venueDoc = await db.collection('venues').doc(courtData.venueId).get()
							if (venueDoc.exists) {
								venueData = venueDoc.data()
							}
						}
					}
				}

				// Prepare email data
				const emailData = prepareEmailData(updatedBookingData, courtData, venueData, paymentIntent)

				// Call the email sending function
				try {
					// Import the email sending function
					const { handler: emailHandler } = require('./send-booking-email')

					// Create a mock event to pass to the email sending function
					const mockEvent = {
						body: JSON.stringify(emailData),
						httpMethod: 'POST',
						headers: {},
					}

					// Send the email
					const emailResponse = await emailHandler(mockEvent, {})
					const emailResult = JSON.parse(emailResponse.body)

					if (emailResult.success) {
						console.log(`Sent confirmation email for booking ${bookingId}`)

						// Mark email as sent in booking record
						await bookingRef.update({
							emailSent: true,
							emailSentAt: new Date().toISOString(),
						})
					} else {
						console.error(`Failed to send confirmation email for booking ${bookingId}:`, emailResult.error)
					}
				} catch (emailError) {
					console.error(`Error sending confirmation email for booking ${bookingId}:`, emailError)
				}
			}

			return { success: true, action: 'updated_booking' }
		} else {
			// Booking doesn't exist yet - create it from payment metadata
			// This handles cases where the client disconnected before creating the booking
			const customerEmail = paymentIntent.receipt_email
			const customerName = paymentIntent.shipping?.name || 'Guest User'

			// Extract time information from metadata
			const startTime = paymentIntent.metadata?.startTime
			const endTime = paymentIntent.metadata?.endTime
			const amount = paymentIntent.amount / 100 // Convert from cents

			// Create a unique invoice number for this emergency booking
			const invoiceNumber = await generateInvoiceNumber(db, bookingId)
			console.log(`Generated invoice number ${invoiceNumber} for emergency booking ${bookingId}`)

			// Create an emergency booking record with invoice number
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
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				recoveredFromPayment: true, // Flag to indicate this was created from payment data
				invoiceNumber: invoiceNumber // Add invoice number to emergency booking
			}

			await bookingRef.set(newBooking)

			console.log(`Created emergency booking record for ${bookingId} with invoice number ${invoiceNumber}`)
			await logPaymentTransaction(
				paymentIntent,
				'succeeded',
				'Created emergency booking record as original was missing',
			)

			// We'll attempt to send an email even for emergency bookings
			try {
				// Prepare minimal email data
				const emailData = {
					bookingId: bookingId,
					customerEmail: customerEmail,
					customerName: customerName,
					bookingDetails: {
						date: date || new Date().toISOString().split('T')[0],
						startTime: startTime ? new Date(startTime).toLocaleTimeString() : 'N/A',
						endTime: endTime ? new Date(endTime).toLocaleTimeString() : 'N/A',
						court: courtId || 'Unknown Court',
						price: amount.toFixed(2),
						vatInfo: {
							netAmount: (amount / 1.07).toFixed(2),
							vatAmount: (amount - amount / 1.07).toFixed(2),
							vatRate: '7%',
						},
					},
					paymentInfo: {
						paymentStatus: 'paid',
						paymentIntentId: paymentIntent.id,
					},
					invoiceNumber: invoiceNumber // Include invoice number in email data
				}

				// Import the email sending function
				const { handler: emailHandler } = require('./send-booking-email')

				// Create a mock event to pass to the email sending function
				const mockEvent = {
					body: JSON.stringify(emailData),
					httpMethod: 'POST',
					headers: {},
				}

				// Send the email
				const emailResponse = await emailHandler(mockEvent, {})
				const emailResult = JSON.parse(emailResponse.body)

				if (emailResult.success) {
					console.log(`Sent confirmation email for emergency booking ${bookingId}`)

					// Mark email as sent in booking record
					await bookingRef.update({
						emailSent: true,
						emailSentAt: new Date().toISOString(),
					})
				}
			} catch (emailError) {
				console.error(`Error sending confirmation email for emergency booking ${bookingId}:`, emailError)
			}

			return { success: true, action: 'created_emergency_booking' }
		}
	} catch (error) {
		console.error('Error handling payment success webhook:', error)
		await logPaymentTransaction(paymentIntent, 'error', `Error updating booking: ${error.message}`)

		// Retry on next webhook or manual intervention
		return { success: false, error: error.message }
	}
}
/**
 * Helper function to prepare email data
 */
function prepareEmailData(booking, court, venue, paymentIntent) {
	// Calculate VAT amounts (assuming 7% VAT)
	const vatRate = 0.07
	const netAmount = booking.price / (1 + vatRate)
	const vatAmount = booking.price - netAmount

	// Format dates and times for human-readable display
	const bookingDate = new Date(booking.date).toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	})

	const startTime = booking.startTime
		? new Date(booking.startTime).toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit',
		  })
		: 'N/A'

	const endTime = booking.endTime
		? new Date(booking.endTime).toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit',
		  })
		: 'N/A'

	// Machine-readable formats for ICS calendar
	const rawDate = booking.date ? new Date(booking.date).toISOString().split('T')[0] : null
	
	const startDateTime = booking.startTime ? new Date(booking.startTime) : null
	const endDateTime = booking.endTime ? new Date(booking.endTime) : null
	
	const rawStartTime = startDateTime ? 
		`${startDateTime.getHours().toString().padStart(2, '0')}:${startDateTime.getMinutes().toString().padStart(2, '0')}` : 
		null
	
	const rawEndTime = endDateTime ? 
		`${endDateTime.getHours().toString().padStart(2, '0')}:${endDateTime.getMinutes().toString().padStart(2, '0')}` : 
		null

	return {
		bookingId: booking.id,
		customerEmail: booking.customerEmail || paymentIntent.receipt_email,
		customerName: booking.userName || paymentIntent.shipping?.name || 'Customer',
		customerPhone: booking.customerPhone || '',
		customerAddress: booking.customerAddress || paymentIntent.shipping?.address || {},
		bookingDetails: {
			date: bookingDate,
			startTime,
			endTime,
			court: court?.name || 'Court',
			courtType: court?.courtType || 'standard',
			venue: venue?.name || 'Funkhaus Sports',
			price: booking.price.toFixed(2),
			vatInfo: {
				netAmount: netAmount.toFixed(2),
				vatAmount: vatAmount.toFixed(2),
				vatRate: `${(vatRate * 100).toFixed(0)}%`,
			},
			// Machine-readable formats for ICS calendar
			rawDate: rawDate,
			rawStartTime: rawStartTime,
			rawEndTime: rawEndTime,
			isoStartDateTime: booking.startTime || null,
			isoEndDateTime: booking.endTime || null,
		},
		venueInfo: venue
			? {
					name: venue.name,
					address: venue.address,
					contactEmail: venue.contactEmail,
					contactPhone: venue.contactPhone,
					website: venue.website,
			  }
			: null,
		paymentInfo: {
			paymentStatus: booking.paymentStatus || 'paid',
			paymentIntentId: booking.paymentIntentId || paymentIntent.id,
		},
		// Include invoice number in the email data
		invoiceNumber: booking.invoiceNumber || null,
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
					updatedAt: new Date().toISOString(),
				})

				console.log(`Updated booking ${bookingId} to failed status`)
				return { success: true, action: 'updated_booking_to_failed' }
			}
		} catch (error) {
			console.error('Error handling payment failure webhook:', error)
			await logPaymentTransaction(paymentIntent, 'error', `Error updating failed payment booking: ${error.message}`)
			return { success: false, error: error.message }
		}
	}

	// Log the failed payment regardless
	await logPaymentTransaction(paymentIntent, 'failed', paymentIntent.last_payment_error?.message || 'Payment failed')
	return { success: true, action: 'logged_payment_failure' }
}

/**
 * Handle payment processing status
 */
async function handlePaymentIntentProcessing(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment processing:', paymentIntent.id)

	const { bookingId } = paymentIntent.metadata || {}

	if (bookingId) {
		try {
			const bookingRef = db.collection('bookings').doc(bookingId)
			const bookingDoc = await bookingRef.get()

			if (bookingDoc.exists) {
				// Only update if the status isn't already set to a later state (paid or failed)
				const currentStatus = bookingDoc.data()?.paymentStatus
				if (currentStatus === 'pending' || !currentStatus) {
					await bookingRef.update({
						paymentStatus: 'processing',
						updatedAt: new Date().toISOString(),
					})

					console.log(`Updated booking ${bookingId} to processing status`)
				}
			}

			return { success: true, action: 'updated_to_processing' }
		} catch (error) {
			console.error('Error handling payment processing webhook:', error)
			await logPaymentTransaction(paymentIntent, 'error', `Error updating processing status: ${error.message}`)
			return { success: false, error: error.message }
		}
	}

	await logPaymentTransaction(paymentIntent, 'processing', 'Payment is being processed')
	return { success: true, action: 'logged_processing_status' }
}

/**
 * Handle canceled payment intents
 */
async function handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment canceled:', paymentIntent.id)

	const { bookingId } = paymentIntent.metadata || {}

	if (bookingId) {
		try {
			// Update booking status
			const bookingRef = db.collection('bookings').doc(bookingId)
			const bookingDoc = await bookingRef.get()

			if (bookingDoc.exists) {
				await bookingRef.update({
					paymentStatus: 'cancelled',
					status: 'cancelled',
					updatedAt: new Date().toISOString(),
				})

				console.log(`Updated booking ${bookingId} to cancelled status`)
			}

			return { success: true, action: 'updated_to_cancelled' }
		} catch (error) {
			console.error('Error handling payment cancellation webhook:', error)
			await logPaymentTransaction(paymentIntent, 'error', `Error updating cancelled status: ${error.message}`)
			return { success: false, error: error.message }
		}
	}

	await logPaymentTransaction(paymentIntent, 'cancelled', 'Payment was cancelled')
	return { success: true, action: 'logged_cancellation' }
}

/**
 * Log payment transactions for audit and reconciliation
 */
async function logPaymentTransaction(
	paymentIntent: Stripe.PaymentIntent,
	status: 'succeeded' | 'failed' | 'processing' | 'cancelled' | 'error',
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
