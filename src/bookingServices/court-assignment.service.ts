import dayjs from 'dayjs'
import { map, Observable, of } from 'rxjs'

// Preferences for court selection
export interface CourtSelectionPreferencesType {
	preferredSurface?: string // e.g., "clay", "grass", "hard"
	indoor?: boolean // preference for indoor courts
	preferredCourtId?: string // specific court if user has a favorite
	accessibilityRequired?: boolean // need accessible facilities
	lightingRequired?: boolean // need courts with lighting
	balancedSelection?: boolean // try to distribute load across courts
}

export class CourtSelectionPreferences implements CourtSelectionPreferencesType {
	preferredSurface: string | undefined = undefined // e.g., "clay", "grass", "hard"
	indoor: boolean | undefined = undefined // preference for indoor courts
	preferredCourtId: string | undefined = undefined // specific court if user has a favorite
	accessibilityRequired: boolean = false // need accessible facilities
	lightingRequired: boolean = false // need courts with lighting
	balancedSelection: boolean = false // try to distribute load across courts

	constructor(preferences: CourtSelectionPreferencesType = {}) {
		Object.assign(this, preferences)
	}
}

// Assignment strategy options
export enum CourtAssignmentStrategy {
	FIRST_AVAILABLE = 'first-available', // Simple first available
	PREFERRED_SURFACE = 'preferred-surface', // Prioritize surface type
	BALANCED = 'balanced', // Distribute bookings evenly
	OPTIMAL = 'optimal', // Use scoring algorithm
}

// Define Court interface to represent court object
export interface Court {
	id: string
	name?: string
	surface?: string
	indoor?: boolean
	accessible?: boolean
	hasLighting?: boolean
	available?: boolean
	// Add other court properties as needed
}

// Define AvailabilityService interface to type availabilityService dependency
export interface AvailabilityService {
	getAllCourtsAvailability: (
		date: string,
	) => Observable<{ [courtId: string]: { [timeSlot: string]: { isAvailable: boolean } } } | undefined>
}

/**
 * RxJS-based service for court availability checking and assignment
 * Provides multiple assignment strategies and preference options
 */
export class CourtAssignmentService {
	// Track booking frequency for balanced assignment
	private _courtBookingCounts: Map<string, number> = new Map()

	/**
	 * Initialize the service with a dependency
	 * @param {AvailabilityService} availabilityService - Service to check court availability
	 */
	constructor(private availabilityService: AvailabilityService) {}

	/**
	 * Reset booking count statistics
	 */
	resetBookingCounts(): void {
		this._courtBookingCounts.clear()
	}

	/**
	 * Increment booking count for a court
	 * @param {string} courtId - Court identifier
	 */
	incrementCourtBookingCount(courtId: string): void {
		const currentCount = this._courtBookingCounts.get(courtId) || 0
		this._courtBookingCounts.set(courtId, currentCount + 1)
	}

