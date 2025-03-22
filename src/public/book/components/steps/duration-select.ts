// src/public/book/components/steps/duration-select.ts
import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
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
import { availabilityContext, availabilityLoading$, getAvailableDurations } from 'src/availability-context'
import { Court } from 'src/db/courts.collection'
import { toUserTimezone } from 'src/utils/timezone'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'
import { Duration } from '../../types'

/**
 * Duration selection component that matches the time selection component design
 * Grid view by default on desktop, switching to list view on selection or small screens
 * Uses the availability context to show durations for all courts
 */
@customElement('duration-selection-step')
export class DurationSelectionStep extends $LitElement(css`
	.scrollbar-hide {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none; /* Chrome, Safari, and Opera */
	}

	/* Prevent overflow clipping issues with scaling */
	.options-scroll-container {
		padding: 10px;
		margin: -10px;
	}

	.duration-tile {
		transform-origin: center;
		transition: all 0.3s ease;
	}

	.duration-tile.selected {
		transform: scale(1.05);
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
	}

	.duration-tile:hover:not(.selected) {
		transform: scale(1.05);
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
	}

	.duration-tile:active:not(.selected) {
		transform: scale(0.95);
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
		availableCourtsCount: number
	}>({
		durations: [],
		loading: true,
		error: null,
		autoScrollAttempted: false,
		viewMode: 'grid',
		showingEstimatedPrices: false,
		availableCourtsCount: 0,
	})

	// State properties derived from observables
	@state() private isActive = false
	@state() private isCompact = false
	@state() private isDesktopOrTablet = window.innerWidth >= 384
	@state() private shouldUseGridView = false

	// Observables for reactive state management
	private isActive$!: Observable<boolean>
	private isCompact$!: Observable<boolean>
	private isDesktopOrTablet$!: Observable<boolean>
	private shouldUseGridView$!: Observable<boolean>

	// Store references for cleanup
	private resizeObserver: ResizeObserver | null = null

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
			map(progress => progress.currentStep === BookingStep.Duration),
			startWith(this.active),
			distinctUntilChanged(),
			shareReplay(1),
		)

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
					const currentMode = this.state$.value.viewMode
					// If not active, always use list view
					if (!isActive) return 'list'
					// If selection is made, switch to list view
					if (hasSelection) return 'list'
					// If switching to mobile, always use list
					if (!isDesktop) return 'list'
					// If switching from inactive to active on desktop, use grid
					if (isActive && isDesktop && currentMode === 'list' && !hasSelection) return 'grid'
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
						if (this.booking.endTime) {
							this.scrollToSelectedDuration()
						} else if (!this.state$.value.autoScrollAttempted) {
							this.updateState({ autoScrollAttempted: true })
							this.scrollToFirstDuration()
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
			})),
			// Important: reload when time selection changes
			// Using distinctUntilChanged to avoid unnecessary reloads
			distinctUntilChanged((prev, curr) => prev.startTime === curr.startTime),
			tap(booking => {
				console.log('Booking context changed, reloading durations:', booking)
				this.updateState({
					loading: true,
					autoScrollAttempted: false,
					durations: [],
				})

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
			this.isActive = progress.currentStep === BookingStep.Duration
			this.requestUpdate()

			// Reset auto-scroll flag when this step becomes active
			if (progress.currentStep === BookingStep.Duration) {
				this.updateState({ autoScrollAttempted: false })

				// Try to scroll to selected duration after a brief delay to ensure DOM is ready
				setTimeout(() => {
					if (this.state$.value.viewMode === 'list') {
						this.scrollToSelectedDuration()
					}
				}, 100)
			}
		})
	}

	// NEW: Subscribe to availability context
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
	 * Toggle between grid and list view
	 */
	private toggleView(mode: 'grid' | 'list'): void {
		if (this.state$.value.viewMode !== mode) {
			this.updateState({ viewMode: mode })

			// If switching to list mode, enable scrolling behavior
			if (mode === 'list') {
				setTimeout(() => {
					const currentDuration = this.getCurrentDuration()
					if (currentDuration) {
						this.scrollToSelectedDuration()
					} else if (!this.state$.value.autoScrollAttempted) {
						this.updateState({ autoScrollAttempted: true })
						this.scrollToFirstDuration()
					}
				}, 150)
			}
		}
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
	 * Load durations using the availability context
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
			console.log('Loading durations for all courts at time', this.booking.startTime)

			try {
				// Get available durations from availability context
				const availableDurations = getAvailableDurations(this.booking.startTime)

				if (availableDurations.length > 0) {
					// Calculate available courts count
					const availableCourtsCount = this.availability.activeCourtIds.length || 0

					this.updateState({
						durations: availableDurations,
						showingEstimatedPrices: false,
						availableCourtsCount,
						loading: false,
						error: this.availability.error,
					})

					this.lastSuccessfulData = { durations: availableDurations }
					this.announceForScreenReader(`${availableDurations.length} duration options available`)
				} else {
					// No valid durations available - use estimated prices as fallback
					this.updateState({
						error: 'No valid duration options available for this time slot. Please select a different time.',
						durations: [],
						loading: false,
					})
					this.setEstimatedPrices()
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
	 * Set estimated prices with more realistic filtering
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

		// Create estimated durations based on the baseline rate
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

		// Apply time constraints to estimated durations
		const filteredDurations = this.filterEstimatedDurations(estimatedDurations)

		this.updateState({
			durations: filteredDurations,
			showingEstimatedPrices: true,
			loading: false,
		})

		this.lastSuccessfulData = { durations: filteredDurations }
		this.announceForScreenReader('Showing estimated duration options')
	}

	/**
	 * Filter estimated durations based on time of day
	 * This prevents showing durations that would go past closing time
	 */
	private filterEstimatedDurations(durations: Duration[]): Duration[] {
		if (!this.booking?.startTime) return durations

		try {
			const startTime = dayjs(this.booking.startTime)
			const closingTime = dayjs(this.booking.date).hour(22).minute(0) // Assuming 10 PM closing

			return durations.filter(duration => {
				const endTime = startTime.add(duration.value, 'minute')
				return endTime.isBefore(closingTime) || endTime.isSame(closingTime)
			})
		} catch (error) {
			console.error('Error filtering estimated durations:', error)
			return durations
		}
	}

	/**
	 * Handle duration selection - now should help the user select a court
	 * Since we may have multiple court options for a given duration
	 */
	private handleDurationSelect(duration: Duration): void {
		// Update booking context with duration info
		if (this.booking && this.booking.startTime) {
			// Convert from UTC to local, add duration, then back to UTC
			const localStartTime = toUserTimezone(this.booking.startTime)
			const localEndTime = localStartTime.add(duration.value, 'minute')

			// Convert back to UTC for storage
			const endTime = localEndTime.utc().toISOString()

			bookingContext.set({
				endTime,
				price: duration.price,
			})
		}

		// Always switch to list view after selection
		this.updateState({ viewMode: 'list' })

		// Ensure the selected duration is properly centered after selection
		setTimeout(() => this.scrollToSelectedDuration(), 150)

		// Advance to court selection step
		BookingProgressContext.set({
			currentStep: BookingStep.Court,
		})

		// Dispatch event for parent components
		this.dispatchEvent(
			new CustomEvent('next', {
				bubbles: true,
				composed: true,
			}),
		)

		// Announce to screen readers
		this.announceForScreenReader(`Selected ${this.getFullLabel(duration)} for €${duration.price.toFixed(2)}`)
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
			210: '3.5h',
			240: '4h',
			270: '4.5h',
			300: '5h',
		}

		return map[duration.value] || `${duration.value} minutes`
	}

	/**
	 * Scroll to selected duration with improved positioning
	 */
	private scrollToSelectedDuration(): void {
		const currentDuration = this.getCurrentDuration()
		if (!currentDuration || this.state$.value.viewMode !== 'list') return

		try {
			// Get the scrollable container
			const scrollContainer = this.shadowRoot?.querySelector('.options-scroll-container') as HTMLElement
			if (!scrollContainer) return

			// Find the selected duration element
			const durationEl = this.shadowRoot?.querySelector(`[data-duration-value="${currentDuration}"]`) as HTMLElement
			if (!durationEl) return

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
	 * Scroll to first duration option
	 */
	private scrollToFirstDuration(): void {
		if (this.state$.value.durations.length === 0 || this.state$.value.viewMode !== 'list') return

		try {
			// Get the scrollable container
			const scrollContainer = this.shadowRoot?.querySelector('.options-scroll-container') as HTMLElement
			if (!scrollContainer) return

			// Find the first duration element
			const durationEl = this.shadowRoot?.querySelector(
				`[data-duration-value="${this.state$.value.durations[0].value}"]`,
			) as HTMLElement
			if (!durationEl) return

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
		element.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }], {
			duration: 800,
			easing: 'ease-in-out',
		})
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
	 * Render view toggle buttons
	 */
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

	/**
	 * Render empty state (no durations)
	 */
	private renderEmptyState(): unknown {
		return html`
			<div class="text-center py-6">
				<schmancy-icon size="48px" class="text-surface-on-variant opacity-50">timer_off</schmancy-icon>
				<schmancy-typography type="body" token="md" class="mt-2">
					No duration options available for this time.
				</schmancy-typography>
			</div>
		`
	}

	/**
	 * Render grid layout for durations
	 */
	private renderGridLayout(durations: Duration[]): unknown {
		return html`
			<div
				class="grid grid-cols-5 gap-2 py-4"
				role="listbox"
				aria-label="Available Duration Options"
				aria-multiselectable="false"
			>
				${repeat(
					durations,
					duration => duration.value,
					duration => this.renderDurationOption(duration),
				)}
			</div>
		`
	}

	/**
	 * Render list layout for durations
	 */
	private renderListLayout(durations: Duration[]): unknown {
		return html`
			<div
				class="options-scroll-container flex py-2 overflow-x-auto scrollbar-hide transition-all duration-300 
					${this.isCompact ? 'gap-2' : 'gap-3'}"
				role="listbox"
				aria-label="Available Duration Options"
				aria-multiselectable="false"
			>
				${repeat(
					durations,
					duration => duration.value,
					duration => this.renderDurationOption(duration),
				)}
			</div>
		`
	}

	/**
	 * Render a duration option with consistent styling
	 */
	private renderDurationOption(duration: Duration) {
		const currentDuration = this.getCurrentDuration()
		const isSelected = currentDuration === duration.value

		return html`
			<selection-tile
				?selected=${isSelected}
				?compact=${this.isCompact}
				icon="timer"
				label=${this.getCompactLabel(duration)}
				dataValue=${duration.value}
				.showPrice=${true}
				price=${duration.price}
				@click=${() => this.handleDurationSelect(duration)}
				data-duration-value=${duration.value}
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
	 * Main render method
	 */
	render() {
		if (this.hidden) return nothing

		// Get current state values
		const { durations, loading, error, showingEstimatedPrices, availableCourtsCount } = this.state$.value

		// Use last successful data if available
		const displayDurations =
			durations.length > 0 ? durations : this.lastSuccessfulData ? this.lastSuccessfulData.durations : []

		// Define class objects for animated transitions
		const containerClasses = {
			'w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'transition-all': true,
			'duration-300': true,
			'mt-3': true, // Match time select spacing
			'px-2': true,
			transform: true,
			'ease-in-out': true,
			'scale-100': this.isActive,
			'scale-95': !this.isActive && !this.isCompact,
		}

		// Render main content
		return html`
			<div class=${classMap(containerClasses)}>
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
					this.isActive,
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
							${this.renderViewToggle()}
						</div>

						${availableCourtsCount > 0
							? html`
									<div class="text-xs text-success-default mt-1">
										${availableCourtsCount} ${availableCourtsCount === 1 ? 'court' : 'courts'} available
									</div>
							  `
							: nothing}
					`,
				)}

				<!-- Duration options container - switching between grid and list -->
				${this.shouldUseGridView ? this.renderGridLayout(displayDurations) : this.renderListLayout(displayDurations)}

				<!-- Hint text with estimated price warning if needed -->
				${when(
					!this.isCompact,
					() => html`
          <div class="text-center text-xs pb-2">
					<p class="text-surface-on-variant">All prices include VAT</p>
					${
						showingEstimatedPrices
							? html`<p class="text-warning-default mt-1">
									<schmancy-icon class="mr-1" size="12px">info</schmancy-icon>
									Estimated prices. Actual price may vary.
							  </p>`
							: nothing
					}
				</div>
			</div>`,
				)}
			</div>
		`
	}
}
