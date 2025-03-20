// Enhanced AvailabilityService using FirestoreService pattern

import dayjs from 'dayjs'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { combineLatest, forkJoin, from, Observable, of, throwError } from 'rxjs'
import { catchError, map, shareReplay, switchMap, tap } from 'rxjs/operators'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { db } from 'src/firebase/firebase'
import { FirebaseServiceQuery, FirestoreService } from 'src/firebase/firestore.service'
import { toUserTimezone } from 'src/utils/timezone'

// Define the OperatingHours interface with specific days
export interface OperatingHours {
	monday?: { open: string; close: string }
	tuesday?: { open: string; close: string }
	wednesday?: { open: string; close: string }
	thursday?: { open: string; close: string }
	friday?: { open: string; close: string }
	saturday?: { open: string; close: string }
	sunday?: { open: string; close: string }
}

// Define weekday type for type checking
export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export interface CourtAvailability {
	isAvailable: boolean
	bookedTimeSlots?: string[] // Slots that are already booked
}

export interface TimeSlotAvailability {
	isAvailable: boolean
	availableCourts: string[] // IDs of available courts
	courts: Record<string, boolean> // Map of court IDs to availability
}

export interface AvailabilityResponse {
	date: string
	timeSlots: Record<string, TimeSlotAvailability>
	courts: Record<string, CourtAvailability>
}

export interface Booking {
	id: string
	courtId: string
	date: string
	startTime: string
	endTime: string
	status: string
	[key: string]: any
}

export class AvailabilityService {
	private courtsService: FirestoreService<Court>
	private bookingsService: FirestoreService<Booking>
	private venuesService: FirestoreService<Venue>
	private cache: Map<string, { data: AvailabilityResponse; timestamp: number }> = new Map()
	private CACHE_TTL = 30000 // 30 seconds cache TTL

	constructor() {
		this.courtsService = new FirestoreService<Court>('courts')
		this.bookingsService = new FirestoreService<Booking>('bookings')
		this.venuesService = new FirestoreService<Venue>('venues')
	}

	/**
	 * Fetch availability data using FirestoreService
	 *
	 * @param date - Date in YYYY-MM-DD format
	 * @param venueId - Venue ID
	 * @returns Observable of availability response
	 */
	private fetchAvailabilityData(date: string, venueId: string): Observable<AvailabilityResponse> {
		// Step 1: Get all active courts for the venue using the FirestoreService
		const courtQueries: FirebaseServiceQuery[] = [
			{ key: 'status', value: 'active', operator: '==' },
			{ key: 'venueId', value: venueId, operator: '==' },
		]

		return this.courtsService.getCollection(courtQueries).pipe(
			map(courtsMap => {
				const courts: Record<string, Court> = {}
				courtsMap.forEach((court, id) => {
					courts[id] = { ...court, id }
				})
				return courts
			}),
			switchMap(courts => {
				const courtIds = Object.keys(courts)

				// If no courts found, return empty result
				if (courtIds.length === 0) {
					return of({ courts, bookings: [] as Booking[], venue: undefined as Venue | undefined })
				}

				// Get venue data
				const venueObs = this.venuesService.get(venueId)

				// Use the custom getCollection method with the in operator queries
				const bookingsObs = this.getBookingsForCourts(date, courtIds)

				return forkJoin({
					courts: of(courts),
					bookings: bookingsObs,
					venue: venueObs,
				})
			}),
			map(({ courts, bookings, venue }) => {
				// Step 3: Format the response
				const result: AvailabilityResponse = {
					date,
					timeSlots: {},
					courts: {},
				}

				const courtIds = Object.keys(courts)
				console.clear()
				console.log('Bookings:', bookings)

				// Generate time slots based on venue operating hours
				const timeSlotKeys = this.generateTimeSlotKeysFromVenue(venue, date)

				// Initialize time slot availability for all slots
				timeSlotKeys.forEach(timeKey => {
					result.timeSlots[timeKey] = {
						isAvailable: true,
						availableCourts: [...courtIds],
						courts: courtIds.reduce((acc, courtId) => {
							acc[courtId] = true
							return acc
						}, {} as Record<string, boolean>),
					}
				})

				// Initialize court availability
				courtIds.forEach(courtId => {
					result.courts[courtId] = {
						isAvailable: true,
						bookedTimeSlots: [],
					}
				})

				// Step 4: Mark booked slots
				// Mark booked slots with proper timezone handling
				bookings.forEach(booking => {
					const { courtId, startTime, endTime } = booking

					// Skip if this court isn't in our result set
					if (!courtIds.includes(courtId)) return

					// Calculate time range with explicit timezone conversion to local time
					const start = dayjs(startTime).tz('Europe/Berlin') // Use explicit timezone
					const end = dayjs(endTime).tz('Europe/Berlin')

					const startHour = start.hour()
					const startMinute = start.minute()
					const endHour = end.hour()
					const endMinute = end.minute()

					console.log(`Converting booking times for court ${courtId}:`)
					console.log(`UTC: ${startTime} - ${endTime}`)
					console.log(`Local: ${start.format('HH:mm')} - ${end.format('HH:mm')}`)

					// Mark all slots in the range as unavailable
					for (let hour = startHour; hour <= endHour; hour++) {
						// Check full hour slot
						if ((hour > startHour || startMinute === 0) && (hour < endHour || endMinute === 0)) {
							const timeKey = `${hour.toString().padStart(2, '0')}:00`
							this.markSlotAsBooked(result, timeKey, courtId)
						}

						// Check half-hour slot
						if ((hour > startHour || startMinute <= 30) && (hour < endHour || endMinute > 30)) {
							const timeKey = `${hour.toString().padStart(2, '0')}:30`
							this.markSlotAsBooked(result, timeKey, courtId)
						}
					}
				})

				return result
			}),
			catchError(error => {
				console.error('Error fetching availability data:', error)
				return throwError(() => new Error('Failed to fetch venue availability data'))
			}),
			shareReplay(1),
		)
	}

