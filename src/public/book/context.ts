// src/public/book/context.ts

import { createContext } from '@mhmo91/schmancy'

export type BookingStatus =
	| 'pending'
	| 'confirmed'
	| 'cancelled'
	| 'completed'
	| 'no-show'
	| 'refunded'
	| 'failed'
	| 'processing'
// Error interfaces
export interface BookingErrorField {
	field: string
	message: string
}

export enum ErrorCategory {
	VALIDATION = 'validation',
	PAYMENT = 'payment',
	NETWORK = 'network',
	AVAILABILITY = 'availability',
	SYSTEM = 'system',
}

export interface BookingError {
	message: string
	category: ErrorCategory
	code?: string
	timestamp: number
	fieldErrors?: BookingErrorField[]
	isDismissible?: boolean
}

// Booking interface
export interface Booking {
	id: string
	userId: string
	userName: string
	courtId: string
	venueId: string
	startTime: string
	endTime: string
	price: number
	date: string
	paymentStatus?: string
	status: BookingStatus
	paymentIntentId?: string
	customerEmail?: string
	customerPhone: string
	customerAddress: {
		street: string
		city: string
		postalCode: string
		country: string
	}
	createdAt?: any
	updatedAt?: any
	emailSent?: boolean
	emailSentAt?: any
}

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
		},
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
