import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
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
import { courtsContext } from 'src/admin/venues/courts/context'
import {
  availabilityContext,
  availabilityLoading$,
  BookingFlowType,
  getAvailableDurations,
} from 'src/availability-context'
import { Court } from 'src/db/courts.collection'
import { toUserTimezone } from 'src/utils/timezone'
import { transitionToNextStep } from '../../booking-steps-utils'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'
import { Duration } from '../../types'

// Simple animation preset for selected duration
const PULSE_ANIMATION = {
	keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }],
	options: {
		duration: 400,
		easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
	},
}

/**
 * Duration selection component that matches the time selection component design
 * Grid view by default on desktop, switching to list view on selection or small screens
 * Uses the availability context to show durations for all courts
 */
@customElement('duration-selection-step')
export class DurationSelectionStep extends $LitElement(css`
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
		min-height: 85px; /* Minimum height to prevent collapse during transitions */
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
	@select(bookingContext, b => JSON.parse(JSON.stringify(b)), {
		required: true,
	})
	booking!: Booking
	@select(courtsContext, undefined, {
		required: true,
	})
	courts!: Map<string, Court>
	@select(BookingProgressContext, undefined, {
		required: true,
	})
	bookingProgress!: BookingProgress

	// Add availability context
	@select(availabilityContext, undefined, { required: true })
	availability!: any

	// Core state streams
	private state$ = new BehaviorSubject<{
		durations: Duration[]
		loading: boolean
		error: string | null
		autoScrollAttempted: boolean
		viewMode: 'grid' | 'list'
		showingEstimatedPrices: boolean
	}>({
		durations: [],
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
	@state() isDesktopOrTablet = window.innerWidth >= 384
	@state() shouldUseGridView = false
	@state() isTransitioning = false

	// Observables for reactive state management
	private isActive$!: Observable<boolean>
	private isCompact$!: Observable<boolean>
	private isDesktopOrTablet$!: Observable<boolean>
	private shouldUseGridView$!: Observable<boolean>

	// Store references for cleanup
	private resizeObserver: ResizeObserver | null = null

	// Refs for DOM elements
	private scrollContainerRef: Ref<HTMLElement> = createRef<HTMLElement>()
	private durationRefs = new Map<number, HTMLElement>()

	// Last successful data for fallback
	private lastSuccessfulData: { durations: Duration[] } | null = null

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
		this.clearDurationRefs()
	}

	// Clear duration references when no longer needed
	private clearDurationRefs(): void {
		this.durationRefs.clear()
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

		// Active state from BookingProgressContext
		this.isActive$ = BookingProgressContext.$.pipe(
			map(progress => {
				// Find the position of Duration step in the steps array
				const durationStepIndex = progress.steps.findIndex(s => s.step === BookingStep.Duration)
				// Check if this position matches the current step
				return progress.currentStep === (durationStepIndex + 1)
			}),
			startWith(this.active),
			distinctUntilChanged(),
			filter(() => !this.isTransitioning),
			shareReplay(1),
		)

		// Add new expanded state stream
		const isExpanded$ = BookingProgressContext.$.pipe(
			map(progress => progress.expandedSteps.includes(BookingStep.Duration)),
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
			map(progress => progress.currentStep !== BookingStep.Duration),
			distinctUntilChanged(),
			shareReplay(1),
		)

		// Calculate view mode based on screen size, active state, and selection
		combineLatest([this.isDesktopOrTablet$, this.isActive$, bookingContext.$.pipe(map(booking => !!booking?.endTime))])
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
						// If booking end time is set, scroll to it
						if (this.booking.endTime) {
							this.scrollToSelectedDuration()
						}
						// If no end time and auto-scroll not attempted, scroll to first available duration
						else if (!this.state$.value.autoScrollAttempted) {
							this.updateState({ autoScrollAttempted: true })
							this.scrollToFirstDuration()
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

	// State management helper
	private updateState(partialState: Partial<typeof this.state$.value>): void {
		this.state$.next({
			...this.state$.value,
			...partialState,
		})
		this.requestUpdate()
	}

	// External subscriptions
	private subscribeToBookingContext(): void {
		bookingContext.$.pipe(
			startWith(bookingContext.value),
			takeUntil(this.disconnecting),
			filter(booking => {
				// Ensure booking exists and has required properties
				if (!booking) return false
				return !!booking.date && !!booking.startTime
			}),
			map(booking => ({
				date: booking.date,
				startTime: booking.startTime,
				endTime: booking.endTime,
				courtId: booking.courtId, // Add courtId to track court changes
			})),
			// Important: reload when time selection or court changes
			// Using distinctUntilChanged to avoid unnecessary reloads
			distinctUntilChanged((prev, curr) => 
				prev.startTime === curr.startTime && 
				prev.courtId === curr.courtId
			),
			tap((bookingData) => {
				// Clear selected duration if time or court changed and we need to reload durations
				if (bookingData.endTime) {
					// Get the currently selected duration value
					const currentDuration = this.getCurrentDuration()
					if (currentDuration > 0) {
						// Check if this duration would be available with the new selections
						const selectedDuration = currentDuration
						
						// We'll unselect the duration in loadDurations() after checking availability
						// For now, just mark that we're loading new data
						this.updateState({
							loading: true,
							autoScrollAttempted: false,
							durations: [],
						})
					}
				} else {
					// No duration selected, just load new durations
					this.updateState({
						loading: true,
						autoScrollAttempted: false,
						durations: [],
					})
				}

				// Clear existing duration refs before updating
				this.clearDurationRefs()

				// Load durations immediately to be more responsive
				this.loadDurations()
			}),
		).subscribe({
			error: err => {
				console.error('Error in booking subscription:', err)
				this.updateState({
					error: 'Failed to load duration options',
					loading: false,
				})

				// Fallback to estimated prices on error
				this.setEstimatedPrices()
			},
		})
	}

	private subscribeToProgressContext(): void {
		BookingProgressContext.$.pipe(takeUntil(this.disconnecting)).subscribe(progress => {
			// Reset auto-scroll flag when this step becomes active
			if (progress.currentStep === BookingStep.Duration) {
				this.updateState({ autoScrollAttempted: false })

				// Try to scroll to selected duration after DOM update
				this.updateComplete.then(() => {
					if (this.state$.value.viewMode === 'list') {
						if (this.booking.endTime) {
							this.scrollToSelectedDuration()
						} else if (!this.state$.value.autoScrollAttempted) {
							this.updateState({ autoScrollAttempted: true })
							this.scrollToFirstDuration()
						}
					}
				})
			}
		})
	}

	private subscribeToAvailabilityContext(): void {
		// Subscribe to availability context updates
		availabilityContext.$.pipe(
			takeUntil(this.disconnecting),
			filter(
				availability => availability.date === bookingContext.value.date && !!this.booking.startTime, // Only process when we have a start time
			),
		).subscribe(() => {
			this.loadDurations()
		})

		// Subscribe to loading state
		availabilityLoading$.pipe(takeUntil(this.disconnecting)).subscribe(loading => {
			this.updateState({ loading })
		})
	}

	/**
	 * Calculate current duration from booking
	 */
	private getCurrentDuration(): number {
		// Ensure booking and required fields exist
		if (!this.booking) return 0

		if (this.booking?.startTime && this.booking?.endTime) {
			const start = dayjs(this.booking.startTime)
			const end = dayjs(this.booking.endTime)
			const duration = end.diff(start, 'minute')

			if (duration > 0) {
				return duration
			}
		}

		return 0
	}

	/**
	 * Load durations using the availability context, adapted for different flows
	 * Shows all standard durations and marks those exceeding closing time as disabled
	 */
	private loadDurations(): void {
		// Set initial loading state
		this.updateState({
			loading: true,
			error: null,
		})

		// Safety check to make sure booking object exists
		if (!this.booking) {
			console.warn('Booking object not available, using estimated prices')
			this.setEstimatedPrices()
			this.updateState({ loading: false })
			return
		}

		// Only proceed if we have start time
		if (this.booking?.startTime) {
			try {
				// Get durations based on current flow
				let durations;

				// If we're using DATE_COURT_TIME_DURATION flow and have already selected a court,
				// get durations for this specific court
				if (this.availability.bookingFlowType === BookingFlowType.DATE_COURT_TIME_DURATION && this.booking.courtId) {
					// Get durations for this specific court
					durations = getAvailableDurations(this.booking.startTime, this.booking.courtId)
				} else {
					// Get durations across all courts
					durations = getAvailableDurations(this.booking.startTime)
				}

				// We no longer check if durations.length > 0 since we'll show all standard durations
				// and just disable those that exceed closing time
				this.updateState({
					durations: durations,
					showingEstimatedPrices: false,
					loading: false,
					error: this.availability.error,
				})

				this.lastSuccessfulData = { durations: durations }
				this.announceForScreenReader(`${durations.length} duration options available`)

				// If we didn't get any durations from the system, fall back to estimated prices
				if (durations.length === 0) {
					console.warn('No durations returned from system, using estimated prices instead')
					this.setEstimatedPrices()
				}

				// Check if current duration is still available after changes
				if (this.booking.endTime) {
					const currentDuration = this.getCurrentDuration()
					if (currentDuration > 0) {
						// Check if this duration exists in the available durations
						const durationIsAvailable = durations.some(d => d.value === currentDuration)
						const durationExceedsClosingTime = this.wouldExceedClosingTime({ value: currentDuration } as Duration)
						
						// If the duration is not available anymore, clear it
						if (!durationIsAvailable || durationExceedsClosingTime) {
							// Unselect the duration by updating the booking without an endTime
							bookingContext.set({
								endTime: '',  // Clear the end time
								price: 0      // Reset the price
							}, true)
							
							console.log(`Unselected duration ${currentDuration} as it's no longer available`)
							this.announceForScreenReader(`Duration unselected as it's no longer available`)
						}
					}
				}
			} catch (error) {
				console.error('Error getting available durations:', error)
				this.updateState({
					error: 'Error determining available durations. Using estimates instead.',
					durations: [],
					loading: false,
				})
				this.setEstimatedPrices()
			}
		} else {
			// Missing start time
			console.warn('Missing start time, using estimated prices')
			this.setEstimatedPrices()
			this.updateState({ loading: false })
		}

		// After data is loaded, try to scroll to the appropriate position
		this.updateComplete.then(() => {
			if (this.state$.value.viewMode === 'list') {
				if (this.booking.endTime) {
					setTimeout(() => this.scrollToSelectedDuration(), 150)
				} else if (!this.state$.value.autoScrollAttempted) {
					this.updateState({ autoScrollAttempted: true })
					setTimeout(() => this.scrollToFirstDuration(), 150)
				}
			}
		})
	}

	/**
	 * Set estimated prices without filtering
	 */
	private setEstimatedPrices(): void {
		// Get a baseline hourly rate
		let baseHourlyRate = 30 // Default hourly rate in EUR

		// Try to get average rate from available courts if courts are ready
		if (courtsContext.ready && this.courts && this.courts.size > 0) {
			const totalRate = Array.from(this.courts.values())
				.filter(court => court.status === 'active')
				.reduce((sum, court) => sum + (court.pricing?.baseHourlyRate || 30), 0)

			const activeCourtsCount = Array.from(this.courts.values()).filter(court => court.status === 'active').length

			if (activeCourtsCount > 0) {
				baseHourlyRate = Math.round(totalRate / activeCourtsCount)
			}
		}

		// Create estimated durations based on the baseline rate - show all standard durations
		const estimatedDurations = [
			{ label: '30m', value: 30, price: Math.round(baseHourlyRate / 2) },
			{ label: '1h', value: 60, price: baseHourlyRate },
			{ label: '1.5h', value: 90, price: Math.round(baseHourlyRate * 1.5) },
			{ label: '2h', value: 120, price: baseHourlyRate * 2 },
			{ label: '2.5h', value: 150, price: Math.round(baseHourlyRate * 2.5) },
			{ label: '3h', value: 180, price: baseHourlyRate * 3 },
			{ label: '3.5h', value: 210, price: Math.round(baseHourlyRate * 3.5) },
			{ label: '4h', value: 240, price: baseHourlyRate * 4 },
			{ label: '4.5h', value: 270, price: Math.round(baseHourlyRate * 4.5) },
			{ label: '5h', value: 300, price: baseHourlyRate * 5 },
		]

		// Don't filter them out - we'll just mark ones that exceed closing time as disabled in the UI
		this.updateState({
			durations: estimatedDurations,
			showingEstimatedPrices: true,
			loading: false,
		})

		this.lastSuccessfulData = { durations: estimatedDurations }
		this.announceForScreenReader('Showing estimated duration options')
	}

	/**
	 * Handle duration selection based on flow type
	 */
	private handleDurationSelect(duration: Duration): void {
		try {
			// Update booking context with duration info
			if (this.booking && this.booking.startTime) {
				// Convert from UTC to local, add duration, then back to UTC
				const localStartTime = toUserTimezone(this.booking.startTime)
				const localEndTime = localStartTime.add(duration.value, 'minute')

				// Convert back to UTC for storage
				const endTime = localEndTime.utc().toISOString()

				// Create booking update object
				const bookingUpdate: Partial<Booking> = {
					endTime,
					price: duration.price,
				}

				// We now preserve the court selection regardless of flow type to improve user experience
				// This lets the user change duration without losing their court selection

				bookingContext.set(bookingUpdate, true)
			}

			// Always switch to list view after selection
			this.updateState({ viewMode: 'list' })

			// Highlight the selected duration using our ref system
			const selectedEl = this.durationRefs.get(duration.value)
			if (selectedEl) {
				selectedEl.animate(PULSE_ANIMATION.keyframes, PULSE_ANIMATION.options)
			}

			// Ensure the selected duration is properly centered after selection
			setTimeout(() => this.scrollToSelectedDuration(), 150)

			// Advance to next step in the flow using the transition utility
			// This handles both updating currentStep and expandedSteps
			transitionToNextStep('Duration')

			// Announce to screen readers
			this.announceForScreenReader(`Selected ${this.getFullLabel(duration)} for €${duration.price.toFixed(2)}`)
		} catch (error) {
			console.error('Error handling duration selection:', error)
			this.updateState({ error: 'Failed to select duration. Please try again.' })
		}
	}

	/**
	 * Get full labels for durations
	 */
	private getFullLabel(duration: Duration): string {
		const map: Record<number, string> = {
			30: '30 minutes',
			60: '1 hour',
			90: '1.5 hours',
			120: '2 hours',
			150: '2.5 hours',
			180: '3 hours',
			210: '3.5 hours',
			240: '4 hours',
			270: '4.5 hours',
			300: '5 hours',
		}

		return map[duration.value] || `${duration.value} minutes`
	}

	/**
	 * Scroll to selected duration with improved ref-based positioning
	 */
	private scrollToSelectedDuration(): void {
		const currentDuration = this.getCurrentDuration()
		if (!currentDuration || this.state$.value.viewMode !== 'list') return

		try {
			const scrollContainer = this.scrollContainerRef.value
			const durationEl = this.durationRefs.get(currentDuration)

			if (!scrollContainer || !durationEl) return

			// Check if element is already in view
			const containerRect = scrollContainer.getBoundingClientRect()
			const elementRect = durationEl.getBoundingClientRect()

			// Calculate if element is fully visible
			const isFullyVisible = elementRect.left >= containerRect.left && elementRect.right <= containerRect.right

			// If the element is already fully visible, don't scroll
			if (isFullyVisible) return

			// Calculate the center position
			const containerWidth = scrollContainer.clientWidth
			const elementOffset = durationEl.offsetLeft
			const elementWidth = durationEl.offsetWidth

			// Calculate scroll position to center the element
			const scrollPosition = elementOffset - containerWidth / 2 + elementWidth / 2

			// Smooth scroll to the calculated position
			scrollContainer.scrollTo({
				left: scrollPosition,
				behavior: 'smooth',
			})
		} catch (error) {
			console.error('Error scrolling to selected duration:', error)
		}
	}

	/**
	 * Scroll to first duration option using refs
	 */
	private scrollToFirstDuration(): void {
		if (this.state$.value.durations.length === 0 || this.state$.value.viewMode !== 'list') return

		try {
			const scrollContainer = this.scrollContainerRef.value
			const firstDuration = this.state$.value.durations[0]
			if (!firstDuration) return

			const durationEl = this.durationRefs.get(firstDuration.value)

			if (!scrollContainer || !durationEl) return

			// Check if element is already in view
			const containerRect = scrollContainer.getBoundingClientRect()
			const elementRect = durationEl.getBoundingClientRect()

			// Element is fully visible if its left and right edges are within the container's viewport
			const isFullyVisible = elementRect.left >= containerRect.left && elementRect.right <= containerRect.right

			// If the element is already fully visible, just highlight it
			if (isFullyVisible) {
				this.highlightDurationOption(durationEl)
				return
			}

			// Calculate the center position
			const containerWidth = scrollContainer.clientWidth
			const elementOffset = durationEl.offsetLeft
			const elementWidth = durationEl.offsetWidth

			// Calculate scroll position to center the element
			const scrollPosition = elementOffset - containerWidth / 2 + elementWidth / 2

			// Smooth scroll to the calculated position
			scrollContainer.scrollTo({
				left: scrollPosition,
				behavior: 'smooth',
			})

			// Highlight the element
			this.highlightDurationOption(durationEl)
		} catch (error) {
			console.error('Error scrolling to first duration:', error)
		}
	}

	/**
	 * Highlight a duration option with a subtle animation
	 */
	private highlightDurationOption(element: HTMLElement): void {
		element.animate(PULSE_ANIMATION.keyframes, PULSE_ANIMATION.options)
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
	 * Retry loading duration data
	 */
	private retryLoading(): void {
		// Force reload durations
		this.loadDurations()
	}

	/**
	 * Render empty state (no durations)
	 */
	private renderEmptyState(): unknown {
		return html`
			<div class="text-center py-6 grid gap-4 justify-center">
				<schmancy-icon size="48px" class="text-surface-on-variant opacity-50">timer_off</schmancy-icon>
				<schmancy-typography type="body" token="md" class="mt-2">
					No duration options available for this time.
				</schmancy-typography>
			</div>
		`
	}

	/**
	 * Ensure we have a minimum number of durations for consistent layout
	 * Add placeholders for small result sets
	 */
	private ensureMinimumDurations(durations: Duration[]): (Duration | { placeholder: true })[] {
		const minDurations = 4; // Minimum number of durations to display
		
		if (durations.length >= minDurations) {
			return durations;
		}
		
		// Add placeholder items to reach minimum count
		const displayItems = [...durations];
		const placeholdersNeeded = minDurations - durations.length;
		
		for (let i = 0; i < placeholdersNeeded; i++) {
			displayItems.push({ placeholder: true } as any);
		}
		
		return displayItems;
	}

	/**
	 * Render grid layout for durations
	 */
	private renderGridLayout(durations: Duration[]): unknown {
		const displayItems = this.ensureMinimumDurations(durations);
		
		return html`
			<div
				class="grid grid-cols-4 md:grid-cols-5 gap-3 py-4"
				role="listbox"
				aria-label="Available Duration Options"
				aria-multiselectable="false"
			>
				${repeat(
					displayItems,
					(item, index) => 'placeholder' in item ? `placeholder-${index}` : (item as Duration).value,
					(item) => {
						if ('placeholder' in item) {
							return html`<div class="invisible"></div>`;
						}
						return this.renderDurationOption(item as Duration);
					}
				)}
			</div>
		`
	}

	/**
	 * Check if a duration would exceed venue closing time
	 */
	private wouldExceedClosingTime(duration: Duration): boolean {
		if (!this.booking?.startTime || !this.booking?.date) return false

		try {
			const startTime = dayjs(this.booking.startTime)
			const endTime = startTime.add(duration.value, 'minute')
			let closingTime: dayjs.Dayjs | null = null
			
			// Get the closing time from venue's operating hours if available
			if (this.availability?.venue?.operatingHours) {
				const dayOfWeek = dayjs(this.booking.date).format('dddd').toLowerCase() as keyof typeof this.availability.venue.operatingHours
				const operatingHours = this.availability.venue.operatingHours[dayOfWeek]
				
				if (operatingHours && operatingHours.close) {
					// Parse closing time (format is typically "HH:MM" like "22:00")
					const [hours, minutes] = operatingHours.close.split(':').map(Number)
					closingTime = dayjs(this.booking.date).hour(hours).minute(minutes || 0)
				}
			}
			
			// Fallback to 10 PM if no venue closing time is available
			if (!closingTime) {
				closingTime = dayjs(this.booking.date).hour(22).minute(0)
			}

			// Check if end time exceeds closing time
			return endTime.isAfter(closingTime)
		} catch (error) {
			console.error('Error checking closing time:', error)
			return false
		}
	}

	/**
	 * Render a duration option with ref tracking
	 */
	private renderDurationOption(duration: Duration) {
		const currentDuration = this.getCurrentDuration()
		const isSelected = currentDuration === duration.value
		const exceedsClosingTime = this.wouldExceedClosingTime(duration)

		// Create a reference callback
		const durationRef = (element: Element | undefined) => {
			if (element) {
				this.durationRefs.set(duration.value, element as HTMLElement)
			}
		}

		// If duration exceeds closing time, render as disabled
		if (exceedsClosingTime) {
			return html`
				<selection-tile
					${ref(durationRef)}
					?selected=${isSelected}
					?compact=${this.isCompact}
					icon="timer_off"
					label=${this.getCompactLabel(duration)}
					dataValue=${duration.value}
					.showPrice=${true}
					price=${duration.price}
					disabled
					description="Exceeds closing time"
					data-duration-value=${duration.value}
					data-exceeds-closing="true"
					title="Exceeds venue closing time"
					type="duration"
				></selection-tile>
			`
		}

		return html`
			<selection-tile
				${ref(durationRef)}
				?selected=${isSelected}
				?compact=${this.isCompact}
				icon="timer"
				label=${this.getCompactLabel(duration)}
				.dataValue=${duration.value}
				.showPrice=${true}
				price=${duration.price}
				@click=${() => this.handleDurationSelect(duration)}
				data-duration-value=${duration.value}
				type="duration"
			></selection-tile>
		`
	}

	/**
	 * Get compact label format
	 */
	private getCompactLabel(duration: Duration): string {
		const map: Record<number, string> = {
			30: '30m',
			60: '1h',
			90: '1.5h',
			120: '2h',
			150: '2.5h',
			180: '3h',
			210: '3.5h',
			240: '4h',
			270: '4.5h',
			300: '5h',
		}

		return map[duration.value] || `${duration.value}m`
	}

	/**
	 * Render list layout for durations with scroll container ref
	 */
	private renderListLayout(durations: Duration[]): unknown {
		const displayItems = this.ensureMinimumDurations(durations);
		
		return html`
			<div
				${ref(this.scrollContainerRef)}
				class="options-scroll-container flex py-2 overflow-x-auto scrollbar-hide transition-all duration-300 
					${this.isCompact ? 'gap-2' : 'gap-3'}"
				role="listbox"
				aria-label="Available Duration Options"
				aria-multiselectable="false"
			>
				${repeat(
					displayItems,
					(item, index) => 'placeholder' in item ? `placeholder-${index}` : (item as Duration).value,
					(item) => {
						if ('placeholder' in item) {
							// Create an empty placeholder tile with same dimensions but invisible
							return html`
								<div class="w-20 h-20 invisible"></div>
							`;
						}
						return this.renderDurationOption(item as Duration);
					}
				)}
			</div>
		`
	}

	/**
	 * Main render method with view container pattern
	 */
	render() {
		if (this.hidden) return nothing

		// Get current state values
		const { durations, loading, error, showingEstimatedPrices, viewMode } = this.state$.value

		// Use last successful data if available
		const displayDurations =
			durations.length > 0 ? durations : this.lastSuccessfulData ? this.lastSuccessfulData.durations : []

		// Show empty state if no durations
		if (!loading && displayDurations.length === 0) {
			return this.renderEmptyState()
		}

		// KEY CHANGE: Use isExpanded to determine if component should be visible
		return html`
			<div 
				class="
					w-full bg-surface-low rounded-lg transition-all duration-300 p-2
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

				<!-- Loading indicator overlay if loading but showing existing data -->
				${loading && displayDurations.length > 0
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
					!this.isCompact && durations.length > 0,
					() => html`
						<div class="flex items-center justify-between">
							<div>
								<schmancy-typography type="label" token="lg" class="font-medium text-primary-default">
									Select Duration
								</schmancy-typography>
								<div class="text-xs text-surface-on-variant mt-1">
									<span>Choose how long you'd like to play</span>
								</div>
							</div>
						</div>
					`,
				)}

				<!-- Duration options container with view transition system -->
				<div class="view-container">
					<!-- Grid View -->
					<div class="grid-view ${viewMode === 'grid' ? 'active' : ''}">${this.renderGridLayout(displayDurations)}</div>

					<!-- List View -->
					<div class="list-view ${viewMode === 'list' ? 'active' : ''}">${this.renderListLayout(displayDurations)}</div>
				</div>

				<!-- Hint text with estimated price warning if needed -->
				${when(
					!this.isCompact,
					() => html`
						<div class="text-center text-xs pb-2">
							<p class="text-surface-on-variant">All prices include VAT</p>
							${showingEstimatedPrices
								? html`<p class="text-warning-default mt-1">
										<schmancy-icon class="mr-1" size="12px">info</schmancy-icon>
										Estimated prices. Actual price may vary.
								  </p>`
								: nothing}
						</div>
					`,
				)}
			</div>
		`
	}
}
