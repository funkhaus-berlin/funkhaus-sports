import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { PropertyValues, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { cache } from 'lit/directives/cache.js'
import { keyed } from 'lit/directives/keyed.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import {
	BehaviorSubject,
	Observable,
	catchError,
	combineLatest,
	debounceTime,
	distinctUntilChanged,
	filter,
	map,
	of,
	shareReplay,
	switchMap,
	take,
	takeUntil,
	tap,
} from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { Court } from 'src/db/courts.collection'
import { OperatingHours, Venue } from 'src/db/venue-collection'
import { AvailabilityService } from '../../../bookingServices/availability'
import { Booking, bookingContext } from '../context'
import { TimeSlot } from '../types'

// Global state to preserve time slots between refreshes
const timeSlotCache = new Map<string, TimeSlot[]>()

@customElement('time-selection-step')
export class TimeSelectionStep extends $LitElement() {
	@property({ type: Boolean }) active = true
	@property({ type: Boolean }) hidden = false
	@property({ attribute: false }) onTimeSelected?: (time: number) => void

	// Value property with custom getter/setter to minimize renders
	private _value?: number

	// Component lifecycle state
	private stateReady$ = new BehaviorSubject<boolean>(false)
	private selectedDate$ = new BehaviorSubject<string>('')
	private refreshTrigger$ = new BehaviorSubject<number>(Date.now())

	@property({ type: Number })
	get value(): number | undefined {
		return this._value
	}

