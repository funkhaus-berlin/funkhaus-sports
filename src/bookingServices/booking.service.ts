// src/bookingServices/booking.service.ts

import {
	Firestore,
	collection,
	doc,
	getDoc,
	getDocs,
	getFirestore,
	query,
	runTransaction,
	serverTimestamp,
	updateDoc,
	where,
} from 'firebase/firestore'
import { Observable, from, throwError } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'
import { db } from 'src/firebase/firebase'
import { Booking } from '../public/book/context'

/**
 * Service responsible for managing bookings and interacting with Firestore
 */
export class BookingService {
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
	 * Create a new booking and reserve the time slots
	 *
	 * @param booking - Booking data
	 * @returns Observable of the created booking
	 */
	createBooking(booking: Booking): Observable<Booking> {
		// Validate required fields
		if (!booking.courtId || !booking.date || !booking.startTime || !booking.endTime) {
			return throwError(() => new Error('Missing required booking fields'))
		}

		// Parse date to get month document ID
		const [year, month] = booking.date.split('-')
		const monthDocId = `${year}-${month}`

		// Get references
		const bookingsRef = collection(this.firestore, 'bookings')
		const availabilityRef = doc(this.firestore, 'availability', monthDocId)

		// Generate a new booking ID
		const bookingId = doc(bookingsRef).id

		// Create an observable that uses a transaction to ensure atomicity
		return from(
			runTransaction(this.firestore, async transaction => {
				// Get current availability
				const availabilityDoc = await transaction.get(availabilityRef)

				if (!availabilityDoc.exists()) {
					throw new Error(`No availability document found for ${monthDocId}`)
				}

				const availabilityData = availabilityDoc.data()

				// Ensure path to slots exists
				if (
					!availabilityData.courts ||
					!availabilityData.courts[booking.courtId] ||
					!availabilityData.courts[booking.courtId][booking.date] ||
					!availabilityData.courts[booking.courtId][booking.date].slots
				) {
					throw new Error(`No availability slots found for court ${booking.courtId} on ${booking.date}`)
				}

				const slots = availabilityData.courts[booking.courtId][booking.date].slots

				// Calculate time slots to reserve
				const startDate = new Date(booking.startTime)
				const endDate = new Date(booking.endTime)
				const startHour = startDate.getHours()
				const startMinute = startDate.getMinutes()
				const endHour = endDate.getHours()
				const endMinute = endDate.getMinutes()

				// Adjust end time if it ends at exactly 00 minutes
				const adjustedEndHour = endMinute === 0 ? endHour : endHour + 1

				// Check all slots are available
				for (let hour = startHour; hour < adjustedEndHour; hour++) {
					// Check full hour slot
					const timeSlot = `${hour.toString().padStart(2, '0')}:00`

					if (!slots[timeSlot] || !slots[timeSlot].isAvailable) {
						throw new Error(`Time slot ${timeSlot} is not available`)
					}

					// If start minute is 0 and we're at the first hour,
					// or if end minute is 0 and we're at the last hour,
					// we don't need to check the half-hour slot
					if ((hour === startHour && startMinute === 30) || (hour === endHour - 1 && endMinute === 0)) {
						continue
					}

					// Check half-hour slot
					const halfHourSlot = `${hour.toString().padStart(2, '0')}:30`

					if (!slots[halfHourSlot] || !slots[halfHourSlot].isAvailable) {
						throw new Error(`Time slot ${halfHourSlot} is not available`)
					}
				}

				// All slots available, now reserve them
				const updates: Record<string, any> = {}

				for (let hour = startHour; hour < adjustedEndHour; hour++) {
					// Update full hour slot
					const timeSlot = `${hour.toString().padStart(2, '0')}:00`
					const slotPath = `courts.${booking.courtId}.${booking.date}.slots.${timeSlot}`

					updates[`${slotPath}.isAvailable`] = false
					updates[`${slotPath}.bookedBy`] = booking.userId || null
					updates[`${slotPath}.bookingId`] = bookingId

					// If we need to update the half-hour slot too
					if ((hour === startHour && startMinute === 30) || (hour === endHour - 1 && endMinute === 0)) {
						continue
					}

					// Update half-hour slot
					const halfHourSlot = `${hour.toString().padStart(2, '0')}:30`
					const halfSlotPath = `courts.${booking.courtId}.${booking.date}.slots.${halfHourSlot}`

					updates[`${halfSlotPath}.isAvailable`] = false
					updates[`${halfSlotPath}.bookedBy`] = booking.userId || null
					updates[`${halfSlotPath}.bookingId`] = bookingId
				}

				// Update lastUpdated timestamp
				updates.updatedAt = serverTimestamp()

				// Update availability document
				transaction.update(availabilityRef, updates)

				// Create the booking document
				const newBookingRef = doc(bookingsRef, bookingId)

				const bookingData = {
					...booking,
					id: bookingId,
					status: 'confirmed',
					paymentStatus: booking.paymentStatus || 'pending',
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				}

				transaction.set(newBookingRef, bookingData)

				// Return the created booking
				return {
					...bookingData,
					id: bookingId,
				}
			}),
		).pipe(
			map(result => result as Booking),
			catchError(error => {
				console.error('Error creating booking:', error)
				return throwError(() => new Error(`Failed to create booking: ${error.message}`))
			}),
		)
	}

