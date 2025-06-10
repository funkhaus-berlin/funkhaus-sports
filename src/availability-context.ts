// src/availability-context.ts

import { createContext } from '@mhmo91/schmancy'
import dayjs from 'dayjs'
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs'
import { catchError, distinctUntilChanged, filter, map, shareReplay, switchMap, takeUntil, tap } from 'rxjs/operators'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { pricingService } from 'src/bookingServices/dynamic-pricing-service'
import { BookingsDB } from 'src/db/bookings.collection'
import { Venue, OperatingHours } from 'src/types/booking/venue.types'
import { BookingFlowConfig, BookingFlowType, StepLabel } from 'src/types/booking'
import { getUserTimezone, isTimeSlotInPast } from 'src/utils/timezone'
import { bookingContext } from './public/book/context'
import { Duration, TimeSlot } from './public/book/types'
import type { Booking } from './types/booking/booking.types'


// Updated BOOKING_FLOWS constant with the new structure
export const BOOKING_FLOWS: Record<string, BookingFlowConfig> = {
	[BookingFlowType.DATE_COURT_TIME_DURATION]: [
		{ step: 1, label: 'Date', icon: 'event' },
		{ step: 2, label: 'Court', icon: 'sports_tennis' },
		{ step: 3, label: 'Time', icon: 'schedule' },
		{ step: 4, label: 'Duration', icon: 'timer' },
		{ step: 5, label: 'Payment', icon: 'payment' },
	],
	[BookingFlowType.DATE_TIME_DURATION_COURT]: [
		{ step: 1, label: 'Date', icon: 'event' },
		{ step: 2, label: 'Time', icon: 'schedule' },
		{ step: 3, label: 'Duration', icon: 'timer' },
		{ step: 4, label: 'Court', icon: 'sports_tennis' },
		{ step: 5, label: 'Payment', icon: 'payment' },
	],
	[BookingFlowType.DATE_TIME_COURT_DURATION]: [
		{ step: 1, label: 'Date', icon: 'event' },
		{ step: 2, label: 'Time', icon: 'schedule' },
		{ step: 3, label: 'Court', icon: 'sports_tennis' },
		{ step: 4, label: 'Duration', icon: 'timer' },
		{ step: 5, label: 'Payment', icon: 'payment' },
	],
}

// Updated AvailabilityData interface
export interface AvailabilityData {
	date: string // YYYY-MM-DD
	venueId: string
	timeSlots: TimeSlotAvailability[]
	activeCourtIds: string[]
	bookings: Booking[]
	loading: boolean
	error: string | null
	bookingFlowType: BookingFlowType // Changed from bookingFlow: BookingFlowConfig
	venueName: string
}

// Default state updated
const defaultAvailability: AvailabilityData = {
	date: '',
	venueId: '',
	timeSlots: [],
	activeCourtIds: [],
	bookings: [],
	loading: false,
	error: null,
	bookingFlowType: BookingFlowType.DATE_COURT_TIME_DURATION, // Default flow type
	venueName: '',
}

// Helper functions updated to work with the new structure
export function getNextStep(step: StepLabel): number {
	const steps = getBookingFlowSteps()
	const currentStepIndex = steps.findIndex(s => s.label === step)
	return currentStepIndex < steps.length - 1 ? steps[currentStepIndex + 1].step : -1
}

export function getBookingFlowSteps(): BookingFlowConfig {
	const flowType = availabilityContext.value.bookingFlowType
	if (!flowType) {
		console.warn('bookingFlowType is undefined in availabilityContext', availabilityContext.value)
		return BOOKING_FLOWS[BookingFlowType.DATE_COURT_TIME_DURATION]
	}
	const flow = BOOKING_FLOWS[flowType]
	if (!flow) {
		console.warn('No flow found for bookingFlowType:', flowType)
		return BOOKING_FLOWS[BookingFlowType.DATE_COURT_TIME_DURATION]
	}
	return flow
}

