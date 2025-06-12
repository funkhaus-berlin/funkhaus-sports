// src/public/book/components/steps/court-select.ts
import { $notify, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { cache } from 'lit/directives/cache.js'
import { classMap } from 'lit/directives/class-map.js'
import { createRef, ref, Ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'
import {
	combineLatest,
	distinctUntilChanged,
	filter,
	fromEvent,
	map,
	of,
	switchMap,
	take,
	takeUntil,
	tap,
	timer,
	debounceTime,
} from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venueContext, venuesContext } from 'src/admin/venues/venue-context'
import { availabilityContext } from 'src/availability-context'
import { BookingFlowType, CourtPreferences, TimeSlot } from 'src/types'
import { Court, CourtTypeEnum, SportTypeEnum } from 'src/types/booking/court.types'
import { Venue } from 'src/types/booking/venue.types'
import { transitionToNextStep } from '../../booking-steps-utils'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'
import './court-availability-dialog'
import './court-map-google'
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

interface CourtAvailabilityStatus {
	courtId: string
	courtName: string
	available: boolean
	fullyAvailable: boolean
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
	/* Only keep minimal CSS for :host */
	:host {
		display: block;
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
		bookings: Booking[]
		date: string
		bookingFlowType: BookingFlowType
	}

	@select(venueContext)
	venue!: Partial<Venue>

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

	private lastSuccessfulData: { courts: Court[] } | null = null

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
		
		// On mobile, show map view by default if no court selected
		const isMobile = window.innerWidth < 1024 // Tailwind lg breakpoint
		if (isMobile && !this.booking?.courtId) {
			this.viewMode = ViewMode.MAP
		}
		
		this.subscribeToAvailabilityUpdates()
		this.subscribeToCourtSelection()

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
			// Don't expand if a court is already selected
			if (this.booking?.courtId && isActive && !this.isActive) {
				// Keep it collapsed if trying to expand with a court already selected
				return
			}

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

		// Add window resize observer to switch from map to list view on larger screens
		this.setupWindowResizeObserver()
	}

	/**
	 * Setup window resize observer using RxJS
	 * Switches from map view to list view when window width exceeds lg breakpoint (1024px)
	 */
	private setupWindowResizeObserver(): void {
		// Tailwind lg breakpoint is 1024px
		const LG_BREAKPOINT = 1024

		// Create resize observable with debounce for performance
		fromEvent(window, 'resize')
			.pipe(
				debounceTime(300),
				map(() => window.innerWidth),
				distinctUntilChanged(),
				tap(width => {
					// If we're in map view and window width is >= lg breakpoint, switch to list view
					if (this.viewMode === ViewMode.MAP && width >= LG_BREAKPOINT) {
						console.log('Window resized above lg breakpoint, switching to list view')
						this.viewMode = ViewMode.LIST
						this.requestUpdate()
					}
				}),
				takeUntil(this.disconnecting),
			)
			.subscribe()

		// Also check initial window size
		if (window.innerWidth >= LG_BREAKPOINT && this.viewMode === ViewMode.MAP) {
			this.viewMode = ViewMode.LIST
			this.requestUpdate()
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
	 * Subscribe to court selection changes
	 * This reacts to court ID changes in the booking context
	 */
	private subscribeToCourtSelection(): void {
		// Subscribe to court ID changes with distinct filtering
		bookingContext.$.pipe(
			takeUntil(this.disconnecting),
			map(booking => booking.courtId),
			distinctUntilChanged(),
			filter(courtId => !!courtId), // Only process when a court is selected
			// Get the court data from the courts context
			switchMap(courtId => 
				courtsContext.$.pipe(
					filter(courts => courts.size > 0),
					map(courts => ({ courtId, court: courts.get(courtId) })),
					take(1)
				)
			),
			filter(({ court }) => !!court), // Ensure court exists
			tap(({ court }) => {
				console.log('Court selection changed to:', court!.name)
				
				// Scroll to the selected court if in list view
				if (this.viewMode === ViewMode.LIST) {
					// Wait for DOM to update before scrolling
					setTimeout(() => this.scrollToSelectedCourt(), 100)
				}
				
				// Handle filter conflicts
				this.handleFilterConflicts(court!)
				
				// Check if court is partially available when both time and duration selected
				const availabilityStatus = this.getCourtAvailabilityStatus(court!.id)
				const hasDuration = !!this.booking?.startTime && !!this.booking?.endTime
				
				if (availabilityStatus === 'partial' && hasDuration) {
					// Show confirmation dialog for partially available courts
					this.pendingCourtSelection = court!
					this.showConfirmationDialog = true
					return
				}
				
				// For fully available courts, proceed directly
				this.confirmCourtSelection(court!)
			})
		).subscribe()
	}

	/**
	 * Subscribe to booking and availability context updates
	 */
	private subscribeToAvailabilityUpdates(): void {
		// Consolidated reactive pipeline
		combineLatest([bookingContext.$, availabilityContext.$, courtsContext.$, venuesContext.$, BookingProgressContext.$])
			.pipe(
				takeUntil(this.disconnecting),
				// Filter for valid data
				filter(([booking, availability, courts, venues]) => {
					const isValid =
						!!booking &&
						!!availability &&
						availability.bookings !== undefined && // Bookings can be empty array
						courts &&
						courts.size > 0 &&
						venues &&
						venues.size > 0

					console.log('Court select filter check:', {
						booking: !!booking,
						availability: !!availability,
						bookings: availability?.bookings !== undefined,
						bookingsCount: availability?.bookings?.length || 0,
						courts: courts?.size || 0,
						venues: venues?.size || 0,
						isValid,
					})

					return isValid
				}),
				// Calculate court availability on the fly
				map(([booking, availability, courts, venues, progress]) => {
					// Pure function to calculate court availability for this component
					const calculateCourtAvailability = () => {
						const venue = venues.get(booking.venueId)
						if (!venue || !booking.date) return new Map()

						// Get active courts for this venue
						const activeCourts = Array.from(courts.values()).filter(
							court => court.status === 'active' && court.venueId === booking.venueId,
						)

						const courtAvailabilityMap = new Map<string, CourtAvailabilityStatus>()

						activeCourts.forEach(court => {
							// Check if court has any bookings that conflict with selected time/duration
							if (booking.startTime && booking.endTime) {
								// Check for conflicts with selected time and duration
								const hasConflict = availability.bookings.some(existingBooking => {
									if (existingBooking.courtId !== court.id) return false

									const bookingStart = dayjs(booking.startTime)
									const bookingEnd = dayjs(booking.endTime)
									const existingStart = dayjs(existingBooking.startTime)
									const existingEnd = dayjs(existingBooking.endTime)

									// Check for overlap
									return bookingStart.isBefore(existingEnd) && bookingEnd.isAfter(existingStart)
								})

								courtAvailabilityMap.set(court.id, {
									courtId: court.id,
									courtName: court.name,
									available: !hasConflict,
									fullyAvailable: !hasConflict,
								})
							} else if (booking.startTime) {
								// Check if court is available at the selected start time
								const startHour = dayjs(booking.startTime).hour()
								const startMinute = dayjs(booking.startTime).minute()
								const timeValue = startHour * 60 + startMinute

								// Check if any booking conflicts with this time
								const hasConflict = availability.bookings.some(existingBooking => {
									if (existingBooking.courtId !== court.id) return false

									const existingStart = dayjs(existingBooking.startTime)
									const existingEnd = dayjs(existingBooking.endTime)
									const existingStartMinutes = existingStart.hour() * 60 + existingStart.minute()
									const existingEndMinutes = existingEnd.hour() * 60 + existingEnd.minute()

									return timeValue >= existingStartMinutes && timeValue < existingEndMinutes
								})

								courtAvailabilityMap.set(court.id, {
									courtId: court.id,
									courtName: court.name,
									available: !hasConflict,
									fullyAvailable: !hasConflict,
								})
							} else {
								// No time selected - check if court has any availability today
								const courtBookings = availability.bookings.filter(b => b.courtId === court.id)
								const totalBookedHours = courtBookings.reduce((total, booking) => {
									const duration = dayjs(booking.endTime).diff(dayjs(booking.startTime), 'hour')
									return total + duration
								}, 0)
								
								// When no time is selected, courts are either available or unavailable
								// No "limited" status since we don't have a specific time period to check
								const hasAnyAvailability = totalBookedHours < 10

								courtAvailabilityMap.set(court.id, {
									courtId: court.id,
									courtName: court.name,
									available: hasAnyAvailability,
									fullyAvailable: hasAnyAvailability, // When no time selected, available = fullyAvailable
								})
							}
						})

						return courtAvailabilityMap
					}

					return {
						booking,
						availability,
						courts,
						venues,
						progress,
						calculatedCourtAvailability: calculateCourtAvailability(),
					}
				}),
				// Extract relevant data for comparison
				distinctUntilChanged(
					(prev, curr) =>
						// Compare relevant fields
						prev.booking.startTime === curr.booking.startTime &&
						prev.booking.endTime === curr.booking.endTime &&
						prev.booking.date === curr.booking.date &&
						prev.booking.venueId === curr.booking.venueId &&
						prev.booking.courtId === curr.booking.courtId &&
						prev.availability.date === curr.availability.date &&
						prev.availability.venueId === curr.availability.venueId &&
						JSON.stringify(prev.availability.bookings) === JSON.stringify(curr.availability.bookings) &&
						prev.courts.size === curr.courts.size &&
						prev.progress.expandedSteps === curr.progress.expandedSteps,
				),
				// Handle scrolling to selected court after DOM is ready
				switchMap(({ booking, availability, calculatedCourtAvailability, progress }) => {
					console.log('Context updated - refreshing court availability')
					console.log('Bookings available:', availability.bookings?.length || 0)

					// Update court availability from calculated data
					this.courtAvailability = calculatedCourtAvailability

					this.loadCourtsWithAvailability()

					// Check if we need to scroll to selected court
					if (!booking?.courtId || this.viewMode !== ViewMode.LIST) {
						return of(null)
					}

					const isExpanded = progress.expandedSteps.includes(BookingStep.Court)
					if (!isExpanded) {
						return of(null)
					}

					// Retry logic to wait for DOM elements to be ready (similar to duration-select)
					return timer(0, 50).pipe(
						map(() => this.courtRefs.get(booking.courtId!)),
						filter(element => {
							const isReady = !!element && !!this.scrollContainerRef.value
							if (!isReady) {
								console.log('Waiting for court DOM elements to be ready...')
							}
							return isReady
						}),
						take(1), // Take the first successful attempt
						tap(_ => {
							console.log('Auto-scrolling to selected court:', booking.courtId)
							// Add a small delay to ensure render is complete
							setTimeout(() => this.scrollToSelectedCourt(), 10)
						}),
						takeUntil(timer(3000)), // Give up after 3 seconds
					)
				}),
			)
			.subscribe()

		// Initial load
		this.loadCourtsWithAvailability()
	}

	//#endregion

	//#region Availability Checking Methods

	/**
	 * Check if a court can be selected based on its availability
	 */
	private canSelectCourt(courtId: string): boolean {
		const status = this.courtAvailability.get(courtId)
		return status?.available || false
	}

	/**
	 * Get the availability status of a court (full, partial, none)
	 */
	private getCourtAvailabilityStatus(courtId: string): AvailabilityStatus {
		const status = this.courtAvailability.get(courtId)
		if (!status || !status.available) return 'none'
		return status.fullyAvailable ? 'full' : 'partial'
	}

	//#endregion

	//#region Data Loading Methods

	/**
	 * Simple method to update courts list from reactive data
	 */
	private loadCourtsWithAvailability(): void {
		if (!this.allCourts || this.allCourts.size === 0 || !this.booking?.venueId) {
			this.selectedVenueCourts = []
			this.loading = false
			return
		}

		// Get venue courts and sort by name
		const venueCourts = Array.from(this.allCourts.values())
			.filter(court => court.status === 'active' && court.venueId === this.booking.venueId)
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

		// Apply filters
		this.selectedVenueCourts = this.applyCourtPreferenceFilters(venueCourts)
		this.loading = false
		this.requestUpdate()
	}

	/**
	 * Retry loading courts after an error
	 */
	private retryLoading(): void {
		this.loadCourtsWithAvailability()
	}

	//#endregion

	//#region Court Selection Methods

	/**
	 * Handle selection of a court
	 * Only saves the court ID to booking context
	 */
	private handleCourtSelect(court: Court): void {
		console.log('handleCourtSelect called with court:', court.name)
		
		// Don't allow selecting unavailable courts
		if (!this.canSelectCourt(court.id)) {
			$notify.error('This court is not available at the selected time')
			console.log('Court not available, returning early')
			return
		}

		// Just save the court ID to booking context
		// The subscription will handle the rest of the logic
		bookingContext.set({ courtId: court.id }, true)
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
		// If we're in map view, switch to list view first
		if (this.viewMode === ViewMode.MAP) {
			console.log('Switching from map to list view after selection')
			this.viewMode = ViewMode.LIST
			// Request update and wait for the next render cycle before proceeding
			this.requestUpdate()
			// Wait for the component to finish updating before processing selection
			this.updateComplete.then(() => {
				console.log('Processing selection after view switch')
				this.processCourtSelection(court, timeSlot)
			})
		} else {
			this.processCourtSelection(court, timeSlot)
		}
	}

	/**
	 * Process court selection and update booking context
	 * This method handles the UI updates and transitions after court selection
	 */
	private processCourtSelection(court: Court, timeSlot?: TimeSlot): void {
		console.log('processCourtSelection called for court:', court.name)
		
		// Check if we need to clear duration for non-fully available courts
		const availabilityStatus = this.getCourtAvailabilityStatus(court.id)
		const hasDuration = !!this.booking?.startTime && !!this.booking?.endTime
		
		if (availabilityStatus !== 'full' && hasDuration && !timeSlot) {
			// Update booking to clear duration
			bookingContext.set({
				endTime: '',
				price: 0
			}, true)

			// Notify user that duration was cleared
			$notify.info('Duration selection cleared. This court has limited availability.', {
				duration: 3000,
			})
		}

		// Note: timeSlot parameter is legacy and not used in current implementation

		// Reset dialog state if applicable
		this.pendingCourtSelection = null
		this.showConfirmationDialog = false

		// Highlight the selected court and scroll to it
		const courtEl = this.courtRefs.get(court.id)
		if (courtEl) {
			console.log('Animating court element in list view')
			courtEl.animate(PULSE_ANIMATION.keyframes, PULSE_ANIMATION.options)
			// Scroll to the selected court after a brief delay to ensure DOM is updated
			setTimeout(() => this.scrollToSelectedCourt(), 100)
		} else {
			console.log('Court element not found in list view (might be in map view)')
		}

		// Transition to the next step - this will handle expanded steps automatically
		console.log('Calling transitionToNextStep with "Court"')
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
		const venueCourts = this.selectedVenueCourts || []

		// Skip calculation if no courts available
		if (venueCourts.length === 0) {
			return []
		}

		// Calculate unique court types from available courts
		const courtTypes = new Set<CourtTypeEnum>()

		venueCourts.forEach(court => {
			if (court.courtType) {
				courtTypes.add(court.courtType as CourtTypeEnum)
			}
		})

		// Convert to array and return
		const uniqueTypes = Array.from(courtTypes)

		// Only return the array if there's more than one option
		return uniqueTypes.length > 1 ? uniqueTypes : []
	}

	/**
	 * Get unique player count options from all venue courts
	 * Only returns options if there's more than one unique value
	 */
	private getPlayerCountOptions(): number[] {
		// Get all courts for the current venue
		const venueCourts = this.selectedVenueCourts || []

		// Skip calculation if no courts available
		if (venueCourts.length === 0) {
			return []
		}

		// Calculate max players for each court and collect unique values
		const playerCounts = new Set<number>()

		venueCourts.forEach(court => {
			// Get max player count for each court
			const maxPlayers = this.getMaxPlayerCount(court)
			playerCounts.add(maxPlayers)
		})

		// Convert to array, sort, and return
		const uniqueCounts = Array.from(playerCounts).sort((a, b) => a - b)

		// Only return the array if there's more than one option
		return uniqueCounts.length > 1 ? uniqueCounts : []
	}

	/**
	 * Calculate the maximum player count for a court
	 * Based on sport type and court dimensions
	 */
	private getMaxPlayerCount(court: Court): number {
		// Check sport types of the court
		const sports = court.sportTypes || ['pickleball']

		// Determine max player count based on sport type
		if (sports.includes('volleyball')) {
			return 12 // Volleyball courts can support up to 12 players
		} else if (sports.includes('pickleball') || sports.includes('padel')) {
			return 4 // Pickleball and Padel typically allow up to 4 players
		}

		// For other sports or if no specific type, use court dimensions
		if (court.dimensions) {
			const area = court.dimensions.length * court.dimensions.width
			const areaInSquareMeters =
				court.dimensions.unit === 'feet'
					? area * 0.092903 // Convert sq feet to sq meters
					: area

			if (areaInSquareMeters >= 150) {
				return 6 // Large courts support 6+ players
			} else if (areaInSquareMeters >= 100) {
				return 4 // Medium courts support 4 players
			}
		}

		// Default for small courts or unknown dimensions
		return 2
	}

	/**
	 * Apply court preference filters to the list of courts
	 * Filters courts based on court type, player count, and other preferences
	 * Maintains the name-based sort order
	 */
	private applyCourtPreferenceFilters(courts: Court[]): Court[] {
		// If no filters are active, return courts in their current order (sorted by name)
		if (!this.getActiveFilterCount()) {
			return [...courts]
		}

		// For active filters, prioritize matching courts first
		// but maintain name sort within each group
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
		// Both groups maintain their name-based sorting from the input
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
			const courtEl = this.courtRefs.get(this.booking.courtId)
			if (!courtEl) return

			// For compact mode (horizontal scroll)
			if (!this.isActive) {
				const scrollContainer = this.scrollContainerRef.value
				if (!scrollContainer) return

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
			} else {
				// For grid mode (vertical scroll) - scroll the court element into view
				courtEl.scrollIntoView({
					behavior: 'smooth',
					block: 'center',
					inline: 'center',
				})
			}

			// Highlight the element after scrolling
			setTimeout(() => this.highlightCourtElement(courtEl), 300)
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
			'first:pl-2 last:pr-2': !this.isActive,
		}
	}

	//#endregion

	//#region Render Methods

	/**
	 * Render the filters section
	 */
	private renderFilters() {
		// Get dynamic court type options instead of using the enum directly
		const courtTypeOptions = this.getCourtTypeOptions()

		// Get dynamic player count options
		const playerCountOptions = this.getPlayerCountOptions()

		// Don't render filters if there are no courts or only one court
		if (this.selectedVenueCourts.length <= 1) return html``

		return html`
			<div class="px-1 pb-1">
				<!-- Combined filter chips in one line -->
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex flex-wrap gap-1.5">
						<schmancy-icon-button
							size="sm"
							variant="${this.viewMode === ViewMode.LIST ? 'filled' : 'text'}"
							@click=${() => this.toggleViewMode(ViewMode.LIST)}
							aria-pressed=${this.viewMode === ViewMode.LIST}
							aria-label="List view"
							>view_list
						</schmancy-icon-button>
						<schmancy-icon-button
							size="sm"
							variant="${this.viewMode === ViewMode.MAP ? 'filled' : 'text'}"
							@click=${() => this.toggleViewMode(ViewMode.MAP)}
							aria-pressed=${this.viewMode === ViewMode.MAP}
							aria-label="Map view"
							>
              map
              </schmancy-icon-button
						>

						<!-- Player Count Filters - Only shown if multiple options -->
						${playerCountOptions.length > 0
							? playerCountOptions.map(count => {
									// Label for the player count chip
									const label = count >= 6 ? '6+' : count.toString()
									const isSelected = this.courtPreferences.playerCount === count

									return html`
										<schmancy-chip .selected="${isSelected}" @click=${() => this.handlePlayerCountChipClick(count)}>
											<schmancy-icon slot="leading" size="16px">group</schmancy-icon>
											${label}
										</schmancy-chip>
									`
								})
							: ''}
					</div>

					<!-- View mode toggles - only show when active -->
					<div class="flex gap-1 shrink-0 ml-auto">
						<!-- Court Type Filters - Only shown if multiple options -->
						${courtTypeOptions.length > 0
							? courtTypeOptions.map(type => {
									const isSelected = this.isCourtTypeSelected(type)
									const typeIcon = type === 'indoor' ? 'home' : type === 'outdoor' ? 'wb_sunny' : 'sports_tennis'

									return html`
										<schmancy-chip .selected="${isSelected}" @click=${() => this.toggleCourtTypeFilter(type)}>
											<schmancy-icon slot="leading" size="16px">${typeIcon}</schmancy-icon>
											${this.formatCourtType(type)}
										</schmancy-chip>
									`
								})
							: ''}
					</div>
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
		// Check if any courts have map coordinates
		const courtsWithCoordinates = this.selectedVenueCourts.filter(c => c.mapCoordinates)

		if (courtsWithCoordinates.length > 0) {
			// Use Google Maps when courts have real coordinates
			return html`
				<court-map-google
					.courts=${this.selectedVenueCourts}
					.selectedCourtId=${this.booking?.courtId}
					.courtAvailability=${this.courtAvailability}
					.venueAddress=${this.venue?.address}
					.venueName=${this.venue?.name || 'Venue'}
				></court-map-google>
			`
		} else {
			// Fallback to list view when no map coordinates available
			return this.renderCourtsList()
		}
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
			<div class="bg-surface-container-low rounded-lg px-2 transition-all duration-300">
				${this.error
					? html`
							<div class="bg-error-container p-2 rounded-t-lg text-error-on-container text-sm text-center">
								${this.error}
								<button @click=${() => this.retryLoading()} class="ml-2 underline font-medium">Refresh</button>
							</div>
						`
					: ''}

				<!-- Court Filters - Only show when active -->
				<section class="block lg:hidden">${this.renderFilters()}</section>

				<!-- If active, show based on view mode, otherwise always show list view -->
				${cache(this.viewMode === ViewMode.MAP ? this.renderMapView() : this.renderCourtsList())}
			</div>
		`
	}

	//#endregion
}
