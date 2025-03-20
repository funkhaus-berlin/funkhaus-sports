// src/bookingServices/availability-coordinator.ts

import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { BehaviorSubject, Observable, Subject, timer } from 'rxjs'
import { filter, map, switchMap, takeUntil, tap } from 'rxjs/operators'
import { courtsContext } from 'src/admin/venues/courts/context'
import { bookingContext } from 'src/public/book/context'
import { Duration, TimeSlot } from 'src/public/book/types'
import { createTimeRange, getUserTimezone, toUserTimezone, toUTC } from 'src/utils/timezone'
import { AvailabilityResponse, AvailabilityService } from './availability'
import { pricingService } from './dynamic-pricing-service'

// Set up dayjs plugins
dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Coordinates availability data across booking components
 * Single source of truth for availability information
 * With proper timezone handling
 */
export class AvailabilityCoordinator {
	private static instance: AvailabilityCoordinator
	private availabilityService = new AvailabilityService()

	// Current availability data
	private _availabilityData = new BehaviorSubject<AvailabilityResponse | null>(null)
	public availabilityData$ = this._availabilityData

	// Loading and error state
	private _loading = new BehaviorSubject<boolean>(false)
	public loading$ = this._loading.asObservable()

	private _error = new BehaviorSubject<string | null>(null)
	public error$ = this._error

	// Last successful fetch timestamp
	lastFetchTime = 0

	// Auto-refresh interval in ms (1 minute)
	private refreshInterval = 60000
	private refreshSubscription: { unsubscribe: () => void } | null = null

	// Stop signal for ongoing operations
	private stopSignal = new Subject<void>()

