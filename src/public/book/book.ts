// src/public/book/book.ts
import { fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html, PropertyValues } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { distinctUntilChanged, filter, map, takeUntil } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { initializeAvailabilityContext } from 'src/availability-context'
import { pricingService } from 'src/bookingServices/dynamic-pricing-service'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import stripePromise, { $stripe, $stripeElements, appearance } from '../stripe'
import './components'
import { BookingErrorService } from './components/errors/booking-error-service'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep, ErrorCategory } from './context'
import { PaymentStatusHandler } from './payment-status-handler'

// Import the availability context initialization function

/**
 * Court booking system component
 * Handles the complete booking flow from date selection to payment
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

		// Initialize Stripe
		this.initializeStripe()

		// Subscribe to booking progress context
		// BookingProgressContext.$.pipe(
		// 	filter(() => !!this.bookingProgress),
		// 	takeUntil(this.disconnecting),
		// ).subscribe(() => {
		// 	// Update URL when step changes
		// 	this.updateUrlForStep(this.bookingProgress.currentStep)
		// 	// Clear any errors when changing steps
		// 	BookingErrorService.clearError()
		// })
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		window.removeEventListener('popstate', this.handleHistoryNavigation.bind(this))
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Check for returning payment status
		this.checkPaymentStatus()

		// Initialize step based on URL parameters
		this.initializeStepFromUrl()

		// Initialize history state if needed
		if (!window.history.state) {
			this.updateUrlForStep(this.bookingProgress.currentStep)
		}
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
			// calculate the price based on the booking object and ignore the price set in the context, calculate from the pricing service only when starttime, endtime and court is set
			filter(booking => !!booking.startTime && !!booking.endTime && !!booking.courtId),
			distinctUntilChanged((prev, curr) => {
				return prev.startTime === curr.startTime && prev.endTime === curr.endTime && prev.courtId === curr.courtId
			}),
			// set the price based on the booking object
			map(booking => {
				bookingContext.set({
					price: pricingService.calculatePrice(
						this.availableCourts.get(booking.courtId)!,
						booking.startTime,
						booking.endTime,
						booking.userId,
					),
				})
				return booking.price
			}),
			distinctUntilChanged((prev, curr) => prev === curr),
			takeUntil(this.disconnecting),
		).subscribe(price => {
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
		this.paymentStatusHandler.checkUrlForPaymentStatus().subscribe(result => {
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

	private renderCurrentStep() {
		const currentStep = this.bookingProgress.currentStep

		return html`
			${when(
				currentStep === BookingStep.Payment,
				() => html`
					<booking-summary .booking=${this.booking} .selectedCourt=${this.selectedCourt}></booking-summary>

					<funkhaus-checkout-form
						.booking=${this.booking}
						.selectedCourt=${this.selectedCourt}
						@booking-complete=${this.handleBookingComplete}
					>
						<slot slot="stripe-element" name="stripe-element"></slot>
					</funkhaus-checkout-form>
				`,
				() => html`
					<date-selection-step class="max-w-full sticky top-0 block my-2 z-0"></date-selection-step>

					${when(
						currentStep >= BookingStep.Time,
						() => html` <time-selection-step class="max-w-full sticky top-0 block mt-2 z-10"></time-selection-step> `,
					)}
					${when(
						currentStep >= BookingStep.Duration,
						() => html` <duration-selection-step class="max-w-full mt-2 block"></duration-selection-step> `,
					)}
					${when(
						currentStep >= BookingStep.Court,
						() => html` <court-select-step class="max-w-full block mt-2 z-10"></court-select-step> `,
					)}
				`,
			)}
		`
	}

	render() {
		return html`
			<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
				<schmancy-grid
					.rcols=${{
						sm: '1fr',
						md: '1.68fr 1fr',
					}}
					justify="stretch"
					align="stretch"
					gap="lg"
				>
					<section class="w-full justify-end flex">
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
						.venue=${this.venues.get(this.booking.venueId)!}
						@click=${() => {}}
						.theme=${this.venues.get(this.booking.venueId)?.theme!}
					></funkhaus-venue-card>
				</schmancy-grid>
				${when(this.bookingInProgress, () => this.renderProcessingOverlay())}
			</schmancy-surface>
		`
	}
}
