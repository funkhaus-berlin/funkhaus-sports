// src/public/book/preferences-helper.ts

import { CourtPreferences } from 'src/bookingServices/court-assignment.service'

/**
 * Helper utilities for managing court preferences in the booking flow
 */
export class PreferencesHelper {
	/**
	 * Storage key for court preferences
	 */
	private static readonly STORAGE_KEY = 'courtPreferences'

	/**
	 * Get preferences from storage or URL parameters
	 *
	 * @returns Court preferences object
	 */
	static getPreferences(): CourtPreferences {
		// First try to get from URL
		const urlParams = new URLSearchParams(window.location.search)
		const preferIndoor = urlParams.get('indoor') === 'true'
		const preferOutdoor = urlParams.get('outdoor') === 'true'

		// Base preferences from URL
		let preferences: CourtPreferences = {
			preferIndoor,
			preferOutdoor,
		}

		// Try to get more detailed preferences from storage
		try {
			const storedPrefs = sessionStorage.getItem(this.STORAGE_KEY)
			if (storedPrefs) {
				const parsedPrefs = JSON.parse(storedPrefs)
				// Merge and prioritize stored preferences
				preferences = {
					...preferences,
					...parsedPrefs,
				}
			}
		} catch (e) {
			console.warn('Failed to parse stored preferences', e)
		}

		return preferences
	}

	/**
	 * Save preferences to session storage
	 *
	 * @param preferences Court preferences to save
	 */
	static savePreferences(preferences: CourtPreferences): void {
		try {
			sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(preferences))
		} catch (e) {
			console.warn('Failed to save preferences', e)
		}
	}

	/**
	 * Clear saved preferences
	 */
	static clearPreferences(): void {
		try {
			sessionStorage.removeItem(this.STORAGE_KEY)
		} catch (e) {
			console.warn('Failed to clear preferences', e)
		}
	}
}
