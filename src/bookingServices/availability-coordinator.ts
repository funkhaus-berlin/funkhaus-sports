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
	 * Check if a court is available for an entire duration
	 */
	public isCourtAvailableForDuration(courtId: string, startTime: string, durationMinutes: number): boolean {
		const data = this._availabilityData.value
		if (!data) return false

		return this.availabilityService.isCourtAvailableForDuration(data, courtId, startTime, durationMinutes)
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
	 * Get available durations for a court at a specific start time
	 */
	public getAvailableDurations(courtId: string, startTime: string): Duration[] {
		const data = this._availabilityData.value
		if (!data) return []

		const court = courtsContext.value.get(courtId)
		if (!court) return []

		// Get standard durations from pricing service
		let standardDurations = pricingService.getStandardDurationPrices(court, startTime, bookingContext.value.userId)

		// Filter to only include durations that are available for this court and time
		return standardDurations.filter(duration => this.isCourtAvailableForDuration(courtId, startTime, duration.value))
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
}

// Export singleton instance
export const availabilityCoordinator = AvailabilityCoordinator.getInstance()
