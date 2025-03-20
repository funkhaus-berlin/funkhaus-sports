// src/bookingServices/enhanced-availability-coordinator.ts

import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { BehaviorSubject, Observable, Subject, timer } from 'rxjs'
import { filter, map, switchMap, takeUntil, tap } from 'rxjs/operators'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { Court } from 'src/db/courts.collection'
import { bookingContext } from 'src/public/book/context'
import { Duration, TimeSlot } from 'src/public/book/types'
import { createTimeRange, getUserTimezone } from 'src/utils/timezone'
import { AvailabilityResponse, AvailabilityService } from './availability'
import { pricingService } from './dynamic-pricing-service'

// Set up dayjs plugins
dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Represents a court's availability status for a specific time range
 */
export interface CourtAvailabilityStatus {
	courtId: string
	courtName: string
	available: boolean
	availableTimeSlots: string[]
	unavailableTimeSlots: string[]
	fullyAvailable: boolean
}

/**
 * Represents a time slot's availability across multiple courts
 */
export interface TimeSlotAvailabilityStatus {
	time: string
	timeValue: number
	availableCourts: string[]
	unavailableCourts: string[]
	hasAvailableCourts: boolean
}

/**
 * Represents a duration's availability across multiple courts
 */
export interface DurationAvailabilityStatus {
	value: number
	label: string
	price: number
	availableCourts: string[]
	unavailableCourts: string[]
	hasAvailableCourts: boolean
}

/**
 * Enhanced coordinator for all availability-related operations
 * Serves as a single source of truth for availability data
 */
export class EnhancedAvailabilityCoordinator {
	private static instance: EnhancedAvailabilityCoordinator
	private availabilityService = new AvailabilityService()

	// Current availability data
	private _availabilityData = new BehaviorSubject<AvailabilityResponse | null>(null)
	public availabilityData$ = this._availabilityData

	// Loading and error state
	private _loading = new BehaviorSubject<boolean>(false)
	public loading$ = this._loading

	private _error = new BehaviorSubject<string | null>(null)
	public error$ = this._error

	// Cache for computed availability data
	private timeSlotCache = new Map<string, TimeSlotAvailabilityStatus[]>()
	private durationCache = new Map<string, DurationAvailabilityStatus[]>()
	private courtAvailabilityCache = new Map<string, CourtAvailabilityStatus[]>()

	// Last successful fetch timestamp
	private lastFetchTime = 0

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

