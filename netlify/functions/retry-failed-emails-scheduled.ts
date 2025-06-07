import { Handler, schedule } from '@netlify/functions'
import { db } from './_shared/firebase-admin'
import { from, of, defer, forkJoin } from 'rxjs'
import { map, switchMap, tap, catchError, filter, toArray, mergeMap } from 'rxjs/operators'
import admin from 'firebase-admin'

// Maximum number of retry attempts before marking as permanently failed
const MAX_RETRY_ATTEMPTS = 3

// Schedule to run every 30 minutes
export const handler: Handler = schedule('*/30 * * * *', async (event, context) => {
	console.log('=== Email Retry Scheduled Function Started ===')
	
	try {
		// Query bookings that need email retry
		const failedEmailBookings$ = from(
			db.collection('bookings')
				.where('status', '==', 'confirmed')
				.where('paymentStatus', '==', 'paid')
				.where('emailSent', '==', false)
				.where('startTime', '>', new Date().toISOString()) // Only future bookings
				.get()
		).pipe(
			map(snapshot => {
				const bookings: any[] = []
				snapshot.forEach(doc => {
					const data = doc.data()
					// Only include bookings that haven't exceeded max retries
					const retryCount = data.emailRetryCount || 0
					if (retryCount < MAX_RETRY_ATTEMPTS) {
						bookings.push({
							id: doc.id,
							...data
						})
					}
				})
				return bookings
			}),
			tap(bookings => console.log(`Found ${bookings.length} bookings requiring email retry`))
		)

		// Process each booking for email retry
		const processedBookings = await failedEmailBookings$.pipe(
			switchMap(bookings => {
				if (bookings.length === 0) {
					console.log('No bookings require email retry')
					return of([])
				}

				// Process each booking individually
				return from(bookings).pipe(
					mergeMap(booking => retryBookingEmail(booking), 3), // Process up to 3 concurrently
					toArray()
				)
			}),
			catchError(error => {
				console.error('Error in email retry process:', error)
				return of([])
			})
		).toPromise()

		// Log summary
		const successful = processedBookings?.filter((r: any) => r.success).length || 0
		const failed = processedBookings?.filter((r: any) => !r.success).length || 0
		
		console.log(`Email retry complete: ${successful} successful, ${failed} failed`)

		return {
			statusCode: 200,
			body: JSON.stringify({
				message: 'Email retry job completed',
				successful,
				failed,
				total: processedBookings?.length || 0
			})
		}
	} catch (error) {
		console.error('Email retry scheduled function error:', error)
		return {
			statusCode: 500,
			body: JSON.stringify({
				error: 'Failed to run email retry job',
				message: error.message
			})
		}
	}
})

/**
 * Retry sending email for a single booking
 */
function retryBookingEmail(booking: any) {
	console.log(`Attempting email retry for booking ${booking.id} (attempt ${(booking.emailRetryCount || 0) + 1})`)

	// Fetch additional data needed for email
	const courtData$ = booking.courtId 
		? from(db.collection('courts').doc(booking.courtId).get()).pipe(
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
		switchMap(({ courtData, venueData }) => {
			// Prepare email data
			const emailData = prepareEmailData(booking, courtData, venueData)
			
			// Call the email sending function
			return defer(async () => {
				const { handler: emailHandler } = require('./send-booking-email')
				const mockEvent = {
					body: JSON.stringify(emailData),
					httpMethod: 'POST',
					headers: {},
				}
				return emailHandler(mockEvent, {})
			}).pipe(
				map(response => JSON.parse(response.body)),
				switchMap(result => {
					const retryCount = (booking.emailRetryCount || 0) + 1
					
					if (result.success) {
						// Email sent successfully
						console.log(`Email retry successful for booking ${booking.id}`)
						return from(db.collection('bookings').doc(booking.id).update({
							emailSent: true,
							emailSentAt: new Date().toISOString(),
							emailRetryCount: retryCount,
							emailError: admin.firestore.FieldValue.delete(),
							emailFailedAt: admin.firestore.FieldValue.delete()
						})).pipe(
							map(() => ({ bookingId: booking.id, success: true, retryCount }))
						)
					} else {
						// Email failed again
						console.error(`Email retry failed for booking ${booking.id}:`, result.error)
						
						const updateData: any = {
							emailRetryCount: retryCount,
							emailFailedAt: new Date().toISOString(),
							emailError: result.error || 'Unknown error',
							lastRetryAt: new Date().toISOString()
						}
						
						// If max retries reached, mark as permanently failed
						if (retryCount >= MAX_RETRY_ATTEMPTS) {
							updateData.emailPermanentlyFailed = true
							updateData.emailPermanentlyFailedAt = new Date().toISOString()
							console.log(`Booking ${booking.id} marked as permanently failed after ${retryCount} attempts`)
						}
						
						return from(db.collection('bookings').doc(booking.id).update(updateData)).pipe(
							map(() => ({ 
								bookingId: booking.id, 
								success: false, 
								retryCount,
								permanentlyFailed: retryCount >= MAX_RETRY_ATTEMPTS,
								error: result.error 
							}))
						)
					}
				})
			)
		}),
		catchError(error => {
			console.error(`Error processing booking ${booking.id}:`, error)
			// Update the booking with error information
			return from(db.collection('bookings').doc(booking.id).update({
				emailRetryCount: (booking.emailRetryCount || 0) + 1,
				lastRetryAt: new Date().toISOString(),
				emailError: error.message || 'Retry processing error'
			})).pipe(
				map(() => ({ bookingId: booking.id, success: false, error: error.message })),
				catchError(() => of({ bookingId: booking.id, success: false, error: 'Failed to update booking' }))
			)
		})
	)
}

/**
 * Prepare email data (similar to the one in stripe-webhook.ts)
 */
function prepareEmailData(booking: any, court: any, venue: any) {
	const vatRate = 0.07
	const netAmount = booking.price / (1 + vatRate)
	const vatAmount = booking.price - netAmount

	const bookingDate = new Date(booking.date).toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	})

	const startTime = booking.startTime || 'N/A'
	const endTime = booking.endTime || 'N/A'

	return {
		bookingId: booking.id,
		customerEmail: booking.customerEmail || booking.userEmail,
		customerName: booking.userName || 'Customer',
		customerPhone: booking.customerPhone || '',
		customerAddress: booking.customerAddress || {},
		bookingDetails: {
			date: bookingDate,
			startTime: booking.startTime || startTime,
			endTime: booking.endTime || endTime,
			userTimezone: 'Europe/Berlin',
			court: court?.name || 'Court',
			courtType: court?.courtType || 'standard',
			venue: venue?.name || 'Funkhaus Sports',
			price: booking.price.toFixed(2),
			vatInfo: {
				netAmount: netAmount.toFixed(2),
				vatAmount: vatAmount.toFixed(2),
				vatRate: `${(vatRate * 100).toFixed(0)}%`,
			},
			rawDate: booking.date ? new Date(booking.date).toISOString().split('T')[0] : null,
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
			paymentIntentId: booking.paymentIntentId,
		},
		invoiceNumber: booking.invoiceNumber || null,
		isRetry: true, // Flag to indicate this is a retry
		retryCount: booking.emailRetryCount || 0
	}
}