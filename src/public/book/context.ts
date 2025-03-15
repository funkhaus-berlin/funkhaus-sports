// context.ts
import { createContext } from '@mhmo91/schmancy'

export interface Booking {
	id: string
	userId: string
	userName: string
	courtId: string
	startTime: string
	endTime: string
	price: number
	date: string
	paymentStatus?: string
	status?: string
}

// Create global context for booking information
export const bookingContext = createContext<Booking>(
	{
		id: '',
		userId: '',
		userName: '',
		courtId: '',
		startTime: '',
		endTime: '',
		price: 0,
		date: '',
	},
	'session',
	'booking',
)

// types.ts
export interface TimeSlot {
	label: string
	value: number
	available: boolean
}

export interface Duration {
	label: string
	value: number // minutes
	price: number
}

export interface Court {
	id: string
	name: string
	available: boolean
	hourlyRate?: number
}

// utils.ts
/**
 * Generate availability data for time slots
 * @param startMinutes Start time in minutes (e.g., 480 = 8:00 AM)
 * @param endMinutes End time in minutes (e.g., 1320 = 10:00 PM)
 * @param unavailableSlots Array of unavailable time slots in minutes
 * @returns Record of time slots with availability status
 */
export function generateAvailability(
	startMinutes: number,
	endMinutes: number,
	unavailableSlots: number[] = [],
): Record<string, boolean> {
	const availability: Record<string, boolean> = {}

	// Generate time slots in 30-minute intervals
	for (let time = startMinutes; time <= endMinutes; time += 30) {
		availability[time.toString()] = !unavailableSlots.includes(time)
	}

	return availability
}

/**
 * Format minutes to HH:MM format
 * @param minutes Minutes since start of day
 * @returns Formatted time string
 */
export function formatMinutesToTime(minutes: number): string {
	const hours = Math.floor(minutes / 60)
	const mins = minutes % 60
	return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Parse time string to minutes
 * @param timeStr Time string in HH:MM format
 * @returns Minutes since start of day
 */
export function parseTimeToMinutes(timeStr: string): number {
	const [hours, minutes] = timeStr.split(':').map(Number)
	return hours * 60 + minutes
}

/**
 * Calculate price based on duration and hourly rate
 * @param durationMinutes Duration in minutes
 * @param hourlyRate Hourly rate
 * @returns Total price
 */
export function calculatePrice(durationMinutes: number, hourlyRate: number): number {
	return Math.round((durationMinutes / 60) * hourlyRate)
}

/**
 * Format price for display
 * @param price Price as number
 * @returns Formatted price string with currency
 */
export function formatPrice(price: number): string {
	return `$${price.toFixed(2)}`
}
