// src/public/book/ErrorHandler.ts

/**
 * Centralized error handling for the booking process
 * Ensures consistent error messages and notifications
 */
export class BookingErrorHandler {
	private _error: string | null = null

	/**
	 * Get the current error message
	 */
	get error(): string | null {
		return this._error
	}

	/**
	 * Set an error with notification
	 */
	setError(message: string): void {
		this._error = message
	}

	/**
	 * Clear the current error
	 */
	clearError(): void {
		this._error = null
	}

	/**
	 * Convert API or Stripe errors to user-friendly messages
	 */
	getReadableErrorMessage(error: any): string {
		if (!error) return 'Something went wrong. Please try again.'

		// Stripe-specific error types
		if (error.type === 'card_error') {
			return error.message || 'Your card was declined. Please try another payment method.'
		}

		if (error.type === 'validation_error') {
			return error.message || 'Please check your card details and try again.'
		}

		// Network-related errors
		if (error.message?.includes('Network')) {
			return 'Network error. Please check your internet connection and try again.'
		}

		// Stripe API errors
		if (error.code === 'resource_missing') {
			return 'Payment not processed. Please try again.'
		}

		// Auth errors
		if (error.message?.includes('auth/')) {
			return 'Unable to authenticate. You can continue as a guest.'
		}

		// Court availability errors
		if (error.message?.includes('already booked') || error.message?.includes('No available courts')) {
			return error.message
		}

		// General error fallback
		return 'Something went wrong. Please try again.'
	}

	/**
	 * Handle validation errors from Stripe
	 */
	handleStripeValidationError(error: any): void {
		if (error.type === 'card_error' || error.type === 'validation_error') {
			this.setError(error.message || 'Card validation failed')
		} else {
			this.setError('Something went wrong with the payment form, please try again.')
		}
	}

	/**
	 * Handle court assignment errors
	 */
	handleCourtAssignmentError(error: any): string {
		console.error('Error assigning court:', error)
		const message = error.message || 'No available courts found for the selected time. Please try another time.'
		this.setError(message)
		return message
	}
}
