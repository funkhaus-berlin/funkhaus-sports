import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { distinctUntilChanged, filter, map, Observable, shareReplay, startWith, switchMap, takeUntil, tap } from 'rxjs'
import { courtsContext, selectMyCourts } from 'src/admin/venues/courts/context'
import { AvailabilityResponse, AvailabilityService } from 'src/bookingServices/availability'
import { Court } from 'src/db/courts.collection'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../context'

// Import the sport-court-card component
import './sport-court-card'
import { when } from 'lit/directives/when.js'

/**
 * Court selection component for the booking flow
 * Uses the enhanced availability service for efficient data handling
 */
@customElement('court-select-step')
export class CourtSelectStep extends $LitElement() {
	@select(courtsContext) allCourts!: Map<string, Court>
	@select(bookingContext) booking!: Booking

	@select(BookingProgressContext)
	bookingProgress!: BookingProgress

	@state() selectedVenueCourts: Court[] = []
	@state() loading: boolean = true
	@state() error: string | null = null
	@state() availabilityData: AvailabilityResponse | null = null

	// Track the last successful court data fetch for better UX during errors
	private lastSuccessfulData: { courts: Court[]; availabilityData: AvailabilityResponse } | null = null

	// Service for checking court availability
	private availabilityService = new AvailabilityService()

	/**
	 * Determine if compact view should be used based on current step
	 */
	get isCompactView(): boolean {
		return this.bookingProgress.currentStep !== BookingStep.Court
	}

	/**
	 * Set up all reactive subscriptions and initialize component
	 */
	connectedCallback() {
		super.connectedCallback()
		// Set up the court data subscription with proper error handling
		return bookingContext.$.pipe(
			startWith(bookingContext.value),
			takeUntil(this.disconnecting),
			filter(booking => !!booking.date && !!booking.venueId),
			map(booking => ({ date: booking.date, venueId: booking.venueId })),
			distinctUntilChanged((prev, curr) => prev.date === curr.date && prev.venueId === curr.venueId),
			tap(({ date, venueId }) => this.loadCourtsForDate(date, venueId)),
		).subscribe({})
	}

	/**
	 * Load court data for a specific date and venue
	 */
	private loadCourtsForDate(date: string, venueId: string): void {
		this.loading = true
		this.loadCourtData(date, venueId).subscribe({
			next: data => this.handleCourtDataLoaded(data),
			error: err => this.handleCourtDataError(err),
		})
	}

	/**
	 * Handle successful court data loading
	 */
	private handleCourtDataLoaded(data: { courts: Court[]; availabilityData: AvailabilityResponse }): void {
		this.selectedVenueCourts = data.courts
		this.availabilityData = data.availabilityData
		this.lastSuccessfulData = data
		this.loading = false
		this.error = null

		// Announce to screen readers that courts have been loaded
		this.announceForScreenReader(`${this.selectedVenueCourts.length} courts loaded`)
	}

