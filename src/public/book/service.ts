import {
	combineLatest,
	firstValueFrom,
	forkJoin,
	map,
	Observable,
	of,
	throwError,
	catchError,
	switchMap,
	from,
} from 'rxjs'
import dayjs from 'dayjs'
import { v4 as uuidv4 } from 'uuid'
import { FirestoreService } from 'src/firebase/firestore.service'

// Types
export interface Court {
	name: string
	type: string // e.g., "tennis", "basketball", "squash"
	hourlyRate: number
	facilities: string[] // e.g., ["lights", "changing room", "showers"]
	maintenanceHours: {
		day: string // e.g., "monday"
		startTime: string // e.g., "08:00"
		endTime: string // e.g., "10:00"
	}[]
	isActive: boolean
	createdAt?: string
	updatedAt?: string
}

export interface TimeSlot {
	isAvailable: boolean
	bookedBy: string | null // userId
	bookingId: string | null
}

export interface DayAvailability {
	slots: Record<string, TimeSlot>
}

export interface CourtAvailability {
	[date: string]: DayAvailability
}

export interface MonthlyAvailability {
	courts: {
		[courtId: string]: CourtAvailability
	}
	createdAt?: string
	updatedAt?: string
}

export interface Booking {
	userId: string
	userName: string
	courtId: string
	courtName: string
	date: string // Format: "YYYY-MM-DD"
	startTime: string // Format: "HH:00" (24-hour format)
	endTime: string // Format: "HH:00" (24-hour format)
	status: 'confirmed' | 'cancelled' | 'completed'
	totalPrice: number
	createdAt?: string
	updatedAt?: string
	paymentStatus: 'pending' | 'paid' | 'refunded' | 'cancelled'
}

export interface BookingReport {
	startDate: string
	endDate: string
	totalBookings: number
	totalRevenue: number
	bookingsPerCourt: Record<string, number>
	bookingsPerDay: Record<string, number>
}

export interface UserRole {
	userId: string
	role: 'admin' | 'user' | 'staff'
}

// Utility functions
export class DateUtils {
	/**
	 * Parse date string into year and month
	 */
	static parseYearMonth(date: string): { year: number; month: number } {
		const [year, month] = date.split('-')
		return {
			year: parseInt(year),
			month: parseInt(month),
		}
	}

	/**
	 * Validate time format (HH:00)
	 */
	static isValidTimeFormat(time: string): boolean {
		return /^([01]?[0-9]|2[0-3]):00$/.test(time)
	}

	/**
	 * Validate date format (YYYY-MM-DD)
	 */
	static isValidDateFormat(date: string): boolean {
		return /^\d{4}-\d{2}-\d{2}$/.test(date)
	}

	/**
	 * Check if endTime is after startTime
	 */
	static isEndTimeAfterStartTime(startTime: string, endTime: string): boolean {
		const startHour = parseInt(startTime.split(':')[0])
		const endHour = parseInt(endTime.split(':')[0])
		return endHour > startHour
	}

	/**
	 * Get current timestamp
	 */
	static getCurrentTimestamp(): string {
		return new Date().toISOString()
	}
}

// Authorization service
export class AuthorizationService {
	private rolesService: FirestoreService<UserRole>

	constructor() {
		this.rolesService = new FirestoreService<UserRole>('user_roles')
	}

	/**
	 * Check if user is admin
	 */
	public isAdmin(userId: string): Observable<boolean> {
		return this.rolesService.get(userId).pipe(
			map(role => role?.role === 'admin'),
			catchError(err => {
				console.error('Error checking admin status', err)
				return of(false)
			}),
		)
	}

	/**
	 * Check if user owns a resource
	 */
	public isResourceOwner(userId: string, resourceOwnerId: string): boolean {
		return userId === resourceOwnerId
	}

	/**
	 * Verify user can access booking
	 */
	public canAccessBooking(userId: string, booking: Booking, isAdmin: boolean): boolean {
		return isAdmin || this.isResourceOwner(userId, booking.userId)
	}
}

// Services
export class CourtService {
	private service: FirestoreService<Court>
	private authService: AuthorizationService

	constructor(authService?: AuthorizationService) {
		this.service = new FirestoreService<Court>('courts')
		this.authService = authService || new AuthorizationService()
	}

