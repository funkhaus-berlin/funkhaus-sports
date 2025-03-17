import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { catchError, distinctUntilChanged, map, of, switchMap, takeUntil, tap } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { Court } from 'src/db/courts.collection'
import { OperatingHours, Venue } from 'src/db/venue-collection'
import { AvailabilityService } from '../../../bookingServices/availability'
import { Booking, bookingContext } from '../context'
import { TimeSlot } from '../types'

@customElement('time-selection-step')
export class TimeSelectionStep extends $LitElement() {
	@property({ type: Boolean }) active = true
	@property({ type: Boolean }) hidden = false
	@property({ attribute: false }) onTimeSelected?: (time: number) => void

	// Value property with custom getter/setter
	private _value?: number

	@property({ type: Number })
	get value(): number | undefined {
		return this._value
	}

	set value(val: number | undefined) {
		const oldValue = this._value
		this._value = val
		this.requestUpdate('value', oldValue)

		if (val !== undefined && val !== oldValue) {
			setTimeout(() => this._scrollToSelectedTime(), 0)
		}
	}

	// Component state
	@state() timeSlots: TimeSlot[] = []
	@state() hoveredTime: number | null = null
	@state() viewMode: 'timeline' | 'list' = 'timeline'
	@state() loading: boolean = false
	@state() error: string | null = null

	// Connect to contexts
	@select(venuesContext) venues!: Map<string, Venue>
	@select(courtsContext) courts!: Map<string, Court>
	@select(bookingContext) booking!: Booking

	// Current selected venue and date information
	@state() selectedVenue?: Venue = undefined
	@state() selectedDate: string = ''
	@state() operatingHours: OperatingHours | null = null

	// Availability service
	private availabilityService: AvailabilityService = new AvailabilityService()

	constructor() {
		super()
		this.viewMode = 'timeline'
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Subscribe to date changes in booking context
		bookingContext.$.pipe(
			map(booking => booking.date),
			distinctUntilChanged(),
			tap(date => {
				this.loading = true
				this.timeSlots = []
				this.selectedDate = date || ''
			}),
			switchMap(date => {
				if (!date) return of(null)

				// Find venue for displayed courts
				const activeCourts = Array.from(this.courts.values()).filter(c => c.status === 'active')
				if (activeCourts.length === 0) return of(null)

				// Use the first court's venueId to get venue information
				const firstCourt = activeCourts[0]
				const venueId = firstCourt.venueId
				const venue = this.venues.get(venueId)

				if (venue) {
					this.selectedVenue = venue
					this.operatingHours = venue.operatingHours
				}

				// Get real-time availability for all courts at the venue
				return this.availabilityService.getAllCourtsAvailability(date, venueId).pipe(
					tap(courtsAvailability => {
						console.log('Courts availability:', courtsAvailability)
						// Process availability data to determine which time slots are bookable
						this._processAvailabilityData(courtsAvailability)
					}),
					catchError(err => {
						console.error('Error loading time slots:', err)
						this.error = 'Unable to load available time slots. Please try again.'
						this.loading = false
						return of(null)
					}),
				)
			}),
			takeUntil(this.disconnecting),
		).subscribe({
			next: () => {
				this.error = null
				this.loading = false

				// If booking has startTime, update selected time
				if (this.booking.startTime) {
					const startTime = dayjs(this.booking.startTime)
					const minutes = startTime.hour() * 60 + startTime.minute()
					if (this.value !== minutes) {
						this.value = minutes
					}
				}

				if (this.value !== undefined) {
					setTimeout(() => this._scrollToSelectedTime(), 100)
				}
			},
			error: err => {
				console.error('Error in subscription:', err)
				this.error = 'An error occurred while loading time slots. Please try again.'
				this.loading = false
				this._createDefaultTimeSlots()
			},
		})

		// Initialize from booking context if it has a startTime
		if (this.booking.startTime) {
			const startTime = dayjs(this.booking.startTime)
			this.value = startTime.hour() * 60 + startTime.minute()
		}
	}

