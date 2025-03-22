import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { distinctUntilChanged, filter, map, takeUntil } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { availabilityContext, CourtAvailabilityStatus, getAllCourtsAvailability } from 'src/availability-context'
import { Court, SportTypeEnum } from 'src/db/courts.collection'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'
import './court-availability-dialog'
import './court-map-view'
import './sport-court-card'

/**
 * View modes for court selection
 */
enum ViewMode {
	LIST = 'list',
	MAP = 'map',
}

type AvailabilityStatus = 'full' | 'partial' | 'none'

/**
 * Enhanced Court Selection Component with Map View
 *
 * Extends the existing court selection with a map view option
 * allowing users to visualize and select courts on a map
 */
@customElement('court-select-step')
export class CourtSelectStep extends $LitElement(css`
	/* Animation for selected elements */
	@keyframes pulse {
		0% {
			transform: scale(1);
			box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5);
		}

		70% {
			transform: scale(1.05);
			box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
		}

		100% {
			transform: scale(1);
			box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
		}
	}

	.pulse-animation {
		animation: pulse 1.5s ease-out;
	}

	/* View toggle styles */
	.view-toggle-btn {
		padding: 0.5rem;
		border-radius: 0.375rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.view-toggle-btn.active {
		background-color: var(--schmancy-sys-color-primary-container, #e0e7ff);
		color: var(--schmancy-sys-color-primary-default, #4f46e5);
	}

	.view-toggle-container {
		background-color: var(--schmancy-sys-color-surface-variant, #f3f4f6);
		border-radius: 0.375rem;
		padding: 0.25rem;
		display: flex;
		gap: 0.25rem;
	}
`) {
	@select(courtsContext, undefined, { required: true })
	allCourts!: Map<string, Court>

	@select(bookingContext, undefined, { required: true })
	booking!: Booking

	@select(BookingProgressContext, undefined, { required: true })
	bookingProgress!: BookingProgress

	// Add availability context
	@select(availabilityContext, undefined, { required: true })
	availability!: any

	@state() selectedVenueCourts: Court[] = []
	@state() loading: boolean = true
	@state() error: string | null = null

	// Court availability statuses
	@state() courtAvailability: Map<string, CourtAvailabilityStatus> = new Map()

	// State for confirmation dialog
	@state() showConfirmationDialog: boolean = false
	@state() pendingCourtSelection: Court | null = null

	// New state for view mode
	@state() viewMode: ViewMode = ViewMode.LIST

	// Track the last successful court data fetch for better UX during errors
	private lastSuccessfulData: { courts: Court[] } | null = null

	/**
	 * Toggle between list and map views
	 */
	private toggleViewMode(mode: ViewMode): void {
		this.viewMode = mode
		this.requestUpdate()
	}

	/**
	 * Determine if compact view should be used based on current step
	 */
	get isCompactView(): boolean {
		return this.bookingProgress.currentStep !== BookingStep.Court
	}

	/**
	 * Connect to the component lifecycle
	 */
	connectedCallback(): void {
		super.connectedCallback()

		// Subscribe to availability context for court status
		this.subscribeToAvailabilityUpdates()
	}

	/**
	 * Set up subscriptions to booking and availability data
	 */
	private subscribeToAvailabilityUpdates(): void {
		// Subscribe to booking context changes
		bookingContext.$.pipe(
			takeUntil(this.disconnecting),
			filter(booking => !!booking), // Ensure booking exists
			// Listen for changes to start time, end time, or other relevant properties
			map(booking => ({
				startTime: booking.startTime,
				endTime: booking.endTime,
				date: booking.date,
				venueId: booking.venueId,
			})),
			distinctUntilChanged(
				(prev, curr) =>
					prev.startTime === curr.startTime &&
					prev.endTime === curr.endTime &&
					prev.date === curr.date &&
					prev.venueId === curr.venueId,
			),
		).subscribe(() => {
			console.log('Booking changes detected, reloading court availability')
			this.loadCourtsWithAvailability()
		})

		// Subscribe to availability context changes
		availabilityContext.$.pipe(
			takeUntil(this.disconnecting),
			filter(availability => !!availability && !!this.booking?.date),
			// Only reload when availability for our current date changes
			filter(availability => availability.date === this.booking.date),
		).subscribe(() => {
			console.log('Availability context updated, reloading court availability')
			this.loadCourtsWithAvailability()
		})

		// Initial load
		this.loadCourtsWithAvailability()
	}

	/**
	 * Update when relevant properties change
	 */
	updated(changedProperties: Map<string, unknown>): void {
		// If booking data changed and we have necessary data, reload
		if (
			(changedProperties.has('booking') || changedProperties.has('bookingProgress')) &&
			this.booking?.startTime &&
			this.booking?.endTime
		) {
			this.loadCourtsWithAvailability()
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
	 * Check if a court can be selected based on availability
	 */
	private canSelectCourt(courtId: string): boolean {
		const status = this.courtAvailability.get(courtId)
		// Allow selection if at least partially available
		return !!status?.available
	}

	/**
	 * Get court availability status
	 */
	private getCourtAvailabilityStatus(courtId: string): AvailabilityStatus {
		const status = this.courtAvailability.get(courtId)

		if (!status) return 'none'

		if (status.fullyAvailable) return 'full'

		if (status.available) return 'partial'

		return 'none'
	}

	/**
	 * Retry loading courts
	 */
	private retryLoading(): void {
		// Trigger a reload of courts with availability
		this.loadCourtsWithAvailability()
	}

	/**
	 * Load courts with availability data
	 */
	private loadCourtsWithAvailability(): void {
		this.loading = true
		this.error = null

		try {
			// Get court availability statuses from the availability context
			const courtAvailabilities = getAllCourtsAvailability(this.booking.startTime, this.calculateDuration())

			// Create map of court ID to availability status for efficient lookups
			const availabilityMap = new Map<string, CourtAvailabilityStatus>()
			courtAvailabilities.forEach(status => {
				availabilityMap.set(status.courtId, status)
			})

			// Store the map in state
			this.courtAvailability = availabilityMap

			// Load venue courts
			const venueCourts = Array.from(this.allCourts.values()).filter(
				court => court.status === 'active' && court.venueId === this.booking.venueId,
			)

			// Sort courts by availability
			const sortedCourts = venueCourts.sort((a, b) => {
				// Get availability statuses
				const aStatus = availabilityMap.get(a.id)
				const bStatus = availabilityMap.get(b.id)

				// Sort fully available courts first
				if ((aStatus?.fullyAvailable || false) !== (bStatus?.fullyAvailable || false)) {
					return aStatus?.fullyAvailable || false ? -1 : 1
				}

				// Then sort by partial availability
				if ((aStatus?.available || false) !== (bStatus?.available || false)) {
					return aStatus?.available || false ? -1 : 1
				}

				// Finally sort by name
				return a.name.localeCompare(b.name)
			})

			this.selectedVenueCourts = sortedCourts
			this.lastSuccessfulData = { courts: sortedCourts }
			this.loading = false
			this.error = null
			this.requestUpdate()
		} catch (error) {
			console.error('Error loading court availability:', error)

			// Use last successful data if available
			if (this.lastSuccessfulData) {
				this.selectedVenueCourts = this.lastSuccessfulData.courts
				this.error = 'Unable to refresh court data. Showing previously loaded courts.'
			} else {
				this.error = 'Failed to load available courts. Please try again.'
			}

			this.loading = false
			this.requestUpdate()
		}
	}

	/**
	 * Calculate current duration from booking start and end times
	 */
	private calculateDuration(): number {
		if (!this.booking.startTime || !this.booking.endTime) {
			return 0
		}

		try {
			const start = dayjs(this.booking.startTime)
			const end = dayjs(this.booking.endTime)
			return end.diff(start, 'minute')
		} catch (e) {
			console.error('Error calculating duration:', e)
			return 0
		}
	}

	/**
	 * Confirm court selection with chosen time option
	 */
	private confirmCourtSelection(
		court: Court,
		option: 'partial' | 'alternative' | 'original' = 'original',
		timeSlot?: { start: string; end: string },
	): void {
		// Create booking update object
		const bookingUpdate = {
			...this.booking,
			courtId: court.id,
		}

		// If using an alternative time slot, adjust booking times
		if (timeSlot && (option === 'partial' || option === 'alternative')) {
			// Create Date objects for the start and end times
			const bookingDate = dayjs(this.booking.date).format('YYYY-MM-DD')
			const startTime = dayjs(`${bookingDate}T${timeSlot.start}:00`)
			const endTime = dayjs(`${bookingDate}T${timeSlot.end}:00`)

			// Update booking with adjusted times
			bookingUpdate.startTime = startTime.toISOString()
			bookingUpdate.endTime = endTime.toISOString()

			// Log the time adjustment
			console.log(`Adjusted booking time to ${option} slot: ${timeSlot.start} - ${timeSlot.end}`)
		}

		// Update booking context with selected court and adjusted times
		bookingContext.set(bookingUpdate)

		// Reset dialog state
		this.pendingCourtSelection = null
		this.showConfirmationDialog = false

		// Advance to Payment step
		BookingProgressContext.set({
			currentStep: BookingStep.Payment,
		})

		// Animate the selected court if in list view
		if (this.viewMode === ViewMode.LIST) {
			setTimeout(() => {
				const selectedCourtElement = this.shadowRoot?.querySelector(`[data-court-id="${court.id}"]`)
				if (selectedCourtElement) {
					selectedCourtElement.classList.add('pulse-animation')
				}
			}, 50)
		}

		// Fire change event for parent components
		this.dispatchEvent(
			new CustomEvent('next', {
				detail: {
					court,
					timeOption: option,
					adjustedTimes: option !== 'original',
				},
			}),
		)
	}

	/**
	 * Handle court selection
	 */
	private handleCourtSelect(court: Court): void {
		// Don't allow selecting unavailable courts
		if (!this.canSelectCourt(court.id)) {
			return
		}

		// Check if court is partially available
		const availabilityStatus = this.getCourtAvailabilityStatus(court.id)

		if (availabilityStatus === 'partial') {
			// Show confirmation dialog for partially available courts
			this.pendingCourtSelection = court
			this.showConfirmationDialog = true
			return
		}

		// For fully available courts, proceed directly
		this.confirmCourtSelection(court)
	}

	/**
	 * Handle dialog events
	 */
	/**
	 * Update this method in your court-select-step.ts file to ensure correct handling of options
	 */
	private handleDialogConfirm(e: CustomEvent): void {
		const { court, option, timeSlot } = e.detail
		console.log('Confirm selection:', option, timeSlot)

		if (!court || !option) {
			console.error('Missing required confirmation details')
			return
		}

		// Create booking update object
		const bookingUpdate = {
			...this.booking,
			courtId: court.id,
		}

		// If using a time slot option, adjust booking times
		if (timeSlot && (option === 'partial' || option === 'alternative' || option === 'extended')) {
			// Create Date objects for the start and end times
			const bookingDate = dayjs(this.booking.date).format('YYYY-MM-DD')
			const startTime = dayjs(`${bookingDate}T${timeSlot.start}:00`)
			const endTime = dayjs(`${bookingDate}T${timeSlot.end}:00`)

			// Update booking with adjusted times
			bookingUpdate.startTime = startTime.toISOString()
			bookingUpdate.endTime = endTime.toISOString()

			// Calculate new price based on duration ratio if using partial option
			if (option === 'partial') {
				const originalDuration = this.calculateDuration()
				const newDuration = endTime.diff(startTime, 'minute')
				const priceRatio = newDuration / originalDuration

				if (this.booking.price) {
					bookingUpdate.price = Math.round(this.booking.price * priceRatio)
				}
			}

			// Log the time adjustment
			console.log(`Adjusted booking time to ${option} slot: ${timeSlot.start} - ${timeSlot.end}`)
		}

		// Update booking context with selected court and adjusted times
		bookingContext.set(bookingUpdate)

		// Reset dialog state
		this.pendingCourtSelection = null
		this.showConfirmationDialog = false

		// Advance to Payment step
		BookingProgressContext.set({
			currentStep: BookingStep.Payment,
		})

		// Animate the selected court if in list view
		if (this.viewMode === ViewMode.LIST) {
			setTimeout(() => {
				const selectedCourtElement = this.shadowRoot?.querySelector(`[data-court-id="${court.id}"]`)
				if (selectedCourtElement) {
					selectedCourtElement.classList.add('pulse-animation')
				}
			}, 50)
		}

		// Fire change event for parent components
		this.dispatchEvent(
			new CustomEvent('next', {
				detail: {
					court,
					timeOption: option,
					adjustedTimes: option !== 'original',
					timeSlot,
				},
			}),
		)
	}

	private handleDialogCancel(): void {
		this.cancelCourtSelection()
	}

	/**
	 * Cancel court selection from dialog
	 */
	private cancelCourtSelection(): void {
		this.pendingCourtSelection = null
		this.showConfirmationDialog = false
	}
	/**
	 * Render the map or list view based on current view mode
	 */
	render() {
		// Show loading state
		if (this.loading && !this.lastSuccessfulData) {
			return html`
				<div class="text-center py-6">
					<div
						class="inline-block w-8 h-8 border-4 border-t-primary-default border-r-outlineVariant border-b-outlineVariant border-l-outlineVariant rounded-full animate-spin"
					></div>
					<schmancy-typography type="body" token="md" class="mt-2"> Loading courts... </schmancy-typography>
				</div>
			`
		}

		// Show error message if present
		if (this.error && !this.lastSuccessfulData) {
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

		// Show empty state if no courts
		if (this.selectedVenueCourts.length === 0) {
			return html`
				<div class="text-center py-6">
					<schmancy-icon size="48px" class="text-surface-on-variant opacity-50"> sports_tennis </schmancy-icon>
					<schmancy-typography type="body" token="md" class="mt-2">
						No courts available at this venue.
					</schmancy-typography>
				</div>
			`
		}

		// Render main content
		return html`
			${this.showConfirmationDialog && this.pendingCourtSelection
				? html`
						<court-availability-dialog
							.court=${this.pendingCourtSelection}
							.availability=${this.courtAvailability.get(this.pendingCourtSelection.id)!}
							.booking=${this.booking}
							.open=${this.showConfirmationDialog}
							@confirm-selection=${this.handleDialogConfirm}
							@cancel-selection=${this.handleDialogCancel}
							@dialog-close=${() => (this.showConfirmationDialog = false)}
						></court-availability-dialog>
				  `
				: ''}
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
						<div class="flex items-center justify-between">
							<schmancy-typography type="label" token="lg" class="font-medium text-primary-default">
								Select Court
							</schmancy-typography>

							<!-- View toggle buttons -->
							<div class="view-toggle-container">
								<button
									class="view-toggle-btn ${this.viewMode === ViewMode.LIST ? 'active' : ''}"
									@click=${() => this.toggleViewMode(ViewMode.LIST)}
									aria-label="List view"
									title="List view"
								>
									<schmancy-icon size="18px">view_list</schmancy-icon>
								</button>
								<button
									class="view-toggle-btn ${this.viewMode === ViewMode.MAP ? 'active' : ''}"
									@click=${() => this.toggleViewMode(ViewMode.MAP)}
									aria-label="Map view"
									title="Map view"
								>
									<schmancy-icon size="18px">map</schmancy-icon>
								</button>
							</div>
						</div>
					`,
				)}

				<!-- Content based on view mode -->
				${this.viewMode === ViewMode.MAP
					? html`
							<court-map-view
								.courts=${this.selectedVenueCourts}
								.selectedCourtId=${this.booking?.courtId}
								.courtAvailability=${this.courtAvailability}
								@court-select=${(e: CustomEvent) => this.handleCourtSelect(e.detail.court)}
							></court-map-view>
					  `
					: html`
							<!-- Original grid layout with sport court cards -->
							<div
								class="grid grid-cols-2 md:grid-cols-3 justify-between gap-3 ${classMap(this.getContainerClasses())}"
								role="listbox"
								aria-label="Available Courts"
								aria-multiselectable="false"
							>
								${repeat(
									this.selectedVenueCourts,
									court => court.id,
									court => html`
										<div
											data-court-id="${court.id}"
											role="option"
											aria-selected="${this.booking?.courtId === court.id ? 'true' : 'false'}"
											aria-disabled="${!this.canSelectCourt(court.id) ? 'true' : 'false'}"
											class="relative"
										>
											<sport-court-card
												id="${court.id}"
												name="${court.name}"
												type="${(court.sportTypes?.[0]?.toLowerCase() as SportTypeEnum) || 'volleyball'}"
												.selected="${this.booking?.courtId === court.id}"
												.disabled="${!this.canSelectCourt(court.id)}"
												.compact="${this.isCompactView}"
												@court-click="${() => this.handleCourtSelect(court)}"
											></sport-court-card>

											<!-- Availability badge -->
											${this.getCourtAvailabilityStatus(court.id) === 'full'
												? html`
														<div
															class="absolute top-0 right-0 m-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-sm text-xs border border-emerald-200"
														>
															Available
														</div>
												  `
												: this.getCourtAvailabilityStatus(court.id) === 'partial'
												? html`
														<div class="absolute top-0 left-0 z-10">
															<div
																class="bg-amber-50 text-amber-800 text-xs px-2 py-0.5 m-1 rounded-sm border border-amber-200"
															>
																Limited availability
															</div>
														</div>
												  `
												: html`
														<div
															class="absolute top-0 right-0 m-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-sm text-xs border border-slate-200 flex items-center"
														>
															<schmancy-icon size="12px" class="mr-1">block</schmancy-icon>
															<span>Unavailable</span>
														</div>
												  `}
										</div>
									`,
								)}
							</div>
					  `}
			</div>
		`
	}
}
