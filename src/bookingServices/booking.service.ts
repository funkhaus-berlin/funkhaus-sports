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
	setDoc
} from 'firebase/firestore'
import { Observable, from, of, throwError } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'
import { db } from 'src/firebase/firebase'
import { Booking } from '../public/book/context'

/**
 * Service responsible for managing bookings and interacting with Firestore
 */
export class BookingService {
	private firestore: Firestore

	constructor() {
		this.firestore = db || getFirestore()
	}

	/**
	 * Create a new booking and reserve the time slots.
	 * For 'temporary' status bookings, we only create the booking without reserving slots.
	 * For 'confirmed' or 'paid' status bookings, we reserve the slots.
	 */
	createBooking(booking: Booking): Observable<Booking> {
		// Validate required fields
		if (!this.validateBookingData(booking)) {
			return throwError(() => new Error('Missing required booking fields'))
		}

		// Generate a new booking ID if not provided
		const bookingsRef = collection(this.firestore, 'bookings')
		const bookingId = booking.id || doc(bookingsRef).id
		
		// If this is a temporary booking (payment not confirmed yet), just create the booking record
		// without reserving time slots to prevent blocking courts for payments that might fail
		if (booking.status === 'temporary') {
			console.log('Creating temporary booking without reserving slots:', bookingId)
			const bookingData = this.prepareBookingData(booking, bookingId)
			const newBookingRef = doc(bookingsRef, bookingId)
			
			return from(setDoc(newBookingRef, bookingData)).pipe(
				map(() => ({ ...bookingData, id: bookingId } as Booking)),
				catchError(error => {
					console.error('Error creating temporary booking:', error)
					return throwError(() => new Error(`Failed to create temporary booking: ${error.message}`))
				})
			)
		}
		
		// Otherwise, proceed with normal booking creation + slot reservation
		// Parse date to get month document ID
		const [year, month] = booking.date.split('-')
		const monthDocId = `${year}-${month}`
		
		// Get references
		const availabilityRef = doc(this.firestore, 'availability', monthDocId)

		// Create a transaction to ensure atomicity
		return from(
			runTransaction(this.firestore, async transaction => {
				// Check availability
				const availabilityDoc = await transaction.get(availabilityRef)

				if (!availabilityDoc.exists()) {
					return this.createBookingWithoutAvailabilityCheck(bookingId, booking, transaction)
				}

				const availabilityData = availabilityDoc.data()

				// Check if slots exist for this court and date
				if (!availabilityData.courts?.[booking.courtId]?.[booking.date]?.slots) {
					return this.createBookingWithoutAvailabilityCheck(bookingId, booking, transaction)
				}

				// Get the slots for this court and date
				const slots = availabilityData.courts[booking.courtId][booking.date].slots

				// Calculate time slots to reserve
				const startDate = new Date(booking.startTime)
				const endDate = new Date(booking.endTime)
				const startHour = startDate.getHours()
				const startMinute = startDate.getMinutes()
				const endHour = endDate.getHours()
				const endMinute = endDate.getMinutes()
				const adjustedEndHour = endMinute === 0 ? endHour : endHour + 1

				// Check if all slots are available
				for (let hour = startHour; hour < adjustedEndHour; hour++) {
					// Check full hour slot
					const timeSlot = `${hour.toString().padStart(2, '0')}:00`

					if (!slots[timeSlot] || !slots[timeSlot].isAvailable) {
						if (booking.paymentStatus === 'paid') continue
						throw new Error(`Time slot ${timeSlot} is already booked. Please select another time.`)
					}

					// Skip half-hour check for start/end hours if needed
					if ((hour === startHour && startMinute === 30) || (hour === endHour - 1 && endMinute === 0)) {
						continue
					}

					// Check half-hour slot
					const halfHourSlot = `${hour.toString().padStart(2, '0')}:30`
					if (!slots[halfHourSlot] || !slots[halfHourSlot].isAvailable) {
						if (booking.paymentStatus === 'paid') continue
						throw new Error(`Time slot ${halfHourSlot} is already booked. Please select another time.`)
					}
				}

				// Mark slots as unavailable
				const updates: Record<string, any> = {}
				for (let hour = startHour; hour < adjustedEndHour; hour++) {
					// Update full hour slot
					const timeSlot = `${hour.toString().padStart(2, '0')}:00`
					const slotPath = `courts.${booking.courtId}.${booking.date}.slots.${timeSlot}`

					updates[`${slotPath}.isAvailable`] = false
					updates[`${slotPath}.bookedBy`] = booking.userId || null
					updates[`${slotPath}.bookingId`] = bookingId

					// Skip half-hour update for start/end hours if needed
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

				// Update availability and timestamp
				updates.updatedAt = serverTimestamp()
				transaction.update(availabilityRef, updates)

				// Create the booking document
				const bookingData = this.prepareBookingData(booking, bookingId)
				const newBookingRef = doc(bookingsRef, bookingId)
				transaction.set(newBookingRef, bookingData)

				return {
					...bookingData,
					id: bookingId,
				}
			}),
		).pipe(
			map(result => result as Booking),
			catchError(error => {
				console.error('Error creating booking:', error)

				if (error.message.includes('already booked')) {
					return throwError(() => new Error(error.message))
				}

				return throwError(() => new Error(`Failed to create booking: ${error.message}`))
			}),
		)
	}

	/**
	 * Create booking without checking availability
	 */
	private async createBookingWithoutAvailabilityCheck(bookingId: string, booking: Booking, transaction: any) {
		const bookingsRef = collection(this.firestore, 'bookings')
		const newBookingRef = doc(bookingsRef, bookingId)
		const bookingData = this.prepareBookingData(booking, bookingId)

		transaction.set(newBookingRef, bookingData)
		console.log(`Created booking ${bookingId} without availability check`)

		return {
			...bookingData,
			id: bookingId,
		}
	}

	/**
	 * Prepare booking data with required fields
	 */
	private prepareBookingData(booking: Booking, bookingId: string) {
		const isGuestBooking = booking.userId && booking.userId.startsWith('guest-')

		return {
			...booking,
			id: bookingId,
			status: booking.status || 'confirmed',
			paymentStatus: booking.paymentStatus || 'pending',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			customerEmail: booking.customerEmail || null,
			customerPhone: booking.customerPhone || null,
			customerAddress: booking.customerAddress || {
				street: '',
				city: '',
				postalCode: '',
				country: '',
			},
			isGuestBooking: isGuestBooking || false,
		}
	}

	/**
	 * Validate booking data
	 */
	private validateBookingData(booking: Booking): boolean {
		// Check required fields
		if (!booking.courtId || !booking.date || !booking.startTime || !booking.endTime) {
			return false
		}

		// Validate date format
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/
		if (!dateRegex.test(booking.date)) {
			return false
		}

		// Validate time ordering
		try {
			const startTime = new Date(booking.startTime)
			const endTime = new Date(booking.endTime)
			if (startTime >= endTime) return false
		} catch {
			return false
		}

		// Validate price is positive
		if (booking.price <= 0) {
			return false
		}

		return true
	}

	/**
	 * Get a booking by ID
	 */
	getBooking(bookingId: string): Observable<Booking | null> {
		const bookingRef = doc(this.firestore, 'bookings', bookingId)

		return from(getDoc(bookingRef)).pipe(
			map(docSnap => {
				if (!docSnap.exists()) return null
				return { ...docSnap.data(), id: docSnap.id } as Booking
			}),
			catchError(error => {
				console.error('Error fetching booking:', error)
				return throwError(() => new Error(`Failed to fetch booking: ${error.message}`))
			}),
		)
	}

	/**
	 * Update a booking's payment status
	 */
	updateBookingPaymentStatus(bookingId: string, paymentStatus: string): Observable<Booking> {
		const bookingRef = doc(this.firestore, 'bookings', bookingId)

		return from(getDoc(bookingRef)).pipe(
			switchMap(docSnap => {
				if (!docSnap.exists()) {
					return throwError(() => new Error('Booking not found'))
				}

				const updateData = {
					paymentStatus,
					updatedAt: new Date().toISOString(),
					...(paymentStatus === 'paid' ? { status: 'confirmed' } : {}),
				}

				return from(updateDoc(bookingRef, updateData)).pipe(
					switchMap(() => this.getBooking(bookingId)),
					map(booking => {
						if (!booking) throw new Error('Booking not found after update')
						return booking
					}),
				)
			}),
			catchError(error => {
				console.error('Error updating payment status:', error)
				return throwError(() => new Error(`Failed to update payment status: ${error.message}`))
			}),
		)
	}

	/**
	 * Get all bookings for a user
	 */
	getUserBookings(userId: string, limit: number = 10): Observable<Booking[]> {
		if (!userId) return of([])

		const bookingsRef = collection(this.firestore, 'bookings')
		const userBookingsQuery = query(
			bookingsRef,
			where('userId', '==', userId),
			where('date', '>=', new Date().toISOString().split('T')[0]),
		)

		return from(getDocs(userBookingsQuery)).pipe(
			map(querySnapshot => {
				const bookings: Booking[] = []
				querySnapshot.forEach(docSnap => {
					bookings.push({ ...docSnap.data(), id: docSnap.id } as Booking)
				})

				// Sort by date/time and limit
				return bookings
					.sort((a, b) => {
						const dateA = new Date(`${a.date}T${new Date(a.startTime).toISOString().split('T')[1]}`)
						const dateB = new Date(`${b.date}T${new Date(b.startTime).toISOString().split('T')[1]}`)
						return dateA.getTime() - dateB.getTime()
					})
					.slice(0, limit)
			}),
			catchError(() => of([])),
		)
	}

	/**
	 * Get bookings by email
	 */
	getBookingsByEmail(email: string, limit: number = 10): Observable<Booking[]> {
		if (!email) return of([])

		const bookingsRef = collection(this.firestore, 'bookings')
		const emailBookingsQuery = query(
			bookingsRef,
			where('customerEmail', '==', email),
			where('date', '>=', new Date().toISOString().split('T')[0]),
		)

		return from(getDocs(emailBookingsQuery)).pipe(
			map(querySnapshot => {
				const bookings: Booking[] = []
				querySnapshot.forEach(docSnap => {
					bookings.push({ ...docSnap.data(), id: docSnap.id } as Booking)
				})

				// Sort by date/time and limit
				return bookings
					.sort((a, b) => {
						const dateA = new Date(`${a.date}T${new Date(a.startTime).toISOString().split('T')[1]}`)
						const dateB = new Date(`${b.date}T${new Date(b.startTime).toISOString().split('T')[1]}`)
						return dateA.getTime() - dateB.getTime()
					})
					.slice(0, limit)
			}),
			catchError(() => of([])),
		)
	}
}
