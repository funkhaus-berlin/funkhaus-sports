// netlify/functions/stripe-webhook.ts
import { Handler } from '@netlify/functions'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import admin from 'firebase-admin'
import { resolve } from 'path'
import pug from 'pug'
import { defer, forkJoin, from, of, throwError } from 'rxjs'
import {
  catchError,
  delay,
  filter,
  map,
  mergeMap,
  retryWhen,
  switchMap,
  tap
} from 'rxjs/operators'
import type { Stripe } from 'stripe'
import { corsHeaders } from './_shared/cors'
import { db } from './_shared/firebase-admin'
import resend from './_shared/resend'
import stripe from './_shared/stripe'
import { handler as emailHandler } from './send-booking-email'

// Set up dayjs plugins
dayjs.extend(utc)
dayjs.extend(timezone)




/**
 * Generate an invoice number for a booking
 * 
 * @param db Firestore instance
 * @param bookingId The booking ID
 * @param initialValue The initial counter value if not exists
 * @returns The generated invoice number
 */
async function generateInvoiceNumber(db: FirebaseFirestore.Firestore, bookingId: string, initialValue: number = 1): Promise<string> {
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
		
		// Use simple number without padding
		const formattedInvoiceNumber = invoiceNumber.toString();
		
		// Only update the booking if it exists
		if (bookingDoc.exists) {
			try {
				await bookingRef.update({
					invoiceNumber: formattedInvoiceNumber,
					orderNumber: formattedInvoiceNumber,
					invoiceSequence: invoiceNumber
				})
				console.log(`Updated booking ${bookingId} with invoice number ${formattedInvoiceNumber}`)
			} catch (updateError) {
				console.error('Error updating booking with invoice number:', updateError)
			}
		} else {
			console.log(`Generated invoice number ${formattedInvoiceNumber} (booking ${bookingId} will be created with this number)`)
		}
		
		return formattedInvoiceNumber
	} catch (error) {
		console.error('Error generating invoice number:', error)
		// Fallback to a simple invoice number based on timestamp (without prefix)
		const fallbackNumber = `${Date.now().toString().substring(3)}`
		// Don't try to update non-existent booking
		if (bookingDoc.exists) {
			try {
				await bookingRef.update({ 
					invoiceNumber: fallbackNumber,
					orderNumber: fallbackNumber
				})
			} catch (updateError) {
				console.error('Error updating booking with fallback invoice number:', updateError)
			}
		}
		return fallbackNumber
	}
}

/**
 * Enhanced webhook handler with improved reliability and error recovery
 */