	protected updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties)

		if (changedProperties.has('active') && this.value !== undefined) {
			setTimeout(() => this._scrollToSelectedTime(), 0)
		}

		// If booking.startTime changes, update the value
		if (
			changedProperties.has('booking') &&
			this.booking.startTime &&
			(!changedProperties.get('booking') ||
				(changedProperties.get('booking') as Booking).startTime !== this.booking.startTime)
		) {
			const startTime = dayjs(this.booking.startTime)
			const minutes = startTime.hour() * 60 + startTime.minute()
			if (this.value !== minutes) {
				this.value = minutes
			}
		}
	}

	/**
	 * Process availability data to create time slots
	 * Will mark a time slot as available only if at least one court is available
	 */
	private _processAvailabilityData(courtsAvailability: Record<string, Record<string, { isAvailable: boolean }>>): void {
		const slots: TimeSlot[] = []

		// Get the day of week for operating hours
		const dayOfWeek = dayjs(this.selectedDate).format('dddd').toLowerCase()
		const todayOperatingHours = this.operatingHours?.[dayOfWeek as keyof OperatingHours]

		// Collect all unique time slots across all courts
		const allTimeSlots = new Set<string>()

		Object.values(courtsAvailability).forEach(courtSlots => {
			Object.keys(courtSlots).forEach(timeKey => {
				allTimeSlots.add(timeKey)
			})
		})

		// Sort time slots chronologically
		const sortedTimeSlots = Array.from(allTimeSlots).sort()

		// Process each time slot
		sortedTimeSlots.forEach(timeKey => {
			const [hour, minute] = timeKey.split(':').map(Number)
			const value = hour * 60 + (minute || 0)

			// Check if this time is within operating hours
			let withinOperatingHours = true

			if (todayOperatingHours) {
				const [openHour, openMinute] = todayOperatingHours.open.split(':').map(Number)
				const [closeHour, closeMinute] = todayOperatingHours.close.split(':').map(Number)

				const openValue = openHour * 60 + (openMinute || 0)
				const closeValue = closeHour * 60 + (closeMinute || 0)

				withinOperatingHours = value >= openValue && value < closeValue
			}

			if (withinOperatingHours) {
				// A time slot is available if ANY court has it available
				const isAvailable = Object.values(courtsAvailability).some(courtSlots => courtSlots[timeKey]?.isAvailable)

				slots.push({
					label: timeKey,
					value,
					available: isAvailable,
				})
			}
		})

		// Sort by time
		slots.sort((a, b) => a.value - b.value)
		this.timeSlots = slots
	}

	/**
	 * Create default time slots based on venue operating hours
	 */
	private _createDefaultTimeSlots(): void {
		const defaultSlots: TimeSlot[] = []

		// Get day of week
		const dayOfWeek = this.selectedDate
			? dayjs(this.selectedDate).format('dddd').toLowerCase()
			: dayjs().format('dddd').toLowerCase()

		// Default hours
		let startHour = 8
		let endHour = 22

		// Use venue operating hours if available
		if (this.operatingHours) {
			const todayOperatingHours = this.operatingHours[dayOfWeek as keyof OperatingHours]

			if (todayOperatingHours) {
				const [openHour] = todayOperatingHours.open.split(':').map(Number)
				const [closeHour] = todayOperatingHours.close.split(':').map(Number)

				startHour = openHour
				endHour = closeHour
			}
		}

		// Generate slots
		for (let hour = startHour; hour < endHour; hour++) {
			// Full hour slot
			const timeKey = `${hour.toString().padStart(2, '0')}:00`
			const value = hour * 60

			defaultSlots.push({
				label: timeKey,
				value,
				available: true,
			})

			// Half-hour slot
			const halfHourKey = `${hour.toString().padStart(2, '0')}:30`
			const halfHourValue = hour * 60 + 30

			defaultSlots.push({
				label: halfHourKey,
				value: halfHourValue,
				available: true,
			})
		}

		this.timeSlots = defaultSlots
	}

	/**
	 * Handle time slot selection
	 */
	private _handleTimeSelect(slot: TimeSlot): void {
		if (!slot.available) return

		this.value = slot.value

		// Update booking context with the new time
		const selectedDate = dayjs(this.booking.date)
		const hour = Math.floor(slot.value / 60)
		const minute = slot.value % 60
		const newStartTime = selectedDate.hour(hour).minute(minute)

		bookingContext.set(
			{
				startTime: newStartTime.toISOString(),
			},
			true,
		)

		this.dispatchEvent(new CustomEvent('change', { detail: slot }))

		if (this.onTimeSelected) {
			this.onTimeSelected(slot.value)
		}
	}

	/**
	 * Handle time slot hover
	 */
	private _handleTimeHover(slot: TimeSlot): void {
		if (slot.available) {
			this.hoveredTime = slot.value
		}
	}

	/**
	 * Handle time slot mouse leave
	 */
	private _handleTimeLeave(): void {
		this.hoveredTime = null
	}

	/**
	 * Format time for display
	 */
	private _formatTimeDisplay(minutes: number): string {
		const timeObj = dayjs().startOf('day').add(minutes, 'minutes')
		return timeObj.format('h:mm A')
	}

	/**
	 * Get formatted operating hours display
	 */
	private _getOperatingHoursDisplay(): string {
		if (!this.selectedVenue || !this.operatingHours || !this.selectedDate) {
			return 'Hours: N/A'
		}

		const dayOfWeek = dayjs(this.selectedDate).format('dddd').toLowerCase()
		const todayHours = this.operatingHours[dayOfWeek as keyof OperatingHours]

		if (!todayHours) {
			return 'Closed Today'
		}

		return `Hours: ${todayHours.open} - ${todayHours.close}`
	}

	/**
	 * Scroll to selected time slot
	 */
	private _scrollToSelectedTime(): void {
		if (this.value === undefined) return

		requestAnimationFrame(() => {
			try {
				const selectedTimeEl = this.shadowRoot?.querySelector(`[data-time-value="${this.value}"]`) as HTMLElement

				if (!selectedTimeEl) {
					console.debug('Selected time element not found')
					return
				}

				selectedTimeEl.scrollIntoView({
					behavior: 'smooth',
					block: 'nearest',
					inline: 'center',
				})
			} catch (error) {
				console.error('Error scrolling to selected time:', error)
			}
		})
	}

	render() {
		if (this.hidden) return html``

		// Container classes based on active state
		const containerClasses = {
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'shadow-sm': true,
			'py-6 px-4': this.active,
			'py-3 px-2': !this.active,
		}

		return html`
			<div class=${this.classMap(containerClasses)}>
				<!-- Title and operating hours -->
				${this.active
					? html`
							<div class="flex justify-between items-center mb-5">
								<div class="text-lg font-medium">Select Time</div>

								${this.selectedVenue && this.operatingHours
									? html` <div class="text-sm text-surface-on-variant">${this._getOperatingHoursDisplay()}</div> `
									: ''}
							</div>
					  `
					: this.value !== undefined
					? html`
							<!-- When inactive but has a selected time, show it -->
							<div class="text-base font-medium mb-3 text-center">${this._formatTimeDisplay(this.value)}</div>
					  `
					: html`
							<!-- When inactive with no selection -->
							<div class="text-base font-medium mb-3 text-center">Time</div>
					  `}

				<!-- Loading State -->
				${this.loading
					? html`
							<div class="flex justify-center items-center py-8">
								<schmancy-spinner size="32px"></schmancy-spinner>
							</div>
					  `
					: this.error
					? html`
							<div class="text-error-default text-center py-4">
								${this.error}
								<div class="mt-2">
									<schmancy-button variant="outlined" @click=${() => this._createDefaultTimeSlots()}>
										Show Default Times
									</schmancy-button>
								</div>
							</div>
					  `
					: html`
							<!-- Time slots timeline -->
							${this._renderTimeline()}

							<!-- Time range indicator - only when active -->
							${this.active && this.timeSlots.length > 0
								? html`
										<div class="flex justify-between text-xs text-gray-500 mt-4 px-4 pt-2 border-t">
											<span>From ${this._formatTimeDisplay(this.timeSlots[0].value)}</span>
											<span>To ${this._formatTimeDisplay(this.timeSlots[this.timeSlots.length - 1].value)}</span>
										</div>
								  `
								: ''}
					  `}
			</div>
		`
	}

	/**
	 * Render time slots timeline
	 */
	private _renderTimeline() {
		// Filter to show only hour and half-hour slots
		const timelineSlots = this.timeSlots.filter(slot => slot.value % 30 === 0)

		return html`
			<!-- Timeline with horizontal scroll -->
			<schmancy-scroll hide>
				<div class=${this.active ? 'flex gap-2 pb-2 pl-4 pr-4 mb-2' : 'flex gap-1 pb-1 pl-2 pr-2'}>
					${timelineSlots.map(slot => {
						const hour = Math.floor(slot.value / 60)
						const minute = slot.value % 60
						const isHalfHour = minute === 30
						const isSelected = this.value === slot.value

						// Classes for time slots
						const slotClasses = {
							'flex-none': true,
							'rounded-lg': true,
							flex: true,
							'flex-col': true,
							'items-center': true,
							'justify-center': true,
							'transition-colors': true,
							'duration-200': true,
							relative: true,
							'cursor-pointer': slot.available,
							'cursor-not-allowed': !slot.available,
							'bg-primary-default text-primary-on': isSelected,
							'bg-surface-high text-surface-on': !isSelected && slot.available,
							'bg-gray-200 text-gray-400': !slot.available,
							'shadow-sm': isSelected,
							'hover:shadow-sm': slot.available && !isSelected,
							// Different sizes based on active state and hour type
							'w-16 h-20 py-3 px-1': this.active && !isHalfHour,
							'w-14 h-16 py-2 px-1': this.active && isHalfHour,
							'w-12 h-16 py-2 px-1': !this.active && !isHalfHour,
							'w-10 h-12 py-1 px-1': !this.active && isHalfHour,
						}

						// Text size classes
						const textClasses = {
							'font-bold': true,
							'text-base': this.active && !isHalfHour,
							'text-sm': (this.active && isHalfHour) || (!this.active && !isHalfHour),
							'text-xs': !this.active && isHalfHour,
						}

						const subTextClasses = {
							'font-medium': true,
							'text-xs': this.active,
							'text-xs opacity-75': !this.active,
						}

						return html`
							<div
								class=${this.classMap(slotClasses)}
								@click=${() => slot.available && this._handleTimeSelect(slot)}
								@mouseover=${() => slot.available && this._handleTimeHover(slot)}
								@mouseleave=${this._handleTimeLeave}
								data-time-value=${slot.value}
							>
								<!-- Availability indicator dot -->
								${this.active
									? html`
											<div
												class="absolute top-1 right-1 w-2 h-2 rounded-full ${slot.available
													? 'bg-success-default'
													: 'bg-error-default'}"
											></div>
									  `
									: ''}

								<div class=${this.classMap(textClasses)}>
									${isHalfHour ? html`${hour > 12 ? hour - 12 : hour}:30` : html`${hour > 12 ? hour - 12 : hour}`}
								</div>
								<div class=${this.classMap(subTextClasses)}>${hour >= 12 ? 'PM' : 'AM'}</div>
							</div>
						`
					})}
				</div>
			</schmancy-scroll>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'time-selection-step': TimeSelectionStep
	}
}