	set value(val: number | undefined) {
		if (this._value === val) return // Prevent unnecessary updates

		const oldValue = this._value
		this._value = val

		this.requestUpdate('value', oldValue)

		if (val !== undefined && val !== oldValue) {
			// Use requestAnimationFrame for smoother scrolling
			requestAnimationFrame(() => requestAnimationFrame(() => this._scrollToSelectedTime()))
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

	// Cache for memoizing expensive calculations
	private _timelineSlotsCache: TimeSlot[] | null = null
	private _operatingHoursDisplay: string | null = null
	private _lastVenueId: string | null = null
	private _lastSelectedDate: string | null = null

	// Availability service
	private availabilityService: AvailabilityService = new AvailabilityService()

	constructor() {
		super()
		this.viewMode = 'timeline'
	}

	connectedCallback() {
		super.connectedCallback()

		// Try to restore state from local storage if available
		this._restoreStateFromStorage()
	}

	disconnectedCallback() {
		super.disconnectedCallback()

		// Save current state to local storage before unmounting
		this._saveStateToStorage()
	}

	/**
	 * Save state to local storage for persistence across page refreshes
	 */
	private _saveStateToStorage(): void {
		if (this.selectedDate && this.timeSlots.length > 0) {
			// Store the current time slots in the global cache
			timeSlotCache.set(this.selectedDate, [...this.timeSlots])

			// Persist selected time and date
			try {
				localStorage.setItem('timeSelectionDate', this.selectedDate)
				if (this.value !== undefined) {
					localStorage.setItem('timeSelectionValue', this.value.toString())
				}
				if (this.selectedVenue) {
					localStorage.setItem('timeSelectionVenueId', this.selectedVenue.id)
				}
			} catch (err) {
				console.warn('Failed to save time selection state to storage:', err)
			}
		}
	}

	/**
	 * Restore state from local storage after page refresh
	 */
	private _restoreStateFromStorage(): void {
		try {
			const savedDate = localStorage.getItem('timeSelectionDate')
			const savedValue = localStorage.getItem('timeSelectionValue')
			const savedVenueId = localStorage.getItem('timeSelectionVenueId')

			if (savedDate) {
				this.selectedDate = savedDate
				this.selectedDate$.next(savedDate)

				// Check if we have cached time slots for this date
				const cachedSlots = timeSlotCache.get(savedDate)
				if (cachedSlots && cachedSlots.length > 0) {
					this.timeSlots = cachedSlots
				}
			}

			if (savedValue) {
				const parsedValue = parseInt(savedValue, 10)
				if (!isNaN(parsedValue)) {
					this._value = parsedValue
				}
			}

			if (savedVenueId && this.venues) {
				this.selectedVenue = this.venues.get(savedVenueId)
				if (this.selectedVenue) {
					this.operatingHours = this.selectedVenue.operatingHours
				}
			}
		} catch (err) {
			console.warn('Failed to restore time selection state from storage:', err)
		}
	}

	/**
	 * Create a derived state stream for availability data
	 */
	private createAvailabilityStream(): Observable<{
		date: string
		startTime: string | null
		availability: Record<string, Record<string, { isAvailable: boolean }>> | null
	}> {
		return combineLatest([
			// Watch for date changes from the booking context
			bookingContext.$.pipe(
				map(booking => booking.date),
				distinctUntilChanged(),
			),
			// Watch for startTime changes from the booking context
			bookingContext.$.pipe(
				map(booking => booking.startTime),
				distinctUntilChanged(),
			),
			// Watch for explicit refresh triggers
			this.refreshTrigger$.pipe(distinctUntilChanged()),
		]).pipe(
			// Only process when we have a date
			filter(([date]) => !!date),
			debounceTime(50), // Debounce to prevent multiple rapid changes
			tap(([date]) => {
				this.selectedDate = date || ''
				this.selectedDate$.next(date || '')
				this.loading = true
				this.error = null
			}),
			switchMap(([date, startTime]) => {
				// Check if we have cached time slots
				const cachedSlots = timeSlotCache.get(date)
				if (cachedSlots && cachedSlots.length > 0) {
					// Use cached slots if available (faster on refresh)
					this.timeSlots = cachedSlots
					this.loading = false
					return of({ date, startTime, availability: null })
				}

				// Otherwise, fetch availability data
				// Find venue for displayed courts
				const activeCourts = Array.from(this.courts?.values() || []).filter(c => c.status === 'active')
				if (activeCourts.length === 0) {
					this.loading = false
					this._createDefaultTimeSlots()
					return of({ date, startTime, availability: null })
				}

				// Use the first court's venueId to get venue information
				const firstCourt = activeCourts[0]
				const venueId = firstCourt.venueId

				// Update venue information
				const venue = this.venues?.get(venueId)
				if (venue) {
					this.selectedVenue = venue
					this.operatingHours = venue.operatingHours
					// Reset the operating hours display cache when venue changes
					if (this._lastVenueId !== venueId || this._lastSelectedDate !== date) {
						this._operatingHoursDisplay = null
						this._lastVenueId = venueId
						this._lastSelectedDate = date
					}
				}

				// Get real-time availability for all courts at the venue
				return this.availabilityService.getAllCourtsAvailability(date, venueId).pipe(
					map(availability => ({ date, startTime, availability })),
					catchError(err => {
						console.error('Error loading time slots:', err)
						this.error = 'Unable to load available time slots. Please try again.'
						this.loading = false
						this._createDefaultTimeSlots()
						return of({ date, startTime, availability: null })
					}),
				)
			}),
			// Share the result to prevent multiple subscriptions from re-fetching
			shareReplay(1),
		)
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Wait for all contexts to be available before setting up streams
		combineLatest([venuesContext.$, courtsContext.$, bookingContext.$])
			.pipe(
				// Skip until all contexts exist and have values
				filter(([venues, courts, booking]) => !!venues && !!courts && !!booking && venues.size > 0 && courts.size > 0),
				// Only take the first emission that satisfies our condition
				take(1),
				// Flag that the component is ready for data processing
				tap(() => {
					console.debug('Time selection contexts ready')
					this.stateReady$.next(true)
				}),
				// Handle errors in context initialization
				catchError(err => {
					console.error('Error initializing contexts:', err)
					return of([new Map(), new Map(), {} as Booking])
				}),
				takeUntil(this.disconnecting),
			)
			.subscribe()

		// Set up the main data stream once contexts are ready
		this.stateReady$
			.pipe(
				filter(ready => ready),
				switchMap(() => this.createAvailabilityStream()),
				tap(({ availability, startTime }) => {
					// Process availability data if we have it
					if (availability) {
						this._processAvailabilityData(availability)
					}

					// Update the selected time if needed
					if (startTime && (!this._value || this.booking?.startTime !== startTime)) {
						const time = dayjs(startTime)
						const minutes = time.hour() * 60 + time.minute()
						if (this._value !== minutes) {
							this._value = minutes
							this.requestUpdate('value')
						}
					}

					this.loading = false
				}),
				// Scroll to the selected time after render
				tap(() => {
					if (this._value !== undefined) {
						requestAnimationFrame(() => this._scrollToSelectedTime())
					}
				}),
				catchError(err => {
					console.error('Error in availability stream:', err)
					this.error = 'An error occurred while loading time slots.'
					this.loading = false
					return of(null)
				}),
				takeUntil(this.disconnecting),
			)
			.subscribe()

		// Initialize from booking context if it has a startTime
		if (this.booking?.startTime) {
			const startTime = dayjs(this.booking.startTime)
			const minutes = startTime.hour() * 60 + startTime.minute()
			if (this._value !== minutes) {
				this._value = minutes
			}
		}
	}

	protected updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties)

		// Scroll to selected time when component becomes active
		if (changedProperties.has('active') && this.active && this._value !== undefined) {
			requestAnimationFrame(() => this._scrollToSelectedTime())
		}

		// If booking context changes, check for relevant changes
		if (changedProperties.has('booking') && this.booking) {
			// Handle date changes
			if (
				this.booking.date &&
				(!changedProperties.get('booking') || (changedProperties.get('booking') as Booking)?.date !== this.booking.date)
			) {
				// Clear the entire cache when dates change
				timeSlotCache.clear() // <-- Add this line to clear all cached time slots

				this.selectedDate = this.booking.date
				this.selectedDate$.next(this.booking.date)

				// Trigger a refresh of availability data
				this.refreshTrigger$.next(Date.now())
			}
		}
	}

