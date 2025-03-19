import { Firestore, collection, doc, getDoc, getDocs, getFirestore, query, where } from 'firebase/firestore'
import { Observable, forkJoin, from, of, throwError } from 'rxjs'
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators'
import { Court } from 'src/db/courts.collection'
import { OperatingHours, Venue } from 'src/db/venue-collection'
import { db } from 'src/firebase/firebase'
import dayjs from 'dayjs'

/**
 * Court availability time slot status
 */
export interface TimeSlotStatus {
	isAvailable: boolean
	bookedBy: string | null
	bookingId: string | null
}

/**
 * Court availability time slot details with extended information
 */
export interface TimeSlotAvailability {
	isAvailable: boolean
	startTime: string // ISO string
	endTime: string // ISO string
	price?: number
	capacity?: number
	bookedBy?: string | null
	bookingId?: string | null
}

/**
 * Standardized availability response structure
 */
export interface AvailabilityResponse {
	// Court-level availability
	courts: {
		[courtId: string]: {
			isAvailable: boolean // At least one time slot is available
			slots: {
				[timeKey: string]: TimeSlotAvailability
			}
		}
	}

	// Aggregated time slots across all courts
	timeSlots: {
		[timeKey: string]: {
			isAvailable: boolean // At least one court is available at this time
			availableCourts: string[] // IDs of available courts at this time
		}
	}

	// Date for this availability data
	date: string

	// Venue for this availability data
	venueId: string
}

/**
 * Enhanced Availability Service that integrates the legacy implementation
 * with the new standardized structure
 */
export class AvailabilityService {
	private firestore: Firestore
	private cache: Map<string, Observable<AvailabilityResponse>> = new Map()

	constructor() {
		try {
			this.firestore = db
		} catch (e) {
			this.firestore = getFirestore()
		}
	}

	/**
	 * Get availability for all courts on a specific date
	 * This implements the legacy API but uses the new structure internally
	 *
	 * @param date - Date in YYYY-MM-DD format
	 * @param venueId - Optional venue ID to filter courts
	 * @returns Observable of court availabilities in legacy format
	 */
	getAllCourtsAvailability(date: string, venueId?: string): Observable<Record<string, Record<string, TimeSlotStatus>>> {
		return this.getVenueAvailability(date, venueId || '').pipe(
			map(response => {
				const legacyFormat: Record<string, Record<string, TimeSlotStatus>> = {}

				// Convert to legacy format
				Object.entries(response.courts).forEach(([courtId, courtData]) => {
					legacyFormat[courtId] = {}

					Object.entries(courtData.slots).forEach(([timeKey, slotData]) => {
						legacyFormat[courtId][timeKey] = {
							isAvailable: slotData.isAvailable,
							bookedBy: slotData.bookedBy || null,
							bookingId: slotData.bookingId || null,
						}
					})
				})

				return legacyFormat
			}),
		)
	}

	/**
	 * Check if a court is available for a specific time range
	 * Used during the booking process to prevent double booking
	 *
	 * @param date - Date in YYYY-MM-DD format
	 * @param courtId - Court ID to check
	 * @param startTime - Start time in ISO format
	 * @param endTime - End time in ISO format
	 * @returns Observable of whether the court is available for the entire time range
	 */
	isCourtAvailableForTimeRange(date: string, courtId: string, startTime: string, endTime: string): Observable<boolean> {
		return this.getCourtAvailability(courtId, date, '').pipe(
			map(courtAvailability => {
				if (!courtAvailability.isAvailable) {
					return false // Court not available at all
				}

				// Parse times
				const start = new Date(startTime)
				const end = new Date(endTime)
				const startHour = start.getHours()
				const startMinute = start.getMinutes()
				const endHour = end.getHours()
				const endMinute = end.getMinutes()

				// Check every 30-minute slot in the range
				for (let hour = startHour; hour <= endHour; hour++) {
					// Check full hour slot if needed
					if ((hour > startHour || startMinute === 0) && (hour < endHour || endMinute === 0)) {
						const timeKey = `${hour.toString().padStart(2, '0')}:00`
						const slot = courtAvailability.slots[timeKey]
						if (!slot || !slot.isAvailable) {
							return false // Slot not available
						}
					}

					// Check half-hour slot if needed
					if ((hour > startHour || startMinute <= 30) && (hour < endHour || endMinute > 30)) {
						const timeKey = `${hour.toString().padStart(2, '0')}:30`
						const slot = courtAvailability.slots[timeKey]
						if (!slot || !slot.isAvailable) {
							return false // Slot not available
						}
					}
				}

				return true // All slots are available
			}),
			catchError(error => {
				console.error('Error checking court availability:', error)
				return of(false) // Assume not available on error for safety
			}),
		)
	}

