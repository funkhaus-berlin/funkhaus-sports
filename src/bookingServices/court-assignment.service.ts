// src/bookingServices/court-assignment.service.ts
import { Observable, catchError, map, of } from 'rxjs'
import { Court, SportTypeEnum } from '../db/courts.collection'
import { AvailabilityService } from './availability.service'

/**
 * Available court assignment strategies
 */
export enum CourtAssignmentStrategy {
	/**
	 * Assigns the first available court
	 */
	FIRST_AVAILABLE = 'firstAvailable',

	/**
	 * Assigns the court with the lowest hourly rate
	 */
	LOWEST_PRICE = 'lowestPrice',

	/**
	 * Assigns the optimal court based on multiple factors
	 */
	OPTIMAL = 'optimal',

	/**
	 * Assigns a specific court if available
	 */
	SPECIFIC = 'specific',
}

/**
 * Court assignment preferences
 */
export interface CourtAssignmentPreferences {
	preferredCourtId?: string
	preferredCourtType?: string
	preferredSportType?: string
}

/**
 * Result of court assignment
 */
export interface CourtAssignmentResult {
	selectedCourt: Court | null
	availableCourts: Court[]
	isAvailable: boolean
}

/**
 * Service to handle automatic court assignment
 * Uses different strategies to find the best court for a booking
 */
export class CourtAssignmentService {
	constructor(private availabilityService: AvailabilityService) {}

	/**
	 * Check availability and assign a court for a specific time and duration
	 *
	 * @param date - Booking date (YYYY-MM-DD)
	 * @param startTime - Start time in minutes
	 * @param durationMinutes - Duration in minutes
	 * @param courts - Array of available courts
	 * @param strategy - Court assignment strategy
	 * @param preferences - User preferences for court assignment
	 * @returns Observable with assignment result
	 */
	checkAndAssignCourt(
		date: string,
		startTime: number,
		durationMinutes: number,
		courts: Court[],
		strategy: CourtAssignmentStrategy = CourtAssignmentStrategy.OPTIMAL,
		preferences: CourtAssignmentPreferences = {},
	): Observable<CourtAssignmentResult> {
		// Get availability for all courts on this date
		return this.availabilityService.getAllCourtsAvailability(date).pipe(
			map(courtAvailability => {
				// Filter courts that have the required availability
				const availableCourts = courts.filter(court => {
					// Skip inactive courts
					if (court.status !== 'active') return false

					// If court doesn't have availability data, consider it available
					if (!courtAvailability[court.id]) return true

					// Check each hour in the time range
					const startHour = Math.floor(startTime / 60)
					const endHour = Math.ceil((startTime + durationMinutes) / 60)

					for (let hour = startHour; hour < endHour; hour++) {
						const timeSlot = `${hour.toString().padStart(2, '0')}:00`
						// If time slot doesn't exist or is not available, court is not available
						if (courtAvailability[court.id][timeSlot] && !courtAvailability[court.id][timeSlot].isAvailable) {
							return false
						}
					}

					return true
				})

				// If no courts available, return null
				if (availableCourts.length === 0) {
					return {
						selectedCourt: null,
						availableCourts: [],
						isAvailable: false,
					}
				}

				// Assign court based on strategy
				let selectedCourt: Court

				switch (strategy) {
					case CourtAssignmentStrategy.FIRST_AVAILABLE:
						selectedCourt = availableCourts[0]
						break

					case CourtAssignmentStrategy.LOWEST_PRICE:
						// Sort by price and pick the cheapest
						selectedCourt = [...availableCourts].sort(
							(a, b) => (a.pricing?.baseHourlyRate ?? 0) - (b.pricing?.baseHourlyRate ?? 0),
						)[0]
						break

					case CourtAssignmentStrategy.SPECIFIC:
						// Try to assign the preferred court if available
						if (preferences.preferredCourtId) {
							const preferred = availableCourts.find(c => c.id === preferences.preferredCourtId)
							if (preferred) {
								selectedCourt = preferred
								break
							}
						}
					// If not found or no preference, fall through to OPTIMAL strategy

					case CourtAssignmentStrategy.OPTIMAL:
					default:
						// Apply weighted scoring to find optimal court
						selectedCourt = this.findOptimalCourt(availableCourts, preferences)
						break
				}

				return {
					selectedCourt,
					availableCourts,
					isAvailable: true,
				}
			}),
			catchError(error => {
				console.error('Error assigning court:', error)
				return of({
					selectedCourt: null,
					availableCourts: [],
					isAvailable: false,
				})
			}),
		)
	}

	/**
	 * Find the optimal court based on multiple factors
	 * Uses a scoring system to rank courts
	 *
	 * @param availableCourts - Array of available courts
	 * @param preferences - User preferences
	 * @returns The optimal court
	 */
	private findOptimalCourt(availableCourts: Court[], preferences: CourtAssignmentPreferences): Court {
		// If only one court is available, return it
		if (availableCourts.length === 1) {
			return availableCourts[0]
		}

		// Define weights for different factors
		const weights = {
			courtType: 3, // Weight for matching court type
			sportType: 4, // Weight for matching sport type
			price: 2, // Weight for price (inverse)
		}

		// Calculate scores for each court
		const scoredCourts = availableCourts.map(court => {
			let score = 0

			// Court type match
			if (preferences.preferredCourtType && court.courtType === preferences.preferredCourtType) {
				score += weights.courtType
			}

			// Sport type match
			if (
				preferences.preferredSportType &&
				court.sportTypes?.includes(preferences.preferredSportType as SportTypeEnum)
			) {
				score += weights.sportType
			}

			// Price factor (lower price = higher score)
			const maxRate = Math.max(...availableCourts.map(c => c.pricing?.baseHourlyRate ?? 0))
			if (maxRate > 0) {
				const priceScore = 1 - (court.pricing?.baseHourlyRate ?? 0) / maxRate
				score += priceScore * weights.price
			}

			return { court, score }
		})

		// Sort by score (descending) and return the best match
		scoredCourts.sort((a, b) => b.score - a.score)
		return scoredCourts[0].court
	}
}
