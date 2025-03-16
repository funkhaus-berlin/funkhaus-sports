// src/public/book/steps/payment-step.ts
import { $notify, select, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { StripeElements } from '@stripe/stripe-js'
import dayjs from 'dayjs'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { catchError, finalize, from, map, of, retry, Subject, switchMap, tap } from 'rxjs'
import { Court } from 'src/db/courts.collection'
import { BookingFormData } from 'src/db/interface'
import stripePromise, { $stripe, $stripeElements, createPaymentIntent } from 'src/public/stripe'
import { BookingService } from 'src/bookingServices/booking.service'
import { Booking, bookingContext } from '../context'
import { FunkhausSportsTermsAndConditions } from '../terms-and-conditions'
import { auth } from 'src/firebase/firebase'

@customElement('booking-payment-step')
export class BookingPaymentStep extends $LitElement() {
	@select(bookingContext) booking!: Booking

	@state() loading = true
	@state() processing = false
	@state() formData = new BookingFormData()
	@state() validationPaymentResponse: boolean = false
	@state() error: string | null = null
	@state() success: boolean = false
	@state() validate: boolean = false
	@state() formValidity: Record<string, boolean> = {
		email: true,
		name: true,
		phoneNumber: true,
		address: true,
		postalCode: true,
		city: true,
		country: true,
	}
	@state() emailsMatch: boolean = true

	// Add booking service
	private bookingService = new BookingService()
	private auth = getAuth()

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Initialize Stripe
		$stripe.next(this.booking.price || 0)
		$stripeElements.subscribe(() => {
			if ($stripeElements.value) {
				this.loading = false
			} else {
				this.loading = true
			}
		})

		this.checkPaymentStatus()
	}

	@property({ type: Array }) courts: Court[] = []
	@property({ type: Object }) selectedCourt?: Court
	@property({ attribute: false }) onCourtSelected?: (court: Court) => void

	// Check payment status for returning from Stripe
	async checkPaymentStatus() {
		const clientSecret = new URLSearchParams(window.location.search).get('payment_intent_client_secret')
		const paymentIntentId = new URLSearchParams(window.location.search).get('payment_intent')

		if (!clientSecret) {
			return
		}

		const stripe = await stripePromise

		if (!stripe) {
			$notify.error('Payment processing is not available. Please try again later.')
			return
		}

		this.processing = true
		$notify.info('Verifying payment status...')

		// Check payment status
		const check = new Subject<number>()
		check
			.pipe(
				switchMap(() => from(stripe.retrievePaymentIntent(clientSecret))),
				retry({ count: 3, delay: 1000 }), // Add retry for network resilience
				timeout(30000), // Add timeout to prevent infinite waiting
			)
			.subscribe({
				next: ({ paymentIntent }) => {
					switch (paymentIntent?.status) {
						case 'succeeded':
							$notify.success('Payment successful! Creating your booking...')
							// Create the booking after successful payment
							this.createBookingAfterPayment(paymentIntent.id)
							break
						case 'processing':
							this.processing = true
							$notify.info('Payment is still processing. Please wait...')
							// Check again after a short delay
							setTimeout(() => check.next(0), 2000)
							break
						case 'requires_payment_method':
							$notify.error('Payment failed, please try again.')
							this.processing = false
							// Clear URL parameters to avoid confusion on refresh
							window.history.replaceState({}, document.title, window.location.pathname)
							break
						default:
							$notify.error(`Unexpected payment status: ${paymentIntent?.status}`)
							this.processing = false
							// Log for debugging
							console.error('Unexpected payment status:', paymentIntent)
					}
				},
				error: error => {
					console.error('Error checking payment status:', error)
					$notify.error('Error verifying payment. Please contact support.')
					this.processing = false
				},
			})

		// Start the payment status check
		check.next(0)
	}

	/**
	 * Create a booking in the database when payment is successful
	 */
	private createBookingAfterPayment(paymentIntentId: string) {
		// Set booking status to pending
		const bookingData: Booking = {
			...this.booking,
			paymentStatus: 'paid',
			paymentIntentId,
			customerEmail: this.formData.email, // Ensure email is included
		}

		// Validate essential booking data
		if (!bookingData.courtId || !bookingData.date || !bookingData.startTime || !bookingData.endTime) {
			console.error('Missing essential booking data:', {
				courtId: bookingData.courtId,
				date: bookingData.date,
				startTime: bookingData.startTime,
				endTime: bookingData.endTime,
			})
			$notify.error('Missing booking information. Please contact support with your payment reference.')
			this.processing = false
			return
		}

		from(this.bookingService.createBooking(bookingData))
			.pipe(
				retry({ count: 2, delay: 2000 }), // Retry with delay to handle potential network issues
				catchError(error => {
					console.error('Error creating booking after payment:', error)

					// Record transaction for support to reconcile
					this.logFailedBookingTransaction(paymentIntentId, bookingData, error)

					$notify.error(
						'Payment was successful, but we encountered an issue saving your booking. Please contact support with reference: ' +
							paymentIntentId.substring(0, 8).toUpperCase(),
					)
					this.processing = false
					return of(null)
				}),
				finalize(() => {
					this.processing = false
				}),
			)
			.subscribe(booking => {
				if (booking) {
					// Booking created successfully
					this.success = true
					$notify.success('Booking confirmed!')

					// Log successful transaction
					this.logSuccessfulBooking(booking, paymentIntentId)

					// Reset booking context with confirmed booking
					bookingContext.set({
						id: booking.id,
						userId: booking.userId,
						userName: booking.userName,
						courtId: booking.courtId,
						startTime: booking.startTime,
						endTime: booking.endTime,
						price: booking.price,
						date: booking.date,
						paymentStatus: 'paid',
						status: 'confirmed',
						customerEmail: booking.customerEmail || this.formData.email,
						customerPhone: booking.customerPhone || this.formData.phoneNumber,
						customerAddress: booking.customerAddress || {
							street: this.formData.address,
							city: this.formData.city,
							postalCode: this.formData.postalCode,
							country: this.formData.country,
						},
					})

					// Dispatch an event to notify parent that booking is complete
					this.dispatchEvent(
						new CustomEvent('booking-complete', {
							detail: { booking, paymentIntentId },
							bubbles: true,
							composed: true,
						}),
					)
				}
			})
	}

	private logFailedBookingTransaction(paymentIntentId: string, bookingData: Booking, error: any) {
		// Log to console for now - in production this would write to a database or monitoring service
		console.error('FAILED BOOKING TRANSACTION', {
			timestamp: new Date().toISOString(),
			paymentIntentId,
			bookingData: {
				...bookingData,
				// Include only necessary fields for debugging
				courtId: bookingData.courtId,
				date: bookingData.date,
				startTime: bookingData.startTime,
				endTime: bookingData.endTime,
				price: bookingData.price,
				customerEmail: bookingData.customerEmail,
			},
			error: {
				message: error.message,
				code: error.code,
				stack: error.stack,
			},
		})
	}

	private logSuccessfulBooking(booking: Booking, paymentIntentId: string) {
		// Log successful bookings for audit purposes
		console.log('SUCCESSFUL BOOKING', {
			timestamp: new Date().toISOString(),
			bookingId: booking.id,
			paymentIntentId,
			courtId: booking.courtId,
			date: booking.date,
			customerEmail: booking.customerEmail,
			price: booking.price,
		})
	}

	// Process payment and create booking
	async processPaymentBooking(e: Event) {
		e.preventDefault()

		// First, validate the form
		if (!this.validateForm()) {
			return
		}

		const elements = $stripeElements.value as StripeElements
		const stripe = await stripePromise
		if (!stripe || !elements) {
			$notify.error('Payment processing failed. Please try again.')
			return
		}

		// Validate payment form
		this.processing = true
		const { error } = await elements?.submit()

		if (error) {
			this.processing = false

			if (error.type === 'card_error' || error.type === 'validation_error') {
				$notify.error(error.message || 'Card validation failed')
			} else {
				$notify.error('Something went wrong, please try again.')
			}
			return
		}

		this.processing = true

		// Update booking with customer details
		bookingContext.set(
			{
				userName: this.formData.name,
				customerEmail: this.formData.email,
				customerPhone: this.formData.phoneNumber,
				customerAddress: {
					street: this.formData.address,
					city: this.formData.city,
					postalCode: this.formData.postalCode,
					country: this.formData.country,
				},
			},
			true,
		)

		// Process payment with anonymous auth if user isn't already authenticated
		from(
			this.auth.currentUser ? Promise.resolve({ user: { uid: this.auth.currentUser.uid } }) : signInAnonymously(auth),
		)
			.pipe(
				map(userCredential => userCredential.user.uid),
				tap(uid => {
					// Update booking with user ID
					bookingContext.set(
						{
							userId: uid,
						},
						true,
					)
				}),
				switchMap(uid => {
					// Prepare payment data with the correct structure
					const paymentData = {
						amount: Math.round(this.booking.price * 100), // Convert to cents
						currency: 'eur',
						email: this.formData.email,
						name: this.formData.name,
						phone: this.formData.phoneNumber,
						address: this.formData.address,
						postalCode: this.formData.postalCode,
						city: this.formData.city,
						country: this.formData.country,
						courtId: this.booking.courtId,
						eventID: this.booking.id || 'court-booking',
						uid: uid,
						bookingId: this.booking.id,
						date: this.booking.date,
						startTime: this.booking.startTime,
						endTime: this.booking.endTime,
					}

					return createPaymentIntent(paymentData).pipe(
						retry({ count: 3, delay: 1000 }), // Retry up to 3 times with 1 second delay
						switchMap((res: any) =>
							from(
								stripe.confirmPayment({
									clientSecret: res.clientSecret,
									elements,
									confirmParams: {
										payment_method_data: {
											billing_details: {
												name: this.formData.name,
												email: this.formData.email,
												phone: this.formData.phoneNumber,
												address: {
													country: this.formData.country,
													state: this.formData.city,
													city: this.formData.city,
													line1: this.formData.address,
													postal_code: this.formData.postalCode,
												},
											},
										},
										return_url: location.href,
										receipt_email: this.formData.email,
									},
								}),
							).pipe(
								catchError(e => {
									console.error('Payment confirmation error:', e)
									throw e
								}),
								map(res => {
									if (res.error) {
										throw res.error
									}
									return res
								}),
							),
						),
					)
				}),
			)
			.subscribe({
				next: () => {
					this.processing = false
				},
				error: error => this.handlePaymentError(error),
			})
	}

	private handlePaymentError(error: any) {
		this.processing = false

		console.error('Payment error details:', error)

		if (error.type === 'card_error' || error.type === 'validation_error') {
			$notify.error('Payment failed: ' + (error.message || 'Card declined'))
		} else if (error.message && error.message.includes('Network')) {
			$notify.error('Network error. Please check your internet connection and try again.')
		} else if (error.code === 'resource_missing') {
			$notify.error('Payment not processed. Please try again.')
		} else {
			$notify.error('Something went wrong with the payment. Please try again.')
		}
	}

	// Validate the form
	private validateForm(): boolean {
		let isValid = true
		const newFormValidity = { ...this.formValidity }

		// Check required fields
		const requiredFields = ['name', 'email', 'phoneNumber', 'address', 'postalCode', 'city', 'country']

		requiredFields.forEach(field => {
			const value = this.formData[field as keyof BookingFormData]
			const fieldValid = !!value && (value as string).trim() !== ''
			newFormValidity[field] = fieldValid
			isValid = isValid && fieldValid
		})

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		const validEmailFormat = emailRegex.test(this.formData.email)
		newFormValidity.emailFormat = validEmailFormat
		isValid = isValid && validEmailFormat

		// Validate phone number format (basic check)
		const phoneValid = this.formData.phoneNumber.trim().length >= 6
		newFormValidity.phoneValid = phoneValid
		isValid = isValid && phoneValid

		// Validate postal code (basic length check)
		const postalCodeValid = this.formData.postalCode.trim().length >= 3
		newFormValidity.postalCodeValid = postalCodeValid
		isValid = isValid && postalCodeValid

		// Update form validity state
		this.formValidity = newFormValidity

		// Show specific error message based on what failed
		if (!isValid) {
			if (!validEmailFormat) {
				$notify.error('Please enter a valid email address.')
			} else if (!phoneValid) {
				$notify.error('Please enter a valid phone number.')
			} else if (!postalCodeValid) {
				$notify.error('Please enter a valid postal code.')
			} else {
				$notify.error('Please fill in all required fields.')
			}
		}

		return isValid
	}

	// Handle successful booking
	private renderSuccessMessage() {
		return html`
			<div class="p-6 bg-success-container text-success-on rounded-lg text-center">
				<schmancy-icon class="text-6xl mb-4">check_circle</schmancy-icon>
				<schmancy-typography type="headline" token="md" class="mb-2">Booking Confirmed!</schmancy-typography>
				<schmancy-typography class="mb-4">
					Your booking for ${dayjs(this.booking.date).format('ddd, MMM D')} at
					${dayjs(this.booking.startTime).format('h:mm A')} has been confirmed.
				</schmancy-typography>

				<schmancy-typography type="label" token="sm">
					A confirmation email has been sent to ${this.formData.email}
				</schmancy-typography>

				<div class="mt-6">
					<schmancy-button
						variant="filled"
						@click=${() => {
							// Reset booking data and go back to step 1
							bookingContext.set({
								id: '',
								courtId: '',
								date: '',
								startTime: '',
								endTime: '',
								price: 0,
							})
							window.location.href = '/' // Redirect to home
						}}
					>
						Book Another Court
					</schmancy-button>
				</div>
			</div>
		`
	}

	render() {
		// let durationIn = 'minutes'
		// let duration = dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minutes')
		// // if duration >= 60 minutes, show duration in hours
		// if (duration >= 60) {
		// 	durationIn = duration > 60 ? 'hours' : 'hour'
		// 	duration = duration / 60
		// }

		// Show success message if booking is successful
		if (this.success) {
			return this.renderSuccessMessage()
		}

		return html`
			<schmancy-form class="px-2" .hidden=${this.validationPaymentResponse} @submit=${this.processPaymentBooking}>
				${when(
					this.processing,
					() => html`
						<schmancy-busy class="z-50">
							<schmancy-flex flow="row" gap="sm" align="center" class="p-6 bg-surface-container rounded-lg shadow-md">
								<schmancy-spinner class="h-12 w-12" size="48px"></schmancy-spinner>
								<schmancy-flex flow="col" gap="sm">
									<schmancy-typography type="title" token="sm">Processing Payment</schmancy-typography>
									<schmancy-typography type="body" token="sm">
										Please don't close this window. We're processing your payment and securing your court booking.
									</schmancy-typography>
								</schmancy-flex>
							</schmancy-flex>
						</schmancy-busy>
					`,
				)}
				<schmancy-grid gap="sm" class="w-full">
					<!-- Personal Information -->
					<schmancy-surface type="containerLow" rounded="all" class="p-4 mb-4">
						<schmancy-typography type="title" token="sm" class="mb-4">Personal Information</schmancy-typography>

						<schmancy-grid gap="md" class="grid-cols-1 sm:grid-cols-2 gap-4">
							<schmancy-input
								.autocomplete=${'given-name'}
								.value=${this.formData.name}
								required
								.error=${!this.formValidity.name}
								type="text"
								class="w-full"
								placeholder="Full Name"
								@change=${(e: any) => {
									this.formData.name = e.detail.value
									this.formValidity.name = !!e.detail.value
								}}
							></schmancy-input>

							<schmancy-input
								.autocomplete=${'tel'}
								.value=${this.formData.phoneNumber}
								required
								.error=${!this.formValidity.phoneNumber}
								type="tel"
								class="w-full"
								placeholder="Phone Number"
								@change=${(e: any) => {
									this.formData.phoneNumber = e.detail.value
									this.formValidity.phoneNumber = !!e.detail.value
								}}
							></schmancy-input>
						</schmancy-grid>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
							<schmancy-input
								.autocomplete=${'email'}
								.value=${this.formData.email}
								required
								.error=${!this.formValidity.email}
								type="email"
								placeholder="Email Address"
								@change=${(e: any) => {
									this.formData.email = e.detail.value
									this.formValidity.email = !!e.detail.value
									this.emailsMatch = this.formData.email === this.formData.repeatEmail
								}}
							></schmancy-input>
						</div>
					</schmancy-surface>

					<!-- Billing Information -->
					<schmancy-surface type="containerLow" rounded="all" class="p-4 mb-4">
						<schmancy-typography type="title" token="sm" class="mb-4">Billing Address</schmancy-typography>

						<schmancy-input
							.autocomplete=${'address-line1'}
							.value=${this.formData.address}
							required
							.error=${!this.formValidity.address}
							type="text"
							class="w-full mb-4"
							placeholder="Street Address"
							@change=${(e: any) => {
								this.formData.address = e.detail.value
								this.formValidity.address = !!e.detail.value
							}}
						></schmancy-input>

						<div class="grid grid-cols-2 gap-4 mb-4">
							<schmancy-input
								.autocomplete=${'postal-code'}
								.value=${this.formData.postalCode}
								required
								.error=${!this.formValidity.postalCode}
								type="text"
								placeholder="Postal Code"
								@change=${(e: any) => {
									this.formData.postalCode = e.detail.value
									this.formValidity.postalCode = !!e.detail.value
								}}
							></schmancy-input>

							<schmancy-input
								.autocomplete=${'address-level2'}
								.value=${this.formData.city}
								required
								.error=${!this.formValidity.city}
								type="text"
								placeholder="City"
								@change=${(e: any) => {
									this.formData.city = e.detail.value
									this.formValidity.city = !!e.detail.value
								}}
							></schmancy-input>
						</div>

						<schmancy-input
							.autocomplete=${'country-name'}
							.value=${this.formData.country}
							required
							.error=${!this.formValidity.country}
							type="text"
							class="w-full"
							placeholder="Country"
							@change=${(e: any) => {
								this.formData.country = e.detail.value
								this.formValidity.country = !!e.detail.value
							}}
						></schmancy-input>
					</schmancy-surface>

					<!-- Payment Details -->
					<schmancy-surface type="containerLow" rounded="all" class="p-4 mb-4">
						<schmancy-typography type="title" token="sm" class="mb-4">Payment Details</schmancy-typography>

						<div class="mb-3">
							<section class="relative block">
								<slot name="stripe-element"></slot>
							</section>
						</div>
					</schmancy-surface>

					<!-- Terms & Submit Button -->
					<schmancy-grid class="mb-2" gap="sm" justify="end">
						<schmancy-typography type="label" class="col-span-1" align="left">
							<span>
								By clicking Pay you agree to

								<a
									class="text-sky-700 underline"
									href="javascript:void(0)"
									@click=${() => {
										sheet.open({
											component: new FunkhausSportsTermsAndConditions(),
										})
									}}
									>our terms and conditions</a
								>
							</span>
						</schmancy-typography>

						<div class="flex justify-between items-center w-full mt-4">
							<schmancy-typography class="text-secondary-default" type="title">
								Total: &euro;${this.booking.price.toFixed(2)}
								<div class="text-xs text-surface-on-variant">Includes: 7% VAT</div>
							</schmancy-typography>

							<schmancy-button class="h-[3rem]" type="submit" variant="filled">
								<schmancy-typography class="px-4" type="title" token="lg"> Pay Now </schmancy-typography>
							</schmancy-button>
						</div>
					</schmancy-grid>
				</schmancy-grid>
			</schmancy-form>

			${when(
				this.processing,
				() => html`
					<schmancy-busy class="z-50">
						<schmancy-flex flow="row" gap="sm" align="center">
							<schmancy-spinner class="h-12 w-12" size="48px"></schmancy-spinner>
							<schmancy-typography>Processing payment...</schmancy-typography>
						</schmancy-flex>
					</schmancy-busy>
				`,
			)}
		`
	}
}
