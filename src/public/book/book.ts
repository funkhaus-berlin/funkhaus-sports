import { fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { AvailabilityService } from './availability.service'
import { Booking, bookingContext } from './context'
import './steps'
import { Court, Duration, TimeSlot } from './types'
// Import Stripe related dependencies
import { firstValueFrom } from 'rxjs'
import { courtsContext } from 'src/admin/courts/context'
import { CourtAssignmentService, CourtAssignmentStrategy } from './court-assignment.service' // ← Add this import

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
	@select(courtsContext, (courtes: Map<string, Court>) => Array.from(courtes.values())) availableCourts: Court[] = []

	@state() error: string | null = null
	@state() success: boolean = false

	@query('#timer') timer!: HTMLDivElement

	@select(bookingContext) booking!: Booking

	// API services
	private availabilityService: AvailabilityService

	private courtAssignmentService: CourtAssignmentService

	// Common durations for booking
	private durations: Duration[] = [
		{ label: '30 min', value: 30, price: 15 },
		{ label: '1 hour', value: 60, price: 30 },
		{ label: '1.5 hours', value: 90, price: 45 },
		{ label: '2 hours', value: 120, price: 60 },
	]

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

		const newStartTime = selectedDate.hour(hour).minute(minute).toISOString()

		bookingContext.set(
			{
				startTime: newStartTime,
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
				@step-click=${(e: CustomEvent) => (this.step = e.detail.step)}
			></funkhaus-booking-steps>
		`
	}

	// Main render method
	render() {
		return html`
			<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
				<schmancy-grid rows="auto 1fr" ${fullHeight()} flow="row" class="max-w-lg mx-auto" gap="sm">
					${this.renderProgressSteps()}
					<schmancy-scroll> ${this.renderCurrentStep()} </schmancy-scroll>
				</schmancy-grid>
			</schmancy-surface>
		`
	}

	private renderCurrentStep() {
		switch (this.step) {
			case 1:
			case 2:
			case 3:
				return html`
					<date-selection-step
						.active=${this.step === 1}
						class="max-w-full sticky top-0 z-10"
						.value=${this.booking.startTime}
						@change=${(e: CustomEvent<string>) => this.handleDateSelect(e.detail)}
					></date-selection-step>
					<time-selection-step
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
						.durations=${this.durations}
						.selectedDuration=${this.duration}
						@change=${(e: CustomEvent<Duration>) => this.handleDurationSelect(e.detail)}
					></duration-selection-step>
				`

				return html``
			case 4: // Payment is now step 4 instead of 5
				return html`<booking-payment-step>
					<slot slot="stripe-element" name="stripe-element"></slot>
				</booking-payment-step>`
		}
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'court-booking-system': CourtBookingSystem
	}
}
