// src/public/book/context.ts

import { createContext } from '@mhmo91/schmancy'
import type { BookingError } from '../../types/booking/errors'
import { Booking } from '../../types/booking/models'

// Export types directly from their source modules
export { ErrorCategory } from '../../types/booking/errors'
export type { BookingError, BookingErrorField } from '../../types/booking/errors'
export type { Booking, BookingStatus } from '../../types/booking/models'

// Create global context for booking information
export const bookingContext = createContext<Booking>(
	{
		id: '',
		userId: '',
		userName: '',
		courtId: '',
		startTime: '',
		status: 'pending',
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

	setError(error: BookingError): void {
		this.currentError = error

		// Update field errors if provided
		if (error.fieldErrors) {
			error.fieldErrors.forEach(fieldError => {
				this.fieldErrors[fieldError.field] = fieldError.message
			})
		}
	}

	clearError(): void {
		this.currentError = null
	}

	setFieldError(field: string, message: string): void {
		this.fieldErrors[field] = message
	}

	clearFieldError(field: string): void {
		delete this.fieldErrors[field]
	}

	clearAllFieldErrors(): void {
		this.fieldErrors = {}
	}

	hasFieldError(field: string): boolean {
		return !!this.fieldErrors[field]
	}

	getFieldError(field: string): string | undefined {
		return this.fieldErrors[field]
	}
}

export const BookingProgressContext = createContext<BookingProgress>(
	new BookingProgress(),
	'session',
	'bookingProgress',
)
