// src/public/book/booking-error-service.ts

import { $notify } from '@mhmo91/schmancy'
import { ErrorI18nService, ErrorMessageKey } from './i18n/error-i18n-service'
import { ErrorCategory, BookingErrorField, BookingError, BookingProgressContext } from '../../context'

/**
 * Service for handling errors in the booking flow
 * Works with BookingProgressContext to manage error state
 * Supports internationalization through ErrorI18nService
 */
export class BookingErrorService {
	/**
	 * Set an error with the specified category and optional metadata
	 * @param message - Error message
	 * @param category - Error category
	 * @param options - Additional options (code, field errors, etc.)
	 * @param showNotification - Whether to show a toast notification
	 */
	static setError(
		message: string,
		category: ErrorCategory = ErrorCategory.SYSTEM,
		options: {
			code?: string
			fieldErrors?: BookingErrorField[]
			isDismissible?: boolean
			recoverySuggestion?: string
		} = {},
		showNotification: boolean = false,
	): void {
		const error: BookingError = {
			message,
			category,
			timestamp: Date.now(),
			...options,
		}

		// Update the BookingProgressContext with this error
		BookingProgressContext.set({
			currentError: error,
		})

		// Add field errors if provided
		if (options.fieldErrors && options.fieldErrors.length > 0) {
			const fieldErrors: Record<string, string> = {}
			options.fieldErrors.forEach(fieldError => {
				fieldErrors[fieldError.field] = fieldError.message
			})

			BookingProgressContext.set(
				{
					fieldErrors,
				},
				true,
			) // Use true to merge with existing state
		}

		// Show notification if requested
		if (showNotification) {
			$notify.error(message)
		}

		// Log the error for debugging
		console.error(`[${category}] ${message}`, options)
	}

	/**
	 * Set an error with internationalization support
	 * @param messageKey - Error message key
	 * @param category - Error category
	 * @param params - Parameters for message formatting
	 * @param options - Additional options
	 * @param showNotification - Whether to show a toast notification
	 */
	static setErrorI18n(
		messageKey: ErrorMessageKey,
		category: ErrorCategory = ErrorCategory.SYSTEM,
		params: Record<string, string | number> = {},
		options: {
			code?: string
			fieldErrors?: BookingErrorField[]
			isDismissible?: boolean
			recoverySuggestionKey?: ErrorMessageKey
		} = {},
		showNotification: boolean = false,
	): void {
		// Get translated message
		const message = ErrorI18nService.formatMessage(messageKey, params)

		// Get translated recovery suggestion if provided
		let recoverySuggestion: string | undefined
		if (options.recoverySuggestionKey) {
			recoverySuggestion = ErrorI18nService.getMessage(options.recoverySuggestionKey)
		}

		// Call the base setError method with translated strings
		this.setError(
			message,
			category,
			{
				...options,
				recoverySuggestion,
			},
			showNotification,
		)
	}

	/**
	 * Set a validation error for a specific field
	 * @param field - Field name
	 * @param message - Error message
	 */
	static setFieldError(field: string, message: string): void {
		// Update the field errors in BookingProgressContext
		const fieldErrors = BookingProgressContext.value.fieldErrors || {}
		fieldErrors[field] = message

		BookingProgressContext.set(
			{
				fieldErrors,
			},
			true,
		) // Use true to merge with existing state

		// If no current error, set a generic validation error
		if (!BookingProgressContext.value.currentError) {
			this.setErrorI18n(
				ErrorMessageKey.VALIDATION_REQUIRED_FIELDS,
				ErrorCategory.VALIDATION,
				{},
				{
					fieldErrors: [{ field, message }],
					recoverySuggestionKey: ErrorMessageKey.RECOVERY_CHECK_INPUTS,
				},
			)
		}
	}

