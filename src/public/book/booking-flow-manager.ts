// src/public/book/BookingFlowManager.ts

import dayjs from 'dayjs'
import { BehaviorSubject, Observable } from 'rxjs'
import { Booking, BookingStep } from './context'
import { CourtPreferences } from 'src/bookingServices/court-assignment.service'

/**
 * Steps in the booking process
 */
// Updated BookingStep enum in booking-flow-manager.ts

/**
 * Manages the booking flow, step navigation and validation
 */
export class BookingFlowManager {
	private _currentStep = new BehaviorSubject<BookingStep>(BookingStep.Date)

	/**
	 * Observable for the current step
	 */
	get currentStep$(): Observable<BookingStep> {
		return this._currentStep.asObservable()
	}

	/**
	 * Get the current step value
	 */
	get currentStep(): BookingStep {
		return this._currentStep.value
	}

	/**
	 * Set the current step
	 */
	set currentStep(step: BookingStep) {
		this._currentStep.next(step)
	}

	/**
	 * Navigate to a specific step with validation
	 * @param newStep Step to navigate to
	 * @param booking Current booking data
	 * @param courtPreferences Court preferences
	 * @param updateHistory Whether to update browser history
	 * @returns The actual step that was navigated to (after validation)
	 */
	navigateToStep(
		newStep: BookingStep,
		booking: Booking,
		courtPreferences: CourtPreferences,
		updateHistory: boolean = true,
	): BookingStep {
		// Validate that the step is valid based on current booking data
		newStep = this.validateStepTransition(newStep, booking, courtPreferences)

		// Update the current step
		this.currentStep = newStep

		// Update browser history if requested
		if (updateHistory) {
			this.updateHistoryState(newStep)
		}

		return newStep
	}

	/**
	 * Update browser history with the current step
	 */
	private updateHistoryState(step: BookingStep): void {
		const url = new URL(window.location.href)
		url.searchParams.set('step', step.toString())
		window.history.pushState({ step }, '', url.toString())
	}

	/**
	 * Validate step transition based on booking data
	 */
	private validateStepTransition(
		newStep: BookingStep,
		booking: Booking,
		courtPreferences: CourtPreferences,
	): BookingStep {
		// Don't allow navigating to steps that require previous data
		if (newStep > BookingStep.Date && !booking.date) {
			return BookingStep.Date
		}

		if (newStep > BookingStep.Time && !booking.startTime) {
			return BookingStep.Time
		}

		if (newStep > BookingStep.Preferences && Object.keys(courtPreferences).length === 0) {
			return BookingStep.Preferences
		}

		if (newStep > BookingStep.Duration && !booking.endTime) {
			return BookingStep.Duration
		}

		return newStep
	}

	/**
	 * Determine the appropriate step based on booking data
	 */
	determineCurrentStep(
		booking: Booking,
		courtPreferences: CourtPreferences,
		updateHistory: boolean = true,
	): BookingStep {
		let newStep: BookingStep

		// Logic to determine the appropriate step based on the booking context
		if (!booking.date) {
			newStep = BookingStep.Date
		} else if (!booking.startTime) {
			newStep = BookingStep.Time
		} else if (Object.keys(courtPreferences).length === 0) {
			newStep = BookingStep.Preferences
		} else if (!booking.endTime) {
			newStep = BookingStep.Duration
		} else {
			newStep = BookingStep.Payment
		}

		return this.navigateToStep(newStep, booking, courtPreferences, updateHistory)
	}

	/**
	 * Handle navigation through browser history API
	 */
	handleHistoryNavigation(event: PopStateEvent, booking: Booking, courtPreferences: CourtPreferences): void {
		// Get step from history state
		const historyStep = event.state?.step || BookingStep.Date

		if (historyStep && typeof historyStep === 'number') {
			// Update the step if a valid history state is available
			this.navigateToStep(historyStep, booking, courtPreferences, false)
		} else {
			// Fallback: Determine step based on booking data
			this.determineCurrentStep(booking, courtPreferences, false)
		}
	}

	/**
	 * Handle returning to the booking flow from payment
	 */
	handleReturnFromPayment(booking: Booking, bookingIdInUrl: string | null) {
		if (bookingIdInUrl && (!booking.date || !booking.startTime)) {
			// We're returning from payment but missing booking data
			// This could happen if the page was refreshed during payment
			// Set default values to ensure a valid state
			const today = dayjs()

			return {
				date: today.format('YYYY-MM-DD'),
				startTime: today.hour(10).minute(0).toISOString(),
				endTime: today.hour(11).minute(0).toISOString(),
				price: 30,
			}
		}

		return null
	}
}
