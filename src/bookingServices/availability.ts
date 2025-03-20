// src/bookingServices/availability.ts
import dayjs from 'dayjs'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { forkJoin, from, Observable, of, throwError } from 'rxjs'
import { catchError, map, shareReplay, switchMap, tap } from 'rxjs/operators'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { db } from 'src/firebase/firebase'
import { FirebaseServiceQuery, FirestoreService } from 'src/firebase/firestore.service'

export interface OperatingHours {
	monday?: { open: string; close: string }
	tuesday?: { open: string; close: string }
	wednesday?: { open: string; close: string }
	thursday?: { open: string; close: string }
	friday?: { open: string; close: string }
	saturday?: { open: string; close: string }
	sunday?: { open: string; close: string }
}

type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

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

/**
 * Service for checking court availability
 */
export class AvailabilityService {
	private courtsService: FirestoreService<Court>
	private bookingsService: FirestoreService<Booking>
	private venuesService: FirestoreService<Venue>
	private cache: Map<string, { data: AvailabilityResponse; timestamp: number }> = new Map()
	private CACHE_TTL = 30000 // 30 seconds

	constructor() {
		this.courtsService = new FirestoreService<Court>('courts')
		this.bookingsService = new FirestoreService<Booking>('bookings')
		this.venuesService = new FirestoreService<Venue>('venues')
	}

	/**
	 * Get availability data for a venue on a specific date
	 */
	getVenueAvailability(date: string, venueId: string): Observable<AvailabilityResponse> {
		const cacheKey = `${date}_${venueId}`
		const cached = this.cache.get(cacheKey)
		const now = Date.now()

		// Return cached data if it's fresh
		if (cached && now - cached.timestamp < this.CACHE_TTL) {
			return of(cached.data)
		}

		// Get all active courts for the venue
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

				// Get venue data and bookings
				const venueObs = this.venuesService.get(venueId)
				const bookingsObs = this.getBookingsForCourts(date, courtIds)

				return forkJoin({
					courts: of(courts),
					bookings: bookingsObs,
					venue: venueObs,
				})
			}),
			map(({ courts, bookings, venue }) => {
				// Format response
				const result: AvailabilityResponse = {
					date,
					timeSlots: {},
					courts: {},
				}

				const courtIds = Object.keys(courts)

				// Generate time slots based on venue operating hours
				const timeSlotKeys = this.generateTimeSlots(venue, date)

				// Initialize time slot availability
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
				bookings.forEach(booking => {
					const { courtId, startTime, endTime } = booking

					// Skip if this court isn't in our result set
					if (!courtIds.includes(courtId)) return

					// Calculate time range
					const start = dayjs(startTime)
					const end = dayjs(endTime)
					const startHour = start.hour()
					const startMinute = start.minute()
					const endHour = end.hour()
					const endMinute = end.minute()

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
			tap(data => {
				// Cache the result
				this.cache.set(cacheKey, { data, timestamp: Date.now() })
			}),
			catchError(error => {
				// If we have stale cached data, return it instead of failing
				if (cached) {
					console.warn('Failed to update availability, using cached data', error)
					return of(cached.data)
				}
				return throwError(() => error)
			}),
			shareReplay(1),
		)
	}

	/**
	 * Get bookings for multiple courts on a specific date
	 */
	private getBookingsForCourts(date: string, courtIds: string[]): Observable<Booking[]> {
		if (courtIds.length === 0) {
			return of([])
		}

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
	 * Generate time slots based on venue operating hours or defaults
	 */
	private generateTimeSlots(venue: Venue | undefined, date: string): string[] {
		if (!venue || !venue.operatingHours) {
			return this.generateDefaultTimeSlots()
		}

		// Get day of week (monday, tuesday, etc.)
		const dayOfWeek = dayjs(date).format('dddd').toLowerCase() as Weekday

		// Get operating hours for the day
		const todayHours = venue.operatingHours[dayOfWeek]

		// If venue is closed today, return empty array
		if (!todayHours) {
			return []
		}

		// Parse operating hours
		const [openHour] = todayHours.open.split(':').map(Number)
		const [closeHour] = todayHours.close.split(':').map(Number)

		// Generate slots from opening to closing time
		return this.generateDefaultTimeSlots(openHour, closeHour)
	}

	/**
	 * Generate default time slots between start and end hours
	 */
	private generateDefaultTimeSlots(startHour: number = 8, endHour: number = 22): string[] {
		const slots: string[] = []

		for (let hour = startHour; hour < endHour; hour++) {
			// Full hour
			slots.push(`${hour.toString().padStart(2, '0')}:00`)
			// Half hour
			slots.push(`${hour.toString().padStart(2, '0')}:30`)
		}

		return slots
	}

	/**
	 * Mark a time slot as booked for a specific court
	 */
	private markSlotAsBooked(response: AvailabilityResponse, timeKey: string, courtId: string): void {
		// Skip if the time slot doesn't exist
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
	 * Clear cache to force a refresh
	 */
	clearCache(): void {
		this.cache.clear()
	}

	/**
	 * Refresh availability data
	 */
	refreshAvailability(date: string, venueId: string): Observable<AvailabilityResponse> {
		const cacheKey = `${date}_${venueId}`
		this.cache.delete(cacheKey) // Remove from cache to force a refresh
		return this.getVenueAvailability(date, venueId)
	}

	/**
	 * Check if a court is available for a specific time range
	 */
	isCourtAvailableForDuration(
		availabilityData: AvailabilityResponse,
		courtId: string,
		startTime: string,
		durationMinutes: number,
	): boolean {
		if (!availabilityData || !availabilityData.timeSlots) {
			return false
		}

		// Convert to local time
		const start = dayjs(startTime)
		const end = start.add(durationMinutes, 'minute')

		// Convert to format strings for comparison (e.g., "14:00")
		const startSlot = start.format('HH:mm')
		const endSlot = end.format('HH:mm')

		// Get all relevant time slots in the range
		const relevantSlots = Object.entries(availabilityData.timeSlots).filter(
			([timeKey]) => timeKey >= startSlot && timeKey < endSlot,
		)

		// Court is available if all slots have this court available
		return relevantSlots.every(([_, slotData]) => {
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
		possibleDurations: number[],
	): number[] {
		return possibleDurations.filter(duration =>
			this.isCourtAvailableForDuration(availabilityData, courtId, startTime, duration),
		)
	}

	/**
	 * Set up periodic refresh of data
	 */
	setupPeriodicRefresh(date: string, venueId: string, intervalMs: number = 60000): { unsubscribe: () => void } {
		const intervalId = setInterval(() => {
			this.refreshAvailability(date, venueId).subscribe({
				error: err => console.error('Error refreshing availability data:', err),
			})
		}, intervalMs)

		return {
			unsubscribe: () => clearInterval(intervalId),
		}
	}
}