	/**
	 * Set multiple field errors at once
	 * @param errors - Record of field errors
	 */
	static setFieldErrors(errors: Record<string, string>): void {
		// Update field errors in BookingProgressContext
		BookingProgressContext.set(
			{
				fieldErrors: errors,
			},
			true,
		) // Use true to merge with existing state

		// Create field errors array for the main error
		const fieldErrors = Object.entries(errors).map(([field, message]) => ({
			field,
			message,
		}))

		// Set a generic validation error with i18n
		this.setErrorI18n(
			ErrorMessageKey.VALIDATION_REQUIRED_FIELDS,
			ErrorCategory.VALIDATION,
			{},
			{
				fieldErrors,
				recoverySuggestionKey: ErrorMessageKey.RECOVERY_CHECK_INPUTS,
			},
		)
	}

	/**
	 * Clear the current error
	 */
	static clearError(): void {
		BookingProgressContext.set({
			currentError: null,
		})
	}

	/**
	 * Clear a specific field error
	 * @param field - Field name
	 */
	static clearFieldError(field: string): void {
		const fieldErrors = { ...BookingProgressContext.value.fieldErrors }
		delete fieldErrors[field]

		BookingProgressContext.set({
			fieldErrors,
		})
	}

	/**
	 * Clear all field errors
	 */
	static clearAllFieldErrors(): void {
		BookingProgressContext.set({
			fieldErrors: {},
		})
	}

	/**
	 * Check if a field has an error
	 * @param field - Field name
	 */
	static hasFieldError(field: string): boolean {
		return !!BookingProgressContext.value.fieldErrors?.[field]
	}

	/**
	 * Get error message for a field
	 * @param field - Field name
	 */
	static getFieldError(field: string): string | undefined {
		return BookingProgressContext.value.fieldErrors?.[field]
	}

	/**
	 * Handle an API or client-side error with i18n support
	 * @param error - Error object
	 * @param showNotification - Whether to show a notification
	 */
	static handleErrorI18n(error: any, showNotification: boolean = true): void {
		let messageKey: ErrorMessageKey = ErrorMessageKey.SYSTEM_GENERAL
		let category = ErrorCategory.SYSTEM
		let fieldErrors: BookingErrorField[] = []
		let params: Record<string, string | number> = {}
		let recoverySuggestionKey: ErrorMessageKey | undefined

		// Map error types to appropriate message keys
		if (error.type === 'card_error') {
			category = ErrorCategory.PAYMENT

			if (error.code === 'card_declined') {
				messageKey = ErrorMessageKey.PAYMENT_DECLINED
				recoverySuggestionKey = ErrorMessageKey.RECOVERY_DIFFERENT_PAYMENT
			} else if (error.code === 'expired_card') {
				messageKey = ErrorMessageKey.PAYMENT_EXPIRED_CARD
				recoverySuggestionKey = ErrorMessageKey.RECOVERY_DIFFERENT_PAYMENT
			} else {
				messageKey = ErrorMessageKey.PAYMENT_PROCESSING_ERROR
				recoverySuggestionKey = ErrorMessageKey.RECOVERY_TRY_AGAIN
			}
		} else if (error.message?.includes('Network') || error.code === 'network_error') {
			category = ErrorCategory.NETWORK
			messageKey = ErrorMessageKey.NETWORK_CONNECTION
			recoverySuggestionKey = ErrorMessageKey.RECOVERY_CHECK_CONNECTION
		} else if (error.message?.includes('already booked')) {
			category = ErrorCategory.AVAILABILITY
			messageKey = ErrorMessageKey.AVAILABILITY_COURT_TAKEN
			recoverySuggestionKey = ErrorMessageKey.RECOVERY_DIFFERENT_TIME
		} else if (error.message?.includes('No available courts')) {
			category = ErrorCategory.AVAILABILITY
			messageKey = ErrorMessageKey.AVAILABILITY_NO_COURTS
			recoverySuggestionKey = ErrorMessageKey.RECOVERY_DIFFERENT_DATE
		} else if (error.validationErrors || error.errors) {
			category = ErrorCategory.VALIDATION
			messageKey = ErrorMessageKey.VALIDATION_REQUIRED_FIELDS
			recoverySuggestionKey = ErrorMessageKey.RECOVERY_CHECK_INPUTS

			// Extract validation errors
			const validationErrors = error.validationErrors || error.errors || {}
			fieldErrors = Object.entries(validationErrors).map(([field, value]) => ({
				field,
				message: typeof value === 'string' ? value : 'Invalid value',
			}))
		}

		// Set the error with i18n support
		this.setErrorI18n(
			messageKey,
			category,
			params,
			{
				fieldErrors,
				recoverySuggestionKey,
				code: error.code,
			},
			showNotification,
		)
	}