// Define interfaces for availability data
export interface TimeSlotAvailability {
	time: string // Format: "HH:MM"
	timeValue: number // Minutes from midnight (e.g., 8:30 AM = 510)
	courtAvailability: Record<string, boolean> // Court ID -> available (true/false)
	hasAvailableCourts: boolean // Convenience property
}

export interface CourtAvailabilityStatus {
	courtId: string
	courtName: string
	available: boolean
	availableTimeSlots: string[]
	unavailableTimeSlots: string[]
	fullyAvailable: boolean
}

export interface DurationAvailability {
	value: number
	label: string
	price: number
	availableCourts: string[]
}

// Create the context
export const availabilityContext = createContext<AvailabilityData>(defaultAvailability, 'session', 'availability')

// Loading and error subjects
const loadingSubject = new BehaviorSubject<boolean>(false)
const errorSubject = new BehaviorSubject<string | null>(null)

// Public observables
export const availabilityLoading$ = loadingSubject.asObservable()
export const errorLoading$ = errorSubject.asObservable()

/**
 * Determine the booking flow type based on venue settings
 * @param venue The venue object
 * @returns The appropriate booking flow type
 */
export function getBookingFlowForVenue(venue: Venue | null): BookingFlowType {
	if (!venue) return BookingFlowType.DATE_TIME_DURATION_COURT // Default

	// Check venue settings for booking flow configuration
	// You can add logic here to check venue.settings.bookingFlow or other properties

	// For now, we'll default to the new required flow
	if (venue.settings?.bookingFlow) {
		return venue.settings.bookingFlow as BookingFlowType
	}

	// Default to the new requirement: Date -> Court -> Time -> Duration
	return BookingFlowType.DATE_COURT_TIME_DURATION
}

/**
 * Get venue operating hours for a specific day
 */
function getVenueHoursForDay(venue: Venue | null | undefined, date: string): { openHour: number; closeHour: number } {
	const dayOfWeek = dayjs(date).format('dddd').toLowerCase() as keyof OperatingHours
	const operatingHours = venue?.operatingHours?.[dayOfWeek]
	
	// Parse opening and closing times with defaults
	const openHour = operatingHours?.open 
		? parseInt(operatingHours.open.split(':')[0]) || 8
		: 8
		
	const closeHour = operatingHours?.close
		? parseInt(operatingHours.close.split(':')[0]) || 22
		: 22
	
	return { openHour, closeHour }
}

/**
 * Generate timeslots for a given day
 */
function generateTimeSlots(date: string, courtIds: string[], venue?: Venue | null): TimeSlotAvailability[] {
	const slots: TimeSlotAvailability[] = []

	// Check if date is today in user's timezone
	const userTimezone = getUserTimezone()
	const selectedDate = dayjs(date).tz(userTimezone)
	const now = dayjs().tz(userTimezone)
	const isToday = selectedDate.format('YYYY-MM-DD') === now.format('YYYY-MM-DD')

	// Get venue operating hours
	const { openHour, closeHour } = getVenueHoursForDay(venue, date)

	// Start time (either opening hour or current hour if today)
	let startHour = openHour
	if (isToday) {
		const currentHour = now.hour()
		startHour = currentHour < openHour ? openHour : currentHour
	}

	// End time from venue settings
	const endHour = closeHour

	// Initialize all courts as available for each time slot
	const courtAvailability: Record<string, boolean> = {}
	courtIds.forEach(courtId => {
		courtAvailability[courtId] = true
	})

	// Get minimum booking time from venue settings
	const minBookingMinutes = venue?.settings?.minBookingTime || 30
	
	// Generate slots from start to end time in 30 min increments
	// We need to generate slots up to the point where a minimum booking can still be completed
	for (let hour = startHour; hour <= endHour; hour++) {
		const fullHourMinutes = hour * 60
		const halfHourMinutes = hour * 60 + 30
		
		// Only add slots if a minimum booking duration can be completed before closing
		const closingMinutes = closeHour * 60
		
		// Full hour slot
		if (fullHourMinutes + minBookingMinutes <= closingMinutes) {
			slots.push({
				time: `${hour.toString().padStart(2, '0')}:00`,
				timeValue: fullHourMinutes,
				courtAvailability: { ...courtAvailability },
				hasAvailableCourts: courtIds.length > 0,
			})
		}

		// Half hour slot
		if (halfHourMinutes + minBookingMinutes <= closingMinutes && hour < endHour) {
			slots.push({
				time: `${hour.toString().padStart(2, '0')}:30`,
				timeValue: halfHourMinutes,
				courtAvailability: { ...courtAvailability },
				hasAvailableCourts: courtIds.length > 0,
			})
		}
	}

	return slots
}

