import { fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { getAuth } from 'firebase/auth'
import { Booking, bookingContext } from './context'
import { BookingService } from './services/booking.service'
import { CourtService } from './services/court.service'
import { AuthService } from './services/auth.service'
import { AvailabilityService } from './services/availability.service'
import './steps'
import { Court, Duration, TimeSlot } from './types'

/**
 * Court booking component
 * Integrates with backend API services and utilizes Schmancy UI components
 * for a consistent Material 3 experience
 */
@customElement('court-booking-system')
export class CourtBookingSystem extends $LitElement() {
	// Current UI state
	@state() hoveredTimeSlot: number | null = null
	@state() step: number = 1 // 1: Date, 2: Time, 3: Duration, 4: Court/Confirmation
	@state() selectedCourt: Court | null = null
	@state() bookingInProgress: boolean = false
	@state() availableTimeSlots: TimeSlot[] = []
	@state() availableCourts: Court[] = []
	@state() error: string | null = null
	@state() success: boolean = false

	@select(bookingContext) booking!: Booking

	// API services
	private auth = getAuth()
	private authService = new AuthService()
	private bookingService = new BookingService(this.authService)
	private courtService = new CourtService()
	private availabilityService = new AvailabilityService()

	// Common durations for booking
	private durations: Duration[] = [
		{ label: '30 min', value: 30, price: 15 },
		{ label: '1 hour', value: 60, price: 30 },
		{ label: '1.5 hours', value: 90, price: 45 },
		{ label: '2 hours', value: 120, price: 60 },
	]

	// Lifecycle method when component first connects to DOM
	connectedCallback() {
		super.connectedCallback()
		this.loadCourts()
	}

	// Load courts from backend API
	async loadCourts() {
		try {
			this.courtService.getActiveCourts().subscribe(
				courts => {
					this.availableCourts = Array.from(courts.entries()).map(([id, court]) => ({
						id,
						name: court.name,
						available: true,
						hourlyRate: court.hourlyRate,
					}))
				},
				error => {
					console.error('Error loading courts:', error)
					this.error = 'Failed to load courts. Please try again.'
				},
			)
		} catch (err) {
			console.error('Error loading courts:', err)
			this.error = 'Failed to load courts. Please try again.'
		}
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

	// Check court availability for the selected time and duration
	async checkCourtAvailability(date: string, startTime: number, duration: number) {
		try {
			const formattedDate = dayjs(date).format('YYYY-MM-DD')
			const startHour = Math.floor(startTime / 60)
			const startMinute = startTime % 60

			// Format time as HH:00 for our backend
			const formattedStartTime = `${startHour.toString().padStart(2, '0')}:${startMinute === 0 ? '00' : '30'}`

			// Calculate end time
			const endTimeMinutes = startTime + duration
			const endHour = Math.floor(endTimeMinutes / 60)
			const endMinute = endTimeMinutes % 60

			const formattedEndTime = `${endHour.toString().padStart(2, '0')}:${endMinute === 0 ? '00' : '30'}`

			return new Promise<Court[]>((resolve, reject) => {
				// Get availability for all courts - with the knowledge that slots are available by default
				this.availabilityService.getAllCourtsAvailability(formattedDate).subscribe(
					courtsAvailability => {
						// Create empty array for available courts
						const availableCourts: Court[] = []

						// If no courts data, assume all courts are available (use default behavior)
						if (!courtsAvailability || Object.keys(courtsAvailability).length === 0) {
							resolve(this.availableCourts)
							return
						}

						// Check each court's availability for the entire duration
						for (const [courtId, slots] of Object.entries(courtsAvailability)) {
							let isAvailable = true

							// Check each slot in the time range
							for (let h = startHour; h < endHour; h++) {
								const timeKey = `${h.toString().padStart(2, '0')}:00`

								// If slot exists and is explicitly marked unavailable, court is not available
								if (slots[timeKey] && !slots[timeKey].isAvailable) {
									isAvailable = false
									break
								}
								// If slot doesn't exist, assume it's available (default behavior)
							}

							if (isAvailable) {
								// Find court details
								const court = this.availableCourts.find(c => c.id === courtId)
								if (court) {
									availableCourts.push({
										...court,
										available: true,
									})
								}
							}
						}

						// For any court not in courtsAvailability, assume they're available too
						this.availableCourts.forEach(court => {
							if (
								!Object.keys(courtsAvailability).includes(court.id) &&
								!availableCourts.some(c => c.id === court.id)
							) {
								availableCourts.push({
									...court,
									available: true,
								})
							}
						})

						resolve(availableCourts)
					},
					error => {
						console.error('Error checking court availability:', error)
						this.error = 'Failed to check court availability. Please try again.'
						// On error, assume all courts are available
						resolve(this.availableCourts)
					},
				)
			})
		} catch (err) {
			console.error('Error checking court availability:', err)
			this.error = 'Failed to check court availability. Please try again.'
			// On error, assume all courts are available
			return this.availableCourts
		}
	}

	get duration() {
		if (!this.booking.startTime || !this.booking.endTime) return 0
		// calculate duration based on selected start and end time
		return dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minute')
	}

	get date() {
		return this.booking.startTime ? dayjs(this.booking.startTime).format('YYYY-MM-DD') : ''
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
		this.selectedCourt = null
	}

	// Handle duration selection
	private async handleDurationSelect(duration: Duration) {
		const startTime = dayjs(this.booking.startTime)
		const endTime = startTime.add(duration.value, 'minute').toISOString()

		bookingContext.set({
			endTime,
			price: duration.price,
		})

		// Check available courts for this time slot and duration
		const startTimeMinutes = startTime.hour() * 60 + startTime.minute()
		const availableCourts = await this.checkCourtAvailability(this.date, startTimeMinutes, duration.value)

		this.availableCourts = availableCourts
		this.step = 4 // Move to court selection/confirmation
	}

	// Handle court selection and create booking
	private async handleCourtSelect(court: Court) {
		this.selectedCourt = court
		this.bookingInProgress = true
		this.error = null

		try {
			const startTime = dayjs(this.booking.startTime)
			const endTime = dayjs(this.booking.endTime)

			// Format times for backend (HH:00)
			const formattedStartTime = startTime.format('HH:00')
			const formattedEndTime = endTime.format('HH:00')

			// Create booking request object
			const bookingRequest = {
				userId: this.authService.getCurrentUserId(),
				userName: this.auth.currentUser?.displayName || 'User',
				courtId: court.id,
				date: this.date,
				startTime: formattedStartTime,
				endTime: formattedEndTime,
				totalPrice: this.booking.price || 0,
			}

			// Create booking via API
			this.bookingService.createBooking(bookingRequest).subscribe({
				next: _booking => {
					// Show success
					this.success = true

					// Dispatch event for parent components
					this.dispatchEvent(
						new CustomEvent('booking-confirmed', {
							detail: {
								...this.booking,
								courtId: court.id,
								courtName: court.name,
							},
							bubbles: true,
							composed: true,
						}),
					)

					// Reset after delay
					setTimeout(() => {
						this.step = 1
						bookingContext.clear()
						this.success = false
					}, 3000)
				},
				error: error => {
					console.error('Error creating booking:', error)
					this.error = 'Failed to create booking. Please try again.'
					this.bookingInProgress = false
				},
			})
		} catch (err) {
			console.error('Error creating booking:', err)
			this.error = 'Failed to create booking. Please try again.'
			this.bookingInProgress = false
		}
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
			case 4:
				return html`
					<court-selection-step
						class="max-w-full p-4"
						.courts=${this.availableCourts}
						.selectedCourt=${this.selectedCourt}
						.bookingInProgress=${this.bookingInProgress}
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
