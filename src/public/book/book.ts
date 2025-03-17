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
import bookingSummery from './steps/booking-summery'
import { Duration, TimeSlot } from './types'

/**
 * Court booking system component
 * Handles the complete booking flow from date selection to payment
 */
@customElement('court-booking-system')
export class CourtBookingSystem extends $LitElement() {
	// State
	@state() step: number = 1 // 1: Date, 2: Time, 3: Court Preferences, 4: Duration, 5: Payment
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

		// Set initial step based on context
		if (this.booking.date) this.step = 2
		if (this.booking.date && this.booking.startTime) this.step = 3
		if (this.booking.date && this.booking.startTime && Object.keys(this.courtPreferences).length > 0) this.step = 4
		if (this.booking.date && this.booking.startTime && this.booking.endTime) this.step = 5

		// Set initial price
		$stripe.next(this.booking.price || 30)

		// Restore booking from URL if needed
		const urlParams = new URLSearchParams(window.location.search)
		const bookingIdInUrl = urlParams.get('booking')

		if (bookingIdInUrl && (!this.booking.date || !this.booking.startTime)) {
			// Set default values for missing booking data
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
		})

		this.step = 2
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
			},
			true,
		)

		this.step = 3
		this.selectedCourt = undefined
	}

	/**
	 * Handle court preferences selection
	 */
	private handleCourtPreferencesChange(preferences: CourtPreferences): void {
		this.courtPreferences = preferences
		this.step = 4
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
				this.step = 2 // Go back to time selection
				return
			}

			this.selectedCourt = selectedCourt

			bookingContext.set({
				courtId: selectedCourt.id,
			})

			$notify.success(`Court ${selectedCourt.name} assigned for your booking`)

			this.step = 5 // Proceed to payment
		} catch (error) {
			console.error('Error assigning court:', error)
			this.error = 'Error assigning court. Please try again.'
			$notify.error(this.error)
			this.step = 2
		} finally {
			this.bookingInProgress = false
		}
	}

	/**
	 * Handle booking completion
	 */
	private handleBookingComplete(e: CustomEvent): void {
		this.bookingComplete = true

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
	}

	// Helper methods

	/**
	 * Reset booking state
	 */
	private resetBooking(): void {
		this.bookingComplete = false
		this.step = 1
		this.error = null
		this.selectedCourt = undefined
		this.courtPreferences = {}

		// Reset booking context
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
				@step-click=${(e: CustomEvent) => {
					const newStep = e.detail.step

					// Handle backwards navigation
					if (newStep < this.step) {
						this.step = newStep

						if (newStep <= 4) {
							// Reset payment info
							bookingContext.set({ id: '' })
						}

						if (newStep <= 3) {
							// Reset duration and court selection
							bookingContext.set({
								endTime: '',
								price: 0,
								courtId: '',
							})
						}

						if (newStep <= 2) {
							// Reset preferences
							this.courtPreferences = {}
						}

						if (newStep <= 1) {
							// Reset date and time
							bookingContext.set({
								date: '',
								startTime: '',
								courtId: '',
							})
						}
					}
				}}
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
			this.step <= 4,
			() => html`
				<date-selection-step
					.active=${this.step === 1}
					class="max-w-full sticky top-0 z-30"
					.value=${this.booking.startTime}
					@change=${(e: CustomEvent<string>) => this.handleDateSelect(e.detail)}
				></date-selection-step>

				<time-selection-step
					.hidden=${this.step < 2}
					.active=${this.step === 2}
					class="max-w-full"
					.value=${this.booking?.startTime
						? dayjs(this.booking.startTime).hour() * 60 + dayjs(this.booking.startTime).minute()
						: undefined}
					@change=${(e: CustomEvent<TimeSlot>) => this.handleTimeSlotSelect(e.detail)}
				></time-selection-step>

				<court-preferences-step
					.hidden=${this.step < 3}
					.active=${this.step === 3}
					.preferences=${this.courtPreferences}
					@change=${(e: CustomEvent<CourtPreferences>) => this.handleCourtPreferencesChange(e.detail)}
				></court-preferences-step>

				<duration-selection-step
					.hidden=${this.step !== 4}
					class="max-w-full p-4"
					.selectedDuration=${this.duration}
					@change=${(e: CustomEvent<Duration>) => this.handleDurationSelect(e.detail)}
				></duration-selection-step>
			`,
			() => html`
				${bookingSummery(this.booking, this.selectedCourt!, this.duration, this.courtPreferences)}

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
						<schmancy-busy class="z-50">
							<schmancy-flex flow="row" gap="sm" align="center">
								<schmancy-spinner class="h-12 w-12" size="48px"></schmancy-spinner>
								<schmancy-typography>Assigning the best court for your booking...</schmancy-typography>
							</schmancy-flex>
						</schmancy-busy>
					`,
				)}
			</schmancy-surface>
		`
	}
}
