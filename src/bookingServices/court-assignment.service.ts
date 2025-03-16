// src/bookingServices/court-assignment.service.ts

import { Observable, of } from 'rxjs'
import { catchError, map } from 'rxjs/operators'
import { Court } from 'src/db/courts.collection'
import { AvailabilityService } from './availability'
import { TimeSlotStatus } from './availability.model'

/**
 * Different strategies for court assignment
 */
export enum CourtAssignmentStrategy {
	// Assign first available court
	FIRST_AVAILABLE = 'first_available',
	// Find the optimal court based on various factors
	OPTIMAL = 'optimal',
	// Honor user preferences first, then fall back to optimal
	PREFERENCE_BASED = 'preference_based',
}

/**
 * Interface for user preferences when assigning courts
 */
export interface CourtPreferences {
	preferredCourtTypes?: string[]
	preferredSportTypes?: string[]
	preferredCourtIds?: string[]
	preferOutdoor?: boolean
	preferIndoor?: boolean
	priceRange?: {
		min?: number
		max?: number
	}
}

/**
 * Result of court assignment
 */
export interface CourtAssignmentResult {
	selectedCourt: Court | null
	alternativeCourts: Court[]
	message: string
}

/**
 * Service responsible for assigning courts based on availability and preferences
 */
export class CourtAssignmentService {
	constructor(private availabilityService: AvailabilityService) {}

