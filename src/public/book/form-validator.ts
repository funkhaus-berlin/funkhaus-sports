// src/public/book/FormValidator.ts

import { BookingErrorService } from './components/errors/booking-error-service'
import { ErrorMessageKey } from './components/errors/i18n/error-messages'
import { Booking, ErrorCategory } from './context'

/**
 * Validates form fields and manages form state
 */
export class FormValidator {
	private _formValidity: Record<string, boolean> = {}

	/**
	 * Get the current form validity state
	 */
	get formValidity(): Record<string, boolean> {
		return { ...this._formValidity }
	}

	/**
	 * Validate all required booking form fields
	 * @returns true if all fields are valid
	 */
	validateForm(booking: Booking): boolean {
		// Log the booking object for debugging
		console.log('Validating booking data:', JSON.stringify(booking, null, 2))

		const requiredFields = [
			{ key: 'userName', label: 'Name' },
			{ key: 'customerEmail', label: 'Email' },
			{ key: 'customerPhone', label: 'Phone number' },
			// { key: 'customerAddress.street', label: 'Street address' },
			{ key: 'customerAddress.postalCode', label: 'Postal code' },
			{ key: 'customerAddress.city', label: 'City' },
			{ key: 'customerAddress.country', label: 'Country' },
		]

		const bookingRequiredFields = [
			{ key: 'date', label: 'Booking date' },
			{ key: 'courtId', label: 'Court' },
			{ key: 'startTime', label: 'Start time' },
			{ key: 'endTime', label: 'End time' },
			{ key: 'price', label: 'Price' },
		]

		let isValid = true
		const newFormValidity: Record<string, boolean> = {}
		const missingFields: string[] = []

		// Check each required user information field
		for (const field of requiredFields) {
			// Handle nested properties like customerAddress.street
			let value
			if (field.key.includes('.')) {
				const [obj, prop] = field.key.split('.')

				if (obj === 'customerAddress' && booking.customerAddress) {
					value = booking.customerAddress[prop as keyof typeof booking.customerAddress]
				} else {
					value = undefined
				}
			} else {
				value = booking[field.key as keyof Booking]
			}

			const fieldValid = !!value && (typeof value === 'string' ? value.trim() !== '' : true)
			newFormValidity[field.key] = fieldValid

			if (!fieldValid) {
				missingFields.push(field.label)
				isValid = false
			}
		}

		// Check booking-specific required fields
		for (const field of bookingRequiredFields) {
			const value = booking[field.key as keyof Booking]
			const fieldValid =
				field.key === 'price'
					? typeof value === 'number' && value > 0
					: !!value && (typeof value === 'string' ? value.trim() !== '' : true)

			newFormValidity[field.key] = fieldValid

			if (!fieldValid) {
				// Only add to missing fields if it's a user input field
				// For system fields, we'll handle differently
				if (['date', 'courtId', 'startTime', 'endTime'].includes(field.key)) {
					console.error(`Missing required booking field: ${field.key}`)
					isValid = false

					// Show a different error for system fields using i18n
					BookingErrorService.setErrorI18n(
						ErrorMessageKey.VALIDATION_REQUIRED_FIELDS,
						ErrorCategory.VALIDATION,
						{ field: field.label },
						{ recoverySuggestionKey: ErrorMessageKey.RECOVERY_CHECK_INPUTS },
					)
					this._formValidity = newFormValidity
					return false
				}
			}
		}

		// Email format validation
		if (booking.customerEmail) {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
			const validEmailFormat = emailRegex.test(booking.customerEmail)
			newFormValidity.emailFormat = validEmailFormat

			if (!validEmailFormat) {
				BookingErrorService.setErrorI18n(
					ErrorMessageKey.VALIDATION_INVALID_EMAIL,
					ErrorCategory.VALIDATION,
					{},
					{ recoverySuggestionKey: ErrorMessageKey.RECOVERY_CHECK_INPUTS },
				)
				this._formValidity = newFormValidity
				return false
			}
		}

		// Phone validation
		if (booking.customerPhone) {
			const phoneValid = booking.customerPhone.trim().length >= 6
			newFormValidity.phoneValid = phoneValid

			if (!phoneValid) {
				BookingErrorService.setErrorI18n(
					ErrorMessageKey.VALIDATION_INVALID_PHONE,
					ErrorCategory.VALIDATION,
					{},
					{ recoverySuggestionKey: ErrorMessageKey.RECOVERY_CHECK_INPUTS },
				)
				this._formValidity = newFormValidity
				return false
			}
		}

		// Postal code validation
		if (booking.customerAddress?.postalCode) {
			const postalCodeValid = booking.customerAddress.postalCode.trim().length >= 3
			newFormValidity.postalCodeValid = postalCodeValid

			if (!postalCodeValid) {
				BookingErrorService.setError('Please enter a valid postal code.', ErrorCategory.VALIDATION, {
					recoverySuggestion: 'Check if your postal code is correct and try again.',
				})
				this._formValidity = newFormValidity
				return false
			}
		}

		// Update form validity state
		this._formValidity = newFormValidity

		// Show missing fields error if any
		if (!isValid && missingFields.length > 0) {
			// Use i18n error with field names
			BookingErrorService.setErrorI18n(
				ErrorMessageKey.VALIDATION_REQUIRED_FIELDS,
				ErrorCategory.VALIDATION,
				{ fields: missingFields.join(', ') },
				{ recoverySuggestionKey: ErrorMessageKey.RECOVERY_CHECK_INPUTS },
			)
		} else {
			BookingErrorService.clearError()
		}

		return isValid
	}

	/**
	 * Check if a specific field is valid
	 */
	isFieldValid(fieldName: string): boolean {
		return this._formValidity[fieldName] !== false
	}

	/**
	 * Reset form validation state
	 */
	resetValidation(): void {
		this._formValidity = {}
	}
}