	/**
	 * Get a booking by ID
	 *
	 * @param bookingId - Booking ID
	 * @returns Observable of the booking
	 */
	getBooking(bookingId: string): Observable<Booking | null> {
		const bookingRef = doc(this.firestore, 'bookings', bookingId)

		return from(getDoc(bookingRef)).pipe(
			map(docSnap => {
				if (!docSnap.exists()) {
					return null
				}

				const data = docSnap.data()
				return { ...data, id: docSnap.id } as Booking
			}),
			catchError(error => {
				console.error('Error fetching booking:', error)
				return throwError(() => new Error(`Failed to fetch booking: ${error.message}`))
			}),
		)
	}

	/**
	 * Get all bookings for a user
	 *
	 * @param userId - User ID
	 * @param limit - Maximum number of bookings to return
	 * @returns Observable of user bookings
	 */
	getUserBookings(userId: string, limit: number = 10): Observable<Booking[]> {
		const bookingsRef = collection(this.firestore, 'bookings')
		const userBookingsQuery = query(
			bookingsRef,
			where('userId', '==', userId),
			where('date', '>=', new Date().toISOString().split('T')[0]), // Only future bookings
		)

		return from(getDocs(userBookingsQuery)).pipe(
			map(querySnapshot => {
				const bookings: Booking[] = []

				querySnapshot.forEach(docSnap => {
					const data = docSnap.data()
					bookings.push({ ...data, id: docSnap.id } as Booking)
				})

				// Sort by date/time (ascending)
				return bookings
					.sort((a, b) => {
						const dateA = new Date(`${a.date}T${a.startTime.split('T')[1]}`)
						const dateB = new Date(`${b.date}T${b.startTime.split('T')[1]}`)
						return dateA.getTime() - dateB.getTime()
					})
					.slice(0, limit)
			}),
			catchError(error => {
				console.error('Error fetching user bookings:', error)
				return throwError(() => new Error(`Failed to fetch user bookings: ${error.message}`))
			}),
		)
	}

	/**
	 * Update a booking's payment status
	 *
	 * @param bookingId - Booking ID
	 * @param paymentStatus - New payment status
	 * @returns Observable of the updated booking
	 */
	updateBookingPaymentStatus(bookingId: string, paymentStatus: string): Observable<Booking> {
		const bookingRef = doc(this.firestore, 'bookings', bookingId)

		return from(
			updateDoc(bookingRef, {
				paymentStatus,
				updatedAt: serverTimestamp(),
				// If payment is successful, update status to confirmed
				...(paymentStatus === 'paid' ? { status: 'confirmed' } : {}),
			}),
		).pipe(
			switchMap(() => this.getBooking(bookingId)),
			map(booking => {
				if (!booking) {
					throw new Error('Booking not found after update')
				}
				return booking
			}),
			catchError(error => {
				console.error('Error updating booking payment status:', error)
				return throwError(() => new Error(`Failed to update booking payment status: ${error.message}`))
			}),
		)
	}

