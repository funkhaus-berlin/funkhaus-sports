import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { TimeSlot } from '../types'

// time-selection-step.ts
@customElement('time-selection-step')
export class TimeSelectionStep extends $LitElement() {
	static styles = css`
		.time-grid {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 8px;
			max-height: 300px;
			overflow-y: auto;
		}
	`

	@property({ type: Array }) slots: TimeSlot[] = []
	@property({ type: Number }) selectedTime?: number
	@property({ attribute: false }) onTimeSelected?: (time: number) => void

	render() {
		return html`
			<schmancy-grid gap="md">
				<schmancy-typography type="title" token="sm">Select Time</schmancy-typography>

				<div class="time-grid">
					${this.slots.map(
						slot => html`
							<schmancy-button
								variant=${this.selectedTime === slot.value ? 'filled' : 'outlined'}
								.disabled=${!slot.available}
								@click=${() => this.dispatchEvent(new CustomEvent('change', { detail: slot }))}
							>
								${dayjs().startOf('day').add(slot.value, 'minutes').format('h:mm A')}
							</schmancy-button>
						`,
					)}
				</div>
			</schmancy-grid>
		`
	}
}
