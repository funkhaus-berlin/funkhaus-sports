// src/public/book/book.ts
import { $notify, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html, PropertyValues } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { catchError, distinctUntilChanged, finalize, firstValueFrom, of, take } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { AvailabilityService } from 'src/bookingServices/availability'
import {
	CourtAssignmentService,
	CourtAssignmentStrategy,
	CourtPreferences,
} from 'src/bookingServices/court-assignment.service'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import stripePromise, { $stripe, $stripeElements, appearance } from '../stripe'
import { Booking, bookingContext } from './context'
import { PaymentStatusHandler } from './payment-status-handler'
import './steps'
import { Duration, TimeSlot } from './types'

/**
 * Steps in the booking process
 */
enum BookingStep {
	Date = 1,
	Time = 2,
	Preferences = 3,
	Duration = 4,
	Payment = 5,
}

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

	// Services
	private availabilityService = new AvailabilityService()
	private courtAssignmentService = new CourtAssignmentService(this.availabilityService)
	private paymentStatusHandler = new PaymentStatusHandler()

	// Booking steps definition
	private bookingSteps = [
		{ label: 'Date', icon: 'event' },
		{ label: 'Time', icon: 'schedule' },
		{ label: 'Preferences', icon: 'tune' },
		{ label: 'Duration', icon: 'timelapse' },
		{ label: 'Payment', icon: 'payment' },
	]

	constructor() {
		super()
	}

	async connectedCallback() {
		super.connectedCallback()

		// Create and append payment slot
		const slot = document.createElement('slot')
		slot.name = 'stripe-element'
		slot.slot = 'stripe-element'
		this.append(slot)

		// Add history state management
		window.addEventListener('popstate', this.handleHistoryNavigation.bind(this))

		// Initialize Stripe when payment amount is set
		$stripe.pipe(distinctUntilChanged(), take(1)).subscribe(async amount => {
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

	disconnectedCallback() {
		super.disconnectedCallback()
		window.removeEventListener('popstate', this.handleHistoryNavigation.bind(this))
	}

	/**
	 * Handle navigation through browser history API
	 */
	private handleHistoryNavigation(event: PopStateEvent) {
		// Get step from history state
		const historyStep = event.state?.step || BookingStep.Date

		// Don't rely on event.state as it might be null when browser goes back to initial state
		// Instead, check URL parameters and booking context state to determine appropriate step
		if (historyStep && typeof historyStep === 'number') {
			// Update the step if a valid history state is available
			this.navigateToStep(historyStep, false)
		} else {
			// Fallback: Determine step based on booking data
			this.determineCurrentStep(false)
		}
	}

	/**
	 * Determine the appropriate step based on booking data
	 * @param updateHistory Whether to update browser history
	 */
	private determineCurrentStep(updateHistory: boolean = true) {
		let newStep: BookingStep

		// Logic to determine the appropriate step based on the booking context
		if (!this.booking.date) {
			newStep = BookingStep.Date
		} else if (!this.booking.startTime) {
			newStep = BookingStep.Time
		} else if (Object.keys(this.courtPreferences).length === 0) {
			newStep = BookingStep.Preferences
		} else if (!this.booking.endTime) {
			newStep = BookingStep.Duration
		} else {
			newStep = BookingStep.Payment
		}

		this.navigateToStep(newStep, updateHistory)
	}

	/**
	 * Navigate to a specific step and update browser history
	 * @param newStep The step to navigate to
	 * @param updateHistory Whether to update browser history
	 */
	private navigateToStep(newStep: BookingStep, updateHistory: boolean = true) {
		// Don't navigate to a higher step if booking data isn't ready
		if (newStep > BookingStep.Date && !this.booking.date) {
			newStep = BookingStep.Date
		} else if (newStep > BookingStep.Time && !this.booking.startTime) {
			newStep = BookingStep.Time
		} else if (newStep > BookingStep.Preferences && Object.keys(this.courtPreferences).length === 0) {
			newStep = BookingStep.Preferences
		} else if (newStep > BookingStep.Duration && !this.booking.endTime) {
			newStep = BookingStep.Duration
		}

		// Update the current step
		this.step = newStep

		// Update browser history if requested
		if (updateHistory) {
			const url = new URL(window.location.href)
			url.searchParams.set('step', newStep.toString())

			window.history.pushState({ step: newStep }, '', url.toString())
		}
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Check for returning payment status
		this.paymentStatusHandler.checkUrlForPaymentStatus().subscribe(result => {
			if (result.processed && result.success && result.bookingId) {
				// Show confirmation for successful payment
				this.bookingComplete = true

				// Find selected court
				this.selectedCourt = Array.from(this.availableCourts.values()).find(court => court.id === this.booking.courtId)

				// Set default court if needed
				if (!this.selectedCourt && this.availableCourts.size > 0) {
					this.selectedCourt = Array.from(this.availableCourts.values())[0]
					bookingContext.set({ courtId: this.selectedCourt.id }, true)
				}
			}
		})

		// Set initial step based on URL and context
		const urlParams = new URLSearchParams(window.location.search)
		const stepParam = urlParams.get('step')
		const stepFromUrl = stepParam ? parseInt(stepParam, 10) : null

		const bookingIdInUrl = urlParams.get('booking')

		if (bookingIdInUrl && (!this.booking.date || !this.booking.startTime)) {
			// Set default values for missing booking data when returning from payment
			bookingContext.set(
				{
					date: dayjs().format('YYYY-MM-DD'),
					startTime: dayjs().hour(10).minute(0).toISOString(),
					endTime: dayjs().hour(11).minute(0).toISOString(),
					price: 30,
				},
				true,
			)
		}

		// Determine initial state
		if (stepFromUrl && stepFromUrl >= BookingStep.Date && stepFromUrl <= BookingStep.Payment) {
			this.navigateToStep(stepFromUrl, false)
		} else {
			// No valid step parameter, determine from booking context
			this.determineCurrentStep(false)
		}

		// Set initial price for stripe
		$stripe.next(this.booking.price || 30)

		// Initialize history state if needed
		if (!window.history.state) {
			window.history.replaceState({ step: this.step }, '', `${window.location.pathname}?step=${this.step}`)
		}
	}

	// Event Handlers

	/**
	 * Handle date selection
	 */
	private handleDateSelect(date: string): void {
		this.error = null

		bookingContext.set({
			date: dayjs(date).format('YYYY-MM-DD'),
			startTime: '',
			endTime: '',
			price: 0,
			courtId: '',
		})

		// Clear any dependent data
		this.courtPreferences = {}
		this.selectedCourt = undefined

		this.navigateToStep(BookingStep.Time)
	}

	/**
	 * Handle time slot selection
	 */
	private handleTimeSlotSelect(timeSlot: TimeSlot): void {
		if (!timeSlot.available) {
			$notify.error('This time slot is not available. Please select another time.')
			return
		}

		this.error = null

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

		// Clear any dependent data
		this.courtPreferences = {}
		this.selectedCourt = undefined

		this.navigateToStep(BookingStep.Preferences)
	}

	/**
	 * Handle court preferences selection
	 */
	private handleCourtPreferencesChange(preferences: CourtPreferences): void {
		this.courtPreferences = preferences
		this.navigateToStep(BookingStep.Duration)
	}

	/**
	 * Handle duration selection and court assignment
	 */
	private async handleDurationSelect(duration: Duration): Promise<void> {
		this.error = null

		const startTime = dayjs(this.booking.startTime)
		const endTime = startTime.add(duration.value, 'minute').toISOString()

		bookingContext.set({
			endTime,
			price: duration.price,
		})

		// Update stripe with new price
		$stripe.next(duration.price)

		// Start court assignment
		this.bookingInProgress = true

		try {
			const courtsArray = Array.from(this.availableCourts.values())

			const { selectedCourt, message } = await firstValueFrom(
				this.courtAssignmentService
					.checkAndAssignCourt(
						this.booking.date,
						startTime.hour() * 60 + startTime.minute(),
						duration.value,
						courtsArray,
						CourtAssignmentStrategy.PREFERENCE_BASED,
						this.courtPreferences,
					)
					.pipe(
						catchError(error => {
							console.error('Error assigning court:', error)
							return of({
								selectedCourt: null,
								alternativeCourts: [],
								message: 'Error assigning court: ' + error.message,
							})
						}),
						finalize(() => {
							this.bookingInProgress = false
						}),
					),
			)

			if (!selectedCourt) {
				this.error =
					message || 'No available courts found for the selected time and duration. Please choose another time.'
				$notify.error(this.error)
				this.navigateToStep(BookingStep.Time)
				return
			}

			this.selectedCourt = selectedCourt

			bookingContext.set({
				courtId: selectedCourt.id,
			})

			$notify.success(`Court ${selectedCourt.name} assigned for your booking`)

			this.navigateToStep(BookingStep.Payment)
		} catch (error) {
			console.error('Error assigning court:', error)
			this.error = 'Error assigning court. Please try again.'
			$notify.error(this.error)
			this.navigateToStep(BookingStep.Time)
		} finally {
			this.bookingInProgress = false
		}
	}

	/**
	 * Handle steps navigation from progress bar
	 */
	private handleStepClick(newStep: BookingStep): void {
		if (newStep <= this.step) {
			this.navigateToStep(newStep)
		}
	}

	/**
	 * Handle booking completion
	 */
	/**
	 * Handle booking completion
	 */
	private handleBookingComplete(e: CustomEvent): void {
		// Show temporary processing overlay
		this.bookingInProgress = true

		// Update booking with data from event
		if (e.detail?.booking) {
			bookingContext.set(e.detail.booking)
		}

		// Ensure we have a selected court
		if (!this.selectedCourt) {
			this.selectedCourt = Array.from(this.availableCourts.values()).find(court => court.id === this.booking.courtId)

			if (!this.selectedCourt && this.availableCourts.size > 0) {
				this.selectedCourt = Array.from(this.availableCourts.values())[0]
				bookingContext.set({ courtId: this.selectedCourt.id }, true)
			}
		}

		// Update URL to show we're at the confirmation stage
		const url = new URL(window.location.href)
		url.searchParams.delete('step')
		url.searchParams.set('confirmation', 'true')

		// Use requestAnimationFrame to ensure smoother transitions
		requestAnimationFrame(() => {
			// Push state first
			window.history.pushState({ step: 'confirmation' }, '', url.toString())

			// Then set booking complete with slight delay to avoid rendering issues
			setTimeout(() => {
				this.bookingComplete = true
				this.bookingInProgress = false

				// Force re-render
				this.requestUpdate()
			}, 100)
		})
	}

	// Helper methods

	/**
	 * Reset booking state
	 */
	private resetBooking(): void {
		this.bookingComplete = false
		this.error = null
		this.selectedCourt = undefined
		this.courtPreferences = {}

		// Reset booking context
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

	/**
	 * Get booking duration in minutes
	 */
	get duration(): number {
		if (!this.booking.startTime || !this.booking.endTime) return 0
		return dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minute')
	}

	// UI rendering methods

	/**
	 * Render booking steps
	 */
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

	/**
	 * Render error notification
	 */
	private renderErrorNotification() {
		if (!this.error) return ''

		return html`
			<div class="bg-error-container text-error-on rounded-lg p-4 mb-4">
				<schmancy-flex align="center" gap="sm">
					<schmancy-icon>error</schmancy-icon>
					<schmancy-typography>${this.error}</schmancy-typography>
				</schmancy-flex>
				<schmancy-button variant="text" @click=${() => (this.error = null)} class="mt-2"> Dismiss </schmancy-button>
			</div>
		`
	}

	/**
	 * Render current booking step
	 */
	private renderCurrentStep() {
		return html`${when(
			this.step <= BookingStep.Duration,
			() => html`
				<date-selection-step
					.active=${this.step === BookingStep.Date}
					class="max-w-full sticky top-0  block my-2 z-0"
					.value=${this.booking.date}
					@change=${(e: CustomEvent<string>) => this.handleDateSelect(e.detail)}
				></date-selection-step>

				<time-selection-step
					.hidden=${this.step < BookingStep.Time}
					.active=${this.step === BookingStep.Time}
					class="max-w-full sticky top-0  block mt-2 z-10"
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

				<duration-selection-step
					.hidden=${this.step !== BookingStep.Duration}
					class="max-w-full mt-2 block"
					.selectedDuration=${this.duration}
					@change=${(e: CustomEvent<Duration>) => this.handleDurationSelect(e.detail)}
				></duration-selection-step>
			`,
			() => html`
				<booking-summery .booking=${this.booking} .selectedCourt=${this.selectedCourt} .duration=${this.duration}>
				</booking-summery>

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

	render() {
		// Show booking confirmation if complete
		if (this.bookingComplete) {
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

		// Main booking flow
		return html`
			<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
				<schmancy-grid rows="auto auto 1fr" ${fullHeight()} flow="row" class="max-w-lg mx-auto pt-2">
					${this.renderProgressSteps()}

					<!-- Error notification -->
					${this.error ? this.renderErrorNotification() : ''}

					<schmancy-scroll hide>${this.renderCurrentStep()}</schmancy-scroll>
				</schmancy-grid>

				${when(
					this.bookingInProgress,
					() => html`
						<div
							class="fixed inset-0 z-50 bg-surface-container bg-opacity-60 backdrop-blur-sm flex items-center justify-center"
						>
							<schmancy-surface type="container" rounded="all" class="p-6 shadow-lg w-full max-w-md">
								<schmancy-flex justify="center" flow="col" gap="md" align="center">
									<schmancy-spinner class="h-12 w-12" size="48px"></schmancy-spinner>
									<schmancy-typography type="title" token="sm"
										>Assigning the best court for your booking...</schmancy-typography
									>
									<schmancy-typography type="body" token="sm" class="text-center text-surface-on-variant">
										We're finding the perfect court for you based on your preferences and availability.
									</schmancy-typography>
								</schmancy-flex>
							</schmancy-surface>
						</div>
					`,
				)}
			</schmancy-surface>
		`
	}
}
