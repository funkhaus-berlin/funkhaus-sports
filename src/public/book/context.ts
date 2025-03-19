// context.ts
import { createContext } from '@mhmo91/schmancy'

export interface Booking {
	id: string
	userId: string
	userName: string
	courtId: string
	venueId: string // Add this new field
	startTime: string
	endTime: string
	price: number
	date: string
	paymentStatus?: string
	courtPreference?: 'indoor' | 'outdoor'
	status?: string
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
		customerPhone: '',
		customerAddress: {
			street: '',
			city: '',
			postalCode: '',
			country: '',
		},
		venueId: '', // Add this new field
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

export enum BookingStep {
	Date = 1,
	Court = 2, // New step
	Time = 3, // Shifted
	Preferences = 4, // Shifted
	Duration = 5, // Shifted
	Payment = 6, // Shifted
}
export class BookingProgress {
	currentStep: BookingStep = BookingStep.Date
	steps: Array<{
		step: BookingStep
		label: string
		icon: string
	}>

	// private bookingSteps = [
	// 	{ label: 'Date', icon: 'event' },
	// 	{ label: 'Court', icon: 'sports_tennis' },
	// 	{ label: 'Time', icon: 'schedule' },
	// 	{ label: 'Duration', icon: 'timelapse' },
	// 	{ label: 'Payment', icon: 'payment' },
	// ]

	constructor() {
		this.currentStep = BookingStep.Date
		this.steps = [
			{ step: BookingStep.Date, label: 'Date', icon: 'event' },
			{ step: BookingStep.Court, label: 'Court', icon: 'sports_tennis' }, // New step
			{ step: BookingStep.Time, label: 'Time', icon: 'schedule' },
			{ step: BookingStep.Preferences, label: 'Preferences', icon: 'settings' },
			{ step: BookingStep.Duration, label: 'Duration', icon: 'timer' },
			{ step: BookingStep.Payment, label: 'Payment', icon: 'payment' },
		]
	}
}
export const BookingProgressContext = createContext<BookingProgress>(
	new BookingProgress(),
	'session',
	'bookingProgress',
)
