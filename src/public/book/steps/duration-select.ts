import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import {
	BehaviorSubject,
	catchError,
	debounceTime,
	filter,
	finalize,
	fromEvent,
	Observable,
	of,
	Subscription,
	switchMap,
	takeUntil,
	timeout,
} from 'rxjs'
import { venuesContext } from 'src/admin/venues/venue-context'
import { AvailabilityService } from 'src/bookingServices/availability'
import { CourtAssignmentService } from 'src/bookingServices/court-assignment.service'
import { pricingService } from 'src/bookingServices/dynamic-pricing-service'
import { OperatingHours, Venue } from 'src/db/venue-collection'
import { courtsContext } from '../../../admin/venues/courts/context'
import { Court } from '../../../db/courts.collection'
import { Booking, bookingContext } from '../context'
import { PreferencesHelper } from '../preferences-helper'
import { TentativeCourtAssignment } from '../tentative-court-assignment'
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
	@state() selectedVenue?: Venue = undefined

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

	// Maximum number of retries and timeout values
	private readonly MAX_RETRIES = 2
	private readonly RETRY_DELAY = 500
	private readonly COURT_ASSIGNMENT_TIMEOUT = 5000

	// Court assignment request state
	private courtAssignment$ = new BehaviorSubject<{ active: boolean; timestamp: number }>({
		active: false,
		timestamp: 0,
	})

	// Subscriptions for cleanup
	private resizeSubscription?: Subscription
	private courtAssignmentSubscription?: Subscription

	// Services
	private availabilityService = new AvailabilityService()
	private courtAssignmentService = new CourtAssignmentService(this.availabilityService)
	private tentativeCourtAssignment = new TentativeCourtAssignment(this.courtAssignmentService)

	connectedCallback() {
		super.connectedCallback()

		// Set up responsive design handling
		this.resizeSubscription = fromEvent(window, 'resize')
			.pipe(debounceTime(100), takeUntil(this.disconnecting))
			.subscribe(() => this.handleResize())

		// Set up court assignment state handling
		this.courtAssignmentSubscription = this.courtAssignment$
			.pipe(
				takeUntil(this.disconnecting),
				debounceTime(50), // Debounce to prevent multiple rapid changes
				filter(state => state.active), // Only process when active
				switchMap(state => {
					// Check if we're already in a loading state for too long
					const now = Date.now()
					if (now - state.timestamp > 10000) {
						console.warn('Court assignment has been active for too long, forcing reset')
						return of({
							success: false,
							court: null,
							error: 'Timeout occurred while finding an available court',
						})
					}

					// Set loading state
					this.loading = true
					this.error = null

					// Get tentative court assignment
					return this.getTentativeCourtAssignment().pipe(
						timeout(this.COURT_ASSIGNMENT_TIMEOUT),
						catchError(error => {
							console.error('Error in court assignment observable:', error)
							return of({
								success: false,
								court: null,
								error: 'Failed to find an available court',
							})
						}),
						finalize(() => {
							// Always reset the court assignment state when finished
							this.courtAssignment$.next({ active: false, timestamp: 0 })
						}),
					)
				}),
			)
			.subscribe({
				next: result => {
					// Process result and update state
					this.handleCourtAssignmentResult(result)
					this.loading = false
				},
				error: err => {
					console.error('Unexpected error in court assignment subscription:', err)
					this.loading = false
					this.tentativeAssignmentFailed = true
					this.showingEstimatedPrices = true
					this.fallbackToEstimatedPrices()
				},
			})

		// Set estimated prices initially as fallback
		this.setEstimatedPrices()
	}

	disconnectedCallback() {
		super.disconnectedCallback()

		// Clean up all subscriptions
		if (this.resizeSubscription) {
			this.resizeSubscription.unsubscribe()
		}
		if (this.courtAssignmentSubscription) {
			this.courtAssignmentSubscription.unsubscribe()
		}
	}

	firstUpdated(_changedProperties: PropertyValues): void {
		super.firstUpdated(_changedProperties)

		// Calculate current duration from booking
		this.calculateDurationFromBooking()

		// Set loading immediately if step is active
		if (this.active && !this.tentativeAssignmentActive) {
			this.loading = true

			// Trigger court assignment after a short delay
			setTimeout(() => {
				this.startCourtAssignment()
			}, 100)
		}

		// Update durations based on booking data and selected court
		this.updateDurations()
	}

	updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties)

		// If booking or courts context changes, recalculate
		if (changedProperties.has('booking') || changedProperties.has('courts')) {
			this.calculateDurationFromBooking()
			this.updateDurations()
		}

		// When this step becomes active, try to get a tentative court assignment
		if (
			changedProperties.has('active') &&
			this.active &&
			!this.tentativeAssignmentActive &&
			!this.courtAssignment$.getValue().active
		) {
			// Set loading state immediately for better UX
			this.loading = true

			// Start court assignment with a short delay to allow UI updates
			setTimeout(() => {
				this.startCourtAssignment()
			}, 100)
		}
	}

	/**
	 * Start the court assignment process with proper state tracking
	 */
	private startCourtAssignment(): void {
		// Only start if we have necessary booking data
		if (!this.booking.date || !this.booking.startTime) {
			console.log('Cannot start court assignment without date and time')
			this.loading = false
			return
		}

		// Trigger the court assignment
		this.courtAssignment$.next({
			active: true,
			timestamp: Date.now(),
		})
	}

	/**
	 * Process the result of a court assignment attempt
	 */
	private handleCourtAssignmentResult(result: { success: boolean; court: Court | null; error?: string }): void {
		if (result.success && result.court) {
			this.selectedCourt = result.court
			this.updateDurationPrices(result.court)
			this.showingEstimatedPrices = false
			this.retryCount = 0
			this.tentativeAssignmentActive = true
			this.tentativeAssignmentFailed = false
		} else {
			// Handle failure with potential retry
			this.tentativeAssignmentFailed = true

			// If we haven't reached max retries, try again after delay
			if (this.retryCount < this.MAX_RETRIES) {
				this.retryCount++
				console.log(`Retrying court assignment (${this.retryCount}/${this.MAX_RETRIES})...`)

				// Use exponential backoff for retries
				const delay = this.RETRY_DELAY * Math.pow(2, this.retryCount - 1)

				setTimeout(() => {
					if (this.active) {
						this.startCourtAssignment()
					}
				}, delay)

				// Keep loading state active during retry
				this.loading = true
			} else {
				// All retries failed, use fallback approach
				this.fallbackToAlternativeCourt()
			}
		}
	}

	/**
	 * Try to find any active court as a fallback
	 */
	private fallbackToAlternativeCourt(): void {
		const availableCourts = Array.from(this.courts.values()).filter(c => c.status === 'active')

		if (availableCourts.length > 0) {
			// Use the first active court for pricing
			const anyCourt = availableCourts[0]
			this.selectedCourt = anyCourt
			this.updateDurationPrices(anyCourt)
			this.showingEstimatedPrices = false
			console.log('Using fallback court for pricing:', anyCourt.name)
			this.tentativeAssignmentActive = true
		} else {
			// No active courts at all, use estimated prices
			this.fallbackToEstimatedPrices()
		}
	}

	/**
	 * Fallback to estimated prices when no court can be found
	 */
	private fallbackToEstimatedPrices(): void {
		this.showingEstimatedPrices = true
		this.tentativeAssignmentActive = true
		this.loading = false
		console.log('Using estimated prices as fallback')
		this.setEstimatedPrices()
	}

	/**
	 * Set estimated prices based on standard court rates
	 */
	private setEstimatedPrices(): void {
		// Get a baseline hourly rate
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
	 * Get tentative court assignment as an Observable
	 */
	private getTentativeCourtAssignment(): Observable<{
		success: boolean
		court: Court | null
		error?: string
	}> {
		return new Observable(observer => {
			// Get time in minutes since midnight
			const startTime = dayjs(this.booking.startTime)
			const startMinutes = startTime.hour() * 60 + startTime.minute()

			// Get available courts
			const availableCourts = Array.from(this.courts.values()).filter(c => c.status === 'active')

			if (availableCourts.length === 0) {
				observer.next({
					success: false,
					court: null,
					error: 'No active courts available',
				})
				observer.complete()
				return
			}

			// Get user preferences
			const preferences = PreferencesHelper.getPreferences()

			// Async operation to find court
			this.tentativeCourtAssignment
				.findBestMatchingCourt(this.booking.date, startMinutes, availableCourts, preferences)
				.then(court => {
					if (court) {
						observer.next({
							success: true,
							court,
						})
					} else {
						observer.next({
							success: false,
							court: null,
							error: 'No court available for tentative assignment',
						})
					}
					observer.complete()
				})
				.catch(error => {
					observer.next({
						success: false,
						court: null,
						error: error.message || 'Error finding available court',
					})
					observer.complete()
				})

			// Return unsubscribe function - nothing to clean up here
			return { unsubscribe: () => {} }
		})
	}

	/**
	 * Update prices based on the assigned court
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
		// If we already have a courtId in the booking, use that court
		if (this.booking.courtId && this.courts && this.courts.get(this.booking.courtId)) {
			const courtFromId = this.courts.get(this.booking.courtId)
			if (courtFromId) {
				this.selectedCourt = courtFromId
				this.tentativeAssignmentActive = true
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
		}
	}

	/**
	 * Handle duration selection
	 */
	private handleDurationSelect(duration: Duration): void {
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

		// Dispatch change event for parent component
		this.dispatchEvent(new CustomEvent('change', { detail: duration }))
		setTimeout(() => {
			this.loading = false
		}, 3000)
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

	// Error handling property
	private get error(): string | null {
		return this._error
	}

	private set error(value: string | null) {
		this._error = value
		this.requestUpdate()
	}

	private _error: string | null = null

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

		// Mobile-optimized active view - horizontal scrolling
		if (this.isMobile) {
			return html`
				${when(
					this.loading,
					() => html`
						<div
							class="fixed inset-0 z-50 bg-opacity-70 backdrop-blur-sm flex items-center justify-center transition-opacity duration-300"
						>
							<schmancy-spinner class="h-12 w-12" size="48px"></schmancy-spinner>
						</div>
					`,
				)}
				<div class=${this.classMap(containerClasses)}>
					<!-- Title section -->
					<div class="mb-3">
						<schmancy-typography type="title" token="md">Select Duration</schmancy-typography>
					</div>

					${when(
						this.error,
						() => html`
							<div class="mb-3 p-2 bg-error-container text-error-onContainer rounded">
								<schmancy-typography type="body" token="sm">${this.error}</schmancy-typography>
							</div>
						`,
					)}

					<!-- Horizontal scrollable duration options -->
					<div class="overflow-x-auto scrollbar-hide pb-2 -mx-2 px-2">
						<div class="flex gap-2 snap-x w-full pb-2">
							${this.durations.map(duration => {
								const isSelected = this.selectedDuration === duration.value

								return html`
									<div
										@click=${() => this.handleDurationSelect(duration)}
										class="flex-none snap-center flex flex-col items-center justify-center 
                       p-3 rounded-xl cursor-pointer transition-all min-w-20
                       ${isSelected
											? 'bg-primary-default text-primary-on shadow-sm'
											: 'bg-surface-high text-surface-on hover:shadow-sm'}"
									>
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
			${when(
				this.loading,
				() => html`
					<div
						class="fixed inset-0 z-50 bg-opacity-70 backdrop-blur-sm flex items-center justify-center transition-opacity duration-300"
					>
						<schmancy-spinner class="h-12 w-12" size="48px"></schmancy-spinner>
					</div>
				`,
			)}
			<div class=${this.classMap(containerClasses)}>
				<!-- Title section -->
				<div class="mb-2">
					<schmancy-typography type="title" token="md" class="mb-2">Select Duration</schmancy-typography>
				</div>

				${when(
					this.error,
					() => html`
						<div class="mb-3 p-2 bg-error-container text-error-onContainer rounded">
							<schmancy-typography type="body" token="sm">${this.error}</schmancy-typography>
						</div>
					`,
				)}

				<!-- Duration options - Grid layout for desktop -->
				<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
					${this.durations.map(duration => {
						const isSelected = this.selectedDuration === duration.value

						return html`
							<div
								@click=${() => this.handleDurationSelect(duration)}
								class="relative overflow-hidden flex flex-col items-center justify-center 
                   py-3 px-2 h-24 rounded-xl cursor-pointer transition-all 
                   hover:shadow-md hover:-translate-y-1 group
                   ${isSelected ? 'bg-primary-default text-primary-on shadow-sm' : 'bg-surface-high text-surface-on'}"
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
