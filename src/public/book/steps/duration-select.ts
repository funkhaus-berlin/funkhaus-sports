import { LitElement, css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { Duration } from '../types'

// duration-selection-step.ts
@customElement('duration-selection-step')
export class DurationSelectionStep extends LitElement {
	static styles = css`
		.duration-grid {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 8px;
		}
	`

	@property({ type: Array }) durations: Duration[] = []
	@property({ type: Number }) selectedDuration!: number
	@property({ attribute: false }) onDurationSelected?: (duration: number) => void

	render() {
		return html`
			<schmancy-grid gap="md">
				<schmancy-typography type="title" token="sm">Select Duration</schmancy-typography>

				<div class="duration-grid">
					${this.durations.map(
						d => html`
							<schmancy-button
								variant=${this.selectedDuration === d.value ? 'filled' : 'outlined'}
								@click=${() => this.dispatchEvent(new CustomEvent('change', { detail: d }))}
							>
								<schmancy-flex flow="col" gap="sm">
									<schmancy-typography token="sm">${d.label}</schmancy-typography>
									<schmancy-typography token="sm">$${d.price}</schmancy-typography>
								</schmancy-flex>
							</schmancy-button>
						`,
					)}
				</div>
			</schmancy-grid>
		`
	}
}