	/**
	 * Process availability data to create time slots
	 * Uses memoization for better performance on re-renders
	 */
	private _processAvailabilityData(courtsAvailability: Record<string, Record<string, { isAvailable: boolean }>>): void {
		// Clear timeline slots cache when data changes
		this._timelineSlotsCache = null

		const slots: TimeSlot[] = []
		// const cacheKey = `${this.selectedDate}-${Object.keys(courtsAvailability).join('-')}`

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

		// Cache the slots for performance and persistence
		timeSlotCache.set(this.selectedDate, [...slots])
	}

	/**
	 * Create default time slots based on venue operating hours
	 * Used as fallback when availability data can't be fetched
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

		// Clear timeline slots cache
		this._timelineSlotsCache = null
		this.timeSlots = defaultSlots

		// Cache these default slots
		timeSlotCache.set(this.selectedDate, [...defaultSlots])
	}

	/**
	 * Handle time slot selection with debouncing to prevent multiple calls
	 */
	private _handleTimeSelect(slot: TimeSlot): void {
		if (!slot.available) return

		// Avoid double processing if the value is the same
		// if (this.value === slot.value) {
		// 	return
		// }

		this.value = slot.value

		// Update booking context with the new time
		const selectedDate = dayjs(this.booking.date)
		const hour = Math.floor(slot.value / 60)
		const minute = slot.value % 60
		const newStartTime = selectedDate.hour(hour).minute(minute)

		// Set with debounce via requestAnimationFrame to prevent rapid updates
		requestAnimationFrame(() => {
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
		})
	}

