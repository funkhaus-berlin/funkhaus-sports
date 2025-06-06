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
	updateDoc,
	where
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
		
		// If this is a holding booking (payment not confirmed yet), check for conflicts
		// with ALL existing bookings (confirmed, paid, or holding) to prevent any overlapping bookings
		if (booking.status === 'holding') {
			console.log('Creating holding booking with conflict check:', bookingId)
			
			return from(
				runTransaction(this.firestore, async transaction => {
					// Query for ALL existing bookings (including holding) on the same court and date
					// to prevent any overlapping bookings
					const bookingsQuery = query(
						bookingsRef,
						where('courtId', '==', booking.courtId),
						where('date', '==', booking.date),
						where('status', 'in', ['confirmed', 'paid', 'holding'])
					)
					
					// Note: We need to use getDocs for queries, not transaction.get
		const conflictingBookingsSnapshot = await getDocs(bookingsQuery)
					
					// Check each existing booking for time overlap
					for (const docSnap of conflictingBookingsSnapshot.docs) {
						const existingBooking = docSnap.data() as Booking
						
						// Parse times for comparison
						const newStart = new Date(booking.startTime).getTime()
						const newEnd = new Date(booking.endTime).getTime()
						const existingStart = new Date(existingBooking.startTime).getTime()
						const existingEnd = new Date(existingBooking.endTime).getTime()
						
						// Check for any overlap (start1 < end2 AND end1 > start2)
						if (newStart < existingEnd && newEnd > existingStart) {
							throw new Error('This time slot is already booked. Please select another time.')
						}
					}
					
					// No conflicts found, create the holding booking
					const bookingData = this.prepareBookingData(booking, bookingId)
					const newBookingRef = doc(bookingsRef, bookingId)
					transaction.set(newBookingRef, bookingData)
					
					console.log(`Created holding booking ${bookingId} after checking for conflicts`)
					return { ...bookingData, id: bookingId }
				})
			).pipe(
				map(result => result as Booking),
				catchError(error => {
					console.error('Error creating holding booking:', error)
					if (error.message.includes('already booked')) {
						return throwError(() => new Error(error.message))
					}
					return throwError(() => new Error(`Failed to create holding booking: ${error.message}`))
				})
			)
		}
		
		// For confirmed/paid bookings, check for conflicts and create
		// Use the same logic as holding bookings to ensure consistency
		return from(
			runTransaction(this.firestore, async transaction => {
				// Query for existing bookings to check availability
				const bookingsQuery = query(
					bookingsRef,
					where('courtId', '==', booking.courtId),
					where('date', '==', booking.date),
					where('status', 'in', ['confirmed', 'paid', 'holding'])
				)
				
				const existingBookings = await getDocs(bookingsQuery)
				
				// Check for time conflicts
				for (const docSnap of existingBookings.docs) {
					const existing = docSnap.data() as Booking
					
					const newStart = new Date(booking.startTime).getTime()
					const newEnd = new Date(booking.endTime).getTime()
					const existingStart = new Date(existing.startTime).getTime()
					const existingEnd = new Date(existing.endTime).getTime()
					
					// Check for overlap
					if (newStart < existingEnd && newEnd > existingStart) {
						throw new Error('This time slot is already booked. Please select another time.')
					}
				}
				
				// No conflicts, create the booking
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
	 * Prepare booking data with required fields
	 */
	private prepareBookingData(booking: Booking, bookingId: string) {
		const isGuestBooking = booking.userId && booking.userId.startsWith('guest-')

		const now = new Date().toISOString()
		
		return {
			...booking,
			id: bookingId,
			status: booking.status || 'confirmed',
			paymentStatus: booking.paymentStatus || 'pending',
			createdAt: booking.createdAt || now,
			updatedAt: now,
			lastActive: now, // Initialize lastActive with current timestamp
			customerEmail: booking.customerEmail || booking.userEmail || null,
			customerPhone: booking.customerPhone || booking.userPhone || null,
			userName: booking.userName || '',
			userId: booking.userId || '',
			venueId: booking.venueId || '',
			courtId: booking.courtId || '',
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
	 * Update a booking's payment status and reserve slots if transitioning to paid
	 */
	updateBookingPaymentStatus(bookingId: string, paymentStatus: string): Observable<Booking> {
		const bookingRef = doc(this.firestore, 'bookings', bookingId)

		return from(getDoc(bookingRef)).pipe(
			switchMap(docSnap => {
				if (!docSnap.exists()) {
					return throwError(() => new Error('Booking not found'))
				}

				// const booking = docSnap.data() as Booking - not used anymore
				
				// Simply update the booking status
				// No need for separate slot reservation since availability is checked via bookings
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
	 * Update lastActive timestamp for a booking
	 * This is used to track user activity on holding bookings
	 */
	updateLastActive(bookingId: string): Observable<void> {
		const bookingRef = doc(this.firestore, 'bookings', bookingId)
		
		return from(updateDoc(bookingRef, {
			lastActive: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		})).pipe(
			map(() => undefined),
			catchError(error => {
				console.error('Error updating lastActive:', error)
				// Don't throw error for lastActive updates - it's not critical
				return of(undefined)
			})
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