				// Clear caches when date or venue changes
				this.clearCaches()
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
	 * Clear all caches when date/venue changes to ensure fresh data
	 */
	private clearCaches(): void {
		this.timeSlotCache.clear()
		this.durationCache.clear()
		this.courtAvailabilityCache.clear()
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(): EnhancedAvailabilityCoordinator {
		if (!EnhancedAvailabilityCoordinator.instance) {
			EnhancedAvailabilityCoordinator.instance = new EnhancedAvailabilityCoordinator()
		}
		return EnhancedAvailabilityCoordinator.instance
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

				// Clear caches to ensure fresh data is used
				this.clearCaches()
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

					// Clear caches to ensure fresh data is used
					this.clearCaches()
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
	 * Generate a cache key for time-related caches
	 */
	private generateCacheKey(date: string, startTime?: string, duration?: number): string {
		return `${date}_${startTime || ''}_${duration || ''}`
	}

	/**
	 * Get all available time slots across all courts
	 * @returns Array of time slots with availability information across all courts
	 */
	public getAllAvailableTimeSlots(date?: string): TimeSlotAvailabilityStatus[] {
		// Use provided date or current booking date
		const targetDate = date || bookingContext.value.date
		if (!targetDate) {
			console.warn('No date provided for time slots')
			return []
		}

		// Check for cached results
		const cacheKey = this.generateCacheKey(targetDate)
		const cachedResult = this.timeSlotCache.get(cacheKey)
		if (cachedResult) {
			return cachedResult
		}

		// Get current availability data
		const data = this._availabilityData.value
		if (!data || !data.timeSlots) {
			console.warn('No availability data found when getting time slots')
			return []
		}

		// Get all active courts for the current venue
		const courts = Array.from(courtsContext.value.values()).filter(
			court => court.status === 'active' && court.venueId === bookingContext.value.venueId,
		)

		if (courts.length === 0) {
			console.warn('No active courts found for time slots')
			return []
		}

		// Check if selected date is today in user's timezone
		const userTimezone = getUserTimezone()
		const selectedDate = dayjs(targetDate).tz(userTimezone)
		const now = dayjs().tz(userTimezone)
		const isToday = selectedDate.format('YYYY-MM-DD') === now.format('YYYY-MM-DD')
		const currentMinutes = isToday ? now.hour() * 60 + now.minute() : 0

		// Process all time slots from the availability data
		const result: TimeSlotAvailabilityStatus[] = []

		Object.entries(data.timeSlots).forEach(([timeKey, slotData]) => {
			const [hour, minute] = timeKey.split(':').map(Number)
			const timeValue = hour * 60 + (minute || 0)

			// Check if time slot is in the past for today
			const isPastTime = isToday && timeValue < currentMinutes

			// Skip time slots in the past
			if (isPastTime) {
				return
			}

			// Find available and unavailable courts for this time slot
			const availableCourts: string[] = []
			const unavailableCourts: string[] = []

			courts.forEach(court => {
				// Check if court is available at this time
				const isAvailable = this.isCourtAvailable(court.id, timeKey)
				if (isAvailable) {
					availableCourts.push(court.id)
				} else {
					unavailableCourts.push(court.id)
				}
			})

			result.push({
				time: timeKey,
				timeValue,
				availableCourts,
				unavailableCourts,
				hasAvailableCourts: availableCourts.length > 0,
			})
		})

		// Sort by time value
		const sortedResult = result.sort((a, b) => a.timeValue - b.timeValue)

		// Cache the result
		this.timeSlotCache.set(cacheKey, sortedResult)

		return sortedResult
	}

	/**
	 * Get all available durations across all courts for a specific start time
	 * This allows offering alternative courts if the selected court isn't available
	 * for the full duration
	 *
	 * @param startTime - Start time in ISO format
	 * @returns Array of durations with availability information across all courts
	 */
	public getAllAvailableDurations(startTime: string): DurationAvailabilityStatus[] {
		if (!startTime) {
			console.warn('No start time provided for duration availability')
			return []
		}

		// Check for cached results
		const date = bookingContext.value.date
		const cacheKey = this.generateCacheKey(date, startTime)
		const cachedResult = this.durationCache.get(cacheKey)
		if (cachedResult) {
			return cachedResult
		}

		// Get all active courts for the current venue
		const courts = Array.from(courtsContext.value.values()).filter(
			court => court.status === 'active' && court.venueId === bookingContext.value.venueId,
		)

		if (courts.length === 0) {
			console.warn('No active courts found for durations')
			return []
		}

		// Get venue for operating hours (to limit max duration)
		const venue = venuesContext.value.get(bookingContext.value.venueId)

		// Start with standard durations
		const standardDurations = [
			{ label: '30m', value: 30 },
			{ label: '1h', value: 60 },
			{ label: '1.5h', value: 90 },
			{ label: '2h', value: 120 },
			{ label: '2.5h', value: 150 },
			{ label: '3h', value: 180 },
		]

		// Get pricing for the first court (we'll adjust prices per court later)
		const firstCourt = courts[0]
		const standardPrices = pricingService.getStandardDurationPrices(firstCourt, startTime, bookingContext.value.userId)

		// Create map of duration value to price
		const priceMap = new Map<number, number>()
		standardPrices.forEach(price => {
			priceMap.set(price.value, price.price)
		})

		// Process each duration
		const result: DurationAvailabilityStatus[] = []

		standardDurations.forEach(duration => {
			const availableCourts: string[] = []
			const unavailableCourts: string[] = []

			// Check each court for availability for this duration
			courts.forEach(court => {
				const isAvailable = this.isCourtAvailableForDuration(court.id, startTime, duration.value)
				if (isAvailable) {
					availableCourts.push(court.id)
				} else {
					unavailableCourts.push(court.id)
				}
			})

			// Only include durations that have at least one available court
			if (availableCourts.length > 0) {
				// Get price from map or calculate average if not found
				const price =
					priceMap.get(duration.value) ||
					this.calculateAveragePriceForDuration(availableCourts, startTime, duration.value)

				result.push({
					value: duration.value,
					label: duration.label,
					price,
					availableCourts,
					unavailableCourts,
					hasAvailableCourts: availableCourts.length > 0,
				})
			}
		})

		// Cache the result
		this.durationCache.set(cacheKey, result)

		return result
	}

	/**
	 * Calculate average price across multiple courts for a specific duration
	 */
	private calculateAveragePriceForDuration(courtIds: string[], startTime: string, duration: number): number {
		let totalPrice = 0

		courtIds.forEach(courtId => {
			const court = courtsContext.value.get(courtId)
			if (court) {
				// Use pricing service to calculate price for this court
				const prices = pricingService.getStandardDurationPrices(court, startTime)
				const durationPrice = prices.find(p => p.value === duration)
				if (durationPrice) {
					totalPrice += durationPrice.price
				}
			}
		})

		// Calculate average
		return courtIds.length > 0 ? Math.round(totalPrice / courtIds.length) : 0
	}

	/**
	 * Get availability status for all courts given start time and duration
	 * This provides a comprehensive view of which courts are available for booking
	 *
	 * @param startTime - Start time in ISO format
	 * @param duration - Duration in minutes
	 * @returns Array of courts with their availability status
	 */
	public getAllCourtsAvailability(startTime?: string, duration?: number): CourtAvailabilityStatus[] {
		// Use current booking context if parameters not provided
		const booking = bookingContext.value
		const effectiveStartTime = startTime || booking.startTime
		const effectiveDuration = duration || this.calculateCurrentDuration()

		// If missing required data, return empty array
		if (!effectiveStartTime && !booking.date) {
			return []
		}

		// Check for cached results
		const cacheKey = this.generateCacheKey(booking.date, effectiveStartTime, effectiveDuration)
		const cachedResult = this.courtAvailabilityCache.get(cacheKey)
		if (cachedResult) {
			return cachedResult
		}

		// Get availability data
		const data = this._availabilityData.value
		if (!data) {
			return []
		}

		// Get all courts for this venue
		const venue = booking.venueId
		const allCourts = Array.from(courtsContext.value.values()).filter(
			court => court.status === 'active' && court.venueId === venue,
		)

		const result: CourtAvailabilityStatus[] = []

		// Process each court
		allCourts.forEach(court => {
			// If we're just checking overall availability without time/duration
			if (!effectiveStartTime || !effectiveDuration) {
				// Simplified check for general availability
				const courtData = data.courts[court.id]
				const isAvailable = courtData && courtData.isAvailable !== false

				result.push({
					courtId: court.id,
					courtName: court.name,
					available: isAvailable,
					availableTimeSlots: [],
					unavailableTimeSlots: [],
					fullyAvailable: isAvailable,
				})

				return
			}

			// For specific time/duration check
			const availableTimeSlots: string[] = []
			const unavailableTimeSlots: string[] = []

			// Get all time slots in the duration range
			const timeRange = createTimeRange(effectiveStartTime, effectiveDuration)

			// Check each time slot
			timeRange.forEach(timeSlot => {
				const isSlotAvailable = this.isCourtAvailable(court.id, timeSlot)
				if (isSlotAvailable) {
					availableTimeSlots.push(timeSlot)
				} else {
					unavailableTimeSlots.push(timeSlot)
				}
			})

			// Court is fully available if all time slots are available
			const fullyAvailable = unavailableTimeSlots.length === 0

			result.push({
				courtId: court.id,
				courtName: court.name,
				available: availableTimeSlots.length > 0,
				availableTimeSlots,
				unavailableTimeSlots,
				fullyAvailable,
			})
		})

		// Sort courts by availability (fully available first)
		const sortedResult = result.sort((a, b) => {
			// First sort by full availability
			if (a.fullyAvailable !== b.fullyAvailable) {
				return a.fullyAvailable ? -1 : 1
			}

			// Then by number of available slots (most available first)
			if (a.availableTimeSlots.length !== b.availableTimeSlots.length) {
				return b.availableTimeSlots.length - a.availableTimeSlots.length
			}

			// Finally by name
			return a.courtName.localeCompare(b.courtName)
		})

		// Cache the result
		this.courtAvailabilityCache.set(cacheKey, sortedResult)

		return sortedResult
	}

	/**
	 * Calculate the current duration from booking start and end times
	 */
	private calculateCurrentDuration(): number {
		const booking = bookingContext.value
		if (!booking.startTime || !booking.endTime) {
			return 0
		}

		try {
			const start = dayjs(booking.startTime)
			const end = dayjs(booking.endTime)
			return end.diff(start, 'minute')
		} catch (e) {
			console.error('Error calculating duration:', e)
			return 0
		}
	}

	/**
	 * Get available time slots formatted for the UI
	 * This is a simplified format for rendering in the time selection component
	 */
	public getAvailableTimeSlots(date?: string): TimeSlot[] {
		const allSlots = this.getAllAvailableTimeSlots(date)

		return allSlots.map(slot => ({
			label: slot.time,
			value: slot.timeValue,
			available: slot.hasAvailableCourts,
		}))
	}

	/**
	 * Get available durations for a specific court at a specific start time
	 * This is used in the duration selection component
	 */
	public getAvailableDurationsForCourt(courtId: string, startTime: string): Duration[] {
		if (!courtId || !startTime) {
			return []
		}

		const court = courtsContext.value.get(courtId)
		if (!court) {
			return []
		}

		// Get standard durations from pricing service
		const standardDurations = pricingService.getStandardDurationPrices(court, startTime, bookingContext.value.userId)

		// Filter to only include durations that are available
		return standardDurations.filter(duration => this.isCourtAvailableForDuration(courtId, startTime, duration.value))
	}

	/**
	 * Get best alternative courts if selected court is not available
	 * This can suggest different courts to the user when their selected court
	 * isn't available for their desired duration
	 */
	public getAlternativeCourts(startTime: string, duration: number, currentCourtId?: string): Court[] {
		if (!startTime || !duration) {
			return []
		}

		// Get all courts availability
		const courtsAvailability = this.getAllCourtsAvailability(startTime, duration)

		// Filter to fully available courts that aren't the current court
		const alternativeCourts = courtsAvailability
			.filter(court => court.fullyAvailable && (!currentCourtId || court.courtId !== currentCourtId))
			.map(court => courtsContext.value.get(court.courtId))
			.filter(court => !!court) as Court[]

		return alternativeCourts
	}

	/**
	 * Check if a specific court is available at a specific time
	 * Enhanced with proper timezone handling
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

		// Check if this specific timeslot is booked
		if (court.bookedTimeSlots && court.bookedTimeSlots.includes(timeSlot)) {
			return false
		}

		// Also check the global timeSlots data
		const slot = data.timeSlots[timeSlot]
		if (slot && slot.courts && slot.courts[courtId] === false) {
			return false
		}

		return true
	}

	/**
	 * Check if a court is available for an entire duration
	 * Enhanced with proper timezone handling
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

		// Generate all 30-minute time slots in the range
		const timeRange = createTimeRange(startTime, durationMinutes)

		// Check if all slots in the range are available
		for (const timeSlot of timeRange) {
			// Check if time slot is available
			if (!this.isCourtAvailable(courtId, timeSlot)) {
				return false
			}
		}

		// All slots are available
		return true
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
export const enhancedAvailabilityCoordinator = EnhancedAvailabilityCoordinator.getInstance()
