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
export function isTimeSlotInPast(date: string, timeValue: number, graceMinutes: number = 10): boolean {
	const userTimezone = getUserTimezone()

	// Get current date and time in user's timezone
	const now = dayjs().tz(userTimezone)

	// Convert the slot time value to a date object
	const slotDate = dayjs(date).tz(userTimezone)
	const slotHours = Math.floor(timeValue / 60)
	const slotMinutes = timeValue % 60
	const slotDateTime = slotDate.hour(slotHours).minute(slotMinutes)

	// Add grace period to slot time
	const slotWithGrace = slotDateTime.add(graceMinutes, 'minute')

	// Check if current time is after the time slot (plus grace period)
	return now.isAfter(slotWithGrace)
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