import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
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
	switchMap,
	take,
	takeUntil,
	tap,
} from 'rxjs'
import { toUTC } from 'src/utils/timezone'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'
import { TimeSlot } from '../../types'
// Import the enhanced availability coordinator
import { enhancedAvailabilityCoordinator } from 'src/bookingServices/enhanced-availability-coordinator'

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
 * Simplified time selection component using RxJS for state management
 * and Tailwind CSS for styling
 */
@customElement('time-selection-step')
export class TimeSelectionStep extends $LitElement() {
	@property({ type: Boolean }) active = true
	@property({ type: Boolean }) hidden = false

	// Basic dependencies
	@select(bookingContext, undefined, { required: true })
	booking!: Booking

	@select(BookingProgressContext, undefined, { required: true })
	bookingProgress!: BookingProgress

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
	@state() private isActive = false
	@state() private isCompact = false
	@state() private isDesktopOrTablet = window.innerWidth >= 384
	@state() private shouldUseGridView = false
	@state() private availableCourtsCount = 0

	// Observables for reactive state management
	private isActive$!: Observable<boolean>
	private isCompact$!: Observable<boolean>
	private isDesktopOrTablet$!: Observable<boolean>
	private shouldUseGridView$!: Observable<boolean>
	private availableCourtsCount$!: Observable<number>

	// User preferences
	private userTimezone = getUserTimezone()
	private userLocale = navigator.language || 'en-US'
	private use24HourFormat = this._detectTimeFormatPreference()

