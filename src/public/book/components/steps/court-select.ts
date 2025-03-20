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

// Import the enhanced availability coordinator
import {
	CourtAvailabilityStatus,
	enhancedAvailabilityCoordinator,
} from 'src/bookingServices/enhanced-availability-coordinator'

import { when } from 'lit/directives/when.js'
import './sport-court-card'

/**
 * Updated Court selection component for the booking flow
 * Shows availability based on selected date, time, and duration
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

	// New state to track court availability statuses
	@state() courtAvailability: Map<string, CourtAvailabilityStatus> = new Map()

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
		enhancedAvailabilityCoordinator.error$
			.pipe(
				takeUntil(this.disconnecting),
				filter(error => !!error),
			)
			.subscribe(error => {
				this.error = error
				this.requestUpdate()
			})

		// Subscribe to availability coordinator loading state
		enhancedAvailabilityCoordinator.loading$.pipe(takeUntil(this.disconnecting)).subscribe(loading => {
			this.loading = loading
			this.requestUpdate()
		})

		// Set up the court data subscription with improved error handling
		bookingContext.$.pipe(
			startWith(bookingContext.value),
			takeUntil(this.disconnecting),
			filter(booking => !!booking.date && !!booking.venueId && !!booking.startTime && !!booking.endTime),
			map(booking => ({
				date: booking.date,
				venueId: booking.venueId,
				startTime: booking.startTime,
				endTime: booking.endTime,
			})),
			distinctUntilChanged(
				(prev, curr) =>
					prev.date === curr.date &&
					prev.venueId === curr.venueId &&
					prev.startTime === curr.startTime &&
					prev.endTime === curr.endTime,
			),
			tap(booking => this.loadCourtsWithAvailability(booking)),
		).subscribe({
			error: err => {
				console.error('Error in booking subscription:', err)
				this.error = 'Failed to load court availability data'
				this.loading = false
				this.requestUpdate()
			},
		})
	}

	/**
	 * Load courts with availability information for selected date, time, and duration
	 */
	private loadCourtsWithAvailability(booking: {
		date: string
		venueId: string
		startTime: string
		endTime: string
	}): void {
		this.loading = true
		this.error = null

		try {
			// Calculate duration in minutes from startTime and endTime
			const startTime = new Date(booking.startTime)
			const endTime = new Date(booking.endTime)
			const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000)

			// Get court availability statuses from the coordinator
			const courtAvailabilities = enhancedAvailabilityCoordinator.getAllCourtsAvailability(
				booking.startTime,
				durationMinutes,
			)

			// Create map of court ID to availability status for efficient lookups
			const availabilityMap = new Map<string, CourtAvailabilityStatus>()
			courtAvailabilities.forEach(status => {
				availabilityMap.set(status.courtId, status)
			})

			// Store the map in state
			this.courtAvailability = availabilityMap

			// Load the court data
			this.loadCourtData(booking.date, booking.venueId).subscribe({
				next: courts => this.handleCourtDataLoaded(courts),
				error: err => this.handleCourtDataError(err),
			})
		} catch (error) {
			console.error('Error loading court availability:', error)
			this.error = 'Failed to check court availability. Please try again.'
			this.loading = false
			this.requestUpdate()
		}
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
				// Sort courts by availability using our availability map
				return courts.sort((a, b) => {
					// Get availability statuses from our map
					const aStatus = this.courtAvailability.get(a.id)
					const bStatus = this.courtAvailability.get(b.id)

					// Sort fully available courts first
					if (aStatus?.fullyAvailable !== bStatus?.fullyAvailable) {
						return aStatus?.fullyAvailable ? -1 : 1
					}

					// Then sort by partial availability
					if (aStatus?.available !== bStatus?.available) {
						return aStatus?.available ? -1 : 1
					}

					// Finally sort by name
					return a.name.localeCompare(b.name)
				})
			}),
			// Share the result to prevent multiple subscription executions
			shareReplay(1),
		)
	}

	/**
	 * Get court availability status based on our availability map
	 */
	private getCourtAvailabilityStatus(courtId: string): 'full' | 'partial' | 'none' {
		const status = this.courtAvailability.get(courtId)

		if (!status) return 'none'

		if (status.fullyAvailable) return 'full'

		if (status.available) return 'partial'

		return 'none'
	}

	/**
	 * Check if a court can be selected based on availability
	 */
	private canSelectCourt(courtId: string): boolean {
		const status = this.courtAvailability.get(courtId)
		// Allow selection if at least partially available
		return status?.available === true
	}

	/**
	 * Get partially available time info for display
	 */
	private getPartialAvailabilityInfo(courtId: string): string {
		const status = this.courtAvailability.get(courtId)
		if (!status || !status.available || status.fullyAvailable) return ''

		// Return the number of available slots out of total
		return `${status.availableTimeSlots.length}/${
			status.availableTimeSlots.length + status.unavailableTimeSlots.length
		} slots`
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
		if (!this.canSelectCourt(court.id)) {
			return
		}

		// Update booking context with selected court
		bookingContext.set({
			...this.booking,
			courtId: court.id,
		})

		// Advance to Payment step
		BookingProgressContext.set({
			currentStep: BookingStep.Payment,
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
		enhancedAvailabilityCoordinator.refreshData()

		// Then reload courts with availability
		if (this.booking?.date && this.booking?.venueId && this.booking?.startTime && this.booking?.endTime) {
			this.loadCourtsWithAvailability({
				date: this.booking.date,
				venueId: this.booking.venueId,
				startTime: this.booking.startTime,
				endTime: this.booking.endTime,
			})
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
	 * Get court card container classes based on availability
	 */
	private getCourtCardContainerClasses(courtId: string): Record<string, boolean> {
		const availabilityStatus = this.getCourtAvailabilityStatus(courtId)

		return {
			flex: true,
			'justify-center': true,
			'items-center': true,
			'transition-all': true,
			'duration-300': true,
			relative: true, // For availability indicator
			'opacity-50': availabilityStatus === 'none',
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
	 * Render availability badge on court card based on status
	 */
	private renderAvailabilityBadge(courtId: string): unknown {
		const status = this.getCourtAvailabilityStatus(courtId)

		if (status === 'full') {
			return html`
				<div
					class="absolute top-0 right-0 m-1 px-2 py-0.5 bg-success-default text-success-on rounded-full text-xs font-medium"
				>
					Available
				</div>
			`
		}

		if (status === 'partial') {
			const info = this.getPartialAvailabilityInfo(courtId)
			return html`
				<div
					class="absolute top-0 right-0 m-1 px-2 py-0.5 bg-warning-default text-warning-on rounded-full text-xs font-medium flex items-center"
				>
					<schmancy-icon size="12px" class="mr-1">warning</schmancy-icon>
					<span>Partial ${info}</span>
				</div>
			`
		}

		return html`
			<div
				class="absolute top-0 right-0 m-1 px-2 py-0.5 bg-error-container text-error-on-container rounded-full text-xs font-medium flex items-center"
			>
				<schmancy-icon size="12px" class="mr-1">block</schmancy-icon>
				<span>Unavailable</span>
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
						<div class="text-xs text-surface-on-variant mt-1 mb-2">
							Select a court for your ${this.booking?.startTime ? 'selected time slot' : 'booking'}
						</div>
					`,
				)}
				<div
					class="flex flex-wrap justify-between gap-3 ${classMap(this.getContainerClasses())}"
					role="listbox"
					aria-label="Available Courts"
					aria-multiselectable="false"
				>
					${repeat(
						this.selectedVenueCourts,
						court => court.id,
						court => html`
							<div
								class="${classMap(this.getCourtCardContainerClasses(court.id))}"
								role="option"
								aria-selected="${this.booking?.courtId === court.id ? 'true' : 'false'}"
								aria-disabled="${!this.canSelectCourt(court.id) ? 'true' : 'false'}"
							>
								<!-- Availability badge -->
								${this.renderAvailabilityBadge(court.id)}

								<sport-court-card
									id="${court.id}"
									name="${court.name}"
									type="${this.getCourtType(court)}"
									.selected="${this.booking?.courtId === court.id}"
									.disabled="${!this.canSelectCourt(court.id)}"
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
