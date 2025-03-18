// src/public/book/book.ts
import { $notify, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html, PropertyValues } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { distinctUntilChanged, takeUntil } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { AvailabilityService } from 'src/bookingServices/availability'
import { CourtAssignmentService, CourtPreferences } from 'src/bookingServices/court-assignment.service'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import stripePromise, { $stripe, $stripeElements, appearance } from '../stripe'
import { BookingFlowManager, BookingStep } from './booking-flow-manager'
import { Booking, bookingContext } from './context'
import { CourtAssignmentHandler } from './court-assignment-handler'
import { BookingErrorHandler } from './error-handler'
import { PaymentStatusHandler } from './payment-status-handler'
import './steps'
import { Duration, TimeSlot } from './types'

/**
 * Court booking system component
 * Handles the complete booking flow from date selection to payment
 */
@customElement('court-booking-system')
export class CourtBookingSystem extends $LitElement() {
	// State
	@state() step: BookingStep = BookingStep.Date
	@state() selectedCourt?: Court = undefined
	@state() bookingInProgress: boolean = false
	@state() loadingCourts: boolean = false
	@state() error: string | null = null
	@state() courtPreferences: CourtPreferences = {}
	@state() bookingComplete: boolean = false

	// Contexts
	@select(courtsContext) availableCourts!: Map<string, Court>
	@select(venuesContext) venues!: Map<string, Venue>
	@select(bookingContext) booking!: Booking

	// DOM references
	@query('#stripe-element') stripeElement!: HTMLElement

	// Services and helpers
	private availabilityService = new AvailabilityService()
	private courtAssignmentService = new CourtAssignmentService(this.availabilityService)
	private paymentStatusHandler = new PaymentStatusHandler()
	private errorHandler = new BookingErrorHandler()
	private flowManager = new BookingFlowManager()
	private courtAssignmentHandler = new CourtAssignmentHandler(this.courtAssignmentService)

	// Booking steps definition
	private bookingSteps = [
		{ label: 'Date', icon: 'event' },
		{ label: 'Time', icon: 'schedule' },
		{ label: 'Preferences', icon: 'tune' },
		{ label: 'Duration', icon: 'timelapse' },
		{ label: 'Payment', icon: 'payment' },
	]

	// LIFECYCLE METHODS

