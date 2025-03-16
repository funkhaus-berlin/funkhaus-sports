// src/bookingServices/availability.service.ts
import { Observable } from 'rxjs'
import { FirestoreBookingService } from 'src/public/book/booking.service'

/**
 * Service to handle court availability operations
 * Provides methods to check availability for dates and time slots
 */
export class AvailabilityService {
	private firestoreBookingService: FirestoreBookingService

	constructor() {
		this.firestoreBookingService = new FirestoreBookingService()
	}

	/**
	 * Get availability for a specific court and date
	 *
	 * @param courtId - ID of the court
	 * @param date - Date in YYYY-MM-DD format
	 * @returns Observable of time slots with availability status
	 */
	getCourtAvailability(courtId: string, date: string): Observable<Record<string, { isAvailable: boolean }>> {
		return this.firestoreBookingService.getDateAvailability(courtId, date)
	}

	/**
	 * Get availability for all courts on a specific date
	 * Used for court assignment and availability overview
	 *
	 * @param date - Date in YYYY-MM-DD format
	 * @returns Observable of courts with their time slots
	 */
	getAllCourtsAvailability(date: string): Observable<Record<string, Record<string, { isAvailable: boolean }>>> {
		return this.firestoreBookingService.getAllCourtsAvailability(date)
	}

	/**
	 * Check if a time slot range is available for a specific court and date
	 *
	 * @param courtId - ID of the court
	 * @param date - Date in YYYY-MM-DD format
	 * @param startTime - Start time in minutes (e.g., 540 for 9:00 AM)
	 * @param durationMinutes - Duration in minutes
	 * @returns Observable of boolean indicating if the range is available
	 */
	isTimeSlotRangeAvailable(
		courtId: string,
		date: string,
		startTime: number,
		durationMinutes: number,
	): Observable<boolean> {
		return new Observable<boolean>(observer => {
			this.getCourtAvailability(courtId, date).subscribe({
				next: slots => {
					// Convert start time from minutes to hours
					const startHour = Math.floor(startTime / 60)
					// Calculate end hour based on duration
					const endHour = Math.floor((startTime + durationMinutes) / 60)

					// Check each hour in the range
					let isAvailable = true
					for (let hour = startHour; hour < endHour; hour++) {
						const timeSlot = `${hour.toString().padStart(2, '0')}:00`
						// If any slot in the range is not available, the range is not available
						if (slots[timeSlot] && !slots[timeSlot].isAvailable) {
							isAvailable = false
							break
						}
					}

					observer.next(isAvailable)
					observer.complete()
				},
				error: err => {
					console.error('Error checking time slot availability:', err)
					observer.error(err)
				},
			})
		})
	}

	/**
	 * Generate default availability for testing or initialization
	 * Used when creating a new monthly document
	 *
	 * @param startHour - Starting hour for availability (default: 8 AM)
	 * @param endHour - Ending hour for availability (default: 10 PM)
	 * @returns Record of default available time slots
	 */
	generateDefaultAvailability(startHour: number = 8, endHour: number = 22): Record<string, { isAvailable: boolean }> {
		const slots: Record<string, { isAvailable: boolean }> = {}

		for (let hour = startHour; hour < endHour; hour++) {
			const timeKey = `${hour.toString().padStart(2, '0')}:00`
			slots[timeKey] = { isAvailable: true }

			// Add half-hour slots
			const halfHourKey = `${hour.toString().padStart(2, '0')}:30`
			slots[halfHourKey] = { isAvailable: true }
		}

		return slots
	}
}