	/**
	 * Check and assign the best court for a given time and duration
	 *
	 * @param date - Booking date (YYYY-MM-DD)
	 * @param startTimeMinutes - Start time in minutes from midnight
	 * @param durationMinutes - Duration in minutes
	 * @param availableCourts - List of all available courts
	 * @param strategy - Court assignment strategy
	 * @param preferences - User court preferences (optional)
	 * @returns Observable of assignment result
	 */
	checkAndAssignCourt(
		date: string,
		startTimeMinutes: number,
		durationMinutes: number,
		availableCourts: Court[],
		strategy: CourtAssignmentStrategy = CourtAssignmentStrategy.OPTIMAL,
		preferences: CourtPreferences = {},
	): Observable<CourtAssignmentResult> {
		// Format the start time
		const hour = Math.floor(startTimeMinutes / 60)
		const minute = startTimeMinutes % 60
		const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`

		// Convert courts to array if it's a Map
		const courtsArray =
			availableCourts instanceof Map
				? Array.from(availableCourts.values())
				: Array.isArray(availableCourts)
				? availableCourts
				: []

		// If no courts provided, return empty result
		if (!courtsArray || courtsArray.length === 0) {
			return of({
				selectedCourt: null,
				alternativeCourts: [],
				message: 'No courts available for booking',
			})
		}

		// Get all courts availability first
		return this.availabilityService.getAllCourtsAvailability(date).pipe(
			map(allCourtsAvailability => {
				const availableCourtsByStrategy = this.findAvailableCourtsByStrategy(
					courtsArray,
					allCourtsAvailability,
					startTime,
					durationMinutes,
					strategy,
					preferences,
				)

				if (availableCourtsByStrategy.length === 0) {
					return {
						selectedCourt: null,
						alternativeCourts: [],
						message: 'No courts available for the selected time and duration',
					}
				}

				// Select the first court from the filtered list as the primary selection
				const selectedCourt = availableCourtsByStrategy[0]
				const alternativeCourts = availableCourtsByStrategy.slice(1)

				return {
					selectedCourt,
					alternativeCourts,
					message: 'Court assigned successfully',
				}
			}),
			catchError(error => {
				console.error('Error assigning court:', error)
				return of({
					selectedCourt: null,
					alternativeCourts: [],
					message: 'Error assigning court: ' + error.message,
				})
			}),
		)
	}

	/**
	 * Find available courts based on the selected strategy
	 *
	 * @param courts - List of all courts
	 * @param allCourtsAvailability - Availability data for all courts
	 * @param startTime - Start time (HH:MM)
	 * @param durationMinutes - Duration in minutes
	 * @param strategy - Assignment strategy
	 * @param preferences - User preferences
	 * @returns Array of courts sorted by strategy
	 */
	private findAvailableCourtsByStrategy(
		courts: Court[],
		allCourtsAvailability: Record<string, Record<string, TimeSlotStatus>>,
		startTime: string,
		durationMinutes: number,
		strategy: CourtAssignmentStrategy,
		preferences: CourtPreferences,
	): Court[] {
		// Filter to active courts only
		const activeCourts = courts.filter(court => court.status === 'active')

		// Filter courts that have all required time slots available
		const availableCourts = activeCourts.filter(court => {
			const courtId = court.id
			const courtAvailability = allCourtsAvailability[courtId]

			if (!courtAvailability) {
				return false
			}

			// Calculate time slots needed based on duration
			const [startHour, startMinute] = startTime.split(':').map(Number)
			const startMinutes = startHour * 60 + startMinute
			const endMinutes = startMinutes + durationMinutes

			// Check every 30-minute slot within the range
			for (let minute = startMinutes; minute < endMinutes; minute += 30) {
				const hour = Math.floor(minute / 60)
				const mins = minute % 60
				const timeSlot = `${hour.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`

				if (!courtAvailability[timeSlot] || !courtAvailability[timeSlot].isAvailable) {
					return false
				}
			}

			return true
		})

		// If no courts available after filtering, return empty array
		if (availableCourts.length === 0) {
			return []
		}

		// Apply strategy-specific sorting
		switch (strategy) {
			case CourtAssignmentStrategy.FIRST_AVAILABLE:
				// Just return the first available court
				return availableCourts

			case CourtAssignmentStrategy.PREFERENCE_BASED:
				// Apply user preferences
				return this.sortCourtsByPreferences(availableCourts, preferences)

			case CourtAssignmentStrategy.OPTIMAL:
			default:
				// Find optimal court based on multiple factors
				return this.findOptimalCourts(availableCourts, preferences)
		}
	}

	/**
	 * Sort courts based on user preferences
	 *
	 * @param courts - Available courts
	 * @param preferences - User preferences
	 * @returns Sorted array of courts
	 */
	private sortCourtsByPreferences(courts: Court[], preferences: CourtPreferences): Court[] {
		return [...courts].sort((a, b) => {
			let scoreA = 0
			let scoreB = 0

			// Check court type preference
			if (preferences.preferredCourtTypes?.includes(a.courtType || '')) {
				scoreA += 10
			}
			if (preferences.preferredCourtTypes?.includes(b.courtType || '')) {
				scoreB += 10
			}

			// Check sport type preference
			const aSportMatches = a.sportTypes?.filter(sport => preferences.preferredSportTypes?.includes(sport)).length || 0
			const bSportMatches = b.sportTypes?.filter(sport => preferences.preferredSportTypes?.includes(sport)).length || 0

			scoreA += aSportMatches * 5
			scoreB += bSportMatches * 5

			// Check specific court preference
			if (preferences.preferredCourtIds?.includes(a.id)) {
				scoreA += 20
			}
			if (preferences.preferredCourtIds?.includes(b.id)) {
				scoreB += 20
			}

			// Check indoor/outdoor preference
			if (preferences.preferIndoor && a.courtType === 'indoor') {
				scoreA += 15
			}
			if (preferences.preferIndoor && b.courtType === 'indoor') {
				scoreB += 15
			}

			if (preferences.preferOutdoor && a.courtType === 'outdoor') {
				scoreA += 15
			}
			if (preferences.preferOutdoor && b.courtType === 'outdoor') {
				scoreB += 15
			}

			// Check price preference
			const aPrice = a.pricing?.baseHourlyRate || 0
			const bPrice = b.pricing?.baseHourlyRate || 0

			if (preferences.priceRange) {
				const { min, max } = preferences.priceRange

				if (min !== undefined && max !== undefined) {
					// Both min and max specified
					if (aPrice >= min && aPrice <= max) {
						scoreA += 8
					}
					if (bPrice >= min && bPrice <= max) {
						scoreB += 8
					}
				} else if (min !== undefined) {
					// Only min specified
					if (aPrice >= min) {
						scoreA += 5
					}
					if (bPrice >= min) {
						scoreB += 5
					}
				} else if (max !== undefined) {
					// Only max specified
					if (aPrice <= max) {
						scoreA += 5
					}
					if (bPrice <= max) {
						scoreB += 5
					}
				}
			}

			// Higher score is better
			return scoreB - scoreA
		})
	}

	/**
	 * Find optimal courts based on multiple factors
	 *
	 * @param courts - Available courts
	 * @param preferences - User preferences
	 * @returns Sorted array of courts
	 */
	private findOptimalCourts(courts: Court[], preferences: CourtPreferences): Court[] {
		// If preferences are provided, use preference-based sorting
		if (Object.keys(preferences).length > 0) {
			return this.sortCourtsByPreferences(courts, preferences)
		}

		// Otherwise, use a balanced approach:
		// 1. Prioritize "standard" court types that are appropriate for most sports
		// 2. Prefer courts with medium price range (not too expensive, not too cheap)
		// 3. Prefer indoor courts (more predictable conditions)

		return [...courts].sort((a, b) => {
			// Start with neutral scores
			let scoreA = 0
			let scoreB = 0

			// Standard court type bonus
			// if (a.courtType === 'standard' || a.courtType === 'multi-purpose') {
			// 	scoreA += 5
			// }
			// if (b.courtType === 'standard' || b.courtType === 'multi-purpose') {
			// 	scoreB += 5
			// }

			// Indoor court bonus (better for all weather conditions)
			if (a.courtType === 'indoor') {
				scoreA += 3
			}
			if (b.courtType === 'indoor') {
				scoreB += 3
			}

			// Price factor - prefer middle range
			const aPrice = a.pricing?.baseHourlyRate || 0
			const bPrice = b.pricing?.baseHourlyRate || 0

			// Calculate score based on price - assume average price around 40
			// Score highest for courts around 40, lower for courts much cheaper or more expensive
			const idealPrice = 40
			const aPriceDiff = Math.abs(aPrice - idealPrice)
			const bPriceDiff = Math.abs(bPrice - idealPrice)

			// Inverse relationship - smaller difference = higher score
			scoreA += Math.max(0, 10 - aPriceDiff / 5)
			scoreB += Math.max(0, 10 - bPriceDiff / 5)

			// Higher score is better
			return scoreB - scoreA
		})
	}
}
