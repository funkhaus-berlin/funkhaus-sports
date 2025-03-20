// // src/public/book/tentative-court-assignment.ts
// import { catchError, firstValueFrom, Observable, of, timeout } from 'rxjs'
// import {
// 	CourtAssignmentService,
// 	CourtAssignmentStrategy,
// 	CourtPreferences,
// } from 'src/bookingServices/court-assignment.service'
// import { Court } from 'src/db/courts.collection'

// /**
//  * Handles tentative court assignment before duration selection
//  * This allows showing accurate pricing specific to the court that will be assigned
//  */
// export class TentativeCourtAssignment {
// 	// Timeout for court assignment operations (5 seconds)
// 	private readonly ASSIGNMENT_TIMEOUT = 5000

// 	constructor(private courtAssignmentService: CourtAssignmentService) {}

// 	/**
// 	 * Find the best matching court based on preferences without committing to booking it
// 	 *
// 	 * @param date Booking date
// 	 * @param startTimeMinutes Start time in minutes from midnight
// 	 * @param availableCourts Available courts
// 	 * @param preferences User preferences
// 	 * @returns The best matching court or null if none available
// 	 */
// 	async findBestMatchingCourt(
// 		date: string,
// 		startTimeMinutes: number,
// 		availableCourts: Court[],
// 		preferences: CourtPreferences,
// 	): Promise<Court | null> {
// 		// Validate inputs first to catch issues early
// 		if (!date || !availableCourts || availableCourts.length === 0) {
// 			console.log('Invalid inputs for tentative court assignment')
// 			return null
// 		}

// 		try {
// 			// Use a small duration (30 minutes) just to check availability
// 			// The actual pricing will be calculated per duration
// 			const tentativeDuration = 30

// 			// Convert and filter courts array
// 			const courtsArray = availableCourts.filter(court => court.status === 'active')

// 			if (courtsArray.length === 0) {
// 				console.log('No active courts available for tentative assignment')
// 				return null
// 			}

// 			// Create an observable for the court assignment
// 			const assignmentObservable = this.createCourtAssignmentObservable(
// 				date,
// 				startTimeMinutes,
// 				tentativeDuration,
// 				courtsArray,
// 				preferences,
// 			)

// 			// Use firstValueFrom to await the result with a timeout
// 			const result = await firstValueFrom(assignmentObservable)

// 			if (result.selectedCourt) {
// 				console.log('Tentative court assigned:', result.selectedCourt.name)
// 				return result.selectedCourt
// 			} else if (result.alternativeCourts && result.alternativeCourts.length > 0) {
// 				// If primary court not available but alternatives are, use the first alternative
// 				console.log('Using alternative court for pricing:', result.alternativeCourts[0].name)
// 				return result.alternativeCourts[0]
// 			}

// 			// As a last resort, just return any active court for pricing estimation
// 			const anyActiveCourt = courtsArray.find(court => court.status === 'active')
// 			if (anyActiveCourt) {
// 				console.log('Using any active court for pricing estimation:', anyActiveCourt.name)
// 				return anyActiveCourt
// 			}

// 			console.log('No suitable court found for tentative assignment')
// 			return null
// 		} catch (error) {
// 			console.error('Error in tentative court assignment:', error)
// 			// Don't rethrow - return null to allow graceful fallback
// 			return null
// 		}
// 	}

// 	/**
// 	 * Create an observable that handles the court assignment with proper error handling and timeout
// 	 */
// 	private createCourtAssignmentObservable(
// 		date: string,
// 		startTimeMinutes: number,
// 		duration: number,
// 		courts: Court[],
// 		preferences: CourtPreferences,
// 	): Observable<any> {
// 		return this.courtAssignmentService
// 			.checkAndAssignCourt(
// 				date,
// 				startTimeMinutes,
// 				duration,
// 				courts,
// 				CourtAssignmentStrategy.PREFERENCE_BASED,
// 				preferences,
// 			)
// 			.pipe(
// 				// Add timeout to prevent hanging
// 				timeout(this.ASSIGNMENT_TIMEOUT),

// 				// Properly handle errors without crashing
// 				catchError(error => {
// 					console.warn('Court assignment error:', error)
// 					// Return a structured error result that won't crash the component
// 					return of({
// 						selectedCourt: null,
// 						alternativeCourts: [],
// 						message: error.message || 'Error finding available court',
// 					})
// 				}),
// 			)
// 	}
// }
