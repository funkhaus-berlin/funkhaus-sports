// services/booking.service.ts
import { doc } from 'firebase/firestore'
import { Observable, throwError } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'
import { FirebaseServiceQuery, FirestoreService } from 'src/firebase/firestore.service'
import { AuthService } from '../../firebase/auth.service'
import { Booking } from './context'

/**
 * Booking service using Firestore
 */
export class BookingService {
	private service: FirestoreService<Booking>
	private authService: AuthService
	private availabilityService: FirestoreService<any>
	private CourtsDB: FirestoreService<any>

	constructor(authService?: AuthService) {
		this.service = new FirestoreService<Booking>('bookings')
		this.authService = authService || new AuthService()
		this.availabilityService = new FirestoreService<any>('availabilities')
		this.CourtsDB = new FirestoreService<any>('courts')
	}

	/**
	 * Create a new booking
	 */
	createBooking(request: Booking): Observable<Booking> {
		// Generate a booking ID
		const bookingId = doc(this.service['db'], 'bookings').id

		// Check court exists
		return this.CourtsDB.get(request.courtId!).pipe(
			switchMap(court => {
				if (!court) {
					return throwError(() => new Error('Court not found'))
				}

				// Parse date to get month document ID
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
				return this.service.runTransaction(async transaction => {
					// Get availability document
					const availabilityDocRef = doc(this.availabilityService['db'], 'availabilities', monthDocId)
					const availabilityDoc = await transaction.get(availabilityDocRef)

					if (!availabilityDoc.exists()) {
						throw new Error(`Availability not found for ${monthDocId}`)
					}

					const availability = availabilityDoc.data()

					// Get or initialize court availability
					let courtAvailability = availability.courts?.[request.courtId]
					if (!courtAvailability) {
						// Initialize court availability if it doesn't exist
						courtAvailability = {}
						if (!availability.courts) availability.courts = {}
						availability.courts[request.courtId] = courtAvailability
					}

					// Get or initialize date availability
					let dateAvailability = courtAvailability[request.date]
					if (!dateAvailability) {
						// Initialize date availability if it doesn't exist
						dateAvailability = { slots: {} }
						courtAvailability[request.date] = dateAvailability
					}

					// Get or initialize slots
					let slots = dateAvailability.slots
					if (!slots) {
						slots = {}
						dateAvailability.slots = slots
					}

					// Parse start and end times
					const startHour = parseInt(request.startTime.split(':')[0])
					const endHour = parseInt(request.endTime.split(':')[0])

					// Check each slot in the range
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
						updatedAt: new Date().toISOString(),
					})

					// Create booking
					const bookingDocRef = doc(this.service['db'], 'bookings', bookingId)
					transaction.set(bookingDocRef, {
						...bookingData,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
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
	 * Get bookings for a user with pagination
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

		// This is a simplified version since we removed getCollectionWithPagination
		// In a real app, you would implement proper pagination
		return this.service.getCollection(query).pipe(
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
	 * Cancel a booking
	 */
	cancelBooking(bookingId: string): Observable<Booking> {
		return this.service.get(bookingId).pipe(
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
						return this.service.runTransaction(async transaction => {
							// Parse date to get month document ID
							const [year, month] = booking.date.split('-')
							const monthDocId = `${year}-${month}`

							// Get availability document
							const availabilityDocRef = doc(this.availabilityService['db'], 'availabilities', monthDocId)
							const availabilityDoc = await transaction.get(availabilityDocRef)

							if (!availabilityDoc.exists()) {
								throw new Error(`Availability not found for ${monthDocId}`)
							}

							const availability = availabilityDoc.data()

							// Get or initialize court availability
							let courtAvailability = availability.courts?.[booking.courtId]
							if (!courtAvailability) {
								// Initialize court availability if it doesn't exist
								courtAvailability = {}
								if (!availability.courts) availability.courts = {}
								availability.courts[booking.courtId] = courtAvailability
							}

							// Get or initialize date availability
							let dateAvailability = courtAvailability[booking.date]
							if (!dateAvailability) {
								// Initialize date availability if it doesn't exist
								dateAvailability = { slots: {} }
								courtAvailability[booking.date] = dateAvailability
							}

							// Get or initialize slots
							let slots = dateAvailability.slots
							if (!slots) {
								slots = {}
								dateAvailability.slots = slots
							}

							// Parse start and end times
							const startHour = parseInt(booking.startTime.split(':')[0])
							const endHour = parseInt(booking.endTime.split(':')[0])

							// Release each slot in the range
							for (let hour = startHour; hour < endHour; hour++) {
								const timeSlot = `${hour.toString().padStart(2, '0')}:00`

								// Ensure the slot exists, then mark it as available
								if (!slots[timeSlot]) {
									slots[timeSlot] = {
										isAvailable: true,
										bookedBy: null,
										bookingId: null,
									}
								} else {
									slots[timeSlot].isAvailable = true
									slots[timeSlot].bookedBy = null
									slots[timeSlot].bookingId = null
								}
							}

							// Update availability
							transaction.update(availabilityDocRef, {
								[`courts.${booking.courtId}.${booking.date}.slots`]: slots,
								updatedAt: new Date().toISOString(),
							})

							// Update booking status
							const updatedBooking = {
								...booking,
								status: 'cancelled' as Booking['status'],
								paymentStatus:
									booking.paymentStatus === 'paid' ? 'refunded' : ('cancelled' as Booking['paymentStatus']),
								updatedAt: new Date().toISOString(),
							}

							const bookingDocRef = doc(this.service['db'], 'bookings', bookingId)
							transaction.update(bookingDocRef, {
								status: 'cancelled',
								paymentStatus: booking.paymentStatus === 'paid' ? 'refunded' : 'cancelled',
								updatedAt: new Date().toISOString(),
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
	 * Get a specific booking
	 */
	getBooking(bookingId: string): Observable<Booking> {
		return this.service.get(bookingId).pipe(
			switchMap(booking => {
				if (!booking) {
					return throwError(() => new Error('Booking not found'))
				}

				// Check user authorization
				const currentUserId = this.authService.getCurrentUserId()
				return this.authService.isCurrentUserAdmin().pipe(
					switchMap(isAdmin => {
						if (!isAdmin && booking.userId !== currentUserId) {
							return throwError(() => new Error('Unauthorized: You can only view your own bookings'))
						}

						return throwError(() => booking)
					}),
				)
			}),
			catchError(error => {
				console.error('Error getting booking:', error)
				return throwError(() => error)
			}),
		)
	}
}
