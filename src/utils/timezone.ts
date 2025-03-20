// src/utils/timezone.ts
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

// Set up dayjs plugins
dayjs.extend(utc)
dayjs.extend(timezone)

// Storage key for user's timezone
const TIMEZONE_STORAGE_KEY = 'user_timezone'

/**
 * Default timezone to use if detection fails
 */
export const DEFAULT_TIMEZONE = 'Europe/Berlin'

/**
 * Get user's timezone from browser or localStorage
 * @returns The detected timezone or default (Europe/Berlin)
 */
export function getUserTimezone(): string {
	// Try to get from localStorage first (for persistence)
	if (typeof window !== 'undefined' && window.localStorage) {
		const savedTimezone = localStorage.getItem(TIMEZONE_STORAGE_KEY)
		if (savedTimezone) {
			return savedTimezone
		}
	}

	// Try to detect from browser
	try {
		const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
		if (detectedTimezone) {
			// Save for future use if localStorage is available
			if (typeof window !== 'undefined' && window.localStorage) {
				localStorage.setItem(TIMEZONE_STORAGE_KEY, detectedTimezone)
			}
			return detectedTimezone
		}
	} catch (e) {
		console.warn('Could not detect timezone:', e)
	}

	// Fall back to default
	return DEFAULT_TIMEZONE
}

/**
 * Save a specific timezone to localStorage
 * @param timezone The timezone to save
 */
export function setUserTimezone(timezone: string): void {
	if (typeof window !== 'undefined' && window.localStorage) {
		localStorage.setItem(TIMEZONE_STORAGE_KEY, timezone)
	}
}

/**
 * Convert UTC ISO string to user's local timezone
 * @param isoString ISO date string (in UTC)
 * @returns dayjs object in user's timezone
 */
export function toUserTimezone(isoString: string): dayjs.Dayjs {
	const timezone = getUserTimezone()
	return dayjs(isoString).tz(timezone)
}

/**
 * Convert a local time to UTC ISO string
 * @param date Local date object or string
 * @param hour Local hour
 * @param minute Local minute
 * @returns ISO string in UTC
 */
export function localTimeToUTC(date: string | Date, hour: number, minute: number): string {
	const timezone = getUserTimezone()
	return dayjs(date).tz(timezone).hour(hour).minute(minute).second(0).millisecond(0).toISOString()
}

/**
 * Format a date with the user's timezone
 * @param isoString ISO date string
 * @param format Format string for dayjs
 * @returns Formatted date string in user's timezone
 */
export function formatInUserTimezone(isoString: string, format: string = 'YYYY-MM-DD HH:mm'): string {
	return toUserTimezone(isoString).format(format)
}

/**
 * Get offset from UTC in hours:minutes format (+02:00)
 * @returns Timezone offset string
 */
export function getUserTimezoneOffset(): string {
	const timezone = getUserTimezone()
	const now = dayjs().tz(timezone)
	const offsetMinutes = now.utcOffset()

	const hours = Math.floor(Math.abs(offsetMinutes) / 60)
	const minutes = Math.abs(offsetMinutes) % 60

	const sign = offsetMinutes >= 0 ? '+' : '-'
	return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

/**
 * Get user-friendly timezone name
 * @returns Human-readable timezone name
 */
export function getUserTimezoneName(): string {
	const timezone = getUserTimezone()
	try {
		return (
			new Intl.DateTimeFormat('en', { timeZoneName: 'long', timeZone: timezone })
				.formatToParts(new Date())
				.find(part => part.type === 'timeZoneName')?.value || timezone
		)
	} catch (e) {
		return timezone
	}
}

/**
 * Check if a date is today in user's timezone
 * @param date Date to check
 * @returns Boolean indicating if date is today
 */
export function isToday(date: string | Date): boolean {
	const timezone = getUserTimezone()
	const today = dayjs().tz(timezone).format('YYYY-MM-DD')
	const checkDate = dayjs(date).tz(timezone).format('YYYY-MM-DD')
	return today === checkDate
}

/**
 * Debug function to log timezone information
 * @param dateTimeString Optional date/time string to convert
 */
export function debugTimezone(dateTimeString?: string): void {
	const userTz = getUserTimezone()
	const now = dayjs()
	const dateToConvert = dateTimeString ? dayjs(dateTimeString) : now

	console.group('Timezone Debug Info')
	console.log(`User timezone: ${userTz}`)
	console.log(`Timezone name: ${getUserTimezoneName()}`)
	console.log(`Offset from UTC: ${getUserTimezoneOffset()}`)
	console.log(`Current local time: ${now.tz(userTz).format('YYYY-MM-DD HH:mm:ss')}`)

	if (dateTimeString) {
		console.log(`Input time: ${dateTimeString}`)
		console.log(`As UTC: ${dateToConvert.utc().format('YYYY-MM-DD HH:mm:ss')}`)
		console.log(`In user timezone: ${dateToConvert.tz(userTz).format('YYYY-MM-DD HH:mm:ss')}`)
	}
	console.groupEnd()
}
