import dayjs from 'dayjs'

/**
 * Convert minutes since midnight to HH:00 or HH:30 format
 * Examples:
 * - 510 minutes (8:30am) -> "08:30"
 * - 1140 minutes (7:00pm) -> "19:00"
 *
 * @param minutes - Minutes since midnight
 * @returns Time string in HH:MM format where MM is either 00 or 30
 */
export function minutesToTimeSlot(minutes: number): string {
	const hours = Math.floor(minutes / 60)
	const mins = minutes % 60

	// Round to nearest half hour for compatibility with backend
	const roundedMins = mins < 15 ? '00' : mins < 45 ? '30' : '00'
	const roundedHours = mins >= 45 ? hours + 1 : hours

	return `${roundedHours.toString().padStart(2, '0')}:${roundedMins}`
}

/**
 * Convert HH:MM format to minutes since midnight
 * Examples:
 * - "08:30" -> 510 (8.5 * 60)
 * - "19:00" -> 1140 (19 * 60)
 *
 * @param timeSlot - Time string in HH:MM format
 * @returns Minutes since midnight
 */
export function timeSlotToMinutes(timeSlot: string): number {
	const [hours, minutes] = timeSlot.split(':').map(Number)
	return hours * 60 + minutes
}

/**
 * Generate an array of time slots between start and end time
 *
 * @param startTimeMinutes - Start time in minutes
 * @param endTimeMinutes - End time in minutes
 * @param intervalMinutes - Interval between slots in minutes (default: 30)
 * @returns Array of time slots in HH:MM format
 */
export function generateTimeSlots(
	startTimeMinutes: number,
	endTimeMinutes: number,
	intervalMinutes: number = 30,
): string[] {
	const slots = []

	for (let time = startTimeMinutes; time < endTimeMinutes; time += intervalMinutes) {
		slots.push(minutesToTimeSlot(time))
	}

	return slots
}

/**
 * Format a date object or string to YYYY-MM-DD
 *
 * @param date - Date object or string
 * @returns Formatted date string
 */
export function formatDate(date: string | Date): string {
	if (!date) return ''

	return dayjs(date).format('YYYY-MM-DD')
}

/**
 * Check if two time slots overlap
 *
 * @param start1 - Start time of first slot in minutes
 * @param end1 - End time of first slot in minutes
 * @param start2 - Start time of second slot in minutes
 * @param end2 - End time of second slot in minutes
 * @returns True if slots overlap, false otherwise
 */
export function doTimeSlotsOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
	return start1 < end2 && end1 > start2
}
