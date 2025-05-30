// src/public/book/book.ts
import { fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html, PropertyValues } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { debounceTime, distinctUntilChanged, filter, map, shareReplay, take, takeUntil, tap } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venueContext, venuesContext } from 'src/admin/venues/venue-context'
import {
	availabilityContext,
	BookingFlowStep,
	getBookingFlowSteps,
	initializeAvailabilityContext,
} from 'src/availability-context'
import { pricingService } from 'src/bookingServices/dynamic-pricing-service'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import stripePromise, { $stripe, $stripeElements, appearance } from '../stripe'
import './components'
import { BookingErrorService } from './components/errors/booking-error-service'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep, ErrorCategory } from './context'
import { PaymentStatusHandler } from './payment-status-handler'

/**
 * Court booking system component
 * Handles the complete booking flow from date selection to payment
 * Updated to support dynamic ordering of steps based on venue configuration
 */
@customElement('court-booking-system')
export class CourtBookingSystem extends $LitElement() {
	// State
	@state() selectedCourt?: Court = undefined
	@state() bookingInProgress: boolean = false
	@state() loadingCourts: boolean = false

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

		// We'll rely on firstUpdated to handle the venueId check
		// This allows time for both the URL parameters and context to be properly loaded

		// Initialize Stripe
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
				bookingContext.set({
					price: pricingService.calculatePrice(
						this.availableCourts.get(booking.courtId)!,
						booking.startTime,
						booking.endTime,
						booking.userId,
					),
				}, true)
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
		this.paymentStatusHandler.checkUrlForPaymentStatus()
    .pipe(
      takeUntil(this.disconnecting),
      debounceTime(1000),
    )
    
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

	// EVENT HANDLERS

	private handleBookingComplete(e: CustomEvent): void {
		// Start processing state
		this.bookingInProgress = true

		// Update booking with data from event
		if (e.detail?.booking) {
			bookingContext.set(e.detail.booking)
		}

		// Ensure selected court is set
		this.ensureSelectedCourt()

		// Get the booking ID - essential for redirecting
		const bookingId = this.booking.id

		// Redirect to the confirmation page after a short delay
		requestAnimationFrame(() => {
			setTimeout(() => {
				this.bookingInProgress = false
				this.redirectToConfirmation(bookingId)
			}, 100)
		})
	}

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

	private ensureSelectedCourt(): void {
		if (!this.selectedCourt) {
			this.selectedCourt = Array.from(this.availableCourts.values()).find(court => court.id === this.booking.courtId)

			if (!this.selectedCourt && this.availableCourts.size > 0) {
				this.selectedCourt = Array.from(this.availableCourts.values())[0]
				bookingContext.set({ courtId: this.selectedCourt.id }, true)
			}
		}
	}

	private renderProgressSteps() {
		return html` <funkhaus-booking-steps></funkhaus-booking-steps> `
	}

	private renderProcessingOverlay() {
		return html` <sch-busy></sch-busy> `
	}
	// Key updates for src/public/book/book.ts

	/**
	 * Render steps dynamically based on the current flow
	 */
	private renderCurrentStep() {
		const currentStep = this.bookingProgress.currentStep

		// If we're at the payment step, render the payment form
		if (currentStep === 5) {
			// Using numeric values now instead of enum
			return html`
				<booking-summary .selectedCourt=${this.selectedCourt}></booking-summary>

				<funkhaus-checkout-form
					.booking=${this.booking}
					.selectedCourt=${this.selectedCourt}
					@booking-complete=${this.handleBookingComplete}
				>
					<slot slot="stripe-element" name="stripe-element"></slot>
				</funkhaus-checkout-form>
			`
		}

		// Otherwise, render the booking steps in the order defined by the flow
		if (!this.availability?.bookingFlowType) {
			// If flow isn't available yet, render just the date step
			return html` <date-selection-step class="max-w-full sticky top-0 block my-2 z-0"></date-selection-step> `
		}

		// Get all steps in current flow as numeric values
		const flowSteps = getBookingFlowSteps()

		// Render components in the correct order
		return html`
			${flowSteps.map(step => {
				// Only render steps that should be shown based on position in flow
				if (this.shouldShowStep(step)) {
					return this.renderStepComponent(step)
				}
				return html``
			})}
		`
	}

	/**
	 * Determine if a step should be shown based on current booking flow and progress
	 * Modified to implement sequential step display with expanded steps tracking
	 * Further modified to hide Duration step if no time is selected
	 */
	private shouldShowStep(step: BookingFlowStep): boolean {
		if (!this.availability?.bookingFlowType) return true

		const flowSteps = getBookingFlowSteps()
		const stepIndex = flowSteps.indexOf(step)
		const isExpanded = this.bookingProgress.expandedSteps.includes(step.step)
		const currentStepIndex = flowSteps.findIndex(s => s.step === this.bookingProgress.currentStep)

		// If Date step is current and expanded, only show Date step
		const dateStep = flowSteps.find(s => s.label === 'Date')
		if (
			dateStep &&
			this.bookingProgress.currentStep === dateStep.step &&
			this.bookingProgress.expandedSteps.includes(dateStep.step)
		) {
			return step.step === dateStep.step
		}

		if (currentStepIndex > this.bookingProgress.maxStepReached) {
			BookingProgressContext.set({
				maxStepReached: currentStepIndex,
			})
		}

		// Special case for Duration step - only show if time is selected
		if (step.label === 'Duration' && !this.booking.startTime) {
			return false
		}

		return stepIndex !== -1 && isExpanded
	}
	/**
	 * Render a step component based on step number
	 */
	private renderStepComponent(step: BookingFlowStep) {
		const stepLabel = step.label
		switch (stepLabel) {
			case 'Date': // Date (was BookingStep.Date)
				return html` <date-selection-step class="max-w-full sticky top-0 block my-2 z-10"></date-selection-step> `
			case 'Court': // Court (was BookingStep.Court)
				return html` <court-select-step class="max-w-full block mt-2 z-10"></court-select-step> `
			case 'Time': // Time (was BookingStep.Time)
				return html` <time-selection-step class="max-w-full sticky top-0 block mt-2 z-10"></time-selection-step> `
			case 'Duration': // Duration (was BookingStep.Duration)
				return html` <duration-selection-step class="max-w-full mt-2 block"></duration-selection-step> `
			default:
				return html``
		}
	}

	render() {
		return html`
			<schmancy-surface class="max-w-4xl mx-auto" ${fullHeight()} type="container" rounded="all" elevation="1">
				<schmancy-grid
					.rcols=${{
						sm: '1fr',
						md: '1.68fr 1fr',
					}}
					justify="stretch"
					align="stretch"
					gap="lg"
				>
					<section class="w-full justify-center md:justify-end flex">
						<schmancy-grid
							rows="auto auto 1fr"
							${fullHeight()}
							flow="row"
							class="max-w-lg w-full pt-2 justify-self-end"
						>
							${this.renderProgressSteps()}

							<!-- Error display component - shows errors from BookingProgressContext -->
							<booking-error-display showRecoverySuggestion language="en"></booking-error-display>
							<schmancy-scroll hide>${this.renderCurrentStep()}</schmancy-scroll>
						</schmancy-grid>
					</section>
					<funkhaus-venue-card
						class="hidden md:block col-auto justify-self-start mt-4"
						.venue=${venueContext.value as Venue}
						.theme=${(venueContext.value as Venue).theme!}
            readonly
					></funkhaus-venue-card>
				</schmancy-grid>
				${when(this.bookingInProgress, () => this.renderProcessingOverlay())}
			</schmancy-surface>
		`
	}
}
