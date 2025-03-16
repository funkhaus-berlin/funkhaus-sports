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

	// Helper method to toggle a court type in preferences
	private toggleCourtType(type: string) {
		const currentTypes = this.preferences.preferredCourtTypes || []

		// If already selected, remove it, otherwise add it
		const newTypes = currentTypes.includes(type) ? currentTypes.filter(t => t !== type) : [...currentTypes, type]

		this.updatePreferences({
			preferredCourtTypes: newTypes,
		})
	}

	render() {
		if (this.hidden) return html``

		return html`
			<div class="bg-primary-container/20 p-6 rounded-xl mb-6">
				<schmancy-flex flow="col" gap="lg">
					<!-- Simple, friendly title with explanation -->
					<div class="text-center">
						<schmancy-typography type="title" token="md" class="mb-2">
							<schmancy-icon class="text-primary-default">thumb_up</schmancy-icon>
							Court Preferences
						</schmancy-typography>
						<schmancy-typography type="body" class="text-surface-on-variant">
							Tell us what you prefer and we'll choose the best court for you
						</schmancy-typography>
					</div>

					<!-- Simple indoor/outdoor choice with visual toggle -->
					<div class="flex justify-center">
						<div class="bg-surface-container p-4 rounded-2xl shadow-sm">
							<schmancy-typography type="label" token="md" class="mb-3 text-center block">
								Where would you like to play?
							</schmancy-typography>

							<div class="flex gap-4 justify-center">
								<!-- Indoor option with icon -->
								<div
									class="flex flex-col items-center cursor-pointer p-3 rounded-xl transition-all
                  ${this.preferences.preferIndoor
										? 'bg-primary-default text-primary-on shadow-md'
										: 'bg-surface-low hover:bg-surface-high'}"
									@click=${() =>
										this.updatePreferences({
											preferIndoor: !this.preferences.preferIndoor,
											preferOutdoor: false,
										})}
								>
									<schmancy-icon class="text-2xl mb-1">home</schmancy-icon>
									<schmancy-typography>Indoor</schmancy-typography>
								</div>

								<!-- Outdoor option with icon -->
								<div
									class="flex flex-col items-center cursor-pointer p-3 rounded-xl transition-all
                  ${this.preferences.preferOutdoor
										? 'bg-primary-default text-primary-on shadow-md'
										: 'bg-surface-low hover:bg-surface-high'}"
									@click=${() =>
										this.updatePreferences({
											preferOutdoor: !this.preferences.preferOutdoor,
											preferIndoor: false,
										})}
								>
									<schmancy-icon class="text-2xl mb-1">wb_sunny</schmancy-icon>
									<schmancy-typography>Outdoor</schmancy-typography>
								</div>

								<!-- No preference option -->
								<div
									class="flex flex-col items-center cursor-pointer p-3 rounded-xl transition-all
                  ${!this.preferences.preferIndoor && !this.preferences.preferOutdoor
										? 'bg-primary-default text-primary-on shadow-md'
										: 'bg-surface-low hover:bg-surface-high'}"
									@click=${() =>
										this.updatePreferences({
											preferIndoor: false,
											preferOutdoor: false,
										})}
								>
									<schmancy-icon class="text-2xl mb-1">shuffle</schmancy-icon>
									<schmancy-typography>No Preference</schmancy-typography>
								</div>
							</div>
						</div>
					</div>

					<!-- Simplified court surface selection -->
					<div>
						<schmancy-typography type="label" token="md" class="mb-3 block text-center">
							Court Surface (Optional)
						</schmancy-typography>

						<div class="flex flex-wrap gap-2 justify-center">
							${['Clay', 'Grass', 'Hard'].map(surface => {
								const value = surface.toLowerCase()
								const isSelected = (this.preferences.preferredCourtTypes || []).includes(value)

								return html`
									<div
										class="px-4 py-2 rounded-full cursor-pointer transition-all text-center
                    ${isSelected
											? 'bg-primary-default text-primary-on font-medium shadow-sm'
											: 'bg-surface-low hover:bg-surface-high'}"
										@click=${() => this.toggleCourtType(value)}
									>
										${surface}
									</div>
								`
							})}
						</div>
					</div>
				</schmancy-flex>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'court-preferences-step': CourtPreferencesStep
	}
}
