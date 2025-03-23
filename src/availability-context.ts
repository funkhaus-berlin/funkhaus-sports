// src/availability-context.ts

import { createContext } from '@mhmo91/schmancy'
import dayjs from 'dayjs'
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs'
import { distinctUntilChanged, filter, map, shareReplay, switchMap, takeUntil, tap } from 'rxjs/operators'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { pricingService } from 'src/bookingServices/dynamic-pricing-service'
import { BookingsDB } from 'src/db/bookings.collection'
import { Venue } from 'src/db/venue-collection'
import { getUserTimezone, isTimeSlotInPast } from 'src/utils/timezone'
import { Booking, bookingContext, BookingStep } from './public/book/context'
import { Duration, TimeSlot } from './public/book/types'

// Define booking flow type enumeration
export enum BookingFlowType {
	DATE_COURT_TIME_DURATION = 'date_court_time_duration',
	DATE_TIME_DURATION_COURT = 'date_time_duration_court',
	DATE_TIME_COURT_DURATION = 'date_time_court_duration',
}

// Define booking flow configuration
export interface BookingFlowConfig {
	type: BookingFlowType
	steps: BookingStep[]
	nextStep: Record<BookingStep, BookingStep>
	prevStep: Record<BookingStep, BookingStep>
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

// Data structure to store availability information
export interface AvailabilityData {
	date: string // YYYY-MM-DD
	venueId: string
	timeSlots: TimeSlotAvailability[]
	activeCourtIds: string[] // List of active court IDs for this venue
	bookings: Booking[] // All bookings for this date
	loading: boolean
	error: string | null
	bookingFlow: BookingFlowConfig // New field for booking flow configuration
	venueName: string // Added for UI display purposes
}

// Create booking flow configurations
export const BOOKING_FLOWS: Record<BookingFlowType, BookingFlowConfig> = {
	[BookingFlowType.DATE_COURT_TIME_DURATION]: {
		type: BookingFlowType.DATE_COURT_TIME_DURATION,
		steps: [BookingStep.Date, BookingStep.Court, BookingStep.Time, BookingStep.Duration, BookingStep.Payment],
		nextStep: {
			[BookingStep.Date]: BookingStep.Court,
			[BookingStep.Court]: BookingStep.Time,
			[BookingStep.Time]: BookingStep.Duration,
			[BookingStep.Duration]: BookingStep.Payment,
			[BookingStep.Payment]: BookingStep.Payment,
		},
		prevStep: {
			[BookingStep.Date]: BookingStep.Date,
			[BookingStep.Court]: BookingStep.Date,
			[BookingStep.Time]: BookingStep.Court,
			[BookingStep.Duration]: BookingStep.Time,
			[BookingStep.Payment]: BookingStep.Duration,
		},
	},
	[BookingFlowType.DATE_TIME_DURATION_COURT]: {
		type: BookingFlowType.DATE_TIME_DURATION_COURT,
		steps: [BookingStep.Date, BookingStep.Time, BookingStep.Duration, BookingStep.Court, BookingStep.Payment],
		nextStep: {
			[BookingStep.Date]: BookingStep.Time,
			[BookingStep.Time]: BookingStep.Duration,
			[BookingStep.Duration]: BookingStep.Court,
			[BookingStep.Court]: BookingStep.Payment,
			[BookingStep.Payment]: BookingStep.Payment,
		},
		prevStep: {
			[BookingStep.Date]: BookingStep.Date,
			[BookingStep.Time]: BookingStep.Date,
			[BookingStep.Duration]: BookingStep.Time,
			[BookingStep.Court]: BookingStep.Duration,
			[BookingStep.Payment]: BookingStep.Court,
		},
	},
	[BookingFlowType.DATE_TIME_COURT_DURATION]: {
		type: BookingFlowType.DATE_TIME_COURT_DURATION,
		steps: [BookingStep.Date, BookingStep.Time, BookingStep.Court, BookingStep.Duration, BookingStep.Payment],
		nextStep: {
			[BookingStep.Date]: BookingStep.Time,
			[BookingStep.Time]: BookingStep.Court,
			[BookingStep.Court]: BookingStep.Duration,
			[BookingStep.Duration]: BookingStep.Payment,
			[BookingStep.Payment]: BookingStep.Payment,
		},
		prevStep: {
			[BookingStep.Date]: BookingStep.Date,
			[BookingStep.Time]: BookingStep.Date,
			[BookingStep.Court]: BookingStep.Time,
			[BookingStep.Duration]: BookingStep.Court,
			[BookingStep.Payment]: BookingStep.Duration,
		},
	},
}

// Default empty state
const defaultAvailability: AvailabilityData = {
	date: '',
	venueId: '',
	timeSlots: [],
	activeCourtIds: [],
	bookings: [],
	loading: false,
	error: null,
	venueName: '',
	bookingFlow: BOOKING_FLOWS[BookingFlowType.DATE_TIME_DURATION_COURT], // Default flow
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
	return BookingFlowType.DATE_TIME_DURATION_COURT
}

/**
 * Generate timeslots for a given day
 */
function generateTimeSlots(date: string, courtIds: string[]): TimeSlotAvailability[] {
	const slots: TimeSlotAvailability[] = []

	// Check if date is today in user's timezone
	const userTimezone = getUserTimezone()
	const selectedDate = dayjs(date).tz(userTimezone)
	const now = dayjs().tz(userTimezone)
	const isToday = selectedDate.format('YYYY-MM-DD') === now.format('YYYY-MM-DD')

	// Start time (either 8 AM or current hour if today)
	let startHour = 8
	if (isToday) {
		const currentHour = now.hour()
		startHour = currentHour < 8 ? 8 : currentHour
	}

	// End time (10 PM)
	const endHour = 22

	// Initialize all courts as available for each time slot
	const courtAvailability: Record<string, boolean> = {}
	courtIds.forEach(courtId => {
		courtAvailability[courtId] = true
	})

	// Generate slots from start to end time in 30 min increments
	for (let hour = startHour; hour < endHour; hour++) {
		// Full hour slot
		slots.push({
			time: `${hour.toString().padStart(2, '0')}:00`,
			timeValue: hour * 60,
			courtAvailability: { ...courtAvailability },
			hasAvailableCourts: courtIds.length > 0,
		})

		// Half hour slot
		slots.push({
			time: `${hour.toString().padStart(2, '0')}:30`,
			timeValue: hour * 60 + 30,
			courtAvailability: { ...courtAvailability },
			hasAvailableCourts: courtIds.length > 0,
		})
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
	// Subscribe to date and venue changes from booking context
	const dateVenueChanges$ = bookingContext.$.pipe(
		map(booking => ({ date: booking.date, venueId: booking.venueId })),
		filter(({ date, venueId }) => !!date && !!venueId),
		distinctUntilChanged((prev, curr) => prev.date === curr.date && prev.venueId === curr.venueId),
		shareReplay(1),
	)

	// Main data stream
	combineLatest([
		dateVenueChanges$,
		courtsContext.$.pipe(filter(courts => courts.size > 0)),
		venuesContext.$.pipe(filter(venues => venues.size > 0)),
	])
		.pipe(
			tap(() => {
				loadingSubject.next(true)
				errorSubject.next(null)

				// Update context with loading state
				availabilityContext.set(
					{
						...availabilityContext.value,
						loading: true,
						error: null,
					},
					true,
				)
			}),
			filter(([, allCourts, allVenues]) => !!allCourts && !!allVenues),
			switchMap(([booking, allCourts, allVenues]) => {
				const { date, venueId } = booking
				console.log('Booking data:', booking)
				// Get the venue object
				const venue = allVenues.get(venueId) || null
				// Determine booking flow based on venue settings
				const bookingFlowType = getBookingFlowForVenue(venue)
				const bookingFlow = BOOKING_FLOWS[bookingFlowType]

				// Get venue name for display
				const venueName = venue?.name || 'Unknown Venue'

				// Get active courts for this venue
				const activeCourts = Array.from(allCourts.values()).filter(
					court => court.status === 'active' && court.venueId === venueId,
				)

				const activeCourtIds = activeCourts.map(court => court.id)

				if (activeCourts.length === 0) {
					errorSubject.next('No active courts found for this venue')
					return of({
						date,
						venueId,
						timeSlots: [],
						activeCourtIds: [],
						bookings: [],
						bookingFlow,
						venueName,
					})
				}

				// Generate initial time slots
				const timeSlots = generateTimeSlots(date, activeCourtIds)

				// Fetch bookings for this date
				return BookingsDB.subscribeToCollection([
					{ key: 'date', operator: '==', value: dayjs(date).format('YYYY-MM-DD') },
					{ key: 'status', operator: 'in', value: ['confirmed', 'pending'] },
				]).pipe(
					map(bookingsMap => {
						// Convert to array
						const bookings = Array.from(bookingsMap.values())

						// Process bookings to mark unavailable slots
						const processedTimeSlots = processBookingsForTimeSlots(timeSlots, bookings)

						return {
							date,
							venueId,
							timeSlots: processedTimeSlots,
							activeCourtIds,
							bookings,
							bookingFlow,
							venueName,
						}
					}),
				)
			}),
			takeUntil(destroySignal$),
			tap({
				next: () => {
					loadingSubject.next(false)

					// Update context with loading state
					availabilityContext.set(
						{
							...availabilityContext.value,
							loading: false,
						},
						true,
					)
				},
				error: err => {
					console.error('Error loading availability data:', err)
					errorSubject.next('Failed to load availability data')
					loadingSubject.next(false)

					// Update context with error state
					availabilityContext.set(
						{
							...availabilityContext.value,
							loading: false,
							error: 'Failed to load availability data',
						},
						true,
					)
				},
			}),
		)
		.subscribe(availabilityData => {
			availabilityContext.set({
				...availabilityData,
				loading: false,
				error: null,
			})
		})
}

/**
 * Get the next step in the booking flow
 * @param currentStep The current booking step
 * @returns The next step in the flow
 */
export function getNextStep(currentStep: BookingStep): BookingStep {
	const { nextStep } = availabilityContext.value.bookingFlow
	return nextStep[currentStep]
}

/**
 * Get the previous step in the booking flow
 * @param currentStep The current booking step
 * @returns The previous step in the flow
 */
export function getPreviousStep(currentStep: BookingStep): BookingStep {
	const { prevStep } = availabilityContext.value.bookingFlow
	return prevStep[currentStep]
}

/**
 * Get all steps in the current booking flow
 * @returns Array of BookingStep in order
 */
export function getBookingFlowSteps(): BookingStep[] {
	return availabilityContext.value.bookingFlow.steps
}

// Utility functions for querying the availability context

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

	// Parse start time
	const [hours, minutes] = startTime.split(':').map(Number)
	const startMinutes = hours * 60 + minutes
	const endMinutes = startMinutes + durationMinutes

	// Check all time slots in the range
	for (const slot of availability.timeSlots) {
		if (slot.timeValue >= startMinutes && slot.timeValue < endMinutes) {
			if (!slot.courtAvailability[courtId]) {
				return false
			}
		}
	}

	return true
}

/**
 * Get all time slots with availability information
 * Supports filtering by court ID for the Date -> Court -> Time -> Duration flow
 */
export function getAvailableTimeSlots(courtId?: string): TimeSlot[] {
	const availability = availabilityContext.value

	// If we have a specific court ID (for Date -> Court -> Time flow)
	if (courtId) {
		// Filter time slots that are available for this specific court
		const ts = availability.timeSlots.map(slot => ({
			label: slot.time,
			value: slot.timeValue,
			available: slot.courtAvailability[courtId] === true,
		}))
		return filterPastTimeSlots(ts, availability.date)
	}

	// Otherwise, return all time slots
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
 */
export function getAvailableDurations(startTime: string, courtId?: string): Duration[] {
	const availability = availabilityContext.value
	if (!startTime) return []

	// Format time string
	const formattedTime = dayjs(startTime).format('HH:mm')

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

	// If court ID is provided (Date -> Court -> Time -> Duration flow)
	if (courtId) {
		return standardDurations
			.map(duration => {
				// Check if this duration is available for the specific court
				const isAvailable = isCourtAvailableForDuration(courtId, formattedTime, duration.value)

				if (!isAvailable) return null

				// Get the court for price calculation
				const court = courtsContext.value.get(courtId)
				if (!court) return null

				// Calculate price for this court and duration
				const startDateTime = dayjs(startTime)
				const endDateTime = startDateTime.add(duration.value, 'minute')

				const price = pricingService.calculatePrice(
					court,
					startDateTime.toISOString(),
					endDateTime.toISOString(),
					bookingContext.value.userId,
				)

				return {
					...duration,
					price,
				}
			})
			.filter((duration): duration is Duration => duration !== null)
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
					const startDateTime = dayjs(startTime)
					const endDateTime = startDateTime.add(duration.value, 'minute')

					const price = pricingService.calculatePrice(
						court,
						startDateTime.toISOString(),
						endDateTime.toISOString(),
						bookingContext.value.userId,
					)

					totalPrice += price
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
 */
export function getAllCourtsAvailability(startTime?: string, durationMinutes?: number): CourtAvailabilityStatus[] {
	const DEBUG = false // Set to true for detailed logging

	// Get availability data from context
	const availability = availabilityContext.value
	const booking = bookingContext.value

	// Use parameters or fall back to booking context
	const effectiveStartTime = startTime || booking.startTime
	const effectiveDuration = durationMinutes || calculateDuration(booking.startTime, booking.endTime)

	if (DEBUG) {
		console.log(`Checking availability for startTime=${effectiveStartTime}, duration=${effectiveDuration}min`)
	}

	// If missing required data, return empty array
	if (!effectiveStartTime || !effectiveDuration) {
		if (DEBUG) console.log('Missing start time or duration, returning empty array')
		return []
	}

	// Convert start time to minutes since midnight for easier comparison
	const timeObj = dayjs(effectiveStartTime)
	const startMinutes = timeObj.hour() * 60 + timeObj.minute()
	const endMinutes = startMinutes + effectiveDuration

	if (DEBUG) {
		console.log(`Time range: ${startMinutes}min to ${endMinutes}min`)
		console.log(`Active courts: ${availability.activeCourtIds.length}`)
	}

	// Initialize result array
	const result: CourtAvailabilityStatus[] = []

	// Process each active court
	availability.activeCourtIds.forEach(courtId => {
		const court = courtsContext.value.get(courtId)
		if (!court) return

		if (DEBUG) console.log(`Processing court: ${court.name} (${courtId})`)

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
				if (DEBUG) console.log(`  No data for slot at ${slotTime}min`)
				// No data for this slot - treat as unavailable
				unavailableTimeSlots.push(formatMinutesToTime(slotTime))
				continue
			}

			// Check if this court is available at this time
			const isSlotAvailable = slot.courtAvailability[courtId] === true

			if (isSlotAvailable) {
				if (DEBUG) console.log(`  Slot ${formatMinutesToTime(slotTime)} is AVAILABLE`)
				availableTimeSlots.push(slot.time)
			} else {
				if (DEBUG) console.log(`  Slot ${formatMinutesToTime(slotTime)} is UNAVAILABLE`)
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

		if (DEBUG) {
			console.log(`Court status: ${court.name}`)
			console.log(`  Available: ${status.available}`)
			console.log(`  Fully Available: ${status.fullyAvailable}`)
			console.log(`  Available slots: ${status.availableTimeSlots.join(', ')}`)
			console.log(`  Unavailable slots: ${status.unavailableTimeSlots.join(', ')}`)
		}

		result.push(status)
	})

	// Sort courts: fully available first, then by most available slots, then by name
	return result.sort((a, b) => {
		if (a.fullyAvailable !== b.fullyAvailable) {
			return a.fullyAvailable ? -1 : 1
		}

		if (a.availableTimeSlots.length !== b.availableTimeSlots.length) {
			return b.availableTimeSlots.length - a.availableTimeSlots.length
		}

		return a.courtName.localeCompare(b.courtName)
	})
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