/**
 * Process bookings to mark unavailable time slots
 */
function processBookingsForTimeSlots(timeSlots: TimeSlotAvailability[], bookings: Booking[]): TimeSlotAvailability[] {
	// Clone time slots to avoid mutations
	const processedSlots = JSON.parse(JSON.stringify(timeSlots)) as TimeSlotAvailability[]

	// Process each booking
	bookings.forEach(booking => {
		if (!booking.courtId || !booking.startTime || !booking.endTime) return

		// Extract booking time range
		const start = dayjs(booking.startTime)
		const end = dayjs(booking.endTime)

		// Convert to minutes from midnight for easier comparison
		const startMinutes = start.hour() * 60 + start.minute()
		const endMinutes = end.hour() * 60 + end.minute()

		// Mark all affected time slots as unavailable for this court
		processedSlots.forEach(slot => {
			if (slot.timeValue >= startMinutes && slot.timeValue < endMinutes) {
				if (slot.courtAvailability[booking.courtId] !== undefined) {
					slot.courtAvailability[booking.courtId] = false
				}
			}
		})
	})

	// Update hasAvailableCourts flag
	processedSlots.forEach(slot => {
		slot.hasAvailableCourts = Object.values(slot.courtAvailability).some(isAvailable => isAvailable)
	})

	return processedSlots
}

/**
 * Initialize the availability context and set up subscriptions
 * @param destroySignal$ Observable that emits when the context should be destroyed
 */
