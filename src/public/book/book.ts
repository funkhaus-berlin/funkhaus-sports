// src/public/book/book.ts
import { area, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html, PropertyValues } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { distinctUntilChanged, filter, fromEvent, startWith, takeUntil } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import stripePromise, { $stripe, $stripeElements, appearance } from '../stripe'
import { VenueLandingPage } from '../venues/venues'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from './context'
import { BookingErrorHandler } from './error-handler'
import { PaymentStatusHandler } from './payment-status-handler'
import './steps'

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
	@state() error: string | null = null
	@state() bookingComplete: boolean = false

	// Contexts
	@select(courtsContext) availableCourts!: Map<string, Court>
	@select(venuesContext) venues!: Map<string, Venue>
	@select(bookingContext) booking!: Booking
	@select(BookingProgressContext) bookingProgress!: BookingProgress

	// DOM references
	@query('#stripe-element') stripeElement!: HTMLElement

	// Services and helpers
	private paymentStatusHandler = new PaymentStatusHandler()
	private errorHandler = new BookingErrorHandler()

	// LIFECYCLE METHODS

	async connectedCallback() {
		super.connectedCallback()

		// Create payment slot
		this.setupPaymentSlot()

		bookingContext.$.pipe(
			startWith(bookingContext.value),
			filter(() => bookingContext.ready),
			distinctUntilChanged((prev, curr) => prev.price === curr.price),
			takeUntil(this.disconnecting),
		).subscribe(booking => {
			if (!booking.venueId) {
				area.push({
					area: 'root',
					component: VenueLandingPage,
					historyStrategy: 'replace',
				})
				return
			}
			if (booking.price) {
				$stripe.next(booking.price)
			}
		})

		// Add history state management
		fromEvent<PopStateEvent>(window, 'popstate')
			.pipe(takeUntil(this.disconnecting))
			.subscribe((event: PopStateEvent) => {
				this.handleHistoryNavigation(event)
			})
		// Initialize Stripe
		this.initializeStripe()

		// Subscribe to booking progress context
		BookingProgressContext.$.pipe(
			filter(() => !!this.bookingProgress),
			takeUntil(this.disconnecting),
		).subscribe(() => {
			// Update URL when step changes
			this.updateUrlForStep(this.bookingProgress.currentStep)
			// Clear any errors
			this.errorHandler.clearError()
			this.error = null
		})
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
		// Initialize Stripe elements
		$stripe.pipe(distinctUntilChanged(), takeUntil(this.disconnecting)).subscribe(async amount => {
			try {
				const stripe = await stripePromise
				if (!stripe) return

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
						console.error('Could not find stripe-element container')
					}
				})
			} catch (error) {
				console.error('Failed to initialize Stripe:', error)
			}
		})
	}

	private checkPaymentStatus(): void {
		this.paymentStatusHandler.checkUrlForPaymentStatus().subscribe(result => {
			if (result.processed && result.success && result.bookingId) {
				// Show confirmation for successful payment
				this.bookingComplete = true
			}
		})
	}

	private initializeStepFromUrl(): void {
		const urlParams = new URLSearchParams(window.location.search)
		const stepParam = urlParams.get('step')
		const confirmationParam = urlParams.get('confirmation')

		// Handle confirmation view
		if (confirmationParam === 'true') {
			this.bookingComplete = true
			return
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
			this.bookingComplete = true
			return
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

		// Update URL for confirmation
		this.updateUrlForConfirmation()

		// Show confirmation view after brief delay for smoother transition
		requestAnimationFrame(() => {
			setTimeout(() => {
				this.bookingComplete = true
				this.bookingInProgress = false
				this.requestUpdate()
			}, 100)
		})
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

	private updateUrlForConfirmation(): void {
		const url = new URL(window.location.href)
		url.searchParams.delete('step')
		url.searchParams.set('confirmation', 'true')
		if (this.booking.id) {
			url.searchParams.set('booking', this.booking.id)
		}
		window.history.pushState({ confirmation: true, bookingId: this.booking.id }, '', url.toString())
	}

	// HELPER METHODS

	private resetBooking(): void {
		this.bookingComplete = false
		this.error = null
		this.selectedCourt = undefined

		// Reset booking context to initial state
		bookingContext.clear()

		// Reset to the first step
		BookingProgressContext.set({
			currentStep: BookingStep.Date,
		})
	}

	// RENDERING METHODS

	private renderProgressSteps() {
		return html` <funkhaus-booking-steps></funkhaus-booking-steps> `
	}

	private renderErrorNotification() {
		if (!this.error) return ''

		return html`
			<div class="bg-error-container text-error-onContainer rounded-lg p-2 flex">
				<schmancy-flex justify="center" align="center" gap="sm">
					<schmancy-icon>error</schmancy-icon>
					<schmancy-typography>${this.error}</schmancy-typography>
					<schmancy-button variant="text" @click=${() => (this.error = null)}> Dismiss </schmancy-button>
				</schmancy-flex>
			</div>
		`
	}

	private renderCurrentStep() {
		const currentStep = this.bookingProgress.currentStep

		return html`
			${when(
				currentStep <= BookingStep.Duration,
				() => html`
					<date-selection-step
						.active=${currentStep === BookingStep.Date}
						class="max-w-full sticky top-0 block my-2 z-0"
						.value=${this.booking.date}
					></date-selection-step>

					<court-select-step
						.hidden=${currentStep < BookingStep.Court}
						class="max-w-full block mt-2 z-10"
					></court-select-step>

					<time-selection-step
						.hidden=${currentStep < BookingStep.Time}
						.active=${currentStep === BookingStep.Time}
						class="max-w-full sticky top-0 block mt-2 z-10"
					></time-selection-step>

					${when(
						currentStep === BookingStep.Duration,
						() => html`
							<duration-selection-step
								class="max-w-full mt-2 block"
								.selectedDuration=${this.getDuration()}
							></duration-selection-step>
						`,
					)}
				`,
				() => html`
					<booking-summery .booking=${this.booking} .selectedCourt=${this.selectedCourt}> </booking-summery>

					<funkhaus-checkout-form
						.booking=${this.booking}
						.selectedCourt=${this.selectedCourt}
						@booking-complete=${this.handleBookingComplete}
					>
						<slot slot="stripe-element" name="stripe-element"></slot>
					</funkhaus-checkout-form>
				`,
			)}
		`
	}

	private getDuration(): number {
		if (!this.booking.startTime || !this.booking.endTime) return 0

		const startTime = new Date(this.booking.startTime).getTime()
		const endTime = new Date(this.booking.endTime).getTime()
		return (endTime - startTime) / (1000 * 60) // Convert to minutes
	}

	private renderBookingConfirmation() {
		const hasRequiredData = this.booking && this.booking.date && this.booking.startTime

		if (!hasRequiredData) {
			return html`
				<schmancy-surface type="containerLow" rounded="all" class="p-5">
					<schmancy-flex flow="col" align="center" justify="center">
						<schmancy-typography type="title">Booking Data Error</schmancy-typography>
						<schmancy-typography>Sorry, we couldn't retrieve your booking details.</schmancy-typography>
						<schmancy-button class="mt-4" variant="filled" @click=${() => this.resetBooking()}>
							Start Over
						</schmancy-button>
					</schmancy-flex>
				</schmancy-surface>
			`
		}

		return html`
			<booking-confirmation
				.booking=${this.booking}
				.selectedCourt=${this.selectedCourt}
				.customerEmail=${this.booking.customerEmail || ''}
				.customerName=${this.booking.userName || ''}
				.bookingId=${this.booking.id || ''}
				.onNewBooking=${() => this.resetBooking()}
			></booking-confirmation>
		`
	}

	private renderProcessingOverlay() {
		return html`
			<div
				class="fixed inset-0 z-50 bg-opacity-70 backdrop-blur-sm flex items-center justify-center transition-opacity duration-300"
			>
				<schmancy-flex class="px-4" justify="center" flow="row" gap="md" align="center">
					<schmancy-spinner class="h-12 w-12" size="48px"></schmancy-spinner>
				</schmancy-flex>
			</div>
		`
	}

	render() {
		// Show booking confirmation if complete
		if (this.bookingComplete) {
			return this.renderBookingConfirmation()
		}

		// Main booking flow
		return html`
			<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
				<schmancy-grid rows="auto auto 1fr" ${fullHeight()} flow="row" class="max-w-lg mx-auto pt-2">
					${this.renderProgressSteps()}

					<!-- Error notification -->
					${this.error ? this.renderErrorNotification() : ''}

					<schmancy-scroll hide>${this.renderCurrentStep()}</schmancy-scroll>
				</schmancy-grid>

				${when(this.bookingInProgress, () => this.renderProcessingOverlay())}
			</schmancy-surface>
		`
	}
}
