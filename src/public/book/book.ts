// src/public/book/book.ts

import { $notify, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html, PropertyValues } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { BookingService } from 'src/bookingServices/booking.service'
import { Booking, bookingContext } from './context'
import './steps'
import { Duration, TimeSlot } from './types'
// Import Stripe related dependencies
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { when } from 'lit/directives/when.js'
import { catchError, distinctUntilChanged, finalize, firstValueFrom, of, take, tap } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { AvailabilityService } from 'src/bookingServices/availability'
import {
	CourtAssignmentService,
	CourtAssignmentStrategy,
	CourtPreferences,
} from 'src/bookingServices/court-assignment.service'
import { Court } from 'src/db/courts.collection'
import bookingSummery from './steps/booking-summery'
import { StripeElements, StripePaymentElement } from '@stripe/stripe-js'
import stripePromise, { $stripe, appearance, $stripeElements } from '../stripe'

/**
 * Court booking component with Stripe integration
 * Integrates with backend API services and Stripe for payments
 * Now with automatic court assignment and real-time availability
 */
@customElement('court-booking-system')
export class CourtBookingSystem extends $LitElement() {
	// Current UI state
	@state() hoveredTimeSlot: number | null = null
	@state() step: number = 1 // 1: Date, 2: Time, 3: Court Preferences, 4: Duration, 5: Payment/Confirmation
	@state() selectedCourt: Court | undefined = undefined
	@state() bookingInProgress: boolean = false
	@state() loadingCourts: boolean = false
	@select(courtsContext)
	availableCourts!: Map<string, Court>

	@state() error: string | null = null
	@state() success: boolean = false
	@state() courtPreferences: CourtPreferences = {}

	@query('#timer') timer!: HTMLDivElement

	@select(bookingContext) booking!: Booking

	// API services
	private availabilityService: AvailabilityService
	private courtAssignmentService: CourtAssignmentService
	bookingService: BookingService
	private auth = getAuth()

	// Updated booking steps with Court Preferences as a separate step
	private bookingSteps = [
		{ label: 'Date', icon: 'event' },
		{ label: 'Time', icon: 'schedule' },
		{ label: 'Preferences', icon: 'tune' },
		{ label: 'Duration', icon: 'timelapse' },
		{ label: 'Payment', icon: 'payment' },
	]

	constructor() {
		super()
		this.availabilityService = new AvailabilityService()
		this.courtAssignmentService = new CourtAssignmentService(this.availabilityService)
		this.bookingService = new BookingService()

		// Listen for auth state changes
		onAuthStateChanged(this.auth, user => {
			if (user) {
				// User is signed in
				bookingContext.set(
					{
						userId: user.uid,
						userName: user.displayName || user.email || 'Anonymous User',
					},
					true,
				)
			}
		})
	}

	elements: StripeElements | undefined
	paymentElement: StripePaymentElement | undefined