	/**
	 * Handle an API or client-side error
	 * Parses the error and sets appropriate error state
	 * @param error - Error object
	 * @param showNotification - Whether to show a notification
	 * @deprecated Use handleErrorI18n instead for better internationalization support
	 */
	static handleError(error: any, showNotification: boolean = true): void {
		// For backward compatibility, call the i18n version
		this.handleErrorI18n(error, showNotification)
	}

	/**
	 * Handle Stripe payment errors with i18n support
	 * @param error - Stripe error
	 * @param showNotification - Whether to show a notification
	 */
	static handleStripeErrorI18n(error: any, showNotification: boolean = true): void {
		if (error.type === 'card_error') {
			let messageKey = ErrorMessageKey.PAYMENT_PROCESSING_ERROR
			let recoverySuggestionKey = ErrorMessageKey.RECOVERY_DIFFERENT_PAYMENT

			if (error.code === 'card_declined') {
				messageKey = ErrorMessageKey.PAYMENT_DECLINED
			} else if (error.code === 'expired_card') {
				messageKey = ErrorMessageKey.PAYMENT_EXPIRED_CARD
			} else if (error.code === 'invalid_card') {
				messageKey = ErrorMessageKey.PAYMENT_INVALID_CARD
			}

			this.setErrorI18n(
				messageKey,
				ErrorCategory.PAYMENT,
				{},
				{
					code: error.code,
					recoverySuggestionKey,
				},
				showNotification,
			)
		} else {
			this.setErrorI18n(
				ErrorMessageKey.PAYMENT_PROCESSING_ERROR,
				ErrorCategory.PAYMENT,
				{},
				{
					code: 'payment_error',
					recoverySuggestionKey: ErrorMessageKey.RECOVERY_TRY_AGAIN,
				},
				showNotification,
			)
		}
	}

	/**
	 * Handle Stripe payment errors
	 * @param error - Stripe error
	 * @param showNotification - Whether to show a notification
	 * @deprecated Use handleStripeErrorI18n instead for better internationalization support
	 */
	static handleStripeError(error: any, showNotification: boolean = true): void {
		// For backward compatibility, call the i18n version
		this.handleStripeErrorI18n(error, showNotification)
	}

	/**
	 * Get appropriate error message key for an error
	 * @param error - Error object
	 */
	static getErrorMessageKey(error: any): ErrorMessageKey {
		if (!error) return ErrorMessageKey.SYSTEM_GENERAL

		// Stripe-specific error types
		if (error.type === 'card_error') {
			if (error.code === 'card_declined') {
				return ErrorMessageKey.PAYMENT_DECLINED
			} else if (error.code === 'expired_card') {
				return ErrorMessageKey.PAYMENT_EXPIRED_CARD
			} else {
				return ErrorMessageKey.PAYMENT_PROCESSING_ERROR
			}
		}

		// Network-related errors
		if (error.message?.includes('Network') || error.message?.includes('network') || error.code === 'network_error') {
			return ErrorMessageKey.NETWORK_CONNECTION
		}

		// Court availability errors
		if (error.message?.includes('already booked')) {
			return ErrorMessageKey.AVAILABILITY_COURT_TAKEN
		}

		if (error.message?.includes('No available courts')) {
			return ErrorMessageKey.AVAILABILITY_NO_COURTS
		}

		// Validation errors
		if (error.validationErrors || error.errors) {
			return ErrorMessageKey.VALIDATION_REQUIRED_FIELDS
		}

		// System error fallback
		return ErrorMessageKey.SYSTEM_GENERAL
	}

	/**
	 * Format error messages for different error types
	 * @param error - Error object
	 * @deprecated Use ErrorI18nService.getMessage with appropriate ErrorMessageKey instead
	 */
	static getReadableErrorMessage(error: any): string {
		// Get the appropriate error message key
		const messageKey = this.getErrorMessageKey(error)

		// Return the translated message
		return ErrorI18nService.getMessage(messageKey)
	}
}