	/**
	 * Handle time slot hover with pointer events for better touch support
	 */
	private _handleTimeHover(slot: TimeSlot): void {
		if (slot.available && this.hoveredTime !== slot.value) {
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
	 * Get formatted operating hours display - with caching
	 */
	private _getOperatingHoursDisplay(): string {
		// Use cached value if available
		if (this._operatingHoursDisplay !== null) {
			return this._operatingHoursDisplay
		}

		if (!this.selectedVenue || !this.operatingHours || !this.selectedDate) {
			this._operatingHoursDisplay = 'Hours: N/A'
			return this._operatingHoursDisplay
		}

		const dayOfWeek = dayjs(this.selectedDate).format('dddd').toLowerCase()
		const todayHours = this.operatingHours[dayOfWeek as keyof OperatingHours]

		if (!todayHours) {
			this._operatingHoursDisplay = 'Closed Today'
			return this._operatingHoursDisplay
		}

		this._operatingHoursDisplay = `Hours: ${todayHours.open} - ${todayHours.close}`
		return this._operatingHoursDisplay
	}

	/**
	 * Scroll to selected time slot with IntersectionObserver for better performance
	 */
	private _scrollToSelectedTime(): void {
		if (this.value === undefined) return

		try {
			const selectedTimeEl = this.shadowRoot?.querySelector(`[data-time-value="${this.value}"]`) as HTMLElement

			if (!selectedTimeEl) {
				return
			}

			// Use IntersectionObserver to only scroll if not already visible
			const observer = new IntersectionObserver(
				entries => {
					observer.disconnect()

					if (!entries[0].isIntersecting) {
						selectedTimeEl.scrollIntoView({
							behavior: 'smooth',
							block: 'nearest',
							inline: 'center',
						})
					}
				},
				{ threshold: 0.5 },
			)

			observer.observe(selectedTimeEl)
		} catch (error) {
			console.error('Error scrolling to selected time:', error)
		}
	}

	/**
	 * Get timeline slots with memoization for performance
	 */
	private _getTimelineSlots(): TimeSlot[] {
		if (!this._timelineSlotsCache) {
			this._timelineSlotsCache = this.timeSlots.filter(slot => slot.value % 30 === 0)
		}
		return this._timelineSlotsCache
	}

	render() {
		// Early return if hidden
		if (this.hidden) return nothing

		// Container classes based on active state
		const containerClasses = {
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'shadow-sm': true,
			'pt-4 pb-2': this.active,
			'py-3': !this.active,
		}

		return html`
			<div class=${this.classMap(containerClasses)}>
				<!-- Title and operating hours -->
				${when(
					this.active,
					() => html`
						<div class="flex justify-between items-center mb-5 px-2">
							<div class="text-lg font-medium">Select Time</div>

							${when(
								this.selectedVenue && this.operatingHours,
								() => html`<div class="text-sm text-surface-on-variant">${this._getOperatingHoursDisplay()}</div>`,
							)}
						</div>
					`,
					() =>
						this.value !== undefined
							? html``
							: html`
									<!-- When inactive with no selection -->
									<div class="text-base font-medium mb-3 text-center">Time</div>
							  `,
				)}

				<!-- Loading, Error, or Content -->
				${cache(
					this.loading
						? html`
								<div class="flex justify-center items-center py-8">
									<schmancy-spinner class="size-8"></schmancy-spinner>
								</div>
						  `
						: this.error
						? html`
								<div class="text-error-default text-center py-4">
									${this.error}
									<div class="mt-2">
										<schmancy-button
											variant="outlined"
											@click=${() => {
												this._createDefaultTimeSlots()
												this.error = null
											}}
										>
											Show Default Times
										</schmancy-button>
									</div>
								</div>
						  `
						: html`
								<!-- Time slots timeline -->
								${this._renderTimeline()}
						  `,
				)}
			</div>
		`
	}

	/**
	 * Render individual time slot with enhanced visuals
	 */
	private _renderTimeSlot(slot: TimeSlot) {
		const hour = Math.floor(slot.value / 60)
		const minute = slot.value % 60
		const isHalfHour = minute === 30
		const isSelected = this.value === slot.value
		const isHovered = this.hoveredTime === slot.value

		// Use 12-hour format with better formatting
		const hourDisplay = hour % 12 || 12 // Convert 0 to 12 for 12 AM
		const timeString = isHalfHour ? `${hourDisplay}:30` : `${hourDisplay}:00`
		const period = hour >= 12 ? 'PM' : 'AM'

		// Classes for time slots - focusing just on the tile improvements
		const slotClasses = {
			'flex-none': true,
			'rounded-lg': true,
			flex: true,
			'flex-col': true,
			'items-center': true,
			'justify-center': true,
			relative: true,

			// Improved transitions
			'transition-all': true,
			'duration-200': true,
			'transform-gpu': true, // Hardware acceleration

			// Interaction states
			'cursor-pointer': slot.available,
			'cursor-not-allowed': !slot.available,
			'hover:-translate-y-1': slot.available && !isSelected, // Subtle lift effect

			// Visual states with better colors
			'bg-primary-default': isSelected,
			'text-primary-on': isSelected,
			'bg-surface-high': !isSelected && slot.available && !isHovered,
			'bg-primary-container': !isSelected && slot.available && isHovered, // Subtle highlight on hover
			'text-surface-on': !isSelected && slot.available,
			'bg-gray-100': !slot.available,
			'text-gray-400': !slot.available,

			// Better shadows
			'shadow-sm': isSelected,
			'hover:shadow-md': slot.available && !isSelected,

			// Keep original sizing to maintain layout
			'w-16 h-20 py-3 px-1': this.active && !isHalfHour,
			'w-14 h-16 py-2 px-1': this.active && isHalfHour,
			'w-12 h-18 py-2 px-1': !this.active && !isHalfHour,
			'w-10 h-12 py-1 px-1': !this.active && isHalfHour,

			// Spacing
			'first:ml-2 last:mr-2': true,
		}

		// Improved text classes
		const timeClasses = {
			'font-bold': true,
			'text-base': this.active && !isHalfHour,
			'text-sm': (this.active && isHalfHour) || (!this.active && !isHalfHour),
			'text-xs': !this.active && isHalfHour,
		}

		const periodClasses = {
			'font-medium': true,
			'text-xs': this.active,
			'text-xs opacity-75': !this.active,
		}

		// Use keyed for efficient updates
		return keyed(
			slot.value,
			html`
				<div
					class=${this.classMap(slotClasses)}
					@click=${() => slot.available && this._handleTimeSelect(slot)}
					@pointerenter=${() => this._handleTimeHover(slot)}
					@pointerleave=${this._handleTimeLeave}
					data-time-value=${slot.value}
				>
					<!-- Better positioned availability indicator -->
					${when(
						this.active,
						() => html`
							<div
								class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full 
				  ${slot.available ? 'bg-success-default' : 'bg-error-default'}"
							></div>
						`,
					)}

					<!-- Improved time display -->
					<div class=${this.classMap(timeClasses)}>${timeString}</div>

					<!-- Period indicator -->
					<div class=${this.classMap(periodClasses)}>${period}</div>
				</div>
			`,
		)
	}

	/**
	 * Render timeline with original structure
	 */
	private _renderTimeline() {
		// Get filtered slots (memoized)
		const timelineSlots = this._getTimelineSlots()

		return html`
			<!-- Keep original timeline structure -->
			<schmancy-scroll hide>
				<div class=${this.active ? 'flex gap-2 pb-2 mb-2' : 'flex gap-1 pb-1'}>
					${repeat(
						timelineSlots,
						slot => slot.value, // Use value as key for efficient DOM updates
						slot => this._renderTimeSlot(slot),
					)}
				</div>
			</schmancy-scroll>
		`
	}

	// Force browser to re-render component
	refreshView() {
		this.refreshTrigger$.next(Date.now())
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'time-selection-step': TimeSelectionStep
	}
}
