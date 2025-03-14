/**
 * Generates an availability record with 30-minute time slots.
 *
 * @param startMinutes - Start time in minutes from midnight (e.g., 480 for 8:00 AM)
 * @param endMinutes - End time in minutes from midnight (e.g., 1020 for 5:00 PM)
 * @param unavailableSlots - Optional array of slot times that should be marked as unavailable
 * @returns Record of time slots with availability status
 */
export function generateAvailability(
	startMinutes: number,
	endMinutes: number,
	unavailableSlots: number[] = [],
): Record<string, boolean> {
	const availability: Record<string, boolean> = {}

	// Generate slots in 30-minute increments
	for (let time = startMinutes; time < endMinutes; time += 30) {
		// Convert the slot to string format and set availability
		// Default is available (true) unless it's in the unavailableSlots array
		availability[time.toString()] = !unavailableSlots.includes(time)
	}

	return availability
}

// Helper functions for time conversion
export function timeToMinutes(hours: number, minutes: number = 0): number {
	return hours * 60 + minutes
}
