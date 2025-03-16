// src/models/availability.model.ts

/**
 * Interface representing a time slot's availability status
 */
export interface TimeSlotStatus {
	isAvailable: boolean
	bookedBy?: string | null
	bookingId?: string | null
	// Optional timestamp for when the slot was last updated
	updatedAt?: number
}

/**
 * Interface representing availability for a specific date
 */
export interface DateAvailability {
	slots: Record<string, TimeSlotStatus>
	// You can add additional metadata about the date here
	isHoliday?: boolean
	specialHours?: boolean
}

/**
 * Interface representing availability for a court
 */
export interface CourtAvailability {
	[date: string]: DateAvailability
}

/**
 * Interface representing availability for a month
 * This structure optimizes Firestore queries by grouping data by month
 */
export interface MonthlyAvailability {
	month: string // Format: YYYY-MM
	courts: {
		[courtId: string]: CourtAvailability
	}
	createdAt: number
	updatedAt: number
}

/**
 * Interface representing a court's operating hours
 */
export interface OperatingHours {
	[dayOfWeek: string]: {
		// 'monday', 'tuesday', etc.
		open: string // Format: HH:MM (24-hour)
		close: string // Format: HH:MM (24-hour)
	} | null // null means closed on this day
}

/**
 * Converts time string (HH:MM) to minutes from midnight
 */
export function timeToMinutes(timeString: string): number {
	const [hours, minutes] = timeString.split(':').map(Number)
	return hours * 60 + minutes
}

/**
 * Converts minutes from midnight to time string (HH:MM)
 */
export function minutesToTime(minutes: number): string {
	const hours = Math.floor(minutes / 60)
	const mins = minutes % 60
	return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Checks if a time is within operating hours
 */
export function isWithinOperatingHours(
	timeMinutes: number,
	dayOperatingHours: { open: string; close: string } | null,
): boolean {
	if (!dayOperatingHours) return false

	const openMinutes = timeToMinutes(dayOperatingHours.open)
	const closeMinutes = timeToMinutes(dayOperatingHours.close)

	return timeMinutes >= openMinutes && timeMinutes < closeMinutes
}