	/**
	 * Add a new court
	 */
	public addCourt(userId: string, courtData: Omit<Court, 'isActive'>): Observable<Court> {
		return this.authService.isAdmin(userId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin) {
					return throwError(() => new Error('Unauthorized: Only admins can add courts'))
				}

				// Validate court data
				if (!this.validateCourtData(courtData)) {
					return throwError(() => new Error('Invalid court data'))
				}

				const timestamp = DateUtils.getCurrentTimestamp()
				const court: Court = {
					...courtData,
					isActive: true,
					createdAt: timestamp,
					updatedAt: timestamp,
				}

				const courtId = uuidv4()
				return this.service.upsert(court, courtId)
			}),
			catchError(err => {
				console.error('Error adding court', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Validate court data
	 */
	private validateCourtData(courtData: Omit<Court, 'isActive'>): boolean {
		// Check required fields
		if (!courtData.name || !courtData.type) {
			return false
		}

		// Validate hourlyRate is positive
		if (courtData.hourlyRate <= 0) {
			return false
		}

		// Validate maintenance hours
		if (courtData.maintenanceHours) {
			for (const maintenance of courtData.maintenanceHours) {
				if (!maintenance.day || !maintenance.startTime || !maintenance.endTime) {
					return false
				}

				if (!DateUtils.isValidTimeFormat(maintenance.startTime) || !DateUtils.isValidTimeFormat(maintenance.endTime)) {
					return false
				}

				if (!DateUtils.isEndTimeAfterStartTime(maintenance.startTime, maintenance.endTime)) {
					return false
				}
			}
		}

		return true
	}

	/**
	 * Get all courts
	 */
	public getAllCourts(): Observable<Map<string, Court>> {
		return this.service.subscribeToCollection().pipe(
			catchError(err => {
				console.error('Error getting all courts', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Get active courts
	 */
	public getActiveCourts(): Observable<Map<string, Court>> {
		const query: firebaseServiceQuery[] = [
			{
				key: 'isActive',
				value: true,
				operator: '==',
			},
		]

		return this.service.subscribeToCollection(query).pipe(
			catchError(err => {
				console.error('Error getting active courts', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Update court details
	 */
	public updateCourt(userId: string, courtId: string, courtData: Partial<Court>): Observable<Partial<Court>> {
		return this.authService.isAdmin(userId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin) {
					return throwError(() => new Error('Unauthorized: Only admins can update courts'))
				}

				// Add updated timestamp
				const updatedData = {
					...courtData,
					updatedAt: DateUtils.getCurrentTimestamp(),
				}

				return this.service.upsert(updatedData, courtId)
			}),
			catchError(err => {
				console.error('Error updating court', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Get a specific court
	 */
	public getCourt(courtId: string): Observable<Court | undefined> {
		return this.service.get(courtId).pipe(
			catchError(err => {
				console.error('Error getting court', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Deactivate a court
	 */
	public deactivateCourt(userId: string, courtId: string): Observable<Partial<Court>> {
		return this.authService.isAdmin(userId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin) {
					return throwError(() => new Error('Unauthorized: Only admins can deactivate courts'))
				}

				return this.service.upsert(
					{
						isActive: false,
						updatedAt: DateUtils.getCurrentTimestamp(),
					},
					courtId,
				)
			}),
			catchError(err => {
				console.error('Error deactivating court', err)
				return throwError(() => err)
			}),
		)
	}
}

export class AvailabilityService {
	private service: FirestoreService<MonthlyAvailability>
	private authService: AuthorizationService

	constructor(authService?: AuthorizationService) {
		this.service = new FirestoreService<MonthlyAvailability>('availabilities')
		this.authService = authService || new AuthorizationService()
	}

	/**
	 * Generate time slots for a specific date range (used when initializing a new month)
	 */
	private generateTimeSlots(startHour = 6, endHour = 22): Record<string, TimeSlot> {
		const slots: Record<string, TimeSlot> = {}
		for (let hour = startHour; hour < endHour; hour++) {
			const timeSlot = `${hour.toString().padStart(2, '0')}:00`
			slots[timeSlot] = {
				isAvailable: true,
				bookedBy: null,
				bookingId: null,
			}
		}
		return slots
	}

	/**
	 * Initialize availability for a month
	 */
	public initializeMonthlyAvailability(
		userId: string,
		year: number,
		month: number,
		courtsMap: Map<string, Court>,
	): Observable<MonthlyAvailability> {
		return this.authService.isAdmin(userId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin) {
					return throwError(() => new Error('Unauthorized: Only admins can initialize availability'))
				}

				// Validate input
				if (year < 2020 || year > 2100 || month < 1 || month > 12) {
					return throwError(() => new Error('Invalid year or month'))
				}

				const daysInMonth = new Date(year, month, 0).getDate()
				const monthStr = month.toString().padStart(2, '0')
				const docId = `${year}-${monthStr}`
				const timestamp = DateUtils.getCurrentTimestamp()

				// Check if availability already exists for this month
				return this.service.get(docId).pipe(
					switchMap(existingAvailability => {
						if (existingAvailability) {
							return throwError(() => new Error('Availability already initialized for this month'))
						}

						const courtsAvailability: Record<string, CourtAvailability> = {}

						courtsMap.forEach((court, courtId) => {
							courtsAvailability[courtId] = {}

							// Initialize each day of the month
							for (let day = 1; day <= daysInMonth; day++) {
								const date = `${year}-${monthStr}-${day.toString().padStart(2, '0')}`
								const dayOfWeek = new Date(year, month - 1, day)
									.toLocaleDateString('en-US', { weekday: 'long' })
									.toLowerCase()

								// Generate all slots for the day
								const slots = this.generateTimeSlots()

								// Mark maintenance hours as unavailable
								if (court.maintenanceHours) {
									court.maintenanceHours.forEach(maintenance => {
										if (maintenance.day === dayOfWeek) {
											// Extract hours from maintenance time slots
											const startHour = parseInt(maintenance.startTime.split(':')[0])
											const endHour = parseInt(maintenance.endTime.split(':')[0])

											// Mark slots as unavailable during maintenance
											for (let hour = startHour; hour < endHour; hour++) {
												const timeSlot = `${hour.toString().padStart(2, '0')}:00`
												if (slots[timeSlot]) {
													slots[timeSlot].isAvailable = false
												}
											}
										}
									})
								}

								courtsAvailability[courtId][date] = { slots }
							}
						})

						const monthlyAvailability: MonthlyAvailability = {
							courts: courtsAvailability,
							createdAt: timestamp,
							updatedAt: timestamp,
						}

						return this.service.upsert(monthlyAvailability, docId) as Observable<MonthlyAvailability>
					}),
				)
			}),
			catchError(err => {
				console.error('Error initializing monthly availability', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Get availability for a specific month
	 */
	public getMonthAvailability(year: number, month: number): Observable<MonthlyAvailability | undefined> {
		// Validate input
		if (year < 2020 || year > 2100 || month < 1 || month > 12) {
			return throwError(() => new Error('Invalid year or month'))
		}

		const monthStr = month.toString().padStart(2, '0')
		const docId = `${year}-${monthStr}`

		return this.service.get(docId).pipe(
			catchError(err => {
				console.error('Error getting month availability', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Validate slot access and existence
	 */
	private validateSlotAccess(
		availability: MonthlyAvailability,
		courtId: string,
		date: string,
		timeSlot?: string,
	): { isValid: boolean; error?: string } {
		if (!availability) {
			return { isValid: false, error: 'Availability document not found!' }
		}

		if (!availability.courts[courtId]) {
			return { isValid: false, error: `Court ${courtId} not found in availability!` }
		}

		if (!availability.courts[courtId][date]) {
			return { isValid: false, error: `Date ${date} not found for court ${courtId}!` }
		}

		if (timeSlot && !availability.courts[courtId][date].slots[timeSlot]) {
			return { isValid: false, error: `Time slot ${timeSlot} not found!` }
		}

		return { isValid: true }
	}

	/**
	 * Get availability for a specific court on a specific date
	 */
	public getCourtAvailability(courtId: string, date: string): Observable<Record<string, TimeSlot> | undefined> {
		// Validate date format
		if (!DateUtils.isValidDateFormat(date)) {
			return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'))
		}

		const { year, month } = DateUtils.parseYearMonth(date)
		const docId = `${year}-${month}`

		return this.service.get(docId).pipe(
			map(availability => {
				const validation = this.validateSlotAccess(availability, courtId, date)
				if (!validation.isValid) {
					return undefined
				}

				return availability.courts[courtId][date].slots
			}),
			catchError(err => {
				console.error('Error getting court availability', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Get availability for all courts on a specific date
	 */
	public getAllCourtsAvailability(date: string): Observable<Record<string, Record<string, TimeSlot>> | undefined> {
		// Validate date format
		if (!DateUtils.isValidDateFormat(date)) {
			return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'))
		}

		const { year, month } = DateUtils.parseYearMonth(date)
		const docId = `${year}-${month}`

		return this.service.get(docId).pipe(
			map(availability => {
				if (!availability || !availability.courts) return undefined

				const courtsAvailability: Record<string, Record<string, TimeSlot>> = {}
				const courts = availability.courts

				for (const courtId in courts) {
					if (courts[courtId][date]) {
						courtsAvailability[courtId] = courts[courtId][date].slots
					}
				}

				return courtsAvailability
			}),
			catchError(err => {
				console.error('Error getting all courts availability', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Update availability for a specific slot
	 */
	public updateSlotAvailability(
		userId: string,
		courtId: string,
		date: string,
		timeSlot: string,
		isAvailable: boolean,
	): Observable<MonthlyAvailability> {
		return this.authService.isAdmin(userId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin) {
					return throwError(() => new Error('Unauthorized: Only admins can update slot availability'))
				}

				// Validate inputs
				if (!DateUtils.isValidDateFormat(date)) {
					return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'))
				}

				if (!DateUtils.isValidTimeFormat(timeSlot)) {
					return throwError(() => new Error('Invalid time format. Use HH:00'))
				}

				const { year, month } = DateUtils.parseYearMonth(date)
				const docId = `${year}-${month}`

				return this.service.get(docId).pipe(
					switchMap(availability => {
						if (!availability) {
							return throwError(() => new Error('Availability document not found!'))
						}
						const validation = this.validateSlotAccess(availability, courtId, date, timeSlot)
						if (!validation.isValid) {
							return throwError(() => new Error(validation.error))
						}

						const slot = availability.courts[courtId][date].slots[timeSlot]

						// Only allow updates if the slot isn't booked
						if (slot.bookedBy !== null) {
							return throwError(() => new Error('Cannot update an already booked slot!'))
						}

						// Update using immutable pattern
						const updatedAvailability = {
							...availability,
							updatedAt: DateUtils.getCurrentTimestamp(),
							courts: {
								...availability.courts,
								[courtId]: {
									...availability.courts[courtId],
									[date]: {
										...availability.courts[courtId][date],
										slots: {
											...availability.courts[courtId][date].slots,
											[timeSlot]: {
												...slot,
												isAvailable,
											},
										},
									},
								},
							},
						}

						return this.service.upsert(updatedAvailability, docId) as Observable<MonthlyAvailability>
					}),
				)
			}),
			catchError(err => {
				console.error('Error updating slot availability', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Check if all slots in a time range are available
	 */
	private areAllSlotsAvailable(
		availability: MonthlyAvailability,
		courtId: string,
		date: string,
		startTime: string,
		endTime: string,
	): { available: boolean; conflicts: string[] } {
		const conflicts: string[] = []
		const startHour = parseInt(startTime.split(':')[0])
		const endHour = parseInt(endTime.split(':')[0])

		for (let hour = startHour; hour < endHour; hour++) {
			const timeSlot = `${hour.toString().padStart(2, '0')}:00`

			// Check slot exists
			if (!availability.courts[courtId][date].slots[timeSlot]) {
				conflicts.push(`Slot ${timeSlot} not found`)
				continue
			}

			const slot = availability.courts[courtId][date].slots[timeSlot]

			// Check slot is available
			if (!slot.isAvailable || slot.bookedBy !== null) {
				conflicts.push(`Slot ${timeSlot} is not available`)
			}
		}

		return { available: conflicts.length === 0, conflicts }
	}

	/**
	 * Mark slots as booked for a booking
	 */
	public markSlotsAsBooked(
		courtId: string,
		date: string,
		startTime: string,
		endTime: string,
		userId: string,
		bookingId: string,
	): Observable<MonthlyAvailability> {
		// Validate inputs
		if (!DateUtils.isValidDateFormat(date)) {
			return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'))
		}

		if (!DateUtils.isValidTimeFormat(startTime) || !DateUtils.isValidTimeFormat(endTime)) {
			return throwError(() => new Error('Invalid time format. Use HH:00'))
		}

		if (!DateUtils.isEndTimeAfterStartTime(startTime, endTime)) {
			return throwError(() => new Error('End time must be after start time'))
		}

		const { year, month } = DateUtils.parseYearMonth(date)
		const docId = `${year}-${month}`

		return this.service.get(docId).pipe(
			switchMap(availability => {
				if (!availability) {
					return throwError(() => new Error('Availability document not found!'))
				}
				const validation = this.validateSlotAccess(availability, courtId, date)
				if (!validation.isValid) {
					return throwError(() => new Error(validation.error))
				}

				// Check all slots are available
				const slotsCheck = this.areAllSlotsAvailable(availability, courtId, date, startTime, endTime)
				if (!slotsCheck.available) {
					return throwError(() => new Error(`Booking conflicts: ${slotsCheck.conflicts.join(', ')}`))
				}

				// Use immutable update pattern for the document
				const updatedAvailability = { ...availability, updatedAt: DateUtils.getCurrentTimestamp() }
				const updatedCourts = { ...updatedAvailability.courts }
				const updatedCourt = { ...updatedCourts[courtId] }
				const updatedDates = { ...updatedCourt[date] }
				const updatedSlots = { ...updatedDates.slots }

				// Update each slot in the booking range
				for (let hour = parseInt(startTime.split(':')[0]); hour < parseInt(endTime.split(':')[0]); hour++) {
					const timeSlot = `${hour.toString().padStart(2, '0')}:00`
					updatedSlots[timeSlot] = {
						isAvailable: false,
						bookedBy: userId,
						bookingId: bookingId,
					}
				}

				// Reconstruct the updated document
				updatedDates.slots = updatedSlots
				updatedCourt[date] = updatedDates
				updatedCourts[courtId] = updatedCourt
				updatedAvailability.courts = updatedCourts

				return this.service.upsert(updatedAvailability, docId) as Observable<MonthlyAvailability>
			}),
			catchError(err => {
				console.error('Error marking slots as booked', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Release slots for a cancelled booking
	 */
	public releaseSlots(
		courtId: string,
		date: string,
		startTime: string,
		endTime: string,
	): Observable<MonthlyAvailability> {
		// Validate inputs
		if (!DateUtils.isValidDateFormat(date)) {
			return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'))
		}

		if (!DateUtils.isValidTimeFormat(startTime) || !DateUtils.isValidTimeFormat(endTime)) {
			return throwError(() => new Error('Invalid time format. Use HH:00'))
		}

		if (!DateUtils.isEndTimeAfterStartTime(startTime, endTime)) {
			return throwError(() => new Error('End time must be after start time'))
		}

		const { year, month } = DateUtils.parseYearMonth(date)
		const docId = `${year}-${month}`

		return this.service.get(docId).pipe(
			switchMap(availability => {
				const validation = this.validateSlotAccess(availability, courtId, date)
				if (!validation.isValid) {
					return throwError(() => new Error(validation.error))
				}

				// Use immutable update pattern for the document
				const updatedAvailability = { ...availability, updatedAt: DateUtils.getCurrentTimestamp() }
				const updatedCourts = { ...updatedAvailability.courts }
				const updatedCourt = { ...updatedCourts[courtId] }
				const updatedDates = { ...updatedCourt[date] }
				const updatedSlots = { ...updatedDates.slots }

				// Release each slot in the booking range
				for (let hour = parseInt(startTime.split(':')[0]); hour < parseInt(endTime.split(':')[0]); hour++) {
					const timeSlot = `${hour.toString().padStart(2, '0')}:00`
					if (updatedSlots[timeSlot]) {
						updatedSlots[timeSlot] = {
							isAvailable: true,
							bookedBy: null,
							bookingId: null,
						}
					}
				}

				// Reconstruct the updated document
				updatedDates.slots = updatedSlots
				updatedCourt[date] = updatedDates
				updatedCourts[courtId] = updatedCourt
				updatedAvailability.courts = updatedCourts

				return this.service.upsert(updatedAvailability, docId) as Observable<MonthlyAvailability>
			}),
			catchError(err => {
				console.error('Error releasing slots', err)
				return throwError(() => err)
			}),
		)
	}
}

export class BookingService {
	private service: FirestoreService<Booking>
	private availabilityService: AvailabilityService
	private courtService: CourtService
	private authService: AuthorizationService

	constructor(
		availabilityService?: AvailabilityService,
		courtService?: CourtService,
		authService?: AuthorizationService,
	) {
		this.service = new FirestoreService<Booking>('bookings')
		this.availabilityService = availabilityService || new AvailabilityService()
		this.courtService = courtService || new CourtService()
		this.authService = authService || new AuthorizationService()
	}

	/**
	 * Create a new booking
	 */
	public createBooking(
		userId: string,
		userName: string,
		courtId: string,
		date: string,
		startTime: string,
		endTime: string,
		price: number,
	): Observable<Booking> {
		// Validate inputs
		if (!DateUtils.isValidDateFormat(date)) {
			return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'))
		}

		if (!DateUtils.isValidTimeFormat(startTime) || !DateUtils.isValidTimeFormat(endTime)) {
			return throwError(() => new Error('Invalid time format. Use HH:00'))
		}

		if (!DateUtils.isEndTimeAfterStartTime(startTime, endTime)) {
			return throwError(() => new Error('End time must be after start time'))
		}

		if (price < 0) {
			return throwError(() => new Error('Price cannot be negative'))
		}

		// Generate a new booking ID
		const bookingId = uuidv4()
		const timestamp = DateUtils.getCurrentTimestamp()

		// Use Firebase transaction to ensure atomicity
		return from(
			this.service.runTransaction(transaction => {
				// First, get the court to retrieve its name
				return this.courtService.getCourt(courtId).pipe(
					switchMap(court => {
						if (!court) {
							return throwError(() => new Error('Court not found!'))
						}

						// Create the booking data
						const booking: Booking = {
							userId,
							userName,
							courtId,
							courtName: court.name,
							date,
							startTime,
							endTime,
							status: 'confirmed',
							totalPrice: price,
							paymentStatus: 'pending',
							createdAt: timestamp,
							updatedAt: timestamp,
						}

						// Mark the slots as booked
						return this.availabilityService
							.markSlotsAsBooked(courtId, date, startTime, endTime, userId, bookingId)
							.pipe(
								switchMap(() => {
									// Save the booking
									return this.service.upsert(booking, bookingId)
								}),
							)
					}),
				)
			}),
		).pipe(
			catchError(err => {
				console.error('Error creating booking', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Cancel a booking
	 */
	public cancelBooking(userId: string, bookingId: string): Observable<Booking> {
		return this.service.get(bookingId).pipe(
			switchMap(booking => {
				if (!booking) {
					return throwError(() => new Error('Booking not found!'))
				}

				// Check authorization
				return this.authService.isAdmin(userId).pipe(
					switchMap(isAdmin => {
						if (!isAdmin && booking.userId !== userId) {
							return throwError(() => new Error('Unauthorized: You can only cancel your own bookings'))
						}

						// Use Firebase transaction for atomicity
						return from(
							this.service.runTransaction(transaction => {
								// Release the slots
								return this.availabilityService
									.releaseSlots(booking.courtId, booking.date, booking.startTime, booking.endTime)
									.pipe(
										switchMap(() => {
											// Update the booking status
											const updatedBooking: Partial<Booking> = {
												status: 'cancelled',
												paymentStatus: booking.paymentStatus === 'paid' ? 'refunded' : 'cancelled',
												updatedAt: DateUtils.getCurrentTimestamp(),
											}

											return this.service
												.upsert(updatedBooking, bookingId)
												.pipe(map(updated => ({ ...booking, ...updated })))
										}),
									)
							}),
						)
					}),
				)
			}),
			catchError(err => {
				console.error('Error cancelling booking', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Get bookings for a specific user with pagination
	 */
	public getUserBookings(
		userId: string,
		requestingUserId: string,
		page: number = 1,
		pageSize: number = 10,
	): Observable<{ bookings: Map<string, Booking>; total: number; page: number; pageSize: number }> {
		return this.authService.isAdmin(requestingUserId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin && userId !== requestingUserId) {
					return throwError(() => new Error('Unauthorized: You can only view your own bookings'))
				}

				const query: firebaseServiceQuery[] = [
					{
						key: 'userId',
						value: userId,
						operator: '==',
					},
				]

				return this.service.subscribeToCollectionWithPagination(query, page, pageSize)
			}),
			catchError(err => {
				console.error('Error getting user bookings', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Get bookings for a specific court in a date range with pagination
	 */
	public getCourtBookings(
		courtId: string,
		startDate: string,
		endDate: string,
		userId: string,
		page: number = 1,
		pageSize: number = 10,
	): Observable<{ bookings: Map<string, Booking>; total: number; page: number; pageSize: number }> {
		return this.authService.isAdmin(userId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin) {
					return throwError(() => new Error('Unauthorized: Only admins can view court bookings'))
				}

				// Validate dates
				if (!DateUtils.isValidDateFormat(startDate) || !DateUtils.isValidDateFormat(endDate)) {
					return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'))
				}

				const query: firebaseServiceQuery[] = [
					{
						key: 'courtId',
						value: courtId,
						operator: '==',
					},
					{
						key: 'date',
						value: startDate,
						operator: '>=',
					},
					{
						key: 'date',
						value: endDate,
						operator: '<=',
					},
				]

				return this.service.subscribeToCollectionWithPagination(query, page, pageSize)
			}),
			catchError(err => {
				console.error('Error getting court bookings', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Get bookings for a specific date with pagination
	 */
	public getDateBookings(
		date: string,
		userId: string,
		page: number = 1,
		pageSize: number = 10,
	): Observable<{ bookings: Map<string, Booking>; total: number; page: number; pageSize: number }> {
		return this.authService.isAdmin(userId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin) {
					return throwError(() => new Error('Unauthorized: Only admins can view date bookings'))
				}

				// Validate date
				if (!DateUtils.isValidDateFormat(date)) {
					return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'))
				}

				const query: firebaseServiceQuery[] = [
					{
						key: 'date',
						value: date,
						operator: '==',
					},
				]

				return this.service.subscribeToCollectionWithPagination(query, page, pageSize)
			}),
			catchError(err => {
				console.error('Error getting date bookings', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Get booking by ID
	 */
	public getBooking(bookingId: string, userId: string): Observable<Booking | undefined> {
		return this.service.get(bookingId).pipe(
			switchMap(booking => {
				if (!booking) {
					return of(undefined)
				}

				// Check authorization
				return this.authService.isAdmin(userId).pipe(
					switchMap(isAdmin => {
						if (!isAdmin && booking.userId !== userId) {
							return throwError(() => new Error('Unauthorized: You can only view your own bookings'))
						}

						return of(booking)
					}),
				)
			}),
			catchError(err => {
				console.error('Error getting booking', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Get all bookings in a date range (admin function) with pagination
	 */
	public getAllBookings(
		startDate: string,
		endDate: string,
		userId: string,
		page: number = 1,
		pageSize: number = 10,
	): Observable<{ bookings: Map<string, Booking>; total: number; page: number; pageSize: number }> {
		return this.authService.isAdmin(userId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin) {
					return throwError(() => new Error('Unauthorized: Only admins can view all bookings'))
				}

				// Validate dates
				if (!DateUtils.isValidDateFormat(startDate) || !DateUtils.isValidDateFormat(endDate)) {
					return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'))
				}

				const query: firebaseServiceQuery[] = [
					{
						key: 'date',
						value: startDate,
						operator: '>=',
					},
					{
						key: 'date',
						value: endDate,
						operator: '<=',
					},
				]

				return this.service.subscribeToCollectionWithPagination(query, page, pageSize)
			}),
			catchError(err => {
				console.error('Error getting all bookings', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Mark a booking as completed
	 */
	public completeBooking(bookingId: string, userId: string): Observable<Booking> {
		return this.service.get(bookingId).pipe(
			switchMap(booking => {
				if (!booking) {
					return throwError(() => new Error('Booking not found!'))
				}

				// Check authorization
				return this.authService.isAdmin(userId).pipe(
					switchMap(isAdmin => {
						if (!isAdmin) {
							return throwError(() => new Error('Unauthorized: Only admins can mark bookings as completed'))
						}

						const updatedBooking: Partial<Booking> = {
							status: 'completed',
							updatedAt: DateUtils.getCurrentTimestamp(),
						}

						return this.service.upsert(updatedBooking, bookingId).pipe(map(updated => ({ ...booking, ...updated })))
					}),
				)
			}),
			catchError(err => {
				console.error('Error completing booking', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Update payment status
	 */
	public updatePaymentStatus(
		bookingId: string,
		userId: string,
		paymentStatus: 'pending' | 'paid' | 'refunded' | 'cancelled',
	): Observable<Booking> {
		return this.service.get(bookingId).pipe(
			switchMap(booking => {
				if (!booking) {
					return throwError(() => new Error('Booking not found!'))
				}

				// Check authorization
				return this.authService.isAdmin(userId).pipe(
					switchMap(isAdmin => {
						if (!isAdmin) {
							return throwError(() => new Error('Unauthorized: Only admins can update payment status'))
						}

						const updatedBooking: Partial<Booking> = {
							paymentStatus,
							updatedAt: DateUtils.getCurrentTimestamp(),
						}

						return this.service.upsert(updatedBooking, bookingId).pipe(map(updated => ({ ...booking, ...updated })))
					}),
				)
			}),
			catchError(err => {
				console.error('Error updating payment status', err)
				return throwError(() => err)
			}),
		)
	}
}

// Admin service for managing the system
export class AdminService {
	private courtService: CourtService
	private availabilityService: AvailabilityService
	private bookingService: BookingService
	private authService: AuthorizationService

	constructor(
		courtService?: CourtService,
		availabilityService?: AvailabilityService,
		bookingService?: BookingService,
		authService?: AuthorizationService,
	) {
		this.authService = authService || new AuthorizationService()
		this.courtService = courtService || new CourtService(this.authService)
		this.availabilityService = availabilityService || new AvailabilityService(this.authService)
		this.bookingService =
			bookingService || new BookingService(this.availabilityService, this.courtService, this.authService)
	}

	/**
	 * Initialize a new month's availability
	 */
	public initializeMonth(userId: string, year: number, month: number): Observable<MonthlyAvailability> {
		return this.authService.isAdmin(userId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin) {
					return throwError(() => new Error('Unauthorized: Only admins can initialize months'))
				}

				return this.courtService.getAllCourts().pipe(
					switchMap(courts => {
						return this.availabilityService.initializeMonthlyAvailability(userId, year, month, courts)
					}),
				)
			}),
			catchError(err => {
				console.error('Error initializing month', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Block a time slot for maintenance or other reasons
	 */
	public blockTimeSlot(
		userId: string,
		courtId: string,
		date: string,
		startTime: string,
		endTime: string,
	): Observable<MonthlyAvailability> {
		return this.authService.isAdmin(userId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin) {
					return throwError(() => new Error('Unauthorized: Only admins can block time slots'))
				}

				// Validate inputs
				if (!DateUtils.isValidDateFormat(date)) {
					return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'))
				}

				if (!DateUtils.isValidTimeFormat(startTime) || !DateUtils.isValidTimeFormat(endTime)) {
					return throwError(() => new Error('Invalid time format. Use HH:00'))
				}

				if (!DateUtils.isEndTimeAfterStartTime(startTime, endTime)) {
					return throwError(() => new Error('End time must be after start time'))
				}

				const { year, month } = DateUtils.parseYearMonth(date)

				return this.availabilityService.getMonthAvailability(year, month).pipe(
					switchMap(availability => {
						if (!availability) {
							return throwError(() => new Error('Availability document not found!'))
						}

						// Create a deep copy to update using immutable pattern
						const updatedAvailability = { ...availability, updatedAt: DateUtils.getCurrentTimestamp() }
						const updatedCourts = { ...updatedAvailability.courts }

						if (!updatedCourts[courtId] || !updatedCourts[courtId][date]) {
							return throwError(() => new Error('Court or date not found in availability!'))
						}

						const updatedCourt = { ...updatedCourts[courtId] }
						const updatedDates = { ...updatedCourt[date] }
						const updatedSlots = { ...updatedDates.slots }

						// Block each slot in the range
						let hasConflicts = false
						const conflicts: string[] = []

						for (let hour = parseInt(startTime.split(':')[0]); hour < parseInt(endTime.split(':')[0]); hour++) {
							const timeSlot = `${hour.toString().padStart(2, '0')}:00`

							if (!updatedSlots[timeSlot]) {
								conflicts.push(`Slot ${timeSlot} not found`)
								continue
							}

							const slot = updatedSlots[timeSlot]

							// Can only block if the slot is not booked
							if (slot.bookedBy !== null) {
								hasConflicts = true
								conflicts.push(`Slot ${timeSlot} is already booked`)
								continue
							}

							// Mark as unavailable
							updatedSlots[timeSlot] = { ...slot, isAvailable: false }
						}

						if (hasConflicts) {
							return throwError(() => new Error(`Cannot block slots: ${conflicts.join(', ')}`))
						}

						// Reconstruct the updated document
						updatedDates.slots = updatedSlots
						updatedCourt[date] = updatedDates
						updatedCourts[courtId] = updatedCourt
						updatedAvailability.courts = updatedCourts

						return this.availabilityService.service.upsert(updatedAvailability, `${year}-${month}`)
					}),
				)
			}),
			catchError(err => {
				console.error('Error blocking time slot', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Generate availability report for a specific date range
	 */
	public generateAvailabilityReport(userId: string, startDate: string, endDate: string): Observable<BookingReport> {
		return this.authService.isAdmin(userId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin) {
					return throwError(() => new Error('Unauthorized: Only admins can generate reports'))
				}

				// Validate dates
				if (!DateUtils.isValidDateFormat(startDate) || !DateUtils.isValidDateFormat(endDate)) {
					return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'))
				}

				// Get all bookings in the date range
				return this.bookingService.getAllBookings(startDate, endDate, userId, 1, 1000).pipe(
					map(result => {
						const bookings = Array.from(result.bookings.values())

						// Calculate total revenue
						const totalRevenue = bookings.reduce((sum, booking) => {
							if (booking.status !== 'cancelled') {
								return sum + booking.totalPrice
							}
							return sum
						}, 0)

						// Count bookings per court
						const bookingsPerCourt: Record<string, number> = {}

						// Count bookings per day
						const bookingsPerDay: Record<string, number> = {}

						bookings.forEach(booking => {
							if (booking.status !== 'cancelled') {
								// Count by court
								bookingsPerCourt[booking.courtId] = (bookingsPerCourt[booking.courtId] || 0) + 1

								// Count by day
								bookingsPerDay[booking.date] = (bookingsPerDay[booking.date] || 0) + 1
							}
						})

						return {
							startDate,
							endDate,
							totalBookings: bookings.filter(b => b.status !== 'cancelled').length,
							totalRevenue,
							bookingsPerCourt,
							bookingsPerDay,
						}
					}),
				)
			}),
			catchError(err => {
				console.error('Error generating availability report', err)
				return throwError(() => err)
			}),
		)
	}

	/**
	 * Check and initialize upcoming months if needed
	 */
	public checkAndInitializeUpcomingMonths(userId: string, monthsAhead: number = 3): Observable<boolean> {
		return this.authService.isAdmin(userId).pipe(
			switchMap(isAdmin => {
				if (!isAdmin) {
					return throwError(() => new Error('Unauthorized: Only admins can initialize months'))
				}

				const currentDate = dayjs()
				const tasks: Observable<any>[] = []

				for (let i = 0; i < monthsAhead; i++) {
					const targetDate = currentDate.add(i, 'month')
					const year = targetDate.year()
					const month = targetDate.month() + 1

					// Check if this month is already initialized
					const task = this.availabilityService.getMonthAvailability(year, month).pipe(
						switchMap(availability => {
							// If not initialized, do it now
							if (!availability) {
								return this.initializeMonth(userId, year, month)
							}
							return of(null)
						}),
					)

					tasks.push(task)
				}

				return forkJoin(tasks).pipe(map(() => true))
			}),
			catchError(err => {
				console.error('Error checking and initializing upcoming months', err)
				return throwError(() => err)
			}),
		)
	}
}

// Extending FirestoreService for pagination
declare module './firestore.service' {
	interface FirestoreService<T> {
		subscribeToCollectionWithPagination(
			query?: firebaseServiceQuery[],
			page?: number,
			pageSize?: number,
		): Observable<{ data: Map<string, T>; total: number; page: number; pageSize: number }>

		runTransaction<R>(updateFunction: (transaction: any) => Observable<R>): Promise<R>
	}
}

// Example usage with improved practices
async function exampleUsage() {
	try {
		// Create services with dependency injection
		const authService = new AuthorizationService()
		const courtService = new CourtService(authService)
		const availabilityService = new AvailabilityService(authService)
		const bookingService = new BookingService(availabilityService, courtService, authService)
		const adminService = new AdminService(courtService, availabilityService, bookingService, authService)

		// Admin user ID
		const adminUserId = 'admin123'

		// 1. Add a tennis court
		const tennisCourt = await firstValueFrom(
			courtService.addCourt(adminUserId, {
				name: 'Tennis Court 1',
				type: 'tennis',
				hourlyRate: 25,
				facilities: ['lights', 'changing room'],
				maintenanceHours: [
					{
						day: 'monday',
						startTime: '08:00',
						endTime: '10:00',
					},
				],
			}),
		)

		console.log('Tennis court added:', tennisCourt)

		// 2. Initialize availability for the next 3 months
		await firstValueFrom(adminService.checkAndInitializeUpcomingMonths(adminUserId, 3))
		console.log('Availability initialized for upcoming months')

		// 3. Create a booking
		const today = dayjs()
		const bookingDate = today.add(2, 'day').format('YYYY-MM-DD')

		const courts = await firstValueFrom(courtService.getAllCourts())
		const courtId = courts.entries().next().value[0] // Get first court ID

		const regularUserId = 'user123'
		const booking = await firstValueFrom(
			bookingService.createBooking(regularUserId, 'John Doe', courtId, bookingDate, '14:00', '16:00', 50),
		)

		console.log('Booking created:', booking)

		// 4. Get user's bookings with pagination
		const userBookings = await firstValueFrom(bookingService.getUserBookings(regularUserId, regularUserId, 1, 10))
		console.log('User bookings:', userBookings)

		// 5. Generate availability report (admin only)
		const startDate = today.format('YYYY-MM-DD')
		const endDate = today.add(30, 'day').format('YYYY-MM-DD')

		const report = await firstValueFrom(adminService.generateAvailabilityReport(adminUserId, startDate, endDate))
		console.log('Availability report:', report)
	} catch (error) {
		console.error('Error in example usage', error)
		console.error('Error:', error)
	}
}
