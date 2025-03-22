// src/utils/timezone.ts

import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

// Set up dayjs plugins
dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Check if a time slot is in the past for the selected date
 * @param date - The selected date in YYYY-MM-DD format
 * @param timeValue - The time slot value in minutes (e.g., 8*60 for 8:00 AM)
 * @returns boolean - true if the time slot is in the past
 */
export function isTimeSlotInPast(date: string, timeValue: number): boolean {
	if (!date) return false

	try {
		// Get user's timezone
		const userTz = getUserTimezone()

		// Create date objects
		const now = dayjs().tz(userTz)
		const selectedDate = dayjs(date).tz(userTz)

		// Calculate hours and minutes from time value
		const hours = Math.floor(timeValue / 60)
		const minutes = timeValue % 60

		// Set the hours and minutes on the selected date
		const slotDateTime = selectedDate.hour(hours).minute(minutes)

		// Check if the slot is in the past
		return slotDateTime.isBefore(now)
	} catch (error) {
		console.error('Error checking if time slot is in past:', error)
		return false
	}
}

/**
 * Format time from minutes to string (e.g., 510 -> "8:30")
 */
export function formatTimeFromMinutes(minutes: number, use24Hour: boolean = false): string {
	const hours = Math.floor(minutes / 60)
	const mins = minutes % 60

	if (use24Hour) {
		return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
	} else {
		// 12-hour format
		const period = hours >= 12 ? 'PM' : 'AM'
		const displayHour = hours % 12 === 0 ? 12 : hours % 12
		return `${displayHour}:${mins.toString().padStart(2, '0')} ${period}`
	}
}
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
