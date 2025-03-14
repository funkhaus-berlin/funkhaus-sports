import { fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { Booking, bookingContext } from './context'
import './steps'
import { Court, Duration, TimeSlot } from './types'
import { generateAvailability } from './utils'
/**
 * Simplified Court booking component
 * Utilizes Schmancy UI components for a consistent Material 3 experience
 */
@customElement('court-booking-system')
export class CourtBookingSystem extends $LitElement() {
	// Current UI state
	@state() hoveredTimeSlot: number | null = null
	@state() step: number = 1 // 1: Date, 2: Time, 3: Duration, 4: Court/Confirmation
	@state() selectedCourt: Court | null = null
	@state() bookingInProgress: boolean = false

	@select(bookingContext) booking!: Booking
	// Sample availability data - in a real app this would come from your API
	private mockAvailability: Record<string, boolean> = generateAvailability(
		480, // 8:00 AM
		1320, // 10:00 PM
		[540, 570, 750], // 9:00 AM, 9:30 AM, 12:30 PM are unavailable
	)

	// Common durations for booking
	private durations: Duration[] = [
		{ label: '30 min', value: 30, price: 15 },
		{ label: '1 hour', value: 60, price: 30 },
		{ label: '1.5 hours', value: 90, price: 45 },
		{ label: '2 hours', value: 120, price: 60 },
	]

	// Generate available time slots for the selected date
	private getTimeSlots(): TimeSlot[] {
		const slots: TimeSlot[] = []

		// Generate time slots from 7 AM to 10 PM with 30 minute intervals
		for (let hour = 7; hour <= 22; hour++) {
			// Full hour slot (e.g., 7:00)
			const hourSlotValue = hour * 60
			slots.push({
				label: `${hour}:00`,
				value: hourSlotValue,
				available: this.mockAvailability[hourSlotValue.toString()] !== false,
			})

			// Half hour slot (e.g., 7:30) if not the last hour
			if (hour < 22) {
				const halfHourSlotValue = hour * 60 + 30
				slots.push({
					label: `${hour}:30`,
					value: halfHourSlotValue,
					available: this.mockAvailability[halfHourSlotValue.toString()] !== false,
				})
			}
		}
		return slots
	}

	get duration() {
		// calculate duration based on selected start and end time using dayjs
		// return duration in minutes
		return dayjs(this.booking.startTime).diff(dayjs(this.booking.endTime), 'minute')
	}

	get date() {
		return dayjs(this.booking.startTime).toISOString()
	}

	// Generate available courts for the selected time and duration
	private getAvailableCourts(): Court[] {
		if (!this.booking.startTime || !this.duration) {
			return []
		}

		// This would check actual availability against bookings in a real implementation
		const endTime = this.booking.startTime + this.duration

		// Check if the entire time range is available
		const availableCourts: Court[] = []
		let isAvailable = true

		// Check each 30-min slot in the range
		for (let time = this.booking.startTime; time < endTime; time += 30) {
			if (this.mockAvailability[time.toString()] === false) {
				isAvailable = false
				break
			}
		}

		if (isAvailable) {
			// Create courts
			for (let i = 1; i <= 5; i++) {
				availableCourts.push({
					id: `court${i}`,
					name: `Court ${i}`,
					available: true,
				})
			}
		}

		return availableCourts
	}

	// Handle date selection
	private handleDateSelect(date: string) {
		bookingContext.set({
			startTime: dayjs(date).startOf('day').toISOString(),
		})
		this.step = 2
	}

	// Handle time slot selection
	private handleTimeSlotSelect(timeSlot: TimeSlot) {
		bookingContext.set(
			{
				startTime: dayjs(this.booking.startTime)
					.hour(Math.floor(timeSlot.value / 60))
					.minute(timeSlot.value % 60)
					.toISOString(),
			},
			true,
		)
		this.step = 3 // Move to duration selection
		this.selectedCourt = null
	}

	// Handle duration selection
	private handleDurationSelect(duration: Duration) {
		bookingContext.set({
			endTime: dayjs(this.booking.startTime).add(duration.value, 'minute').toISOString(),
		})
		this.step = 4 // Move to court selection/confirmation
	}

	// Handle court selection
	private handleCourtSelect(court: Court) {
		this.selectedCourt = court
		this.bookingInProgress = true

		// Simulate API call with a timeout
		setTimeout(() => {
			this.bookingInProgress = false

			// In a real implementation, this would trigger the reservation process
			this.dispatchEvent(
				new CustomEvent('booking-confirmed', {
					detail: this.booking,
					bubbles: true,
					composed: true,
				}),
			)

			// Reset for a new booking
			this.step = 1
			bookingContext.clear()
		}, 1500)
	}

	// Go back to previous step
	// private goBack() {
	// 	if (this.step > 1) {
	// 		this.step -= 1
	// 	}
	// }

	private bookingSteps = [
		{ label: 'Date', icon: 'event' },
		{ label: 'Time', icon: 'schedule' },
		{ label: 'Duration', icon: 'timelapse' },
		{ label: 'Confirm', icon: 'confirmation_number' },
	]

	private handleStepClick(stepNumber: number) {
		// Optional validation: only allow going back or to already completed steps
		if (stepNumber <= this.step) {
			this.step = stepNumber
		}
	}
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

	// Main render method
	render() {
		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all" elevation="1">
				<schmancy-grid ${fullHeight()} rows="auto 1fr" class="max-w-lg mx-auto" justify="stretch" gap="md">
					${this.renderProgressSteps()}

					<schmancy-scroll> ${this.renderCurrentStep()} </schmancy-scroll>
				</schmancy-grid>
			</schmancy-surface>
		`
	}

	private renderCurrentStep() {
		switch (this.step) {
			case 1:
				return html`
					<date-selection-step
						class="max-w-[100vw] sm:max-w-sm md:max-w-md lg:max-w-lg"
						.value=${this.booking.startTime}
						@change=${(e: CustomEvent<string>) => this.handleDateSelect(e.detail)}
					></date-selection-step>
				`
			case 2:
				return html`
					<time-selection-step
						class="max-w-[100vw] sm:max-w-sm md:max-w-md lg:max-w-lg"
						.slots=${this.getTimeSlots()}
						.value=${this.booking?.startTime
							? dayjs(this.booking.startTime).hour() * 60 + dayjs(this.booking.startTime).minute()
							: undefined}
						@change=${(e: CustomEvent<TimeSlot>) => this.handleTimeSlotSelect(e.detail)}
					></time-selection-step>
				`
			case 3:
				return html`
					<duration-selection-step
						class="max-w-[100vw] sm:max-w-sm md:max-w-md lg:max-w-lg"
						.durations=${this.durations}
						.selectedDuration=${this.duration!}
						@change=${(e: CustomEvent<Duration>) => this.handleDurationSelect(e.detail)}
					></duration-selection-step>
				`
			case 4:
				return html`
					<court-selection-step
						class="max-w-[100vw] sm:max-w-sm md:max-w-md lg:max-w-lg"
						.courts=${this.getAvailableCourts()}
						.selectedCourt=${this.selectedCourt!}
						@court-selected=${(e: CustomEvent<Court>) => this.handleCourtSelect(e.detail)}
					></court-selection-step>
				`
		}
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'court-booking-system': CourtBookingSystem
	}
}
