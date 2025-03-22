// src/public/book/availability.context.ts

import { createContext } from '@mhmo91/schmancy'
import dayjs from 'dayjs'
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs'
import { distinctUntilChanged, filter, map, shareReplay, switchMap, takeUntil, tap } from 'rxjs/operators'
import { courtsContext } from 'src/admin/venues/courts/context'
import { pricingService } from 'src/bookingServices/dynamic-pricing-service'
import { BookingsDB } from 'src/db/bookings.collection'
import { getUserTimezone, isTimeSlotInPast } from 'src/utils/timezone'
import { Booking, bookingContext } from './public/book/context'
import { Duration, TimeSlot } from './public/book/types'

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
	combineLatest([dateVenueChanges$, courtsContext.$.pipe(filter(courts => courts.size > 0))])
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
			switchMap(([{ date, venueId }, allCourts]) => {
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
					})
				}

				// Generate initial time slots
				const timeSlots = generateTimeSlots(date, activeCourtIds)
				console.log(date)
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
 */
export function getAvailableTimeSlots(): TimeSlot[] {
	const availability = availabilityContext.value

	const ts = availability.timeSlots.map(slot => ({
		label: slot.time,
		value: slot.timeValue,
		available: slot.hasAvailableCourts,
	}))
	return filterPastTimeSlots(ts, availability.date)
}

/**
 * Get all available durations for a specific start time
 */
export function getAvailableDurations(startTime: string): Duration[] {
	const availability = availabilityContext.value
	if (!startTime || availability.activeCourtIds.length === 0) return []

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

	// Filter durations based on availability
	return standardDurations
		.map(duration => {
			// Find courts available for this duration
			const availableCourts = availability.activeCourtIds.filter(courtId =>
				isCourtAvailableForDuration(courtId, formattedTime, duration.value),
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

			const avgPrice = availableCourts.length > 0 ? Math.round(totalPrice / availableCourts.length) : 0

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
/**
 * Determines availability status for all courts during a specific time period
 *
 * @param startTime ISO string for the requested start time
 * @param durationMinutes Duration in minutes
 * @returns Array of court availability statuses
 */
export function getAllCourtsAvailability(startTime?: string, durationMinutes?: number): CourtAvailabilityStatus[] {
	const DEBUG = true // Set to true for detailed logging

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
 *
 * This function wraps your existing getAvailableTimeSlots function,
 * applying a filter to mark any time slots in the past as unavailable.
 *
 * @param timeSlots The original time slots from your existing implementation
 * @param date The date to check against (defaults to booking context date)
 * @returns The same time slots with past ones marked as unavailable
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

/**
 * Get all time slots for the current date
 */
export function getFilteredTimeSlots(date?: string): TimeSlotAvailability[] {
	const availability = availabilityContext.value
	const targetDate = date || availability.date

	if (!targetDate || availability.timeSlots.length === 0) {
		return []
	}

	return availability.timeSlots
}
