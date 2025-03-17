// src/public/book/PaymentService.ts

import { Stripe, StripeElements } from '@stripe/stripe-js'
import { BehaviorSubject, from, Observable, of } from 'rxjs'
import { catchError, finalize, map, switchMap } from 'rxjs/operators'
import { BookingService } from 'src/bookingServices/booking.service'
import { auth } from 'src/firebase/firebase'
import { createPaymentIntent } from '../stripe'
import { Booking } from './context'
import { BookingErrorHandler } from './error-handler'

/**
 * Handles payment processing and Stripe integration
 */
export class PaymentService {
	private bookingService = new BookingService()
	private errorHandler = new BookingErrorHandler()

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
		// Generate ID if needed
		const bookingId = booking.id || `booking-${this.generateUUID()}`

		// Use existing user ID or generate guest ID
		const userId = auth.currentUser?.uid || `guest-${this.generateUUID()}`

		// Return updated booking object
		return {
			...booking,
			id: bookingId,
			userId: userId || booking.userId,
			paymentStatus: 'pending',
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
			eventID: 'court-booking',
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

		// Finalize booking data
		const bookingData = this.prepareBookingForPayment(booking)

		// Payment data for Stripe
		const paymentData = this.preparePaymentData(bookingData)

		// First create booking, then process payment
		return from(this.bookingService.createBooking(bookingData)).pipe(
			switchMap(createdBooking => {
				// Skip further processing if component is unmounted
				if (this._processingLock !== lockFlag) {
					return of({ success: false, booking: createdBooking })
				}

				return from(createPaymentIntent(paymentData)).pipe(
					switchMap(response => {
						const clientSecret = response.clientSecret

						if (!stripe || !elements) {
							throw new Error('Payment system not available')
						}

						return this.confirmPayment(stripe, elements, clientSecret, createdBooking)
					}),
					map(stripeResult => {
						if (stripeResult.error) {
							throw stripeResult.error
						}

						return { success: true, booking: bookingData }
					}),
				)
			}),
			catchError(error => {
				console.error('Payment or booking error:', error)

				// Only update error if component is still mounted
				if (this._processingLock === lockFlag) {
					const errorMessage = this.errorHandler.getReadableErrorMessage(error)
					this.errorHandler.setError(errorMessage)
				}

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
