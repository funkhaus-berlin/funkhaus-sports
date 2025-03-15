// services/availability.service.ts
import { Observable, of } from 'rxjs'
import { catchError, map } from 'rxjs/operators'
import { FirestoreService } from 'src/firebase/firestore.service'

interface FirebaseTimeSlot {
	isAvailable: boolean
	bookedBy: string | null
	bookingId: string | null
}

interface FirebaseDayAvailability {
	slots: Record<string, FirebaseTimeSlot>
}

interface FirebaseCourtAvailability {
	[date: string]: FirebaseDayAvailability
}

interface FirebaseMonthlyAvailability {
	courts: {
		[courtId: string]: FirebaseCourtAvailability
	}
	createdAt?: string
	updatedAt?: string
}

/**
 * Availability service using Firestore
 */
export class AvailabilityService {
	private service: FirestoreService<FirebaseMonthlyAvailability>

	constructor() {
		this.service = new FirestoreService<FirebaseMonthlyAvailability>('availabilities')
	}

	/**
	 * Get availability for all courts on a specific date
	 * Default behavior: Slots are considered available unless explicitly marked unavailable
	 */
	getAllCourtsAvailability(date: string): Observable<Record<string, Record<string, any>> | undefined> {
		const [year, month] = date.split('-')
		const docId = `${year}-${month}`

		return this.service.get(docId).pipe(
			map(availability => {
				const courtsAvailability: Record<string, Record<string, any>> = {}

				// If no data exists yet, we'll create default (all available) slots later
				if (!availability || !availability.courts) {
					// Will be filled with defaults before returning
				} else {
					// Extract the slots for the specific date for each court
					Object.entries(availability.courts).forEach(([courtId, courtAvailability]) => {
						if (courtAvailability[date]) {
							courtsAvailability[courtId] = courtAvailability[date].slots
						}
					})
				}

				return courtsAvailability
			}),
			catchError(error => {
				console.error('Error getting all courts availability:', error)
				return of({})
			}),
		)
	}

	/**
	 * Get availability for a specific court on a specific date
	 * Default behavior: Slots are considered available unless explicitly marked unavailable
	 */
	getCourtAvailability(
		courtId: string,
		date: string,
		operatingHours: { start: number; end: number } = { start: 8, end: 22 },
	): Observable<Record<string, any>> {
		const [year, month] = date.split('-')
		const docId = `${year}-${month}`

		return this.service.get(docId).pipe(
			map(availability => {
				// Create default slots (all available)
				const defaultSlots: Record<string, FirebaseTimeSlot> = {}
				for (let hour = operatingHours.start; hour < operatingHours.end; hour++) {
					const timeSlot = `${hour.toString().padStart(2, '0')}:00`
					defaultSlots[timeSlot] = {
						isAvailable: true,
						bookedBy: null,
						bookingId: null,
					}
				}

				// If no data exists, return the default slots
				if (
					!availability ||
					!availability.courts ||
					!availability.courts[courtId] ||
					!availability.courts[courtId][date]
				) {
					return defaultSlots
				}

				// Merge existing slots with defaults, giving priority to existing data
				const existingSlots = availability.courts[courtId][date].slots
				const mergedSlots = { ...defaultSlots }

				// Override defaults with existing data
				Object.keys(existingSlots).forEach(timeSlot => {
					mergedSlots[timeSlot] = existingSlots[timeSlot]
				})

				return mergedSlots
			}),
			catchError(error => {
				console.error('Error getting court availability:', error)

				// On error, return default available slots
				const defaultSlots: Record<string, FirebaseTimeSlot> = {}
				for (let hour = operatingHours.start; hour < operatingHours.end; hour++) {
					const timeSlot = `${hour.toString().padStart(2, '0')}:00`
					defaultSlots[timeSlot] = {
						isAvailable: true,
						bookedBy: null,
						bookingId: null,
					}
				}

				return of(defaultSlots)
			}),
		)
	}