	async connectedCallback() {
		super.connectedCallback()
		// Create and append the payment element slot
		const slot = document.createElement('slot')
		slot.name = 'stripe-element'
		slot.slot = 'stripe-element'
		this.append(slot)

		const stripe = await stripePromise
		// Initialize Stripe elements when payment amount is available
		$stripe.pipe(distinctUntilChanged(), take(1)).subscribe(amount => {
			this.elements = stripe?.elements({
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

			const paymentElementOptions = {
				layout: 'tabs',
				billingDetails: {},
				fields: {
					billingDetails: {
						address: 'never',
					},
				},
			}
			// @ts-ignore
			this.paymentElement = this.elements?.create('payment', {
				...paymentElementOptions,
			}) as StripePaymentElement
			this.paymentElement.mount('#stripe-element')
			this.paymentElement.on('ready', () => {
				$stripeElements.next(this.elements)
			})
		})

		// Update payment amount when it changes
		$stripe
			.pipe(
				distinctUntilChanged(),
				tap({
					next: amount => {
						const elements = $stripeElements.value
						if (elements) {
							elements.update({
								amount: amount * 100,
							})
						}
					},
				}),
			)
			.subscribe()
	}
	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Load courts
		this.loadingCourts = true

		// Increment steps based on selections
		if (this.booking.date) this.step = 2
		if (this.booking.date && this.booking.startTime) this.step = 3
		if (this.booking.date && this.booking.startTime && this.courtPreferences) this.step = 4
		if (this.booking.date && this.booking.startTime && this.courtPreferences && this.booking.endTime) this.step = 5
	}

	// Get total price for the booking
	get total() {
		return this.booking.price || 0
	}

	// Handle date selection
	private async handleDateSelect(date: string) {
		this.error = null
		bookingContext.set({
			date: dayjs(date).format('YYYY-MM-DD'),
			startTime: dayjs(date).startOf('day').toISOString(),
		})
		this.step = 2
	}

	// Handle time slot selection
	private handleTimeSlotSelect(timeSlot: TimeSlot) {
		if (!timeSlot.available) return
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

		this.step = 3 // Move to court preferences selection
		this.selectedCourt = undefined
	}

	// Handle court preferences update
	private handleCourtPreferencesChange(preferences: CourtPreferences) {
		this.courtPreferences = preferences

		// After selecting preferences, move to duration step
		this.step = 4
	}

	// Handle duration selection
	private async handleDurationSelect(duration: Duration) {
		this.error = null
		const startTime = dayjs(this.booking.startTime)
		const endTime = startTime.add(duration.value, 'minute').toISOString()

		bookingContext.set({
			endTime,
			price: duration.price,
		})

		// Begin automatic court assignment
		this.bookingInProgress = true

		try {
			// Convert availableCourts Map to Array if needed
			const courtsArray: Court[] = Array.from(this.availableCourts.values())

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
				this.error = message || 'No available courts found for the selected duration. Please choose another time.'
				this.step = 2 // back to time selection
				return
			}

			this.selectedCourt = selectedCourt

			bookingContext.set({
				courtId: selectedCourt.id,
			})

			// Show success message with court assignment
			$notify.success(`Court ${selectedCourt.name} assigned for your booking`)

			this.step = 5 // Proceed to payment
		} catch (error) {
			console.error('Error assigning court:', error)
			this.error = 'Error assigning court. Please try again.'
			this.step = 4 // retry duration selection
		} finally {
			this.bookingInProgress = false
		}
	}

	// Helper getters
	get duration() {
		if (!this.booking.startTime || !this.booking.endTime) return 0
		// calculate duration based on selected start and end time
		return dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minute')
	}

	get date() {
		return this.booking.startTime ? dayjs(this.booking.startTime).format('YYYY-MM-DD') : ''
	}

	private renderProgressSteps() {
		return html`
			<funkhaus-booking-steps
				.steps=${this.bookingSteps}
				.currentStep=${this.step}
				?clickable=${true}
				@step-click=${(e: CustomEvent) => {
					const newStep = e.detail.step

					// Handle backwards navigation and reset appropriate state
					if (newStep < this.step) {
						this.step = newStep

						if (newStep <= 4) {
							// Reset payment info
							bookingContext.set({
								id: '',
							})
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
							// Reset date, start time and court selection
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

	// Error notification component
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

	// Main render method
	@state() bookingComplete: boolean = false

	// Reset the booking and start a new one
	private resetBooking() {
		this.bookingComplete = false
		this.step = 1
		this.error = null
		this.selectedCourt = undefined
		this.courtPreferences = {}

		// Reset booking context
		bookingContext.set({
			id: '',
			userId: this.auth.currentUser?.uid || '',
			userName: this.auth.currentUser?.displayName || '',
			courtId: '',
			date: '',
			startTime: '',
			endTime: '',
			price: 0,
		})
	}

	render() {
		// Show booking confirmation if booking is complete
		if (this.bookingComplete) {
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

		return html`
			<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
				<schmancy-grid rows="auto auto 1fr" ${fullHeight()} flow="row" class="max-w-lg mx-auto pt-2">
					${this.renderProgressSteps()}

					<!-- Error notification -->
					${this.error ? this.renderErrorNotification() : ''}

					<schmancy-scroll hide> ${this.renderCurrentStep()} </schmancy-scroll>
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

	// Listen for booking complete event
	private handleBookingComplete(_e: CustomEvent) {
		this.bookingComplete = true
		this.selectedCourt = Array.from(this.availableCourts.values()).find(court => court.id === this.booking.courtId)
	}

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
					.hidden=${this.step !== 3}
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
				<booking-payment-step @booking-complete=${this.handleBookingComplete}>
					<slot slot="stripe-element" name="stripe-element"></slot>
				</booking-payment-step>
			`,
		)}`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'court-booking-system': CourtBookingSystem
	}
}
