// src/bookingServices/pricing.service.ts
import dayjs from 'dayjs'
import { Court } from 'src/db/courts.collection'

/**
 * Service for calculating prices based on court pricing structure
 */
export class PricingService {
	/**
	 * Calculate the price for a booking
	 */
	calculatePrice(court: Court, startTime: string, endTime: string, userId?: string): number {
		// Get court pricing or use default
		const pricing = court.pricing || { baseHourlyRate: 30 }

		// Calculate duration in hours
		const start = dayjs(startTime)
		const end = dayjs(endTime)
		const durationHours = end.diff(start, 'minute') / 60

		// Base rate calculation
		let rate = pricing.baseHourlyRate

		// Get day of week (0 = Sunday, 6 = Saturday)
		const dayOfWeek = start.day()
		const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

		// Apply weekend pricing if applicable
		if (isWeekend && pricing.weekendRate) {
			rate = pricing.weekendRate
		} else {
			// Check for peak hour pricing
			if (this.isPeakHour(start) && pricing.peakHourRate) {
				rate = pricing.peakHourRate
			}

			// Check for special rates
			const specialRate = this.getApplicableSpecialRate(pricing, start, dayOfWeek)
			if (specialRate) {
				rate = specialRate.rate
			}
		}

		// Calculate total price
		let totalPrice = rate * durationHours

		// Apply member discount if applicable
		if (userId && pricing.memberDiscount) {
			totalPrice -= totalPrice * (pricing.memberDiscount / 100)
		}

		// Round to 2 decimal places and ensure minimum price
		return Math.max(Math.round((totalPrice + Number.EPSILON) * 100) / 100, 1)
	}

	/**
	 * Calculate prices for all standard durations
	 */
	getStandardDurationPrices(
		court: Court,
		startTime: string,
		userId?: string,
	): {
		label: string
		value: number
		price: number
	}[] {
		const durations = [
			{ label: '30m', value: 30 },
			{ label: '1h', value: 60 },
			{ label: '1.5h', value: 90 },
			{ label: '2h', value: 120 },
			{ label: '2.5h', value: 150 },
			{ label: '3h', value: 180 },
		]

		return durations.map(duration => {
			// Calculate end time for this duration
			const start = dayjs(startTime)
			const end = start.add(duration.value, 'minute')

			// Calculate price
			const price = this.calculatePrice(court, start.toISOString(), end.toISOString(), userId)

			return {
				...duration,
				price,
			}
		})
	}

	/**
	 * Check if a given time is during peak hours
	 * Default peak hours are 5 PM - 9 PM weekdays
	 */
	private isPeakHour(time: dayjs.Dayjs): boolean {
		const hour = time.hour()
		const dayOfWeek = time.day()

		// No peak hours on weekends
		if (dayOfWeek === 0 || dayOfWeek === 6) {
			return false
		}

		// Default peak hours: 5 PM - 9 PM (17:00 - 21:00)
		return hour >= 17 && hour < 21
	}

	/**
	 * Check for any special rates that apply to the given time
	 */
	private getApplicableSpecialRate(
		pricing: Court['pricing'],
		time: dayjs.Dayjs,
		dayOfWeek: number,
	): { name: string; rate: number } | null {
		if (!pricing.specialRates) {
			return null
		}

		// Convert day of week to string
		const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
		const dayName = dayNames[dayOfWeek]

		// Check each special rate
		for (const [_key, specialRate] of Object.entries(pricing.specialRates)) {
			// Skip if days are specified and current day isn't included
			if (specialRate.applyDays && !specialRate.applyDays.includes(dayName)) {
				continue
			}

			// Check time range if specified
			if (specialRate.startTime && specialRate.endTime) {
				const hour = time.hour()
				const minute = time.minute()
				const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`

				// Skip if outside time range
				if (timeString < specialRate.startTime || timeString >= specialRate.endTime) {
					continue
				}
			}

			// This special rate applies
			return {
				name: specialRate.name,
				rate: specialRate.rate,
			}
		}

		return null
	}
}

// Export a singleton instance
export const pricingService = new PricingService()
