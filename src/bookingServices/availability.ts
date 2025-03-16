// src/bookingServices/availability.service.ts

import { Firestore, collection, doc, getDoc, getDocs, getFirestore, query, where } from 'firebase/firestore'
import { Observable, from, of, throwError } from 'rxjs'
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators'
import { Court } from 'src/db/courts.collection'
import { db } from 'src/firebase/firebase'
import { MonthlyAvailability, TimeSlotStatus } from './availability.model'

/**
 * Service responsible for managing court availability
 */
export class AvailabilityService {
	private firestore: Firestore

	constructor() {
		// Initialize Firestore
		try {
			this.firestore = db
		} catch (e) {
			// App already initialized
			this.firestore = getFirestore()
		}
	}

	/**
	 * Get availability for a specific date and court
	 *
	 * @param date - Date in YYYY-MM-DD format
	 * @param courtId - Court ID
	 * @returns Observable of time slot availabilities
	 */
	getCourtDateAvailability(date: string, courtId: string): Observable<Record<string, TimeSlotStatus>> {
		// Parse date to get month document ID
		const [year, month] = date.split('-')
		const monthDocId = `${year}-${month}`

		// Get reference to the monthly availability document
		const availabilityRef = doc(this.firestore, 'availability', monthDocId)

		return from(getDoc(availabilityRef)).pipe(
			map(docSnap => {
				if (!docSnap.exists()) {
					console.log(`No availability data for ${monthDocId}, returning default slots`)
					return this.generateDefaultSlots()
				}

				const availabilityData = docSnap.data() as MonthlyAvailability

				// Check if data exists for this court and date
				if (!availabilityData.courts?.[courtId]?.[date]?.slots) {
					console.log(`No slots for court ${courtId} on ${date}, returning default slots`)
					return this.generateDefaultSlots()
				}

				return availabilityData.courts[courtId][date].slots
			}),
			catchError(error => {
				console.error('Error fetching availability:', error)
				return of(this.generateDefaultSlots())
			}),
			// Use shareReplay to cache the result and share it among multiple subscribers
			shareReplay(1),
		)
	}

	/**
	 * Get availability for all courts on a specific date
	 *
	 * @param date - Date in YYYY-MM-DD format
	 * @returns Observable of court availabilities
	 */
	getAllCourtsAvailability(date: string): Observable<Record<string, Record<string, TimeSlotStatus>>> {
		// Parse date to get month document ID
		const [year, month] = date.split('-')
		const monthDocId = `${year}-${month}`

		// Get reference to the monthly availability document
		const availabilityRef = doc(this.firestore, 'availability', monthDocId)

		// Get reference to courts collection
		const courtsRef = collection(this.firestore, 'courts')
		const activeCourtQuery = query(courtsRef, where('status', '==', 'active'))

		// Fetch active courts first, then availability
		return from(getDocs(activeCourtQuery)).pipe(
			map(querySnapshot => {
				const courts: Record<string, Court> = {}
				querySnapshot.forEach(docSnap => {
					courts[docSnap.id] = docSnap.data() as Court
				})
				return courts
			}),
			switchMap(courts => {
				// Now fetch availability data
				return from(getDoc(availabilityRef)).pipe(
					map(docSnap => {
						const result: Record<string, Record<string, TimeSlotStatus>> = {}
						const courtIds = Object.keys(courts)

						if (!docSnap.exists()) {
							console.log(`No availability data for ${monthDocId}, using default slots for all courts`)
							// Create default slots for all courts
							courtIds.forEach(courtId => {
								result[courtId] = this.generateDefaultSlots()
							})
							return result
						}

						const availabilityData = docSnap.data() as MonthlyAvailability

						// Process each court
						courtIds.forEach(courtId => {
							if (availabilityData.courts?.[courtId]?.[date]?.slots) {
								result[courtId] = availabilityData.courts[courtId][date].slots
							} else {
								// No data for this court/date, use default slots
								result[courtId] = this.generateDefaultSlots()
							}
						})

						return result
					}),
				)
			}),
			catchError(error => {
				console.error('Error fetching all courts availability:', error)
				return throwError(() => new Error('Failed to fetch court availability data'))
			}),
			// Cache the result
			shareReplay(1),
		)
	}

	/**
	 * Check if a specific time slot for a court is available
	 *
	 * @param date - Date in YYYY-MM-DD format
	 * @param courtId - Court ID
	 * @param timeSlot - Time in HH:MM format
	 * @returns Observable of whether the slot is available
	 */
	isTimeSlotAvailable(date: string, courtId: string, timeSlot: string): Observable<boolean> {
		return this.getCourtDateAvailability(date, courtId).pipe(
			map(slots => {
				// Check if the slot exists and is available
				return !!slots[timeSlot]?.isAvailable
			}),
		)
	}

	/**
	 * Check if a range of time slots for a court are all available
	 *
	 * @param date - Date in YYYY-MM-DD format
	 * @param courtId - Court ID
	 * @param startTime - Start time in HH:MM format
	 * @param durationMinutes - Duration in minutes
	 * @returns Observable of whether all slots in the range are available
	 */
	areTimeSlotRangeAvailable(
		date: string,
		courtId: string,
		startTime: string,
		durationMinutes: number,
	): Observable<boolean> {
		return this.getCourtDateAvailability(date, courtId).pipe(
			map(slots => {
				// Parse the start time
				const [startHour, startMinute] = startTime.split(':').map(Number)
				const startMinutes = startHour * 60 + startMinute
				const endMinutes = startMinutes + durationMinutes

				// Check every 30-minute slot within the range
				for (let minute = startMinutes; minute < endMinutes; minute += 30) {
					const hour = Math.floor(minute / 60)
					const mins = minute % 60
					const timeSlot = `${hour.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`

					if (!slots[timeSlot] || !slots[timeSlot].isAvailable) {
						return false
					}
				}

				return true
			}),
		)
	}

	/**
	 * Generate default availability slots for business hours
	 *
	 * @param startHour - Starting hour (default: 8 AM)
	 * @param endHour - Ending hour (default: 22 PM / 10 PM)
	 * @returns Record of default availability slots
	 */
	generateDefaultSlots(startHour: number = 8, endHour: number = 22): Record<string, TimeSlotStatus> {
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
}
