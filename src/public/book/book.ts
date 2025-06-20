// src/public/book/book.ts
import { fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html, PropertyValues } from 'lit'
import { customElement, query } from 'lit/decorators.js'
import {
	debounceTime,
	distinctUntilChanged,
	filter,
	fromEvent,
	map,
	merge,
	shareReplay,
	take,
	takeUntil,
	tap,
} from 'rxjs'
import { doc, updateDoc } from 'firebase/firestore'
import { from, of, catchError } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venueContext, venuesContext } from 'src/admin/venues/venue-context'
import { availabilityContext, getBookingFlowSteps, initializeAvailabilityContext } from 'src/availability-context'
import { pricingService } from 'src/bookingServices/dynamic-pricing-service'
import { db } from 'src/firebase/firebase'
import { Court } from 'src/types/booking/court.types'
import { Venue } from 'src/types/booking/venue.types'
import '../shared/components/venue-map'
import stripePromise, { $stripe, $stripeElements, appearance } from '../stripe'
import './components'
import { BookingErrorService } from './components/errors/booking-error-service'
import './components/steps/court-map-google'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep, ErrorCategory } from './context'
import { PaymentStatusHandler } from './payment-status-handler'
import { transitionToNextStep } from './booking-steps-utils'

/**
 * Court booking system component
 * Handles the complete booking flow from date selection to payment
 * Updated to support dynamic ordering of steps based on venue configuration
 */
@customElement('court-booking-system')
export class CourtBookingSystem extends $LitElement() {
	// Contexts
	@select(courtsContext) availableCourts!: Map<string, Court>
	@select(venuesContext) venues!: Map<string, Venue>
	@select(bookingContext) booking!: Booking
	@select(BookingProgressContext) bookingProgress!: BookingProgress
	@select(availabilityContext) availability!: any

	// DOM references
	@query('#stripe-element') stripeElement!: HTMLElement

	// Services and helpers
	private paymentStatusHandler = new PaymentStatusHandler()

	// LIFECYCLE METHODS

	async connectedCallback() {
		super.connectedCallback()

		// Initialize the availability context
		initializeAvailabilityContext(this.disconnecting)

		// Create payment slot
		this.setupPaymentSlot()

		// Add history state management
		window.addEventListener('popstate', this.handleHistoryNavigation.bind(this))

		// Setup RxJS-based window event listeners for booking hold management
		this.setupBookingHoldCleanup()

		// We'll rely on firstUpdated to handle the venueId check
		// This allows time for both the URL parameters and context to be properly loaded
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		window.removeEventListener('popstate', this.handleHistoryNavigation.bind(this))
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		courtsContext.$.pipe(
			filter(() => courtsContext.ready && courtsContext.value.size > 0),
			take(1),
			debounceTime(100),
		)

			.subscribe({
				next: () => {
					this.initializeStripe()
					// Check if venueId is missing and redirect if necessary
					this.checkVenueIdAndRedirect()

					// Check for returning payment status
					this.checkPaymentStatus()

					// Initialize step based on URL parameters
					this.initializeStepFromUrl()
				},
			})

		// Initialize history state if needed
		if (!window.history.state) {
			this.updateUrlForStep(this.bookingProgress.currentStep)
		}
	}

	// Variable to store the state of the booking context
	private hasCheckedContext = false

	/**
	 * Check if a valid venueId exists in the booking context
	 * If not, redirect to the venues landing page
	 * Uses a timeout approach to allow for context hydration
	 */
	private checkVenueIdAndRedirect(): void {
		// Only check once to prevent redirect loops
		if (this.hasCheckedContext) {
			return
		}

		// Mark as checked to avoid multiple checks
		this.hasCheckedContext = true

		// Defer the check to allow context to be hydrated
		// This is the key to solving the race condition
		setTimeout(() => {
			// Check for empty venueId after timeout
			if (!this.booking.venueId || this.booking.venueId.trim() === '') {
				console.warn('No venueId found in booking context. Redirecting to venues page.')
				// Redirect to venues landing page
				const baseUrl = window.location.origin
				const venuesUrl = `${baseUrl.replace(/\/$/, '')}/`
				window.location.href = venuesUrl
			} else {
				// ensure venucontext is hydrated if theere is a booking venue id
				venuesContext.$.pipe(
					map(vs => vs.get(this.booking.venueId)),
					take(1),
				).subscribe({
					next: () => {
						venueContext.set(venuesContext.value.get(this.booking.venueId)!)
						this.requestUpdate()
					},
				})
			}
		}, 250) // Small timeout to allow context hydration
	}

