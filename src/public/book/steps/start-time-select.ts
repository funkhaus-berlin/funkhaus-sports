import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { distinctUntilChanged, filter, map, Observable, shareReplay, startWith, takeUntil, tap } from 'rxjs'
import { venuesContext } from 'src/admin/venues/venue-context'
import { AvailabilityResponse, AvailabilityService } from '../../../bookingServices/availability'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../context'
import { TimeSlot } from '../types'

/**
 * Time selection component using the enhanced availability service
 * Aligned with court-select-step design patterns for consistency
 */
@customElement('time-selection-step')
export class TimeSelectionStep extends $LitElement(css`
	.scrollbar-hide {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none; /* Chrome, Safari, and Opera */
	}
`) {
	@property({ type: Boolean }) active = true
	@property({ type: Boolean }) hidden = false

	// Basic dependencies
	@select(bookingContext) booking!: Booking
	@select(venuesContext) venues!: Map<string, any>
	@select(BookingProgressContext) bookingProgress!: BookingProgress

	// State properties
	@state() timeSlots: TimeSlot[] = []
	@state() loading = true
	@state() error: string | null = null
	@state() availabilityData: AvailabilityResponse | null = null
	@state() autoScrollAttempted = false

	// Track the last successful time slots data for better UX during errors
	private lastSuccessfulData: { timeSlots: TimeSlot[]; availabilityData: AvailabilityResponse } | null = null

	private availabilityService = new AvailabilityService()

	// User's locale for time formatting
	private userLocale = navigator.language || 'en-US'
	private use24HourFormat = this._detectTimeFormatPreference()

	/**
	 * Determine if compact view should be used based on booking progress context
	 * Matches the pattern used in court-select-step
	 */
	get isCompact(): boolean {
		return this.bookingProgress?.currentStep !== BookingStep.Time
	}

	/**
	 * Set up all reactive subscriptions and initialize component
	 */
	connectedCallback(): void {
		super.connectedCallback()

		// Subscribe to BookingProgressContext changes to track compact state
		// Similar to court-select-step pattern
		BookingProgressContext.$.pipe(takeUntil(this.disconnecting)).subscribe(progress => {
			this.active = progress.currentStep === BookingStep.Time
			this.requestUpdate()

			// Reset auto-scroll flag when this step becomes active
			if (progress.currentStep === BookingStep.Time) {
				this.autoScrollAttempted = false
				// Try to scroll to first available after a brief delay to ensure DOM is ready
				setTimeout(() => this.scrollToFirstAvailableTime(), 100)
			}
		})

		// Set up reactive subscription with the same pattern as court-select-step
		bookingContext.$.pipe(
			startWith(bookingContext.value),
			takeUntil(this.disconnecting),
			filter(booking => !!booking.date && !!booking.courtId),
			map(booking => ({
				date: booking.date,
				venueId: booking.venueId,
				courtId: booking.courtId,
				startTime: booking.startTime,
			})),
			distinctUntilChanged((prev, curr) => prev.date === curr.date && prev.courtId === curr.courtId),
			tap(({ date, venueId }) => {
				this.loading = true
				this.autoScrollAttempted = false // Reset auto-scroll flag when data changes
				this.loadTimeSlots(date, venueId)
			}),
		).subscribe({
			error: err => {
				console.error('Error in booking subscription:', err)
				this.error = 'Failed to load time slots'
				this.loading = false
				this.requestUpdate()
			},
		})
	}

	/**
	 * Load time slots for a specific date and venue
	 */
	private loadTimeSlots(date: string, venueId: string): void {
		this.loading = true
		this.error = null
		this.requestUpdate()

		this.loadTimeSlotsData(date, venueId).subscribe({
			next: data => this.handleTimeSlotsLoaded(data),
			error: err => this.handleTimeSlotsError(err),
		})
	}

	/**
	 * Handle successful time slots data loading
	 */
	private handleTimeSlotsLoaded(data: { timeSlots: TimeSlot[]; availabilityData: AvailabilityResponse }): void {
		// Store the successful data
		this.lastSuccessfulData = data

		// Update state
		this.timeSlots = data.timeSlots
		this.availabilityData = data.availabilityData
		this.loading = false
		this.error = null
		this.requestUpdate()

		// After data is loaded, try to scroll to the appropriate position
		this.updateComplete.then(() => {
			// If there's a selected time, scroll to it
			if (this.booking.startTime) {
				setTimeout(() => this.scrollToTime(this.booking.startTime), 150)
			}
			// Otherwise, scroll to the first available time
			else if (!this.autoScrollAttempted) {
				this.autoScrollAttempted = true
				setTimeout(() => this.scrollToFirstAvailableTime(), 150)
			}
		})

		// Announce to screen readers
		this.announceForScreenReader(`${data.timeSlots.length} time slots loaded`)
	}

	/**
	 * Handle error during time slots data loading
	 */
	private handleTimeSlotsError(err: Error): void {
		console.error('Error loading time slots:', err)

		// Use last successful data if available to maintain user experience
		if (this.lastSuccessfulData) {
			this.timeSlots = this.lastSuccessfulData.timeSlots
			this.availabilityData = this.lastSuccessfulData.availabilityData
			this.error = 'Unable to refresh time data. Showing previously loaded times.'
		} else {
			this.error = 'Failed to load available times. Please try again.'
		}

		this.loading = false
		this.requestUpdate()

		// Announce error to screen readers
		this.announceForScreenReader(this.error)
	}

	/**
	 * Load time slots data with availability information
	 */
	private loadTimeSlotsData(
		date: string,
		venueId: string,
	): Observable<{
		timeSlots: TimeSlot[]
		availabilityData: AvailabilityResponse
	}> {
		return this.availabilityService.getVenueAvailability(date, venueId).pipe(
			map(availabilityData => {
				const timeSlots = this.processAvailabilityData(availabilityData, date)
				return { timeSlots, availabilityData }
			}),
			// Share the result to prevent multiple subscription executions
			shareReplay(1),
		)
	}

	/**
	 * Process availability data into time slots
	 * Using the standardized format from the enhanced service
	 */
	private processAvailabilityData(availabilityData: AvailabilityResponse, date: string): TimeSlot[] {
		const slots: TimeSlot[] = []

		// Check if selected date is today
		const isToday = dayjs(date).isSame(dayjs(), 'day')
		const currentTime = isToday ? dayjs() : null
		const currentMinutes = currentTime ? currentTime.hour() * 60 + currentTime.minute() : 0

		// Process each time slot from the standardized availability data
		Object.entries(availabilityData.timeSlots).forEach(([timeKey, slotData]) => {
			const [hour, minute] = timeKey.split(':').map(Number)
			const value = hour * 60 + (minute || 0)

			// Check if time slot is in the past for today
			const isPastTime = isToday && currentTime ? value < currentMinutes : false

			// A time slot is available if it has available courts AND it's not in the past
			const isAvailable = slotData.isAvailable && !isPastTime

			slots.push({
				label: timeKey,
				value,
				available: isAvailable,
				// Store additional data that might be useful
				// availableCourts: slotData.availableCourts,
			})
		})

		// Sort by time
		return slots.sort((a, b) => a.value - b.value)
	}

	/**
	 * Announce messages for screen readers
	 */
	private announceForScreenReader(message: string): void {
		// Create a visually hidden element for screen reader announcements
		const announcement = document.createElement('div')
		announcement.setAttribute('aria-live', 'assertive')
		announcement.setAttribute('class', 'sr-only')
		announcement.textContent = message

		document.body.appendChild(announcement)

		// Remove the element after announcement is processed
		setTimeout(() => {
			document.body.removeChild(announcement)
		}, 1000)
	}

	/**
	 * Retry loading time slot data
	 */
	private retryLoading(): void {
		if (this.booking?.date && this.booking?.venueId) {
			this.loadTimeSlots(this.booking.date, this.booking.venueId)
		}
	}

	/**
	 * Handle time slot selection with improved scrolling behavior
	 */
	private handleTimeSelect(slot: TimeSlot): void {
		if (!slot.available) return

		// Update booking context with the new time
		const selectedDate = dayjs(this.booking.date)
		const hour = Math.floor(slot.value / 60)
		const minute = slot.value % 60
		const newStartTime = selectedDate.hour(hour).minute(minute).toISOString()

		// First update the booking context to show selection
		bookingContext.set({
			...this.booking,
			startTime: newStartTime,
		})

		// Ensure the selected time slot is properly centered after selection
		// Adding a short delay to allow the UI to update first
		setTimeout(() => this.scrollToSelectedTime(), 150)

		BookingProgressContext.set({
			currentStep: BookingStep.Duration,
		})

		this.dispatchEvent(
			new CustomEvent('next', {
				bubbles: true,
				composed: true,
			}),
		)
	}

	/**
	 * Improved method to scroll to selected time
	 * Only scrolls if the element is not already visible in the viewport
	 */
	private scrollToSelectedTime(): void {
		if (!this.booking?.startTime) return

		const time = dayjs(this.booking.startTime)
		const timeValue = time.hour() * 60 + time.minute()

		try {
			// Get the scrollable container
			const scrollContainer = this.shadowRoot?.querySelector('div.overflow-x-auto') as HTMLElement
			if (!scrollContainer) return

			// Find the selected time element
			const timeEl = this.shadowRoot?.querySelector(`[data-time-value="${timeValue}"]`) as HTMLElement
			if (!timeEl) return

			// Check if element is already in view
			const containerRect = scrollContainer.getBoundingClientRect()
			const elementRect = timeEl.getBoundingClientRect()

			// Element is fully visible if its left and right edges are within the container's viewport
			const isFullyVisible = elementRect.left >= containerRect.left && elementRect.right <= containerRect.right

			// Element is partially visible if at least some part of it is in the viewport
			const isPartiallyVisible = elementRect.left < containerRect.right && elementRect.right > containerRect.left

			// If the element is already fully visible, don't scroll
			if (isFullyVisible) {
				return
			}

			// If partially visible but more than half is visible, don't scroll either
			if (isPartiallyVisible) {
				const visibleWidth =
					Math.min(elementRect.right, containerRect.right) - Math.max(elementRect.left, containerRect.left)
				const elementVisiblePercentage = visibleWidth / elementRect.width

				if (elementVisiblePercentage > 0.5) {
					return
				}
			}

			// Calculate the center position
			const containerWidth = scrollContainer.clientWidth
			const elementOffset = timeEl.offsetLeft
			const elementWidth = timeEl.offsetWidth

			// Calculate scroll position to center the element
			const scrollPosition = elementOffset - containerWidth / 2 + elementWidth / 2

			// Smooth scroll to the calculated position
			scrollContainer.scrollTo({
				left: scrollPosition,
				behavior: 'smooth',
			})
		} catch (error) {
			console.error('Error scrolling to selected time:', error)
		}
	}

	/**
	 * Scroll to a specific time - updated for better centering
	 * Only scrolls if the element is not already visible in the viewport
	 */
	private scrollToTime(timeString: string): void {
		const time = dayjs(timeString)
		const timeValue = time.hour() * 60 + time.minute()

		try {
			// Get the scrollable container
			const scrollContainer = this.shadowRoot?.querySelector('div.overflow-x-auto') as HTMLElement
			if (!scrollContainer) return

			// Find the time element
			const timeEl = this.shadowRoot?.querySelector(`[data-time-value="${timeValue}"]`) as HTMLElement
			if (!timeEl) return

			// Check if element is already in view
			const containerRect = scrollContainer.getBoundingClientRect()
			const elementRect = timeEl.getBoundingClientRect()

			// Element is fully visible if its left and right edges are within the container's viewport
			const isFullyVisible = elementRect.left >= containerRect.left && elementRect.right <= containerRect.right

			// Element is partially visible if at least some part of it is in the viewport
			const isPartiallyVisible = elementRect.left < containerRect.right && elementRect.right > containerRect.left

			// If the element is already fully visible, don't scroll
			if (isFullyVisible) {
				return
			}

			// If partially visible but more than half is visible, don't scroll either
			if (isPartiallyVisible) {
				const visibleWidth =
					Math.min(elementRect.right, containerRect.right) - Math.max(elementRect.left, containerRect.left)
				const elementVisiblePercentage = visibleWidth / elementRect.width

				if (elementVisiblePercentage > 0.5) {
					return
				}
			}

			// Calculate the center position
			const containerWidth = scrollContainer.clientWidth
			const elementOffset = timeEl.offsetLeft
			const elementWidth = timeEl.offsetWidth

			// Calculate scroll position to center the element
			const scrollPosition = elementOffset - containerWidth / 2 + elementWidth / 2

			// Smooth scroll to the calculated position
			scrollContainer.scrollTo({
				left: scrollPosition,
				behavior: 'smooth',
			})
		} catch (error) {
			console.error('Error scrolling to time:', error)
		}
	}

	/**
	 * Scroll to first available time slot - improved for better centering
	 * Only scrolls if the element is not already visible in the viewport
	 */
	private scrollToFirstAvailableTime(): void {
		// Find the first available time slot
		const firstAvailable = this.timeSlots.find(slot => slot.available)
		if (!firstAvailable) {
			console.log('No available time slots found')
			return
		}

		try {
			// Get the scrollable container
			const scrollContainer = this.shadowRoot?.querySelector('div.overflow-x-auto') as HTMLElement
			if (!scrollContainer) return

			// Find the time element
			const timeEl = this.shadowRoot?.querySelector(`[data-time-value="${firstAvailable.value}"]`) as HTMLElement
			if (!timeEl) return

			// Check if element is already in view
			const containerRect = scrollContainer.getBoundingClientRect()
			const elementRect = timeEl.getBoundingClientRect()

			// Element is fully visible if its left and right edges are within the container's viewport
			const isFullyVisible = elementRect.left >= containerRect.left && elementRect.right <= containerRect.right

			// Element is partially visible if at least some part of it is in the viewport
			const isPartiallyVisible = elementRect.left < containerRect.right && elementRect.right > containerRect.left

			// If the element is already fully visible, don't scroll
			if (isFullyVisible) {
				// Just highlight the element
				this.highlightTimeSlot(timeEl)
				return
			}

			// If partially visible but more than half is visible, don't scroll either
			if (isPartiallyVisible) {
				const visibleWidth =
					Math.min(elementRect.right, containerRect.right) - Math.max(elementRect.left, containerRect.left)
				const elementVisiblePercentage = visibleWidth / elementRect.width

				if (elementVisiblePercentage > 0.5) {
					// Just highlight the element
					this.highlightTimeSlot(timeEl)
					return
				}
			}

			// Calculate the center position
			const containerWidth = scrollContainer.clientWidth
			const elementOffset = timeEl.offsetLeft
			const elementWidth = timeEl.offsetWidth

			// Calculate scroll position to center the element
			const scrollPosition = elementOffset - containerWidth / 2 + elementWidth / 2

			// Smooth scroll to the calculated position
			scrollContainer.scrollTo({
				left: scrollPosition,
				behavior: 'smooth',
			})

			// Highlight the element
			this.highlightTimeSlot(timeEl)
		} catch (error) {
			console.error('Error scrolling to first available time:', error)
		}
	}

	/**
	 * Highlight a time slot with a subtle animation
	 */
	private highlightTimeSlot(element: HTMLElement): void {
		element.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }], {
			duration: 800,
			easing: 'ease-in-out',
		})
	}

	/**
	 * Detect if user's system prefers 24-hour time format
	 */
	private _detectTimeFormatPreference(): boolean {
		try {
			const testDate = new Date(2000, 0, 1, 13, 0, 0)
			const formattedTime = new Intl.DateTimeFormat(this.userLocale, {
				hour: 'numeric',
				hour12: false,
			}).format(testDate)

			return formattedTime.includes('13')
		} catch (e) {
			return true
		}
	}

	/**
	 * Format time for display
	 */
	private formatTime(hour: number, minute: number): string {
		try {
			const date = new Date()
			date.setHours(hour)
			date.setMinutes(minute)

			if (this.use24HourFormat) {
				return new Intl.DateTimeFormat(this.userLocale, {
					hour: '2-digit',
					minute: '2-digit',
					hour12: false,
				}).format(date)
			} else {
				return new Intl.DateTimeFormat(this.userLocale, {
					hour: 'numeric',
					minute: '2-digit',
					hour12: true,
				}).format(date)
			}
		} catch (error) {
			// Fallback formatting
			const hourDisplay = this.use24HourFormat ? hour : hour % 12 || 12
			const minuteDisplay = minute === 0 ? '00' : minute < 10 ? `0${minute}` : minute
			const suffix = this.use24HourFormat ? '' : hour >= 12 ? ' PM' : ' AM'
			return `${hourDisplay}:${minuteDisplay}${suffix}`
		}
	}

	/**
	 * Check if a time slot is currently selected
	 */
	private isTimeSelected(slot: TimeSlot): boolean {
		if (!!this.booking && !this.booking.startTime) return false

		const startTime = dayjs(this.booking.startTime)
		const slotValue = slot.value
		const timeValue = startTime.hour() * 60 + startTime.minute()

		return timeValue === slotValue
	}

	/**
	 * Render error state
	 */
	private renderErrorState(): unknown {
		return html`
			<div class="p-6 bg-error-container rounded-lg text-center">
				<schmancy-icon size="32px" class="text-error-default mb-2">error_outline</schmancy-icon>
				<p class="text-error-on-container mb-2">${this.error}</p>
				<button @click=${() => this.retryLoading()} class="px-4 py-2 bg-error-default text-error-on rounded-md mt-2">
					Try Again
				</button>
			</div>
		`
	}

	/**
	 * Render empty state (no time slots)
	 */
	private renderEmptyState(): unknown {
		return html`
			<div class="text-center py-6">
				<schmancy-icon size="48px" class="text-surface-on-variant opacity-50">schedule</schmancy-icon>
				<schmancy-typography type="body" token="md" class="mt-2">
					No time slots available for this date.
				</schmancy-typography>
			</div>
		`
	}

	/**
	 * Render loading state
	 */
	private renderLoadingState(): unknown {
		return html`
			<div class="text-center py-6">
				<div
					class="inline-block w-8 h-8 border-4 border-t-primary-default border-r-outlineVariant border-b-outlineVariant border-l-outlineVariant rounded-full animate-spin"
				></div>
				<schmancy-typography type="body" token="md" class="mt-2">Loading time slots...</schmancy-typography>
			</div>
		`
	}

	/**
	 * Main render method
	 */
	render() {
		if (this.hidden) return nothing

		// Show loading state
		if (this.loading && !this.lastSuccessfulData) {
			return this.renderLoadingState()
		}

		// Show error message if present
		if (this.error && !this.lastSuccessfulData) {
			return this.renderErrorState()
		}

		// Show empty state if no time slots
		if (this.timeSlots.length === 0) {
			return this.renderEmptyState()
		}

		// Define class objects for animated transitions
		const containerClasses = {
			'w-full': true,
			'bg-surface-container-low': true,
			'rounded-lg': true,
			'shadow-sm': true,
			'transition-all': true,
			'duration-300': true,
			'mt-3': true, // Match court select spacing
			'p-4': !this.isCompact,
			'p-3': this.isCompact,
			transform: true,
			'ease-in-out': true,
			'scale-100': this.active,
			'scale-95': !this.active && !this.isCompact,
		}

		// Render main content
		return html`
			<div class=${classMap(containerClasses)}>
				<!-- Error message if present while still showing content -->
				${this.error
					? html`
							<div class="bg-error-container p-2 rounded-t-lg text-error-on-container text-sm text-center mb-3">
								${this.error}
								<button @click=${() => this.retryLoading()} class="ml-2 underline font-medium">Refresh</button>
							</div>
					  `
					: nothing}

				<!-- Title section with animations aligned with court-select -->
				${when(
					this.active || this.booking.startTime,
					() => html`
						<div class="flex justify-between items-center mb-3 transition-all duration-300">
							<div class="transition-all duration-300 ${this.isCompact ? 'text-base' : 'text-lg font-medium'}">
								Select Time
								${this.isCompact && !this.booking.startTime
									? html`<span class="text-primary-default ml-1">(No time selected)</span>`
									: nothing}
							</div>

							${when(
								this.booking.startTime,
								() => html`
									<div
										class="text-primary-default transition-all duration-300 ${this.isCompact
											? 'text-sm'
											: 'text-base'} font-medium"
									>
										${this.formatTime(dayjs(this.booking.startTime).hour(), dayjs(this.booking.startTime).minute())}
									</div>
								`,
							)}
						</div>
					`,
					() => html`
						<div class="text-center py-2 font-medium">
							${this.booking.startTime
								? this.formatTime(dayjs(this.booking.startTime).hour(), dayjs(this.booking.startTime).minute())
								: 'Time'}
						</div>
					`,
				)}

				<!-- Time slots scrollable container with animation -->
				<schmancy-scroll hide>
					<div
						class="flex py-2 overflow-x-auto scrollbar-hide transition-all duration-300 ${this.isCompact
							? 'gap-2'
							: 'gap-3'}"
						role="listbox"
						aria-label="Available Time Slots"
						aria-multiselectable="false"
					>
						${repeat(
							this.timeSlots,
							slot => slot.value,
							slot => this.renderTimeSlot(slot),
						)}
					</div>
				</schmancy-scroll>
			</div>
		`
	}

	/**
	 * Render a time slot with animations
	 */
	private renderTimeSlot(slot: TimeSlot) {
		const isSelected = this.isTimeSelected(slot)

		// Size and spacing classes based on compact state
		const sizeClasses = {
			// Normal size
			'w-24': !this.isCompact,
			'h-24': !this.isCompact,
			// Compact size
			'w-16': this.isCompact,
			'h-16': this.isCompact,
		}

		// Classes for the time slot
		const slotClasses = {
			// Basic layout
			'flex-none': true,
			'rounded-lg': true,
			flex: true,
			'flex-col': true,
			'items-center': true,
			'justify-center': true,
			border: true,

			// Sizes with animation
			...sizeClasses,

			// Transitions - enhanced to match court select motion
			'transition-all': true,
			'duration-300': true,
			transform: true,
			'ease-in-out': true,

			// Interaction states - enhanced with court-like motion
			'cursor-pointer': slot.available,
			'cursor-not-allowed': !slot.available,
			'hover:scale-105': slot.available && !isSelected,
			'hover:shadow-md': slot.available && !isSelected,
			'active:scale-95': slot.available && !isSelected, // Add press animation

			// Selected animation
			'scale-105': isSelected, // Make selected items slightly larger like in court
			'shadow-md': isSelected, // Add shadow to selected items

			// Visual states
			'bg-primary-default': isSelected,
			'text-primary-on': isSelected,
			'border-primary-default': isSelected,
			'bg-surface-high': !isSelected && slot.available,
			'border-outlineVariant': !isSelected && slot.available,
			'text-surface-on': !isSelected && slot.available,
			'bg-error-container/10': !slot.available,
			'border-error-container': !slot.available,
			'text-error-default': !slot.available,
			'opacity-60': !slot.available,
		}

		// Icon animation classes
		const iconClasses = {
			'transition-all': true,
			'duration-300': true,
			transform: true,
			'text-primary-on': isSelected,
			'text-primary-default': !isSelected && slot.available,
			'text-error-default': !slot.available,
			'scale-125': isSelected, // Enlarge icon when selected
		}

		// Text animation classes
		const textClasses = {
			'font-bold': true,
			'mt-1': true,
			'transition-all': true,
			'duration-300': true,
			'text-base': !this.isCompact && isSelected, // Keep text readable even in compact mode when selected
			'text-sm': this.isCompact || !isSelected,
		}

		return html`
			<div
				class=${classMap(slotClasses)}
				@click=${() => this.handleTimeSelect(slot)}
				data-time-value=${slot.value}
				role="option"
				aria-selected="${isSelected ? 'true' : 'false'}"
				aria-disabled="${!slot.available ? 'true' : 'false'}"
			>
				<!-- Status icon with enhanced animation -->
				<schmancy-icon class=${classMap(iconClasses)} size=${this.isCompact ? '14px' : '16px'}>
					${slot.available ? 'schedule' : 'block'}
				</schmancy-icon>

				<!-- Time display with enhanced animation -->
				<div class=${classMap(textClasses)}>${this.formatTime(Math.floor(slot.value / 60), slot.value % 60)}</div>

				<!-- Availability label with transition -->
				${slot.available && !isSelected
					? html`<div
							class="transition-all duration-300 ${this.isCompact
								? 'text-2xs mt-0.5'
								: 'text-xs mt-1'} text-success-default"
					  >
							${this.isCompact ? '' : 'Available'}
					  </div>`
					: nothing}
				${!slot.available
					? html`<div
							class="transition-all duration-300 ${this.isCompact
								? 'text-2xs mt-0.5'
								: 'text-xs mt-1'} text-error-default"
					  >
							${this.isCompact ? 'N/A' : 'Unavailable'}
					  </div>`
					: nothing}
			</div>
		`
	}
}

// Register the element in the global namespace
declare global {
	interface HTMLElementTagNameMap {
		'time-selection-step': TimeSelectionStep
	}
}
