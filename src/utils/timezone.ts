// src/utils/timezone.ts

import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

// Set up dayjs plugins
dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Get user's timezone or default to Berlin
 */
export function getUserTimezone(): string {
	try {
		const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
		return detectedTimezone || 'Europe/Berlin'
	} catch (e) {
		console.warn('Could not detect timezone:', e)
		return 'Europe/Berlin'
	}
}

/**
 * Convert UTC ISO string to user's local timezone
 */
export function toUserTimezone(isoString: string): dayjs.Dayjs {
	const userTimezone = getUserTimezone()
	return dayjs(isoString).tz(userTimezone)
}

/**
 * Convert local time to UTC
 * @param date Date string (YYYY-MM-DD)
 * @param timeString Time string (HH:MM)
 * @returns UTC date-time as ISO string
 */
export function toUTC(date: string, timeString: string): string {
	const userTimezone = getUserTimezone()
	const [hours, minutes] = timeString.split(':').map(Number)

	return dayjs(date).tz(userTimezone).hour(hours).minute(minutes).second(0).millisecond(0).utc().toISOString()
}

/**
 * Get time slot string (HH:MM) from dayjs object
 */
export function getTimeSlotString(time: dayjs.Dayjs): string {
	return time.format('HH:mm')
}

/**
 * Create a time range for checking availability
 * @param startTimeISO UTC ISO string for start time
 * @param durationMinutes Duration in minutes
 * @returns Array of time slot strings in UTC (HH:MM format)
 */
export function createTimeRange(startTimeISO: string, durationMinutes: number): string[] {
	// startTimeISO is already in UTC, so just parse it directly
	const startTime = dayjs(startTimeISO)
	const endTime = startTime.add(durationMinutes, 'minute')

	const slots: string[] = []
	let currentTime = startTime.clone()

	// Add slots in 30-minute increments
	while (currentTime.isBefore(endTime)) {
		// Format as HH:mm
		slots.push(currentTime.format('HH:mm'))
		currentTime = currentTime.add(30, 'minute')
	}

	return slots
}