export function initializeAvailabilityContext(destroySignal$: Observable<any>): void {
	// Subscribe to date, venue, and court changes from booking context
	const bookingChanges$ = bookingContext.$.pipe(
		map(booking => ({ date: booking.date, venueId: booking.venueId, courtId: booking.courtId })),
		filter(({ date, venueId }) => !!date && !!venueId),
		distinctUntilChanged((prev, curr) => 
			prev.date === curr.date && 
			prev.venueId === curr.venueId && 
			prev.courtId === curr.courtId
		),
		shareReplay(1),
	)

	// Main data stream with functional approach
	combineLatest([
		bookingChanges$,
		courtsContext.$.pipe(filter(courts => courts.size > 0)),
		venuesContext.$.pipe(filter(venues => venues.size > 0)),
	]).pipe(
		// Set loading state
		tap(() => {
			loadingSubject.next(true)
			errorSubject.next(null)
			availabilityContext.set({ ...availabilityContext.value, loading: true, error: null }, true)
		}),
		// Process availability data
		switchMap(([booking, allCourts, allVenues]) => {
			const { date, venueId } = booking
			const venue = allVenues.get(venueId) || null
			
			// Build availability data through functional transformations
			return of({ date, venueId, venue }).pipe(
				// Add booking flow type
				map(data => ({
					...data,
					bookingFlowType: getBookingFlowForVenue(data.venue),
					venueName: data.venue?.name || 'Unknown Venue'
				})),
				// Get active courts
				map(data => ({
					...data,
					activeCourts: Array.from(allCourts.values()).filter(
						court => court.status === 'active' && court.venueId === venueId
					)
				})),
				// Extract court IDs and check if courts exist
				map(data => ({
					...data,
					activeCourtIds: data.activeCourts.map(court => court.id)
				})),
				// Generate time slots or return empty data
				switchMap(data => {
					if (data.activeCourts.length === 0) {
						errorSubject.next('No active courts found for this venue')
						return of({
							date: data.date,
							venueId: data.venueId,
							timeSlots: [],
							activeCourtIds: [],
							bookings: [],
							bookingFlowType: data.bookingFlowType,
							venueName: data.venueName,
						})
					}
					
					// Generate time slots
					const timeSlots = generateTimeSlots(data.date, data.activeCourtIds, data.venue)
					
					// Fetch and process bookings
					return BookingsDB.subscribeToCollection([
						{ key: 'date', operator: '==', value: dayjs(date).format('YYYY-MM-DD') },
						{ key: 'status', operator: 'in', value: ['confirmed', 'holding'] },
						{ key: 'venueId', operator: '==', value: venueId },
					]).pipe(
						map(bookingsMap => Array.from(bookingsMap.values())),
						map(bookings => ({
							date: data.date,
							venueId: data.venueId,
							timeSlots: processBookingsForTimeSlots(timeSlots, bookings),
							activeCourtIds: data.activeCourtIds,
							bookings,
							bookingFlowType: data.bookingFlowType,
							venueName: data.venueName,
						}))
					)
				})
			)
		}),
		// Handle errors
		catchError(err => {
			console.error('Error loading availability data:', err)
			errorSubject.next('Failed to load availability data')
			loadingSubject.next(false)
			availabilityContext.set({
				...availabilityContext.value,
				loading: false,
				error: 'Failed to load availability data',
			}, true)
			return of(availabilityContext.value)
		}),
		// Clear loading state
		tap(() => {
			loadingSubject.next(false)
			availabilityContext.set({ ...availabilityContext.value, loading: false }, true)
		}),
		// Complete until destroy signal
		takeUntil(destroySignal$)
	).subscribe(availabilityData => {
		availabilityContext.set({
			...availabilityData,
			loading: false,
			error: null,
		})
	})
}

/**
 * Check if a court is available at a specific time
 */
export function isCourtAvailable(courtId: string, timeSlot: string): boolean {
	const availability = availabilityContext.value

	// Find the time slot
	const slot = availability.timeSlots.find(s => s.time === timeSlot)
	if (!slot) return false

	// Check if court is available at this time
	return slot.courtAvailability[courtId] === true
}

/**
 * Check if a court is available for an entire duration
 */
export function isCourtAvailableForDuration(courtId: string, startTime: string, durationMinutes: number): boolean {
	const availability = availabilityContext.value
	const booking = bookingContext.value

	// Parse start time
	const [hours, minutes] = startTime.split(':').map(Number)
	const startMinutes = hours * 60 + minutes
	const endMinutes = startMinutes + durationMinutes

	// Get venue and closing time
	const venue = venuesContext.value.get(booking.venueId)
	const { closeHour } = getVenueHoursForDay(venue, booking.date)
	const closingMinutes = closeHour * 60

	console.log(`Checking court ${courtId} availability for ${durationMinutes} min starting at ${startTime}:`, {
		startMinutes,
		endMinutes,
		closingMinutes,
		wouldExceedClosing: endMinutes > closingMinutes,
		venue: venue?.name,
		closingHour: closeHour
	})

	// Check if the booking would exceed closing time
	if (endMinutes > closingMinutes) {
		console.log('Duration would exceed closing time')
		return false
	}

	// Check all time slots in the range
	// We need to check slots from start time up to (but not including) end time
	let unavailableSlots = []
	let checkedSlots = []
	
	for (const slot of availability.timeSlots) {
		// Check slots that fall within our booking duration
		if (slot.timeValue >= startMinutes && slot.timeValue < endMinutes) {
			checkedSlots.push({
				time: slot.time,
				timeValue: slot.timeValue,
				available: slot.courtAvailability[courtId]
			})
			
			if (!slot.courtAvailability[courtId]) {
				unavailableSlots.push(slot.time)
			}
		}
	}

	// Also check the start time slot specifically
	const startSlot = availability.timeSlots.find(s => s.timeValue === startMinutes)
	
	// Debug: Check what courts are in the availability data
	const sampleSlot = availability.timeSlots[0]
	const availableCourtIds = sampleSlot ? Object.keys(sampleSlot.courtAvailability || {}) : []
	
	console.log('Start slot check:', {
		startTime,
		startMinutes,
		startSlotFound: !!startSlot,
		startSlotAvailable: startSlot?.courtAvailability[courtId],
		checkedSlots,
		unavailableSlots,
		courtIdToCheck: courtId,
		availableCourtIds,
		sampleCourtAvailability: sampleSlot?.courtAvailability
	})
	
	if (!startSlot || !startSlot.courtAvailability[courtId]) {
		console.log('Start slot not available or not found')
		return false
	}
	
	if (unavailableSlots.length > 0) {
		console.log('Found unavailable slots within duration:', unavailableSlots)
		return false
	}

	return true
}