	// Store references for cleanup
	private resizeObserver: ResizeObserver | null = null

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
		this.subscribeToAvailabilityCoordinator()
	}

	disconnectedCallback(): void {
		super.disconnectedCallback()

		// Clean up observers
		if (this.resizeObserver) {
			this.resizeObserver.disconnect()
			this.resizeObserver = null
		}
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
					const currentMode = this.state$.value.viewMode
					// If not active, always use list view
					if (!isActive) return 'list'
					// If switching from inactive to active on desktop, use grid
					if (isActive && isDesktop && currentMode === 'list') return 'grid'
					// If switching to mobile, always use list
					if (!isDesktop) return 'list'
					// Otherwise keep current mode
					return currentMode
				}),
				distinctUntilChanged(),
				takeUntil(this.disconnecting),
			)
			.subscribe(viewMode => {
				this.updateState({ viewMode })

				// If switching to list mode, try to scroll after a brief delay
				if (viewMode === 'list') {
					setTimeout(() => {
						if (this.booking.startTime) {
							this.scrollToTime(this.booking.startTime)
						} else if (!this.state$.value.autoScrollAttempted) {
							this.scrollToFirstAvailableTime()
						}
					}, 150)
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

		// Available courts count - derived from time slots
		this.availableCourtsCount$ = this.state$.pipe(
			map(state => state.timeSlots),
			filter(slots => slots.length > 0),
			map(slots => slots.filter(slot => slot.available).length),
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

		this.availableCourtsCount$.pipe(takeUntil(this.disconnecting)).subscribe(count => {
			this.availableCourtsCount = count
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
			startWith(bookingContext.value),
			takeUntil(this.disconnecting),
			filter(booking => !!booking.date && !!booking.venueId),
			distinctUntilChanged((prev, curr) => prev.date === curr.date && prev.venueId === curr.venueId),
			tap(() => {
				this.updateState({
					timeSlots: [],
					autoScrollAttempted: false,
					loading: true,
					error: null,
				})

				// Force refresh of availability data
				enhancedAvailabilityCoordinator.refreshData()
			}),
			switchMap(() =>
				enhancedAvailabilityCoordinator.availabilityData$.pipe(
					filter(data => !!data),
					takeUntil(this.disconnecting),
				),
			),
		).subscribe(data => {
			if (data) {
				this.loadTimeSlots()
			}
		})
	}

	private subscribeToProgressContext(): void {
		BookingProgressContext.$.pipe(takeUntil(this.disconnecting)).subscribe(progress => {
			if (progress.currentStep === BookingStep.Time) {
				this.updateState({ autoScrollAttempted: false })

				// Try to scroll to first available after DOM update
				setTimeout(() => {
					if (this.state$.value.viewMode === 'list') {
						this.scrollToFirstAvailableTime()
					}
				}, 100)
			}
		})
	}

	private subscribeToAvailabilityCoordinator(): void {
		// Subscribe to loading state
		enhancedAvailabilityCoordinator.loading$.pipe(takeUntil(this.disconnecting)).subscribe(loading => {
			this.updateState({ loading })
		})

		// Subscribe to error state
		enhancedAvailabilityCoordinator.error$
			.pipe(
				takeUntil(this.disconnecting),
				filter(error => !!error),
			)
			.subscribe(error => {
				this.updateState({ error })
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

	// Business logic methods
	private loadTimeSlots(): void {
		try {
			// Normalize the date format
			let formattedDate = this.booking.date
			if (formattedDate.includes('T')) {
				formattedDate = formattedDate.split('T')[0]
			}

			// Get all time slots where ANY court is available
			const timeSlotStatus = enhancedAvailabilityCoordinator.getAllAvailableTimeSlots(formattedDate)

			// Convert to TimeSlot format for UI
			const timeSlots: TimeSlot[] = timeSlotStatus.map(slot => ({
				label: slot.time,
				value: slot.timeValue,
				available: slot.hasAvailableCourts,
			}))

			// Update state
			this.updateState({
				timeSlots,
				loading: false,
				error: null,
			})

			// After data is loaded, scroll to appropriate position
			this.updateComplete.then(() => {
				if (this.state$.value.viewMode === 'list') {
					if (this.booking.startTime) {
						setTimeout(() => this.scrollToTime(this.booking.startTime), 150)
					} else if (!this.state$.value.autoScrollAttempted) {
						this.updateState({ autoScrollAttempted: true })
						setTimeout(() => this.scrollToFirstAvailableTime(), 150)
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
				hour === startHour ? [startMinute, startMinute === 0 ? 30 : null].filter(Boolean) : [0, 30]

			for (const minute of minutesToInclude) {
				// Skip if past end time
				if (hour === endHour && (minute || 0) > 0) continue

				const value = hour * 60 + (minute || 0)
				const timeString = `${hour.toString().padStart(2, '0')}:${(minute || 0).toString().padStart(2, '0')}`

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

		// Try to scroll to appropriate position
		this.updateComplete.then(() => {
			if (this.state$.value.viewMode === 'list') {
				if (this.booking.startTime) {
					setTimeout(() => this.scrollToTime(this.booking.startTime), 150)
				} else if (!this.state$.value.autoScrollAttempted) {
					this.updateState({ autoScrollAttempted: true })
					setTimeout(() => this.scrollToFirstAvailableTime(), 150)
				}
			}
		})

		this.announceForScreenReader(`${slots.length} estimated time slots loaded`)
	}

	// UI interaction methods
	private toggleView(mode: 'grid' | 'list'): void {
		if (this.state$.value.viewMode !== mode) {
			this.updateState({ viewMode: mode })

			// If switching to list mode, enable scrolling behavior
			if (mode === 'list') {
				setTimeout(() => {
					if (this.booking.startTime) {
						this.scrollToTime(this.booking.startTime)
					} else if (!this.state$.value.autoScrollAttempted) {
						this.scrollToFirstAvailableTime()
					}
				}, 150)
			}
		}
	}

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
			bookingContext.set(
				{
					startTime: newStartTime,
					courtId: '', // Clear court selection
					endTime: '', // Clear end time
				},
				true,
			)

			// Always switch to list view after selection
			this.updateState({ viewMode: 'list' })

			// Ensure selected time is properly centered
			setTimeout(() => this.scrollToSelectedTime(), 150)

			// Go to duration selection step
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
			this.updateState({ error: 'Failed to select time. Please try again.' })
		}
	}

	private retryLoading(): void {
		enhancedAvailabilityCoordinator.refreshData()
	}

	// Scrolling helper methods
	private scrollToSelectedTime(): void {
		if (!this.booking?.startTime || this.state$.value.viewMode !== 'list') return

		try {
			// Convert stored UTC time to user's timezone
			const localTime = toUserTimezone(this.booking.startTime)
			const timeValue = localTime.hour() * 60 + localTime.minute()

			// Find and scroll to the element
			this.scrollToTimeValue(timeValue)
		} catch (error) {
			console.error('Error scrolling to selected time:', error)
		}
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

	private scrollToFirstAvailableTime(): void {
		if (this.state$.value.viewMode !== 'list') return

		// Find the first available time slot
		const firstAvailable = this.state$.value.timeSlots.find(slot => slot.available)
		if (!firstAvailable) return

		this.scrollToTimeValue(firstAvailable.value, true)
	}

	private scrollToTimeValue(timeValue: number, highlight = false): void {
		const scrollContainer = this.shadowRoot?.querySelector('.options-scroll-container') as HTMLElement
		if (!scrollContainer) return

		const timeEl = this.shadowRoot?.querySelector(`[data-time-value="${timeValue}"]`) as HTMLElement
		if (!timeEl) return

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
		element.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }], {
			duration: 800,
			easing: 'ease-in-out',
		})
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

	private formatTime(hour: number, minute: number): string {
		try {
			const userTimezone = getUserTimezone()
			const date = dayjs().tz(userTimezone).hour(hour).minute(minute).second(0).millisecond(0)

			return this.use24HourFormat ? date.format('HH:mm') : date.format('h:mm A')
		} catch (error) {
			// Fallback formatting
			const hourDisplay = this.use24HourFormat ? hour : hour % 12 || 12
			const minuteDisplay = minute === 0 ? '00' : minute < 10 ? `0${minute}` : minute
			const suffix = this.use24HourFormat ? '' : hour >= 12 ? ' PM' : ' AM'
			return `${hourDisplay}:${minuteDisplay}${suffix}`
		}
	}

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

	// UI Rendering Methods
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

	private renderErrorState(): unknown {
		return html`
			<div class="p-6 bg-error-container rounded-lg text-center">
				<schmancy-icon size="32px" class="text-error-default mb-2">error_outline</schmancy-icon>
				<p class="text-error-on-container mb-2">${this.state$.value.error}</p>
				<button @click=${() => this.retryLoading()} class="px-4 py-2 bg-error-default text-error-on rounded-md mt-2">
					Try Again
				</button>
			</div>
		`
	}

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

	private renderViewToggle(): unknown {
		if (!this.isDesktopOrTablet || !this.isActive) return nothing

		const viewMode = this.state$.value.viewMode

		return html`
			<div class="flex items-center p-1 rounded-lg bg-surface-variant">
				<button
					class="px-2 py-1 rounded-md flex items-center justify-center transition-all duration-200 
            ${viewMode === 'grid' ? 'bg-primary-container text-primary-default' : ''}"
					@click=${() => this.toggleView('grid')}
					aria-label="Grid view"
					title="Grid view"
				>
					<schmancy-icon size="18px">grid_view</schmancy-icon>
				</button>
				<button
					class="px-2 py-1 rounded-md flex items-center justify-center transition-all duration-200
            ${viewMode === 'list' ? 'bg-primary-container text-primary-default' : ''}"
					@click=${() => this.toggleView('list')}
					aria-label="List view"
					title="List view"
				>
					<schmancy-icon size="18px">view_list</schmancy-icon>
				</button>
			</div>
		`
	}

	private renderTimeSlot(slot: TimeSlot): unknown {
		const isSelected = this.isTimeSelected(slot)

		return html`
			<selection-tile
				?selected=${isSelected}
				?compact=${this.isCompact}
				type="time"
				icon="schedule"
				label=${slot.label}
				dataValue=${slot.value}
				@click=${() => this.handleTimeSelect(slot)}
				data-time-value=${slot.value}
			></selection-tile>
		`
	}

	private renderGridLayout(slots: TimeSlot[]): unknown {
		return html`
			<div
				class="grid grid-cols-5 md:grid-cols-5  gap-2 py-4"
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

	private renderListLayout(slots: TimeSlot[]): unknown {
		return html`
			<div
				class="options-scroll-container flex py-2 overflow-x-auto scrollbar-hide transition-all duration-300 
          ${this.isCompact$ ? 'gap-2' : 'gap-3'}"
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

	render() {
		if (this.hidden) return nothing

		// Get current state values
		const { timeSlots, loading, error, viewMode } = this.state$.value

		// Show loading state if loading and no data yet
		if (loading && timeSlots.length === 0) {
			return this.renderLoadingState()
		}

		// Show empty state if no time slots
		if (timeSlots.length === 0) {
			return this.renderEmptyState()
		}

		return html`
			<div
				class="
        w-full bg-surface-low rounded-lg transition-all duration-300 mt-3 px-2
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

				<!-- Loading indicator overlay if loading but showing existing data -->
				${loading && timeSlots.length > 0
					? html`
							<div class="bg-surface-low bg-opacity-80 p-1 text-center text-xs flex justify-center items-center gap-2">
								<div
									class="inline-block w-4 h-4 border-2 border-t-primary-default border-r-outlineVariant border-b-outlineVariant border-l-outlineVariant rounded-full animate-spin"
								></div>
								<span>Updating...</span>
							</div>
					  `
					: nothing}

				<!-- Title section with view toggle -->
				${when(
					!this.isCompact,
					() => html`
						<div class="flex items-center justify-between">
							<div>
								<schmancy-typography type="label" token="lg" class="font-medium text-primary-default">
									Select Time
								</schmancy-typography>
								<div class="text-xs text-surface-on-variant mt-1">
									<span>Times shown in your local timezone (${this.userTimezone})</span>
								</div>
							</div>
							${this.renderViewToggle()}
						</div>

						${this.availableCourtsCount > 0
							? html`
									<div class="text-xs text-success-default mt-1">
										${this.availableCourtsCount} ${this.availableCourtsCount === 1 ? 'court' : 'courts'} available
									</div>
							  `
							: nothing}
					`,
				)}

				<!-- Time slots container - switching between grid and list -->
				${this.shouldUseGridView ? this.renderGridLayout(timeSlots) : this.renderListLayout(timeSlots)}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'time-selection-step': TimeSelectionStep
	}
}