	/**
	 * Initialize availability for a month
	 */
	initializeMonthAvailability(
		year: number,
		month: number,
		courts: { id: string; name: string }[],
		operatingHours: { start: number; end: number } = { start: 8, end: 22 },
	): Observable<FirebaseMonthlyAvailability> {
		const docId = `${year}-${month.toString().padStart(2, '0')}`

		// Create date objects for the first and last day of the month
		// const startDate = new Date(year, month - 1, 1)
		const endDate = new Date(year, month, 0) // Last day of the month

		const availability: FirebaseMonthlyAvailability = {
			courts: {},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}

		// Initialize availability for each court
		courts.forEach(court => {
			availability.courts[court.id] = {}

			// For each day in the month
			for (let day = 1; day <= endDate.getDate(); day++) {
				const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`

				// Initialize day availability
				availability.courts[court.id][date] = {
					slots: {},
				}

				// Create slots for each hour in the operating hours
				for (let hour = operatingHours.start; hour < operatingHours.end; hour++) {
					const timeSlot = `${hour.toString().padStart(2, '0')}:00`

					availability.courts[court.id][date].slots[timeSlot] = {
						isAvailable: true,
						bookedBy: null,
						bookingId: null,
					}
				}
			}
		})

		// Store the availability
		return this.service.upsert(availability, docId)
	}

	/**
	 * Update availability for a specific slot
	 */
	updateSlotAvailability(
		courtId: string,
		date: string,
		timeSlot: string,
		isAvailable: boolean,
		bookedBy: string | null = null,
		bookingId: string | null = null,
	): Observable<Observable<FirebaseMonthlyAvailability> | undefined> {
		const [year, month] = date.split('-')
		const docId = `${year}-${month}`

		return this.service.get(docId).pipe(
			map(availability => {
				if (
					!availability ||
					!availability.courts ||
					!availability.courts[courtId] ||
					!availability.courts[courtId][date] ||
					!availability.courts[courtId][date].slots[timeSlot]
				) {
					throw new Error('Slot not found')
				}

				// Update the slot
				const updatedAvailability = { ...availability }
				updatedAvailability.courts[courtId][date].slots[timeSlot] = {
					isAvailable,
					bookedBy,
					bookingId,
				}

				// Save the updated availability
				return this.service.upsert(updatedAvailability, docId)
			}),
			catchError(error => {
				console.error('Error updating slot availability:', error)
				return of(undefined)
			}),
		)
	}

	/**
	 * Mark a range of slots as unavailable for maintenance
	 */
	markMaintenanceTime(
		courtId: string,
		date: string,
		startTime: string,
		endTime: string,
	): Observable<Observable<FirebaseMonthlyAvailability> | undefined> {
		const [year, month] = date.split('-')
		const docId = `${year}-${month}`

		return this.service.get(docId).pipe(
			map(availability => {
				if (
					!availability ||
					!availability.courts ||
					!availability.courts[courtId] ||
					!availability.courts[courtId][date]
				) {
					throw new Error('Court availability not found for this date')
				}

				const slots = availability.courts[courtId][date].slots

				// Parse start and end times
				const startHour = parseInt(startTime.split(':')[0])
				const endHour = parseInt(endTime.split(':')[0])

				// Update each slot in the range
				for (let hour = startHour; hour < endHour; hour++) {
					const timeSlot = `${hour.toString().padStart(2, '0')}:00`

					if (slots[timeSlot]) {
						slots[timeSlot].isAvailable = false
					}
				}

				// Save the updated availability
				return this.service.upsert(availability, docId)
			}),
			catchError(error => {
				console.error('Error marking maintenance time:', error)
				return of(undefined)
			}),
		)
	}

	/**
	 * Subscribe to availability changes for a specific date
	 * Default behavior: Slots are considered available unless explicitly marked unavailable
	 */
	subscribeToDateAvailability(
		date: string,
		courtIds: string[] = [],
		operatingHours: { start: number; end: number } = { start: 8, end: 22 },
	): Observable<Record<string, Record<string, any>>> {
		const [year, month] = date.split('-')
		const docId = `${year}-${month}`

		return this.service.subscribe(docId).pipe(
			map(availability => {
				const courtsAvailability: Record<string, Record<string, any>> = {}

				// Create default slots (all available) for each court
				courtIds.forEach(courtId => {
					const defaultSlots: Record<string, FirebaseTimeSlot> = {}
					for (let hour = operatingHours.start; hour < operatingHours.end; hour++) {
						const timeSlot = `${hour.toString().padStart(2, '0')}:00`
						defaultSlots[timeSlot] = {
							isAvailable: true,
							bookedBy: null,
							bookingId: null,
						}
					}
					courtsAvailability[courtId] = defaultSlots
				})

				// If no data exists yet, return the defaults
				if (!availability || !availability.courts) {
					return courtsAvailability
				}

				// Extract the slots for the specific date for each court, overriding defaults
				Object.entries(availability.courts).forEach(([courtId, courtAvailability]) => {
					if (courtIds.length === 0 || courtIds.includes(courtId)) {
						if (courtAvailability[date]) {
							// If we have a default entry for this court, merge with it
							if (courtsAvailability[courtId]) {
								const existingSlots = courtAvailability[date].slots
								Object.keys(existingSlots).forEach(timeSlot => {
									courtsAvailability[courtId][timeSlot] = existingSlots[timeSlot]
								})
							} else {
								// Otherwise just use the data
								courtsAvailability[courtId] = courtAvailability[date].slots
							}
						}
					}
				})

				return courtsAvailability
			}),
			catchError(error => {
				console.error('Error subscribing to date availability:', error)

				// On error, return default available slots for each court
				const courtsAvailability: Record<string, Record<string, any>> = {}

				courtIds.forEach(courtId => {
					const defaultSlots: Record<string, FirebaseTimeSlot> = {}
					for (let hour = operatingHours.start; hour < operatingHours.end; hour++) {
						const timeSlot = `${hour.toString().padStart(2, '0')}:00`
						defaultSlots[timeSlot] = {
							isAvailable: true,
							bookedBy: null,
							bookingId: null,
						}
					}
					courtsAvailability[courtId] = defaultSlots
				})

				return of(courtsAvailability)
			}),
		)
	}
}
