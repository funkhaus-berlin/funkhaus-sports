// court-selection-step.ts
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { Court } from 'src/db/courts.collection'
@customElement('court-selection-step')
export class CourtSelectionStep extends $LitElement() {
	static styles = css`
		.court-grid {
			display: grid;
			gap: 8px;
		}
	`

	@property({ type: Array }) courts: Court[] = []
	@property({ type: Object }) selectedCourt?: Court
	@property({ attribute: false }) onCourtSelected?: (court: Court) => void

	render() {
		return html`
			<schmancy-grid gap="md">
				<schmancy-typography type="title" token="sm">Select Court</schmancy-typography>

				<div class="court-grid">
					${this.courts.map(
						court => html`
							<schmancy-button
								variant=${this.selectedCourt?.id === court.id ? 'filled' : 'outlined'}
								@click=${() => this.dispatchEvent(new CustomEvent('change', { detail: court }))}
							>
								<schmancy-flex justify="between" align="center" class="w-full">
									<span>${court.name}</span>
									<schmancy-icon>sports_tennis</schmancy-icon>
								</schmancy-flex>
							</schmancy-button>
						`,
					)}
				</div>
			</schmancy-grid>
		`
	}
}
