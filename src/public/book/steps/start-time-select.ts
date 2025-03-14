import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { TimeSlot } from '../types'

@customElement('time-selection-step')
export class TimeSelectionStep extends $LitElement() {
	@property({ type: Array }) slots: TimeSlot[] = []
	@property({ type: Number }) value?: number
	@property({ attribute: false }) onTimeSelected?: (time: number) => void

	private _handleTimeSelect(slot: TimeSlot) {
		if (!slot.available) return

		this.dispatchEvent(new CustomEvent('change', { detail: slot }))

		if (this.onTimeSelected) {
			this.onTimeSelected(slot.value)
		}
	}

	render() {
		return html`
			<div class="w-full max-w-full bg-surface-low py-4 rounded-lg">
				<!-- Title -->
				<schmancy-typography class="mb-4 px-4">
					<schmancy-typewriter> Select Time </schmancy-typewriter>
				</schmancy-typography>

				<div class="grid grid-cols-3 gap-4 px-4">
					${this.slots.map(slot => {
						const timeObj = dayjs().startOf('day').add(slot.value, 'minutes')
						const hourMin = timeObj.format('h:mm')
						const period = timeObj.format('A')

						const isAvailable = slot.available
						const isSelected = this.value === slot.value

						const timeClasses = {
							'flex-none': true,
							'py-3': true,
							'px-1': true,
							'rounded-xl': true,
							flex: true,
							'flex-col': true,
							'items-center': true,
							'justify-center': true,
							'transition-colors': true,
							'cursor-pointer': isAvailable,
							'cursor-not-allowed': !isAvailable,
							'bg-primary-default text-primary-on': isSelected && isAvailable,
							'bg-surface-high text-surface-on': !isSelected && isAvailable,
							'bg-gray-100 text-gray-400': !isAvailable,
							relative: true,
							group: isAvailable,
						}

						// State layer classes for hover effect
						const stateLayerClasses = {
							absolute: true,
							'inset-0': true,
							'z-0': true,
							'rounded-xl': true,
							'transition-opacity': true,
							'duration-200': true,
							'opacity-0': true,
							'hover:opacity-8 group-hover:opacity-8': isAvailable,
							'bg-primary-on': isSelected,
							'bg-primary-default': !isSelected,
						}

						return html`
							<div @click=${() => isAvailable && this._handleTimeSelect(slot)} class=${this.classMap(timeClasses)}>
								<!-- State layer for hover effects -->
								${isAvailable ? html`<div class=${this.classMap(stateLayerClasses)}></div>` : ''}

								<!-- Time content with higher z-index to stay above state layer -->
								<div class="relative z-10 pointer-events-none">
									<schmancy-typography> ${hourMin} </schmancy-typography>
									<schmancy-typography> ${period} </schmancy-typography>
								</div>
							</div>
						`
					})}
				</div>
			</div>
		`
	}
}