	/**
	 * Custom method to get bookings for multiple courts
	 * This is needed because FirestoreService doesn't directly support 'in' queries
	 */
	private getBookingsForCourts(date: string, courtIds: string[]): Observable<Booking[]> {
		if (courtIds.length === 0) {
			return of([])
		}

		// Use direct Firestore query for 'in' operations which are not easily supported by FirestoreService
		const bookingsRef = collection(db, 'bookings')
		const bookingQuery = query(
			bookingsRef,
			where('date', '==', dayjs(date).format('YYYY-MM-DD')),
			where('courtId', 'in', courtIds),
			where('status', 'in', ['confirmed', 'pending']),
		)

		return from(getDocs(bookingQuery)).pipe(
			map(snapshot => {
				const bookings: Booking[] = []
				snapshot.forEach(doc => {
					bookings.push({ id: doc.id, ...doc.data() } as Booking)
				})
				return bookings
			}),
			catchError(error => {
				console.error('Error fetching bookings:', error)
				return throwError(() => new Error('Failed to fetch bookings'))
			}),
		)
	}

	/**
	 * Generate time slot keys based on venue operating hours
	 */
	private generateTimeSlotKeysFromVenue(venue: Venue | undefined, date: string): string[] {
		if (!venue || !venue.operatingHours) {
			return this.generateDefaultTimeSlotKeys()
		}

		// Get day of week
		const dayOfWeekFull = dayjs(date).format('dddd').toLowerCase() as Weekday

		// Check if the day is a valid key in operating hours
		if (!this.isValidWeekday(dayOfWeekFull)) {
			return this.generateDefaultTimeSlotKeys()
		}

		// Get operating hours for the day
		const todayHours = venue.operatingHours[dayOfWeekFull]

		// If venue is closed today, return empty array
		if (!todayHours) {
			return []
		}

		// Parse operating hours
		const [openHour, _openMinute] = todayHours.open.split(':').map(Number)
		const [closeHour, _closeMinute] = todayHours.close.split(':').map(Number)

		// Generate slot keys from opening time to closing time
		return this.generateDefaultTimeSlotKeys(openHour, closeHour)
	}

	/**
	 * Type guard to check if a string is a valid weekday key
	 */
	private isValidWeekday(day: string): day is Weekday {
		return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(day)
	}

