// src/public/book/CourtAssignmentHandler.ts

import { $notify } from '@mhmo91/schmancy'
import dayjs from 'dayjs'
import { catchError, firstValueFrom, of } from 'rxjs'
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

	constructor(private courtAssignmentService: CourtAssignmentService) {}

	/**
	 * Assign a court based on preferences and availability
	 */
	async assignCourt(
		booking: Booking,
		duration: number,
		availableCourts: Court[],
		preferences: CourtPreferences,
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

			// Assign court using service
			const result = await firstValueFrom(
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

			// Handle no courts available
			if (!result.selectedCourt) {
				return {
					success: false,
					error: result.message || 'No available courts found for the selected time and duration.',
				}
			}

			// Calculate price based on court's pricing structure
			const price = pricingService.calculatePrice(result.selectedCourt, booking.startTime, endTime, booking.userId)

			$notify.success(`Court ${result.selectedCourt.name} assigned for your booking`)

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