	// BOOKING HOLD CLEANUP METHODS

	/**
	 * Setup RxJS-based window event listeners to handle booking hold cleanup
	 * This prevents bookings from getting stuck in holding state when users
	 * refresh the page or navigate away using browser controls
	 */
	private setupBookingHoldCleanup(): void {
		// Handle page unload events (refresh, close tab, navigate away)
		const beforeUnload$ = fromEvent(window, 'beforeunload').pipe(
			tap(() => {
				// Only release if we're on payment step and no payment intent exists
				if (this.isOnPaymentStep() && this.shouldReleaseBookingHold()) {
					this.releaseBookingHold()
				}
			}),
		)

		// Handle browser navigation (back/forward buttons)
		const popState$ = fromEvent(window, 'popstate').pipe(
			filter(() => this.shouldReleaseBookingHold()),
			tap(() => {
				this.releaseBookingHold()
			}),
		)

		// Handle page visibility changes (tab switching, minimizing)
		const visibilityChange$ = fromEvent(document, 'visibilitychange').pipe(
			filter(() => document.visibilityState === 'hidden'),
			filter(() => this.shouldReleaseBookingHold()),
			tap(() => {
				this.releaseBookingHold()
			}),
		)

		// Merge all event streams and subscribe
		merge(beforeUnload$, popState$, visibilityChange$).pipe(takeUntil(this.disconnecting)).subscribe()
	}

	/**
	 * Check if we're currently on the payment step
	 */
	private isOnPaymentStep(): boolean {
		return this.bookingProgress?.currentStep === BookingStep.Payment
	}

	/**
	 * Check if a booking hold should be released
	 * Only release if booking is in holding status and no payment intent exists
	 */
	private shouldReleaseBookingHold(): boolean {
		return !!(this.booking?.id && this.booking?.status === 'holding' && !this.booking?.paymentIntentId)
	}

	/**
	 * Release a booking hold by updating its status to cancelled
	 */
	private releaseBookingHold(): void {
		if (!this.booking?.id) {
			return
		}

		console.log(`Releasing booking hold ${this.booking.id} due to browser navigation/refresh`)

		const bookingRef = doc(db, 'bookings', this.booking.id)

		// Use synchronous approach for beforeunload events
		// Note: beforeunload has very limited time, so we use navigator.sendBeacon if available
		if ('sendBeacon' in navigator) {
			// For beforeunload events, use sendBeacon for better reliability
			const updateData = {
				status: 'cancelled',
				paymentStatus: 'abandoned',
				cancellationReason: 'browser_navigation_away',
				updatedAt: new Date().toISOString(),
			}

			// Convert to form data for sendBeacon
			const formData = new FormData()
			formData.append('bookingId', this.booking.id)
			formData.append('updateData', JSON.stringify(updateData))

			// Send beacon to a cleanup endpoint (you'd need to implement this)
			// navigator.sendBeacon('/api/cleanup-booking', formData)
		}

		// Also try the RxJS approach for other cases
		from(
			updateDoc(bookingRef, {
				status: 'cancelled',
				paymentStatus: 'abandoned',
				cancellationReason: 'browser_navigation_away',
				updatedAt: new Date().toISOString(),
			}),
		)
			.pipe(
				tap(() => {
					console.log(`Successfully released booking hold ${this.booking.id}`)
					// Clear the booking ID from context to prevent reuse
					bookingContext.set({ id: '', status: 'holding' }, true)
				}),
				catchError(error => {
					console.error('Error releasing booking hold:', error)
					// Still clear the booking ID even if the update fails
					bookingContext.set({ id: '', status: 'holding' }, true)
					return of(null)
				}),
				takeUntil(this.disconnecting),
			)
			.subscribe()
	}

	// SETUP METHODS

	private setupPaymentSlot(): void {
		const slot = document.createElement('slot')
		slot.name = 'stripe-element'
		slot.slot = 'stripe-element'
		this.append(slot)
	}

