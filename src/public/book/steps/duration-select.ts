import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { debounceTime, fromEvent, takeUntil } from 'rxjs'
import { CourtAssignmentService } from 'src/bookingServices/court-assignment.service'
import { AvailabilityService } from 'src/bookingServices/availability'
import { pricingService } from 'src/bookingServices/dynamic-pricing-service'
import { courtsContext } from '../../../admin/venues/courts/context'
import { Court } from '../../../db/courts.collection'
import { TentativeCourtAssignment } from '../tentative-court-assignment'
import { Booking, bookingContext } from '../context'
import { Duration } from '../types'

/**
 * Duration selection component with improved price display
 * Ensures prices are accurate based on court availability
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

	// Data binding to booking context
	@select(bookingContext) booking!: Booking
	@select(courtsContext) courts!: Map<string, Court>

	// Track if we're on a mobile device
	@state() isMobile = window.innerWidth < 640
	@state() recommendedDuration: number = 60 // Default to 1 hour as recommended
	@state() durations: Duration[] = []
	@state() selectedCourt?: Court
	@state() loading: boolean = false
	@state() tentativeAssignmentActive: boolean = false
	@state() tentativeAssignmentFailed: boolean = false
	@state() showingEstimatedPrices: boolean = false
	@state() retryCount: number = 0
	@state() private isGettingCourtAssignment = false

	// Maximum number of retries
	private readonly MAX_RETRIES = 2

	// Retry delay in ms
	private readonly RETRY_DELAY = 500

	// Flag to track component mounting state
	private isMounted = false

	// Services
	private availabilityService = new AvailabilityService()
	private courtAssignmentService = new CourtAssignmentService(this.availabilityService)
	private tentativeCourtAssignment = new TentativeCourtAssignment(this.courtAssignmentService)

	connectedCallback() {
		super.connectedCallback()

		// Set up window resize listener for responsive design
		window.addEventListener('resize', this.handleResize)

		fromEvent(window, 'resize')
			.pipe(takeUntil(this.disconnecting), debounceTime(100))
			.subscribe({
				next: () => this.handleResize(),
			})

		this.isMounted = true
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		window.removeEventListener('resize', this.handleResize)
		this.isMounted = false
	}

	firstUpdated(_changedProperties: PropertyValues): void {
		super.firstUpdated(_changedProperties)

		// Calculate current duration from booking
		this.calculateDurationFromBooking()

		// Set loading immediately if step is active
		if (this.active && !this.tentativeAssignmentActive) {
			this.loading = true
		}

		// Preload the PreferencesHelper to avoid delay later
		import('../preferences-helper').then(() => {
			console.log('PreferencesHelper preloaded')
		})

		// Set default fallback durations with estimated prices
		this.setEstimatedPrices()

		// Update durations based on booking data and selected court
		this.updateDurations()
	}

	updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties)

		// If booking or courts context changes, recalculate
		if (changedProperties.has('booking') || changedProperties.has('courts')) {
			this.calculateDurationFromBooking()
			this.updateDurations()
			requestAnimationFrame(() => {
				this.getTentativeCourtAssignment()
			})
		}

		// When this step becomes active, try to get a tentative court assignment
		if (changedProperties.has('active') && this.active && !this.tentativeAssignmentActive) {
			// Immediate loading state
			this.loading = true

			// Short delay to allow UI to render the loading state
			requestAnimationFrame(() => {
				this.getTentativeCourtAssignment()
			})
		}
	}

	/**
	 * Set estimated prices based on standard court rates
	 * This provides better fallback pricing than the previous fixed values
	 */
	private setEstimatedPrices(): void {
		// Get a baseline hourly rate
		// Try to find from available courts or use a reasonable default
		let baseHourlyRate = 30 // Default hourly rate in EUR

		// Try to get average rate from available courts
		if (this.courts && this.courts.size > 0) {
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
	 * Tentatively assign a court based on preferences to get accurate pricing
	 * with improved retry mechanism and better error handling
	 */
	private async getTentativeCourtAssignment() {
		if (this.isGettingCourtAssignment) return

		// Only run if we have necessary booking data and component is mounted
		if (!this.isMounted || !this.booking.date || !this.booking.startTime) {
			this.loading = false
			return
		}

		this.loading = true
		this.tentativeAssignmentActive = true
		this.tentativeAssignmentFailed = false

		try {
			// Get time in minutes since midnight
			const startTime = dayjs(this.booking.startTime)
			const startMinutes = startTime.hour() * 60 + startTime.minute()

			// Get available courts
			const availableCourts = Array.from(this.courts.values())

			if (availableCourts.length === 0) {
				throw new Error('No courts available')
			}

			// Get the PreferencesHelper (already preloaded)
			const { PreferencesHelper } = await import('../preferences-helper')

			// Get stored preferences
			const preferences = PreferencesHelper.getPreferences()

			console.log('Getting tentative court assignment with preferences:', preferences)

			this.isGettingCourtAssignment = true
			// Get tentative court assignment
			const tentativeCourt = await this.tentativeCourtAssignment.findBestMatchingCourt(
				this.booking.date,
				startMinutes,
				availableCourts,
				preferences,
			)

			if (tentativeCourt) {
				this.selectedCourt = tentativeCourt
				this.updateDurationPrices(tentativeCourt)
				this.showingEstimatedPrices = false
				this.retryCount = 0 // Reset retry count on success
			} else {
				// If no court was found but we have available courts, use the first active one
				this.tentativeAssignmentFailed = true
				const anyActiveCourt = availableCourts.find(court => court.status === 'active')
				if (anyActiveCourt) {
					this.selectedCourt = anyActiveCourt
					this.updateDurationPrices(anyActiveCourt)
					this.showingEstimatedPrices = false // Still using a real court's pricing
				} else {
					// If no active courts, keep showing estimated prices
					this.showingEstimatedPrices = true
				}
			}
		} catch (error) {
			console.error('Error getting tentative court assignment:', error)
			this.tentativeAssignmentFailed = true

			// Retry logic with exponential backoff
			if (this.retryCount < this.MAX_RETRIES && this.isMounted) {
				this.retryCount++
				console.log(`Retrying tentative court assignment (${this.retryCount}/${this.MAX_RETRIES})...`)

				// Use exponential backoff for retries
				const delay = this.RETRY_DELAY * Math.pow(2, this.retryCount - 1)

				setTimeout(() => {
					if (this.isMounted && this.active) {
						this.getTentativeCourtAssignment()
					}
				}, delay)

				// Keep loading state active during retry
				return
			}

			// Fall back to estimated prices after all retries
			this.showingEstimatedPrices = true
		} finally {
			// Only turn off loading if mounted and not in retry mode
			if (this.isMounted && (this.retryCount === 0 || this.retryCount >= this.MAX_RETRIES)) {
				this.loading = false
			}
		}
	}

	/**
	 * Update prices based on the tentatively assigned court
	 */
	private updateDurationPrices(court: Court) {
		if (!court || !this.booking.startTime) return

		// Get the updated durations with prices based on court
		const updatedDurations = pricingService.getStandardDurationPrices(
			court,
			this.booking.startTime,
			this.booking.userId,
		)

		// Find the most popular/recommended duration (typically 1 hour)
		const recommendedDuration = updatedDurations.find(d => d.value === 60) || updatedDurations[1]
		if (recommendedDuration) {
			this.recommendedDuration = recommendedDuration.value
		}

		// Update durations
		this.durations = updatedDurations
		this.requestUpdate()

		// Log for debugging
		console.log('Updated duration prices based on court:', court.name)
		console.log('Recommended duration:', this.recommendedDuration)
	}

	/**
	 * Handle window resize events
	 */
	private handleResize = () => {
		this.checkMobileView()
	}

	/**
	 * Check if we're on a mobile view
	 */
	private checkMobileView() {
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
		// If we already have a courtId in the booking, use that court
		if (this.booking.courtId && this.courts) {
			const courtFromId = this.courts.get(this.booking.courtId)
			if (courtFromId) {
				this.selectedCourt = courtFromId
				this.tentativeAssignmentActive = true // Prevent tentative assignment
				this.showingEstimatedPrices = false
			}
		}

		// If we have a court and start time, calculate prices
		if (this.selectedCourt && this.booking.startTime) {
			this.durations = pricingService.getStandardDurationPrices(
				this.selectedCourt,
				this.booking.startTime,
				this.booking.userId,
			)
			this.showingEstimatedPrices = false
		} else if (!this.durations.length) {
			// Fall back to estimated prices if no durations are set
			this.setEstimatedPrices()
		}

		// If step is active, try to get a tentative court assignment
		if (this.active && !this.tentativeAssignmentActive && this.booking.date && this.booking.startTime) {
			this.loading = true
			requestAnimationFrame(() => {
				this.getTentativeCourtAssignment()
			})
		}
	}

	/**
	 * Handle duration selection
	 */
	private handleDurationSelect(duration: Duration): void {
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

		// Dispatch change event for parent component
		this.dispatchEvent(new CustomEvent('change', { detail: duration }))
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

	render() {
		if (this.hidden) return html``

		// Container classes based on active state
		const containerClasses = {
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'shadow-xs': true,
			'py-6 px-4': this.active && !this.isMobile,
			'py-4 px-3': this.active && this.isMobile,
			'py-3 px-2': !this.active,
		}

		// Loading state - improved with more detailed message
		if (this.loading) {
			return html`
				<div
					class="fixed inset-0 z-50  bg-opacity-70 backdrop-blur-sm flex items-center justify-center transition-opacity duration-300"
				>
					<schmancy-spinner class="h-12 w-12" size="48px"></schmancy-spinner>
				</div>
			`
		}

		// Mobile-optimized active view - horizontal scrolling
		if (this.isMobile) {
			return html`
				<div class=${this.classMap(containerClasses)}>
					<!-- Title section -->
					<div class="mb-3">
						<schmancy-typography type="title" token="md">Select Duration</schmancy-typography>
					</div>

					<!-- Horizontal scrollable duration options -->
					<div class="overflow-x-auto scrollbar-hide pb-2 -mx-2 px-2">
						<div class="flex gap-2 snap-x w-full pb-2">
							${this.durations.map(duration => {
								const isSelected = this.selectedDuration === duration.value
								const isPopular = this.recommendedDuration === duration.value

								return html`
									<div
										@click=${() => this.handleDurationSelect(duration)}
										class="flex-none snap-center flex flex-col items-center justify-center 
                           p-3 rounded-xl cursor-pointer transition-all min-w-20
                           ${isSelected
											? 'bg-primary-default text-primary-on shadow-sm'
											: 'bg-surface-high text-surface-on hover:shadow-sm'}"
									>
										<!-- Popular badge if applicable -->
										${isPopular
											? html`<div
													class="absolute -top-1 -right-1 bg-secondary-default text-secondary-on text-xs 
                                         font-bold px-1 rounded-full"
											  >
													Best
											  </div>`
											: ''}

										<!-- Duration label -->
										<div class="font-medium">${this.getFullLabel(duration)}</div>

										<!-- Price -->
										<div class="font-bold ${isSelected ? 'text-primary-on' : 'text-primary-default'}">
											€${duration.price.toFixed(2)}
										</div>
									</div>
								`
							})}
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
									Pricing based on ${this.tentativeAssignmentFailed ? 'estimated' : 'assigned'} court:
									<span class="font-medium">${this.selectedCourt.name}</span>
							  </p>`
							: ''}
					</div>
				</div>
			`
		}

		// Desktop view - grid layout
		return html`
			<div class=${this.classMap(containerClasses)}>
				<!-- Title section -->
				<div class="mb-2">
					<schmancy-typography type="title" token="md" class="mb-2">Select Duration</schmancy-typography>
				</div>

				<!-- Duration options - Grid layout for desktop -->
				<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
					${this.durations.map(duration => {
						const isSelected = this.selectedDuration === duration.value
						const isPopular = this.recommendedDuration === duration.value

						return html`
							<div
								@click=${() => this.handleDurationSelect(duration)}
								class="relative overflow-hidden flex flex-col items-center justify-center 
                       py-3 px-2 h-24 rounded-xl cursor-pointer transition-all 
                       hover:shadow-md hover:-translate-y-1 group
                       ${isSelected
									? 'bg-primary-default text-primary-on shadow-sm'
									: 'bg-surface-high text-surface-on'}"
							>
								<!-- Popular badge if applicable -->
								${isPopular
									? html`<div
											class="absolute top-0 right-0 bg-secondary-default text-secondary-on text-xs 
                                    font-bold py-0.5 px-1.5 rounded-bl-lg rounded-tr-xl"
									  >
											POPULAR
									  </div>`
									: ''}

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
					})}
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
								Pricing based on ${this.tentativeAssignmentFailed ? 'estimated' : 'assigned'} court:
								<span class="font-medium">${this.selectedCourt.name}</span>
						  </p>`
						: ''}
					${this.tentativeAssignmentFailed && !this.showingEstimatedPrices
						? html`<p class="text-xs text-warning-default mt-1">
								Note: These are court-specific prices, but your actual assigned court may differ.
						  </p>`
						: ''}
				</div>
			</div>
		`
	}
}
