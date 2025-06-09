import { $notify, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { css, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { createRef, ref, Ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  fromEvent,
  map,
  Observable,
  shareReplay,
  startWith,
  take,
  takeUntil,
  tap,
} from 'rxjs'
import {
  availabilityContext,
  AvailabilityData,
  availabilityLoading$,
  getAvailableTimeSlots,
} from 'src/availability-context'
import { BookingFlowType } from 'src/types'
import { toUTC } from 'src/utils/timezone'
import { transitionToNextStep } from '../../booking-steps-utils'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'
import { TimeSlot } from '../../types'

// Configure dayjs with timezone plugins
dayjs.extend(utc)
dayjs.extend(timezone)

// Simple animation preset for selected time slot
const PULSE_ANIMATION = {
	keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }],
	options: {
		duration: 200,
		easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
	},
}

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
 * Enhanced time selection component with CSS-based transitions
 * Uses RxJS for state management and CSS transitions for view changes
 */
@customElement('time-selection-step')
export class TimeSelectionStep extends $LitElement(css`
	:host {
		display: block;
		position: relative;
	}
	.scrollbar-hide {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none; /* Chrome, Safari, and Opera */
	}

	/* View transition system */
	.view-container {
		position: relative;
		min-height: 45px; /* Minimum height to prevent collapse during transitions */
	}

	.grid-view,
	.list-view {
		opacity: 0;
		visibility: hidden;
		transition: opacity 100ms ease, visibility 0ms 100ms;
		position: absolute;
		width: 100%;
		top: 0;
		left: 0;
	}

	.grid-view.active,
	.list-view.active {
		opacity: 1;
		visibility: visible;
		transition: opacity 100ms ease, visibility 0ms;
		position: relative;
	}
`) {
	@property({ type: Boolean }) active = true
	@property({ type: Boolean }) hidden = false

	// Basic dependencies
	@select(bookingContext)
	booking!: Booking

	@select(BookingProgressContext)
	bookingProgress!: BookingProgress

	// Add availability context
	@select(availabilityContext)
	availability!: AvailabilityData

	// Core state streams
	private state$ = new BehaviorSubject<{
		timeSlots: TimeSlot[]
		loading: boolean
		error: string | null
		autoScrollAttempted: boolean
		viewMode: 'grid' | 'list'
		showingEstimatedPrices: boolean
	}>({
		timeSlots: [],
		loading: true,
		error: null,
		autoScrollAttempted: false,
		viewMode: 'grid',
		showingEstimatedPrices: false,
	})

	// State properties derived from observables
	@state() isActive = false
  @state() isExpanded = false
	@state() isCompact = false
	@state() isDesktopOrTablet = window.innerWidth >= 768
	@state() shouldUseGridView = false

	// Simple transition state
	@state() isTransitioning = false

	// Observables for reactive state management
	private isActive$!: Observable<boolean>
	private isCompact$!: Observable<boolean>
	private isDesktopOrTablet$!: Observable<boolean>
	private shouldUseGridView$!: Observable<boolean>

	// User preferences
	private userTimezone = getUserTimezone()
	private userLocale = navigator.language || 'en-US'
	use24HourFormat = this._detectTimeFormatPreference()

	// Store references for cleanup
	private resizeObserver: ResizeObserver | null = null

	// Refs for DOM elements
	private scrollContainerRef: Ref<HTMLElement> = createRef<HTMLElement>()
	private timeSlotRefs = new Map<number, HTMLElement>()
	
	// Track previous selected time to avoid unnecessary scrolling
	private previousSelectedTime: string | undefined = undefined

	// Connection lifecycle methods
	connectedCallback(): void {
		super.connectedCallback()

		// Initialize derived streams
		this.setupStateStreams()

		// Set up resize observer for responsive layout
		this.setupResizeObserver()

		// Subscribe to external data sources
		this.subscribeToBookingContext()
		this.subscribeToProgressContext()
		this.subscribeToAvailabilityContext()
	}

	disconnectedCallback(): void {
		super.disconnectedCallback()

		// Clean up observers
		if (this.resizeObserver) {
			this.resizeObserver.disconnect()
			this.resizeObserver = null
		}

		// Clean up refs
		this.clearTimeSlotRefs()
	}

	// Clear time slot references when no longer needed
	private clearTimeSlotRefs(): void {
		this.timeSlotRefs.clear()
	}

	// Stream setup methods
	private setupStateStreams(): void {
		// Screen size stream - check for md breakpoint (768px)
		this.isDesktopOrTablet$ = fromEvent(window, 'resize').pipe(
			startWith(null),
			map(() => window.innerWidth >= 768),
			distinctUntilChanged(),
			shareReplay(1),
		)

		// Active state from BookingProgressContext
		this.isActive$ = BookingProgressContext.$.pipe(
			map(progress => {
				// Find the position of Time step in the steps array
				const timeStepIndex = progress.steps.findIndex(s => s.step === BookingStep.Time)
				// Check if this position matches the current step
				return progress.currentStep === timeStepIndex +1
			}),
			startWith(this.active),
			distinctUntilChanged(),
			filter(() => !this.isTransitioning),
			shareReplay(1),
		)

    // Add new expanded state stream
    const isExpanded$ = BookingProgressContext.$.pipe(
      map(progress => progress.expandedSteps.includes(BookingStep.Time)),
      distinctUntilChanged(),
      shareReplay(1)
    )

    // Subscribe to isExpanded changes
    isExpanded$.pipe(takeUntil(this.disconnecting)).subscribe(isExpanded => {
      this.isExpanded = isExpanded
      this.requestUpdate()
    })

		// Subscribe to isActive changes with animation handling
		this.isActive$.pipe(takeUntil(this.disconnecting)).subscribe(isActive => {
			if (this.isActive !== isActive) {
				// Set transitioning flag to enable smooth animations
				this.isTransitioning = true
				
				// Update active state
				this.isActive = isActive
				
				// Reset transitioning flag after animation time
				setTimeout(() => {
					this.isTransitioning = false
					this.requestUpdate()
				}, 350)
				
				this.requestUpdate()
			}
		})

		// Compact mode stream
		this.isCompact$ = BookingProgressContext.$.pipe(
			map(progress => progress.currentStep !== BookingStep.Time),
			distinctUntilChanged(),
			shareReplay(1),
		)

		// Calculate view mode based on screen size and active state
		combineLatest([this.isDesktopOrTablet$, this.isActive$, bookingContext.$.pipe(map(booking => !!booking?.startTime))])
			.pipe(
				map(([isDesktop, isActive, hasSelection]) => {
					// If not active, always use list view
					if (!isActive) return 'list'

					// If selection is made, switch to list view
					if (hasSelection) return 'list'

					// If switching to mobile, always use list
					if (!isDesktop) return 'list'

					// If switching from inactive to active on desktop, use grid
					if (isActive && isDesktop) return 'grid'

					// Default to current mode
					return this.state$.value.viewMode
				}),
				distinctUntilChanged(),
				takeUntil(this.disconnecting),
			)
			.subscribe(viewMode => {
				// Set transition flag
				this.isTransitioning = true

				// Update state with new view mode
				this.updateState({ viewMode })

				// Reset transition flag after animation
				this.isTransitioning = false

				// Handle auto-scrolling for list view
				if (viewMode === 'list') {
					setTimeout(() => {
						// If booking start time is set, scroll to it
						if (this.booking.startTime) {
							this.scrollToTime(this.booking.startTime)
						}
						// If no start time and auto-scroll not attempted, scroll to first available time
						else if (!this.state$.value.autoScrollAttempted) {
							this.updateState({ autoScrollAttempted: true })
							this.scrollToFirstAvailableTime()
						}
					}, 250)
				}
			})

		// Should use grid view - derived from other streams
		this.shouldUseGridView$ = combineLatest([
			this.isActive$,
			this.isDesktopOrTablet$,
			this.state$.pipe(map(state => state.viewMode)),
		]).pipe(
			map(([isActive, isDesktop, viewMode]) => isActive && isDesktop && viewMode === 'grid'),
			distinctUntilChanged(),
			shareReplay(1),
		)

		// Subscribe to all observables and update component properties
		this.isCompact$.pipe(takeUntil(this.disconnecting)).subscribe(isCompact => {
			this.isCompact = isCompact
			this.requestUpdate()
		})

		this.isDesktopOrTablet$.pipe(takeUntil(this.disconnecting)).subscribe(isDesktopOrTablet => {
			this.isDesktopOrTablet = isDesktopOrTablet
			this.requestUpdate()
		})

		this.shouldUseGridView$.pipe(takeUntil(this.disconnecting)).subscribe(shouldUseGridView => {
			this.shouldUseGridView = shouldUseGridView
			this.requestUpdate()
		})
	}

	private setupResizeObserver(): void {
		this.resizeObserver = new ResizeObserver(() => {
			const isDesktopOrTablet = window.innerWidth >= 384
			this.isDesktopOrTablet$
				.pipe(
					takeUntil(this.disconnecting),
					filter(current => current !== isDesktopOrTablet),
					take(1),
				)
				.subscribe()
		})

		// Observe document body for size changes
		this.resizeObserver.observe(document.body)
	}

	// External subscriptions
	private subscribeToBookingContext(): void {
		bookingContext.$.pipe(
			takeUntil(this.disconnecting),
			filter(booking => !!booking.date && !!booking.venueId),
			tap(() => {
				this.updateState({
					autoScrollAttempted: false,
					loading: true,
					error: null,
				})
			}),
			// Listen for changes to date, venue, or court ID to refresh time slots
			distinctUntilChanged((prev, curr) => 
				prev.date === curr.date && 
				prev.venueId === curr.venueId &&
				prev.courtId === curr.courtId
			),
			shareReplay(1),
		).subscribe(() => {
			// Reload time slots when booking data changes (including court selection)
			this.loadTimeSlots()
		})
	}

	/**
	 * Check if the selected time is now unavailable due to other selections
	 * and unselect it if necessary
	 */
	private checkSelectedTimeAvailability(): void {
		const booking = this.booking
		
		// If no time is selected, nothing to check
		if (!booking || !booking.startTime) return

		// Get the selected time in local timezone
		const localStartTime = toUserTimezone(booking.startTime)
		const timeValue = localStartTime.hour() * 60 + localStartTime.minute()
		
		// Find this time in our current time slots
		const selectedSlot = this.state$.value.timeSlots.find(slot => slot.value === timeValue)
		
		// If the selected time is now unavailable, clear the selection
		if (selectedSlot && !selectedSlot.available) {
			console.log('Selected time is no longer available due to changed selections, clearing time selection')
			
			// Update booking context to clear times
			// This will trigger the subscription in court-select that watches for time changes
			bookingContext.set({
				startTime: '',
				endTime: '',
			}, true)

			// Notify the user
			$notify.error('Your previously selected time is no longer available. Please select another time slot.',{
				duration: 2000,
				playSound: true
			})
      
			// Request update to refresh UI
			this.requestUpdate()
		}
	}

	private subscribeToProgressContext(): void {
		BookingProgressContext.$.pipe(takeUntil(this.disconnecting)).subscribe(progress => {
			if (progress.currentStep === BookingStep.Time) {
				this.updateState({ autoScrollAttempted: false })

				// Try to scroll to first available after DOM update
				this.updateComplete.then(() => {
					if (this.state$.value.viewMode === 'list') {
						this.scrollToFirstAvailableTime()
					}
				})
			}
		})
	}

	private subscribeToAvailabilityContext(): void {
		// Subscribe to availability context updates
		availabilityContext.$.pipe(
			takeUntil(this.disconnecting),
			filter(availability => !!availability && !!availability.date && !!availability.venueId),
			filter(availability => availability.date === bookingContext.value.date),
			// distinctUntilChanged((prev, curr) => prev.date === curr.date && prev.venueId === curr.venueId),
      debounceTime(500),
      takeUntil(this.disconnecting),
		).subscribe({
			next: () => {
        
				this.loadTimeSlots()
			},
		})

		// Subscribe to loading state
		availabilityLoading$.pipe(takeUntil(this.disconnecting)).subscribe(loading => {
			this.updateState({ loading })
		})
	}

	// State management helper
	private updateState(partialState: Partial<typeof this.state$.value>): void {
		this.state$.next({
			...this.state$.value,
			...partialState,
		})
		this.requestUpdate()
	}

	/**
	 * Load time slots based on the current booking flow
	 */
	private loadTimeSlots(): void {
		// Set initial loading state
		this.updateState({
			loading: true,
			error: null,
		})

		// Safety check to make sure booking object exists
		if (!this.booking) {
			console.warn('Booking object not available, using estimated times')
			this.generateDefaultTimeSlots()
			this.updateState({ loading: false })
			return
		}

		try {
			// Check current booking flow to determine how to get time slots
			let timeSlots

			// If we're using DATE_COURT_TIME_DURATION flow and have already selected a court,
			// get only time slots available for this specific court
			if (this.availability.bookingFlowType === BookingFlowType.DATE_COURT_TIME_DURATION && this.booking.courtId) {
				// Get time slots available for this specific court
				timeSlots = getAvailableTimeSlots(this.booking.courtId)
			} else {
				// Get all available time slots across all courts
				timeSlots = getAvailableTimeSlots()
			}

			if (timeSlots.length > 0) {
				this.updateState({
					timeSlots,
					showingEstimatedPrices: false,
					loading: false,
					error: this.availability.error,
				})

				this.announceForScreenReader(`${timeSlots.filter(s => s.available).length} time slots available`)
			} else {
				// No valid times available - use estimated times as fallback
				this.updateState({
					error: 'No valid time options available for this date. Please select a different date.',
					timeSlots: [],
					loading: false,
				})
				this.generateDefaultTimeSlots()
			}
		} catch (error) {
			console.error('Error getting available time slots:', error)
			this.updateState({
				error: 'Error determining available times. Using estimates instead.',
				timeSlots: [],
				loading: false,
			})
			this.generateDefaultTimeSlots()
		}

		// After data is loaded, try to scroll to appropriate position
		this.updateComplete.then(() => {
			if (this.state$.value.viewMode === 'list') {
				if (this.booking.startTime) {
					setTimeout(() => this.scrollToTime(this.booking.startTime), 150)
				} else if (!this.state$.value.autoScrollAttempted) {
					this.updateState({ autoScrollAttempted: true })
					setTimeout(() => this.scrollToFirstAvailableTime(), 150)
				}
			}

      setTimeout(() => {
			  this.checkSelectedTimeAvailability()
      }, 1000);
		})
	}

	private generateDefaultTimeSlots(): void {
		// Clear existing time slot refs before updating
		this.clearTimeSlotRefs()

		// Check if date is today
		const userTimezone = getUserTimezone()
		const selectedDate = dayjs(this.booking.date).tz(userTimezone)
		const now = dayjs().tz(userTimezone)
		const isToday = selectedDate.format('YYYY-MM-DD') === now.format('YYYY-MM-DD')

		// Start time (8:00 AM or current time rounded up to next 30 min if today)
		let startHour = 8
		let startMinute = 0

		if (isToday) {
			startHour = now.hour()
			startMinute = now.minute() < 30 ? 30 : 0

			// If we're past the 30-minute mark, move to the next hour
			if (startMinute === 0) {
				startHour += 1
			}

			// If we're past operating hours, show message
			if (startHour >= 22) {
				this.updateState({
					timeSlots: [],
					error: 'No more available slots today',
					loading: false,
				})
				return
			}
		}

		// Generate 30-minute slots until 10:00 PM
		const slots: TimeSlot[] = []
		const endHour = 22

		for (let hour = startHour; hour <= endHour; hour++) {
			// For first hour, start from startMinute (0 or 30)
			const minutesToInclude =
				hour === startHour ? ([startMinute, startMinute === 0 ? 30 : null].filter(Boolean) as number[]) : [0, 30]

			for (const minute of minutesToInclude) {
				// Skip if past end time
				if (hour === endHour && minute > 0) continue

				const value = hour * 60 + minute
				const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`

				slots.push({
					label: timeString,
					value,
					available: true, // Assume all slots are available
				})
			}
		}

		this.updateState({
			timeSlots: slots,
			loading: false,
			error: 'Using estimated availability - actual availability may vary',
		})

		this.announceForScreenReader(`${slots.length} estimated time slots loaded`)
	}

	/**
	 * Handle time selection based on flow type
	 */
	private handleTimeSelect(slot: TimeSlot): void {
		if (!slot.available) return

		try {
			// Check if this time is already selected (user clicked on a selected time)
			const isCurrentlySelected = this.isTimeSelected(slot)
			
			if (isCurrentlySelected) {
				// If the time is already selected, unselect it
				bookingContext.set({
					startTime: '',
					endTime: ''
				}, true)
				
				// Highlight the unselected time using our ref system
				const selectedEl = this.timeSlotRefs.get(slot.value)
				if (selectedEl) {
					selectedEl.animate(PULSE_ANIMATION.keyframes, PULSE_ANIMATION.options)
				}
				
			
				
				// Announce for screen reader
				this.announceForScreenReader('Time selection cleared')
				
				return // Exit the function early, no need to proceed with selection logic
			}
			
			// Convert selected time to UTC ISO string
			const hour = Math.floor(slot.value / 60)
			const minute = slot.value % 60
			const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`

			// Use the utility to convert to UTC
			const newStartTime = toUTC(this.booking.date, timeString)

			// Update booking context with time selection
			let newEndTime = undefined
			
			if (!!this.booking.endTime && !!this.booking.startTime) {
				try {
					const bookingStartDT = dayjs(this.booking.startTime)
					const bookingEndDT = dayjs(this.booking.endTime)
					
					if (bookingStartDT.isValid() && bookingEndDT.isValid()) {
						const oldDuration = bookingEndDT.diff(bookingStartDT, 'minute')
						const newEndDT = dayjs(newStartTime).add(oldDuration, 'minute')
						
						if (newEndDT.isValid()) {
							newEndTime = newEndDT.toISOString()
						} else {
							console.warn('Invalid end date calculated')
						}
					} else {
						console.warn('Invalid existing booking dates')
					}
				} catch (err) {
					console.error('Error calculating end time:', err)
				}
			}

			const bookingUpdate: Partial<Booking> = {
				startTime: newStartTime,
				endTime: newEndTime ?? '',
			}

			// We now preserve the court selection regardless of flow type to improve user experience
			// This lets the user change time without losing their court selection

			bookingContext.set(bookingUpdate, true)

			// Highlight the selected time using our ref system
			const selectedEl = this.timeSlotRefs.get(slot.value)
			if (selectedEl) {
				selectedEl.animate(PULSE_ANIMATION.keyframes, PULSE_ANIMATION.options)
			}

			// Advance to the next step using the transition utility
			// This handles both updating currentStep and expandedSteps
			transitionToNextStep('Time')

			// Dispatch event for parent components
			this.dispatchEvent(
				new CustomEvent('next', {
					bubbles: true,
					composed: true,
				}),
			)
		} catch (error) {
			console.error('Error handling time selection:', error)
			this.updateState({ error: 'Failed to select time. Please try again.' })
		}
	}

	private retryLoading(): void {
		this.loadTimeSlots()
	}

	// UPDATED: Refactored scrolling methods without using querySelector
	private scrollToFirstAvailableTime(): void {
		if (this.state$.value.viewMode !== 'list') return

		// Find the first available time slot
		const firstAvailable = this.state$.value.timeSlots.find(slot => slot.available)
		if (!firstAvailable) return

		this.scrollToTimeValue(firstAvailable.value, true)
	}

	private scrollToTime(timeString: string): void {
		if (this.state$.value.viewMode !== 'list') return

		// Check if the time has changed
		if (this.previousSelectedTime === timeString) {
			// Time hasn't changed, check if it's already in viewport
			try {
				const localTime = toUserTimezone(timeString)
				const timeValue = localTime.hour() * 60 + localTime.minute()
				const scrollContainer = this.scrollContainerRef.value
				const timeEl = this.timeSlotRefs.get(timeValue)
				
				if (scrollContainer && timeEl) {
					const containerRect = scrollContainer.getBoundingClientRect()
					const elementRect = timeEl.getBoundingClientRect()
					const isFullyVisible = elementRect.left >= containerRect.left && elementRect.right <= containerRect.right
					
					// If already visible, don't scroll
					if (isFullyVisible) return
				}
			} catch (error) {
				console.error('Error checking time visibility:', error)
			}
		}

		try {
			// Convert to user's local time
			const localTime = toUserTimezone(timeString)
			const timeValue = localTime.hour() * 60 + localTime.minute()

			// Update previous selected time
			this.previousSelectedTime = timeString

			// Scroll to the time value
			this.scrollToTimeValue(timeValue)
		} catch (error) {
			console.error('Error scrolling to time:', error)
		}
	}

	private scrollToTimeValue(timeValue: number, highlight = false): void {
		const scrollContainer = this.scrollContainerRef.value
		const timeEl = this.timeSlotRefs.get(timeValue)

		if (!scrollContainer || !timeEl) {
			console.warn('Cannot scroll to time value', timeValue, 'Container or element not found')
			return
		}

		// Check if element is already in view
		const containerRect = scrollContainer.getBoundingClientRect()
		const elementRect = timeEl.getBoundingClientRect()
		const isFullyVisible = elementRect.left >= containerRect.left && elementRect.right <= containerRect.right

		// If element is already visible and no highlight needed, do nothing
		if (isFullyVisible && !highlight) return

		if (!isFullyVisible) {
			// Calculate scroll position to center the element
			const containerWidth = scrollContainer.clientWidth
			const elementOffset = timeEl.offsetLeft
			const elementWidth = timeEl.offsetWidth
			const scrollPosition = elementOffset - containerWidth / 2 + elementWidth / 2

			// Smooth scroll to the calculated position
			scrollContainer.scrollTo({
				left: scrollPosition,
				behavior: 'smooth',
			})
		}

		// Highlight if requested
		if (highlight) {
			this.highlightTimeSlot(timeEl)
		}
	}

	private highlightTimeSlot(element: HTMLElement): void {
		element.animate(PULSE_ANIMATION.keyframes, PULSE_ANIMATION.options)
	}

	// Accessibility helpers
	private announceForScreenReader(message: string): void {
		const announcement = document.createElement('div')
		announcement.setAttribute('aria-live', 'assertive')
		announcement.setAttribute('class', 'sr-only')
		announcement.textContent = message

		document.body.appendChild(announcement)

		setTimeout(() => {
			document.body.removeChild(announcement)
		}, 1000)
	}

	// Utility methods
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

	private isTimeSelected(slot: TimeSlot): boolean {
		if (!this.booking || !this.booking.startTime) return false

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

	private renderEmptyState(): unknown {
		return html`
			<div class="text-center py-6 grid gap-4 justify-center">
				<schmancy-icon size="48px" class="text-surface-on-variant opacity-50">schedule</schmancy-icon>
				<schmancy-typography type="body" token="md" class="mt-2">
					No time slots available for this date.
				</schmancy-typography>
			</div>
		`
	}

	// UPDATED: Store refs to time slot elements
	private renderTimeSlot(slot: TimeSlot): unknown {
		const isSelected = this.isTimeSelected(slot)

		// Create a reference callback
		const timeSlotRef = (element: Element | undefined) => {
			if (element) {
				this.timeSlotRefs.set(slot.value, element as HTMLElement)
			}
		}

		return html`
			<selection-tile
				${ref(timeSlotRef)}
				?selected=${isSelected}
				?compact=${!this.isDesktopOrTablet}
				type="time"
				icon="schedule"
				label=${slot.label}
				dataValue=${slot.value?.toString()}
				@click=${() => this.handleTimeSelect(slot)}
				data-time-value=${slot.value}
				?disabled=${!slot.available}
			></selection-tile>
		`
	}

	private renderGridLayout(slots: TimeSlot[]): unknown {
		return html`
			<div
				class="grid grid-cols-5 sm:grid-cols-6 gap-3 py-2"
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
		`
	}

	/**
	 * Ensure we have a minimum number of time slots for consistent layout
	 * Add placeholders for small result sets
	 */
	private ensureMinimumSlots(slots: TimeSlot[]): (TimeSlot | { placeholder: true })[] {
		const minSlots = 5; // Minimum number of slots to display
		
		if (slots.length >= minSlots) {
			return slots;
		}
		
		// Add placeholder items to reach minimum count
		const displayItems = [...slots];
		const placeholdersNeeded = minSlots - slots.length;
		
		for (let i = 0; i < placeholdersNeeded; i++) {
			displayItems.push({ placeholder: true } as any);
		}
		
		return displayItems;
	}

	// UPDATED: Add ref to scroll container and ensure minimum slots
	private renderListLayout(slots: TimeSlot[]): unknown {
		const displayItems = this.ensureMinimumSlots(slots);
		
		return html`
			<div
				${ref(this.scrollContainerRef)}
				class="options-scroll-container grid grid-flow-col py-2 overflow-x-auto scrollbar-hide transition-all duration-300 first:pl-1 last:pr-1
          ${this.isCompact ? 'gap-2' : 'gap-3'}"
				role="listbox"
				aria-label="Available Time Slots"
				aria-multiselectable="false"
			>
				${repeat(
					displayItems,
					(item, index) => 'placeholder' in item ? `placeholder-${index}` : (item as TimeSlot).value,
					(item) => {
						if ('placeholder' in item) {
							// Create an empty placeholder tile with same dimensions but invisible
							return html`
								<div class="w-14 h-10 invisible"></div>
							`;
						}
						return this.renderTimeSlot(item as TimeSlot);
					}
				)}
			</div>
		`
	}

	render() {
		// Early exit if explicitly hidden
		if (this.hidden) return nothing;

		// Get current state values
		const { timeSlots, loading, error, viewMode } = this.state$.value;

		// Show empty state if no time slots
		if (!loading && timeSlots.length === 0) {
			return this.renderEmptyState();
		}

		// KEY CHANGE: Use isExpanded to determine if component should be visible
		return html`
			<div
				class="
					w-full bg-surface-low/50 rounded-lg transition-all duration-300 p-2
					${this.isExpanded ? 'block' : 'hidden'}
					${this.isActive ? 'opacity-100' : 'opacity-90'}
				"
			>
				<!-- Error message if present while still showing content -->
				${error
					? html`
							<div class="bg-error-container p-2 rounded-t-lg text-error-on-container text-sm text-center mb-3">
								${error}
								<button @click=${() => this.retryLoading()} class="ml-2 underline font-medium">Refresh</button>
							</div>
					  `
					: nothing}

				<!-- Title section with view toggle -->
				${when(
					!this.isCompact && timeSlots.length > 0,
					() => html`
						<div class="flex items-center justify-between">
							<div>
								<schmancy-typography align="left" type="label" token="lg" class="font-medium text-primary-default">
									Select Time
								</schmancy-typography>
								<div class="text-xs text-surface-on-variant mt-1">
									<span>Times shown in your local timezone (${this.userTimezone})</span>
								</div>
							</div>
						</div>
					`,
				)}

				<!-- Simplified view container with CSS-based transitions -->
				<div class="view-container">
					<!-- Grid View -->
					<div class="grid-view ${viewMode === 'grid' ? 'active' : ''}">${this.renderGridLayout(timeSlots)}</div>

					<!-- List View -->
					<div class="list-view ${viewMode === 'list' ? 'active' : ''}">${this.renderListLayout(timeSlots)}</div>
				</div>
			</div>
		`;
	}
}
