// src/public/book/tentative-court-assignment.ts

import { catchError, firstValueFrom, of } from 'rxjs'
import {
	CourtAssignmentService,
	CourtAssignmentStrategy,
	CourtPreferences,
} from 'src/bookingServices/court-assignment.service'
import { Court } from 'src/db/courts.collection'

/**
 * Handles tentative court assignment before duration selection
 * This allows showing accurate pricing specific to the court that will be assigned
 */
export class TentativeCourtAssignment {
	constructor(private courtAssignmentService: CourtAssignmentService) {}

	/**
	 * Find the best matching court based on preferences without committing to booking it
	 *
	 * @param date Booking date
	 * @param startTimeMinutes Start time in minutes from midnight
	 * @param availableCourts Available courts
	 * @param preferences User preferences
	 * @returns The best matching court or null if none available
	 */
	async findBestMatchingCourt(
		date: string,
		startTimeMinutes: number,
		availableCourts: Court[],
		preferences: CourtPreferences,
	): Promise<Court | null> {
		try {
			// Use a small duration (30 minutes) just to check availability
			// The actual pricing will be calculated per duration
			const tentativeDuration = 30

			// Convert courts array if needed
			const courtsArray = availableCourts

			if (courtsArray.length === 0) {
				console.log('No courts available for tentative assignment')
				return null
			}

			// Check for available courts with minimal duration
			const result = await firstValueFrom(
				this.courtAssignmentService
					.checkAndAssignCourt(
						date,
						startTimeMinutes,
						tentativeDuration,
						courtsArray,
						CourtAssignmentStrategy.PREFERENCE_BASED,
						preferences,
					)
					.pipe(
						catchError(error => {
							console.error('Error finding best matching court:', error)
							return of({
								selectedCourt: null,
								alternativeCourts: [],
								message: 'Error finding available courts: ' + error.message,
							})
						}),
					),
			)

			if (result.selectedCourt) {
				console.log('Tentative court assigned:', result.selectedCourt.name)
				return result.selectedCourt
			} else if (result.alternativeCourts && result.alternativeCourts.length > 0) {
				// If primary court not available but alternatives are, use the first alternative
				console.log('Using alternative court for pricing:', result.alternativeCourts[0].name)
				return result.alternativeCourts[0]
			}

			// As a last resort, just return any active court for pricing estimation
			const anyActiveCourt = courtsArray.find(court => court.status === 'active')
			if (anyActiveCourt) {
				console.log('Using any active court for pricing estimation:', anyActiveCourt.name)
				return anyActiveCourt
			}

			return null
		} catch (error) {
			console.error('Error in tentative court assignment:', error)
			return null
		}
	}
}