/**
 * Get all time slots with availability information
 * Supports filtering by court ID for the Date -> Court -> Time -> Duration flow
 * Enhanced to handle both flow types consistently
 */
export function getAvailableTimeSlots(courtId?: string): TimeSlot[] {
	const availability = availabilityContext.value
	const booking = bookingContext.value

	// Use courtId parameter or fall back to selected court in booking
	const effectiveCourtId = courtId || booking.courtId


	// If we have a specific court ID and it's the DATE_COURT_TIME_DURATION flow
	// Or if a court is already selected in any flow
	if (effectiveCourtId) {
		console.log(`Getting time slots for specific court: ${effectiveCourtId}`)
		// Filter time slots that are available for this specific court
		const ts = availability.timeSlots.map(slot => ({
			label: slot.time,
			value: slot.timeValue,
			available: slot.courtAvailability[effectiveCourtId] === true,
			courtId: effectiveCourtId,
		}))
		return filterPastTimeSlots(ts, availability.date)
	}

	// Otherwise, return all time slots that have any available court
	console.log(`Getting time slots with any available court`)
	const ts = availability.timeSlots.map(slot => ({
		label: slot.time,
		value: slot.timeValue,
		available: slot.hasAvailableCourts,
	}))
	return filterPastTimeSlots(ts, availability.date)
}

/**
 * Get all available courts for a specific time
 * Used in Date -> Time -> Court flow
 */
export function getAvailableCourtsForTime(startTime: string): string[] {
	const availability = availabilityContext.value
	if (!startTime) return []

	// Format time to match time slots
	const timeString = dayjs(startTime).format('HH:mm')

	// Find the time slot for this time
	const slot = availability.timeSlots.find(s => s.time === timeString)
	if (!slot) return []

	// Return all court IDs that are available at this time
	return Object.entries(slot.courtAvailability)
		.filter(([_, isAvailable]) => isAvailable)
		.map(([courtId]) => courtId)
}

/**
 * Get all available durations for a specific start time and court
 * Supports both Date -> Time -> Duration -> Court and Date -> Court -> Time -> Duration flows
 * Enhanced to handle both flow types consistently and respect court selection
 */