	/**
	 * Checks court availability for a specific date, time slot and duration
	 *
	 * @param {string} date - Booking date (YYYY-MM-DD format)
	 * @param {number} startTime - Start time in minutes (e.g., 9:30 AM = 9*60 + 30 = 570)
	 * @param {number} duration - Duration in minutes
	 * @param {Court[]} allCourts - Complete list of courts in the system
	 * @returns {Observable<Court[]>} Observable with filtered list of available courts
	 */
	getAvailableCourts(date: string, startTime: number, duration: number, allCourts: Court[]): Observable<Court[]> {
		try {
			// Format date for API
			const formattedDate = this._formatDate(date)

			// Calculate time slots that need to be checked
			const startHour = Math.floor(startTime / 60)
			const endTimeMinutes = startTime + duration
			const endHour = Math.floor(endTimeMinutes / 60)

			// Get availability data from API
			return this.availabilityService.getAllCourtsAvailability(formattedDate).pipe(
				map(courtsAvailability => {
					// If no availability data, assume all courts are available
					if (!courtsAvailability || Object.keys(courtsAvailability).length === 0) {
						return allCourts.map(court => ({ ...court, available: true }))
					}

					// Create a map to track availability status for each court
					const courtAvailabilityMap: Map<string, boolean> = new Map()

					// Process availability data for each court
					for (const [courtId, slots] of Object.entries(courtsAvailability)) {
						let isAvailable = true

						// Check each hour slot in the booking time range
						for (let h = startHour; h < endHour; h++) {
							const timeKey = `${h.toString().padStart(2, '0')}:00`

							// Need to check for half-hour slots if the start/end times aren't on the hour
							const halfHourKey = `${h.toString().padStart(2, '0')}:30`

							// If either slot exists and is marked unavailable, court is not available
							if (
								(slots[timeKey] && !slots[timeKey].isAvailable) ||
								(slots[halfHourKey] && !slots[halfHourKey].isAvailable)
							) {
								isAvailable = false
								break
							}
						}

						// Check the end hour if it lands on a half-hour
						if (endTimeMinutes % 60 > 0 && isAvailable) {
							const endHourKey = `${endHour.toString().padStart(2, '0')}:00`
							if (slots[endHourKey] && !slots[endHourKey].isAvailable) {
								isAvailable = false
							}
						}

						// Store the availability status for this court
						courtAvailabilityMap.set(courtId, isAvailable)
					}

					// Map the full court objects with availability status
					return allCourts.map(court => {
						// Court is available if explicitly marked available or not mentioned in availability data
						const available = courtAvailabilityMap.has(court.id) ? courtAvailabilityMap.get(court.id) : true

						return { ...court, available }
					})
				}),
			)
		} catch (error) {
			console.error('Error checking court availability:', error)
			// On error, assume all courts are available as fallback
			return of(allCourts.map(court => ({ ...court, available: true })))
		}
	}

	/**
	 * Assigns a court using the specified strategy
	 *
	 * @param {Court[]} availableCourts - List of courts with availability status
	 * @param {CourtAssignmentStrategy} strategy - Court assignment strategy to use
	 * @param {CourtSelectionPreferencesType} preferences - User preferences for court selection
	 * @returns {Court | null} The selected court or null if none available
	 */
	assignCourt(
		availableCourts: Court[],
		strategy: CourtAssignmentStrategy = CourtAssignmentStrategy.OPTIMAL,
		preferences: CourtSelectionPreferencesType = {},
	): Court | null {
		if (!availableCourts || availableCourts.length === 0) {
			return null
		}

		// Filter to get only available courts
		const availableCourtsFiltered = availableCourts.filter(court => court.available)

		if (availableCourtsFiltered.length === 0) {
			return null
		}

		// If user has specified a preferred court and it's available, select it
		if (preferences.preferredCourtId) {
			const preferredCourt = availableCourtsFiltered.find(court => court.id === preferences.preferredCourtId)

			if (preferredCourt) {
				this.incrementCourtBookingCount(preferredCourt.id)
				return preferredCourt
			}
		}

		// Use the requested assignment strategy
		switch (strategy) {
			case CourtAssignmentStrategy.FIRST_AVAILABLE:
				return this._assignFirstAvailable(availableCourtsFiltered)

			case CourtAssignmentStrategy.PREFERRED_SURFACE:
				return this._assignBySurface(availableCourtsFiltered, preferences)

			case CourtAssignmentStrategy.BALANCED:
				return this._assignBalanced(availableCourtsFiltered)

			case CourtAssignmentStrategy.OPTIMAL:
			default:
				return this._assignOptimal(availableCourtsFiltered, preferences)
		}
	}

	/**
	 * Format a date string to YYYY-MM-DD
	 * @private
	 */
	private _formatDate(date: string | Date): string {
		if (!date) return ''
		// Use native Date formatting or a date library
		if (typeof date === 'string') {
			// Simple format for YYYY-MM-DD
			return date
		}

		// If using dayjs (assuming dayjs is globally available or imported)
		return dayjs(date).format('YYYY-MM-DD')
	}

	/**
	 * Simple strategy: select the first available court
	 * @private
	 */
	private _assignFirstAvailable(courts: Court[]): Court | null {
		if (courts.length === 0) return null

		const selectedCourt = courts[0]
		this.incrementCourtBookingCount(selectedCourt.id)
		return selectedCourt
	}

