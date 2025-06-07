import { createContext } from '@mhmo91/schmancy'
import dayjs from 'dayjs'
import type { Booking } from '../../../types/booking/booking.types'

// Define default date range
export const DEFAULT_DATE_RANGE = {
	dateFrom: dayjs().subtract(1, 'month').startOf('day').toISOString(),
	dateTo: dayjs().add(1, 'month').endOf('day').toISOString(),
}

// Define booking filter interface
export interface TBookingFilter {
	dateFrom?: string
	dateTo?: string
	status?: string
	courts?: string[]
	search?: string
	user?: string
}

export const BookingsContext = createContext<Map<string, Booking>>(new Map(), 'indexeddb', 'bookings')

// Create context for all bookings (unfiltered) - used for counting
export const AllBookingsContext = createContext<Map<string, Booking>>(new Map(), 'memory', 'all-bookings')

// Create booking filter context
export const bookingFilterContext = createContext<TBookingFilter>(
	{
		dateFrom: DEFAULT_DATE_RANGE.dateFrom,
		dateTo: DEFAULT_DATE_RANGE.dateTo,
		status: 'all', // Default to showing all bookings including holding
		courts: [],
		search: '',
		user: '',
	},
	'local',
	'booking-filter',
)
