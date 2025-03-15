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
	@state() availableTimeSlots: TimeSlot[] = []
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

	// Load time slots for selected date from backend API
	async loadTimeSlots(date: string) {
		try {
			this.error = null
			const formattedDate = dayjs(date).format('YYYY-MM-DD')

			// Get all courts availability for the selected date
			// Use default operating hours 8AM-10PM (8-22)
			this.availabilityService.getAllCourtsAvailability(formattedDate).subscribe(
				courtsAvailability => {
					// Convert the backend availability data to time slots
					const slots: TimeSlot[] = []

					// If no courts have availability, use default hours (8AM-10PM)
					if (!courtsAvailability || Object.keys(courtsAvailability).length === 0) {
						// Create default time slots (8AM-10PM)
						for (let hour = 8; hour < 22; hour++) {
							const timeKey = `${hour.toString().padStart(2, '0')}:00`
							const value = hour * 60

							slots.push({
								label: timeKey,
								value,
								available: true, // Default to available
							})
						}
					} else {
						// Get availability for first court as sample (we'll filter more specifically later)
						const firstCourtId = Object.keys(courtsAvailability)[0]
						const firstCourtSlots = courtsAvailability[firstCourtId]

						// Convert backend time format (HH:00) to minutes for our UI
						Object.entries(firstCourtSlots).forEach(([timeKey, timeSlot]) => {
							const [hour, minute] = timeKey.split(':').map(Number)
							const value = hour * 60 + (minute || 0)

							slots.push({
								label: timeKey,
								value,
								available: timeSlot.isAvailable,
							})
						})
					}

					// Sort by time
					slots.sort((a, b) => a.value - b.value)
					this.availableTimeSlots = slots
				},
				error => {
					console.error('Error loading time slots:', error)
					this.error = 'Failed to load availability. Please try again.'

					// Create default time slots on error (8AM-10PM)
					const defaultSlots: TimeSlot[] = []
					for (let hour = 8; hour < 22; hour++) {
						const timeKey = `${hour.toString().padStart(2, '0')}:00`
						const value = hour * 60

						defaultSlots.push({
							label: timeKey,
							value,
							available: true, // Default to available
						})
					}

					this.availableTimeSlots = defaultSlots
				},
			)
		} catch (err) {
			console.error('Error loading time slots:', err)
			this.error = 'Failed to load availability. Please try again.'

			// Create default time slots on error (8AM-10PM)
			const defaultSlots: TimeSlot[] = []
			for (let hour = 8; hour < 22; hour++) {
				const timeKey = `${hour.toString().padStart(2, '0')}:00`
				const value = hour * 60

				defaultSlots.push({
					label: timeKey,
					value,
					available: true, // Default to available
				})
			}

			this.availableTimeSlots = defaultSlots
		}
	}

	// Handle date selection
	private async handleDateSelect(date: string) {
		bookingContext.set({
			startTime: dayjs(date).startOf('day').toISOString(),
		})

		// Load available time slots for this date
		await this.loadTimeSlots(date)
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

	private handleStepClick(stepNumber: number) {
		// Only allow going back or to already completed steps
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
				class="pt-2"
			></funkhaus-booking-steps>
		`
	}

	private renderError() {
		return this.error ? html` <schmancy-alert type="error" class="mt-4"> ${this.error} </schmancy-alert> ` : null
	}

	private renderSuccess() {
		return this.success
			? html` <schmancy-alert type="success" class="mt-4"> Booking created successfully! </schmancy-alert> `
			: null
	}

	// Main render method
	render() {
		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all" elevation="1">
				<schmancy-flex ${fullHeight()} flow="col" class="max-w-lg mx-auto" gap="md">
					${this.renderProgressSteps()}

					<schmancy-scroll flex> ${this.renderCurrentStep()} </schmancy-scroll>

					${this.renderError()} ${this.renderSuccess()}
				</schmancy-flex>
			</schmancy-surface>
		`
	}

	private renderCurrentStep() {
		switch (this.step) {
			case 1:
				return html`
					<date-selection-step
						class="max-w-full"
						.value=${this.booking.startTime}
						@change=${(e: CustomEvent<string>) => this.handleDateSelect(e.detail)}
					></date-selection-step>
				`
			case 2:
				return html`
					<time-selection-step
						class="max-w-full"
						.slots=${this.availableTimeSlots}
						.value=${this.booking?.startTime
							? dayjs(this.booking.startTime).hour() * 60 + dayjs(this.booking.startTime).minute()
							: undefined}
						@change=${(e: CustomEvent<TimeSlot>) => this.handleTimeSlotSelect(e.detail)}
					></time-selection-step>
				`
			case 3:
				return html`
					<duration-selection-step
						class="max-w-full p-4"
						.durations=${this.durations}
						.selectedDuration=${this.duration}
						@change=${(e: CustomEvent<Duration>) => this.handleDurationSelect(e.detail)}
					></duration-selection-step>
				`
			case 4: // Payment is now step 4 instead of 5
				return html`<booking-payment-step>
					<slot name="stripe-element"></slot>
				</booking-payment-step>`
		}
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'court-booking-system': CourtBookingSystem
	}
}
