// src/public/book/components/checkout-form.ts

import { $notify, SchmancyAutocompleteChangeEvent, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { Stripe, StripeElements } from '@stripe/stripe-js'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { catchError, finalize, from, of, switchMap } from 'rxjs'
import countries from 'src/assets/countries'
import { BookingService } from 'src/bookingServices/booking.service'
import { Court } from 'src/db/courts.collection'
import { BookingFormData } from 'src/db/interface'
import { auth } from 'src/firebase/firebase'
import { $stripeElements, createPaymentIntent } from 'src/public/stripe'
import { Booking, bookingContext } from '../context'
import { FunkhausSportsTermsAndConditions } from '../terms-and-conditions'

/**
 * Checkout form component with Stripe integration
 * Handles customer information collection and payment processing
 */
@customElement('funkhaus-checkout-form')
export class CheckoutForm extends $LitElement() {
	@property({ type: Object }) booking!: Booking
	@property({ type: Object }) selectedCourt?: Court
	@property({ attribute: false }) onBookingComplete?: (booking: Booking) => void

	@state() formData = new BookingFormData()
	@state() processing = false
	@state() error: string | null = null
	@state() success: boolean = false
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
	private stripe: Stripe | null = null
	private elements?: StripeElements

	// Keep track of payment intent for error handling
	paymentIntentId?: string

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Set default country if not set
		if (!this.formData.country) {
			this.formData.country = 'DE' // Default to Germany
		}

		// Set elements from context
		$stripeElements.subscribe(elements => {
			this.elements = elements
		})

		// Initialize Stripe
		this.initializeStripe()
	}

	// Initialize Stripe
	private async initializeStripe() {
		try {
			const stripePromise = import('src/public/stripe').then(module => module.default)
			this.stripe = await stripePromise

			if (!this.stripe) {
				this.error = 'Unable to initialize payment system'
				$notify.error(this.error)
			}
		} catch (error) {
			console.error('Error initializing Stripe:', error)
			this.error = 'Payment system initialization failed'
			$notify.error(this.error)
		}
	}

	// Process payment and create booking
	async processPayment(e: Event) {
		e.preventDefault()

		// First, validate the form
		if (!this.validateForm()) {
			return
		}

		const elements = this.elements
		const stripe = this.stripe

		if (!stripe || !elements) {
			this.error = 'Payment processing is not available. Please try again later.'
			$notify.error(this.error)
			return
		}

		// Validate payment form
		this.processing = true
		const { error } = await elements?.submit()

		if (error) {
			this.processing = false

			if (error.type === 'card_error' || error.type === 'validation_error') {
				this.error = error.message || 'Card validation failed'
				$notify.error(this.error)
			} else {
				this.error = 'Something went wrong, please try again.'
				$notify.error(this.error)
			}
			return
		}

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

		// Process payment without relying on anonymous auth
		// Use a random UUID for guest users
		const userId = auth.currentUser?.uid || `guest-${this.generateUUID()}`

		// Update booking with user ID
		bookingContext.set(
			{
				userId,
			},
			true,
		)

		this.processStripePayment(userId)
	}

	// Generate a UUID for guest users
	private generateUUID(): string {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			const r = (Math.random() * 16) | 0,
				v = c === 'x' ? r : (r & 0x3) | 0x8
			return v.toString(16)
		})
	}

	// Process the Stripe payment
	private processStripePayment(userId: string) {
		// First generate a booking ID if we don't have one yet
		const bookingId = this.booking.id || `booking-${this.generateUUID()}`

		// Update booking context with the ID and customer details
		bookingContext.set(
			{
				id: bookingId,
			},
			true,
		)

		// Create the booking first
		const bookingData: Booking = {
			...this.booking,
			id: bookingId,
			userName: this.formData.name,
			customerEmail: this.formData.email,
			customerPhone: this.formData.phoneNumber,
			customerAddress: {
				street: this.formData.address,
				city: this.formData.city,
				postalCode: this.formData.postalCode,
				country: this.formData.country,
			},
			userId: userId,
			paymentStatus: 'pending',
		}

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
			eventID: 'court-booking',
			uid: userId,
			bookingId: bookingId, // Always use a booking ID
			date: this.booking.date,
			startTime: this.booking.startTime,
			endTime: this.booking.endTime,
		}

		// First create the booking, then process payment
		from(this.bookingService.createBooking(bookingData))
			.pipe(
				switchMap(createdBooking => {
					console.log('Booking created:', createdBooking)

					// Update booking context with the created booking
					bookingContext.set(createdBooking)

					// Now process the payment with Stripe
					return from(createPaymentIntent(paymentData)).pipe(
						switchMap(response => {
							this.paymentIntentId = response.paymentIntentId

							if (!this.stripe || !this.elements) {
								throw new Error('Payment system not available')
							}

							return from(
								this.stripe.confirmPayment({
									clientSecret: response.clientSecret,
									elements: this.elements,
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
													line2: '',
													postal_code: this.formData.postalCode,
												},
											},
										},
										return_url: `${window.location.href.split('?')[0]}?booking=${bookingId}`,
										receipt_email: this.formData.email,
									},
								}),
							)
						}),
					)
				}),
				catchError(error => {
					console.error('Payment or booking error:', error)
					this.error = this.getReadableErrorMessage(error)
					$notify.error(this.error)
					return of(null)
				}),
				finalize(() => {
					this.processing = false
				}),
			)
			.subscribe(result => {
				if (result?.error) {
					this.error = this.getReadableErrorMessage(result.error)
					$notify.error(this.error)
				} else if (!result) {
					// Null result means we caught an error earlier
					console.log('Error already handled')
				} else {
					// For successful payments that don't redirect (rare), we can trigger completion here
					// But typically Stripe redirects to return_url
					this.dispatchEvent(
						new CustomEvent('booking-complete', {
							detail: { booking: this.booking },
							bubbles: true,
						}),
					)
				}
			})
	}

	// Provide more user-friendly error messages
	private getReadableErrorMessage(error: any): string {
		const defaultMessage = 'Something went wrong with the payment. Please try again.'

		if (!error) return defaultMessage

		if (error.type === 'card_error') {
			return error.message || 'Your card was declined. Please try another payment method.'
		}

		if (error.type === 'validation_error') {
			return error.message || 'Please check your card details and try again.'
		}

		if (error.message && error.message.includes('Network')) {
			return 'Network error. Please check your internet connection and try again.'
		}

		if (error.code === 'resource_missing') {
			return 'Payment not processed. Please try again.'
		}

		if (error.message && error.message.includes('auth/')) {
			return 'Unable to authenticate. You can continue as a guest.'
		}

		return defaultMessage
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
				this.error = 'Please enter a valid email address.'
				$notify.error(this.error)
			} else if (!phoneValid) {
				this.error = 'Please enter a valid phone number.'
				$notify.error(this.error)
			} else if (!postalCodeValid) {
				this.error = 'Please enter a valid postal code.'
				$notify.error(this.error)
			} else {
				this.error = 'Please fill in all required fields.'
				$notify.error(this.error)
			}
		} else {
			this.error = null
		}

		return isValid
	}

	// Show terms and conditions
	private showTerms(e: Event) {
		e.preventDefault()
		sheet.open({
			component: new FunkhausSportsTermsAndConditions(),
		})
	}

	render() {
		return html`
			<schmancy-form class="px-2" @submit=${this.processPayment}>
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

				<!-- Error display -->
				${when(
					this.error,
					() => html`
						<div class="bg-error-container text-error-on rounded-lg p-4 mb-4">
							<schmancy-flex align="center" gap="sm">
								<schmancy-icon>error</schmancy-icon>
								<schmancy-typography>${this.error}</schmancy-typography>
							</schmancy-flex>
						</div>
					`,
				)}

				<schmancy-grid gap="sm" class="w-full">
					<!-- Personal Information -->
					<schmancy-surface type="containerLow" rounded="all" class="p-4 mb-4">
						<schmancy-typography type="title" token="sm" class="mb-4">Personal Information</schmancy-typography>

						<schmancy-grid gap="md" class="grid-cols-1 sm:grid-cols-2 gap-4">
							<schmancy-input
								autocomplete="name"
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
								autocomplete="tel"
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
								autocomplete="email"
								.value=${this.formData.email}
								required
								.error=${!this.formValidity.email}
								type="email"
								placeholder="Email Address"
								@change=${(e: any) => {
									this.formData.email = e.detail.value
									this.formValidity.email = !!e.detail.value
								}}
							></schmancy-input>
						</div>
					</schmancy-surface>

					<!-- Billing Information -->
					<schmancy-surface type="containerLow" rounded="all" class="p-4 mb-4">
						<schmancy-typography type="title" token="sm" class="mb-4">Billing Address</schmancy-typography>

						<schmancy-input
							autocomplete="street-address"
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
								autocomplete="postal-code"
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
								autocomplete="address-level2"
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

						<schmancy-autocomplete
							.autocomplete=${'country-name'}
							required
							@change=${(e: SchmancyAutocompleteChangeEvent) => {
								console.log(e)
								this.formData.country = e.detail.value as string
								this.formValidity.country = !!e.detail.value
							}}
							placeholder="Country"
							.value=${this.formData.country}
						>
							${repeat(
								countries,
								c => c.code,
								c => html` <schmancy-option .label=${c.name ?? ''} .value=${c.code ?? 0}> ${c.name} </schmancy-option>`,
							)}
						</schmancy-autocomplete>
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
								<a class="text-sky-700 underline" href="javascript:void(0)" @click=${this.showTerms}
									>our terms and conditions</a
								>
							</span>
						</schmancy-typography>

						<div class="flex justify-between items-center w-full mt-4">
							<schmancy-typography class="text-secondary-default" type="title">
								Total: &euro;${this.booking.price.toFixed(2)}
								<div class="text-xs text-surface-on-variant">Includes: 7% VAT</div>
							</schmancy-typography>

							<schmancy-button class="h-[3rem]" type="submit" variant="filled" ?disabled=${this.processing}>
								<schmancy-typography class="px-4" type="title" token="lg">
									${this.processing ? 'Processing...' : 'Pay Now'}
								</schmancy-typography>
							</schmancy-button>
						</div>
					</schmancy-grid>
				</schmancy-grid>
			</schmancy-form>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-checkout-form': CheckoutForm
	}
}