	/**
	 * Generate default time slot keys
	 */
	private generateDefaultTimeSlotKeys(startHour: number = 8, endHour: number = 22): string[] {
		const keys: string[] = []

		for (let hour = startHour; hour < endHour; hour++) {
			// Full hour slot
			keys.push(`${hour.toString().padStart(2, '0')}:00`)

			// Half hour slot
			keys.push(`${hour.toString().padStart(2, '0')}:30`)
		}

		return keys
	}

	/**
	 * Mark a slot as booked in the availability response
	 */
	private markSlotAsBooked(response: AvailabilityResponse, timeKey: string, courtId: string): void {
		// Skip if the time slot doesn't exist in our response
		if (!response.timeSlots[timeKey]) return

		// Update time slot data
		const timeSlot = response.timeSlots[timeKey]
		timeSlot.courts[courtId] = false

		// Update available courts list
		timeSlot.availableCourts = timeSlot.availableCourts.filter(id => id !== courtId)

		// Update overall availability flag
		timeSlot.isAvailable = timeSlot.availableCourts.length > 0

		// Update court data
		if (response.courts[courtId]) {
			response.courts[courtId].bookedTimeSlots = [...(response.courts[courtId].bookedTimeSlots || []), timeKey]

			// Remove duplicates
			response.courts[courtId].bookedTimeSlots = [...new Set(response.courts[courtId].bookedTimeSlots)]
		}
	}

	/**
	 * Get venue availability data with caching and automatic refresh
	 */
	getVenueAvailability(date: string, venueId: string): Observable<AvailabilityResponse> {
		const cacheKey = `${date}_${venueId}`
		const cached = this.cache.get(cacheKey)
		const now = Date.now()

		// Return cached data if it's fresh
		if (cached && now - cached.timestamp < this.CACHE_TTL) {
			return of(cached.data)
		}

		// Fetch fresh data
		return this.fetchAvailabilityData(date, venueId).pipe(
			tap(data => {
				// Cache the result
				this.cache.set(cacheKey, { data, timestamp: now })
			}),
			catchError(error => {
				// If we have stale cached data, return it instead of failing
				if (cached) {
					console.warn('Failed to update availability, using cached data', error)
					return of(cached.data)
				}
				return throwError(() => error)
			}),
		)
	}

	/**
	 * Clear cache to force data refresh
	 */
	clearCache(): void {
		this.cache.clear()
	}

	/**
	 * Check if a court is available for the entire duration from start to end time
	 */
	public isCourtAvailableForDuration(
		availabilityData: AvailabilityResponse,
		courtId: string,
		startTime: string,
		durationMinutes: number,
	): boolean {
		if (!availabilityData || !availabilityData.timeSlots) {
			return false
		}

		// Convert using user's timezone
		const start = toUserTimezone(startTime)
		const end = start.add(durationMinutes, 'minute')

		// Convert to 24-hour format strings for comparison (e.g., "14:00")
		const startSlot = start.format('HH:mm')
		const endSlot = end.format('HH:mm')

		// Get all relevant time slots in the range
		const relevantSlots = Object.entries(availabilityData.timeSlots).filter(
			([timeKey, _]) => timeKey >= startSlot && timeKey < endSlot,
		)

		// Check if all slots have this court available
		return relevantSlots.every(([_, slotData]) => {
			// Court must be explicitly available in each slot
			return slotData.courts?.[courtId] === true
		})
	}
	/**
	 * Get all valid durations for a court at a specific start time
	 */
	getAvailableDurations(
		availabilityData: AvailabilityResponse,
		courtId: string,
		startTime: string,
		possibleDurations: number[], // Array of durations in minutes (e.g., [30, 60, 90, 120])
	): number[] {
		return possibleDurations.filter(duration =>
			this.isCourtAvailableForDuration(availabilityData, courtId, startTime, duration),
		)
	}

	/**
	 * Refresh availability data on demand
	 */
	refreshAvailability(date: string, venueId: string): Observable<AvailabilityResponse> {
		const cacheKey = `${date}_${venueId}`
		this.cache.delete(cacheKey) // Remove from cache to force a refresh
		return this.getVenueAvailability(date, venueId)
	}

	/**
	 * Set up periodic refresh of data
	 * @returns Subscription that should be unsubscribed to stop refresh
	 */
	setupPeriodicRefresh(date: string, venueId: string, intervalMs: number = 60000): { unsubscribe: () => void } {
		const intervalId = setInterval(() => {
			this.refreshAvailability(date, venueId).subscribe({
				error: err => console.error('Error refreshing availability data:', err),
			})
		}, intervalMs)

		// Return an object with unsubscribe method
		return {
			unsubscribe: () => clearInterval(intervalId),
		}
	}

