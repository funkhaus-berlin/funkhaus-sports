import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { distinctUntilChanged, filter, map, shareReplay, startWith, takeUntil, tap } from 'rxjs'
import { courtsContext, selectMyCourts } from 'src/admin/venues/courts/context'
import { Court } from 'src/db/courts.collection'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'

// Import the sport-court-card component
import { when } from 'lit/directives/when.js'
import { availabilityCoordinator } from 'src/bookingServices/availability-coordinator'
import './sport-court-card'

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

	// Track the last successful court data fetch for better UX during errors
	private lastSuccessfulData: { courts: Court[] } | null = null

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

		// Subscribe to availability coordinator errors
		availabilityCoordinator.error$
			.pipe(
				takeUntil(this.disconnecting),
				filter(error => !!error),
			)
			.subscribe(error => {
				this.error = error
				this.requestUpdate()
			})

		// Subscribe to availability coordinator loading state
		availabilityCoordinator.loading$.pipe(takeUntil(this.disconnecting)).subscribe(loading => {
			this.loading = loading
			this.requestUpdate()
		})

		// Set up the court data subscription with improved error handling
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
			next: courts => this.handleCourtDataLoaded(courts),
			error: err => this.handleCourtDataError(err),
		})
	}

	/**
	 * Handle successful court data loading
	 */
	private handleCourtDataLoaded(courts: Court[]): void {
		this.selectedVenueCourts = courts
		this.lastSuccessfulData = { courts }
		this.loading = false
		this.error = null
		this.requestUpdate()

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
	private loadCourtData(date: string, venueId: string) {
		return selectMyCourts.pipe(
			map(courts => Array.from(courts.values())),
			map(courts => {
				// Filter active courts for this venue
				return courts.filter(court => court.status === 'active' && court.venueId === venueId)
			}),
			map(courts => {
				// Sort courts by availability using the coordinator
				const availabilityData = availabilityCoordinator.availabilityData$.value

				// If we have availability data, use it for sorting
				if (availabilityData) {
					return courts.sort((a, b) => {
						// Sort by availability (available first), then by name
						const aAvailable = this.isCourtAvailable(a.id)
						const bAvailable = this.isCourtAvailable(b.id)

						if (aAvailable !== bAvailable) {
							return aAvailable ? -1 : 1
						}

						return a.name.localeCompare(b.name)
					})
				}

				// Otherwise just sort by name
				return courts.sort((a, b) => a.name.localeCompare(b.name))
			}),
			// Share the result to prevent multiple subscription executions
			shareReplay(1),
		)
	}

	/**
	 * Check if a court is available using the enhanced availability data
	 */
	private isCourtAvailable(courtId: string): boolean {
		// Use the availability coordinator to check court availability
		// This ensures consistent availability checking across components
		const availabilityData = availabilityCoordinator.availabilityData$.value

		// Default to true if we don't have availability data
		if (!availabilityData) return true

		// Check if the court exists in the availability data and is available
		if (availabilityData.courts && availabilityData.courts[courtId]) {
			return availabilityData.courts[courtId].isAvailable === true
		}

		// Default to true if court isn't in the data
		return true
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

	private retryLoading(): void {
		// Force a refresh of availability data
		availabilityCoordinator.refreshData()

		// Then reload courts
		if (this.booking?.date && this.booking?.venueId) {
			this.loadCourtsForDate(this.booking.date, this.booking.venueId)
		}
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
	 * Main render method
	 */
	render() {
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
