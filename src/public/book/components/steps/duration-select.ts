import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { distinctUntilChanged, filter, map, startWith, takeUntil, tap } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { availabilityCoordinator } from 'src/bookingServices/availability-coordinator'
import { Court } from 'src/db/courts.collection'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'
import { Duration } from '../../types'
import { getUserTimezone, toUserTimezone } from 'src/utils/timezone'

/**
 * Duration selection component that matches the time selection component design
 * Horizontally scrollable, responsive and with consistent animations
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
`) {
	@property({ type: Boolean }) active = true
	@property({ type: Boolean }) hidden = false

	// Basic dependencies
	@select(bookingContext) booking!: Booking
	@select(courtsContext) courts!: Map<string, Court>
	@select(BookingProgressContext) bookingProgress!: BookingProgress

	// State properties
	@state() durations: Duration[] = []
	@state() loading = true
	@state() error: string | null = null
	@state() selectedCourt?: Court
	@state() showingEstimatedPrices = false
	@state() autoScrollAttempted = false

	// Track the last successful durations data for better UX during errors
	private lastSuccessfulData: { durations: Duration[] } | null = null

	/**
	 * Determine if compact view should be used based on booking progress context
	 * Matches the pattern used in time-selection-step
	 */
	get isCompact(): boolean {
		return this.bookingProgress?.currentStep !== BookingStep.Duration
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
	 * Load durations based on court and venue data with proper timezone handling
	 */
	private loadDurations(): void {
		// Set initial loading state
		this.loading = true
		this.error = null
		this.requestUpdate()

		// Safety check to make sure booking object exists
		if (!this.booking) {
			console.warn('Booking object not available, using estimated prices')
			this.setEstimatedPrices()
			this.loading = false
			return
		}

		// Find selected court
		if (this.booking?.courtId && this.courts && this.courts.has(this.booking.courtId)) {
			const court = this.courts.get(this.booking.courtId)
			this.selectedCourt = court

			// Only proceed if we have a court and start time
			if (court && this.booking?.startTime) {
				console.log('Loading durations for court', court.id, 'at time', this.booking.startTime)

				// Log the important timezone debug info to help diagnose
				const userTz = getUserTimezone()
				const utcTime = dayjs(this.booking.startTime).utc()
				const localTime = toUserTimezone(this.booking.startTime)

				console.log(`Timezone Debug:`)
				console.log(`- User timezone: ${userTz}`)
				console.log(`- UTC time from booking: ${utcTime.format('YYYY-MM-DD HH:mm:ss')}`)
				console.log(`- Converted to local time: ${localTime.format('YYYY-MM-DD HH:mm:ss')}`)

				// Use availability coordinator to get valid durations with proper timezone context
				try {
					// Get available durations from the coordinator
					const availableDurations = availabilityCoordinator.getAvailableDurations(court.id, this.booking.startTime)

					if (availableDurations.length > 0) {
						// We have valid durations from the availability system
						this.durations = availableDurations
						this.showingEstimatedPrices = false
						this.lastSuccessfulData = { durations: availableDurations }
						this.announceForScreenReader(`${availableDurations.length} duration options available`)
						console.log('Loaded durations:', availableDurations)
					} else {
						// No valid durations available - check if it's a data issue or truly no availability
						if (availabilityCoordinator.error$.value) {
							// There was an error fetching availability data
							this.error = 'Could not determine available durations. Using estimates instead.'
							this.setEstimatedPrices()
							console.warn('Using estimated prices due to error:', availabilityCoordinator.error$.value)
						} else {
							// No error, but still no available durations - truly unavailable
							this.error = 'No valid duration options available for this time slot. Please select a different time.'
							this.durations = []
							console.warn('No durations available for this time slot')
						}
					}
				} catch (error) {
					console.error('Error getting available durations:', error)
					this.error = 'Error determining available durations. Using estimates instead.'
					this.setEstimatedPrices()
				}
			} else {
				// Missing court or start time
				console.warn('Missing court or start time, using estimated prices')
				this.setEstimatedPrices()
			}
		} else {
			// Court not found
			console.warn('Court not found, using estimated prices')
			this.setEstimatedPrices()
		}

		this.loading = false
		this.requestUpdate()

		// After data is loaded, try to scroll to the appropriate position
		this.updateComplete.then(() => {
			// [existing scrolling code...]
		})
	}

	// Add a reactive subscription to the BookingProgress context
	connectedCallback(): void {
		super.connectedCallback()

		// Subscribe to BookingProgressContext changes to track compact state
		BookingProgressContext.$.pipe(takeUntil(this.disconnecting)).subscribe(progress => {
			this.active = progress.currentStep === BookingStep.Duration
			this.requestUpdate()

			// Reset auto-scroll flag when this step becomes active
			if (progress.currentStep === BookingStep.Duration) {
				this.autoScrollAttempted = false
				// Try to scroll to selected duration after a brief delay to ensure DOM is ready
				setTimeout(() => this.scrollToSelectedDuration(), 100)
			}
		})

		// Set up reactive subscription to booking context
		// Enhanced to respond immediately to time selection changes
		bookingContext.$.pipe(
			startWith(bookingContext.value),
			takeUntil(this.disconnecting),
			filter(booking => {
				// Ensure booking exists and has required properties
				if (!booking) return false
				return !!booking.date && !!booking.courtId && !!booking.startTime
			}),
			map(booking => ({
				date: booking.date,
				venueId: booking.venueId,
				courtId: booking.courtId,
				startTime: booking.startTime,
				endTime: booking.endTime,
			})),
			// Important: reload when time selection changes
			distinctUntilChanged(
				(prev, curr) => prev.courtId === curr.courtId && prev.startTime === curr.startTime && prev.date === curr.date,
			),
			tap(booking => {
				console.log('Booking context changed, reloading durations:', booking)
				this.loading = true
				this.autoScrollAttempted = false // Reset auto-scroll flag when data changes

				// Clear durations to show loading state properly
				this.durations = []
				this.requestUpdate()

				// Load durations with a short delay to ensure availability data is up to date
				setTimeout(() => this.loadDurations(), 100)
			}),
		).subscribe({
			error: err => {
				console.error('Error in booking subscription:', err)
				this.error = 'Failed to load duration options'
				this.loading = false
				this.requestUpdate()

				// Fallback to estimated prices on error
				this.setEstimatedPrices()
			},
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

		// Set a flag that these are estimated prices
		this.showingEstimatedPrices = true

		// Create estimated durations based on the baseline rate
		const estimatedDurations = [
			{ label: '30m', value: 30, price: Math.round(baseHourlyRate / 2) },
			{ label: '1h', value: 60, price: baseHourlyRate },
			{ label: '1.5h', value: 90, price: Math.round(baseHourlyRate * 1.5) },
			{ label: '2h', value: 120, price: baseHourlyRate * 2 },
			{ label: '2.5h', value: 150, price: Math.round(baseHourlyRate * 2.5) },
			{ label: '3h', value: 180, price: baseHourlyRate * 3 },
		]

		// Apply time constraints to estimated durations
		const filteredDurations = this.filterEstimatedDurations(estimatedDurations)

		this.durations = filteredDurations
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
	 * Handle duration selection with improved scrolling behavior
	 */
	private handleDurationSelect(duration: Duration): void {
		// Update booking context
		if (this.booking && this.booking.startTime) {
			const startTime = dayjs(this.booking.startTime)
			const endTime = startTime.add(duration.value, 'minute').toISOString()

			bookingContext.set(
				{
					endTime,
					price: duration.price,
				},
				true,
			)
		}

		// Ensure the selected duration is properly centered after selection
		setTimeout(() => this.scrollToSelectedDuration(), 150)

		// Advance to next step
		BookingProgressContext.set({
			currentStep: BookingStep.Payment,
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
		}

		return map[duration.value] || `${duration.value} minutes`
	}

	/**
	 * Scroll to selected duration
	 * Only scrolls if the element is not already visible in the viewport
	 */
	private scrollToSelectedDuration(): void {
		const currentDuration = this.getCurrentDuration()
		if (!currentDuration) return

		try {
			// Get the scrollable container
			const scrollContainer = this.shadowRoot?.querySelector('div.overflow-x-auto') as HTMLElement
			if (!scrollContainer) return

			// Find the selected duration element
			const durationEl = this.shadowRoot?.querySelector(`[data-duration-value="${currentDuration}"]`) as HTMLElement
			if (!durationEl) return

			// Check if element is already in view
			const containerRect = scrollContainer.getBoundingClientRect()
			const elementRect = durationEl.getBoundingClientRect()

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
	 * Only scrolls if the element is not already visible in the viewport
	 */
	private scrollToFirstDuration(): void {
		if (this.durations.length === 0) return

		try {
			// Get the scrollable container
			const scrollContainer = this.shadowRoot?.querySelector('div.overflow-x-auto') as HTMLElement
			if (!scrollContainer) return

			// Find the first duration element
			const durationEl = this.shadowRoot?.querySelector(
				`[data-duration-value="${this.durations[0].value}"]`,
			) as HTMLElement
			if (!durationEl) return

			// Check if element is already in view
			const containerRect = scrollContainer.getBoundingClientRect()
			const elementRect = durationEl.getBoundingClientRect()

			// Element is fully visible if its left and right edges are within the container's viewport
			const isFullyVisible = elementRect.left >= containerRect.left && elementRect.right <= containerRect.right

			// Element is partially visible if at least some part of it is in the viewport
			const isPartiallyVisible = elementRect.left < containerRect.right && elementRect.right > containerRect.left

			// If the element is already fully visible, don't scroll
			if (isFullyVisible) {
				// Just highlight the element
				this.highlightDurationOption(durationEl)
				return
			}

			// If partially visible but more than half is visible, don't scroll either
			if (isPartiallyVisible) {
				const visibleWidth =
					Math.min(elementRect.right, containerRect.right) - Math.max(elementRect.left, containerRect.left)
				const elementVisiblePercentage = visibleWidth / elementRect.width

				if (elementVisiblePercentage > 0.5) {
					// Just highlight the element
					this.highlightDurationOption(durationEl)
					return
				}
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
		this.loadDurations()
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
	 * Render loading state
	 */
	private renderLoadingState(): unknown {
		return html`
			<div class="text-center py-6">
				<div
					class="inline-block w-8 h-8 border-4 border-t-primary-default border-r-outlineVariant border-b-outlineVariant border-l-outlineVariant rounded-full animate-spin"
				></div>
				<schmancy-typography type="body" token="md" class="mt-2">Loading durations...</schmancy-typography>
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

		// Show empty state if no durations
		if (this.durations.length === 0) {
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
			'mt-3': true, // Match time select spacing
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

				<!-- Title section with animations aligned with time-select -->
				${when(
					this.active,
					() => html`
						<schmancy-typography type="label" token="lg" class="font-medium text-primary-default">
							Select Duration
						</schmancy-typography>
					`,
				)}

				<!-- Duration options scrollable container with animation -->
				<div
					class="flex py-2 overflow-x-auto scrollbar-hide transition-all duration-300 ${this.isCompact
						? 'gap-2'
						: 'gap-3'}"
					role="listbox"
					aria-label="Available Duration Options"
					aria-multiselectable="false"
				>
					${repeat(
						this.durations,
						duration => duration.value,
						duration => this.renderDurationOption(duration),
					)}
				</div>

				<!-- Hint text with estimated price warning if needed -->
				<div class="mt-2 text-center text-xs pb-2">
					<p class="text-surface-on-variant">All prices include VAT</p>
					${this.showingEstimatedPrices
						? html`<p class="text-warning-default mt-1">
								<schmancy-icon class="mr-1" size="12px">info</schmancy-icon>
								Estimated prices. Actual price may vary.
						  </p>`
						: nothing}
					${this.selectedCourt && !this.showingEstimatedPrices
						? html`<p class="mt-1">
								Pricing based on court:
								<span class="font-medium">${this.selectedCourt.name}</span>
						  </p>`
						: nothing}
				</div>
			</div>
		`
	}

	/**
	 * Render a duration option with animations
	 */
	private renderDurationOption(duration: Duration) {
		const currentDuration = this.getCurrentDuration()
		const isSelected = currentDuration === duration.value

		// Size and spacing classes based on compact state
		const sizeClasses = {
			// Normal size
			'w-28': !this.isCompact,
			'h-28': !this.isCompact,
			// Compact size
			'w-20': this.isCompact,
			'h-20': this.isCompact,
		}

		// Classes for the duration option
		const optionClasses = {
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

			// Transitions - enhanced to match time select motion
			'transition-all': true,
			'duration-300': true,
			transform: true,
			'ease-in-out': true,

			// Interaction states - enhanced with time-like motion
			'cursor-pointer': true,
			'hover:scale-105': !isSelected,
			'hover:shadow-md': !isSelected,
			'active:scale-95': !isSelected, // Add press animation

			// Selected animation
			'scale-105': isSelected, // Make selected items slightly larger like in time select
			'shadow-md': isSelected, // Add shadow to selected items

			// Visual states
			'bg-primary-default': isSelected,
			'text-primary-on': isSelected,
			'border-primary-default': isSelected,
			'bg-success-container/10': !isSelected,
			'border-outlineVariant': !isSelected,
			'text-surface-on': !isSelected,
		}

		// Icon animation classes
		const iconClasses = {
			'transition-all': true,
			'duration-300': true,
			transform: true,
			'text-primary-on': isSelected,
			'text-primary-default': !isSelected,
			'scale-125': isSelected, // Enlarge icon when selected
		}

		// Price class animation
		const priceClasses = {
			'font-bold': true,
			'mt-2': true,
			'transition-all': true,
			'duration-300': true,
			'text-lg': !this.isCompact && isSelected,
			'text-base': this.isCompact || !isSelected,
		}

		return html`
			<div
				class=${classMap(optionClasses)}
				@click=${() => this.handleDurationSelect(duration)}
				data-duration-value=${duration.value}
				role="option"
				aria-selected="${isSelected ? 'true' : 'false'}"
			>
				<!-- Duration icon with enhanced animation -->
				<schmancy-icon class=${classMap(iconClasses)} size=${this.isCompact ? '16px' : '18px'}> timer </schmancy-icon>

				<!-- Duration label with enhanced animation -->
				<div class="${this.isCompact ? 'text-sm mt-1' : 'text-base mt-2'} font-medium">
					${this.getCompactLabel(duration)}
				</div>

				<!-- Price with enhanced animation -->
				<div class=${classMap(priceClasses)}>€${duration.price.toFixed(2)}</div>

				<!-- Selected indicator -->
				${isSelected && !this.isCompact
					? html` <schmancy-icon size="14px" class="mt-1">check_circle</schmancy-icon> `
					: nothing}
			</div>
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
		}

		return map[duration.value] || `${duration.value}m`
	}
}

// Register the element in the global namespace
declare global {
	interface HTMLElementTagNameMap {
		'duration-selection-step': DurationSelectionStep
	}
}
