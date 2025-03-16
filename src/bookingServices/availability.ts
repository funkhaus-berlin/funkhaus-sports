// src/bookingServices/availability.ts

import dayjs from 'dayjs'
import { Firestore, collection, doc, getDoc, getDocs, getFirestore, query, where } from 'firebase/firestore'
import { Observable, forkJoin, from, of, throwError } from 'rxjs'
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators'
import { Court } from 'src/db/courts.collection'
import { OperatingHours, Venue } from 'src/db/venue-collection'
import { db } from 'src/firebase/firebase'
import { TimeSlotStatus } from './availability.model'

/**
 * Service for managing court availability data
 * This implementation ensures that bookings are correctly reflected in availability
 */
export class AvailabilityService {
	private firestore: Firestore

	constructor() {
		try {
			this.firestore = db
		} catch (e) {
			this.firestore = getFirestore()
		}
	}

	/**
	 * Get availability for all courts on a specific date
	 * This is the core method that determines time slot availability
	 *
	 * @param date - Date in YYYY-MM-DD format
	 * @param venueId - Optional venue ID to filter courts
	 * @returns Observable of court availabilities
	 */
	getAllCourtsAvailability(date: string, venueId?: string): Observable<Record<string, Record<string, TimeSlotStatus>>> {
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
					const { courtId, startTime, endTime } = booking

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
									bookedBy: booking.userId || null,
									bookingId: booking.id,
								}
							}
						}

						// Determine if we need to mark the half-hour slot
						if ((hour > startHour || startMinute <= 30) && (hour < endHour || endMinute > 30)) {
							const timeKey = `${hour.toString().padStart(2, '0')}:30`
							if (result[courtId][timeKey]) {
								result[courtId][timeKey] = {
									isAvailable: false,
									bookedBy: booking.userId || null,
									bookingId: booking.id,
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
	generateSlotsFromVenueHours(venue: Venue | null, date: string): Record<string, TimeSlotStatus> {
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
	generateDefaultTimeSlots(startHour: number = 8, endHour: number = 22): Record<string, TimeSlotStatus> {
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
		return this.getAllCourtsAvailability(date).pipe(
			map(allAvailability => {
				// Get availability for the specific court
				const courtAvailability = allAvailability[courtId]
				if (!courtAvailability) {
					return false // Court not found or not active
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
						if (!courtAvailability[timeKey] || !courtAvailability[timeKey].isAvailable) {
							return false // Slot not available
						}
					}

					// Check half-hour slot if needed
					if ((hour > startHour || startMinute <= 30) && (hour < endHour || endMinute > 30)) {
						const timeKey = `${hour.toString().padStart(2, '0')}:30`
						if (!courtAvailability[timeKey] || !courtAvailability[timeKey].isAvailable) {
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
}
