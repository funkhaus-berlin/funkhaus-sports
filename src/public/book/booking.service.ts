// src/bookingServices/firestore-booking.service.ts
import { doc, Timestamp } from 'firebase/firestore'
import { Observable, throwError } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'
import { AuthService } from 'src/firebase/auth.service'
import { FirebaseServiceQuery, FirestoreService } from 'src/firebase/firestore.service'
import { Booking } from './context'

/**
 * Booking service using Firestore with an optimized data structure
 * Implements the court booking system with efficient date/time slot management
 */
export class FirestoreBookingService {
	private bookingsService: FirestoreService<Booking>
	private availabilityService: FirestoreService<any>
	private courtsService: FirestoreService<any>
	private authService: AuthService

	constructor(authService?: AuthService) {
		this.bookingsService = new FirestoreService<Booking>('bookings')
		this.availabilityService = new FirestoreService<any>('availability')
		this.courtsService = new FirestoreService<any>('courts')
		this.authService = authService || new AuthService()
	}

	/**
	 * Create a new booking with optimized Firestore structure
	 * Uses transactions to ensure data consistency
	 */
	createBooking(request: Booking): Observable<Booking> {
		// Generate a booking ID
		const bookingId = doc(this.bookingsService.db, 'bookings').id

		// Validate court exists
		return this.courtsService.get(request.courtId!).pipe(
			switchMap(court => {
				if (!court) {
					return throwError(() => new Error('Court not found'))
				}

				// Parse date to get month document ID for optimized queries
				const [year, month] = request.date!.split('-')
				const monthDocId = `${year}-${month}`

				// Create booking data
				const bookingData: Booking = {
					id: bookingId,
					userId: request.userId,
					userName: request.userName,
					courtId: request.courtId,
					date: request.date,
					startTime: request.startTime,
					endTime: request.endTime,
					status: 'confirmed',
					price: request.price,
					paymentStatus: 'pending',
				}

				// Run in a transaction to ensure consistency
				return this.bookingsService.runTransaction(async transaction => {
					// Get availability document
					const availabilityDocRef = doc(this.availabilityService.db, 'availability', monthDocId)

					const availabilityDoc = await transaction.get(availabilityDocRef)

					// Create monthly document if it doesn't exist
					if (!availabilityDoc.exists()) {
						await transaction.set(availabilityDocRef, {
							month: monthDocId,
							courts: {},
							createdAt: Timestamp.now(),
						})
					}

					const availability = availabilityDoc.exists() ? availabilityDoc.data() : { courts: {} }

					// Get or initialize court availability
					let courtAvailability = availability.courts?.[request.courtId!]
					if (!courtAvailability) {
						courtAvailability = {}
						if (!availability.courts) availability.courts = {}
						availability.courts[request.courtId!] = courtAvailability
					}

					// Get or initialize date availability
					let dateAvailability = courtAvailability[request.date!]
					if (!dateAvailability) {
						dateAvailability = { slots: {} }
						courtAvailability[request.date!] = dateAvailability
					}

					// Get or initialize slots
					let slots = dateAvailability.slots
					if (!slots) {
						slots = {}
						dateAvailability.slots = slots
					}

					// Parse start and end times
					const startHour = new Date(request.startTime).getHours()
					const endHour = new Date(request.endTime).getHours()

					// Check each slot in the booking range
					for (let hour = startHour; hour < endHour; hour++) {
						const timeSlot = `${hour.toString().padStart(2, '0')}:00`

						// If slot doesn't exist, create it with default (available)
						if (!slots[timeSlot]) {
							slots[timeSlot] = {
								isAvailable: true,
								bookedBy: null,
								bookingId: null,
							}
						}

						// Check if the slot is available
						if (!slots[timeSlot].isAvailable || slots[timeSlot].bookedBy) {
							throw new Error(`Time slot ${timeSlot} is not available`)
						}

						// Mark as booked
						slots[timeSlot].isAvailable = false
						slots[timeSlot].bookedBy = request.userId
						slots[timeSlot].bookingId = bookingId
					}

					// Update availability
					transaction.update(availabilityDocRef, {
						[`courts.${request.courtId}.${request.date}.slots`]: slots,
						updatedAt: Timestamp.now(),
					})

					// Create booking document
					const bookingDocRef = doc(this.bookingsService.db, 'bookings', bookingId)
					transaction.set(bookingDocRef, {
						...bookingData,
						createdAt: Timestamp.now(),
						updatedAt: Timestamp.now(),
					})

					return { ...bookingData, id: bookingId }
				})
			}),
			catchError(error => {
				console.error('Error creating booking:', error)
				return throwError(() => error)
			}),
		)
	}

	/**
	 * Get availability for a specific date
	 * Used to show available time slots to users
	 */
	getDateAvailability(courtId: string, date: string): Observable<Record<string, { isAvailable: boolean }>> {
		const [year, month] = date.split('-')
		const monthDocId = `${year}-${month}`

		return this.availabilityService.get(monthDocId).pipe(
			map(doc => {
				if (!doc) {
					// If no document exists, all slots are available
					return this.generateDefaultSlots()
				}

				const courtData = doc.courts?.[courtId]
				if (!courtData || !courtData[date] || !courtData[date].slots) {
					// If no court data exists for this date, all slots are available
					return this.generateDefaultSlots()
				}

				return courtData[date].slots
			}),
			catchError(error => {
				console.error('Error getting availability:', error)
				return throwError(() => error)
			}),
		)
	}

