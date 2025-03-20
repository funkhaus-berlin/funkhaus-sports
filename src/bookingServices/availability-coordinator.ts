// src/public/book/availability-coordinator.ts

import dayjs from 'dayjs'
import { BehaviorSubject, Observable, Subject, timer } from 'rxjs'
import { filter, map, switchMap, takeUntil, tap } from 'rxjs/operators'
import { courtsContext } from 'src/admin/venues/courts/context'
import { bookingContext } from 'src/public/book/context'
import { Duration, TimeSlot } from 'src/public/book/types'
import { AvailabilityResponse, AvailabilityService } from './availability'
import { pricingService } from './dynamic-pricing-service'

/**
 * Coordinates availability data across booking components
 * Single source of truth for availability information
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
	 * Check if a court is available at a specific time
	 */
	public isCourtAvailable(courtId: string, timeSlot: string): boolean {
		const data = this._availabilityData.value
		if (!data || !data.courts) return false

		const court = data.courts[courtId]
		if (!court) return false

		return court.isAvailable === true
	}

	/**
	 * Get available time slots based on current availability data
	 */
	public getAvailableTimeSlots(date: string): TimeSlot[] {
		const data = this._availabilityData.value
		if (!data || !data.timeSlots) return []

		const slots: TimeSlot[] = []

		// Check if selected date is today
		const isToday = dayjs(date).isSame(dayjs(), 'day')
		const currentTime = isToday ? dayjs() : null
		const currentMinutes = currentTime ? currentTime.hour() * 60 + currentTime.minute() : 0

		// Process each time slot from the availability data
		Object.entries(data.timeSlots).forEach(([timeKey, slotData]) => {
			const [hour, minute] = timeKey.split(':').map(Number)
			const value = hour * 60 + (minute || 0)

			// Check if time slot is in the past for today
			const isPastTime = isToday && currentTime ? value < currentMinutes : false

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

	// In availability-coordinator.ts

	/**
	 * Check if a court is available for an entire duration
	 * Enhanced to check for consecutive availability
	 */
	public isCourtAvailableForDuration(courtId: string, startTime: string, durationMinutes: number): boolean {
		const data = this._availabilityData.value
		if (!data || !data.timeSlots || !data.courts) return false

		const court = data.courts[courtId]
		if (!court) return false

		// If the court itself isn't available, return false immediately
		if (court.isAvailable === false) return false

		// Parse the start time
		const start = dayjs(startTime)

		// Calculate the end time
		const end = start.add(durationMinutes, 'minute')

		// Convert to 24-hour format strings for comparison
		const startHour = start.hour()
		const startMinute = start.minute()
		const endHour = end.hour()
		const endMinute = end.minute()

		// We need to check every 30-minute slot between start and end
		// Special handling for the start slot if it starts at an odd time
		for (let hour = startHour; hour <= endHour; hour++) {
			// For the starting hour, we only check slots at or after the start time
			if (hour === startHour) {
				if (startMinute < 30) {
					// Check the :00 slot
					const timeKey = `${hour.toString().padStart(2, '0')}:00`
					if (!this.isTimeSlotAvailableForCourt(data, timeKey, courtId)) return false
				}

				// Only check the :30 slot if our start time is before XX:30
				if (startMinute < 30 || hour < endHour || (hour === endHour && endMinute > 30)) {
					// Check the :30 slot
					const timeKey = `${hour.toString().padStart(2, '0')}:30`
					if (!this.isTimeSlotAvailableForCourt(data, timeKey, courtId)) return false
				}
			}
			// For the ending hour
			else if (hour === endHour) {
				// Only check the :00 slot if our end time is after XX:00
				if (endMinute > 0) {
					const timeKey = `${hour.toString().padStart(2, '0')}:00`
					if (!this.isTimeSlotAvailableForCourt(data, timeKey, courtId)) return false
				}

				// Only check the :30 slot if our end time is after XX:30
				if (endMinute > 30) {
					const timeKey = `${hour.toString().padStart(2, '0')}:30`
					if (!this.isTimeSlotAvailableForCourt(data, timeKey, courtId)) return false
				}
			}
			// For any hour in between
			else {
				// Check both :00 and :30 slots
				const time00 = `${hour.toString().padStart(2, '0')}:00`
				if (!this.isTimeSlotAvailableForCourt(data, time00, courtId)) return false

				const time30 = `${hour.toString().padStart(2, '0')}:30`
				if (!this.isTimeSlotAvailableForCourt(data, time30, courtId)) return false
			}
		}

		// If we've checked all slots and they're all available, return true
		return true
	}

	/**
	 * Helper method to check if a specific time slot is available for a court
	 */
	private isTimeSlotAvailableForCourt(data: any, timeKey: string, courtId: string): boolean {
		// Check if the time slot exists in the data
		if (!data.timeSlots[timeKey]) return false

		// Check if the court is specifically marked as available in this time slot
		const timeSlot = data.timeSlots[timeKey]
		return timeSlot.courts?.[courtId] === true
	}

	/**
	 * Get available durations for a court at a specific start time
	 * Enhanced to properly check consecutive availability
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

		console.log('Checking available durations for court', courtId, 'at time', startTime)
		console.log('Standard durations:', standardDurations)

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
