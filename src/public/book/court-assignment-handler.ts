// src/public/book/CourtAssignmentHandler.ts

import dayjs from 'dayjs'
import { catchError, firstValueFrom, of } from 'rxjs'
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
}

/**
 * Handles court assignment logic and related operations
 */
export class CourtAssignmentHandler {
	private errorHandler = new BookingErrorHandler()
	private availabilityService: AvailabilityService

	constructor(private courtAssignmentService: CourtAssignmentService) {
		this.availabilityService = new AvailabilityService()
	}

	/**
	 * Assign a court based on preferences and availability
	 */
	// src/public/book/court-assignment-handler.ts
	// This is an update to the existing CourtAssignmentHandler class

	/**
	 * Enhanced assignCourt method that can prioritize previously tentatively assigned courts
	 */

	async assignCourt(
		booking: Booking,
		duration: number,
		availableCourts: Court[],
		preferences: CourtPreferences,
		tentativeCourt?: Court | null,
	): Promise<CourtAssignmentResult> {
		try {
			if (!booking.date || !booking.startTime) {
				throw new Error('Booking date and start time are required')
			}

			const startTime = dayjs(booking.startTime)
			const startMinutes = startTime.hour() * 60 + startTime.minute()
			const endTime = startTime.add(duration, 'minute').toISOString()

			// Array of courts to check
			const courtsArray = Array.from(availableCourts)
			if (courtsArray.length === 0) {
				throw new Error('No courts available to book')
			}

			// If we have a tentative court, prioritize it first
			let result
			if (tentativeCourt) {
				// Check if the previously tentatively assigned court is still available
				// Access availabilityService directly, not through courtAssignmentService
				let isTentativeCourtAvailable: boolean

				try {
					// Check if the previously tentatively assigned court is still available
					isTentativeCourtAvailable = await firstValueFrom(
						this.availabilityService
							.isCourtAvailableForTimeRange(booking.date, tentativeCourt.id, startTime.toISOString(), endTime)
							.pipe(
								catchError(error => {
									console.warn('Error checking tentative court availability:', error)
									return of(false)
								}),
							),
					)
				} catch (error) {
					console.error('Unexpected error checking court availability:', error)
					// Fall back to normal court assignment
					isTentativeCourtAvailable = false
				}

				if (isTentativeCourtAvailable) {
					// Use the tentative court directly if it's available
					console.log('Using tentatively assigned court:', tentativeCourt.name)
					result = {
						selectedCourt: tentativeCourt,
						alternativeCourts: [],
						message: 'Tentative court confirmed',
					}
				} else {
					// Tentative court is no longer available, fall back to normal assignment
					console.log('Tentative court no longer available, finding alternative')
					result = await firstValueFrom(
						this.courtAssignmentService
							.checkAndAssignCourt(
								booking.date,
								startMinutes,
								duration,
								courtsArray,
								CourtAssignmentStrategy.PREFERENCE_BASED,
								preferences,
							)
							.pipe(
								catchError(error => {
									console.error('Error assigning court:', error)
									return of({
										selectedCourt: null,
										alternativeCourts: [],
										message: 'Error assigning court: ' + error.message,
									})
								}),
							),
					)
				}
			} else {
				// No tentative court, use normal court assignment
				result = await firstValueFrom(
					this.courtAssignmentService
						.checkAndAssignCourt(
							booking.date,
							startMinutes,
							duration,
							courtsArray,
							CourtAssignmentStrategy.PREFERENCE_BASED,
							preferences,
						)
						.pipe(
							catchError(error => {
								console.error('Error assigning court:', error)
								return of({
									selectedCourt: null,
									alternativeCourts: [],
									message: 'Error assigning court: ' + error.message,
								})
							}),
						),
				)
			}

			// Handle no courts available
			if (!result.selectedCourt) {
				return {
					success: false,
					error: result.message || 'No available courts found for the selected time and duration.',
				}
			}

			// Calculate price based on court's pricing structure
			const price = pricingService.calculatePrice(result.selectedCourt, booking.startTime, endTime, booking.userId)

			console.log(`Court ${result.selectedCourt.name} assigned for booking`)

			// Return successful result
			return {
				success: true,
				court: result.selectedCourt,
				price,
				endTime,
			}
		} catch (error) {
			// Handle errors
			const errorMsg = this.errorHandler.handleCourtAssignmentError(error)
			return {
				success: false,
				error: errorMsg,
			}
		}
	}
}