	async connectedCallback() {
		super.connectedCallback()

		// Create payment slot
		this.setupPaymentSlot()

		// Add history state management
		window.addEventListener('popstate', this.handleHistoryNavigation.bind(this))

		// Initialize Stripe
		this.initializeStripe()
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		window.removeEventListener('popstate', this.handleHistoryNavigation.bind(this))
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Check for returning payment status
		this.checkPaymentStatus()

		// Set initial step based on URL parameters and booking data
		this.initializeStep()

		// Set initial price for stripe
		$stripe.next(this.booking.price)

		// Initialize history state if needed
		if (!window.history.state) {
			window.history.replaceState({ step: this.step }, '', `${window.location.pathname}?step=${this.step}`)
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
				$notify.error('Payment system initialization failed. Please try again later.')
			}
		})
	}

	private checkPaymentStatus(): void {
		this.paymentStatusHandler.checkUrlForPaymentStatus().subscribe(result => {
			if (result.processed && result.success && result.bookingId) {
				// Show confirmation for successful payment
				this.bookingComplete = true

				// Find selected court
				this.findSelectedCourt()
			}
		})
	}

	private findSelectedCourt(): void {
		this.selectedCourt = Array.from(this.availableCourts.values()).find(court => court.id === this.booking.courtId)

		if (!this.selectedCourt && this.availableCourts.size > 0) {
			this.selectedCourt = Array.from(this.availableCourts.values())[0]
			bookingContext.set({ courtId: this.selectedCourt.id }, true)
		}
	}

	private initializeStep(): void {
		const urlParams = new URLSearchParams(window.location.search)
		const stepParam = urlParams.get('step')
		const stepFromUrl = stepParam ? parseInt(stepParam, 10) : null
		const bookingIdInUrl = urlParams.get('booking')

		// Handle returning from payment with missing data
		const defaultData = this.flowManager.handleReturnFromPayment(this.booking, bookingIdInUrl)
		if (defaultData) {
			bookingContext.set(defaultData, true)
		}

		// Set initial step
		if (stepFromUrl && stepFromUrl >= BookingStep.Date && stepFromUrl <= BookingStep.Payment) {
			this.step = this.flowManager.navigateToStep(stepFromUrl, this.booking, this.courtPreferences, false)
		} else {
			this.step = this.flowManager.determineCurrentStep(this.booking, this.courtPreferences, false)
		}
	}

	// NAVIGATION METHODS

	private handleHistoryNavigation(event: PopStateEvent): void {
		this.flowManager.handleHistoryNavigation(event, this.booking, this.courtPreferences)
		this.step = this.flowManager.currentStep
	}

	private navigateToStep(newStep: BookingStep): void {
		this.step = this.flowManager.navigateToStep(newStep, this.booking, this.courtPreferences)
	}

	// EVENT HANDLERS

	private handleDateSelect(date: string): void {
		this.errorHandler.clearError()
		this.error = null

		// Update booking
		bookingContext.set({
			date: dayjs(date).format('YYYY-MM-DD'),
			startTime: '',
			endTime: '',
			price: 0,
			courtId: '',
		})

		// Clear dependent data
		this.courtPreferences = {}
		this.selectedCourt = undefined

		// Navigate to next step
		this.navigateToStep(BookingStep.Time)
	}

	private handleTimeSlotSelect(timeSlot: TimeSlot): void {
		if (!timeSlot.available) {
			$notify.error('This time slot is not available. Please select another time.')
			return
		}

		this.errorHandler.clearError()
		this.error = null

		// Update booking with selected time
		const selectedDate = dayjs(this.booking.date)
		const hour = Math.floor(timeSlot.value / 60)
		const minute = timeSlot.value % 60
		const newStartTime = selectedDate.hour(hour).minute(minute)

		bookingContext.set(
			{
				startTime: newStartTime.toISOString(),
				endTime: '',
				price: 0,
				courtId: '',
			},
			true,
		)

		// Clear dependent data
		this.courtPreferences = {}
		this.selectedCourt = undefined

		// Navigate to next step
		this.navigateToStep(BookingStep.Preferences)
	}

	private handleCourtPreferencesChange(preferences: CourtPreferences): void {
		this.courtPreferences = preferences
		this.navigateToStep(BookingStep.Duration)
	}

	// Updated method for CourtBookingSystem class

	// Use a more robust approach to get the tentative court
	private async handleDurationSelect(duration: Duration): Promise<void> {
		this.errorHandler.clearError()
		this.error = null

		// Start court assignment with loading indicator
		this.bookingInProgress = true
		try {
			// Get reference to the tentatively assigned court from the duration component
			const durationStep = this.shadowRoot?.querySelector('duration-selection-step') as any
			let tentativeAssignedCourt = null

			// Safely check if we can access the selectedCourt property
			if (durationStep && typeof durationStep.selectedCourt !== 'undefined') {
				tentativeAssignedCourt = durationStep.selectedCourt
				console.log('Using tentative court from duration step:', tentativeAssignedCourt?.name)
			}

			// Assign court based on preferences and availability
			// In your booking component

			this.courtAssignmentHandler
				.assignCourt(
					this.booking,
					duration.value,
					Array.from(this.availableCourts.values()),
					this.courtPreferences,
					tentativeAssignedCourt,
				)
				.subscribe({
					next: result => {
						if (result.success) {
							// Court assignment successful
							this.selectedCourt = result.court

							// Update booking with court, duration, and price
							bookingContext.set({
								courtId: result.court!.id,
								endTime: result.endTime,
								venueId: result.court!.venueId,
								price: result.price,
							})

							$stripe.next(result.price!)

							// Navigate to payment step
							this.navigateToStep(BookingStep.Payment)
						} else {
							// Court assignment failed
							this.error = result.error || 'No available courts found.'
							this.navigateToStep(BookingStep.Time)
						}
					},
					error: error => {
						console.error('Unexpected error in court assignment:', error)
						this.error = 'An unexpected error occurred. Please try again.'
					},
					complete: () => {},
				})
		} catch (error) {
			// Handle unexpected errors
			console.error('Error in court assignment flow:', error)
			this.error = 'An unexpected error occurred. Please try again.'
		} finally {
			this.bookingInProgress = false
		}
	}

	private handleStepClick(newStep: BookingStep): void {
		// Only allow going back to previous steps, not skipping ahead
		if (newStep <= this.step) {
			this.navigateToStep(newStep)
		}
	}

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
		url.searchParams.set('booking', this.booking.id)
		window.history.pushState({ step: 'confirmation' }, '', url.toString())
	}

	// HELPER METHODS

	private resetBooking(): void {
		this.bookingComplete = false
		this.error = null
		this.selectedCourt = undefined
		this.courtPreferences = {}

		// Reset booking context to initial state
		bookingContext.clear()
		bookingContext.set({
			id: '',
			userId: '',
			userName: '',
			courtId: '',
			date: '',
			startTime: '',
			endTime: '',
			price: 0,
			customerPhone: '',
			customerAddress: {
				street: '',
				city: '',
				postalCode: '',
				country: '',
			},
		})

		// Navigate to first step
		this.navigateToStep(BookingStep.Date)
	}

	// Calculate current duration in minutes
	get duration(): number {
		if (!this.booking.startTime || !this.booking.endTime) return 0
		return dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minute')
	}

	// RENDERING METHODS

	private renderProgressSteps() {
		return html`
			<funkhaus-booking-steps
				.steps=${this.bookingSteps}
				.currentStep=${this.step}
				?clickable=${true}
				@step-click=${(e: CustomEvent) => this.handleStepClick(e.detail.step)}
			></funkhaus-booking-steps>
		`
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
		return html`${when(
			this.step <= BookingStep.Duration,
			() => html`
				<date-selection-step
					.active=${this.step === BookingStep.Date}
					class="max-w-full sticky top-0 block my-2 z-0"
					.value=${this.booking.date}
					@change=${(e: CustomEvent<string>) => this.handleDateSelect(e.detail)}
				></date-selection-step>

				<time-selection-step
					.hidden=${this.step < BookingStep.Time}
					.active=${this.step === BookingStep.Time}
					class="max-w-full sticky top-0 block mt-2 z-10"
					.value=${this.booking?.startTime
						? dayjs(this.booking.startTime).hour() * 60 + dayjs(this.booking.startTime).minute()
						: undefined}
					@change=${(e: CustomEvent<TimeSlot>) => {
						this.handleTimeSlotSelect(e.detail)
					}}
				></time-selection-step>

				<court-preferences-step
					class="max-w-full block mt-2 z-20"
					.hidden=${this.step < BookingStep.Preferences}
					.active=${this.step === BookingStep.Preferences}
					.preferences=${this.courtPreferences}
					@change=${(e: CustomEvent<CourtPreferences>) => this.handleCourtPreferencesChange(e.detail)}
				></court-preferences-step>
				${when(
					this.step === BookingStep.Duration,
					() => html`<duration-selection-step
						class="max-w-full mt-2 block"
						.selectedDuration=${this.duration}
						@change=${(e: CustomEvent<Duration>) => this.handleDurationSelect(e.detail)}
					></duration-selection-step>`,
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
		)}`
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
				class="fixed inset-0 z-50  bg-opacity-70 backdrop-blur-sm flex items-center justify-center transition-opacity duration-300"
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