	/**
	 * Get complete availability data for a venue on a specific date
	 * Returns a standardized structure that can be used by both court and time selectors
	 *
	 * @param date The date to check availability for (YYYY-MM-DD)
	 * @param venueId The venue ID to check availability for
	 * @returns Observable of standardized availability data
	 */
	getVenueAvailability(date: string, venueId: string): Observable<AvailabilityResponse> {
		const cacheKey = `${date}_${venueId}`

		// Return cached response if available
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey)!
		}

		// Implement the original getAllCourtsAvailability logic but transform to new format
		const response$ = this.fetchRawAvailabilityData(date, venueId).pipe(
			map(rawData => this.transformToNewFormat(rawData, date, venueId)),
			catchError(error => {
				console.error('Error fetching availability:', error)
				return of(this.getEmptyResponse(date, venueId))
			}),
			// Cache the response
			shareReplay(1),
		)

		this.cache.set(cacheKey, response$)
		return response$
	}

	/**
	 * Get availability for a specific court on a specific date
	 *
	 * @param courtId The court ID to check availability for
	 * @param date The date to check availability for (YYYY-MM-DD)
	 * @param venueId The venue ID the court belongs to
	 * @returns Observable of time slots for the specific court
	 */
	getCourtAvailability(
		courtId: string,
		date: string,
		venueId: string,
	): Observable<{
		isAvailable: boolean
		slots: { [timeKey: string]: TimeSlotAvailability }
	}> {
		return this.getVenueAvailability(date, venueId).pipe(
			map(response => {
				const courtData = response.courts[courtId]
				return courtData || { isAvailable: false, slots: {} }
			}),
		)
	}

	/**
	 * Get availability for a specific time slot across all courts
	 *
	 * @param timeKey The time slot key (HH:MM)
	 * @param date The date to check availability for (YYYY-MM-DD)
	 * @param venueId The venue ID to check availability for
	 * @returns Observable of courts available at the specified time
	 */
	getTimeSlotAvailability(
		timeKey: string,
		date: string,
		venueId: string,
	): Observable<{
		isAvailable: boolean
		availableCourts: string[]
	}> {
		return this.getVenueAvailability(date, venueId).pipe(
			map(response => {
				const slotData = response.timeSlots[timeKey]
				return slotData || { isAvailable: false, availableCourts: [] }
			}),
		)
	}

	/**
	 * Clear cached availability data
	 * Should be called when bookings are made or other events that would invalidate the cache
	 *
	 * @param date Optional date to clear cache for
	 * @param venueId Optional venue ID to clear cache for
	 */
	clearCache(date?: string, venueId?: string): void {
		if (date && venueId) {
			this.cache.delete(`${date}_${venueId}`)
		} else if (date) {
			// Clear all entries for this date
			for (const key of this.cache.keys()) {
				if (key.startsWith(date)) {
					this.cache.delete(key)
				}
			}
		} else {
			// Clear the entire cache
			this.cache.clear()
		}
	}

	/**
	 * Fetches the raw availability data using the original implementation
	 * @private
	 */
	private fetchRawAvailabilityData(
		date: string,
		venueId?: string,
	): Observable<Record<string, Record<string, TimeSlotStatus>>> {
		// Step 1: Get all active courts (optionally filtered by venue)
		const courtsRef = collection(this.firestore, 'courts')
		let courtQuery = query(courtsRef, where('status', '==', 'active'))

		// Add venue filter if provided
		if (venueId) {
			courtQuery = query(courtQuery, where('venueId', '==', venueId))
		}

		// Step 2: Get court data and existing bookings for the date
		return from(getDocs(courtQuery)).pipe(
			map(querySnapshot => {
				const courts: Record<string, Court> = {}
				querySnapshot.forEach(docSnap => {
					const data = docSnap.data() as Court
					courts[docSnap.id] = { ...data, id: docSnap.id }
				})
				return courts
			}),
			switchMap(courts => {
				const courtIds = Object.keys(courts)

				// If no courts found, return empty result
				if (courtIds.length === 0) {
					return of({ courts, bookings: [] })
				}

				// Get all bookings for these courts on this date
				const bookingsRef = collection(this.firestore, 'bookings')
				const bookingQuery = query(
					bookingsRef,
					where('date', '==', date),
					where('courtId', 'in', courtIds),
					where('status', 'in', ['confirmed', 'pending']), // Only consider active bookings
				)

				return forkJoin({
					courts: of(courts),
					bookings: from(getDocs(bookingQuery)).pipe(
						map(snapshot => {
							const bookings: any[] = []
							snapshot.forEach(doc => {
								bookings.push({ id: doc.id, ...doc.data() })
							})
							return bookings
						}),
					),
				})
			}),
			switchMap(({ courts, bookings }) => {
				// Step 3: Determine venue operating hours
				// We'll take the venueId from the first court if it's not provided
				const firstCourtId = Object.keys(courts)[0]
				const venueIdToUse = venueId || (firstCourtId ? courts[firstCourtId].venueId : null)

				if (!venueIdToUse) {
					return of({ courts, bookings, venue: null })
				}

				const venueRef = doc(this.firestore, 'venues', venueIdToUse)
				return forkJoin({
					courts: of(courts),
					bookings: of(bookings),
					venue: from(getDoc(venueRef)).pipe(
						map(docSnap => (docSnap.exists() ? ({ id: docSnap.id, ...docSnap.data() } as Venue) : null)),
					),
				})
			}),
			map(({ courts, bookings, venue }) => {
				// Step 4: Generate availability data for each court
				const result: Record<string, Record<string, TimeSlotStatus>> = {}

				// For each court, generate default available slots based on venue hours
				Object.keys(courts).forEach(courtId => {
					// Create default slots based on venue operating hours
					const defaultSlots = this.generateSlotsFromVenueHours(venue, date)
					result[courtId] = { ...defaultSlots }
				})

				// Step 5: Mark booked slots as unavailable
				bookings.forEach(booking => {
					const { courtId, startTime, endTime, userId, id } = booking

					// Skip if this court isn't in our result set
					if (!result[courtId]) return

					// Calculate time range
					const start = new Date(startTime)
					const end = new Date(endTime)
					const startHour = start.getHours()
					const startMinute = start.getMinutes()
					const endHour = end.getHours()
					const endMinute = end.getMinutes()

					// Mark all slots in the range as unavailable
					for (let hour = startHour; hour <= endHour; hour++) {
						// Determine if we need to mark the full hour slot
						if ((hour > startHour || startMinute === 0) && (hour < endHour || endMinute === 0)) {
							const timeKey = `${hour.toString().padStart(2, '0')}:00`
							if (result[courtId][timeKey]) {
								result[courtId][timeKey] = {
									isAvailable: false,
									bookedBy: userId || null,
									bookingId: id,
								}
							}
						}

						// Determine if we need to mark the half-hour slot
						if ((hour > startHour || startMinute <= 30) && (hour < endHour || endMinute > 30)) {
							const timeKey = `${hour.toString().padStart(2, '0')}:30`
							if (result[courtId][timeKey]) {
								result[courtId][timeKey] = {
									isAvailable: false,
									bookedBy: userId || null,
									bookingId: id,
								}
							}
						}
					}
				})

				return result
			}),
			catchError(error => {
				console.error('Error fetching court availability:', error)
				return throwError(() => new Error('Failed to fetch court availability. Please try again.'))
			}),
			shareReplay(1),
		)
	}

	/**
	 * Generate time slots based on venue operating hours
	 *
	 * @param venue - Venue with operating hours
	 * @param date - Date for which to generate slots
	 * @returns Time slots respecting venue operating hours
	 */
	private generateSlotsFromVenueHours(venue: Venue | null, date: string): Record<string, TimeSlotStatus> {
		if (!venue || !venue.operatingHours) {
			return this.generateDefaultTimeSlots()
		}

		// Get day of week
		const dayOfWeek = dayjs(date).format('dddd').toLowerCase()

		// Get operating hours for the day
		const todayHours = venue.operatingHours[dayOfWeek as keyof OperatingHours]

		// If venue is closed today, return empty slots
		if (!todayHours) {
			return {}
		}

		// Parse operating hours
		const [openHour, _openMinute] = todayHours.open.split(':').map(Number)
		const [closeHour, _closeMinute] = todayHours.close.split(':').map(Number)

		// Generate slots from opening time to closing time
		return this.generateDefaultTimeSlots(openHour, closeHour)
	}

	/**
	 * Generate default time slots for standard business hours
	 *
	 * @param startHour - Starting hour (default: 8 AM)
	 * @param endHour - Ending hour (default: 10 PM)
	 * @returns Record of default time slots
	 */
	private generateDefaultTimeSlots(startHour: number = 8, endHour: number = 22): Record<string, TimeSlotStatus> {
		const slots: Record<string, TimeSlotStatus> = {}

		for (let hour = startHour; hour < endHour; hour++) {
			// Full hour slot
			const timeKey = `${hour.toString().padStart(2, '0')}:00`
			slots[timeKey] = {
				isAvailable: true,
				bookedBy: null,
				bookingId: null,
			}

			// Half hour slot
			const halfHourKey = `${hour.toString().padStart(2, '0')}:30`
			slots[halfHourKey] = {
				isAvailable: true,
				bookedBy: null,
				bookingId: null,
			}
		}

		return slots
	}

	/**
	 * Transform the raw availability data to the new format
	 * @private
	 */
	private transformToNewFormat(
		rawData: Record<string, Record<string, TimeSlotStatus>>,
		date: string,
		venueId: string,
	): AvailabilityResponse {
		const result: AvailabilityResponse = this.getEmptyResponse(date, venueId)

		// Process court-by-court availability
		Object.entries(rawData).forEach(([courtId, courtSlots]) => {
			// Initialize court in the result
			result.courts[courtId] = {
				isAvailable: false,
				slots: {},
			}

			let hasAvailableSlot = false

			// Process each time slot for this court
			Object.entries(courtSlots).forEach(([timeKey, slotData]) => {
				// Add the slot data to the court
				result.courts[courtId].slots[timeKey] = {
					isAvailable: slotData.isAvailable,
					startTime: this.createISOTimeString(date, timeKey),
					endTime: this.createISOTimeString(date, this.advanceTimeSlot(timeKey)),
					bookedBy: slotData.bookedBy,
					bookingId: slotData.bookingId,
				}

				// Update court availability
				if (slotData.isAvailable) {
					hasAvailableSlot = true

					// Initialize time slot in aggregated view if needed
					if (!result.timeSlots[timeKey]) {
						result.timeSlots[timeKey] = {
							isAvailable: true,
							availableCourts: [],
						}
					}

					// Add this court to the available courts for this time slot
					result.timeSlots[timeKey].availableCourts.push(courtId)
				} else if (!result.timeSlots[timeKey]) {
					// Initialize unavailable time slot if it doesn't exist
					result.timeSlots[timeKey] = {
						isAvailable: false,
						availableCourts: [],
					}
				}
			})

			// Update court availability based on any available slot
			result.courts[courtId].isAvailable = hasAvailableSlot
		})

		return result
	}

	/**
	 * Create an empty response structure
	 */
	private getEmptyResponse(date: string, venueId: string): AvailabilityResponse {
		return {
			courts: {},
			timeSlots: {},
			date,
			venueId,
		}
	}

	/**
	 * Create an ISO string from a date and time
	 */
	private createISOTimeString(dateStr: string, timeStr: string): string {
		const [hours, minutes] = timeStr.split(':').map(Number)
		const date = new Date(dateStr)
		date.setHours(hours, minutes, 0, 0)
		return date.toISOString()
	}

	/**
	 * Advance a time slot by 30 minutes (or your slot duration)
	 * Format: "HH:MM" -> "HH:MM"
	 */
	private advanceTimeSlot(timeStr: string): string {
		const [hours, minutes] = timeStr.split(':').map(Number)
		let newMinutes = minutes + 30
		let newHours = hours

		if (newMinutes >= 60) {
			newMinutes -= 60
			newHours += 1
		}

		// Format with leading zeros
		return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`
	}
}
