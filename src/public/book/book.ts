import { fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { Booking, bookingContext } from './context'
import './steps'
import { Court, Duration, TimeSlot } from './types'
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
	private mockAvailability: Record<string, boolean> = {
		'480': true, // 8:00 AM
		'510': true, // 8:30 AM
		'540': false, // 9:00 AM
		'570': false, // 9:30 AM
		'600': true, // 10:00 AM
		'630': true,
		'660': true,
		'690': true,
		'720': true,
		'750': false,
		'780': true,
		'810': true,
		'840': true,
		'870': true,
		'900': true,
		'930': true,
		'960': true,
		'990': true,
		'1020': true,
		'1050': true,
		'1080': true,
		'1110': true,
		'1140': true,
		'1170': true,
		'1200': true,
		'1230': true,
		'1260': true,
		'1290': true,
		'1320': true,
	}

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
		bookingContext.set({
			startTime: dayjs(timeSlot.value).startOf('day').add(timeSlot.value, 'minute').toISOString(),
		})
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
	private goBack() {
		if (this.step > 1) {
			this.step -= 1
		}
	}

	// Get price based on selected duration
	private getPrice(): number {
		if (!this.duration) return 0
		const duration = this.durations.find(d => d.value === this.duration)
		return duration?.price || 0
	}
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
				<schmancy-grid class="max-w-lg mx-auto" justify="stretch" gap="lg">
					${this.renderProgressSteps()} ${this.renderCurrentStep()}
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
						.value=${this.date}
						@change=${(e: CustomEvent<string>) => this.handleDateSelect(e.detail)}
					></date-selection-step>
				`
			case 2:
				return html`
					<time-selection-step
						.slots=${this.getTimeSlots()}
						.value=${this.booking.startTime!}
						@change=${(e: CustomEvent<TimeSlot>) => this.handleTimeSlotSelect(e.detail)}
					></time-selection-step>
				`
			case 3:
				return html`
					<duration-selection-step
						.durations=${this.durations}
						.selectedDuration=${this.duration!}
						@change=${(e: CustomEvent<Duration>) => this.handleDurationSelect(e.detail)}
					></duration-selection-step>
				`
			case 4:
				return html`
					<court-selection-step
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
