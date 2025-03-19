import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import {
	combineLatestWith,
	debounceTime,
	distinctUntilChanged,
	filter,
	fromEvent,
	map,
	shareReplay,
	Subscription,
	takeUntil,
	tap,
} from 'rxjs'
import { venuesContext } from 'src/admin/venues/venue-context'
import { pricingService } from 'src/bookingServices/dynamic-pricing-service'
import { OperatingHours, Venue } from 'src/db/venue-collection'
import { courtsContext } from '../../../admin/venues/courts/context'
import { Court } from '../../../db/courts.collection'
import { Booking, bookingContext, BookingProgressContext, BookingStep } from '../context'
import { Duration } from '../types'

/**
 * Duration selection component with improved price display
 * Provides accurate prices based on selected court
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
	@property({ type: Number }) selectedDuration!: number
	@property({ type: Boolean }) active = true
	@property({ type: Boolean }) hidden = false
	@state() selectedVenue?: Venue = undefined

	// Data binding to booking context
	@select(bookingContext, undefined, {
		required: true,
	})
	booking!: Booking
	@select(courtsContext, undefined, {
		required: true,
	})
	courts!: Map<string, Court>

	// Component state
	@state() isMobile = window.innerWidth < 640
	@state() durations: Duration[] = []
	@state() selectedCourt?: Court
	@state() loading: boolean = false
	@state() error: string | null = null
	@state() showingEstimatedPrices: boolean = false

	// Subscription for cleanup
	private resizeSubscription?: Subscription

	connectedCallback() {
		super.connectedCallback()

		// Set up responsive design handling
		this.resizeSubscription = fromEvent(window, 'resize')
			.pipe(debounceTime(100), takeUntil(this.disconnecting))
			.subscribe(() => this.handleResize())

		// Set up booking context subscription for court selection
		bookingContext.$.pipe(
			combineLatestWith(courtsContext.$),
			map(([booking, courts]) => ({ booking, courts })),
			takeUntil(this.disconnecting),
			// Only proceed when courts are ready and we have booking data
			filter(() => courtsContext.ready && bookingContext.ready),
			filter(({ booking }) => !!booking.courtId && !!booking.date && !!booking.startTime),
			map(({ booking }) => ({
				courtId: booking.courtId,
				startTime: booking.startTime,
				date: booking.date,
			})),
			distinctUntilChanged(
				(prev, curr) => prev.courtId === curr.courtId && prev.startTime === curr.startTime && prev.date === curr.date,
			),
			tap(() => {
				this.loading = true
				this.error = null
			}),
			shareReplay(1),
		).subscribe({
			next: () => {
				const court = this.courts.get(this.booking.courtId)
				if (court) {
					this.selectedCourt = court
					// this.updateDurationPrices(court)
					this.showingEstimatedPrices = false
					this.announceForScreenReader('Duration options updated')
				} else {
					this.setEstimatedPrices()
					this.showingEstimatedPrices = true
				}
				this.loading = false
			},
			error: err => {
				console.error('Error in court subscription:', err)
				this.setEstimatedPrices()
				this.showingEstimatedPrices = true
				this.loading = false
				this.error = 'Error loading pricing information'
			},
		})

		// Set estimated prices initially as fallback
		this.setEstimatedPrices()
	}

	disconnectedCallback() {
		super.disconnectedCallback()

		// Clean up subscription
		if (this.resizeSubscription) {
			this.resizeSubscription.unsubscribe()
		}
	}

	firstUpdated(_changedProperties: PropertyValues): void {
		super.firstUpdated(_changedProperties)

		// Calculate current duration from booking
		this.calculateDurationFromBooking()

		// Set loading until data is available
		if (this.active) {
			this.loading = true

			// Only attempt to update durations if courts context is ready
			if (courtsContext.ready) {
				this.updateDurations()
			}
		}
	}

	updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties)

		// If courts context has just become ready, update durations
		if (courtsContext.ready) {
			if (changedProperties.has('booking') || changedProperties.has('courts')) {
				this.calculateDurationFromBooking()
				this.updateDurations()
			}

			// When this step becomes active, ensure durations are updated
			if (changedProperties.has('active') && this.active) {
				this.updateDurations()
			}
		}
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
	 * Fallback to estimated prices when no court can be found
	 */
	private setEstimatedPrices(): void {
		// Get a baseline hourly rate
		let baseHourlyRate = 30 // Default hourly rate in EUR

		// Try to get average rate from available courts if courts are ready
		if (courtsContext.ready && this.courts.size > 0) {
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
		this.durations = [
			{ label: '30m', value: 30, price: Math.round(baseHourlyRate / 2) },
			{ label: '1h', value: 60, price: baseHourlyRate },
			{ label: '1.5h', value: 90, price: Math.round(baseHourlyRate * 1.5) },
			{ label: '2h', value: 120, price: baseHourlyRate * 2 },
			{ label: '2.5h', value: 150, price: Math.round(baseHourlyRate * 2.5) },
			{ label: '3h', value: 180, price: baseHourlyRate * 3 },
		]
	}

	/**
	 * Update prices based on the selected court
	 */
	private updateDurationPrices(court: Court) {
		if (!court || !this.booking.startTime) return

		// Get venue directly from venueId in booking context
		const venue = this.booking.venueId
			? venuesContext.value.get(this.booking.venueId)
			: venuesContext.value.get(court.venueId)

		// Get the day of week for operating hours
		const startTime = dayjs(this.booking.startTime)
		const dayOfWeek = startTime.format('dddd').toLowerCase()
		const operatingHours = venue?.operatingHours?.[dayOfWeek as keyof OperatingHours]

		// Calculate available time until closing
		let maxAvailableMinutes = 180 // Default max (3 hours)

		if (operatingHours) {
			// Parse closing time
			const [closeHour, closeMinute] = operatingHours.close.split(':').map(Number)
			const closeTimeMinutes = closeHour * 60 + (closeMinute || 0)

			// Calculate current time in minutes since midnight
			const currentHour = startTime.hour()
			const currentMinute = startTime.minute()
			const currentTimeMinutes = currentHour * 60 + currentMinute

			// Calculate available minutes until closing
			maxAvailableMinutes = closeTimeMinutes - currentTimeMinutes

			// Apply a small buffer to ensure bookings don't end exactly at closing time
			maxAvailableMinutes -= 15

			// Ensure we have a positive value
			maxAvailableMinutes = Math.max(0, maxAvailableMinutes)
		}

		// Get standard durations from pricing service
		let standardDurations = pricingService.getStandardDurationPrices(court, this.booking.startTime, this.booking.userId)

		// Filter durations to only include those that fit within operating hours
		standardDurations = standardDurations.filter(duration => duration.value <= maxAvailableMinutes)

		// If no durations fit, add at least a 30-minute option if possible
		if (standardDurations.length === 0 && maxAvailableMinutes >= 30) {
			const minDuration = {
				label: '30m',
				value: 30,
				price: Math.round(court.pricing?.baseHourlyRate / 2) || 15,
			}
			standardDurations = [minDuration]
		}

		// Update durations only if we have some
		if (standardDurations.length > 0) {
			this.durations = standardDurations
			this.requestUpdate()
		} else {
			// If we couldn't determine any valid durations, fall back to estimated prices
			this.setEstimatedPrices()
		}
	}

	/**
	 * Handle window resize events
	 */
	private handleResize = () => {
		const wasMobile = this.isMobile
		this.isMobile = window.innerWidth < 640

		if (wasMobile !== this.isMobile) {
			this.requestUpdate()
		}
	}

	/**
	 * Calculate duration from booking start and end times
	 */
	private calculateDurationFromBooking(): void {
		if (this.booking.startTime && this.booking.endTime) {
			const start = dayjs(this.booking.startTime)
			const end = dayjs(this.booking.endTime)
			const duration = end.diff(start, 'minute')

			if (this.selectedDuration !== duration) {
				this.selectedDuration = duration
			}
		}
	}

	/**
	 * Update durations based on selected court and start time
	 */
	private updateDurations(): void {
		// Wait for courts context to be ready
		if (!courtsContext.ready) {
			this.loading = true
			return
		}

		// If we already have a courtId in the booking, use that court
		if (this.booking?.courtId && this.courts.has(this.booking.courtId)) {
			const courtFromId = this.courts.get(this.booking.courtId)
			if (courtFromId) {
				this.selectedCourt = courtFromId
				this.showingEstimatedPrices = false
			}
		}

		// If we have a court and start time, calculate prices
		if (this.selectedCourt && this.booking?.startTime) {
			this.durations = pricingService.getStandardDurationPrices(
				this.selectedCourt,
				this.booking.startTime,
				this.booking.userId,
			)
			this.showingEstimatedPrices = false
			this.loading = false
		}
	}

	/**
	 * Handle duration selection
	 */
	private handleDurationSelect(duration: Duration): void {
		// Set loading state for better UX
		this.loading = true

		// Update selected duration
		this.selectedDuration = duration.value

		// Update booking context
		if (this.booking.startTime) {
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

		BookingProgressContext.set({
			currentStep: BookingStep.Payment,
		})
		this.dispatchEvent(new CustomEvent('change', {}))

		// Announce to screen readers
		this.announceForScreenReader(`Selected ${this.getFullLabel(duration)} duration for €${duration.price.toFixed(2)}`)

		// Reset loading state after a short delay
		setTimeout(() => {
			this.loading = false
		}, 300)
	}

	/**
	 * Get full labels for durations
	 */
	private getFullLabel(duration: Duration): string {
		const map: Record<number, string> = {
			30: '30 min',
			60: '1 hour',
			90: '1.5 hours',
			120: '2 hours',
			150: '2.5 hours',
			180: '3 hours',
		}

		return map[duration.value] || `${duration.value} min`
	}

	/**
	 * Get container classes based on component state
	 */
	private getContainerClasses(): Record<string, boolean> {
		return {
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'shadow-xs': true,
			'py-6 px-4': this.active && !this.isMobile,
			'py-4 px-3': this.active && this.isMobile,
			'py-3 px-2': !this.active,
			'transition-all': true,
			'duration-300': true,
		}
	}

	/**
	 * Get duration option classes based on selection state
	 */
	private getDurationOptionClasses(isSelected: boolean, isMobile: boolean): Record<string, boolean> {
		return {
			'flex-none': isMobile,
			'snap-center': isMobile,
			flex: true,
			'flex-col': true,
			'items-center': true,
			'justify-center': true,
			'cursor-pointer': true,
			'transition-all': true,
			'duration-300': true,
			'rounded-xl': true,
			'bg-primary-default': isSelected,
			'text-primary-on': isSelected,
			'shadow-sm': isSelected,
			'bg-surface-high': !isSelected,
			'text-surface-on': !isSelected,
			'hover:shadow-sm': !isSelected,
			'p-3': isMobile,
			'py-3': !isMobile,
			'px-2': !isMobile,
			'h-24': !isMobile,
			'min-w-20': isMobile,
			'hover:shadow-md': !isMobile && !isSelected,
			'hover:-translate-y-1': !isMobile && !isSelected,
		}
	}

	/**
	 * Render mobile view with horizontal scrolling
	 */
	private renderMobileView() {
		return html`
			<div class=${classMap(this.getContainerClasses())}>
				<!-- Title section -->
				<div class="mb-3">
					<schmancy-typography type="title" token="md">Select Duration</schmancy-typography>
				</div>

				${when(
					this.error,
					() => html`
						<div class="mb-3 p-2 bg-error-container text-error-onContainer rounded">
							<schmancy-typography type="body" token="sm">${this.error}</schmancy-typography>
							<button @click=${() => this.updateDurations()} class="ml-2 underline font-medium">Retry</button>
						</div>
					`,
				)}

				<!-- Horizontal scrollable duration options -->
				<div class="overflow-x-auto scrollbar-hide pb-2 -mx-2 px-2">
					<div class="flex gap-2 snap-x w-full pb-2" role="listbox" aria-label="Duration Options">
						${repeat(
							this.durations,
							duration => duration.value,
							duration => {
								const isSelected = this.selectedDuration === duration.value
								return html`
									<div
										@click=${() => this.handleDurationSelect(duration)}
										class=${classMap(this.getDurationOptionClasses(isSelected, true))}
										role="option"
										aria-selected=${isSelected}
										tabindex="0"
										@keydown=${(e: KeyboardEvent) => {
											if (e.key === 'Enter' || e.key === ' ') {
												this.handleDurationSelect(duration)
												e.preventDefault()
											}
										}}
									>
										<!-- Duration label -->
										<div class="font-medium">${this.getFullLabel(duration)}</div>

										<!-- Price -->
										<div class="font-bold ${isSelected ? 'text-primary-on' : 'text-primary-default'}">
											€${duration.price.toFixed(2)}
										</div>
									</div>
								`
							},
						)}
					</div>
				</div>

				<!-- Hint text with estimated price warning if needed -->
				<div class="mt-2 text-center">
					<p class="text-surface-on-variant text-xs">All prices include VAT</p>
					${this.showingEstimatedPrices
						? html`<p class="text-warning-default text-xs mt-1">
								<schmancy-icon class="mr-1" size="12px">info</schmancy-icon>
								Estimated prices. Actual price may vary.
						  </p>`
						: ''}
					${this.selectedCourt && !this.showingEstimatedPrices
						? html`<p class="text-xs mt-1">
								Pricing based on court:
								<span class="font-medium">${this.selectedCourt.name}</span>
						  </p>`
						: ''}
				</div>
			</div>
		`
	}

	/**
	 * Render desktop view with grid layout
	 */
	private renderDesktopView() {
		return html`
			<div class=${classMap(this.getContainerClasses())}>
				<!-- Title section -->
				<div class="mb-2">
					<schmancy-typography type="title" token="md" class="mb-2">Select Duration</schmancy-typography>
				</div>

				${when(
					this.error,
					() => html`
						<div class="mb-3 p-2 bg-error-container text-error-onContainer rounded">
							<schmancy-typography type="body" token="sm">${this.error}</schmancy-typography>
							<button @click=${() => this.updateDurations()} class="ml-2 underline font-medium">Retry</button>
						</div>
					`,
				)}

				<!-- Duration options - Grid layout for desktop -->
				<div class="grid grid-cols-3 md:grid-cols-4 gap-3" role="listbox" aria-label="Duration Options">
					${repeat(
						this.durations,
						duration => duration.value,
						duration => {
							const isSelected = this.selectedDuration === duration.value
							return html`
								<div
									@click=${() => this.handleDurationSelect(duration)}
									class=${classMap(this.getDurationOptionClasses(isSelected, false))}
									role="option"
									aria-selected=${isSelected}
									tabindex="0"
									@keydown=${(e: KeyboardEvent) => {
										if (e.key === 'Enter' || e.key === ' ') {
											this.handleDurationSelect(duration)
											e.preventDefault()
										}
									}}
								>
									<!-- Duration label -->
									<schmancy-typography type="title" token="md" weight=${isSelected ? 'bold' : 'normal'} class="mb-1">
										${this.getFullLabel(duration)}
									</schmancy-typography>

									<!-- Price -->
									<schmancy-typography
										type="headline"
										token="sm"
										class="font-bold ${isSelected ? 'text-primary-on' : 'text-primary-default'}"
									>
										€${duration.price.toFixed(2)}
									</schmancy-typography>

									${isSelected ? html`<schmancy-icon class="mt-1" size="18px">check_circle</schmancy-icon>` : ''}
								</div>
							`
						},
					)}
				</div>

				<!-- Improved hints section -->
				<div class="mt-4 text-center">
					<p class="text-surface-on-variant text-sm">All prices include VAT</p>

					${this.showingEstimatedPrices
						? html`<div
								class="inline-flex items-center bg-warning-container text-warning-on rounded-full px-3 py-1 text-xs mt-2"
						  >
								<schmancy-icon class="mr-1" size="14px">info</schmancy-icon>
								Showing estimated prices. Actual price may vary.
						  </div>`
						: ''}
					${this.selectedCourt && !this.showingEstimatedPrices
						? html`<p class="text-xs mt-1">
								Pricing based on court:
								<span class="font-medium">${this.selectedCourt.name}</span>
						  </p>`
						: ''}
				</div>
			</div>
		`
	}

	render() {
		if (this.hidden) return html``

		return html`
			${when(
				this.loading,
				() => html`
					<div
						class="fixed inset-0 z-50 bg-opacity-70 backdrop-blur-sm flex items-center justify-center transition-opacity duration-300"
						role="alert"
						aria-label="Loading"
					>
						<schmancy-spinner class="h-12 w-12" size="48px"></schmancy-spinner>
					</div>
				`,
			)}
			${this.isMobile ? this.renderMobileView() : this.renderDesktopView()}
		`
	}
}