	private initializeStripe(): void {
		// Subscribe to booking context changes to update stripe amount
		bookingContext.$.pipe(
			filter(() => !!this.booking),

			filter(booking => !!booking.startTime && !!booking.endTime && !!booking.courtId),

			filter(b => !!this.availableCourts.get(b.courtId)),

			distinctUntilChanged((prev, curr) => {
				return prev.startTime === curr.startTime && prev.endTime === curr.endTime && prev.courtId === curr.courtId
			}),
			tap(v => console.log('.....', v)),

			map(booking => {
				bookingContext.set(
					{
						price: pricingService.calculatePrice(
							this.availableCourts.get(booking.courtId)!,
							booking.startTime,
							booking.endTime,
							booking.userId,
						),
					},
					true,
				)
				return booking.price
			}),
			distinctUntilChanged((prev, curr) => prev === curr),
			takeUntil(this.disconnecting),
			shareReplay(1),
		).subscribe(price => {
			console.log('priceeee', price)
			if (price) {
				$stripe.next(price)
			}
		})

		// Initialize Stripe elements
		$stripe.pipe(distinctUntilChanged(), takeUntil(this.disconnecting)).subscribe(async amount => {
			try {
				const stripe = await stripePromise
				if (!stripe) {
					BookingErrorService.setError('Unable to initialize payment system', ErrorCategory.PAYMENT)
					return
				}

				const elements = stripe.elements({
					fonts: [
						{
							src: 'url(https://ticket.funkhaus-berlin.net/assets/GT-Eesti-Pro-Display-Regular-Czpp09nv.woff)',
							family: 'GT-Eesti-Display-Regular',
							style: 'normal',
						},
					],
					mode: 'payment',
					appearance: appearance(),
					currency: 'eur',
					amount: amount * 100,
				})

				// Create payment element
				const paymentElement = elements.create('payment', this.paymentStatusHandler.getPaymentElementOptions())

				// Mount payment element when DOM is ready
				this.updateComplete.then(() => {
					const elementContainer = document.getElementById('stripe-element')
					if (elementContainer) {
						paymentElement.mount('#stripe-element')
						$stripeElements.next(elements)
					} else {
						BookingErrorService.setError('Could not find payment element container', ErrorCategory.SYSTEM)
					}
				})
			} catch (error) {
				console.error('Failed to initialize Stripe:', error)
				BookingErrorService.handleError(error)
			}
		})
	}

	private checkPaymentStatus(): void {
		this.paymentStatusHandler
			.checkUrlForPaymentStatus()
			.pipe(takeUntil(this.disconnecting), debounceTime(1000))

			.subscribe(result => {
				if (result.processed && result.success && result.bookingId) {
					// Redirect to confirmation page instead of showing it inline
					this.redirectToConfirmation(result.bookingId)
				} else if (result.processed && !result.success) {
					// Handle payment failure
					BookingErrorService.setError(
						'Payment processing failed. Please try again.',
						ErrorCategory.PAYMENT,
						{},
						true, // Show notification
					)
				}
			})
	}

	private initializeStepFromUrl(): void {
		const urlParams = new URLSearchParams(window.location.search)
		const stepParam = urlParams.get('step')
		const confirmationParam = urlParams.get('confirmation')

		// Handle confirmation view
		if (confirmationParam === 'true') {
			const bookingId = urlParams.get('booking')
			if (bookingId) {
				this.redirectToConfirmation(bookingId)
				return
			}
		}

		// Parse step from URL
		if (stepParam) {
			const stepNumber = parseInt(stepParam, 10)
			if (stepNumber >= BookingStep.Date && stepNumber <= BookingStep.Payment) {
				// Update BookingProgressContext
				BookingProgressContext.set({
					currentStep: stepNumber,
				})
			}
		}
	}

	// NAVIGATION METHODS

	private handleHistoryNavigation(event: PopStateEvent): void {
		const stepFromHistory = event.state?.step || BookingStep.Date

		// Handle confirmation state from history
		if (event.state?.confirmation) {
			const bookingId = event.state?.bookingId
			if (bookingId) {
				this.redirectToConfirmation(bookingId)
				return
			}
		}

		// Update only if it's a valid step
		if (
			typeof stepFromHistory === 'number' &&
			stepFromHistory >= BookingStep.Date &&
			stepFromHistory <= BookingStep.Payment
		) {
			BookingProgressContext.set({
				currentStep: stepFromHistory,
			})
		}
	}

	private updateUrlForStep(step: BookingStep): void {
		const url = new URL(window.location.href)
		url.searchParams.set('step', step.toString())
		window.history.pushState({ step }, '', url.toString())
	}

