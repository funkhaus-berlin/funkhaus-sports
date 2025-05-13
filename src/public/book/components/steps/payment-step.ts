// src/public/book/steps/payment-step.ts

import { $notify, SchmancyAutocompleteChangeEvent, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { Stripe, StripeElements } from '@stripe/stripe-js'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { distinctUntilChanged, filter, map, Subscription, takeUntil } from 'rxjs'
import countries from 'src/assets/countries'
import { Court } from 'src/db/courts.collection'
import stripePromise, { $stripeElements } from 'src/public/stripe'
import { FunkhausSportsTermsAndConditions } from '../../../shared/components/terms-and-conditions'
import { transitionToNextStep } from '../../booking-steps-utils'
import { Booking, bookingContext, BookingProgressContext, BookingStep } from '../../context'
import { FormValidator } from '../../form-validator'
import { PaymentService } from '../../payment-service'

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
	@state() formValidity: Record<string, boolean> = {}
	@state() isActive = false
	@state() isTransitioning = false

	// Services
	private formValidator = new FormValidator()
	private paymentService = new PaymentService()

	// Stripe integration
	private stripe: Stripe | null = null
	private elements?: StripeElements
	private _elementsSubscription?: Subscription
	private _processingSubscription?: Subscription

	// Lifecycle methods

	connectedCallback() {
		super.connectedCallback()
		
		// Add subscription to BookingProgressContext to track active state
		BookingProgressContext.$.pipe(
			takeUntil(this.disconnecting),
			map(progress => progress.currentStep),
			distinctUntilChanged(),
			map(x => {
				// Find the position of Payment step in the steps array
      const paymentStepIndex = BookingProgressContext.value.steps.findIndex(s => s.step === BookingStep.Payment)
				
				// Check if this position matches the current step
				return x === paymentStepIndex
			}),
			filter(() => !this.isTransitioning),
		).subscribe(isActive => {
			// Set transitioning flag to enable smooth animations
			this.isTransitioning = true
			
			// Update active state
			this.isActive = isActive
			
			// Reset transitioning flag after animation time
			setTimeout(() => {
				this.isTransitioning = false
				this.requestUpdate()
			}, 350)
			
			this.requestUpdate()
		})
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Set default country if not set
		this.setDefaultCountry()

		// Initialize Stripe elements
		this.initializeStripe()

		// Subscribe to processing state changes
		this._processingSubscription = this.paymentService.processing$.subscribe(isProcessing => {
			this.processing = isProcessing
		})
	}

	disconnectedCallback(): void {
		super.disconnectedCallback()

		// Clean up subscriptions
		if (this._elementsSubscription) {
			this._elementsSubscription.unsubscribe()
		}

		if (this._processingSubscription) {
			this._processingSubscription.unsubscribe()
		}

		// Cancel any ongoing payment processing
		this.paymentService.cancelProcessing()
	}

	// Setup methods

	private setDefaultCountry(): void {
		if (!this.booking.customerAddress?.country) {
			bookingContext.set(
				{
					customerAddress: {
						street: this.booking.customerAddress && typeof this.booking.customerAddress.street === 'string' ? this.booking.customerAddress.street : '',
						city: this.booking.customerAddress && typeof this.booking.customerAddress.city === 'string' ? this.booking.customerAddress.city : '',
						postalCode: this.booking.customerAddress && typeof this.booking.customerAddress.postalCode === 'string' ? this.booking.customerAddress.postalCode : '',
						country: this.booking.customerAddress && typeof this.booking.customerAddress.country === 'string' ? this.booking.customerAddress.country : 'DE', // Default to Germany
					},
				},
				true,
			)
		}
	}

	private async initializeStripe(): Promise<void> {
		try {
			// Initialize Stripe instance
			this.stripe = await stripePromise

			// Subscribe to Stripe elements
			this._elementsSubscription = $stripeElements.subscribe(elements => {
				this.elements = elements
			})
		} catch (error) {
			console.error('Error initializing Stripe:', error)
		}
	}

	// Event handlers

	/**
	 * Process payment when form is submitted
	 */
	async processPayment(e: Event): Promise<void> {
		e.preventDefault()

		// Validate form
		if (!this.formValidator.validateForm(this.booking)) {
			// Validation failed, error already set by validator
			this.formValidity = this.formValidator.formValidity
			return
		}

		// Update local form validity state
		this.formValidity = this.formValidator.formValidity

		// Check if Stripe is ready
		if (!this.stripe || !this.elements) {
			$notify.error('Payment processing is not available. Please try again later.')
			return
		}

		// Validate Stripe elements
		const { error } = await this.elements.submit()
		if (error) {
			// Let Stripe handle validation errors directly
			console.error('Stripe validation error:', error)
			return
		}

		// Process payment (let Stripe handle any payment errors)
		this.paymentService.processPayment(this.booking, this.stripe, this.elements).subscribe((result: any) => {
			if (result.success) {
				// Transition to the next step (from Payment to completion)
				transitionToNextStep('Payment')
				
				// Also dispatch the booking-complete event for backward compatibility
				this.dispatchEvent(
					new CustomEvent('booking-complete', {
						detail: { booking: result.booking },
						bubbles: true,
					}),
				)
			}
		})
	}

	/**
	 * Update booking context when form values change
	 */
	private updateBookingField(field: string, value: string): void {
		// Handle nested properties (e.g., customerAddress.street)
		if (field.includes('.')) {
			const [obj, prop] = field.split('.')

			if (obj === 'customerAddress') {
				bookingContext.set(
					{
						customerAddress: {
							...this.booking.customerAddress!,
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
	private showTerms(e: Event): void {
		e.preventDefault()
		sheet.open({
			component: new FunkhausSportsTermsAndConditions(),
		})
	}

	render() {
		return html`
			${when(
				this.processing,
				() => html`
					<div
						class="fixed inset-0 z-50  bg-opacity-70 backdrop-blur-sm flex items-center justify-center transition-opacity duration-300"
					>
						<schmancy-flex flow="row" gap="sm" align="center" class="p-6 rounded-lg" justify="center">
							<schmancy-spinner class="h-12 w-12" size="48px"></schmancy-spinner>
							<schmancy-flex justify="center" align="center" flow="col" gap="sm" class="max-w-md">
								<schmancy-typography type="title" token="sm">Processing Payment</schmancy-typography>
								<schmancy-typography type="body" token="sm"> Please don't close this window. </schmancy-typography>
							</schmancy-flex>
						</schmancy-flex>
					</div>
				`,
			)}
			<!-- Error display -->
			<div
				class="
					w-full bg-surface-low rounded-lg transition-all duration-300 p-2
					${this.isActive ? 'scale-100' : 'scale-95'}
				"
			>
				<!-- Title section when active -->
				${when(
					this.isActive,
					() => html`
						<div class="mb-3">
							<schmancy-typography align="left" type="label" token="lg" class="font-medium text-primary-default">
								Complete Payment
							</schmancy-typography>
							<div class="text-xs text-surface-on-variant mt-1">
								<span>Enter your details to complete the booking</span>
							</div>
						</div>
					`,
				)}

				<schmancy-form @submit=${this.processPayment} .inert=${this.processing}>
					<schmancy-grid class="w-full py-2 md:py-4 px-2" gap="sm">
						<!-- Personal Information -->
						<sch-input
							size="sm"
							autocomplete="name"
							.value=${this.booking.userName || ''}
							required
							.error=${!this.formValidator.isFieldValid('userName')}
							type="text"
							class="w-full"
							placeholder="Full Name"
							@change=${(e: any) => this.updateBookingField('userName', e.detail.value)}
						></sch-input>

						<schmancy-grid gap="sm" cols="1fr 1fr">
							<sch-input
								size="sm"
								autocomplete="email"
								.value=${this.booking.customerEmail || ''}
								required
								.error=${!this.formValidator.isFieldValid('customerEmail') ||
								!this.formValidator.isFieldValid('emailFormat')}
								type="email"
								placeholder="Email Address"
								@change=${(e: any) => this.updateBookingField('customerEmail', e.detail.value)}
							></sch-input>
							<sch-input
								size="sm"
								autocomplete="tel"
								.value=${this.booking.customerPhone || ''}
								required
								.error=${!this.formValidator.isFieldValid('customerPhone')}
								type="tel"
								class="w-full"
								placeholder="Phone Number"
								@change=${(e: any) => this.updateBookingField('customerPhone', e.detail.value)}
							></sch-input>
						</schmancy-grid>

						<!-- Billing Information -->
						<schmancy-grid gap="sm">
							<div class="grid grid-cols-3 gap-2">
								<sch-input
									size="sm"
									autocomplete="postal-code"
									.value=${this.booking.customerAddress?.postalCode || ''}
									required
									.error=${!this.formValidator.isFieldValid('customerAddress.postalCode')}
									type="text"
									placeholder="Postal Code"
									@change=${(e: any) => this.updateBookingField('customerAddress.postalCode', e.detail.value)}
								></sch-input>

								<sch-input
									size="sm"
									autocomplete="address-level2"
									.value=${this.booking.customerAddress?.city || ''}
									required
									.error=${!this.formValidator.isFieldValid('customerAddress.city')}
									type="text"
									placeholder="City"
									@change=${(e: any) => this.updateBookingField('customerAddress.city', e.detail.value)}
								></sch-input>
								<schmancy-autocomplete
									size="sm"
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
										c =>
											html` <schmancy-option .label=${c.name ?? ''} .value=${c.code ?? 0}> ${c.name} </schmancy-option>`,
									)}
								</schmancy-autocomplete>
							</div>
						</schmancy-grid>

						<!-- Payment Details -->
						<section>
							<slot name="stripe-element"></slot>
						</section>

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
							<schmancy-button class="h-[3rem] pb-2" type="submit" variant="filled" ?disabled=${this.processing}>
								<schmancy-typography class="px-4" type="title" token="lg">
									Pay &euro;${this.booking.price.toFixed(2)}
								</schmancy-typography>
							</schmancy-button>
						</schmancy-grid>
					</schmancy-grid>
				</schmancy-form>
			</div>
		`
	}
}
