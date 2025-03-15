import { $notify, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { html } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { Subject, catchError, from, map, retry, switchMap } from 'rxjs'
import { Booking, bookingContext } from './context'
import { AuthService } from '../../firebase/auth.service'
import { AvailabilityService } from './availability.service'
import { BookingService } from './services/booking.service'
import './steps'
import { Court, Duration, TimeSlot } from './types'
// Import Stripe related dependencies
import { StripeElements } from '@stripe/stripe-js'
import { auth } from 'src/firebase/firebase'
import { BookingFormData } from '../../db/interface'
import stripePromise, { $stripe, $stripeElements, createPaymentIntent } from '../stripe'
import { courtsContext } from 'src/admin/courts/context'

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
	@state() selectedCourt: Court | null = null
	@state() bookingInProgress: boolean = false
	@state() availableTimeSlots: TimeSlot[] = []
	@select(courtsContext, (courtes: Map<string, Court>) => Array.from(courtes.values())) availableCourts: Court[] = []

	@state() error: string | null = null
	@state() success: boolean = false

	// Stripe related states
	@state() formData = new BookingFormData()
	@state() processing: boolean = false
	@state() loading: boolean = false
	@state() validationPaymentResponse: boolean = false

	@query('#timer') timer!: HTMLDivElement
	@state() validate = false

	@select(bookingContext) booking!: Booking

	// API services
	private auth = getAuth()
	private authService = new AuthService()
	private bookingService = new BookingService(this.authService)
	private availabilityService = new AvailabilityService()

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

	// Lifecycle method when component first connects to DOM
	firstUpdated() {
		// Initialize Stripe
		$stripe.next(this.booking.price || 0)
		$stripeElements.subscribe(() => {
			if ($stripeElements.value) {
				this.loading = false
			} else {
				this.loading = true
			}
		})

		// Check payment status if returning from payment flow
		this.checkPaymentStatus()
	}

	// Get total price for the booking
	get total() {
		return this.booking.price || 0
	}

	// Automatically select the first available court
	private autoSelectCourt(courts: Court[]) {
		if (courts && courts.length > 0) {
			// Find the first available court
			const availableCourt = courts.find(court => court.available)

			if (availableCourt) {
				this.selectedCourt = availableCourt
				bookingContext.set({
					courtId: availableCourt.id,
				})
				return true
			}
		}

		return false
	}

	// Process payment and create booking
	async processPaymentBooking(e: Event) {
		e.preventDefault()

		const elements = $stripeElements.value as StripeElements
		const stripe = await stripePromise
		if (!stripe || !elements) {
			$notify.error('Payment processing failed. Please try again.')
			return
		}

		// Validate payment form
		this.processing = true
		const { error } = await elements?.submit()

		if (error) {
			this.processing = false

			if (error.type === 'card_error' || error.type === 'validation_error') {
				$notify.error(error.message || 'Card validation failed')
			} else {
				$notify.error('Something went wrong, please try again.')
			}
			return
		}

		this.processing = true

		// Process payment with anonymous auth if user isn't already authenticated
		from(
			this.authService.getCurrentUserId()
				? Promise.resolve({ user: { uid: this.authService.getCurrentUserId() } })
				: signInAnonymously(auth),
		)
			.pipe(
				map(userCredential => userCredential.user.uid),
				switchMap(uid =>
					createPaymentIntent({
						amount: this.total,
						email: this.formData.email,
						name: this.formData.name,
						items: {
							[this.booking.courtId!]: 1, // Book one court
						},
						eventID: this.booking.id || 'court-booking',
						uid: uid,
						phone: this.formData.phoneNumber,
						address: this.formData.address,
						postalCode: this.formData.postalCode,
						city: this.formData.city,
						country: this.formData.country,
					}).pipe(
						retry(3),
						switchMap((res: any) =>
							from(
								stripe.confirmPayment({
									clientSecret: res.clientSecret,
									elements,
									confirmParams: {
										payment_method_data: {
											billing_details: {
												name: this.formData.name,
												phone: this.formData.phoneNumber,
												address: {
													country: this.formData.country,
													state: this.formData.city,
													city: this.formData.city,
													line1: this.formData.address,
													postal_code: this.formData.postalCode,
												},
											},
										},
										return_url: location.href,
										receipt_email: this.formData.email,
									},
								}),
							).pipe(
								catchError(e => {
									throw e
								}),
								map(res => {
									if (res.error) {
										throw res.error
									}
									return res
								}),
							),
						),
					),
				),
			)
			.subscribe({
				next: () => {
					this.processing = false
				},
				error: error => {
					if (error.type === 'card_error' || error.type === 'validation_error') {
						$notify.error('Payment failed: ' + (error.message || 'Card declined'))
					} else if (error.code === 'resource_missing') {
						$notify.error('Payment not processed. Please try again.')
					} else {
						$notify.error('Something went wrong with the payment. Please try again.')
					}
					this.processing = false
				},
			})
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

	// Handle duration selection - now with automatic court assignment
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

		// Automatically select a court
		if (this.autoSelectCourt(availableCourts)) {
			// If court was successfully selected, proceed to payment
			this.step = 4 // Payment is now step 4
		} else {
			// No courts available
			this.error =
				'No courts available for the selected time and duration. Please choose another time slot or duration.'
			// Stay on duration step
		}
	}

	// Check payment status for returning from Stripe
	async checkPaymentStatus() {
		const clientSecret = new URLSearchParams(window.location.search).get('payment_intent_client_secret')

		if (!clientSecret) {
			return
		}

		const stripe = await stripePromise

		if (!stripe) {
			return
		}

		this.processing = true

		// Check payment status
		const check = new Subject<number>()
		check.pipe(switchMap(() => from(stripe.retrievePaymentIntent(clientSecret)))).subscribe({
			next: ({ paymentIntent }) => {
				switch (paymentIntent?.status) {
					case 'succeeded':
						// Create the booking after successful payment
						this.createBookingAfterPayment(paymentIntent.id)
						break
					case 'processing':
						this.processing = true
						// Check again after a short delay
						setTimeout(() => check.next(0), 1000)
						break
					case 'requires_payment_method':
						$notify.error('Payment failed, please try again.')
						this.processing = false
						break
					default:
						this.processing = false
				}
			},
			error: () => {
				this.processing = false
			},
		})
	}

	// Create booking record after successful payment
	private async createBookingAfterPayment(paymentId: string) {
		try {
			const startTime = dayjs(this.booking.startTime)
			const endTime = dayjs(this.booking.endTime)

			// Format times for backend (HH:00)
			const formattedStartTime = startTime.format('HH:00')
			const formattedEndTime = endTime.format('HH:00')

			// Create booking request object
			const bookingRequest = {
				id: '',
				userId: this.authService.getCurrentUserId(),
				userName: this.auth.currentUser?.displayName || this.formData.name || 'User',
				courtId: this.booking.courtId,
				date: this.date,
				startTime: formattedStartTime,
				endTime: formattedEndTime,
				price: this.booking.price || 0,
				paymentId: paymentId, // Include payment reference
				paymentStatus: 'paid',
				status: 'confirmed',
			}

			// Create booking via API
			this.bookingService.createBooking(bookingRequest).subscribe({
				next: _booking => {
					// Show success
					this.success = true
					this.processing = false

					// Dispatch event for parent components
					this.dispatchEvent(
						new CustomEvent('booking-confirmed', {
							detail: {
								...this.booking,
								paymentId,
								paymentStatus: 'paid',
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
					this.error = 'Payment successful, but booking record could not be created. Please contact support.'
					this.processing = false
				},
			})
		} catch (err) {
			console.error('Error creating booking:', err)
			this.error = 'Payment successful, but booking record could not be created. Please contact support.'
			this.processing = false
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
				return this.renderPaymentStep()
		}
	}

	// Render payment step with Stripe integration
	private renderPaymentStep() {
		if (this.success) {
			return html`
				<schmancy-grid class="p-4" gap="md" align="center" justify="center">
					<schmancy-typography type="headline">Booking Confirmed!</schmancy-typography>
					<schmancy-typography type="body">
						Your booking has been confirmed for ${this.date} at ${dayjs(this.booking.startTime).format('HH:mm')} -
						${dayjs(this.booking.endTime).format('HH:mm')}
					</schmancy-typography>
					<schmancy-typography type="body">
						Court: ${this.selectedCourt ? this.selectedCourt.name || `#${this.selectedCourt.id}` : 'Assigned court'}
					</schmancy-typography>
				</schmancy-grid>
			`
		}

		return html`
			<schmancy-form
				class="p-4"
				.hidden=${this.validationPaymentResponse}
				@submit=${(e: Event) => {
					if (this.formData.email !== this.formData.repeatEmail) {
						return
					}
					this.processPaymentBooking(e)
				}}
			>
				<schmancy-grid class="w-full" gap="md">
					<!-- Booking Summary -->
					<schmancy-surface rounded="all" class="w-full p-4" type="container">
						<schmancy-grid gap="sm" align="center">
							<schmancy-typography type="headline"> Booking Summary </schmancy-typography>

							<schmancy-grid cols="1fr auto" gap="sm">
								<schmancy-typography type="body">Date:</schmancy-typography>
								<schmancy-typography type="body" weight="bold">${this.date}</schmancy-typography>

								<schmancy-typography type="body">Time:</schmancy-typography>
								<schmancy-typography type="body" weight="bold">
									${dayjs(this.booking.startTime).format('HH:mm')} - ${dayjs(this.booking.endTime).format('HH:mm')}
								</schmancy-typography>

								<schmancy-typography type="body">Duration:</schmancy-typography>
								<schmancy-typography type="body" weight="bold">${this.duration} minutes</schmancy-typography>

								<schmancy-typography type="body">Court:</schmancy-typography>
								<schmancy-typography type="body" weight="bold">
									${this.selectedCourt
										? this.selectedCourt.name || `#${this.selectedCourt.id}`
										: 'Best available court (assigned automatically)'}
								</schmancy-typography>

								<schmancy-typography type="body">Total Price:</schmancy-typography>
								<schmancy-typography type="headline" token="lg">&euro;${this.total.toFixed(2)}</schmancy-typography>
							</schmancy-grid>
						</schmancy-grid>
					</schmancy-surface>

					<!-- Personal Info -->
					<schmancy-grid content="stretch" cols="1fr 1fr" gap="sm">
						<schmancy-input
							.autocomplete=${'given-name'}
							.value=${this.formData.name}
							required
							type="text"
							class="w-full"
							placeholder="Full Name"
							@change=${(e: any) => {
								this.formData.name = e.detail.value
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'tel'}
							.value=${this.formData.phoneNumber}
							required
							type="text"
							class="w-full"
							placeholder="Phone Number"
							@change=${(e: any) => {
								this.formData.phoneNumber = e.detail.value
							}}
						></schmancy-input>
					</schmancy-grid>

					<!-- Address Info -->
					<schmancy-grid cols="1fr 1fr" gap="sm">
						<schmancy-input
							.autocomplete=${'street-address'}
							.value=${this.formData.address}
							required
							type="text"
							placeholder="Street Address"
							@change=${(e: any) => {
								this.formData.address = e.detail.value
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'postal-code'}
							.value=${this.formData.postalCode}
							required
							type="text"
							placeholder="Postal Code"
							@change=${(e: any) => {
								this.formData.postalCode = e.detail.value
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'address-level2'}
							.value=${this.formData.city}
							required
							type="text"
							placeholder="City"
							@change=${(e: any) => {
								this.formData.city = e.detail.value
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'country-name'}
							.value=${this.formData.country}
							required
							type="text"
							placeholder="Country"
							@change=${(e: any) => {
								this.formData.country = e.detail.value
							}}
						></schmancy-input>
					</schmancy-grid>

					<!-- Email Fields -->
					<schmancy-grid cols="1fr 1fr" gap="sm">
						<schmancy-input
							.autocomplete=${'email'}
							.value=${this.formData.email}
							required
							type="email"
							placeholder="Email Address"
							@change=${(e: any) => {
								this.formData.email = e.detail.value
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'email'}
							.value=${this.formData.repeatEmail}
							required
							type="email"
							placeholder="Confirm Email"
							@change=${(e: any) => {
								this.formData.repeatEmail = e.detail.value
							}}
							@blur=${() => {
								if (this.formData.email !== this.formData.repeatEmail) {
									this.validate = true
								}
							}}
						></schmancy-input>

						${when(
							this.validate && this.formData.email !== this.formData.repeatEmail,
							() => html`
								<schmancy-typography class="col-span-2 text-red-500" type="label" token="sm">
									Email addresses do not match
								</schmancy-typography>
							`,
						)}
					</schmancy-grid>

					<!-- Payment Element -->
					<schmancy-grid>
						<section class="relative block">
							<slot name="stripe-element"></slot>
						</section>
					</schmancy-grid>

					<!-- Terms & Submit Button -->
					<schmancy-grid justify="end" gap="md">
						<schmancy-typography type="label" align="left">
							<span> By clicking Pay you agree to our terms and conditions </span>
						</schmancy-typography>

						<schmancy-button class="h-[3rem]" type="submit" variant="filled" .disabled=${this.processing}>
							<schmancy-typography class="px-4" type="title" token="lg">
								Pay &euro;${this.total.toFixed(2)}
							</schmancy-typography>
						</schmancy-button>
					</schmancy-grid>
				</schmancy-grid>
			</schmancy-form>

			${when(
				this.processing,
				() => html`
					<schmancy-busy class="z-50">
						<schmancy-flex flow="row" gap="sm" align="center">
							<schmancy-spinner class="h-[48px] w-[48px]" size="48px"></schmancy-spinner>
						</schmancy-flex>
					</schmancy-busy>
				`,
			)}
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'court-booking-system': CourtBookingSystem
	}
}
