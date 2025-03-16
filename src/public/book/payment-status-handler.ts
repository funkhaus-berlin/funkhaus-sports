// src/public/book/payment-status-handler.ts

import { $notify } from '@mhmo91/schmancy'
import { StripePaymentElementOptions } from '@stripe/stripe-js'
import { from, Observable, of } from 'rxjs'
import { catchError, map, switchMap, tap } from 'rxjs/operators'
import { BookingService } from 'src/bookingServices/booking.service'
import stripePromise from 'src/public/stripe'

/**
 * Payment status handler for handling stripe payment results and confirmation
 */
export class PaymentStatusHandler {
	private bookingService: BookingService

	constructor() {
		this.bookingService = new BookingService()
	}

	/**
	 * Check for payment status in the URL parameters
	 * This is called when returning from Stripe payment flow
	 *
	 * @returns Observable indicating if payment was processed
	 */
	checkUrlForPaymentStatus(): Observable<{
		processed: boolean
		success: boolean
		bookingId?: string | null | undefined
	}> {
		const urlParams = new URLSearchParams(window.location.search)
		const clientSecret = urlParams.get('payment_intent_client_secret')
		const paymentIntentId = urlParams.get('payment_intent')
		const bookingId = urlParams.get('booking')

		if (!clientSecret) {
			return of({ processed: false, success: false })
		}

		return from(stripePromise).pipe(
			map(stripe => {
				if (!stripe) {
					throw new Error('Stripe not initialized')
				}
				return stripe
			}),
			switchMap(stripe => from(stripe.retrievePaymentIntent(clientSecret))),
			map(result => {
				const { paymentIntent } = result

				if (!paymentIntent) {
					return { processed: true, success: false }
				}

				switch (paymentIntent.status) {
					case 'succeeded':
						$notify.success('Payment successful!')
						// Update booking status in database
						if (bookingId) {
							this.updateBookingStatus(bookingId, 'paid', paymentIntent.id)
						}
						return { processed: true, success: true, bookingId }

					case 'processing':
						$notify.info("Payment is processing. We'll update you when payment is received.")
						if (bookingId) {
							this.updateBookingStatus(bookingId, 'processing', paymentIntent.id)
						}
						return { processed: true, success: false, bookingId }

					case 'requires_payment_method':
						$notify.error('Payment failed. Please try another payment method.')
						return { processed: true, success: false, bookingId }

					default:
						$notify.info(`Unexpected payment status: ${paymentIntent.status}`)
						return { processed: true, success: false, bookingId }
				}
			}),

			catchError(error => {
				console.error('Error checking payment status:', error)
				$notify.error('An error occurred while checking payment status. Please contact support.')
				return of({ processed: true, success: false })
			}),
			tap(result => {
				// After processing payment status, clean up URL parameters to avoid confusion on page reload
				if (result.processed) {
					const url = new URL(window.location.href)
					url.search = bookingId ? `?booking=${bookingId}` : ''
					window.history.replaceState({}, '', url.toString())
				}
			}),
		)
	}

	/**
	 * Update booking status in Firestore
	 *
	 * @param bookingId ID of the booking
	 * @param status New payment status
	 * @param paymentIntentId Stripe payment intent ID
	 */
	private updateBookingStatus(bookingId: string, status: string, paymentIntentId: string): void {
		this.bookingService
			.updateBookingPaymentStatus(bookingId, status)
			.pipe(
				catchError(error => {
					console.error('Error updating booking status:', error)
					return of(null)
				}),
			)
			.subscribe(booking => {
				if (booking) {
					console.log(`Booking ${bookingId} updated to ${status}`)
					if (status === 'paid') {
						$notify.success('Your booking has been confirmed!')
					}
				}
			})
	}

	/**
	 * Get standard payment element options
	 *
	 * @returns Stripe payment element options
	 */
	getPaymentElementOptions(): StripePaymentElementOptions {
		return {
			layout: {
				type: 'tabs',
				defaultCollapsed: false,
				radios: false,
				spacedAccordionItems: true,
			},
			fields: {
				billingDetails: {
					address: 'never',
				},
			},
			terms: {
				card: 'never',
			},
		}
	}
}