	/**
	 * Cancel a booking and release the time slots
	 *
	 * @param bookingId - Booking ID
	 * @returns Observable of the cancelled booking
	 */
	cancelBooking(bookingId: string): Observable<Booking> {
		return this.getBooking(bookingId).pipe(
			switchMap(booking => {
				if (!booking) {
					return throwError(() => new Error('Booking not found'))
				}

				// Parse date to get month document ID
				const [year, month] = booking.date.split('-')
				const monthDocId = `${year}-${month}`

				// Get references
				const bookingRef = doc(this.firestore, 'bookings', bookingId)
				const availabilityRef = doc(this.firestore, 'availability', monthDocId)

				// Create an observable that uses a transaction to ensure atomicity
				return from(
					runTransaction(this.firestore, async transaction => {
						// Get current availability
						const availabilityDoc = await transaction.get(availabilityRef)

						if (!availabilityDoc.exists()) {
							throw new Error(`No availability document found for ${monthDocId}`)
						}

						const availabilityData = availabilityDoc.data()

						// Ensure path to slots exists
						if (
							!availabilityData.courts ||
							!availabilityData.courts[booking.courtId] ||
							!availabilityData.courts[booking.courtId][booking.date] ||
							!availabilityData.courts[booking.courtId][booking.date].slots
						) {
							throw new Error(`No availability slots found for court ${booking.courtId} on ${booking.date}`)
						}

						const slots = availabilityData.courts[booking.courtId][booking.date].slots

						// Calculate time slots to release
						const startDate = new Date(booking.startTime)
						const endDate = new Date(booking.endTime)
						const startHour = startDate.getHours()
						const startMinute = startDate.getMinutes()
						const endHour = endDate.getHours()
						const endMinute = endDate.getMinutes()

						// Adjust end time if it ends at exactly 00 minutes
						const adjustedEndHour = endMinute === 0 ? endHour : endHour + 1

						// Release all slots
						const updates: Record<string, any> = {}

						for (let hour = startHour; hour < adjustedEndHour; hour++) {
							// Update full hour slot
							const timeSlot = `${hour.toString().padStart(2, '0')}:00`

							// Only update if this slot is associated with this booking
							if (slots[timeSlot] && slots[timeSlot].bookingId === bookingId) {
								const slotPath = `courts.${booking.courtId}.${booking.date}.slots.${timeSlot}`

								updates[`${slotPath}.isAvailable`] = true
								updates[`${slotPath}.bookedBy`] = null
								updates[`${slotPath}.bookingId`] = null
							}

							// If we need to update the half-hour slot too
							if ((hour === startHour && startMinute === 30) || (hour === endHour - 1 && endMinute === 0)) {
								continue
							}

							// Update half-hour slot
							const halfHourSlot = `${hour.toString().padStart(2, '0')}:30`

							// Only update if this slot is associated with this booking
							if (slots[halfHourSlot] && slots[halfHourSlot].bookingId === bookingId) {
								const halfSlotPath = `courts.${booking.courtId}.${booking.date}.slots.${halfHourSlot}`

								updates[`${halfSlotPath}.isAvailable`] = true
								updates[`${halfSlotPath}.bookedBy`] = null
								updates[`${halfSlotPath}.bookingId`] = null
							}
						}

						// Update lastUpdated timestamp
						updates.updatedAt = serverTimestamp()

						// Update availability document
						transaction.update(availabilityRef, updates)

						// Update the booking document
						transaction.update(bookingRef, {
							status: 'cancelled',
							paymentStatus: booking.paymentStatus === 'paid' ? 'refunded' : 'cancelled',
							updatedAt: serverTimestamp(),
						})

						// Return the cancelled booking
						return {
							...booking,
							status: 'cancelled',
							paymentStatus: booking.paymentStatus === 'paid' ? 'refunded' : 'cancelled',
						}
					}),
				)
			}),
			catchError(error => {
				console.error('Error cancelling booking:', error)
				return throwError(() => new Error(`Failed to cancel booking: ${error.message}`))
			}),
		)
	}
}
