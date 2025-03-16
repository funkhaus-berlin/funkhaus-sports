import { fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html, PropertyValues } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { AvailabilityService } from '../../bookingServices/availability.service'
import { Booking, bookingContext } from './context'
import './steps'
import { Court, Duration, TimeSlot } from './types'
// Import Stripe related dependencies
import { when } from 'lit/directives/when.js'
import { firstValueFrom } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { CourtAssignmentService, CourtAssignmentStrategy } from '../../bookingServices/court-assignment.service' // ← Add this import

/**
 * Court booking component with Stripe integration
 * Integrates with backend API services and Stripe for payments
 * Now with automatic court assignment
 */
@customElement('court-booking-system')
export class CourtBookingSystem extends $LitElement() {
	// Current UI state
	@state() hoveredTimeSlot: number | null = null
	@state() step: number = 1 // 1: Date, 2: Time, 3: Duration, 4: Payment/Confirmation (removed court selection step)
	@state() selectedCourt: Court | undefined = undefined
	@state() bookingInProgress: boolean = false
	@select(courtsContext)
	availableCourts: Court[] = []

	@state() error: string | null = null
	@state() success: boolean = false

	@query('#timer') timer!: HTMLDivElement

	@select(bookingContext) booking!: Booking

	// API services
	private availabilityService: AvailabilityService

	private courtAssignmentService: CourtAssignmentService

	// Updated booking steps (removed court selection)
	private bookingSteps = [
		{ label: 'Date', icon: 'event' },
		{ label: 'Time', icon: 'schedule' },
		{ label: 'Duration', icon: 'timelapse' },
		{ label: 'Payment', icon: 'payment' },
	]

	constructor() {
		super()
		this.availabilityService = new AvailabilityService()
		this.courtAssignmentService = new CourtAssignmentService(this.availabilityService)
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// increment steps based on selections
		if (this.booking.date) this.step = 2
		if (this.booking.date && this.booking.startTime) this.step = 3
		if (this.booking.date && this.booking.startTime && this.booking.endTime) this.step = 4
	}

	// Get total price for the booking
	get total() {
		return this.booking.price || 0
	}

	// Handle date selection
	private async handleDateSelect(date: string) {
		bookingContext.set({
			date: dayjs(date).format('YYYY-MM-DD'),
			startTime: dayjs(date).startOf('day').toISOString(),
		})
		this.step = 2
	}

	// Handle time slot selection
	private handleTimeSlotSelect(timeSlot: TimeSlot) {
		if (!timeSlot.available) return

		const selectedDate = dayjs(this.booking.startTime)
		const hour = Math.floor(timeSlot.value / 60)
		const minute = timeSlot.value % 60

		const newStartTime = selectedDate.hour(hour).minute(minute)

		bookingContext.set(
			{
				startTime: dayjs(newStartTime).toISOString(),
			},
			true,
		)

		this.step = 3 // Move to duration selection
		this.selectedCourt = undefined
	}

	private async handleDurationSelect(duration: Duration) {
		const startTime = dayjs(this.booking.startTime)
		const endTime = startTime.add(duration.value, 'minute').toISOString()

		bookingContext.set({
			endTime,
			price: duration.price,
		})

		// Begin automatic court assignment
		this.bookingInProgress = true

		try {
			const { selectedCourt } = await firstValueFrom(
				this.courtAssignmentService.checkAndAssignCourt(
					this.date,
					startTime.hour() * 60 + startTime.minute(),
					duration.value,
					this.availableCourts,
					CourtAssignmentStrategy.OPTIMAL,
					{}, // preferences can be set here
				),
			)

			if (!selectedCourt) {
				this.error = 'No available courts found for the selected duration. Please choose another time.'
				this.step = 2 // back to time selection
				return
			}

			this.selectedCourt = selectedCourt as Court

			bookingContext.set({
				courtId: selectedCourt.id,
			})

			this.step = 4 // Proceed to payment
		} catch (error) {
			console.error('Error assigning court:', error)
			this.error = 'Error assigning court. Please try again.'
			this.step = 3 // retry duration selection
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
					this.step = e.detail.step
					if (this.step === 3) {
						// reset duration  and court selection
						bookingContext.set({
							endTime: '',
							price: 0,
							courtId: '',
						})
					} else if (this.step === 2) {
						// reset court selection
						bookingContext.set({
							courtId: '',
						})
					} else if (this.step === 1) {
						// reset date, start time and court selection
						bookingContext.set({
							date: '',
							startTime: '',
							courtId: '',
						})
					}
				}}
			></funkhaus-booking-steps>
		`
	}

	// Main render method
	render() {
		return html`
			<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
				<schmancy-grid rows="auto 1fr" ${fullHeight()} flow="row" class="max-w-lg mx-auto pt-2">
					${this.renderProgressSteps()}
					<schmancy-scroll hide> ${this.renderCurrentStep()} </schmancy-scroll>
				</schmancy-grid>
			</schmancy-surface>
		`
	}

	private renderCurrentStep() {
		return html`${when(
			this.step <= 3,
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
				<duration-selection-step
					.hidden=${this.step !== 3}
					class="max-w-full p-4"
					.selectedDuration=${this.duration}
					@change=${(e: CustomEvent<Duration>) => this.handleDurationSelect(e.detail)}
				></duration-selection-step>
			`,
			() => html`<booking-payment-step>
				<slot slot="stripe-element" name="stripe-element"></slot>
			</booking-payment-step>`,
		)}`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'court-booking-system': CourtBookingSystem
	}
}
