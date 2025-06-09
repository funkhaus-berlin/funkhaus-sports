// src/public/book/steps/payment-step.ts

import { $notify, SchmancyAutocompleteChangeEvent, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { Stripe, StripeElements } from '@stripe/stripe-js'
import dayjs from 'dayjs'
import { collection, doc, updateDoc } from 'firebase/firestore'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import {
	BehaviorSubject,
	catchError,
	delay,
	distinctUntilChanged,
	filter,
	finalize,
	from,
	interval,
	map,
	merge,
	of,
	startWith,
	Subscription,
	switchMap,
	takeUntil,
	tap,
} from 'rxjs'
import countries from '@shared/countries'
import { BookingService } from 'src/bookingServices/booking.service'
import { Court } from 'src/types/booking/court.types'
import { auth, db } from 'src/firebase/firebase'
import stripePromise, { $stripeElements } from 'src/public/stripe'
import '../../../booking-confirmation/booking-confirmation' // Import booking confirmation component
import { FunkhausSportsTermsAndConditions } from '../../../shared/components/terms-and-conditions'
import { createPaymentIntent } from '../../../stripe'
import { Booking, bookingContext, BookingProgressContext, BookingStep } from '../../context'
import { FormValidator } from '../../form-validator'
import '../booking-summery' // Import booking summary component
import '../booking-timer' // Import timer component

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
	@state() timerExpired = false

	// Services
	private formValidator = new FormValidator()
	private bookingService = new BookingService()

	// Stripe integration
	private stripe: Stripe | null = null
	private elements?: StripeElements
	private _elementsSubscription?: Subscription

	// Payment processing state
	private _processing = new BehaviorSubject<boolean>(false)
	private _processingLock: any = null

	// Lifecycle methods

	connectedCallback() {
		super.connectedCallback()

		// Track active state changes from BookingProgressContext
		const isActive$ = BookingProgressContext.$.pipe(
			map(progress => progress.currentStep),
			distinctUntilChanged(),
			map(currentStep => currentStep === BookingStep.Payment),
			filter(() => !this.isTransitioning),
			tap(isActive => {
				// Update state flags
				this.isTransitioning = true
				this.isActive = isActive

				// Reset timer expired state when becoming active
				if (isActive && this.timerExpired) {
					this.timerExpired = false
				}
			}),
			takeUntil(this.disconnecting),
		)

		// Handle transition animation completion
		const transitionComplete$ = isActive$.pipe(
			switchMap(() => of(null).pipe(delay(350))),
			tap(() => {
				this.isTransitioning = false
				this.requestUpdate()
			}),
		)

		// Handle lastActive updates when on payment page
		const lastActiveUpdates$ = isActive$.pipe(
			switchMap(isActive => {
				// Only update when active and booking is in holding status
				if (isActive && this.booking?.id && this.booking?.status === 'holding') {
					return interval(120000).pipe(
						// Update every 2 minutes
						startWith(0), // Update immediately when becoming active
						switchMap(() =>
							this.booking?.id
								? this.bookingService.updateLastActive(this.booking.id).pipe(
										catchError(err => {
											console.error('Failed to update lastActive:', err)
											return of(null)
										}),
									)
								: of(null),
						),
						takeUntil(this.disconnecting),
					)
				}
				return of(null) // Stop updates when not active
			}),
		)

		// Merge all subscriptions into a single pipeline
		merge(isActive$.pipe(tap(() => this.requestUpdate())), transitionComplete$, lastActiveUpdates$)
			.pipe(takeUntil(this.disconnecting))
			.subscribe()
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Set default country if not set
		this.setDefaultCountry()

		// Initialize Stripe elements
		this.initializeStripe()

		// Subscribe to processing state changes
		this._processing.pipe(takeUntil(this.disconnecting)).subscribe(isProcessing => {
			this.processing = isProcessing
		})
	}

	disconnectedCallback(): void {
		super.disconnectedCallback()

		// Clean up subscriptions
		if (this._elementsSubscription) {
			this._elementsSubscription.unsubscribe()
		}

		// Cancel any ongoing payment processing
		this.cancelProcessing()

		// Cancel holding booking if payment hasn't been processed yet
		if (!this.processing && this.booking?.id && this.booking?.status === 'holding') {
			this.cancelHoldingBooking()
		}
	}

	// Setup methods

	private setDefaultCountry(): void {
		if (!this.booking.customerAddress?.country) {
			bookingContext.set(
				{
					customerAddress: {
						...this.booking.customerAddress!,
						country: 'DE', // Default to Germany
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

			if (!this.stripe) {
				return
			}

			// Subscribe to Stripe elements
			this._elementsSubscription = $stripeElements.subscribe(elements => {
				this.elements = elements
			})
		} catch (error) {
			console.error('Error initializing Stripe:', error)
		}
	}

	// Payment processing methods (moved from PaymentService)

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
	 * Prepare a booking for payment
	 * @returns The prepared booking with any needed defaults
	 */
	private prepareBookingForPayment(booking: Booking): Booking {
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
	 * Generate idempotency key based on booking data
	 * This ensures that if booking details change, a new payment intent is created
	 */
	private generateIdempotencyKey(booking: Booking): string {
		// Include all critical booking details that would require a new payment intent if changed
		const keyData = {
			bookingId: booking.id,
			amount: booking.price,
			courtId: booking.courtId,
			date: booking.date,
			startTime: booking.startTime,
			endTime: booking.endTime,
			customerEmail: booking.customerEmail,
			timestamp: Math.floor(Date.now() / 10000), // 10-second window for retries
		}

		// Create a deterministic key from the booking data
		const keyString = JSON.stringify(keyData)
		// Simple hash function for the key (could use crypto.subtle.digest for better hash)
		let hash = 0
		for (let i = 0; i < keyString.length; i++) {
			const char = keyString.charCodeAt(i)
			hash = (hash << 5) - hash + char
			hash = hash & hash // Convert to 32-bit integer
		}

		return `booking_${booking.id}_${Math.abs(hash)}`
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
			venueId: booking.venueId, // Add venueId to payment metadata
			uid: booking.userId,
			bookingId: booking.id,
			date: booking.date,
			startTime: booking.startTime,
			endTime: booking.endTime,
			idempotencyKey: this.generateIdempotencyKey(booking),
		}
	}

	/**
	 * Confirm payment with Stripe
	 */
	private async confirmPayment(
		stripe: Stripe,
		elements: StripeElements,
		clientSecret: string,
		booking: Booking,
	): Promise<{ error?: any }> {
		console.log('Calling stripe.confirmPayment with:', {
			clientSecret: clientSecret.substring(0, 20) + '...',
			bookingId: booking.id,
			redirect: 'if_required',
		})

		try {
			const result = await stripe.confirmPayment({
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

			console.log('stripe.confirmPayment completed:', result)
			return result
		} catch (error) {
			console.error('stripe.confirmPayment error:', error)
			throw error
		}
	}

	/**
	 * Cancel any ongoing payment processing
	 * Use this when component is unmounted
	 */
	private cancelProcessing(): void {
		this._processingLock = null
		this._processing.next(false)
	}

	/**
	 * Process payment with integrated logic
	 */
	private processPaymentWithStripe(booking: Booking, stripe: Stripe, elements: StripeElements) {
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
				lastActive: new Date().toISOString(),
			}

			// Update booking in Firestore
			from(updateDoc(doc(db, 'bookings', bookingData.id), bookingUpdate))
				.pipe(
					tap(() => console.log('Updated booking with user info before payment')),
					catchError(error => {
						console.error('Error updating booking with user info:', error)
						// Continue anyway - payment is more important
						return of(null)
					}),
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
					console.log('Confirming payment with Stripe...')
					return from(this.confirmPayment(stripe, elements, clientSecret, bookingData)).pipe(
						tap(stripeResult => console.log('Stripe confirmPayment result:', stripeResult)),
						map(stripeResult => {
							if (stripeResult.error) {
								console.error('Stripe payment error:', stripeResult.error)
								throw stripeResult.error
							}

							console.log('Payment confirmed successfully')
							return { success: true, booking: bookingData }
						}),
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
						}),
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
					// Add a small delay to prevent flickering using RxJS
					of(null)
						.pipe(
							delay(300),
							tap(() => {
								if (this._processingLock === lockFlag) {
									this._processing.next(false)
								}
							}),
						)
						.subscribe()
				}
			}),
		)
	}

	// Event handlers

	/**
	 * Process payment when form is submitted
	 */
	async processPayment(e: Event): Promise<void> {
		e.preventDefault()

		// Check if timer has expired
		if (this.timerExpired) {
			$notify.error('Booking time expired. Please start a new booking.')
			return
		}

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
		this.processPaymentWithStripe(this.booking, this.stripe, this.elements).subscribe({
			next: (result: any) => {
				console.log('Payment result:', result)
				if (result.success) {
					console.log('Payment successful, navigating to confirmation...')
					console.log('Booking data:', result.booking)

					// Navigate directly to booking confirmation URL
					// This is more reliable than area.push
					const bookingId = result.booking.id
					if (bookingId) {
						// Use the PaymentStatusHandler's redirect URL pattern
						const baseUrl = window.location.origin
						window.location.href = `${baseUrl}/booking/confirmation?id=${bookingId}`
						console.log(`Navigating to: ${baseUrl}/booking/confirmation?id=${bookingId}`)
					} else {
						console.error('No booking ID available for navigation')
						$notify.error('Booking completed but unable to navigate to confirmation page')
					}
				} else if (result.error) {
					console.error('Payment failed:', result.error)
					// Stripe should handle the error display, but log it for debugging
				}
			},
			error: error => {
				console.error('Payment processing error:', error)
				// Don't show notification as Stripe handles its own error display
			},
			complete: () => {
				console.log('Payment processing completed')
			},
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

	/**
	 * Cancel a booking that's in holding status
	 * This releases the booking when user navigates away from payment
	 */
	private cancelHoldingBooking(): void {
		if (!this.booking?.id || this.booking?.status !== 'holding') {
			return
		}

		// Only cancel if payment hasn't been initiated
		// If paymentIntentId exists, payment might be in progress
		if (this.booking?.paymentIntentId) {
			console.log(`Booking ${this.booking.id} has payment intent, skipping cancellation`)
			// Don't clear from context here as user might return
			return
		}

		const bookingRef = doc(db, 'bookings', this.booking.id)

		// Update booking to cancelled status
		from(
			updateDoc(bookingRef, {
				status: 'cancelled',
				paymentStatus: 'abandoned',
				cancellationReason: 'user_navigated_away',
				updatedAt: new Date().toISOString(),
			}),
		)
			.pipe(
				map(() => {
					console.log(`Cancelled holding booking ${this.booking.id} - user navigated away`)
					// Clear the booking ID from context to prevent reuse
					bookingContext.set({ id: '', status: 'holding' }, true)
				}),
				catchError(error => {
					console.error('Error cancelling holding booking:', error)
					// Still clear the booking ID even if the update fails
					bookingContext.set({ id: '', status: 'holding' }, true)
					return of(null)
				}),
			)
			.subscribe()
	}

	/**
	 * Handle timer expiration
	 */
	private handleTimerExpired(): void {
		if (this.processing) {
			// Don't expire if payment is being processed
			return
		}

		this.timerExpired = true
		console.log('Booking timer expired')

		// Cancel the booking
		if (this.booking?.id && this.booking?.status === 'holding') {
			const bookingRef = doc(db, 'bookings', this.booking.id)

			// Update booking to cancelled status
			from(
				updateDoc(bookingRef, {
					status: 'cancelled',
					paymentStatus: 'expired',
					cancellationReason: 'timer_expired',
					updatedAt: new Date().toISOString(),
				}),
			)
				.pipe(
					tap(() => {
						console.log(`Cancelled expired booking ${this.booking.id}`)
						// Clear the booking ID from context
						bookingContext.set({ id: '', status: 'holding' }, true)
						// Show notification
						$notify.error('Booking time expired. Please start a new booking.')
					}),
					catchError(error => {
						console.error('Error cancelling expired booking:', error)
						// Still clear the booking ID even if the update fails
						bookingContext.set({ id: '', status: 'holding' }, true)
						$notify.error('Booking time expired. Please start a new booking.')
						return of(null)
					}),
				)
				.subscribe()
		} else {
			// Just show notification if no booking to cancel
			$notify.error('Booking time expired. Please start a new booking.')
		}
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
					w-full  rounded-lg transition-all duration-300 md:p-2
					${this.isActive ? 'scale-100' : 'scale-95'}
				"
			>
				<!-- Booking Summary - only show when timer hasn't expired -->
				${when(
					!this.timerExpired,
					() => html` <booking-summary .selectedCourt=${this.selectedCourt}> </booking-summary> `,
				)}

				<!-- Timer display -->
				${when(
					this.isActive && !this.timerExpired,
					() => html` <booking-timer @timer-expired=${() => this.handleTimerExpired()}></booking-timer> `,
				)}
				${when(
					this.timerExpired,
					() => html`
						<div class="w-full grid items-center justify-center py-8 px-4 text-center">
							<schmancy-icon size="64px" class="text-error-default mb-4">timer_off</schmancy-icon>
							<schmancy-typography type="title" token="lg" class="mb-2 text-error-default">
								Booking Time Expired
							</schmancy-typography>
							<schmancy-typography type="body" token="md" class="mb-4">
								Your booking reservation has expired. Please start a new booking.
							</schmancy-typography>
							<schmancy-button class="mx-auto" variant="filled" @click=${() => (window.location.href = '/book')}>
								Start New Booking
							</schmancy-button>
						</div>
					`,
					() => html`
						<schmancy-form @submit=${this.processPayment} .inert=${this.processing || this.timerExpired}>
							<schmancy-grid class="w-full px-2" gap="sm">
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
													html` <schmancy-option .label=${c.name ?? ''} .value=${c.code ?? 0}>
														${c.name}
													</schmancy-option>`,
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
					`,
				)}
			</div>
		`
	}
}