	/**
	 * Handle error during court data loading
	 */
	private handleCourtDataError(err: Error): void {
		console.error('Error loading courts:', err)

		// Use last successful data if available to maintain user experience
		if (this.lastSuccessfulData) {
			this.selectedVenueCourts = this.lastSuccessfulData.courts
			this.availabilityData = this.lastSuccessfulData.availabilityData
			this.error = 'Unable to refresh court data. Showing previously loaded courts.'
		} else {
			this.error = 'Failed to load available courts. Please try again.'
		}

		this.loading = false

		// Announce error to screen readers
		this.announceForScreenReader(this.error)
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
	 * Load court data with availability information using the enhanced service
	 */
	private loadCourtData(
		date: string,
		venueId: string,
	): Observable<{
		courts: Court[]
		availabilityData: AvailabilityResponse
	}> {
		return selectMyCourts.pipe(
			switchMap(courts => {
				// Get availability data from the enhanced service
				return this.availabilityService
					.getVenueAvailability(date, venueId)
					.pipe(map(availabilityData => ({ courts, availabilityData })))
			}),
			map(({ courts, availabilityData }) => {
				// Filter active courts and sort by availability
				const activeCourts = Array.from(courts.values())
					.filter(court => court.status === 'active')
					.sort((a, b) => {
						// Sort by availability (available first), then by name
						const aAvailable = availabilityData.courts[a.id]?.isAvailable !== false
						const bAvailable = availabilityData.courts[b.id]?.isAvailable !== false

						if (aAvailable !== bAvailable) {
							return aAvailable ? -1 : 1
						}

						return a.name.localeCompare(b.name)
					})

				return {
					courts: activeCourts,
					availabilityData,
				}
			}),
			// Share the result to prevent multiple subscription executions
			shareReplay(1),
		)
	}

	/**
	 * Check if a court is available using the enhanced availability data
	 */
	private isCourtAvailable(courtId: string): boolean {
		// Default to true if we don't have availability data
		if (!this.availabilityData) return true

		// Check if the court exists in the availability data and is available
		return this.availabilityData.courts[courtId]?.isAvailable !== false
	}

	/**
	 * Map court type to sport-court-card type
	 */
	private getCourtType(court: Court): 'padel' | 'pickleball' | 'volleyball' {
		// Map your court types to the sport-court-card types
		// Adjust this mapping based on your court type naming convention
		const typeMap: Record<string, 'padel' | 'pickleball' | 'volleyball'> = {
			padel: 'padel',
			pickleball: 'pickleball',
			volleyball: 'volleyball',
			// Add more mappings as needed
		}

		return typeMap[court.sportTypes[0]?.toLowerCase()] || 'pickleball'
	}

	/**
	 * Handle court selection
	 */
	private handleCourtSelect(court: Court): void {
		// Don't allow selecting unavailable courts
		if (!this.isCourtAvailable(court.id)) {
			return
		}

		// Update booking context with selected court
		bookingContext.set({
			...this.booking,
			courtId: court.id,
			startTime: '',
			endTime: '',
		})

		// Advance to next step
		BookingProgressContext.set({
			currentStep: BookingStep.Time,
		})

		// Fire change event for parent components
		this.dispatchEvent(
			new CustomEvent('next', {
				detail: { court },
			}),
		)
	}

	/**
	 * Get container classes based on compact mode
	 */
	private getContainerClasses(): Record<string, boolean> {
		const compact = this.isCompactView
		return {
			'gap-4': !compact,
			'gap-2': compact,
			'py-2': !compact,
			'py-0': compact,
			'transition-all': true,
			'duration-300': true,
		}
	}

	/**
	 * Get court card container classes
	 * Courts now have fixed dimensions based on type, so we just need to ensure
	 * they display consistently in the grid
	 */
	private getCourtCardContainerClasses(): Record<string, boolean> {
		return {
			flex: true,
			'justify-center': true,
			'items-center': true,
			'transition-all': true,
			'duration-300': true,
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
	 * Render empty state (no courts)
	 */
	private renderEmptyState(): unknown {
		return html`
			<div class="text-center py-6">
				<schmancy-icon size="48px" class="text-surface-on-variant opacity-50"> sports_tennis </schmancy-icon>
				<schmancy-typography type="body" token="md" class="mt-2">
					No courts available at this venue.
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
				<schmancy-typography type="body" token="md" class="mt-2"> Loading courts... </schmancy-typography>
			</div>
		`
	}

	/**
	 * Retry loading court data
	 */
	private retryLoading(): void {
		if (this.booking?.date && this.booking?.venueId) {
			this.loadCourtsForDate(this.booking.date, this.booking.venueId)
		}
	}

	/**
	 * Main render method
	 */
	render() {
		if (this.hidden) return html``

		// Show loading state
		if (this.loading && !this.lastSuccessfulData) {
			return this.renderLoadingState()
		}

		// Show error message if present
		if (this.error && !this.lastSuccessfulData) {
			return this.renderErrorState()
		}

		// Show empty state if no courts
		if (this.selectedVenueCourts.length === 0) {
			return this.renderEmptyState()
		}

		// Render main content
		return html`
			<div class="mt-3 bg-surface-container-low rounded-lg px-2">
				${this.error
					? html`
							<div class="bg-error-container p-2 rounded-t-lg text-error-on-container text-sm text-center">
								${this.error}
								<button @click=${() => this.retryLoading()} class="ml-2 underline font-medium">Refresh</button>
							</div>
					  `
					: ''}
				${when(
					!this.isCompactView,
					() => html`
						<schmancy-typography type="label" token="lg" class="font-medium text-primary-default">
							Select Court
						</schmancy-typography>
					`,
				)}
				<div
					class="flex gap-3 ${classMap(this.getContainerClasses())}"
					role="listbox"
					aria-label="Available Courts"
					aria-multiselectable="false"
				>
					${repeat(
						this.selectedVenueCourts,
						court => court.id,
						court => html`
							<div
								class="${classMap(this.getCourtCardContainerClasses())}"
								role="option"
								aria-selected="${this.booking?.courtId === court.id ? 'true' : 'false'}"
								aria-disabled="${!this.isCourtAvailable(court.id) ? 'true' : 'false'}"
							>
								<sport-court-card
									id="${court.id}"
									name="${court.name}"
									type="${this.getCourtType(court)}"
									.selected="${this.booking?.courtId === court.id}"
									.disabled="${!this.isCourtAvailable(court.id)}"
									.compact="${this.isCompactView}"
									@court-click="${() => this.handleCourtSelect(court)}"
								></sport-court-card>
							</div>
						`,
					)}
				</div>
			</div>
		`
	}
}

// Register the element in the global namespace
declare global {
	interface HTMLElementTagNameMap {
		'court-select-step': CourtSelectStep
	}
}