export function getAvailableDurations(startTime: string, courtId?: string): Duration[] {
	const availability = availabilityContext.value
	const booking = bookingContext.value

	console.log('getAvailableDurations called with:', {
		startTime,
		courtId,
		bookingCourtId: booking.courtId,
		availabilityReady: !!availability,
		timeSlotsCount: availability?.timeSlots?.length || 0,
		bookingFlowType: availability?.bookingFlowType,
		bookingDate: booking.date,
		venueId: booking.venueId
	})

	// Return empty array if startTime is empty, undefined, or invalid
	if (!startTime || !dayjs(startTime).isValid()) {
		console.warn('Invalid or missing start time provided to getAvailableDurations:', startTime)
		return []
	}

	// Use courtId parameter or fall back to selected court in booking
	const effectiveCourtId = courtId || booking.courtId

	// Format time string - handle both ISO and HH:mm formats
	const startTimeDayjs = dayjs(startTime)
	const formattedTime = startTimeDayjs.format('HH:mm')
	
	console.log('Formatted start time:', {
		original: startTime,
		formatted: formattedTime,
		hour: startTimeDayjs.hour(),
		minute: startTimeDayjs.minute()
	})

	// Standard durations
	const standardDurations = [
		{ label: '30m', value: 30 },
		{ label: '1h', value: 60 },
		{ label: '1.5h', value: 90 },
		{ label: '2h', value: 120 },
		{ label: '2.5h', value: 150 },
		{ label: '3h', value: 180 },
		{ label: '3.5h', value: 210 },
		{ label: '4h', value: 240 },
		{ label: '4.5h', value: 270 },
		{ label: '5h', value: 300 },
	]

	// If we have a specific court ID from parameter or booking
	if (effectiveCourtId) {
		console.log(`Getting durations for specific court: ${effectiveCourtId}`)
		return standardDurations
			.map(duration => {
				// Check if this duration is available for the specific court
				const isAvailable = isCourtAvailableForDuration(effectiveCourtId, formattedTime, duration.value)
				
				console.log(`Duration ${duration.label} (${duration.value} min) available: ${isAvailable}`)

				if (!isAvailable) return null

				// Get the court for price calculation
				const court = courtsContext.value.get(effectiveCourtId)
				if (!court) return null

				// Calculate price for this court and duration
				let price = 0
				try {
					const startDateTime = dayjs(startTime)
					if (!startDateTime.isValid()) {
						console.warn('Invalid start time when calculating price:', startTime)
						return null
					}
					
					const endDateTime = startDateTime.add(duration.value, 'minute')
					if (!endDateTime.isValid()) {
						console.warn('Invalid end time when calculating price for duration:', duration.value)
						return null
					}

					price = pricingService.calculatePrice(
						court,
						startDateTime.toISOString(),
						endDateTime.toISOString(),
						bookingContext.value.userId,
					)
				} catch (error) {
					console.error('Error calculating price for court:', courtId, error)
					return null
				}

				return {
					...duration,
					price,
					courtId: effectiveCourtId, // Add the courtId for reference
				}
			})
			.filter((duration) => duration !== null)
	}

	// Logic for Date -> Time -> Duration -> Court flow
	// Filter durations based on availability across all courts
	return standardDurations
		.map(duration => {
			// Find courts available for this duration
			const availableCourts = availability.activeCourtIds.filter(id =>
				isCourtAvailableForDuration(id, formattedTime, duration.value),
			)

			if (availableCourts.length === 0) return null

			// Calculate average price
			let totalPrice = 0
			availableCourts.forEach(courtId => {
				const court = courtsContext.value.get(courtId)
				if (court) {
					// Calculate price for this court and duration
					let price = 0
					try {
						const startDateTime = dayjs(startTime)
						if (!startDateTime.isValid()) {
							console.warn('Invalid date when calculating price:', startTime)
							return // Skip this court
						}
						
						const endDateTime = startDateTime.add(duration.value, 'minute')
						if (!endDateTime.isValid()) {
							console.warn('Invalid end date when calculating price')
							return // Skip this court
						}

						price = pricingService.calculatePrice(
							court,
							startDateTime.toISOString(),
							endDateTime.toISOString(),
							bookingContext.value.userId,
						)
						
						totalPrice += price
					} catch (error) {
						console.error('Error calculating price:', error)
						return // Skip this court
					}
				}
			})

			const avgPrice =
				availableCourts.length > 0 ? Math.round((totalPrice / availableCourts.length + Number.EPSILON) * 100) / 100 : 0

			return {
				...duration,
				price: avgPrice,
			}
		})
		.filter((duration): duration is Duration => duration !== null)
}

