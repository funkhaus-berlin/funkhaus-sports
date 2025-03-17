import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { CourtPreferences } from 'src/bookingServices/court-assignment.service'

/**
 * Court preferences selection step
 * Allows users to set their preferences for court type, location, etc.
 */
@customElement('court-preferences-step')
export class CourtPreferencesStep extends $LitElement() {
	@property({ type: Object }) preferences: CourtPreferences = {}
	@property({ type: Boolean }) active: boolean = false
	@property({ type: Boolean }) hidden: boolean = false

	// Event to notify parent when preferences change
	private updatePreferences(updates: Partial<CourtPreferences>) {
		const newPreferences = {
			...this.preferences,
			...updates,
		}

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
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'shadow-sm': true,
			'py-6 px-4': this.active,
			'py-3 px-2': !this.active,
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
                  ${this.preferences.preferIndoor
									? 'bg-primary-default text-primary-on'
									: 'bg-surface-container text-surface-on hover:bg-surface-container-high'}"
								@click=${() =>
									this.updatePreferences({
										preferIndoor: !this.preferences.preferIndoor,
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
                  ${this.preferences.preferOutdoor
									? 'bg-primary-default text-primary-on'
									: 'bg-surface-container text-surface-on hover:bg-surface-container-high'}"
								@click=${() =>
									this.updatePreferences({
										preferOutdoor: !this.preferences.preferOutdoor,
										preferIndoor: false,
									})}
							>
								<span class="flex items-center">
									<schmancy-icon class="mr-1" size="16px">wb_sunny</schmancy-icon>
									Outdoor
								</span>
							</div>

							${!this.preferences.preferIndoor && !this.preferences.preferOutdoor
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
				<div class="mb-5">
					<schmancy-typography type="title" token="md" class="mb-2">Court Preferences</schmancy-typography>
					<schmancy-typography type="body" token="sm" class="text-surface-on-variant">
						Tell us what you prefer and we'll choose the best court for you
					</schmancy-typography>
				</div>

				<!-- Court type preference -->
				<schmancy-surface type="containerLow" rounded="all" class="p-4 mb-4">
					<schmancy-typography type="label" token="md" class="mb-3 block">
						Where would you like to play?
					</schmancy-typography>

					<!-- Grid using golden ratio proportions -->
					<div class="grid grid-cols-2 gap-3">
						<!-- Indoor option with icon - using golden ratio for proportions -->
						<div
							class="flex items-center justify-center cursor-pointer h-16 rounded-xl transition-all
                ${this.preferences.preferIndoor
								? 'bg-primary-default text-primary-on shadow-sm'
								: 'bg-surface-container hover:bg-surface-container-high'}"
							@click=${() =>
								this.updatePreferences({
									preferIndoor: !this.preferences.preferIndoor,
									preferOutdoor: false,
								})}
						>
							<schmancy-icon class="mr-2" size="20px">home</schmancy-icon>
							<schmancy-typography>Indoor</schmancy-typography>
						</div>

						<!-- Outdoor option with icon - matching height and using golden ratio -->
						<div
							class="flex items-center justify-center cursor-pointer h-16 rounded-xl transition-all
                ${this.preferences.preferOutdoor
								? 'bg-primary-default text-primary-on shadow-sm'
								: 'bg-surface-container hover:bg-surface-container-high'}"
							@click=${() =>
								this.updatePreferences({
									preferOutdoor: !this.preferences.preferOutdoor,
									preferIndoor: false,
								})}
						>
							<schmancy-icon class="mr-2" size="20px">wb_sunny</schmancy-icon>
							<schmancy-typography>Outdoor</schmancy-typography>
						</div>
					</div>
				</schmancy-surface>

				<!-- Navigation -->
				<div class="flex justify-end mt-6">
					<schmancy-button
						variant="filled"
						@click=${() => this.dispatchEvent(new CustomEvent('change', { detail: this.preferences }))}
					>
						Continue
					</schmancy-button>
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'court-preferences-step': CourtPreferencesStep
	}
}
