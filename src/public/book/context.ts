// src/public/book/context.ts

import { createContext } from '@mhmo91/schmancy'
import type { BookingError } from '../../types/booking/errors'
import { Booking } from '../../types/booking/booking.types'
import { BookingStatus } from 'src/types/booking/booking.types';

// Export types directly from their source modules
export { ErrorCategory } from '../../types/booking/errors'
export type { BookingError, BookingErrorField } from '../../types/booking/errors'
export type { Booking, BookingStatus } from '../../types/booking/booking.types'

// Create global context for booking information
export const bookingContext = createContext<Booking>(
	{
		id: '',
		userId: '',
		userName: '',
		courtId: '',
		startTime: '',
		status: 'holding' as BookingStatus, // Default status
		endTime: '',
		price: 0,
		date: '',
		customerPhone: '',
		customerAddress: {
			street: '',
			city: '',
			postalCode: '',
			country: '',
		} ,
		venueId: '',
	},
	'session',
	'booking',
)

// Simplified booking steps
export enum BookingStep {
	Date = 1,
	Time = 2,
	Duration = 3,
	Court = 4,
	Payment = 5,
}

export class BookingProgress {
	currentStep: number = 1 // Default to the first step
	maxStepReached: number = 1 // Track the furthest step reached in the flow
	expandedSteps: number[] = [1] // Track which steps are expanded/visible, initially just the first step

	steps = [
		{ step: BookingStep.Date, label: 'Date', icon: 'event' },
		{ step: BookingStep.Court, label: 'Court', icon: 'sports_tennis' },
		{ step: BookingStep.Time, label: 'Time', icon: 'schedule' },
		{ step: BookingStep.Duration, label: 'Duration', icon: 'timer' },
		{ step: BookingStep.Payment, label: 'Payment', icon: 'payment' },
	]

	currentError: BookingError | null = null
	fieldErrors: Record<string, string> = {}
}

export const BookingProgressContext = createContext<BookingProgress>(
	new BookingProgress(),
	'session',
	'bookingProgress',
)
