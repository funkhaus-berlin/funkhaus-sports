import dayjs from 'dayjs'
import { defer, Observable, of, delay as rxjsDelay, throwError } from 'rxjs'
import { catchError, concatMap, retry, timeout } from 'rxjs/operators'

import { AvailabilityService } from 'src/bookingServices/availability'
import {
	CourtAssignmentService,
	CourtAssignmentStrategy,
	CourtPreferences,
} from 'src/bookingServices/court-assignment.service'
import { pricingService } from 'src/bookingServices/dynamic-pricing-service'
import { Court } from 'src/db/courts.collection'
import { Booking } from './context'
import { BookingErrorHandler } from './error-handler'

/**
 * Result from the court assignment process
 */
export interface CourtAssignmentResult {
	success: boolean
	court?: Court
	price?: number
	endTime?: string
	error?: string
	venueId?: string
}

/**
 * Handles court assignment logic and related operations
 * Uses RxJS to prevent race conditions and provide better error handling
 */
export class CourtAssignmentHandler {
	// Time to wait for availability check before timing out (ms)
	private readonly AVAILABILITY_CHECK_TIMEOUT = 10000

	// Maximum retries for transient errors
	private readonly MAX_RETRIES = 2

	private errorHandler = new BookingErrorHandler()
	private availabilityService: AvailabilityService

	constructor(private courtAssignmentService: CourtAssignmentService) {
		this.availabilityService = new AvailabilityService()
	}

	/**
	 * Assign a court based on preferences and availability
	 * Uses RxJS to handle asynchronous operations and prevent race conditions
	 *
	 * @param booking The booking data
	 * @param duration Duration in minutes
	 * @param availableCourts Array of available courts
	 * @param preferences User preferences
	 * @param tentativeCourt Optional tentatively assigned court
	 * @returns Observable of the court assignment result
	 */
	assignCourt(
		booking: Booking,
		duration: number,
		availableCourts: Court[],
		preferences: CourtPreferences,
		tentativeCourt?: Court | null,
	): Observable<CourtAssignmentResult> {
		// Validate required booking data
		if (!booking.date || !booking.startTime) {
			return throwError(() => new Error('Booking date and start time are required'))
		}

		// Validate courts array
		const courtsArray = Array.from(availableCourts)
		if (courtsArray.length === 0) {
			return throwError(() => new Error('No courts available to book'))
		}

		// Calculate times
		const startTime = dayjs(booking.startTime)
		const startMinutes = startTime.hour() * 60 + startTime.minute()
		const endTime = startTime.add(duration, 'minute').toISOString()

		// Create the assignment pipeline
		return defer(() => {
			// Step 1: Try to use the tentative court if available
			if (tentativeCourt) {
				console.log('Checking if tentative court is still available:', tentativeCourt.name)

				// Check if the tentatively assigned court is still available
				return this.availabilityService
					.isCourtAvailableForTimeRange(booking.date, tentativeCourt.id, startTime.toISOString(), endTime)
					.pipe(
						// Add timeout to prevent hanging
						timeout(this.AVAILABILITY_CHECK_TIMEOUT),

						// Handle the availability check result
						concatMap(isAvailable => {
							if (isAvailable) {
								console.log('Tentative court is still available:', tentativeCourt.name)
								// Court is available, use it
								return of({
									selectedCourt: tentativeCourt,
									alternativeCourts: [],
									message: 'Tentative court confirmed',
								})
							}

							console.log('Tentative court no longer available, finding alternative')
							// Court is no longer available, fall back to normal assignment
							return this.findAlternativeCourt(booking.date, startMinutes, duration, courtsArray, preferences)
						}),

						// Handle errors in availability check
						catchError(error => {
							console.warn('Error checking tentative court availability:', error)
							// Fall back to normal court assignment on error
							return this.findAlternativeCourt(booking.date, startMinutes, duration, courtsArray, preferences)
						}),
					)
			}

			// No tentative court, use normal court assignment
			return this.findAlternativeCourt(booking.date, startMinutes, duration, courtsArray, preferences)
		}).pipe(
			// Post-process the court assignment result
			concatMap(result => {
				if (!result.selectedCourt) {
					return of({
						success: false,
						error: result.message || 'No available courts found for the selected time and duration.',
					})
				}

				// Calculate price based on court's pricing structure
				const court = result.selectedCourt
				const price = pricingService.calculatePrice(court, booking.startTime, endTime, booking.userId)

				console.log(`Court ${court.name} assigned for booking`)

				// Return successful result
				return of({
					success: true,
					court: court,
					venueId: court.venueId,
					price,
					endTime,
				})
			}),

			// Add retries for transient errors
			retry({
				count: this.MAX_RETRIES,
				delay: (error, retryCount) => {
					console.log(`Retry ${retryCount} after error:`, error)
					// Exponential backoff: 500ms, 1000ms, etc.
					return of(null).pipe(
						concatMap(() => {
							const delay = Math.pow(2, retryCount - 1) * 500
							console.log(`Retrying after ${delay}ms`)
							return of(null).pipe(rxjsDelay(delay))
						}),
					)
				},
			}),

			// Handle errors
			catchError(error => {
				const errorMsg = this.errorHandler.handleCourtAssignmentError(error)
				return of({
					success: false,
					error: errorMsg,
				})
			}),
		)
	}

	/**
	 * Find an alternative court when tentative court is not available
	 *
	 * @param date Booking date (YYYY-MM-DD)
	 * @param startMinutes Start time in minutes from midnight
	 * @param duration Duration in minutes
	 * @param courts Array of available courts
	 * @param preferences User preferences
	 * @returns Observable of court assignment result
	 */
	private findAlternativeCourt(
		date: string,
		startMinutes: number,
		duration: number,
		courts: Court[],
		preferences: CourtPreferences,
	): Observable<any> {
		return this.courtAssignmentService
			.checkAndAssignCourt(date, startMinutes, duration, courts, CourtAssignmentStrategy.PREFERENCE_BASED, preferences)
			.pipe(
				// Add timeout to prevent hanging
				timeout(this.AVAILABILITY_CHECK_TIMEOUT),

				// Handle errors
				catchError(error => {
					console.error('Error finding alternative court:', error)
					return of({
						selectedCourt: null,
						alternativeCourts: [],
						message: 'Error finding available courts: ' + error.message,
					})
				}),
			)
	}
}
