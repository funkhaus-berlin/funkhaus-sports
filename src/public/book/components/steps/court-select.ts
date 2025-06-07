// src/public/book/components/steps/court-select.ts
import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { cache } from 'lit/directives/cache.js'
import { classMap } from 'lit/directives/class-map.js'
import { createRef, ref, Ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'
import { distinctUntilChanged, filter, map, takeUntil } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import {
  availabilityContext,
  BookingFlowType,
  CourtAvailabilityStatus,
  CourtPreferences,
  getAllCourtsAvailability,
} from 'src/availability-context'
import { Court, CourtTypeEnum, SportTypeEnum } from 'src/db/courts.collection'
import { transitionToNextStep } from '../../booking-steps-utils'
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

/**
 * Availability status types for courts
 */
type AvailabilityStatus = 'full' | 'partial' | 'none'

/**
 * Time slot selection for court booking
 */
interface TimeSlot {
	start: string
	end: string
}

/**
 * Cache entry for court availability information
 */
interface CourtAvailabilityInfo {
	canSelect: boolean
	status: AvailabilityStatus
}

// Simple animation preset for selected court
const PULSE_ANIMATION = {
	keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }],
	options: {
		duration: 400,
		easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
	},
}

/**
 * Enhanced Court Selection Component with Map View
 * Supports multiple booking flow types, filtering, and availability visualization
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

	/* Filter styles */
	.filter-section {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
		margin-bottom: 0.5rem;
	}

	.filter-chip {
		padding: 0.15rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.7rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s ease;
		margin-right: 0.2rem;
		margin-bottom: 0.2rem;
		min-width: 1.8rem;
		height: 1.8rem;
	}

	.filter-chip.selected {
		background-color: var(--schmancy-sys-color-primary-default, #4f46e5);
		color: white;
	}

	.filter-chip:not(.selected) {
		background-color: var(--schmancy-sys-color-surface-variant, #f3f4f6);
		color: var(--schmancy-sys-color-on-surface-variant, #4b5563);
	}

	.filter-chip:hover:not(.selected) {
		background-color: var(--schmancy-sys-color-surface-variant-hover, #e5e7eb);
	}

	.filter-label {
		font-size: 0.875rem;
		font-weight: 500;
		display: inline-block;
		white-space: nowrap;
	}

	.filter-group {
		margin-bottom: 0.75rem;
	}

	/* Scrollbar hiding */
	.scrollbar-hide {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}

	.scrollbar-hide::-webkit-scrollbar {
		display: none; /* Chrome, Safari, and Opera */
	}

	/* Transition styles for view changes */
	.transition-container {
		transition: all 0.3s ease;
	}

	/* View transition system */
	.view-container {
		position: relative;
		min-height: 100px; /* Minimum height to prevent collapse during transitions */
	}

	.grid-view,
	.list-view {
		opacity: 0;
		visibility: hidden;
		transition: opacity 300ms ease, visibility 0ms 300ms;
		position: absolute;
		width: 100%;
		top: 0;
		left: 0;
	}

	.grid-view.active,
	.list-view.active {
		opacity: 1;
		visibility: visible;
		transition: opacity 300ms ease, visibility 0ms;
		position: relative;
	}
`) {
	//#region Context and State

	// Context selections
	@select(courtsContext)
	allCourts!: Map<string, Court>

	@select(bookingContext)
	booking!: Booking

	@select(BookingProgressContext)
	bookingProgress!: BookingProgress

	@select(availabilityContext)
	availability!: {
		timeSlots: Array<{
			timeValue: number
			courtAvailability: Record<string, boolean>
		}>
		date: string
		bookingFlowType: BookingFlowType
	}

	// Component state
	@state() selectedVenueCourts: Court[] = []
	@state() loading: boolean = true
	@state() error: string | null = null
	@state() courtAvailability: Map<string, CourtAvailabilityStatus> = new Map()
	@state() showConfirmationDialog: boolean = false
	@state() pendingCourtSelection: Court | null = null
	@state() viewMode: ViewMode = ViewMode.LIST
	@state() courtPreferences: CourtPreferences = {}
	@state() isActive: boolean = false
	@state() isTransitioning: boolean = false
	@state() autoScrollAttempted: boolean = false

	// Performance optimization caches
	private courtAvailabilityInfoCache = new Map<string, CourtAvailabilityInfo>()
	private lastSuccessfulData: { courts: Court[] } | null = null

	// Tracking state for availability checks
	private _lastCheckedDate: string = ''
	private _lastCheckedVenueId: string = ''
	private _forceAvailabilityCheck: boolean = false
	
	// Refs for scroll functionality
	private scrollContainerRef: Ref<HTMLElement> = createRef<HTMLElement>()
	private courtRefs = new Map<string, HTMLElement>()

	//#endregion

	//#region Lifecycle Methods

	/**
	 * Set up subscriptions when component is connected to DOM
	 */
	connectedCallback(): void {
		super.connectedCallback()
		this.subscribeToAvailabilityUpdates()

		// Add subscription to BookingProgressContext to track active state
		BookingProgressContext.$.pipe(
			takeUntil(this.disconnecting),
			map(progress => progress.currentStep),
			distinctUntilChanged(),
			map(x => {
				// Find the position of Court step in the steps array
				const courtStepIndex = this.bookingProgress.steps.findIndex(s => s.step === BookingStep.Court)
				// Convert to 1-based position
				const courtStepPosition = courtStepIndex + 1

				// Check if this position matches the current step
				return x === courtStepPosition
			}),
			filter(() => !this.isTransitioning),
		).subscribe(isActive => {
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
		})
	}

	/**
	 * Handle updates to component properties
	 * Checks for booking changes that require availability updates
	 */
	updated(changedProperties: Map<string, unknown>): void {
		if (changedProperties.has('booking') && this.booking?.date) {
			const oldBooking = changedProperties.get('booking') as Booking | undefined

			if (oldBooking) {
				const timeChanged = oldBooking.startTime !== this.booking.startTime
				const durationChanged = oldBooking.endTime !== this.booking.endTime

				// Force availability check on time/duration changes
				if (timeChanged || durationChanged) {
					this._forceAvailabilityCheck = true
				}
			}

			this.loadCourtsWithAvailability()
		} else if (changedProperties.has('bookingProgress') && this.booking?.date) {
			// Just load courts without forcing availability check
			this.loadCourtsWithAvailability()
		}
		
		// Scroll to selected court after update
		if (this.booking?.courtId && (changedProperties.has('booking') || changedProperties.has('selectedVenueCourts'))) {
			this.updateComplete.then(() => {
				setTimeout(() => this.scrollToSelectedCourt(), 150)
			})
		}
	}
	
	/**
	 * Clear court references when component is disconnected
	 */
	disconnectedCallback(): void {
		super.disconnectedCallback()
		this.clearCourtRefs()
	}
	
	/**
	 * Clear court element references
	 */
	private clearCourtRefs(): void {
		this.courtRefs.clear()
	}

	//#endregion

	//#region Data Subscription Methods

	/**
	 * Subscribe to booking and availability context updates
	 */
	private subscribeToAvailabilityUpdates(): void {
		// Subscribe to booking context changes
		bookingContext.$.pipe(
			takeUntil(this.disconnecting),
			filter(booking => !!booking),
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
			this.loadCourtsWithAvailability()
		})

		// Subscribe to availability context changes
		availabilityContext.$.pipe(
			takeUntil(this.disconnecting),
			filter(availability => !!availability && !!this.booking?.date),
			filter(availability => availability.date === this.booking.date),
			// Add additional checks for bookings changes
			map(availability => ({
				bookings: availability.bookings,
				date: availability.date,
				venueId: availability.venueId
			})),
			distinctUntilChanged((prev, curr) => 
				// Deep compare the bookings arrays to detect changes
				prev.date === curr.date &&
				prev.venueId === curr.venueId &&
				JSON.stringify(prev.bookings) === JSON.stringify(curr.bookings)
			),
		).subscribe(() => {
			console.log('Availability context updated - refreshing court availability')
			this.loadCourtsWithAvailability()
		})

		// Subscribe to courts context to reload when it becomes available
		courtsContext.$.pipe(
			takeUntil(this.disconnecting),
			filter(courts => courts && courts.size > 0),
			distinctUntilChanged((prev, curr) => prev?.size === curr?.size)
		).subscribe(() => {
			console.log('Courts context updated - loading courts')
			this.loadCourtsWithAvailability()
		})

		// Initial load
		this.loadCourtsWithAvailability()
	}

	//#endregion

	//#region Availability Checking Methods

	/**
	 * Check if a court has any available time slots
	 */
	private hasAnyAvailableTimeSlots(courtId: string): boolean {
		const timeSlots = availabilityContext.value?.timeSlots || []
		return timeSlots.some(slot => slot.courtAvailability?.[courtId] === true)
	}

	/**
	 * Check if a specific time is available for a court
	 */
	private isTimeAvailableForCourt(courtId: string, timeString: string): boolean {
		if (!timeString) return false

		const timeValue = dayjs(timeString).hour() * 60 + dayjs(timeString).minute()
		const slot = availabilityContext.value?.timeSlots?.find(s => s.timeValue === timeValue)

		if (!slot || !slot.courtAvailability?.[courtId]) {
			return false
		}

		return slot.courtAvailability[courtId] === true
	}

	/**
	 * Clear the availability cache
	 */
	private resetAvailabilityCache(): void {
		this.courtAvailabilityInfoCache.clear()
	}

	/**
	 * Get availability info for a court
	 * Returns an object with canSelect and status properties
	 */
	private getCourtAvailabilityInfo(courtId: string): CourtAvailabilityInfo {
		// Return from cache if available
		if (this.courtAvailabilityInfoCache.has(courtId)) {
			return this.courtAvailabilityInfoCache.get(courtId)!
		}

		let result: CourtAvailabilityInfo

		// If no time selected, check for any available time slots
		if (!this.isTimeSelected()) {
			const hasAvailable = this.hasAnyAvailableTimeSlots(courtId)
			result = {
				canSelect: hasAvailable,
				status: hasAvailable ? 'full' : 'none',
			}
		}
		// If time but no duration selected
		else if (this.isTimeSelected() && !this.isDurationSelected()) {
			const isTimeAvailable = this.isTimeAvailableForCourt(courtId, this.booking.startTime)
			result = {
				canSelect: isTimeAvailable,
				status: isTimeAvailable ? 'full' : 'none',
			}
		}
		// If both time and duration selected
		else {
			const status = this.courtAvailability.get(courtId)

			if (!status) {
				result = { canSelect: false, status: 'none' }
			} else if (status.fullyAvailable) {
				result = { canSelect: true, status: 'full' }
			} else if (status.available) {
				result = { canSelect: true, status: 'partial' }
			} else {
				result = { canSelect: false, status: 'none' }
			}
		}

		// Store result in cache
		this.courtAvailabilityInfoCache.set(courtId, result)
		return result
	}

	/**
	 * Check if a court can be selected based on its availability
	 */
	private canSelectCourt(courtId: string): boolean {
		return this.getCourtAvailabilityInfo(courtId).canSelect
	}

	/**
	 * Get the availability status of a court (full, partial, none)
	 */
	private getCourtAvailabilityStatus(courtId: string): AvailabilityStatus {
		return this.getCourtAvailabilityInfo(courtId).status
	}

	/**
	 * Check if time has been selected in the booking
	 */
	private isTimeSelected(): boolean {
		return !!this.booking?.startTime
	}

	/**
	 * Check if both time and duration have been selected in the booking
	 */
	private isDurationSelected(): boolean {
		return !!this.booking?.startTime && !!this.booking?.endTime
	}

	/**
	 * Calculate booking duration in minutes
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

	//#endregion

	//#region Data Loading Methods

	/**
	 * Load courts with availability data
	 * This is the main method for fetching and processing court data
	 */
	private loadCourtsWithAvailability(): void {
		this.loading = true
		this.error = null
		this.resetAvailabilityCache()
		this.autoScrollAttempted = false

		// Check if courts context is ready
		if (!this.allCourts || this.allCourts.size === 0) {
			console.log('Courts context not ready yet, waiting...')
			this.selectedVenueCourts = []
			this.loading = true
			this.error = null
			this.requestUpdate()
			return
		}

		// Check if we have the required data
		if (!this.booking?.venueId) {
			console.warn('Missing venueId for court selection')
			this.selectedVenueCourts = []
			this.loading = false
			this.error = 'Unable to load courts. Please select a venue.'
			this.requestUpdate()
			return
		}

		try {
			// Get court availabilities based on current booking time and duration
			const courtAvailabilities = getAllCourtsAvailability(this.booking.startTime, this.calculateDuration())

			// Create map of court ID to availability status for efficient lookups
			const availabilityMap = new Map<string, CourtAvailabilityStatus>()
			courtAvailabilities.forEach(status => {
				availabilityMap.set(status.courtId, status)
			})

			this.courtAvailability = availabilityMap

			// Load venue courts - maintain original order from database
			const venueCourts = Array.from(this.allCourts.values()).filter(
				court => court.status === 'active' && court.venueId === this.booking.venueId,
			)

			// Apply filters without sorting
			const filteredCourts = this.applyCourtPreferenceFilters(venueCourts)

			// Update state - no sorting
			this.selectedVenueCourts = filteredCourts
			this.lastSuccessfulData = { courts: filteredCourts }
			this.loading = false
			this.error = null
			this.requestUpdate()

			// Check if we need to reset time/duration selections due to unavailability
			this.checkAvailabilityAndResetIfNeeded()
			
			// Clear existing court refs before updating
			this.clearCourtRefs()
			
			// Scroll to selected court after data is loaded
			this.updateComplete.then(() => {
				if (this.booking.courtId && !this.autoScrollAttempted) {
					setTimeout(() => {
						this.scrollToSelectedCourt()
						this.autoScrollAttempted = true
					}, 150)
				}
			})
		} catch (error) {
			this.handleLoadingError(error)
		}
	}

	/**
	 * Check if current time/duration selections need to be reset due to unavailability
	 */
	private checkAvailabilityAndResetIfNeeded(): void {
		const shouldCheckAvailability =
			this.isTimeSelected() &&
			// We're actively changing key booking parameters, not just navigating steps
			(this.booking.date !== this._lastCheckedDate ||
				this.booking.venueId !== this._lastCheckedVenueId ||
				this._forceAvailabilityCheck)

		if (shouldCheckAvailability) {
			// Store current values for future reference
			this._lastCheckedDate = this.booking.date
			this._lastCheckedVenueId = this.booking.venueId
			this._forceAvailabilityCheck = false

			// Check availability with a small delay to ensure everything has updated
			setTimeout(() => this.checkAndResetUnavailableSelections(), 100)
		}
	}

	/**
	 * Handle errors when loading courts
	 */
	private handleLoadingError(error: unknown): void {
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

	/**
	 * Retry loading courts after an error
	 */
	private retryLoading(): void {
		this._forceAvailabilityCheck = true
		this.loadCourtsWithAvailability()
	}

	/**
	 * Check if any courts are available with current time and duration
	 * Only reset time/duration if they are actually unavailable
	 */
	private checkAndResetUnavailableSelections(): void {
		// Only proceed if we have courts and time/duration selections
		if (!this.selectedVenueCourts?.length || !this.isTimeSelected()) {
			return
		}

		// Check if any courts are available with current selections
		const hasAvailableCourts = this.selectedVenueCourts.some(court => this.canSelectCourt(court.id))

		// If no courts are available with current selections
		if (!hasAvailableCourts) {
			console.log('Courts unavailable with current selections, checking alternatives')

			if (this.isDurationSelected()) {
				this.checkAndResetDuration()
			} else {
				this.resetTimeSelection()
			}
		}
		// If courts are available with current selections, we don't need to reset anything
	}

	/**
	 * Check if the duration needs to be reset due to unavailability
	 */
	private checkAndResetDuration(): void {
		// First check if the time is available without the duration
		const hasAvailableCourtsWithoutDuration = this.selectedVenueCourts.some(court =>
			this.isTimeAvailableForCourt(court.id, this.booking.startTime),
		)

		if (hasAvailableCourtsWithoutDuration) {
			// Only the duration is the problem, so clear just the duration
			console.log('Duration caused unavailability, resetting only duration')
			const bookingUpdate = { ...this.booking, endTime: undefined }
			bookingContext.set(bookingUpdate)
		} else {
			// Both time and duration are problems, reset both
			console.log('Both time and duration unavailable, resetting both')
			const bookingUpdate = {
				...this.booking,
				startTime: undefined,
				endTime: undefined,
			}
			bookingContext.set(bookingUpdate)
		}
	}

	/**
	 * Reset time selection due to unavailability
	 */
	private resetTimeSelection(): void {
		console.log('Selected time is unavailable, resetting')
		const bookingUpdate = {
			...this.booking,
			startTime: undefined,
		}
		bookingContext.set(bookingUpdate)
	}

	/**
	 * Return courts in original order, no sorting by availability
	 */
	private sortCourtsByAvailability(courts: Court[]): Court[] {
		// Return courts in original order
		return [...courts];
	}

	//#endregion

	//#region Court Selection Methods

	/**
	 * Handle selection of a court
	 * Shows confirmation dialog for partially available courts
	 */
	private handleCourtSelect(court: Court): void {
		// Don't allow selecting unavailable courts
		if (!this.canSelectCourt(court.id)) {
			return
		}

		// Handle filter conflicts
		this.handleFilterConflicts(court)

		// Check if court is partially available when both time and duration selected
		const availabilityStatus = this.getCourtAvailabilityStatus(court.id)
		if (availabilityStatus === 'partial' && this.isDurationSelected()) {
			// Show confirmation dialog for partially available courts
			this.pendingCourtSelection = court
			this.showConfirmationDialog = true
			return
		}

		// For fully available courts, proceed directly
		this.confirmCourtSelection(court)
	}

	/**
	 * Handle conflicts between court selection and active filters
	 */
	private handleFilterConflicts(court: Court): void {
		// Check if filters are active and court doesn't match filters
		const hasActiveFilters = this.getActiveFilterCount() > 0
		const matchesFilters = this.courtMatchesFilters(court)
		const isAlreadySelected = this.booking?.courtId === court.id

		if (hasActiveFilters && !matchesFilters) {
			// If a filtered court was previously selected, clear filters
			if (isAlreadySelected) {
				// Keep the selection but clear filters
				this.courtPreferences = {}
				this.loadCourtsWithAvailability()
				return
			}

			// If selecting a court that doesn't match filters, clear conflicting filters
			this.adjustFiltersForCourtSelection(court)
		}
	}

	/**
	 * Adjust filters to allow selection of a specific court
	 */
	private adjustFiltersForCourtSelection(court: Court): void {
		// Adjust court type filter if needed
		if (this.courtPreferences.courtTypes?.length && court.courtType) {
			this.courtPreferences = {
				...this.courtPreferences,
				courtTypes: [court.courtType as CourtTypeEnum],
			}
		}

		// Adjust player count filter if needed
		if (this.courtPreferences.playerCount && !this.isSuitableForPlayerCount(court, this.courtPreferences.playerCount)) {
			this.courtPreferences = {
				...this.courtPreferences,
				playerCount: undefined,
			}
		}

		// Refresh with updated filters
		this.loadCourtsWithAvailability()
	}

	/**
	 * Confirm court selection with optional time slot
	 */
	private confirmCourtSelection(court: Court, timeSlot?: TimeSlot): void {
		this.processCourtSelection(court, timeSlot)
	}

	/**
	 * Process court selection and update booking context
	 * This method is responsible for updating the booking with the selected court
	 * and transitioning to the next step in the flow
	 */
	private processCourtSelection(court: Court, timeSlot?: TimeSlot): void {
		// Update booking context with selected court
		const bookingUpdate: Partial<Booking> = {
			courtId: court.id,
		}

		// If time slot is provided (for partial availability), update time and duration
		if (timeSlot) {
			bookingUpdate.startTime = timeSlot.start
			bookingUpdate.endTime = timeSlot.end
		}

		// Update booking context
		bookingContext.set(bookingUpdate, true)

		// Reset dialog state if applicable
		this.pendingCourtSelection = null
		this.showConfirmationDialog = false
		
		// Highlight the selected court
		const courtEl = this.courtRefs.get(court.id)
		if (courtEl) {
			courtEl.animate(PULSE_ANIMATION.keyframes, PULSE_ANIMATION.options)
		}

		// Transition to the next step - this will handle expanded steps automatically
		transitionToNextStep('Court')
	}

	/**
	 * Handle confirmation from the court availability dialog
	 */
	private handleDialogConfirm(e: CustomEvent): void {
		const { court, timeSlot } = e.detail

		if (!court) {
			console.error('Missing required confirmation details')
			return
		}

		this.processCourtSelection(court, timeSlot)
	}

	/**
	 * Handle cancellation from the court availability dialog
	 */
	private handleDialogCancel(): void {
		this.pendingCourtSelection = null
		this.showConfirmationDialog = false
	}

	//#endregion

	//#region Filter Methods
	
	/**
	 * Get unique court type options from all venue courts
	 * Only returns options if there's more than one unique value
	 */
	private getCourtTypeOptions(): CourtTypeEnum[] {
		// Get all courts for the current venue
		const venueCourts = this.selectedVenueCourts || [];
		
		// Skip calculation if no courts available
		if (venueCourts.length === 0) {
			return [];
		}
		
		// Calculate unique court types from available courts
		const courtTypes = new Set<CourtTypeEnum>();
		
		venueCourts.forEach(court => {
			if (court.courtType) {
				courtTypes.add(court.courtType as CourtTypeEnum);
			}
		});
		
		// Convert to array and return
		const uniqueTypes = Array.from(courtTypes);
		
		// Only return the array if there's more than one option
		return uniqueTypes.length > 1 ? uniqueTypes : [];
	}
	
	/**
	 * Get unique player count options from all venue courts
	 * Only returns options if there's more than one unique value
	 */
	private getPlayerCountOptions(): number[] {
		// Get all courts for the current venue
		const venueCourts = this.selectedVenueCourts || [];
		
		// Skip calculation if no courts available
		if (venueCourts.length === 0) {
			return [];
		}
		
		// Calculate max players for each court and collect unique values
		const playerCounts = new Set<number>();
		
		venueCourts.forEach(court => {
			// Get max player count for each court
			const maxPlayers = this.getMaxPlayerCount(court);
			playerCounts.add(maxPlayers);
		});
		
		// Convert to array, sort, and return
		const uniqueCounts = Array.from(playerCounts).sort((a, b) => a - b);
		
		// Only return the array if there's more than one option
		return uniqueCounts.length > 1 ? uniqueCounts : [];
	}

	/**
	 * Calculate the maximum player count for a court
	 * Based on sport type and court dimensions
	 */
	private getMaxPlayerCount(court: Court): number {
		// Check sport types of the court
		const sports = court.sportTypes || ['pickleball'];
		
		// Determine max player count based on sport type
		if (sports.includes('volleyball')) {
			return 12; // Volleyball courts can support up to 12 players
		} else if (sports.includes('pickleball') || sports.includes('padel')) {
			return 4; // Pickleball and Padel typically allow up to 4 players
		}
		
		// For other sports or if no specific type, use court dimensions
		if (court.dimensions) {
			const area = court.dimensions.length * court.dimensions.width;
			const areaInSquareMeters = court.dimensions.unit === 'feet'
				? area * 0.092903 // Convert sq feet to sq meters
				: area;
			
			if (areaInSquareMeters >= 150) {
				return 6; // Large courts support 6+ players
			} else if (areaInSquareMeters >= 100) {
				return 4; // Medium courts support 4 players
			}
		}
		
		// Default for small courts or unknown dimensions
		return 2;
	}

	/**
	 * Apply court preference filters to the list of courts without sorting
	 * Filters courts based on court type, player count, and other preferences
	 * but maintains original court order
	 */
	private applyCourtPreferenceFilters(courts: Court[]): Court[] {
		// If no filters are active, return courts in original order
		if (!this.getActiveFilterCount()) {
			return [...courts]
		}

		// For active filters, prioritize matching courts first
		// but maintain original order within groups
		const matchingCourts: Court[] = []
		const nonMatchingCourts: Court[] = []
		
		courts.forEach(court => {
			if (this.courtMatchesFilters(court)) {
				matchingCourts.push(court)
			} else {
				nonMatchingCourts.push(court)
			}
		})
		
		// Return matching courts first, then non-matching courts
		return [...matchingCourts, ...nonMatchingCourts]
	}

	/**
	 * Check if a court matches all active filters
	 */
	private courtMatchesFilters(court: Court): boolean {
		// Check court type filter
		if (
			this.courtPreferences.courtTypes?.length &&
			!this.courtPreferences.courtTypes.includes(court.courtType as CourtTypeEnum)
		) {
			return false
		}

		// Check sport type filter
		if (
			this.courtPreferences.sportTypes?.length &&
			!court.sportTypes.some(type => this.courtPreferences.sportTypes?.includes(type as SportTypeEnum))
		) {
			return false
		}

		// Check player count filter
		if (this.courtPreferences.playerCount && !this.isSuitableForPlayerCount(court, this.courtPreferences.playerCount)) {
			return false
		}

		// Check amenities filter
		if (
			this.courtPreferences.amenities?.length &&
			!this.courtPreferences.amenities.every(amenity => court.amenities?.includes(amenity))
		) {
			return false
		}

		// Court matches all active filters
		return true
	}

	/**
	 * Get the number of active filters
	 */
	private getActiveFilterCount(): number {
		let count = 0
		if (this.courtPreferences.courtTypes?.length) count++
		if (this.courtPreferences.playerCount) count++
		if (this.courtPreferences.amenities?.length) count++
		return count
	}

	/**
	 * Toggle a court type filter
	 */
	private toggleCourtTypeFilter(type: CourtTypeEnum): void {
		const currentTypes = this.courtPreferences.courtTypes || []

		if (currentTypes.includes(type)) {
			this.courtPreferences = {
				...this.courtPreferences,
				courtTypes: currentTypes.filter(t => t !== type),
			}
		} else {
			this.courtPreferences = {
				...this.courtPreferences,
				courtTypes: [...currentTypes, type],
			}
		}

		this.loadCourtsWithAvailability()
	}

	/**
	 * Handle click on player count filter chip
	 */
	private handlePlayerCountChipClick(playerCount: number): void {
		if (this.courtPreferences.playerCount === playerCount) {
			this.courtPreferences = {
				...this.courtPreferences,
				playerCount: undefined,
			}
		} else {
			this.courtPreferences = {
				...this.courtPreferences,
				playerCount: playerCount,
			}
		}

		this.loadCourtsWithAvailability()
	}

	/**
	 * Check if a court type is selected in filters
	 */
	private isCourtTypeSelected(type: CourtTypeEnum): boolean {
		return (this.courtPreferences.courtTypes || []).includes(type)
	}

	/**
	 * Check if a court is suitable for the given player count
	 */
	private isSuitableForPlayerCount(court: Court, playerCount: number): boolean {
		// If no dimensions data available, default to true (we can't tell)
		if (!court.dimensions) {
			return true
		}

		// Calculate court area in square meters
		const area = court.dimensions.length * court.dimensions.width
		const areaInSquareMeters =
			court.dimensions.unit === 'feet'
				? area * 0.092903 // Convert sq feet to sq meters
				: area

		// Check sport types of the court
		const sports = court.sportTypes || ['pickleball']

		// For specific sports, we can make better recommendations
		if (sports.includes('pickleball')) {
			if (playerCount <= 2) return true
			if (playerCount === 4) return areaInSquareMeters >= 75
			return false // 6+ players not recommended
		}

		if (sports.includes('padel')) {
			if (playerCount <= 2) return true
			if (playerCount === 4) return areaInSquareMeters >= 180
			return false // 6+ players not recommended
		}

		if (sports.includes('volleyball')) {
			if (playerCount >= 6) return areaInSquareMeters >= 150
			if (playerCount === 4) return true
			if (playerCount === 2) return court.courtType === 'outdoor'
		}

		// Default logic based on court size and player count
		switch (playerCount) {
			case 2:
				return true // Small courts are fine for 2 players
			case 4:
				return areaInSquareMeters >= 100 // Medium courts for 4 players
			default:
				return areaInSquareMeters >= 150 // 6+ players need larger courts
		}
	}

	/**
	 * Format court type for display (convert camelCase to Title Case)
	 */
	private formatCourtType(type: string): string {
		if (!type) return ''

		// Handle camelCase or snake_case by inserting spaces
		return type
			.replace(/([A-Z])/g, ' $1') // Insert space before capital letters
			.replace(/_/g, ' ') // Replace underscores with spaces
			.replace(/^./, str => str.toUpperCase()) // Capitalize first letter
			.trim()
	}

	/**
	 * Toggle between list and map view modes
	 */
	private toggleViewMode(mode: ViewMode): void {
		this.viewMode = mode
		this.requestUpdate()
	}

	//#endregion

	//#region Scroll Methods
	
	/**
	 * Scroll to selected court with smooth animation
	 */
	private scrollToSelectedCourt(): void {
		if (!this.booking?.courtId || this.viewMode !== ViewMode.LIST) return
		
		try {
			const scrollContainer = this.scrollContainerRef.value
			const courtEl = this.courtRefs.get(this.booking.courtId)
			
			if (!scrollContainer || !courtEl) return
			
			// Check if element is already in view
			const containerRect = scrollContainer.getBoundingClientRect()
			const elementRect = courtEl.getBoundingClientRect()
			
			// Calculate if element is fully visible
			const isFullyVisible = elementRect.left >= containerRect.left && elementRect.right <= containerRect.right
			
			// If the element is already fully visible, just highlight it
			if (isFullyVisible) {
				this.highlightCourtElement(courtEl)
				return
			}
			
			// Calculate scroll position to center the element
			const containerWidth = scrollContainer.clientWidth
			const elementOffset = courtEl.offsetLeft
			const elementWidth = courtEl.offsetWidth
			const scrollPosition = elementOffset - containerWidth / 2 + elementWidth / 2
			
			// Smooth scroll to the calculated position
			scrollContainer.scrollTo({
				left: scrollPosition,
				behavior: 'smooth',
			})
			
			// Highlight the element
			this.highlightCourtElement(courtEl)
		} catch (error) {
			console.error('Error scrolling to selected court:', error)
		}
	}
	
	/**
	 * Highlight court element with animation
	 */
	private highlightCourtElement(element: HTMLElement): void {
		element.animate(PULSE_ANIMATION.keyframes, PULSE_ANIMATION.options)
	}
	
	//#endregion

	//#region UI Helper Methods

	/**
	 * Get CSS classes for a court based on its status and selection
	 */
	private getCourtMatchClass(court: Court): string {
		const matchesFilters = this.courtMatchesFilters(court)
		const isSelected = this.booking?.courtId === court.id
		const isAvailable = this.canSelectCourt(court.id)
		const hasActiveFilters = this.getActiveFilterCount() > 0

		const classes = []

		if (isSelected) {
			classes.push('pulse-animation')
		}

		if (!isAvailable) {
			classes.push('opacity-50')
		} else if (hasActiveFilters && !matchesFilters) {
			// Only apply opacity to non-matching courts when filters are active
			classes.push('opacity-60')
		}

		return classes.join(' ')
	}

	/**
	 * Get CSS classes for the container
	 */
	private getContainerClasses(): Record<string, boolean> {
		return {
			'gap-2': true,
			'py-2': true,
			'transition-all': true,
			'duration-300': true,
      "first:pl-2 last:pr-2":!this.isActive
		}
	}

	//#endregion

	//#region Render Methods

	/**
	 * Render the filters section
	 */
	private renderFilters() {
		// Get dynamic court type options instead of using the enum directly
		const courtTypeOptions = this.getCourtTypeOptions();
		
		// Get dynamic player count options
		const playerCountOptions = this.getPlayerCountOptions();
		
		// Don't render filters if there are no courts or only one court
		if (this.selectedVenueCourts.length <= 1) return html``;
		
		// Only show filters section if we have filter options
		const hasFilters = courtTypeOptions.length > 0 || playerCountOptions.length > 0;
		
		if (!hasFilters && !this.isActive) {
			return html``; // Return empty if no filters and not active
		}
		
		return html`
			<div class="filter-section py-2 px-1">
				<!-- Combined filter chips in one line -->
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex flex-wrap gap-1.5">
						<!-- Court Type Filters - Only shown if multiple options -->
						${courtTypeOptions.length > 0
							? courtTypeOptions.map(type => {
									const isSelected = this.isCourtTypeSelected(type);
									const typeIcon = type === 'indoor' ? 'home' : type === 'outdoor' ? 'wb_sunny' : 'sports_tennis';

									return html`
										<schmancy-chip .selected="${isSelected}" @click=${() => this.toggleCourtTypeFilter(type)}>
											<schmancy-icon slot="leading" size="16px">${typeIcon}</schmancy-icon>
											${this.formatCourtType(type)}
										</schmancy-chip>
									`;
								})
							: ''}

						<!-- Player Count Filters - Only shown if multiple options -->
						${playerCountOptions.length > 0
							? playerCountOptions.map(count => {
									// Label for the player count chip
									const label = count >= 6 ? '6+' : count.toString();
									const isSelected = this.courtPreferences.playerCount === count;

									return html`
										<schmancy-chip .selected="${isSelected}" @click=${() => this.handlePlayerCountChipClick(count)}>
											<schmancy-icon slot="leading" size="16px">group</schmancy-icon>
											${label}
										</schmancy-chip>
									`;
								})
							: ''}
					</div>

					<!-- View mode toggles - only show when active -->
					<!-- <div class="flex gap-1 shrink-0 ml-auto">
						<schmancy-icon-button
							size="sm"
							variant="${this.viewMode === ViewMode.LIST ? 'filled tonal' : 'text'}"
							@click=${() => this.toggleViewMode(ViewMode.LIST)}
							aria-pressed=${this.viewMode === ViewMode.LIST}
							aria-label="List view"
							>view_list</schmancy-icon-button
						>
						<schmancy-icon-button
							size="sm"
							variant="${this.viewMode === ViewMode.MAP ? 'filled tonal' : 'text'}"
							@click=${() => this.toggleViewMode(ViewMode.MAP)}
							aria-pressed=${this.viewMode === ViewMode.MAP}
							aria-label="Map view"
							>map</schmancy-icon-button
						>
					</div> -->
				</div>
			</div>
		`
	}

	/**
	 * Render the courts in list view - with support for compact mode and horizontal scrolling
	 */
	private renderCourtsList() {
		if (!this.isActive) {
			// Compact horizontal scrolling view for inactive state
			return html`
				<div
					${ref(this.scrollContainerRef)}
					class="flex overflow-x-auto scrollbar-hide snap-x gap-2 py-2 first:pl-1 last:pr-1"
					role="listbox"
					aria-label="Available Courts"
					aria-multiselectable="false"
				>
					${repeat(
						this.selectedVenueCourts,
						court => court.id,
						court => {
							// Create a reference callback for the court element
							const courtRef = (element: Element | undefined) => {
								if (element) {
									this.courtRefs.set(court.id, element as HTMLElement)
								}
							}
							
							return html`
								<div
									${ref(courtRef)}
									data-court-id="${court.id}"
									role="option"
									aria-selected="${this.booking?.courtId === court.id ? 'true' : 'false'}"
									aria-disabled="${!this.canSelectCourt(court.id) ? 'true' : 'false'}"
									class="snap-center flex-shrink-0 transition-opacity duration-300 ${this.getCourtMatchClass(court)}"
									style="min-width: 140px;"
								>
									<sport-court-card
										id="${court.id}"
										name="${court.name}"
										type="${(court.sportTypes?.[0]?.toLowerCase() as SportTypeEnum) || 'volleyball'}"
										courtType="${court.courtType}"
										.selected="${this.booking?.courtId === court.id}"
										.disabled="${!this.canSelectCourt(court.id)}"
										.compact="${true}"
										data-availability="${this.getCourtAvailabilityStatus(court.id)}"
										@court-click="${() => this.handleCourtSelect(court)}"
									></sport-court-card>
								</div>
							`
						},
					)}
				</div>
			`
		} else {
			// Regular grid view for active state
			return html`
				<schmancy-scroll>
					<div
						class="grid grid-cols-2 md:grid-cols-3 justify-between gap-2  ${classMap(this.getContainerClasses())}"
						role="listbox"
						aria-label="Available Courts"
						aria-multiselectable="false"
					>
						${repeat(
							this.selectedVenueCourts,
							court => court.id,
							court => {
								// Create a reference callback for the court element
								const courtRef = (element: Element | undefined) => {
									if (element) {
										this.courtRefs.set(court.id, element as HTMLElement)
									}
								}
								
								return html`
									<div
										${ref(courtRef)}
										data-court-id="${court.id}"
										role="option"
										aria-selected="${this.booking?.courtId === court.id ? 'true' : 'false'}"
										aria-disabled="${!this.canSelectCourt(court.id) ? 'true' : 'false'}"
										class="relative transition-opacity duration-300 ${this.getCourtMatchClass(court)}"
									>
										<sport-court-card
											id="${court.id}"
											name="${court.name}"
											type="${(court.sportTypes?.[0]?.toLowerCase() as SportTypeEnum) || 'volleyball'}"
											courtType="${court.courtType}"
											.selected="${this.booking?.courtId === court.id}"
											.disabled="${!this.canSelectCourt(court.id)}"
											.compact="${!this.isActive}"
											data-availability="${this.getCourtAvailabilityStatus(court.id)}"
											@court-click="${() => this.handleCourtSelect(court)}"
										></sport-court-card>
									</div>
								`
							},
						)}
					</div>
				</schmancy-scroll>
			`
		}
	}

	/**
	 * Render the courts in map view
	 */
	private renderMapView() {
		return html`
			<court-map-view
				.courts=${this.selectedVenueCourts}
				.selectedCourtId=${this.booking?.courtId}
				.courtAvailability=${this.courtAvailability}
				@court-select=${(e: CustomEvent) => this.handleCourtSelect(e.detail.court)}
			></court-map-view>
		`
	}

	/**
	 * Render the loading state
	 */
	private renderLoadingState() {
		return html`
			<div class="text-center py-6">
				<div
					class="inline-block w-8 h-8 border-4 border-t-primary-default border-r-outlineVariant border-b-outlineVariant border-l-outlineVariant rounded-full animate-spin"
				></div>
				<schmancy-typography type="body" token="md" class="mt-2">Loading courts...</schmancy-typography>
			</div>
		`
	}

	/**
	 * Render the error state
	 */
	private renderErrorState() {
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
	 * Render the empty state when no courts are available
	 */
	private renderEmptyState() {
		return html`
			<div class="text-center py-6">
				<schmancy-icon size="48px" class="text-surface-on-variant opacity-50">sports_tennis</schmancy-icon>
				<schmancy-typography type="body" token="md" class="mt-2">
					No courts available at this venue.
				</schmancy-typography>
			</div>
		`
	}

	/**
	 * Main render method
	 */
	render() {
		// Handle loading, error, and empty states
		if (this.loading && !this.lastSuccessfulData) {
			return this.renderLoadingState()
		}

		if (this.error && !this.lastSuccessfulData) {
			return this.renderErrorState()
		}

		if (this.selectedVenueCourts.length === 0) {
			return this.renderEmptyState()
		}

		// Render main content with conditional filter display
		return html`
			${this.showConfirmationDialog && this.pendingCourtSelection
				? html`
						<court-availability-dialog
							.court=${this.pendingCourtSelection}
							.open=${this.showConfirmationDialog}
							@confirm-selection=${this.handleDialogConfirm}
							@cancel-selection=${this.handleDialogCancel}
							@dialog-close=${() => (this.showConfirmationDialog = false)}
						></court-availability-dialog>
				  `
				: ''}
			<div class="mt-3 bg-surface-container-low rounded-lg px-2 transition-container">
				${this.error
					? html`
							<div class="bg-error-container p-2 rounded-t-lg text-error-on-container text-sm text-center">
								${this.error}
								<button @click=${() => this.retryLoading()} class="ml-2 underline font-medium">Refresh</button>
							</div>
					  `
					: ''}

				<!-- Court Filters - Only show when active -->
				${this.isActive ? this.renderFilters() : ''}

				<!-- If active, show based on view mode, otherwise always show list view -->
				${cache(
					this.isActive && this.viewMode === ViewMode.MAP ? this.renderMapView() : this.renderCourtsList(),
				)}
			</div>
		`
	}

	//#endregion
}