/**
 * Get availability status for all courts at a specific time and duration
 * Enhanced to handle missing duration by checking single time slot availability
 */
export function getAllCourtsAvailability(startTime?: string, durationMinutes?: number): CourtAvailabilityStatus[] {
	// Get availability data from context
	const availability = availabilityContext.value
	const booking = bookingContext.value

	// Use parameters or fall back to booking context
	const effectiveStartTime = startTime || booking.startTime

	// If missing start time, return empty array
	if (!effectiveStartTime) {
		return []
	}

	// Convert start time to minutes since midnight for easier comparison
	const timeObj = dayjs(effectiveStartTime)
	const startMinutes = timeObj.hour() * 60 + timeObj.minute()

	// If duration is provided, use it; otherwise check only the start time slot
	const effectiveDuration = durationMinutes || calculateDuration(booking.startTime, booking.endTime) || 30
	const endMinutes = startMinutes + effectiveDuration

	// Initialize result array
	const result: CourtAvailabilityStatus[] = []

	// Process each active court
	availability.activeCourtIds.forEach(courtId => {
		const court = courtsContext.value.get(courtId)
		if (!court) return

		// Arrays to store slot information
		const availableTimeSlots: string[] = []
		const unavailableTimeSlots: string[] = []

		// Track the total number of time slots we need to check
		let totalSlotsNeeded = 0

		// Check each 30-minute slot in our time range
		for (let slotTime = startMinutes; slotTime < endMinutes; slotTime += 30) {
			totalSlotsNeeded++

			// Find the corresponding slot in availability data
			const slot = availability.timeSlots.find(s => s.timeValue === slotTime)

			if (!slot) {
				// No data for this slot - treat as unavailable
				unavailableTimeSlots.push(formatMinutesToTime(slotTime))
				continue
			}

			// Check if this court is available at this time
			const isSlotAvailable = slot.courtAvailability[courtId] === true

			if (isSlotAvailable) {
				availableTimeSlots.push(slot.time)
			} else {
				unavailableTimeSlots.push(slot.time)
			}
		}

		// Determine availability status
		const hasAvailableSlots = availableTimeSlots.length > 0
		const allSlotsAvailable = availableTimeSlots.length === totalSlotsNeeded

		const status: CourtAvailabilityStatus = {
			courtId,
			courtName: court.name,
			available: hasAvailableSlots,
			fullyAvailable: allSlotsAvailable,
			availableTimeSlots,
			unavailableTimeSlots,
		}

		result.push(status)
	})

	// Return results without sorting
	return result
}

/**
 * Helper function to format minutes since midnight to HH:MM format
 */
function formatMinutesToTime(minutes: number): string {
	const hours = Math.floor(minutes / 60)
	const mins = minutes % 60
	return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Calculate duration in minutes between two time strings
 */
function calculateDuration(startTime?: string, endTime?: string): number {
	if (!startTime || !endTime) return 0

	try {
		const start = dayjs(startTime)
		const end = dayjs(endTime)
		return end.diff(start, 'minute')
	} catch (e) {
		console.error('Error calculating duration:', e)
		return 0
	}
}

/**
 * Filter time slots to mark past ones as unavailable
 */
export function filterPastTimeSlots(timeSlots: TimeSlot[], date?: string): TimeSlot[] {
	// Use provided date or get from booking context
	const targetDate = date || bookingContext.value.date

	if (!targetDate || !timeSlots || timeSlots.length === 0) {
		return timeSlots
	}

	// Apply filter to mark past time slots as unavailable
	return timeSlots.map(slot => {
		// If already unavailable, keep it that way
		if (!slot.available) return slot

		// Check if this time slot is in the past
		const isPastSlot = isTimeSlotInPast(targetDate, slot.value, 10)

		// Return the slot with updated availability
		return {
			...slot,
			available: !isPastSlot && slot.available,
		}
	})
}