	private constructor() {
		// Subscribe to booking context changes
		bookingContext.$.pipe(
			filter(booking => !!booking && !!booking.date && !!booking.venueId),
			map(booking => ({ date: booking.date, venueId: booking.venueId })),
			tap(() => {
				// Clear previous data when booking context changes
				this._availabilityData.next(null)
				this._loading.next(true)
				this._error.next(null)

				// Stop any ongoing operations
				this.stopSignal.next()
			}),
			switchMap(({ date, venueId }) => {
				// Load availability data for new date and venue
				return this.loadAvailabilityData(date, venueId)
			}),
		).subscribe({
			error: err => {
				console.error('Error in booking subscription:', err)
				this._error.next('Failed to load availability data')
				this._loading.next(false)
			},
		})
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(): AvailabilityCoordinator {
		if (!AvailabilityCoordinator.instance) {
			AvailabilityCoordinator.instance = new AvailabilityCoordinator()
		}
		return AvailabilityCoordinator.instance
	}

	/**
	 * Load availability data with auto-refresh
	 */
	private loadAvailabilityData(date: string, venueId: string): Observable<AvailabilityResponse> {
		this._loading.next(true)

		// Stop any existing refresh
		if (this.refreshSubscription) {
			this.refreshSubscription.unsubscribe()
			this.refreshSubscription = null
		}

		// Set up new refresh interval
		this.setupRefreshInterval(date, venueId)

		return this.availabilityService.getVenueAvailability(date, venueId).pipe(
			tap(data => {
				this._availabilityData.next(data)
				this.lastFetchTime = Date.now()
				this._loading.next(false)
				this._error.next(null)
			}),
			takeUntil(this.stopSignal),
		)
	}

	/**
	 * Set up periodic refresh of availability data
	 */
	private setupRefreshInterval(date: string, venueId: string): void {
		// Set up timer that fires every refreshInterval
		this.refreshSubscription = timer(this.refreshInterval, this.refreshInterval)
			.pipe(
				switchMap(() => this.availabilityService.refreshAvailability(date, venueId)),
				takeUntil(this.stopSignal),
			)
			.subscribe({
				next: data => {
					this._availabilityData.next(data)
					this.lastFetchTime = Date.now()
				},
				error: err => console.error('Error refreshing availability data:', err),
			})
	}

	/**
	 * Force refresh of availability data
	 */
	public refreshData(): void {
		const booking = bookingContext.value
		if (booking?.date && booking?.venueId) {
			this.loadAvailabilityData(booking.date, booking.venueId).subscribe()
		}
	}

	/**
	 * Get available time slots based on current availability data
	 * With proper timezone handling
	 */
	public getAvailableTimeSlots(date: string): TimeSlot[] {
		const data = this._availabilityData.value
		if (!data || !data.timeSlots) return []

		const slots: TimeSlot[] = []

		// Check if selected date is today in user's timezone
		const userTimezone = getUserTimezone()
		const selectedDate = dayjs(date).tz(userTimezone)
		const now = dayjs().tz(userTimezone)
		const isToday = selectedDate.format('YYYY-MM-DD') === now.format('YYYY-MM-DD')
		const currentMinutes = isToday ? now.hour() * 60 + now.minute() : 0

		// Process each time slot from the availability data
		Object.entries(data.timeSlots).forEach(([timeKey, slotData]) => {
			const [hour, minute] = timeKey.split(':').map(Number)
			const value = hour * 60 + (minute || 0)

			// Check if time slot is in the past for today
			const isPastTime = isToday && value < currentMinutes

			// A time slot is available if it has available courts AND it's not in the past
			const isAvailable = slotData.isAvailable === true && !isPastTime

			slots.push({
				label: timeKey,
				value,
				available: isAvailable,
			})
		})

		// Sort by time
		return slots.sort((a, b) => a.value - b.value)
	}

	/**
	 * Clean up subscriptions
	 */
	public dispose(): void {
		this.stopSignal.next()
		this.stopSignal.complete()

		if (this.refreshSubscription) {
			this.refreshSubscription.unsubscribe()
		}
	}

	/**
	 * Check if a court is available at a specific time
	 * With proper timezone handling
	 */
	public isCourtAvailable(courtId: string, timeSlot: string): boolean {
		const data = this._availabilityData.value
		if (!data || !data.courts) return false

		const court = data.courts[courtId]
		if (!court) return false

		// Court isn't available at all
		if (court.isAvailable === false) return false

		// If we have a booking context with a date, use it for better conversion
		const date = bookingContext.value?.date || new Date().toISOString().split('T')[0]

		// IMPORTANT: timeSlot is in local time format (HH:MM), we need to convert it to UTC
		// This is correct - we're converting from local display time to UTC for checking
		const utcDateTime = toUTC(date, timeSlot)
		const utcTimeSlot = dayjs(utcDateTime).format('HH:mm')

		console.log(`Availability check for court ${courtId}:
    - Local time: ${timeSlot}
    - Date: ${date}
    - Converted to UTC: ${utcTimeSlot}
  `)

		// Check if this specific timeslot is booked
		if (court.bookedTimeSlots && court.bookedTimeSlots.includes(utcTimeSlot)) {
			return false
		}

		return true
	}

	/**
	 * Check if a court is available for an entire duration
	 * With proper timezone handling
	 */
	public isCourtAvailableForDuration(courtId: string, startTime: string, durationMinutes: number): boolean {
		const data = this._availabilityData.value
		if (!data || !data.timeSlots || !data.courts) return false

		const court = data.courts[courtId]
		if (!court) return false

		// If the court itself isn't available, return false immediately
		if (court.isAvailable === false) return false

		// Get date from booking context
		const date = bookingContext.value?.date
		if (!date) return false

		// startTime is already in UTC ISO format from the booking context
		// Just use it directly without trying to convert it again

		// For better debugging, show both UTC and local time
		const localStartTime = toUserTimezone(startTime)

		// Generate all 30-minute time slots in the range (in UTC)
		const timeRange = createTimeRange(startTime, durationMinutes)

		// Log for debugging
		console.log(`Checking duration availability for court ${courtId}:
    - UTC Start: ${startTime}
    - Local Start: ${localStartTime.format('HH:mm')}
    - Duration: ${durationMinutes} minutes
    - Checking UTC slots: ${timeRange.join(', ')}
  `)

		// Check if all slots in the range are available
		for (const timeSlot of timeRange) {
			// Check both data sources:
			// 1. court.bookedTimeSlots (detailed court-specific bookings)
			// 2. TimeSlot availability map (global availability)

			// Check court-specific availability
			if (court.bookedTimeSlots && court.bookedTimeSlots.includes(timeSlot)) {
				console.log(`Slot ${timeSlot} is already booked for court ${courtId}`)
				return false
			}

			// Check global timeSlot availability
			const globalTimeSlot = data.timeSlots[timeSlot]
			if (globalTimeSlot && globalTimeSlot.courts && globalTimeSlot.courts[courtId] === false) {
				console.log(`Slot ${timeSlot} is marked unavailable in global timeSlot data`)
				return false
			}
		}

		// All slots are available
		return true
	}
	/**
	 * Get available durations for a court at a specific start time
	 * With proper timezone handling
	 */
	public getAvailableDurations(courtId: string, startTime: string): Duration[] {
		const data = this._availabilityData.value
		if (!data) {
			console.warn('No availability data found when getting durations')
			return []
		}

		const court = courtsContext.value.get(courtId)
		if (!court) {
			console.warn('Court not found:', courtId)
			return []
		}

		// Get standard durations from pricing service
		let standardDurations = pricingService.getStandardDurationPrices(court, startTime, bookingContext.value.userId)

		console.log(`Checking available durations for court ${courtId} at time ${startTime}`)
		console.log(`Standard durations:`, standardDurations)

		// Filter to only include durations that are available for this court and time
		const availableDurations = standardDurations.filter(duration => {
			const isAvailable = this.isCourtAvailableForDuration(courtId, startTime, duration.value)
			console.log(`Duration ${duration.value} minutes (${duration.label}) available: ${isAvailable}`)
			return isAvailable
		})

		console.log('Available durations:', availableDurations)

		return availableDurations
	}
}

// Export singleton instance
export const availabilityCoordinator = AvailabilityCoordinator.getInstance()
