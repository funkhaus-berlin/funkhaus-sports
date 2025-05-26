// src/public/book/payment-service.ts

import { Stripe, StripeElements } from '@stripe/stripe-js'
import dayjs from 'dayjs'
import { collection, doc, updateDoc } from 'firebase/firestore'
import { BehaviorSubject, from, Observable, of } from 'rxjs'
import { catchError, finalize, map, switchMap, tap } from 'rxjs/operators'
import { BookingService } from 'src/bookingServices/booking.service'
import { auth, db } from 'src/firebase/firebase'
import { createPaymentIntent } from '../stripe'
import { Booking } from './context'

/**
 * Handles payment processing and Stripe integration
 */
export class PaymentService {
	private bookingService = new BookingService()

	// Track processing state
	private _processing = new BehaviorSubject<boolean>(false)
	get processing$(): Observable<boolean> {
		return this._processing.asObservable()
	}
	get processing(): boolean {
		return this._processing.value
	}

	// Unique identifier to track active payment processes
	private _processingLock: any = null

	/**
	 * Generate a UUID for guest users and booking IDs
	 */
	generateUUID(): string {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			const r = (Math.random() * 16) | 0,
				v = c === 'x' ? r : (r & 0x3) | 0x8
			return v.toString(16)
		})
	}

	/**
	 * Prepare a booking for payment
	 * @returns The prepared booking with any needed defaults
	 */
	prepareBookingForPayment(booking: Booking): Booking {
		// Use existing booking ID (created in duration-select) or generate new one
		// This ensures consistency with the booking already created in Firebase
		const bookingId = booking.id || doc(collection(db, 'bookings')).id

		// Use existing user ID or generate guest ID
		const userId = auth.currentUser?.uid || `guest-${this.generateUUID()}`

		// Format dates correctly - convert ISO strings to YYYY-MM-DD format
		const formattedDate = booking.date ? dayjs(booking.date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')

		// Ensure customer address has all required fields
		const customerAddress = {
			street: booking.customerAddress?.street || '',
			city: booking.customerAddress?.city || '',
			postalCode: booking.customerAddress?.postalCode || '',
			country: booking.customerAddress?.country || 'DE', // Default to Germany
		}

		// Return updated booking object with all required fields
		return {
			...booking,
			id: bookingId,
			userId: userId || booking.userId || '',
			userName: booking.userName || 'Guest User',
			userEmail: booking.customerEmail || booking.userEmail || '', // Add userEmail field
			userPhone: booking.customerPhone || booking.userPhone || '', // Add userPhone field
			customerPhone: booking.customerPhone || '',
			customerEmail: booking.customerEmail || '',
			date: formattedDate,
			paymentStatus: 'pending',
			status: 'holding', // Mark as holding until payment is confirmed
			customerAddress,
			venueId: booking.venueId || '', // Ensure venueId is included
			courtId: booking.courtId || '', // Ensure courtId is included
		}
	}

	/**
	 * Prepare payment data for Stripe
	 */
	preparePaymentData(booking: Booking) {
		return {
			amount: Math.round(booking.price * 100), // Convert to cents
			currency: 'eur',
			email: booking.customerEmail || '',
			name: booking.userName || '',
			phone: booking.customerPhone || '',
			address: booking.customerAddress?.street || '',
			postalCode: booking.customerAddress?.postalCode || '',
			city: booking.customerAddress?.city || '',
			country: booking.customerAddress?.country || '',
			courtId: booking.courtId,
			venueId: booking.venueId, // Add venueId to payment metadata
			uid: booking.userId,
			bookingId: booking.id,
			date: booking.date,
			startTime: booking.startTime,
			endTime: booking.endTime,
		}
	}

	/**
	 * Process payment with Stripe
	 *
	 * @param booking The booking data
	 * @param stripe Stripe instance
	 * @param elements Stripe elements
	 * @returns Observable of the payment result
	 */
	processPayment(
		booking: Booking,
		stripe: Stripe,
		elements: StripeElements,
	): Observable<{ success: boolean; booking: Booking; error?: any }> {
		// Prevent multiple processing attempts
		this._processing.next(true)

		// Create a single-use lockFlag to prevent flickering during processing
		const lockFlag = {}
		this._processingLock = lockFlag

		// Log incoming booking data for debugging
		console.log('Processing payment for booking:', JSON.stringify(booking, null, 2))

		// Finalize booking data with required fields and correct formats
		const bookingData = this.prepareBookingForPayment(booking)

		// Log prepared booking data for debugging
		console.log('Prepared booking data:', JSON.stringify(bookingData, null, 2))

		// Payment data for Stripe
		const paymentData = this.preparePaymentData(bookingData)

		// If booking already exists, update it with user info first
		if (bookingData.id && bookingData.status === 'holding') {
			// Update the existing booking with user information
			const bookingUpdate = {
				userName: bookingData.userName,
				userEmail: bookingData.userEmail,
				userPhone: bookingData.userPhone,
				customerEmail: bookingData.customerEmail,
				customerPhone: bookingData.customerPhone,
				customerAddress: bookingData.customerAddress,
				userId: bookingData.userId,
				updatedAt: new Date().toISOString(),
				lastActive: new Date().toISOString()
			}
			
			// Update booking in Firestore
			from(updateDoc(doc(db, 'bookings', bookingData.id), bookingUpdate))
				.pipe(
					tap(() => console.log('Updated booking with user info before payment')),
					catchError(error => {
						console.error('Error updating booking with user info:', error)
						// Continue anyway - payment is more important
						return of(null)
					})
				)
				.subscribe()
		}

		// First create payment intent, then create a temporary booking
		return from(createPaymentIntent(paymentData)).pipe(
			tap(response => console.log('Payment intent created:', response)),
			switchMap(response => {
				// Skip further processing if component is unmounted
				if (this._processingLock !== lockFlag) {
					return of({ success: false, booking: bookingData })
				}
				
				const clientSecret = response.clientSecret
				
				// Check if booking already exists (created during duration selection)
				if (bookingData.id) {
					console.log('Using existing booking:', bookingData.id)
					
					if (!stripe || !elements) {
						throw new Error('Payment system not available')
					}
					
					// Process payment with existing booking
					return from(this.confirmPayment(stripe, elements, clientSecret, bookingData)).pipe(
						map(stripeResult => {
							if (stripeResult.error) {
								throw stripeResult.error
							}
							
							return { success: true, booking: bookingData }
						})
					)
				} else {
					// Create temporary booking record if it doesn't exist
					return from(this.bookingService.createBooking(bookingData)).pipe(
						tap(createdBooking => console.log('Temporary booking created:', createdBooking)),
						switchMap(createdBooking => {
							if (!stripe || !elements) {
								throw new Error('Payment system not available')
							}
							
							// Now process the payment with Stripe
							return this.confirmPayment(stripe, elements, clientSecret, createdBooking)
						}),
						map(stripeResult => {
							if (stripeResult.error) {
								throw stripeResult.error
							}
							
							return { success: true, booking: bookingData }
						})
					)
				}
			}),
			catchError(error => {
				console.error('Payment or booking error:', error)
				// Let Stripe handle payment errors directly in its UI
				// We won't use our custom error service here
				return of({ success: false, booking: bookingData, error })
			}),
			finalize(() => {
				// Only update processing state if component is still mounted
				if (this._processingLock === lockFlag) {
					// Add a small delay to prevent flickering
					setTimeout(() => {
						if (this._processingLock === lockFlag) {
							this._processing.next(false)
						}
					}, 300)
				}
			}),
		)
	}

	/**
	 * Confirm payment with Stripe
	 */
	private confirmPayment(
		stripe: Stripe,
		elements: StripeElements,
		clientSecret: string,
		booking: Booking,
	): Promise<{ error?: any }> {
		return stripe.confirmPayment({
			clientSecret,
			elements: elements,
			confirmParams: {
				payment_method_data: {
					billing_details: {
						name: booking.userName || '',
						email: booking.customerEmail || '',
						phone: booking.customerPhone || '',
						address: {
							country: booking.customerAddress?.country || '',
							state: booking.customerAddress?.city || '',
							city: booking.customerAddress?.city || '',
							line1: booking.customerAddress?.street || '',
							line2: '',
							postal_code: booking.customerAddress?.postalCode || '',
						},
					},
				},
				return_url: `${window.location.href.split('?')[0]}?booking=${booking.id}`,
				receipt_email: booking.customerEmail || '',
			},
			redirect: 'if_required',
		})
	}

	/**
	 * Cancel any ongoing payment processing
	 * Use this when component is unmounted
	 */
	cancelProcessing(): void {
		this._processingLock = null
		this._processing.next(false)
	}
}
