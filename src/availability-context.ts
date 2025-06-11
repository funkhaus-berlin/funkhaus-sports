// src/availability-context.ts

import { createContext } from '@mhmo91/schmancy'
import dayjs from 'dayjs'
import { Observable, of } from 'rxjs'
import { catchError, distinctUntilChanged, filter, map, shareReplay, switchMap, takeUntil, tap } from 'rxjs/operators'
import { BookingsDB } from 'src/db/bookings.collection'
import { BookingFlowConfig, BookingFlowType, StepLabel } from 'src/types/booking'
import { bookingContext } from './public/book/context'
import type { Booking } from './types/booking/booking.types'

// Updated BOOKING_FLOWS constant with the new structure
export const BOOKING_FLOWS: Record<string, BookingFlowConfig> = {
	[BookingFlowType.DATE_COURT_TIME_DURATION]: [
		{ step: 1, label: 'Date', icon: 'event' },
		{ step: 2, label: 'Court', icon: 'sports_tennis' },
		{ step: 3, label: 'Time', icon: 'schedule' },
		{ step: 4, label: 'Duration', icon: 'timer' },
		{ step: 5, label: 'Payment', icon: 'payment' },
	],
	[BookingFlowType.DATE_TIME_DURATION_COURT]: [
		{ step: 1, label: 'Date', icon: 'event' },
		{ step: 2, label: 'Time', icon: 'schedule' },
		{ step: 3, label: 'Duration', icon: 'timer' },
		{ step: 4, label: 'Court', icon: 'sports_tennis' },
		{ step: 5, label: 'Payment', icon: 'payment' },
	],
	[BookingFlowType.DATE_TIME_COURT_DURATION]: [
		{ step: 1, label: 'Date', icon: 'event' },
		{ step: 2, label: 'Time', icon: 'schedule' },
		{ step: 3, label: 'Court', icon: 'sports_tennis' },
		{ step: 4, label: 'Duration', icon: 'timer' },
		{ step: 5, label: 'Payment', icon: 'payment' },
	],
}

// Simplified AvailabilityData interface - only raw data from DB
export interface AvailabilityData {
	date: string // YYYY-MM-DD
	venueId: string
	bookings: Booking[] // Raw bookings from DB for this date/venue
	loading: boolean
	error: string | null
	bookingFlowType: BookingFlowType
}

// Default state updated
const defaultAvailability: AvailabilityData = {
	date: '',
	venueId: '',
	bookings: [],
	loading: false,
	error: null,
	bookingFlowType: BookingFlowType.DATE_COURT_TIME_DURATION,
}

// Helper functions for booking flow navigation
export function getNextStep(step: StepLabel): number {
	const steps = getBookingFlowSteps()
	const currentStepIndex = steps.findIndex(s => s.label === step)
	return currentStepIndex < steps.length - 1 ? steps[currentStepIndex + 1].step : -1
}

export function getBookingFlowSteps(): BookingFlowConfig {
	const flowType = availabilityContext.value.bookingFlowType
	if (!flowType) {
		console.warn('bookingFlowType is undefined in availabilityContext', availabilityContext.value)
		return BOOKING_FLOWS[BookingFlowType.DATE_COURT_TIME_DURATION]
	}
	const flow = BOOKING_FLOWS[flowType]
	if (!flow) {
		console.warn('No flow found for bookingFlowType:', flowType)
		return BOOKING_FLOWS[BookingFlowType.DATE_COURT_TIME_DURATION]
	}
	return flow
}

// Create the context
export const availabilityContext = createContext<AvailabilityData>(defaultAvailability, 'session', 'availability')

// Export loading state as observable
export const availabilityLoading$ = availabilityContext.$.pipe(
	map(data => data.loading),
	distinctUntilChanged(),
	shareReplay(1)
)

// Export error state as observable
export const availabilityError$ = availabilityContext.$.pipe(
	map(data => data.error),
	distinctUntilChanged(),
	shareReplay(1)
)


/**
 * Initialize the availability context and set up subscriptions
 * @param destroySignal$ Observable that emits when the context should be destroyed
 */
export function initializeAvailabilityContext(destroySignal$: Observable<any>): void {
	// Subscribe to date and venue changes from booking context
	const bookingChanges$ = bookingContext.$.pipe(
		map(booking => ({ date: booking.date, venueId: booking.venueId })),
		filter(({ date, venueId }) => !!date && !!venueId),
		distinctUntilChanged((prev, curr) => 
			prev.date === curr.date && 
			prev.venueId === curr.venueId
		),
		shareReplay(1),
	)

	// Main data stream - only fetch bookings from DB
	bookingChanges$.pipe(
		// Set loading state
		tap(() => {
			availabilityContext.set({ ...availabilityContext.value, loading: true, error: null }, true)
		}),
		// Fetch bookings for the selected date and venue
		switchMap(({ date, venueId }) => {
			return BookingsDB.subscribeToCollection([
				{ key: 'date', operator: '==', value: dayjs(date).format('YYYY-MM-DD') },
				{ key: 'status', operator: 'in', value: ['confirmed', 'holding'] },
				{ key: 'venueId', operator: '==', value: venueId },
			]).pipe(
				map(bookingsMap => Array.from(bookingsMap.values())),
				map(bookings => ({
					date,
					venueId,
					bookings,
					bookingFlowType: BookingFlowType.DATE_COURT_TIME_DURATION, // TODO: Get from venue settings
					loading: false,
					error: null,
				}))
			)
		}),
		// Handle errors
		catchError(err => {
			console.error('Error loading bookings:', err)
			availabilityContext.set({
				...availabilityContext.value,
				loading: false,
				error: 'Failed to load bookings',
			}, true)
			return of(availabilityContext.value)
		}),
		// Complete until destroy signal
		takeUntil(destroySignal$)
	).subscribe(availabilityData => {
		availabilityContext.set(availabilityData)
	})
}
