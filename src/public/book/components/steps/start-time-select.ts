import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { css, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { distinctUntilChanged, filter, startWith, takeUntil, tap } from 'rxjs'
import { availabilityCoordinator } from 'src/bookingServices/availability-coordinator'
import { toUTC } from 'src/utils/timezone'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'
import { TimeSlot } from '../../types'

// Configure dayjs with timezone plugins
dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Get user's timezone or default to Berlin
 */
function getUserTimezone(): string {
	try {
		const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
		return detectedTimezone || 'Europe/Berlin'
	} catch (e) {
		console.warn('Could not detect timezone:', e)
		return 'Europe/Berlin'
	}
}

/**
 * Convert UTC ISO string to user's local timezone
 */
function toUserTimezone(isoString: string): dayjs.Dayjs {
	const userTimezone = getUserTimezone()
	return dayjs(isoString).tz(userTimezone)
}

/**
 * Time selection component using the enhanced availability service
 * With proper timezone handling
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
	@select(bookingContext, undefined, {
		required: true,
	})
	booking!: Booking
	@select(BookingProgressContext, undefined, {
		required: true,
	})
	bookingProgress!: BookingProgress

	// State properties
	@state() timeSlots: TimeSlot[] = []
	@state() loading = true
	@state() error: string | null = null
	@state() autoScrollAttempted = false
	@state() userTimezone = getUserTimezone()

	// Track the last successful time slots data for better UX during errors
	private lastSuccessfulData: { timeSlots: TimeSlot[] } | null = null

	// User's locale for time formatting
	private userLocale = navigator.language || 'en-US'
	private use24HourFormat = this._detectTimeFormatPreference()

	/**
	 * Determine if compact view should be used based on booking progress context
	 */
	get isCompact(): boolean {
		return this.bookingProgress?.currentStep !== BookingStep.Time
	}

	connectedCallback(): void {
		super.connectedCallback()

		// Subscribe to BookingProgressContext changes to track compact state
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

		// Subscribe to availability coordinator errors
		availabilityCoordinator.error$
			.pipe(
				takeUntil(this.disconnecting),
				filter(error => !!error),
			)
			.subscribe(error => {
				this.error = error
				this.requestUpdate()
			})

		// Subscribe to availability coordinator loading state
		availabilityCoordinator.loading$.pipe(takeUntil(this.disconnecting)).subscribe(loading => {
			this.loading = loading
			this.requestUpdate()
		})

		// Subscribe to booking context changes
		bookingContext.$.pipe(
			startWith(bookingContext.value),
			takeUntil(this.disconnecting),
			filter(booking => {
				// Make sure we have both date and courtId before proceeding
				const hasRequiredFields = !!booking.date && !!booking.courtId
				if (!hasRequiredFields) {
					console.log('Booking context missing required fields:', booking)
				}
				return hasRequiredFields
			}),
			// Important: we need to ensure we re-fetch when either date OR courtId changes
			distinctUntilChanged((prev, curr) => prev.date === curr.date && prev.courtId === curr.courtId),
			tap(booking => {
				console.log('Booking context changed, triggering time slots refresh', {
					date: booking.date,
					courtId: booking.courtId,
					venueId: booking.venueId,
				})
				// Reset time slots to force reload
				this.timeSlots = []
				this.autoScrollAttempted = false
				this.loading = true
				this.error = null
				this.lastSuccessfulData = null

				// Force availability coordinator to refresh data for this court
				availabilityCoordinator.refreshData()
			}),
		).subscribe()

		// Subscribe to availability data from coordinator
		availabilityCoordinator.availabilityData$
			.pipe(
				takeUntil(this.disconnecting),
				filter(data => !!data),
			)
			.subscribe(data => {
				console.log('Received availability data:', data)
				if (data) {
					this.processAvailabilityData(data)
				}
			})
	}

	// Improved processAvailabilityData method with timezone handling
	private processAvailabilityData(data: any): void {
		console.log('Processing availability data for court:', this.booking?.courtId)

		// If we don't have a selected court, we can't determine availability
		if (!this.booking?.courtId) {
			this.timeSlots = []
			this.error = 'No court selected'
			this.loading = false
			this.requestUpdate()
			return
		}

		console.log('Processing availability data for court ID:', this.booking.courtId)

		// Check if data is empty or missing timeSlots
		if (!data || Object.keys(data).length === 0 || !data.timeSlots) {
			console.warn('Missing or empty availability data - generating default time slots')
			// Generate fallback time slots
			this.generateDefaultTimeSlots()
			return
		}

		try {
			// Get the selected court ID from booking context
			const courtId = this.booking.courtId

			// Normalize the date format - this is crucial
			// booking.date could be a full ISO string or just YYYY-MM-DD
			let formattedDate = this.booking.date
			if (formattedDate.includes('T')) {
				// If it's a full ISO string, extract just the date part
				formattedDate = formattedDate.split('T')[0]
			}

			console.log('Processing availability for date:', formattedDate, 'court:', courtId)

			// Use the AvailabilityCoordinator's getAvailableTimeSlots method to get formatted time slots
			const allTimeSlots = availabilityCoordinator.getAvailableTimeSlots(formattedDate)
			console.log('All time slots from coordinator:', allTimeSlots)

			// Filter time slots to only include those available for the selected court
			const courtSpecificTimeSlots = allTimeSlots.map(slot => {
				// Convert value back to time string format (HH:MM)
				const hour = Math.floor(slot.value / 60)
				const minute = slot.value % 60
				const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`

				// Important: Use consistent timezone conversion when checking availability
				const isAvailable = slot.available && availabilityCoordinator.isCourtAvailable(courtId, timeString)

				return {
					...slot,
					available: isAvailable,
				}
			})

			// Log to help with debugging
			console.log(
				`Processed ${courtSpecificTimeSlots.length} time slots for court ${courtId}, ${
					courtSpecificTimeSlots.filter(s => s.available).length
				} available`,
			)

			// Update component state
			this.timeSlots = courtSpecificTimeSlots
			this.lastSuccessfulData = { timeSlots: courtSpecificTimeSlots }
			this.loading = false
			this.error = null

			// Force update
			this.requestUpdate()

			// After data is loaded, try to scroll to the appropriate position
			this.updateComplete.then(() => {
				if (this.booking.startTime) {
					setTimeout(() => this.scrollToTime(this.booking.startTime), 150)
				} else if (!this.autoScrollAttempted) {
					this.autoScrollAttempted = true
					setTimeout(() => this.scrollToFirstAvailableTime(), 150)
				}
			})

			this.announceForScreenReader(
				`${courtSpecificTimeSlots.filter(s => s.available).length} available time slots loaded`,
			)
		} catch (error) {
			console.error('Error processing availability data:', error)
			this.generateDefaultTimeSlots()
		}
	}

	/**
	 * Generate default time slots when availability data is missing
	 * With proper timezone handling
	 */
	private generateDefaultTimeSlots(): void {
		// Check if date is today
		const userTimezone = getUserTimezone()
		const selectedDate = dayjs(this.booking.date).tz(userTimezone)
		const now = dayjs().tz(userTimezone)
		const isToday = selectedDate.format('YYYY-MM-DD') === now.format('YYYY-MM-DD')
		const currentTime = isToday ? now : null

		// Start time (8:00 AM or current time rounded up to next 30 min if today)
		let startHour = 8
		let startMinute = 0

		if (isToday && currentTime) {
			startHour = currentTime.hour()
			startMinute = currentTime.minute() < 30 ? 30 : 0

			// If we're past the 30-minute mark, move to the next hour
			if (startMinute === 0) {
				startHour += 1
			}

			// If we're past operating hours, show message
			if (startHour >= 22) {
				this.timeSlots = []
				this.error = 'No more available slots today'
				this.loading = false
				this.requestUpdate()
				return
			}
		}

		// End time (10:00 PM)
		const endHour = 22

		// Generate time slots
		const slots: TimeSlot[] = []

		// Generate 30-minute slots
		for (let hour = startHour; hour <= endHour; hour++) {
			// For first hour, start from startMinute (0 or 30)
			const minutesToInclude =
				hour === startHour ? [startMinute, startMinute === 0 ? 30 : null].filter(Boolean) : [0, 30]

			for (const minute of minutesToInclude) {
				// Skip if past end time
				if (hour === endHour && (minute || 0) > 0) continue // Don't go past end time

				const value = hour * 60 + (minute || 0) // Convert to minutes
				const timeString = `${hour.toString().padStart(2, '0')}:${(minute || 0).toString().padStart(2, '0')}`

				slots.push({
					label: timeString,
					value,
					available: true, // Assume all slots are available since we don't have real data
				})
			}
		}

		console.log(`Generated ${slots.length} default time slots`)
		this.timeSlots = slots
		this.lastSuccessfulData = { timeSlots: slots }
		this.loading = false
		this.error = 'Using estimated availability - actual availability may vary'
		this.requestUpdate()

		// After data is loaded, try to scroll to the appropriate position
		this.updateComplete.then(() => {
			if (this.booking.startTime) {
				setTimeout(() => this.scrollToTime(this.booking.startTime), 150)
			} else if (!this.autoScrollAttempted) {
				this.autoScrollAttempted = true
				setTimeout(() => this.scrollToFirstAvailableTime(), 150)
			}
		})

		this.announceForScreenReader(`${slots.length} estimated time slots loaded`)
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
		// Force a refresh of availability data
		availabilityCoordinator.refreshData()
	}

	/**
	 * Handle time slot selection with improved timezone handling
	 */
	private handleTimeSelect(slot: TimeSlot): void {
		if (!slot.available) return

		try {
			// Convert selected time to UTC ISO string using our utility
			const hour = Math.floor(slot.value / 60)
			const minute = slot.value % 60
			const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`

			// Use the utility to convert to UTC
			const newStartTime = toUTC(this.booking.date, timeString)

			// Log for debugging
			console.log(`Selected time:
        - Local: ${timeString}
        - UTC ISO: ${newStartTime}
      `)

			// Update booking context with the UTC time
			bookingContext.set({
				...this.booking,
				startTime: newStartTime,
			})

			// Ensure the selected time slot is properly centered after selection
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
		} catch (error) {
			console.error('Error handling time selection:', error)
			this.error = 'Failed to select time. Please try again.'
			this.requestUpdate()
		}
	}

	/**
	 * Improved method to scroll to selected time
	 */
	private scrollToSelectedTime(): void {
		if (!this.booking?.startTime) return

		try {
			// Convert stored UTC time to user's timezone
			const localTime = toUserTimezone(this.booking.startTime)
			const timeValue = localTime.hour() * 60 + localTime.minute()

			// Find and scroll to the element
			const scrollContainer = this.shadowRoot?.querySelector('div.overflow-x-auto') as HTMLElement
			if (!scrollContainer) return

			const timeEl = this.shadowRoot?.querySelector(`[data-time-value="${timeValue}"]`) as HTMLElement
			if (!timeEl) return

			// Check visibility and scroll if needed
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
	 * Scroll to a specific time with timezone handling
	 */
	private scrollToTime(timeString: string): void {
		try {
			// Convert to user's local time
			const localTime = toUserTimezone(timeString)
			const timeValue = localTime.hour() * 60 + localTime.minute()

			// Get the scrollable container
			const scrollContainer = this.shadowRoot?.querySelector('div.overflow-x-auto') as HTMLElement
			if (!scrollContainer) return

			// Find the time element
			const timeEl = this.shadowRoot?.querySelector(`[data-time-value="${timeValue}"]`) as HTMLElement
			if (!timeEl) {
				console.log(`Time element not found for value: ${timeValue}`)
				return
			}

			// Check visibility and scroll if needed
			const containerRect = scrollContainer.getBoundingClientRect()
			const elementRect = timeEl.getBoundingClientRect()
			const isFullyVisible = elementRect.left >= containerRect.left && elementRect.right <= containerRect.right
			const isPartiallyVisible = elementRect.left < containerRect.right && elementRect.right > containerRect.left

			if (isFullyVisible) return

			if (isPartiallyVisible) {
				const visibleWidth =
					Math.min(elementRect.right, containerRect.right) - Math.max(elementRect.left, containerRect.left)
				const elementVisiblePercentage = visibleWidth / elementRect.width
				if (elementVisiblePercentage > 0.5) return
			}

			// Calculate and perform smooth scroll
			const containerWidth = scrollContainer.clientWidth
			const elementOffset = timeEl.offsetLeft
			const elementWidth = timeEl.offsetWidth
			const scrollPosition = elementOffset - containerWidth / 2 + elementWidth / 2

			scrollContainer.scrollTo({
				left: scrollPosition,
				behavior: 'smooth',
			})
		} catch (error) {
			console.error('Error scrolling to time:', error)
		}
	}

	/**
	 * Scroll to first available time slot
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
	 * Format time for display, respecting user's locale and timezone
	 */
	private formatTime(hour: number, minute: number): string {
		try {
			// Create a date in the user's timezone
			const userTimezone = getUserTimezone()
			const date = dayjs().tz(userTimezone).hour(hour).minute(minute).second(0).millisecond(0)

			if (this.use24HourFormat) {
				return date.format('HH:mm')
			} else {
				return date.format('h:mm A')
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
	 * Check if a time slot is currently selected, with timezone handling
	 */
	private isTimeSelected(slot: TimeSlot): boolean {
		if (!!this.booking && !this.booking.startTime) return false

		try {
			// Convert stored UTC time to user's timezone
			const localStartTime = toUserTimezone(this.booking.startTime)
			const slotValue = slot.value
			const timeValue = localStartTime.hour() * 60 + localStartTime.minute()

			return timeValue === slotValue
		} catch (error) {
			console.error('Error checking if time is selected:', error)
			return false
		}
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
	 * Main render method - fixed to handle all states correctly
	 */
	render() {
		console.log(`Rendering time selection with:
			- loading: ${this.loading}
			- timeSlots count: ${this.timeSlots.length}
			- hasLastData: ${Boolean(this.lastSuccessfulData)}
			- error: ${this.error}
		`)

		// Show loading state only if we're loading and don't have any data yet
		if (this.loading && this.timeSlots.length === 0 && !this.lastSuccessfulData) {
			return this.renderLoadingState()
		}

		// Use timeSlots if we have them, otherwise fall back to lastSuccessfulData
		const slots = this.timeSlots.length > 0 ? this.timeSlots : this.lastSuccessfulData?.timeSlots || []

		// Show empty state if we have no time slots after all fallbacks
		if (slots.length === 0) {
			return this.renderEmptyState()
		}

		// Define class objects for animated transitions
		const containerClasses = {
			'px-2': true,
			'w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'transition-all': true,
			'duration-300': true,
			'mt-3': true, // Match court select spacing
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

				<!-- Loading indicator overlay if loading but showing existing data -->
				${this.loading && slots.length > 0
					? html`
							<div class="bg-surface-low bg-opacity-80 p-1 text-center text-xs flex justify-center items-center gap-2">
								<div
									class="inline-block w-4 h-4 border-2 border-t-primary-default border-r-outlineVariant border-b-outlineVariant border-l-outlineVariant rounded-full animate-spin"
								></div>
								<span>Updating...</span>
							</div>
					  `
					: nothing}

				<!-- Title section with animations aligned with court-select -->
				${when(
					this.active,
					() => html`
						<schmancy-typography type="label" token="lg" class="font-medium text-primary-default">
							Select Time
						</schmancy-typography>
						<div class="text-xs text-surface-on-variant mt-1">
							Times shown in your local timezone (${this.userTimezone})
						</div>
					`,
				)}

				<!-- Time slots scrollable container with animation -->
				<div
					class="flex py-2 overflow-x-auto scrollbar-hide transition-all duration-300 ${this.isCompact
						? 'gap-2'
						: 'gap-3'}"
					role="listbox"
					aria-label="Available Time Slots"
					aria-multiselectable="false"
				>
					${repeat(
						slots,
						slot => slot.value,
						slot => this.renderTimeSlot(slot),
					)}
				</div>
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
			'bg-success-container/10': !isSelected && slot.available,
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
								? 'text-2xs mt-0.25'
								: 'text-xs mt-1'} text-error-default"
					  >
							<schmancy-typography type="label" token="sm">
								${this.isCompact ? '' : 'Unavailable'}
							</schmancy-typography>
					  </div>`
					: nothing}
			</div>
		`
	}
}