const handler: Handler = async (event) => {
	console.log('=== Stripe Webhook Handler Called ===')
	console.log('Method:', event.httpMethod)
	console.log('Path:', event.path)
	console.log('Headers:', JSON.stringify(Object.keys(event.headers)))
	
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
		// Get the signature from the headers
		const signature = event.headers['stripe-signature']
		console.log('Stripe signature present:', !!signature)

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
		console.log('Webhook event received:', {
			id: stripeEvent.id,
			type: stripeEvent.type,
			created: stripeEvent.created,
			livemode: stripeEvent.livemode
		})
		
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
		console.log(`Processing event type: ${stripeEvent.type}`)
		let result: any
		switch (stripeEvent.type) {
			case 'payment_intent.succeeded':
				console.log('Calling handlePaymentIntentSucceededRx...')
				const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent
				console.log('Payment intent ID:', paymentIntent.id)
				console.log('Payment intent metadata:', paymentIntent.metadata)
				result = await handlePaymentIntentSucceededRx(paymentIntent)
				console.log('handlePaymentIntentSucceededRx result:', result)
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
			case 'charge.refunded':
				result = await handleChargeRefunded(stripeEvent.data.object as Stripe.Charge)
				break
			case 'charge.refund.updated':
				// Handle refund status updates
				result = await handleRefundUpdated(stripeEvent.data.object as Stripe.Refund)
				break
				
			case 'refund.created':
				// Handle new refund creation
				result = await handleRefundCreated(stripeEvent.data.object as Stripe.Refund)
				break
				
			case 'refund.failed':
				// Handle failed refunds
				result = await handleRefundFailed(stripeEvent.data.object as Stripe.Refund)
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
 * Retry configuration for critical operations
 */
const retryConfig = {
	maxRetries: 3,
	delayMs: 1000,
	backoffMultiplier: 2
}

/**
 * Custom retry operator with exponential backoff
 */
const retryWithBackoff = <T>(maxRetries = retryConfig.maxRetries, initialDelay = retryConfig.delayMs) =>
	retryWhen<T>(errors =>
		errors.pipe(
			mergeMap((error, index) => {
				if (index >= maxRetries) {
					return throwError(() => error)
				}
				const delayTime = initialDelay * Math.pow(retryConfig.backoffMultiplier, index)
				console.log(`Retry attempt ${index + 1} after ${delayTime}ms delay`)
				return of(error).pipe(delay(delayTime))
			})
		)
	)

/**
 * Handle successful payment intent events with error recovery (Refactored with RxJS)
 */
async function handlePaymentIntentSucceededRx(paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment succeeded:', paymentIntent.id)

	// Extract booking information from payment intent metadata
	const { bookingId, courtId, date, userId, venueId } = paymentIntent.metadata || {}

	// Early validation
	if (!bookingId) {
		await logPaymentTransaction(paymentIntent, 'succeeded', 'No booking ID associated with payment')
		return { success: false, reason: 'no_booking_id' }
	}

	// Main processing pipeline with retry for missing bookings
	return from(db.collection('bookings').doc(bookingId).get()).pipe(
		// Retry a few times if booking doesn't exist (it might still be writing)
		retryWithBackoff(3, 2000),
		// Process existing booking
		switchMap(bookingDoc => {
			if (bookingDoc.exists) {
				console.log(`Found booking ${bookingId}, processing payment confirmation`)
				return processExistingBooking(bookingDoc, paymentIntent, bookingId)
			} else {
				console.warn(`Booking ${bookingId} not found after retries, creating emergency booking`)
				return createEmergencyBooking(paymentIntent, bookingId, courtId, date, userId, venueId)
			}
		}),
		// Log success
		tap(result => console.log(`Payment processing completed for booking ${bookingId}:`, result)),
		// Error handling
		catchError(error => {
			console.error('Error handling payment success webhook:', error)
			// Special handling for missing booking document errors
			if (error.code === 5 || error.message?.includes('No document to update')) {
				console.error(`Booking ${bookingId} disappeared during processing, attempting recovery`)
				return createEmergencyBooking(paymentIntent, bookingId, courtId, date, userId, venueId).pipe(
					catchError(recoveryError => {
						console.error('Recovery also failed:', recoveryError)
						return from(logPaymentTransaction(paymentIntent, 'error', `Booking missing and recovery failed: ${error.message}`)).pipe(
							map(() => ({ success: false, error: error.message }))
						)
					})
				)
			}
			return from(logPaymentTransaction(paymentIntent, 'error', `Error updating booking: ${error.message}`)).pipe(
				map(() => ({ success: false, error: error.message }))
			)
		})
	).toPromise()
}

/**
 * Process an existing booking after successful payment
 */
function processExistingBooking(bookingDoc: any, paymentIntent: Stripe.PaymentIntent, bookingId: string) {
	const bookingData = bookingDoc.data()
	const bookingRef = db.collection('bookings').doc(bookingId)

	return defer(async () => {
		// Generate invoice number if needed
		let invoiceNumber = bookingData?.invoiceNumber
		if (!invoiceNumber) {
			invoiceNumber = await generateInvoiceNumber(db, bookingId)
			console.log(`Generated invoice number ${invoiceNumber} for booking ${bookingId}`)
		}
		return { bookingData, invoiceNumber }
	}).pipe(
		// Update booking status
		switchMap(({ bookingData, invoiceNumber }) => {
			const updateData: any = {
				paymentStatus: 'paid',
				status: 'confirmed',
				paymentIntentId: paymentIntent.id,
				updatedAt: new Date().toISOString(),
			}

			if (invoiceNumber && !bookingData?.invoiceNumber) {
				updateData.invoiceNumber = invoiceNumber
			}

			return from(bookingRef.update(updateData)).pipe(
				retryWithBackoff(3, 500),
				tap(() => console.log(`Updated booking ${bookingId} to confirmed status`)),
				map(() => ({ bookingData: { ...bookingData, ...updateData, invoiceNumber } }))
			)
		}),
		// Send confirmation email
		switchMap(({ bookingData }) => {
			// Check if email was already successfully sent
			// Only skip if emailSent is true AND emailSentAt exists (indicating successful send)
			if (bookingData.emailSent && bookingData.emailSentAt) {
				console.log(`Email already successfully sent for booking ${bookingId} at ${bookingData.emailSentAt}`)
				return of({ success: true, action: 'updated_booking', emailSkipped: true })
			}

			// If emailSent is true but no emailSentAt, it might be a failed attempt
			if (bookingData.emailSent && !bookingData.emailSentAt) {
				console.warn(`Booking ${bookingId} has emailSent flag but no emailSentAt timestamp - retrying email`)
			}

			return sendBookingConfirmationEmail(bookingData, bookingId, paymentIntent, bookingRef).pipe(
				map(() => ({ success: true, action: 'updated_booking', emailSent: true })),
				catchError(error => {
					console.error(`Failed to send email for booking ${bookingId}:`, error)
					// Return success for the payment but note email failure
					return of({ success: true, action: 'updated_booking', emailFailed: true })
				})
			)
		})
	)
}

/**
 * Send booking confirmation email with proper error handling
 */
function sendBookingConfirmationEmail(bookingData: any, bookingId: string, paymentIntent: Stripe.PaymentIntent, bookingRef: any) {
	// Fetch court and venue data in parallel
	const courtData$ = bookingData.courtId 
		? from(db.collection('courts').doc(bookingData.courtId).get()).pipe(
			map(doc => doc.exists ? doc.data() : null),
			catchError(() => of(null))
		)
		: of(null)

	const venueData$ = courtData$.pipe(
		switchMap(courtData => {
			if (courtData?.venueId) {
				return from(db.collection('venues').doc(courtData.venueId).get()).pipe(
					map(doc => doc.exists ? doc.data() : null),
					catchError(() => of(null))
				)
			}
			return of(null)
		})
	)

	return forkJoin({
		courtData: courtData$,
		venueData: venueData$
	}).pipe(
		// Prepare and send email
		switchMap(({ courtData, venueData }) => {
			const emailData = prepareEmailData(bookingData, courtData, venueData, paymentIntent)
			
			console.log(`Attempting to send email for booking ${bookingId} to ${emailData.customerEmail}`)
			console.log('Email data:', JSON.stringify({
				bookingId: emailData.bookingId,
				customerEmail: emailData.customerEmail,
				hasBookingDetails: !!emailData.bookingDetails,
				hasVenueInfo: !!emailData.venueInfo,
				invoiceNumber: emailData.invoiceNumber
			}, null, 2))
			
			return defer(async () => {
				const mockEvent = {
					body: JSON.stringify(emailData),
					httpMethod: 'POST',
					headers: {},
					rawUrl: '',
					rawQuery: '',
					path: '',
					multiValueHeaders: {},
					isBase64Encoded: false,
					queryStringParameters: null,
					multiValueQueryStringParameters: null
				} as any
				return emailHandler(mockEvent, {} as any)
			}).pipe(
				retryWithBackoff(2, 2000),
				map(response => response && 'body' in response && response.body ? JSON.parse(response.body) : { success: false, error: 'Invalid response' }),
				tap(result => {
					if (result.success) {
						console.log(`Sent confirmation email for booking ${bookingId}`)
					} else {
						console.error(`Failed to send confirmation email for booking ${bookingId}:`, result.error)
					}
				}),
				switchMap(result => {
					if (result.success) {
						// Only mark email as sent if it was actually successful
						return from(bookingRef.update({
							emailSent: true,
							emailSentAt: new Date().toISOString(),
						})).pipe(
							retryWithBackoff(2, 500),
							map(() => result)
						)
					} else {
						// Email failed - clear the emailSent flag if it was set
						return from(bookingRef.update({
							emailSent: false,
							emailFailedAt: new Date().toISOString(),
							emailError: result.error || 'Unknown error'
						})).pipe(
							catchError(() => of(null)), // Don't fail if we can't update the flag
							map(() => result)
						)
					}
				})
			)
		}),
		catchError(error => {
			console.error(`Error sending confirmation email for booking ${bookingId}:`, error)
			// Don't fail the entire process if email fails
			return of(null)
		})
	)
}

/**
 * Create an emergency booking when original booking is missing
 */
function createEmergencyBooking(paymentIntent: Stripe.PaymentIntent, bookingId: string, courtId?: string, date?: string, userId?: string, venueId?: string) {
	const customerEmail = paymentIntent.receipt_email
	const customerName = paymentIntent.shipping?.name || 'Guest User'
	const startTime = paymentIntent.metadata?.startTime
	const endTime = paymentIntent.metadata?.endTime
	const amount = paymentIntent.amount / 100

	return defer(async () => {
		const invoiceNumber = await generateInvoiceNumber(db, bookingId)
		console.log(`Generated invoice number ${invoiceNumber} for emergency booking ${bookingId}`)
		return invoiceNumber
	}).pipe(
		switchMap(invoiceNumber => {
			const newBooking = {
				id: bookingId,
				courtId: courtId || 'unknown',
				venueId: venueId || null,
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
				recoveredFromPayment: true,
				invoiceNumber: invoiceNumber,
				orderNumber: invoiceNumber
			}

			return from(db.collection('bookings').doc(bookingId).set(newBooking)).pipe(
				retryWithBackoff(),
				tap(() => console.log(`Created emergency booking record for ${bookingId}`)),
				map(() => ({ newBooking, invoiceNumber }))
			)
		}),
		// Log the emergency booking creation
		tap(() => logPaymentTransaction(paymentIntent, 'succeeded', 'Created emergency booking record as original was missing')),
		// Attempt to send email for emergency booking
		switchMap(({ invoiceNumber }) => {
			const emailData = {
				bookingId: bookingId,
				customerEmail: customerEmail,
				customerName: customerName,
				bookingDetails: {
					date: date || new Date().toISOString().split('T')[0],
					startTime: startTime || 'N/A',
					endTime: endTime || 'N/A',
					userTimezone: 'Europe/Berlin', // Default to venue timezone
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
				invoiceNumber: invoiceNumber
			}

			return defer(async () => {
				const mockEvent = {
					body: JSON.stringify(emailData),
					httpMethod: 'POST',
					headers: {},
					rawUrl: '',
					rawQuery: '',
					path: '',
					multiValueHeaders: {},
					isBase64Encoded: false,
					queryStringParameters: null,
					multiValueQueryStringParameters: null
				} as any
				return emailHandler(mockEvent, {} as any)
			}).pipe(
				map(response => response && 'body' in response && response.body ? JSON.parse(response.body) : { success: false, error: 'Invalid response' }),
				tap(result => {
					if (result.success) {
						console.log(`Sent confirmation email for emergency booking ${bookingId}`)
					}
				}),
				filter(result => result.success),
				switchMap(() => 
					from(db.collection('bookings').doc(bookingId).update({
						emailSent: true,
						emailSentAt: new Date().toISOString(),
					}))
				),
				catchError(error => {
					console.error(`Error sending email for emergency booking ${bookingId}:`, error)
					return of(null)
				})
			)
		}),
		map(() => ({ success: true, action: 'created_emergency_booking' }))
	)
}


/**
 * Helper function to prepare email data
 */
function prepareEmailData(booking: any, court: any, venue: any, paymentIntent: Stripe.PaymentIntent) {
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

	// Send the full ISO strings - the email template and calendar utils will handle timezone conversion
	const startTime = booking.startTime || 'N/A'
	const endTime = booking.endTime || 'N/A'

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
			startTime: booking.startTime || startTime, // Send ISO timestamp
			endTime: booking.endTime || endTime, // Send ISO timestamp
			userTimezone: 'Europe/Berlin', // Default to venue timezone
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

/**
 * Handle charge refunded events
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
	console.log('Charge refunded:', charge.id)
	
	// Get payment intent ID from charge
	const paymentIntentId = typeof charge.payment_intent === 'string' 
		? charge.payment_intent 
		: charge.payment_intent?.id
		
	if (!paymentIntentId) {
		console.error('No payment intent ID found in charge')
		return { success: false, error: 'No payment intent ID' }
	}
	
	try {
		// Find booking by payment intent ID
		const bookingsSnapshot = await db.collection('bookings')
			.where('paymentIntentId', '==', paymentIntentId)
			.limit(1)
			.get()
			
		if (bookingsSnapshot.empty) {
			console.error(`No booking found for payment intent ${paymentIntentId}`)
			return { success: false, error: 'Booking not found' }
		}
		
		const bookingDoc = bookingsSnapshot.docs[0]
		const bookingId = bookingDoc.id
		const booking = bookingDoc.data()
		
		// Calculate refund details
		const refundAmount = charge.amount_refunded / 100 // Convert from cents
		const isFullRefund = charge.amount_refunded === charge.amount
		
		// Get the actual refund object from charge
		const refundData = charge.refunds?.data?.[0]
		const refundStatus = refundData?.status || 'succeeded' // charge.refunded implies succeeded
		
		// Update booking with refund information
		await db.collection('bookings').doc(bookingId).update({
			refundStatus: refundStatus,
			refundAmount: refundAmount,
			refundedAt: new Date().toISOString(),
			refundId: refundData?.id || 'unknown',
			status: 'cancelled',
			cancellationReason: `Refunded via Stripe: ${isFullRefund ? 'Full refund' : 'Partial refund'}`,
			updatedAt: new Date().toISOString(),
			// Preserve original refund reason if it was set by admin
			...(booking.refundReason ? {} : {})
		})
		
		console.log(`Updated booking ${bookingId} with refund status: ${isFullRefund ? 'fully refunded' : 'partially refunded'} (€${refundAmount})`)
		
		// Send refund completion email only if not already sent
		if (!booking.refundCompletedEmailSent) {
			try {
				const refund = charge.refunds?.data?.[0]
				if (refund) {
					console.log(`Webhook charge.refunded: Sending refund completion email`)
					await sendRefundCompletionEmail(booking, bookingId, refund)
					console.log('Refund completion email sent successfully via webhook')
					
					// Mark completion email as sent to prevent duplicates
					await db.collection('bookings').doc(bookingId).update({
						refundCompletedEmailSent: true,
						refundCompletedEmailSentAt: new Date().toISOString()
					})
				} else {
					console.warn('No refund data found in charge object, skipping email')
				}
			} catch (emailError) {
				console.error('Failed to send refund completion email via webhook:', emailError)
				// Don't fail the webhook processing if email fails
			}
		} else {
			console.log('Refund completion email already sent, skipping duplicate from charge.refunded')
		}
		
		// Log refund transaction
		await db.collection('paymentTransactions').add({
			type: 'refund',
			chargeId: charge.id,
			paymentIntentId: paymentIntentId,
			bookingId: bookingId,
			amount: refundAmount,
			currency: charge.currency,
			status: 'succeeded',
			isFullRefund: isFullRefund,
			refundId: charge.refunds?.data?.[0]?.id || 'unknown',
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
			notes: `${isFullRefund ? 'Full' : 'Partial'} refund processed via Stripe webhook`
		})
		
		return { 
			success: true, 
			action: 'updated_refund_status',
			bookingId,
			refundAmount,
			isFullRefund
		}
		
	} catch (error) {
		console.error('Error handling charge refunded webhook:', error)
		return { 
			success: false, 
			error: error.message || 'Failed to process refund webhook' 
		}
	}
}

/**
 * Handle refund creation webhook
 * 
 * For instant refunds (most cards): status will be 'succeeded' immediately
 * For delayed refunds: status will be 'pending' and later update to 'succeeded'
 */
async function handleRefundCreated(refund: Stripe.Refund) {
	console.log('Refund created:', refund.id, 'Status:', refund.status)
	
	try {
		// Find booking by payment intent ID
		const bookingsSnapshot = await db.collection('bookings')
			.where('paymentIntentId', '==', refund.payment_intent)
			.limit(1)
			.get()
			
		if (bookingsSnapshot.empty) {
			console.error(`No booking found for payment intent ${refund.payment_intent}`)
			return { success: false, error: 'Booking not found' }
		}
		
		const bookingDoc = bookingsSnapshot.docs[0]
		const bookingId = bookingDoc.id
		
		// Update booking with initial refund status
		const updateData: any = {
			refundId: refund.id,
			refundStatus: refund.status, // Will be 'pending' initially
			refundAmount: refund.amount / 100,
			refundCreatedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		}
		
		// Only update cancellation status if refund is already succeeded
		if (refund.status === 'succeeded') {
			updateData.status = 'cancelled'
			updateData.refundedAt = new Date().toISOString()
		}
		
		await db.collection('bookings').doc(bookingId).update(updateData)
		
		console.log(`Booking ${bookingId} updated with refund creation: ${refund.status}`)
		
		// Handle email based on refund status
		const booking = bookingDoc.data()
		
		if (refund.status === 'pending' || refund.status === 'requires_action') {
			// Refund is processing - send initiated email
			if (!booking.refundInitiatedEmailSent) {
				try {
					console.log(`Sending refund initiated email for booking ${bookingId} (status: ${refund.status})`)
					await sendRefundInitiatedEmail(booking, bookingId, refund, booking.refundReason)
					
					// Mark initial email as sent
					await db.collection('bookings').doc(bookingId).update({
						refundInitiatedEmailSent: true,
						refundInitiatedEmailSentAt: new Date().toISOString()
					})
				} catch (emailError) {
					console.error('Failed to send refund initiated email:', emailError)
				}
			}
		} else if (refund.status === 'succeeded') {
			// Refund succeeded immediately - send completed email
			if (!booking.refundCompletedEmailSent) {
				try {
					console.log(`Refund succeeded immediately for booking ${bookingId} - sending completion email`)
					await sendRefundCompletionEmail(booking, bookingId, refund)
					
					// Mark completion email as sent
					await db.collection('bookings').doc(bookingId).update({
						refundCompletedEmailSent: true,
						refundCompletedEmailSentAt: new Date().toISOString()
					})
				} catch (emailError) {
					console.error('Failed to send refund completion email:', emailError)
				}
			}
		}
		
		return {
			success: true,
			action: 'refund_created',
			bookingId,
			refundStatus: refund.status
		}
		
	} catch (error) {
		console.error('Error handling refund created:', error)
		return { 
			success: false, 
			error: error.message || 'Failed to process refund creation' 
		}
	}
}

/**
 * Handle refund status update webhook
 */
async function handleRefundUpdated(refund: Stripe.Refund) {
	console.log('Refund updated:', refund.id, 'Status:', refund.status, 'Details', refund)
	
	try {
		// Find booking by payment intent ID
		const bookingsSnapshot = await db.collection('bookings')
			.where('paymentIntentId', '==', refund.payment_intent)
			.limit(1)
			.get()
			
		if (bookingsSnapshot.empty) {
			console.error(`No booking found for payment intent ${refund.payment_intent}`)
			return { success: false, error: 'Booking not found' }
		}
		
		const bookingDoc = bookingsSnapshot.docs[0]
		const bookingId = bookingDoc.id
		const booking = bookingDoc.data()
		
		// Update booking with new refund status
		const updateData: any = {
			refundStatus: refund.status,
			updatedAt: new Date().toISOString()
		}
		
		// Handle different status transitions
		switch (refund.status) {
			case 'succeeded':
				// Refund has succeeded - mark booking as cancelled and send email
				updateData.status = 'cancelled'
				updateData.refundedAt = new Date().toISOString()
				updateData.cancellationReason = booking.cancellationReason || (booking.refundReason ? `Refunded: ${booking.refundReason}` : 'Refunded')
				
				await db.collection('bookings').doc(bookingId).update(updateData)
				
				// Don't send email from charge.refund.updated - emails are sent by refund.created and charge.refunded
				console.log('charge.refund.updated webhook - refund succeeded, status updated (no email sent)')
				break
				
			case 'failed':
				// Refund failed - update status but don't cancel booking
				updateData.refundFailedAt = new Date().toISOString()
				updateData.refundFailureReason = refund.failure_reason || 'Unknown failure reason'
				
				await db.collection('bookings').doc(bookingId).update(updateData)
				
				// TODO: Send failure notification to admin/venue
				console.error(`Refund failed for booking ${bookingId}: ${refund.failure_reason}`)
				break
				
			case 'canceled':
				// Refund was canceled
				updateData.refundCanceledAt = new Date().toISOString()
				await db.collection('bookings').doc(bookingId).update(updateData)
				break
				
			case 'requires_action':
				// Customer action required
				updateData.refundRequiresAction = true
				await db.collection('bookings').doc(bookingId).update(updateData)
				// TODO: Send notification to customer about required action
				break
				
			default:
				// Just update the status
				await db.collection('bookings').doc(bookingId).update(updateData)
		}
		
		console.log(`Booking ${bookingId} refund status updated to: ${refund.status}`)
		
		return {
			success: true,
			action: 'refund_status_updated',
			bookingId,
			refundStatus: refund.status
		}
		
	} catch (error) {
		console.error('Error handling refund update:', error)
		return { 
			success: false, 
			error: error.message || 'Failed to process refund update' 
		}
	}
}

/**
 * Handle failed refund webhook
 */
async function handleRefundFailed(refund: Stripe.Refund) {
	console.log('Refund failed:', refund.id, 'Reason:', refund.failure_reason)
	
	try {
		// Find booking by payment intent ID
		const bookingsSnapshot = await db.collection('bookings')
			.where('paymentIntentId', '==', refund.payment_intent)
			.limit(1)
			.get()
			
		if (bookingsSnapshot.empty) {
			console.error(`No booking found for payment intent ${refund.payment_intent}`)
			return { success: false, error: 'Booking not found' }
		}
		
		const bookingDoc = bookingsSnapshot.docs[0]
		const bookingId = bookingDoc.id
		const booking = bookingDoc.data()
		
		// Update booking with failure information
		await db.collection('bookings').doc(bookingId).update({
			refundStatus: 'failed',
			refundFailedAt: new Date().toISOString(),
			refundFailureReason: refund.failure_reason || 'Unknown failure reason',
			updatedAt: new Date().toISOString()
		})
		
		// Log critical failure for admin attention
		const failureDoc = await db.collection('refundFailures').add({
			bookingId,
			refundId: refund.id,
			paymentIntentId: refund.payment_intent,
			amount: refund.amount / 100,
			failureReason: refund.failure_reason,
			failureBalanceTransaction: refund.failure_balance_transaction,
			customerEmail: booking.customerEmail || booking.userEmail,
			courtName: booking.courtName || 'Unknown',
			venueName: booking.venueName || 'Unknown', 
			bookingDate: booking.date,
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
			needsManualIntervention: true,
			retryable: isRetryableRefundError(refund.failure_reason),
			customerNotified: false,
			adminNotified: false
		})
		
		console.error(`Critical: Refund failed for booking ${bookingId}. Manual intervention required.`)
		
		// Send customer notification about delay
		try {
			await sendRefundDelayEmail(booking, bookingId, refund)
			await failureDoc.update({ customerNotified: true })
		} catch (emailError) {
			console.error('Failed to send refund delay notification:', emailError)
		}
		
		return {
			success: true,
			action: 'refund_failure_logged',
			bookingId,
			requiresManualIntervention: true
		}
		
	} catch (error) {
		console.error('Error handling refund failure:', error)
		return { 
			success: false, 
			error: error.message || 'Failed to process refund failure' 
		}
	}
}

/**
 * Check if refund error is retryable
 */
function isRetryableRefundError(failureReason?: string): boolean {
  const retryableReasons = [
    'insufficient_funds',
    'processing_error',
    'api_error',
    'rate_limit_error',
    'bank_timeout'
  ]
  
  return failureReason ? retryableReasons.some(reason => 
    failureReason.toLowerCase().includes(reason)
  ) : false
}

/**
 * Send refund delay notification to customer
 */
async function sendRefundDelayEmail(booking: any, bookingId: string, refund: Stripe.Refund): Promise<void> {
  try {
    // Get court and venue details
    let courtName = 'Court'
    let venueName = 'Funkhaus Sports'
    
    if (booking.courtId) {
      const courtDoc = await db.collection('courts').doc(booking.courtId).get()
      if (courtDoc.exists) {
        const courtData = courtDoc.data()
        courtName = courtData?.name || 'Court'
        
        if (courtData?.venueId) {
          const venueDoc = await db.collection('venues').doc(courtData.venueId).get()
          if (venueDoc.exists) {
            venueName = venueDoc.data()?.name || 'Funkhaus Sports'
          }
        }
      }
    }
    
    // Format booking date
    const bookingDate = new Date(booking.date)
    const formattedDate = bookingDate.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    
    // Compile and render the delay notification template
    const compileFunction = pug.compileFile(resolve(__dirname, './_shared/refund-delay.pug'), {
      cache: false
    })
    
    const html = compileFunction({
      customer: {
        name: booking.userName || 'Customer',
        email: booking.customerEmail || booking.userEmail
      },
      bookingId: bookingId,
      booking: {
        date: formattedDate,
        court: courtName,
        venue: venueName
      },
      refund: {
        amount: (refund.amount / 100).toFixed(2)
      }
    })
    
    // Send email via Resend
    await resend.emails.send({
      from: 'Funkhaus Sports <ticket@funkhaus-berlin.net>',
      to: booking.customerEmail || booking.userEmail || '',
      subject: `Funkhaus Sports - Refund Processing Update - Booking #${booking.orderNumber || booking.invoiceNumber || bookingId}`,
      html: html
    })
    
    console.log(`Refund delay notification sent to ${booking.customerEmail || booking.userEmail}`)
  } catch (error) {
    console.error('Error sending refund delay email:', error)
    throw error
  }
}

/**
 * Send refund completion email to customer
 */
async function sendRefundCompletionEmail(booking: any, bookingId: string, refund: Stripe.Refund): Promise<void> {
  try {
    // Get court and venue details
    let courtName = 'Court'
    let venueName = 'Funkhaus Sports'
    let venueEmail: string | null = null
    
    if (booking.courtId) {
      const courtDoc = await db.collection('courts').doc(booking.courtId).get()
      if (courtDoc.exists) {
        const courtData = courtDoc.data()
        courtName = courtData?.name || 'Court'
        
        if (courtData?.venueId) {
          const venueDoc = await db.collection('venues').doc(courtData.venueId).get()
          if (venueDoc.exists) {
            const venueData = venueDoc.data()
            venueName = venueData?.name || 'Funkhaus Sports'
            venueEmail = venueData?.contactEmail || null
          }
        }
      }
    }
    
    // Format times for display
    const userTimezone = 'Europe/Berlin' // Default timezone
    let startTime = booking.startTime
    let endTime = booking.endTime
    
    // Convert to 24-hour format
    if (startTime && startTime.includes('T')) {
      startTime = dayjs(startTime).tz(userTimezone).format('HH:mm')
    }
    if (endTime && endTime.includes('T')) {
      endTime = dayjs(endTime).tz(userTimezone).format('HH:mm')
    }
    
    const timeDisplay = `${startTime} - ${endTime}`
    
    // Format booking date
    const bookingDate = new Date(booking.date)
    const formattedDate = bookingDate.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    
    // Compile and render the refund completion email template
    const compileFunction = pug.compileFile(resolve(__dirname, './_shared/refund-completed.pug'), {
      cache: false
    })
    
    const html = compileFunction({
      customer: {
        name: booking.userName || 'Customer',
        email: booking.customerEmail || booking.userEmail
      },
      bookingId: bookingId,
      orderNumber: booking.orderNumber,
      invoiceNumber: booking.invoiceNumber,
      booking: {
        date: formattedDate,
        court: courtName,
        venue: venueName,
        price: booking.price?.toFixed(2) || '0.00'
      },
      timeDisplay,
      refund: {
        amount: (refund.amount / 100).toFixed(2),
        id: refund.id
      }
    })
    
    // Prepare recipients - customer email + venue CC if available
    const toEmails = [booking.customerEmail || booking.userEmail || '']
    const ccEmails = venueEmail ? [venueEmail] : []
    
    // Send email via Resend
    await resend.emails.send({
      from: 'Funkhaus Sports <ticket@funkhaus-berlin.net>',
      to: toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject: `Funkhaus Sports - Refund Completed - ${formattedDate}`,
      html: html
    })
    
    console.log(`Refund completion email sent to ${booking.customerEmail || booking.userEmail} with CC to ${venueEmail || 'no venue email'}`)
  } catch (error) {
    console.error('Error sending refund completion email:', error)
    throw error
  }
}

/**
 * Send refund notification email to customer with venue CC
 */
/**
 * Send refund initiated email to customer with venue CC
 */
async function sendRefundInitiatedEmail(booking: any, bookingId: string, refund: Stripe.Refund, reason?: string): Promise<void> {
  try {
    // Get court and venue details
    let courtName = 'Court'
    let venueName = 'Funkhaus Sports'
    let venueEmail: string | null = null
    
    if (booking.courtId) {
      const courtDoc = await db.collection('courts').doc(booking.courtId).get()
      if (courtDoc.exists) {
        const courtData = courtDoc.data()
        courtName = courtData?.name || 'Court'
        
        if (courtData?.venueId) {
          const venueDoc = await db.collection('venues').doc(courtData.venueId).get()
          if (venueDoc.exists) {
            const venueData = venueDoc.data()
            venueName = venueData?.name || 'Funkhaus Sports'
            venueEmail = venueData?.contactEmail || null
          }
        }
      }
    }
    
    // Format times for display
    const userTimezone = 'Europe/Berlin' // Default timezone
    let startTime = booking.startTime
    let endTime = booking.endTime
    
    // Convert to 24-hour format
    if (startTime && startTime.includes('T')) {
      startTime = dayjs(startTime).tz(userTimezone).format('HH:mm')
    }
    if (endTime && endTime.includes('T')) {
      endTime = dayjs(endTime).tz(userTimezone).format('HH:mm')
    }
    
    const timeDisplay = `${startTime} - ${endTime}`
    
    // Format booking date
    const bookingDate = new Date(booking.date)
    const formattedDate = bookingDate.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    
    // Format refund status for display
    const refundStatusDisplay = refund.status === 'succeeded' ? 'Processing' : 
                               refund.status === 'pending' ? 'Pending' : 
                               'In Progress'
    
    // Compile and render the refund initiated email template
    const refundCompileFunction = pug.compileFile(resolve(__dirname, './_shared/refund-initiated.pug'), {
      cache: false
    })
    
    const html = refundCompileFunction({
      customer: {
        name: booking.userName || 'Customer',
        email: booking.customerEmail || booking.userEmail
      },
      bookingId: bookingId,
      orderNumber: booking.orderNumber,
      invoiceNumber: booking.invoiceNumber,
      booking: {
        date: formattedDate,
        court: courtName,
        venue: venueName,
        price: booking.price?.toFixed(2) || '0.00'
      },
      timeDisplay,
      refund: {
        amount: (refund.amount / 100).toFixed(2),
        status: refundStatusDisplay,
        id: refund.id,
        reason: reason || ''
      }
    })
    
    console.log(`Webhook sendRefundEmail - reason parameter: "${reason}", final reason in template: "${reason || '(no reason provided)'}"`)
    
    // Prepare recipients - customer email + venue CC if available
    const toEmails = [booking.customerEmail || booking.userEmail || '']
    const ccEmails = venueEmail ? [venueEmail] : []
    
    // Send email via Resend
    await resend.emails.send({
      from: 'Funkhaus Sports <ticket@funkhaus-berlin.net>',
      to: toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject: `Funkhaus Sports - Refund Initiated - ${formattedDate}`,
      html: html
    })
    
    console.log(`Refund email sent to ${booking.customerEmail || booking.userEmail} with CC to ${venueEmail || 'no venue email'}`)
  } catch (error) {
    console.error('Error sending refund email:', error)
    throw error
  }
}

export { handlePaymentIntentSucceededRx, handler }

