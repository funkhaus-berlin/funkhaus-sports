// src/public/book/FormValidator.ts

import { Booking } from './context'
import { BookingErrorHandler } from './error-handler'

/**
 * Validates form fields and manages form state
 */
export class FormValidator {
	private errorHandler = new BookingErrorHandler()
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
		const requiredFields = [
			{ key: 'userName', label: 'Name' },
			{ key: 'customerEmail', label: 'Email' },
			{ key: 'customerPhone', label: 'Phone number' },
			{ key: 'customerAddress.street', label: 'Street address' },
			{ key: 'customerAddress.postalCode', label: 'Postal code' },
			{ key: 'customerAddress.city', label: 'City' },
			{ key: 'customerAddress.country', label: 'Country' },
		]

		let isValid = true
		const newFormValidity: Record<string, boolean> = {}
		const missingFields: string[] = []

		// Check each required field
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

		// Email format validation
		if (booking.customerEmail) {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
			const validEmailFormat = emailRegex.test(booking.customerEmail)
			newFormValidity.emailFormat = validEmailFormat

			if (!validEmailFormat) {
				this.errorHandler.setError('Please enter a valid email address.')
				this._formValidity = newFormValidity
				return false
			}
		}

		// Phone validation
		if (booking.customerPhone) {
			const phoneValid = booking.customerPhone.trim().length >= 6
			newFormValidity.phoneValid = phoneValid

			if (!phoneValid) {
				this.errorHandler.setError('Please enter a valid phone number.')
				this._formValidity = newFormValidity
				return false
			}
		}

		// Postal code validation
		if (booking.customerAddress?.postalCode) {
			const postalCodeValid = booking.customerAddress.postalCode.trim().length >= 3
			newFormValidity.postalCodeValid = postalCodeValid

			if (!postalCodeValid) {
				this.errorHandler.setError('Please enter a valid postal code.')
				this._formValidity = newFormValidity
				return false
			}
		}

		// Update form validity state
		this._formValidity = newFormValidity

		// Show missing fields error if any
		if (!isValid && missingFields.length > 0) {
			this.errorHandler.setError(`Please fill in the following required fields: ${missingFields.join(', ')}`)
		} else {
			this.errorHandler.clearError()
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