	/**
	 * Subscribe to real-time updates for venue availability
	 * Uses the FirestoreService subscription methods for real-time updates
	 */
	subscribeToVenueAvailability(date: string, venueId: string): Observable<AvailabilityResponse> {
		// Get court queries
		const courtQueries: FirebaseServiceQuery[] = [
			{ key: 'status', value: 'active', operator: '==' },
			{ key: 'venueId', value: venueId, operator: '==' },
		]

		// Get venue
		const venue$ = this.venuesService.subscribe(venueId)

		// Get all active courts for the venue
		const courts$ = this.courtsService.subscribeToCollection(courtQueries)

		// Subscribe to bookings for this date
		const bookings$ = this.bookingsService.subscribeToCollection([{ key: 'date', value: date, operator: '==' }])

		// Combine all observables
		return combineLatest([courts$, bookings$, venue$]).pipe(
			map(([courtsMap, bookingsMap, venue]) => {
				// Process courts
				const courts: Record<string, Court> = {}
				courtsMap.forEach((court, id) => {
					if (court.status === 'active' && court.venueId === venueId) {
						courts[id] = { ...court, id }
					}
				})

				// Process bookings
				const bookings: Booking[] = []
				const courtIds = Object.keys(courts)
				bookingsMap.forEach((booking, id) => {
					if (
						courtIds.includes(booking.courtId) &&
						['confirmed', 'pending'].includes(booking.status) &&
						booking.date === date
					) {
						bookings.push({ ...booking })
					}
				})

				// Format the response
				const result: AvailabilityResponse = {
					date,
					timeSlots: {},
					courts: {},
				}

				// Generate time slots based on venue operating hours
				const timeSlotKeys = this.generateTimeSlotKeysFromVenue(venue, date)

				// Initialize time slot availability for all slots
				timeSlotKeys.forEach(timeKey => {
					result.timeSlots[timeKey] = {
						isAvailable: true,
						availableCourts: [...courtIds],
						courts: courtIds.reduce((acc, courtId) => {
							acc[courtId] = true
							return acc
						}, {} as Record<string, boolean>),
					}
				})

				// Initialize court availability
				courtIds.forEach(courtId => {
					result.courts[courtId] = {
						isAvailable: true,
						bookedTimeSlots: [],
					}
				})

				// Mark booked slots
				// Mark booked slots with proper timezone handling
				bookings.forEach(booking => {
					const { courtId, startTime, endTime } = booking

					// Skip if this court isn't in our result set
					if (!courtIds.includes(courtId)) return

					// Calculate time range with user's timezone
					const start = toUserTimezone(startTime)
					const end = toUserTimezone(endTime)

					const startHour = start.hour()
					const startMinute = start.minute()
					const endHour = end.hour()
					const endMinute = end.minute()

					console.log(`Converting booking times for court ${courtId}:`)
					console.log(`UTC: ${startTime} - ${endTime}`)
					console.log(`Local: ${start.format('HH:mm')} - ${end.format('HH:mm')}`)

					// Mark all slots in the range as unavailable
					for (let hour = startHour; hour <= endHour; hour++) {
						// Check full hour slot
						if ((hour > startHour || startMinute === 0) && (hour < endHour || endMinute === 0)) {
							const timeKey = `${hour.toString().padStart(2, '0')}:00`
							this.markSlotAsBooked(result, timeKey, courtId)
						}

						// Check half-hour slot
						if ((hour > startHour || startMinute <= 30) && (hour < endHour || endMinute > 30)) {
							const timeKey = `${hour.toString().padStart(2, '0')}:30`
							this.markSlotAsBooked(result, timeKey, courtId)
						}
					}
				})

				// Cache the result
				const cacheKey = `${date}_${venueId}`
				this.cache.set(cacheKey, { data: result, timestamp: Date.now() })

				return result
			}),
			catchError(error => {
				console.error('Error subscribing to availability data:', error)
				return throwError(() => new Error('Failed to subscribe to venue availability data'))
			}),
			shareReplay(1),
		)
	}
}
