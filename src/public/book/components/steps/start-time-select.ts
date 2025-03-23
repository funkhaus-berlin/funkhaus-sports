import { select } from '@mhmo91/schmancy'
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
import { toUTC } from 'src/utils/timezone'
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
	@select(bookingContext, undefined, { required: true })
	booking!: Booking

	@select(BookingProgressContext, undefined, { required: true })
	bookingProgress!: BookingProgress

	// Add availability context
	@select(availabilityContext, undefined, { required: true })
	availability!: AvailabilityData

	// Core state streams
	private state$ = new BehaviorSubject<{
		timeSlots: TimeSlot[]
		loading: boolean
		error: string | null
		autoScrollAttempted: boolean
		viewMode: 'grid' | 'list'
	}>({
		timeSlots: [],
		loading: true,
		error: null,
		autoScrollAttempted: false,
		viewMode: 'grid',
	})

	// State properties derived from observables
	@state() isActive = false
	@state() private isCompact = false
	@state() isDesktopOrTablet = window.innerWidth >= 384
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
		// Screen size stream
		this.isDesktopOrTablet$ = fromEvent(window, 'resize').pipe(
			startWith(null),
			map(() => window.innerWidth >= 384),
			distinctUntilChanged(),
			shareReplay(1),
		)

		// Active state from properties and context
		this.isActive$ = BookingProgressContext.$.pipe(
			map(progress => progress.currentStep === BookingStep.Time),
			startWith(this.active),
			distinctUntilChanged(),
			shareReplay(1),
		)

		// Compact mode stream
		this.isCompact$ = BookingProgressContext.$.pipe(
			map(progress => progress.currentStep !== BookingStep.Time),
			distinctUntilChanged(),
			shareReplay(1),
		)

		// Calculate view mode based on screen size and active state
		combineLatest([this.isDesktopOrTablet$, this.isActive$])
			.pipe(
				map(([isDesktop, isActive]) => {
					// If not active, always use list view
					if (!isActive) return 'list'

					// If switching from inactive to active on desktop, use grid
					if (isActive && isDesktop) return 'grid'

					// If on mobile, always use list
					if (!isDesktop) return 'list'

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
		this.isActive$.pipe(takeUntil(this.disconnecting)).subscribe(isActive => {
			this.isActive = isActive
			this.requestUpdate()
		})

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
			distinctUntilChanged((prev, curr) => prev.date === curr.date && prev.venueId === curr.venueId),
			tap(() => {
				this.updateState({
					autoScrollAttempted: false,
					loading: true,
					error: null,
				})
			}),
			shareReplay(1),
		).subscribe()
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
			tap(console.log),
			takeUntil(this.disconnecting),
			filter(availability => !!availability && !!availability.date && !!availability.venueId),
			filter(availability => availability.date === bookingContext.value.date),
			distinctUntilChanged((prev, curr) => prev.date === curr.date && prev.venueId === curr.venueId),
		).subscribe({
			next: () => {
				this.loadTimeSlots()
			},
			complete: () => {
				// alert('Availability context completed')
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

	// Business logic methods - UPDATED to use availability context
	private loadTimeSlots(): void {
		try {
			// Clear existing time slot refs before updating
			this.clearTimeSlotRefs()

			// Get time slots from availability context
			const timeSlots = getAvailableTimeSlots()

			// Update state
			this.updateState({
				timeSlots,
				loading: false,
				error: this.availability.error,
			})

			// After data is loaded, try to scroll to appropriate position
			this.updateComplete.then(() => {
				if (this.state$.value.viewMode === 'list') {
					if (this.booking.startTime) {
						this.scrollToTime(this.booking.startTime)
					} else if (!this.state$.value.autoScrollAttempted) {
						this.updateState({ autoScrollAttempted: true })
						this.scrollToFirstAvailableTime()
					}
				}
			})

			this.announceForScreenReader(`${timeSlots.filter(s => s.available).length} available time slots loaded`)
		} catch (error) {
			console.error('Error loading time slots:', error)
			this.generateDefaultTimeSlots()
		}
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

		// After update, try to scroll to appropriate position
		this.updateComplete.then(() => {
			if (this.state$.value.viewMode === 'list') {
				if (this.booking.startTime) {
					this.scrollToTime(this.booking.startTime)
				} else if (!this.state$.value.autoScrollAttempted) {
					this.updateState({ autoScrollAttempted: true })
					this.scrollToFirstAvailableTime()
				}
			}
		})

		this.announceForScreenReader(`${slots.length} estimated time slots loaded`)
	}

	// UI interaction methods
	// private toggleView(mode: 'grid' | 'list'): void {
	// 	if (this.state$.value.viewMode !== mode && !this.isTransitioning) {
	// 		this.isTransitioning = true

	// 		// Update state with new view mode
	// 		this.updateState({ viewMode: mode })

	// 		// Reset transition state after a delay for the animation
	// 		this.isTransitioning = false

	// 		// If switching to list mode, try to scroll after animation completes
	// 		this.updateComplete.then(() => {
	// 			if (mode === 'list') {
	// 				if (this.booking.startTime) {
	// 					this.scrollToTime(this.booking.startTime)
	// 				} else if (!this.state$.value.autoScrollAttempted) {
	// 					this.scrollToFirstAvailableTime()
	// 				}
	// 			}
	// 		})
	// 	}
	// }

	// UPDATED: Refactored without using querySelector
	private handleTimeSelect(slot: TimeSlot): void {
		if (!slot.available) return

		try {
			// Convert selected time to UTC ISO string
			const hour = Math.floor(slot.value / 60)
			const minute = slot.value % 60
			const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`

			// Use the utility to convert to UTC
			const newStartTime = toUTC(this.booking.date, timeString)

			// Update booking context
			let newEndTime = undefined
			if (!!this.booking.endTime) {
				const oldDuration = dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minute')
				newEndTime = dayjs(newStartTime).add(oldDuration, 'minute').toISOString()
			}
			bookingContext.set(
				{
					startTime: newStartTime,
					courtId: '', // Clear court selection
					endTime: newEndTime ?? '',
				},
				true,
			)

			// Highlight the selected time using our ref system
			const selectedEl = this.timeSlotRefs.get(slot.value)
			if (selectedEl) {
				selectedEl.animate(PULSE_ANIMATION.keyframes, PULSE_ANIMATION.options)
			}

			// Go to duration selection step
			if (this.bookingProgress.currentStep === BookingStep.Time) {
				BookingProgressContext.set({
					currentStep: BookingStep.Duration,
				})
			}

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

		try {
			// Convert to user's local time
			const localTime = toUserTimezone(timeString)
			const timeValue = localTime.hour() * 60 + localTime.minute()

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

	// private renderViewToggle(): unknown {
	// 	if (!this.isDesktopOrTablet || !this.isActive) return nothing

	// 	return html`
	// 		<div class="flex items-center p-1 rounded-lg bg-surface-variant">
	// 			<schmancy-icon-button @click=${() => this.toggleView('grid')} size="sm">flex_wrap</schmancy-icon-button>

	// 			<schmancy-icon-button size="sm" @click=${() => this.toggleView('list')}>flex_no_wrap</schmancy-icon-button>
	// 		</div>
	// 	`
	// }

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
				?compact=${this.isCompact}
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

	// UPDATED: Add ref to scroll container
	private renderListLayout(slots: TimeSlot[]): unknown {
		return html`
			<div
				${ref(this.scrollContainerRef)}
				class="options-scroll-container grid grid-flow-col  py-2 overflow-x-auto scrollbar-hide transition-all duration-300 first:pl-1 last:pr-1
          ${this.isCompact ? 'gap-2' : 'gap-3'}"
				role="listbox"
				aria-label="Available Time Slots"
				aria-multiselectable="false"
			>
				<!-- <schmancy-surface class="sticky left-2 z-10" type="low">
					<schmancy-icon-button variant="filled tonal" class="my-auto  mr-2 z-10 "> schedule </schmancy-icon-button>
				</schmancy-surface> -->
				${repeat(
					slots,
					slot => slot.value,
					slot => this.renderTimeSlot(slot),
				)}
			</div>
		`
	}

	render() {
		if (this.hidden) return nothing

		// Get current state values
		const { timeSlots, loading, error, viewMode } = this.state$.value

		// Show empty state if no time slots
		if (!loading && timeSlots.length === 0) {
			return this.renderEmptyState()
		}

		return html`
			<div
				class="
          w-full bg-surface-low rounded-lg transition-all duration-300 p-2
          ${this.active ? 'scale-100' : !this.isCompact ? 'scale-95' : ''}
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
		`
	}
}