	/**
	 * Get all courts availability for a specific date
	 * Used for automatic court assignment
	 */
	getAllCourtsAvailability(date: string): Observable<Record<string, Record<string, { isAvailable: boolean }>>> {
		const [year, month] = date.split('-')
		const monthDocId = `${year}-${month}`

		return this.availabilityService.get(monthDocId).pipe(
			map(doc => {
				if (!doc || !doc.courts) {
					return {}
				}

				const result: Record<string, Record<string, { isAvailable: boolean }>> = {}

				// Process each court
				Object.entries(doc.courts).forEach(([courtId, courtData]: [string, any]) => {
					if (courtData[date] && courtData[date].slots) {
						result[courtId] = courtData[date].slots
					} else {
						// If no data for this date, all slots are available
						result[courtId] = this.generateDefaultSlots()
					}
				})

				return result
			}),
			catchError(error => {
				console.error('Error getting all courts availability:', error)
				return throwError(() => error)
			}),
		)
	}

	/**
	 * Cancel a booking and release time slots
	 */
	cancelBooking(bookingId: string): Observable<Booking> {
		return this.bookingsService.get(bookingId).pipe(
			switchMap(booking => {
				if (!booking) {
					return throwError(() => new Error('Booking not found'))
				}

				// Check user authorization
				const currentUserId = this.authService.getCurrentUserId()
				return this.authService.isCurrentUserAdmin().pipe(
					switchMap(isAdmin => {
						if (!isAdmin && booking.userId !== currentUserId) {
							return throwError(() => new Error('Unauthorized: You can only cancel your own bookings'))
						}

						// Run in a transaction to ensure consistency
						return this.bookingsService.runTransaction(async transaction => {
							// Parse date to get month document ID
							const [year, month] = booking.date.split('-')
							const monthDocId = `${year}-${month}`

							// Get availability document
							const availabilityDocRef = doc(this.availabilityService.db, 'availability', monthDocId)

							const availabilityDoc = await transaction.get(availabilityDocRef)

							if (!availabilityDoc.exists()) {
								throw new Error(`Availability not found for ${monthDocId}`)
							}

							const availability = availabilityDoc.data()

							// Get court availability
							const courtAvailability = availability.courts?.[booking.courtId]
							if (!courtAvailability) {
								throw new Error(`Court availability not found for ${booking.courtId}`)
							}

							// Get date availability
							const dateAvailability = courtAvailability[booking.date]
							if (!dateAvailability) {
								throw new Error(`Date availability not found for ${booking.date}`)
							}

							// Get slots
							const slots = dateAvailability.slots || {}

							// Parse start and end times
							const startHour = new Date(booking.startTime).getHours()
							const endHour = new Date(booking.endTime).getHours()

							// Release each slot in the range
							for (let hour = startHour; hour < endHour; hour++) {
								const timeSlot = `${hour.toString().padStart(2, '0')}:00`

								// Check if slot exists and is booked by this booking
								if (slots[timeSlot] && slots[timeSlot].bookingId === bookingId) {
									slots[timeSlot].isAvailable = true
									slots[timeSlot].bookedBy = null
									slots[timeSlot].bookingId = null
								}
							}

							// Update availability
							transaction.update(availabilityDocRef, {
								[`courts.${booking.courtId}.${booking.date}.slots`]: slots,
								updatedAt: Timestamp.now(),
							})

							// Update booking status
							const updatedBooking = {
								...booking,
								status: 'cancelled' as Booking['status'],
								paymentStatus:
									booking.paymentStatus === 'paid' ? 'refunded' : ('cancelled' as Booking['paymentStatus']),
								updatedAt: Timestamp.now(),
							}

							const bookingDocRef = doc(this.bookingsService.db, 'bookings', bookingId)
							transaction.update(bookingDocRef, {
								status: 'cancelled',
								paymentStatus: booking.paymentStatus === 'paid' ? 'refunded' : 'cancelled',
								updatedAt: Timestamp.now(),
							})

							return updatedBooking
						})
					}),
				)
			}),
			catchError(error => {
				console.error('Error cancelling booking:', error)
				return throwError(() => error)
			}),
		)
	}

	/**
	 * Get user bookings with pagination
	 */
	getUserBookings(
		userId: string,
		page: number = 1,
		pageSize: number = 10,
	): Observable<{ bookings: Booking[]; total: number; page: number; pageSize: number }> {
		const query: FirebaseServiceQuery[] = [
			{
				key: 'userId',
				value: userId,
				operator: '==',
			},
		]

		return this.bookingsService.getCollection(query).pipe(
			map(bookingsMap => {
				const allBookings = Array.from(bookingsMap.values())
				const total = allBookings.length

				// Apply pagination manually
				const startIdx = (page - 1) * pageSize
				const endIdx = Math.min(startIdx + pageSize, total)
				const paginatedBookings = allBookings.slice(startIdx, endIdx)

				return {
					bookings: paginatedBookings,
					total,
					page,
					pageSize,
				}
			}),
		)
	}

	/**
	 * Generate default availability slots for a range of operating hours
	 * Used when no data exists yet for a date/court combination
	 */
	private generateDefaultSlots(startHour: number = 8, endHour: number = 22): Record<string, { isAvailable: boolean }> {
		const slots: Record<string, { isAvailable: boolean }> = {}

		for (let hour = startHour; hour < endHour; hour++) {
			const timeKey = `${hour.toString().padStart(2, '0')}:00`
			slots[timeKey] = { isAvailable: true }

			// Add half-hour slots if needed
			const halfHourKey = `${hour.toString().padStart(2, '0')}:30`
			slots[halfHourKey] = { isAvailable: true }
		}

		return slots
	}
}
