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

	@state() processing = false
	@state() error: string | null = null
	@state() formValidity: Record<string, boolean> = {}

	// Services
	private bookingService = new BookingService()
	private stripe: Stripe | null = null
	private elements?: StripeElements

	// For error handling
	paymentIntentId?: string

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Set default country if not set
		if (!this.booking.customerAddress?.country) {
			bookingContext.set(
				{
					customerAddress: {
						...this.booking.customerAddress,
						country: 'DE', // Default to Germany
					},
				},
				true,
			)
		}

		// Initialize Stripe elements
		$stripeElements.subscribe(elements => {
			this.elements = elements
		})

		this.initializeStripe()
	}

	/**
	 * Initialize Stripe for payment processing
	 */
	private async initializeStripe() {
		try {
			const stripePromise = import('src/public/stripe').then(module => module.default)
			this.stripe = await stripePromise

			if (!this.stripe) {
				this.setError('Unable to initialize payment system')
			}
		} catch (error) {
			console.error('Error initializing Stripe:', error)
			this.setError('Payment system initialization failed')
		}
	}

	/**
	 * Process payment when form is submitted
	 */
	async processPayment(e: Event) {
		e.preventDefault()

		if (!this.validateForm()) {
			return
		}

		if (!this.stripe || !this.elements) {
			this.setError('Payment processing is not available. Please try again later.')
			return
		}

		// Start processing
		this.processing = true
		this.error = null

		// Validate Stripe payment form
		const { error } = await this.elements.submit()

		if (error) {
			this.processing = false
			this.handleStripeValidationError(error)
			return
		}

		// Use existing ID or generate a guest ID
		const userId = auth.currentUser?.uid || `guest-${this.generateUUID()}`

		// Update booking with user ID if not already set
		if (!this.booking.userId) {
			bookingContext.set({ userId }, true)
		}

		this.processStripePayment(userId)
	}

	/**
	 * Handle validation errors from Stripe
	 */
	private handleStripeValidationError(error: any) {
		if (error.type === 'card_error' || error.type === 'validation_error') {
			this.setError(error.message || 'Card validation failed')
		} else {
			this.setError('Something went wrong with the payment form, please try again.')
		}
	}

	/**
	 * Set error and show notification
	 */
	private setError(message: string) {
		this.error = message
		$notify.error(message)
	}

	/**
	 * Generate a UUID for guest users and booking IDs
	 */
	private generateUUID(): string {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			const r = (Math.random() * 16) | 0,
				v = c === 'x' ? r : (r & 0x3) | 0x8
			return v.toString(16)
		})
	}

	/**
	 * Process payment with Stripe and create booking
	 */
	private processStripePayment(userId: string) {
		// Use existing ID or generate new one
		const bookingId = this.booking.id || `booking-${this.generateUUID()}`

		// Ensure booking ID is set in context
		if (!this.booking.id) {
			bookingContext.set({ id: bookingId }, true)
		}

		// Create booking data
		const bookingData: Booking = {
			...this.booking,
			id: bookingId,
			userId: userId,
			paymentStatus: 'pending',
		}

		// Payment data for Stripe
		const paymentData = this.preparePaymentData(bookingData)

		// First create booking, then process payment
		from(this.bookingService.createBooking(bookingData))
			.pipe(
				switchMap(createdBooking => {
					console.log('Booking created:', createdBooking)
					bookingContext.set(createdBooking)

					return from(createPaymentIntent(paymentData)).pipe(
						switchMap(response => {
							this.paymentIntentId = response.paymentIntentId

							if (!this.stripe || !this.elements) {
								throw new Error('Payment system not available')
							}

							return from(this.confirmStripePayment(response.clientSecret, bookingId))
						}),
					)
				}),
				catchError(error => {
					console.error('Payment or booking error:', error)
					this.setError(this.getReadableErrorMessage(error))
					return of(null)
				}),
				finalize(() => {
					this.processing = false
				}),
			)
			.subscribe(result => {
				if (result?.error) {
					this.setError(this.getReadableErrorMessage(result.error))
				} else if (!result) {
					// Error was already handled
				} else {
					// For successful payments that don't redirect
					this.dispatchEvent(
						new CustomEvent('booking-complete', {
							detail: { booking: this.booking },
							bubbles: true,
						}),
					)
				}
			})
	}

	/**
	 * Prepare payment data for Stripe
	 */
	private preparePaymentData(booking: Booking) {
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
	 * Confirm payment with Stripe
	 */
	private confirmStripePayment(clientSecret: string, bookingId: string) {
		return this.stripe!.confirmPayment({
			clientSecret,
			elements: this.elements!,
			confirmParams: {
				payment_method_data: {
					billing_details: {
						name: this.booking.userName || '',
						email: this.booking.customerEmail || '',
						phone: this.booking.customerPhone || '',
						address: {
							country: this.booking.customerAddress?.country || '',
							state: this.booking.customerAddress?.city || '',
							city: this.booking.customerAddress?.city || '',
							line1: this.booking.customerAddress?.street || '',
							line2: '',
							postal_code: this.booking.customerAddress?.postalCode || '',
						},
					},
				},
				return_url: `${window.location.href.split('?')[0]}?booking=${bookingId}`,
				receipt_email: this.booking.customerEmail || '',
			},
		})
	}

	/**
	 * Provide user-friendly error messages
	 */
	private getReadableErrorMessage(error: any): string {
		if (!error) return 'Something went wrong with the payment. Please try again.'

		if (error.type === 'card_error') {
			return error.message || 'Your card was declined. Please try another payment method.'
		}

		if (error.type === 'validation_error') {
			return error.message || 'Please check your card details and try again.'
		}

		if (error.message?.includes('Network')) {
			return 'Network error. Please check your internet connection and try again.'
		}

		if (error.code === 'resource_missing') {
			return 'Payment not processed. Please try again.'
		}

		if (error.message?.includes('auth/')) {
			return 'Unable to authenticate. You can continue as a guest.'
		}

		return 'Something went wrong with the payment. Please try again.'
	}

	/**
	 * Validate form fields
	 */
	private validateForm(): boolean {
		const requiredFields = [
			{ key: 'userName', label: 'Name' },
			{ key: 'customerEmail', label: 'Email' },
			{ key: 'customerPhone', label: 'Phone number' },
			{ key: 'customerAddress.street', label: 'Street address' },
			{ key: 'customerAddress.postalCode', label: 'Postal code' },
			{ key: 'customerAddress.city', label: 'City' },
			{ key: 'customerAddress.country', label: 'Country' },
		]

		let isValid = true
		const newFormValidity: Record<string, boolean> = {}
		const missingFields: string[] = []

		// Check each required field
		for (const field of requiredFields) {
			// Handle nested properties like customerAddress.street
			let value
			if (field.key.includes('.')) {
				const [obj, prop] = field.key.split('.')

				if (obj === 'customerAddress' && this.booking.customerAddress) {
					value = this.booking.customerAddress[prop as keyof typeof this.booking.customerAddress]
				} else {
					value = undefined
				}
			} else {
				value = this.booking[field.key as keyof Booking]
			}

			const fieldValid = !!value && (typeof value === 'string' ? value.trim() !== '' : true)
			newFormValidity[field.key] = fieldValid

			if (!fieldValid) {
				missingFields.push(field.label)
				isValid = false
			}
		}

		// Email format validation
		if (this.booking.customerEmail) {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
			const validEmailFormat = emailRegex.test(this.booking.customerEmail)
			newFormValidity.emailFormat = validEmailFormat

			if (!validEmailFormat) {
				this.setError('Please enter a valid email address.')
				this.formValidity = newFormValidity
				return false
			}
		}

		// Phone validation
		if (this.booking.customerPhone) {
			const phoneValid = this.booking.customerPhone.trim().length >= 6
			newFormValidity.phoneValid = phoneValid

			if (!phoneValid) {
				this.setError('Please enter a valid phone number.')
				this.formValidity = newFormValidity
				return false
			}
		}

		// Postal code validation
		if (this.booking.customerAddress?.postalCode) {
			const postalCodeValid = this.booking.customerAddress.postalCode.trim().length >= 3
			newFormValidity.postalCodeValid = postalCodeValid

			if (!postalCodeValid) {
				this.setError('Please enter a valid postal code.')
				this.formValidity = newFormValidity
				return false
			}
		}

		// Update form validity state
		this.formValidity = newFormValidity

		// Show missing fields error if any
		if (!isValid && missingFields.length > 0) {
			this.setError(`Please fill in the following required fields: ${missingFields.join(', ')}`)
		} else {
			this.error = null
		}

		return isValid
	}

	/**
	 * Update booking context directly when form values change
	 */
	private updateBookingField(field: string, value: string): void {
		// Handle nested properties (e.g., customerAddress.street)
		if (field.includes('.')) {
			const [obj, prop] = field.split('.')

			if (obj === 'customerAddress') {
				bookingContext.set(
					{
						customerAddress: {
							...this.booking.customerAddress,
							[prop]: value,
						},
					},
					true,
				)
			}
		} else {
			bookingContext.set(
				{
					[field]: value,
				},
				true,
			)
		}
	}

	/**
	 * Show terms and conditions modal
	 */
	private showTerms(e: Event) {
		e.preventDefault()
		sheet.open({
			component: new FunkhausSportsTermsAndConditions(),
		})
	}

	render() {
		return html`
			<schmancy-form @submit=${this.processPayment}>
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
						<div class="bg-error-container text-error-onContainer rounded-lg p-4 mb-4">
							<schmancy-flex align="center" gap="sm">
								<schmancy-icon>error</schmancy-icon>
								<schmancy-typography>${this.error}</schmancy-typography>
							</schmancy-flex>
						</div>
					`,
				)}

				<schmancy-grid gap="sm" class="w-full">
					<!-- Personal Information -->
					<schmancy-grid gap="sm" class="grid-cols-1 sm:grid-cols-2 gap-4 px-2">
						<schmancy-input
							autocomplete="name"
							.value=${this.booking.userName || ''}
							required
							.error=${this.formValidity['userName'] === false}
							type="text"
							class="w-full"
							placeholder="Full Name"
							@change=${(e: any) => this.updateBookingField('userName', e.detail.value)}
						></schmancy-input>

						<schmancy-input
							autocomplete="tel"
							.value=${this.booking.customerPhone || ''}
							required
							.error=${this.formValidity['customerPhone'] === false}
							type="tel"
							class="w-full"
							placeholder="Phone Number"
							@change=${(e: any) => this.updateBookingField('customerPhone', e.detail.value)}
						></schmancy-input>
					</schmancy-grid>

					<schmancy-grid class="px-2">
						<schmancy-input
							autocomplete="email"
							.value=${this.booking.customerEmail || ''}
							required
							.error=${this.formValidity['customerEmail'] === false || this.formValidity['emailFormat'] === false}
							type="email"
							placeholder="Email Address"
							@change=${(e: any) => this.updateBookingField('customerEmail', e.detail.value)}
						></schmancy-input>
					</schmancy-grid>
					<!-- Billing Information -->
					<schmancy-grid class="px-2" gap="sm">
						<schmancy-input
							autocomplete="street-address"
							.value=${this.booking.customerAddress?.street || ''}
							required
							.error=${this.formValidity['customerAddress.street'] === false}
							type="text"
							class="w-full"
							placeholder="Street Address"
							@change=${(e: any) => this.updateBookingField('customerAddress.street', e.detail.value)}
						></schmancy-input>

						<div class="grid grid-cols-2 gap-2">
							<schmancy-input
								autocomplete="postal-code"
								.value=${this.booking.customerAddress?.postalCode || ''}
								required
								.error=${this.formValidity['customerAddress.postalCode'] === false}
								type="text"
								placeholder="Postal Code"
								@change=${(e: any) => this.updateBookingField('customerAddress.postalCode', e.detail.value)}
							></schmancy-input>

							<schmancy-input
								autocomplete="address-level2"
								.value=${this.booking.customerAddress?.city || ''}
								required
								.error=${this.formValidity['customerAddress.city'] === false}
								type="text"
								placeholder="City"
								@change=${(e: any) => this.updateBookingField('customerAddress.city', e.detail.value)}
							></schmancy-input>
						</div>

						<schmancy-autocomplete
							.autocomplete=${'country-name'}
							required
							@change=${(e: SchmancyAutocompleteChangeEvent) => {
								this.updateBookingField('customerAddress.country', e.detail.value as string)
							}}
							placeholder="Country"
							.value=${this.booking.customerAddress?.country || ''}
						>
							${repeat(
								countries,
								c => c.code,
								c => html` <schmancy-option .label=${c.name ?? ''} .value=${c.code ?? 0}> ${c.name} </schmancy-option>`,
							)}
						</schmancy-autocomplete>
					</schmancy-grid>

					<!-- Payment Details -->
					<schmancy-surface type="containerLow" rounded="all">
						<div class="mb-3 px-2">
							<section class="relative block">
								<slot name="stripe-element"></slot>
							</section>
						</div>
					</schmancy-surface>

					<!-- Terms & Submit Button -->
					<schmancy-grid class="pr-4" gap="sm" justify="end">
						<schmancy-grid cols="1fr" justify="end">
							<schmancy-typography type="label" class="col-span-1" align="left">
								<span>
									By clicking Pay you agree to

									<a class="text-sky-700 underline" href="javascript:void(0)" @click=${this.showTerms}
										>our terms and conditions</a
									>
								</span>
							</schmancy-typography>
							<schmancy-typography class="mb-0" type="label"> Includes: 7% VAT </schmancy-typography>
						</schmancy-grid>
						<schmancy-button class="h-[3rem] pb-2" type="submit" variant="filled">
							<schmancy-typography class="px-4" type="title" token="lg">
								Pay &euro;${this.booking.price.toFixed(2)}
							</schmancy-typography>
						</schmancy-button>
					</schmancy-grid>
				</schmancy-grid>
			</schmancy-form>
		`
	}
}
