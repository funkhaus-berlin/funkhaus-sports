import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { CourtPreferences } from 'src/bookingServices/court-assignment.service'
import { Booking, bookingContext } from '../context'

// Context key for storing court preferences
const PREFERENCES_KEY = 'courtPreferences'

/**
 * Court preferences selection step
 * Allows users to set their preferences for court type, location, etc.
 */
@customElement('court-preferences-step')
export class CourtPreferencesStep extends $LitElement() {
	@property({ type: Object }) preferences: CourtPreferences = {}
	@property({ type: Boolean }) active: boolean = false
	@property({ type: Boolean }) hidden: boolean = false

	// Data binding to booking context
	@select(bookingContext) booking!: Booking

	// Local state for preferences
	@state() private localPreferences: CourtPreferences = {}

	connectedCallback() {
		super.connectedCallback()

		// Initialize local preferences from provided preferences or get from sessionStorage
		if (Object.keys(this.preferences).length > 0) {
			this.localPreferences = { ...this.preferences }
		} else {
			this.loadPreferencesFromStorage()
		}
	}

	protected firstUpdated(_changedProperties: PropertyValues) {
		super.firstUpdated(_changedProperties)

		// If we have preferences from the property, save them to storage
		if (Object.keys(this.preferences).length > 0) {
			this.savePreferencesToStorage(this.preferences)
		}
	}

	protected updated(changedProperties: PropertyValues) {
		super.updated(changedProperties)

		// If preferences property changes, update local state and storage
		if (
			changedProperties.has('preferences') &&
			JSON.stringify(this.preferences) !== JSON.stringify(changedProperties.get('preferences'))
		) {
			this.localPreferences = { ...this.preferences }
			this.savePreferencesToStorage(this.localPreferences)
		}
	}

	/**
	 * Load court preferences from session storage
	 */
	private loadPreferencesFromStorage() {
		try {
			const stored = sessionStorage.getItem(PREFERENCES_KEY)
			if (stored) {
				this.localPreferences = JSON.parse(stored)

				// Update the property if we loaded from storage
				if (
					Object.keys(this.localPreferences).length > 0 &&
					JSON.stringify(this.localPreferences) !== JSON.stringify(this.preferences)
				) {
					// We need to notify the parent component to sync the property
					this.dispatchEvent(
						new CustomEvent('change', {
							detail: this.localPreferences,
							bubbles: true,
						}),
					)
				}
			}
		} catch (error) {
			console.error('Error loading court preferences from storage:', error)
		}
	}

	/**
	 * Save court preferences to session storage
	 */
	private savePreferencesToStorage(preferences: CourtPreferences) {
		try {
			sessionStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
		} catch (error) {
			console.error('Error saving court preferences to storage:', error)
		}
	}

	// Event to notify parent when preferences change
	private updatePreferences(updates: Partial<CourtPreferences>) {
		const newPreferences = {
			...this.localPreferences,
			...updates,
		}

		// Update local state
		this.localPreferences = newPreferences

		// Save to storage
		this.savePreferencesToStorage(newPreferences)

		// Notify parent component
		this.dispatchEvent(
			new CustomEvent('change', {
				detail: newPreferences,
				bubbles: true,
			}),
		)
	}

	render() {
		if (this.hidden) return html``

		// Container classes based on active state
		const containerClasses = {
			'grid gap-3 px-2': true,
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'shadow-xs': true,
			'py-6': this.active,
			'py-3': !this.active,
		}

		// If not active, show compact view that remains interactive
		if (!this.active) {
			return html`
				<div class=${this.classMap(containerClasses)}>
					<div class="flex justify-between items-center">
						<schmancy-typography type="title" token="sm">Court Preferences</schmancy-typography>
						<div class="flex gap-2">
							<!-- Indoor option -->
							<div
								class="px-3 py-1 rounded-full cursor-pointer text-sm transition-colors
                  ${this.localPreferences.preferIndoor
									? 'bg-primary-default text-primary-on'
									: 'bg-surface-container text-surface-on hover:bg-surface-container-high'}"
								@click=${() =>
									this.updatePreferences({
										preferIndoor: !this.localPreferences.preferIndoor,
										preferOutdoor: false,
									})}
							>
								<span class="flex items-center">
									<schmancy-icon class="mr-1" size="16px">home</schmancy-icon>
									Indoor
								</span>
							</div>

							<!-- Outdoor option -->
							<div
								class="px-3 py-1 rounded-full cursor-pointer text-sm transition-colors
                  ${this.localPreferences.preferOutdoor
									? 'bg-primary-default text-primary-on'
									: 'bg-surface-container text-surface-on hover:bg-surface-container-high'}"
								@click=${() =>
									this.updatePreferences({
										preferOutdoor: !this.localPreferences.preferOutdoor,
										preferIndoor: false,
									})}
							>
								<span class="flex items-center">
									<schmancy-icon class="mr-1" size="16px">wb_sunny</schmancy-icon>
									Outdoor
								</span>
							</div>

							<!-- any option (selected by default) -->

							${!this.localPreferences.preferIndoor && !this.localPreferences.preferOutdoor
								? html`<div class="text-surface-on-variant text-sm flex items-center">No preference</div>`
								: ''}
						</div>
					</div>
				</div>
			`
		}

		return html`
			<div class=${this.classMap(containerClasses)}>
				<!-- Title and explanation -->
				<sch-flex>
					<schmancy-typography type="title" token="md"
						>Court Preferences <span class="text-small">(Non binding)</span>
					</schmancy-typography>
					<schmancy-typography type="label" token="sm">
						<span class="text-outline"> We will try to match your preferences based on availability </span>
					</schmancy-typography>
				</sch-flex>
				<!-- Court type preference -->
				<schmancy-surface type="containerLow" rounded="all" class="mb-4">
					<!-- Grid using golden ratio proportions -->
					<div class="grid grid-cols-2 gap-3">
						<!-- Indoor option with icon - using golden ratio for proportions -->
						<div
							class="flex items-center justify-center cursor-pointer h-16 rounded-xl transition-all
                ${this.localPreferences.preferIndoor
								? 'bg-primary-default text-primary-on shadow-xs'
								: 'bg-surface-container hover:bg-surface-container-high'}"
							@click=${() =>
								this.updatePreferences({
									preferIndoor: !this.localPreferences.preferIndoor,
									preferOutdoor: false,
								})}
						>
							<schmancy-icon class="mr-2" size="20px">home</schmancy-icon>
							<schmancy-typography>Indoor</schmancy-typography>
						</div>

						<!-- Outdoor option with icon - matching height and using golden ratio -->
						<div
							class="flex items-center justify-center cursor-pointer h-16 rounded-xl transition-all
                ${this.localPreferences.preferOutdoor
								? 'bg-primary-default text-primary-on shadow-xs'
								: 'bg-surface-container hover:bg-surface-container-high'}"
							@click=${() =>
								this.updatePreferences({
									preferOutdoor: !this.localPreferences.preferOutdoor,
									preferIndoor: false,
								})}
						>
							<schmancy-icon class="mr-2" size="20px">wb_sunny</schmancy-icon>
							<schmancy-typography>Outdoor</schmancy-typography>
						</div>
					</div>
				</schmancy-surface>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'court-preferences-step': CourtPreferencesStep
	}
}
