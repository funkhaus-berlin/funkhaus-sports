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