	/**
	 * Surface-based strategy: prioritize courts with the preferred surface
	 * @private
	 */
	private _assignBySurface(courts: Court[], preferences: CourtSelectionPreferencesType = {}): Court | null {
		if (courts.length === 0) return null

		// If no surface preference, just return first available
		if (!preferences.preferredSurface) {
			return this._assignFirstAvailable(courts)
		}

		// Try to find a court with the preferred surface
		const matchingSurfaceCourt = courts.find(court => court.surface === preferences.preferredSurface)

		// Return the matching court, or fall back to first available
		const selectedCourt = matchingSurfaceCourt || courts[0]
		this.incrementCourtBookingCount(selectedCourt.id)
		return selectedCourt
	}

	/**
	 * Balanced strategy: distribute bookings evenly across all courts
	 * @private
	 */
	private _assignBalanced(courts: Court[]): Court | null {
		if (courts.length === 0) return null

		// Sort courts by booking count (ascending)
		const sortedCourts = [...courts].sort((a, b) => {
			const countA = this._courtBookingCounts.get(a.id) || 0
			const countB = this._courtBookingCounts.get(b.id) || 0
			return countA - countB
		})

		// Select the court with the lowest booking count
		const selectedCourt = sortedCourts[0]
		this.incrementCourtBookingCount(selectedCourt.id)
		return selectedCourt
	}

	/**
	 * Optimal strategy: use a scoring algorithm based on multiple factors
	 * @private
	 */
	private _assignOptimal(courts: Court[], preferences: CourtSelectionPreferencesType = {}): Court | null {
		if (courts.length === 0) return null

		// Score each court based on various factors
		const scoredCourts = courts.map(court => {
			let score = 0

			// Factor 1: Surface preference
			if (preferences.preferredSurface && court.surface === preferences.preferredSurface) {
				score += 10
			}

			// Factor 2: Indoor/outdoor preference
			if (preferences.indoor !== undefined && court.indoor === preferences.indoor) {
				score += 8
			}

			// Factor 3: Accessibility
			if (preferences.accessibilityRequired && court.accessible) {
				score += 20 // High priority for accessibility needs
			}

			// Factor 4: Lighting
			if (preferences.lightingRequired && court.hasLighting) {
				score += 15
			}

			// Factor 5: Even distribution (if requested)
			if (preferences.balancedSelection) {
				// Courts with fewer bookings get a higher score
				const bookingCount = this._courtBookingCounts.get(court.id) || 0
				score += Math.max(10 - bookingCount, 0)
			}

			return { court, score }
		})

		// Sort by score (descending)
		scoredCourts.sort((a, b) => b.score - a.score)

		console.log('Scored courts:', scoredCourts)
		console.log('Booking counts:', this._courtBookingCounts)
		// Select the highest scoring court
		const selectedCourt = scoredCourts[0].court
		this.incrementCourtBookingCount(selectedCourt.id)
		return selectedCourt
	}

	/**
	 * Combined method to check availability and assign a court in one call
	 *
	 * @param {string} date - Booking date
	 * @param {number} startTime - Start time in minutes
	 * @param {number} duration - Duration in minutes
	 * @param {Court[]} allCourts - Complete list of courts
	 * @param {CourtAssignmentStrategy} strategy - Assignment strategy to use
	 * @param {CourtSelectionPreferencesType} preferences - Court selection preferences
	 * @returns {Observable<{ availableCourts: Court[]; selectedCourt: Court | null }>} Observable with available courts and selected court
	 */
	checkAndAssignCourt(
		date: string,
		startTime: number,
		duration: number,
		allCourts: Court[],
		strategy: CourtAssignmentStrategy = CourtAssignmentStrategy.OPTIMAL,
		preferences: CourtSelectionPreferencesType = {},
	): Observable<{ availableCourts: Court[]; selectedCourt: Court | null }> {
		return this.getAvailableCourts(date, startTime, duration, allCourts).pipe(
			map(availableCourts => {
				const selectedCourt = this.assignCourt(availableCourts, strategy, preferences)

				return {
					availableCourts,
					selectedCourt,
				}
			}),
		)
	}
}