	// HELPER METHODS

	/**
	 * Redirect to the confirmation route with the booking ID
	 */
	private redirectToConfirmation(bookingId: string): void {
		if (!bookingId) return

		// Create the confirmation URL
		const baseUrl = window.location.origin
		const confirmationUrl = `${baseUrl.replace(/\/$/, '')}/booking/confirmation?id=${bookingId}`

		// Navigate to the confirmation page
		window.location.href = confirmationUrl
	}

	render() {
		// Get current step and flow steps for rendering
		const currentStep = this.bookingProgress.currentStep
		const flowSteps = getBookingFlowSteps()
		console.log(this.booking)
		return html`
			<schmancy-grid ${fullHeight()} rows="auto 1fr">
				<page-header-banner
					class="h-[15vh] sm:h-[20vh] lg:h-[25vh]  lg:block"
					.title=${venueContext.value.name ?? ''}
					description="EXPERIENCE BERLIN'S FIRST PICKLEBALL CLUB!"
					imageSrc="/assets/still02.jpg"
				>
				</page-header-banner>
				<schmancy-grid
					.rcols=${{
						sm: '1fr',
						lg: '3fr 2fr',
					}}
				>
					<section class="max-w-3xl w-full   justify-self-center lg:justify-end flex">
						<schmancy-grid rows="auto 1fr" flow="row" class="w-full   justify-self-end">
							<!-- Error display component - shows errors from BookingProgressContext -->
							<booking-error-display showRecoverySuggestion language="en"></booking-error-display>
							<schmancy-scroll hide>
								<!-- All UI content directly in render function - no separate functions -->
								${currentStep === 5
									? html`
											<!-- Payment step -->
											<funkhaus-checkout-form .booking=${this.booking}>
												<slot slot="stripe-element" name="stripe-element"></slot>
											</funkhaus-checkout-form>
										`
									: !this.availability?.bookingFlowType
										? html`
												<!-- Default date step if flow not ready -->
												<date-selection-step class="max-w-full sticky top-0 block my-2 z-0"></date-selection-step>
											`
										: html`
												<!-- Render booking steps based on flow -->
												${flowSteps && flowSteps.map
													? flowSteps.map(step => {
															// Check if step should be shown - all logic inline
															if (!this.availability?.bookingFlowType) return html``

															const stepIndex = flowSteps.indexOf(step)
															const isExpanded = this.bookingProgress.expandedSteps.includes(step.step)
															const currentStepIndex = flowSteps.findIndex(
																s => s.step === this.bookingProgress.currentStep,
															)

															// If Date step is current and expanded, only show Date step
															const dateStep = flowSteps.find(s => s.label === 'Date')
															if (
																dateStep &&
																this.bookingProgress.currentStep === dateStep.step &&
																this.bookingProgress.expandedSteps.includes(dateStep.step)
															) {
																if (step.step !== dateStep.step) return html``
															}

															if (currentStepIndex > this.bookingProgress.maxStepReached) {
																BookingProgressContext.set({
																	maxStepReached: currentStepIndex,
																})
															}

															// Special case for Duration step - only show if time is selected
															if (step.label === 'Duration' && !this.booking.startTime) {
																return html``
															}

															// Check if step should be shown
															const shouldShow = stepIndex !== -1 && isExpanded
															if (!shouldShow) return html``

															// Render the appropriate step component based on label
															const stepLabel = step.label
															switch (stepLabel) {
																case 'Date':
																	return html`
																		<date-selection-step
																			class="max-w-full sticky top-0 block z-10"
																		></date-selection-step>
																	`
																case 'Court':
																	return html`
																		<court-select-step class="max-w-full block mt-2 z-10"></court-select-step>
																	`
																case 'Time':
																	return html`
																		<time-selection-step
																			class="max-w-full sticky top-0 block mt-2 z-10"
																		></time-selection-step>
																	`
																case 'Duration':
																	// Only show duration step if start time is selected
																	return this.booking.startTime
																		? html`
																				<duration-selection-step
																					class="max-w-full mt-2 block"
																				></duration-selection-step>
																			`
																		: html``
																default:
																	return html``
															}
														})
													: html``}
											`}
							</schmancy-scroll>
						</schmancy-grid>
					</section>
					<schmancy-surface rounded="all" type="container" class="max-w-lg w-full hidden lg:block mx-auto">
						<schmancy-grid gap="md" class="p-4">
							<!-- Map Component -->
							${(() => {
								// Check if on date step without date selected
								const dateStep = flowSteps.find(s => s.label === 'Date')
								const isOnDateStep = dateStep && this.bookingProgress.currentStep === dateStep.step
								const hasDateSelected = !!this.booking?.date

								// Check if on payment step
								const isOnPaymentStep = this.bookingProgress.currentStep === 5 // Payment step is always 5

								// Show venue map if on date step without date selected OR on payment step
								if ((isOnDateStep && !hasDateSelected) || isOnPaymentStep) {
									return html`
										<venue-map
											.address=${venueContext.value?.address}
											.venueName=${venueContext.value?.name || 'Venue'}
											zoom=${16}
											showMarker
											interactive
											class="h-64 w-full rounded-lg overflow-hidden"
										></venue-map>
									`
								}

								// Otherwise check if any courts have map coordinates
								const courtsArray = Array.from(this.availableCourts?.values() || [])
								const venueCourts = courtsArray.filter(court => court.venueId === this.booking?.venueId)
								const courtsWithCoordinates = venueCourts.filter(c => c.mapCoordinates)

								if (courtsWithCoordinates.length > 0) {
									// Calculate court availability for the map
									const courtAvailabilityMap = new Map()
									venueCourts.forEach(court => {
										// Basic availability check - all courts available for now
										// This could be enhanced with actual availability logic if needed
										courtAvailabilityMap.set(court.id, {
											courtId: court.id,
											courtName: court.name,
											available: true,
											fullyAvailable: true,
											availableTimeSlots: [],
											unavailableTimeSlots: [],
										})
									})

									// Show courts on map
									return html`
										<court-map-google
											.courts=${venueCourts}
											.selectedCourtId=${this.booking?.courtId || ''}
											.courtAvailability=${courtAvailabilityMap}
											.venueAddress=${venueContext.value?.address}
											.venueName=${venueContext.value?.name || 'Venue'}
											zoom=${18}
											class="h-64 w-full rounded-lg overflow-hidden"
											@court-select=${(e: CustomEvent) => {
												console.log('Court selected from preview map:', e.detail.court)
												// Update courtId and transition to next step
												if (e.detail.court) {
													bookingContext.set({ courtId: e.detail.court.id }, true)
													// Use transitionToNextStep to properly handle the transition
													transitionToNextStep('Court')
												}
											}}
										></court-map-google>
									`
								} else {
									// Show regular venue map
									return html`
										<venue-map
											.address=${venueContext.value?.address}
											.venueName=${venueContext.value?.name || 'Venue'}
											zoom=${16}
											showMarker
											interactive
											class="h-64 w-full rounded-lg overflow-hidden"
										></venue-map>
									`
								}
							})()}

							<!-- Address and Directions -->
							${venueContext.value?.address
								? html`
										<schmancy-divider></schmancy-divider>
										<schmancy-grid gap="sm">
											<schmancy-flex align="center" gap="sm">
												<schmancy-icon class="text-primary-default">location_on</schmancy-icon>
												<schmancy-typography type="headline" token="sm">
													${venueContext.value?.name || 'Venue Location'}
												</schmancy-typography>
											
											</schmancy-flex>
                      	<schmancy-typography type="body" token="sm" class="text-surface-onVariant">
													${venueContext.value.address.street}, ${venueContext.value.address.city},
													${venueContext.value.address.postalCode}, ${venueContext.value.address.country}
												</schmancy-typography>

											<schmancy-button
												variant="outlined"
												width="full"
												@click=${() => {
													const address = venueContext.value?.address
													if (!address) return

													let query = ''
													if (address.coordinates) {
														query = `${address.coordinates.lat},${address.coordinates.lng}`
													} else {
														const fullAddress = `${address.street}, ${address.city}, ${address.postalCode}, ${address.country}`
														query = encodeURIComponent(fullAddress)
													}

													window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank')
												}}
											>
												<schmancy-icon slot="prefix">directions</schmancy-icon>
												Get Directions
											</schmancy-button>
										</schmancy-grid>
									`
								: ''}
						</schmancy-grid>
					</schmancy-surface>
				</schmancy-grid>
			</schmancy-grid>
		`
	}
}
