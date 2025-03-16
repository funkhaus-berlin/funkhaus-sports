import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { Duration } from '../types'

@customElement('duration-selection-step')
export class DurationSelectionStep extends $LitElement() {
	@property({ type: Number }) selectedDuration!: number
	@state() recommendedDuration: number = 60 // Default to 1 hour as recommended

	// Common durations for booking
	private durations: Duration[] = [
		{ label: '30 min', value: 30, price: 15 },
		{ label: '1 hour', value: 60, price: 30 },
		{ label: '1.5 hours', value: 90, price: 45 },
		{ label: '2 hours', value: 120, price: 60 },
	]
	render() {
		return html`
			<schmancy-surface type="containerLow" rounded="all">
				<!-- Title -->
				<schmancy-typography class="py-4 px-4 pt">
					<schmancy-typewriter> Select Duration </schmancy-typewriter>
				</schmancy-typography>

				<div class="grid grid-cols-2 gap-4 px-4">
					${this.durations.map(duration => {
						const isSelected = this.selectedDuration === duration.value
						const isPopular = this.recommendedDuration === duration.value
						// const hourRate = duration.price / (duration.value / 60)
						// const showSavings = duration.value > 30

						const cardClasses = {
							'flex-none': true,
							'p-4': true,
							'rounded-xl': true,
							flex: true,
							'flex-col': true,
							'items-center': true,
							'justify-center': true,
							'transition-all': true,
							'duration-200': true,
							'cursor-pointer': true,
							'hover:shadow-md': true,
							'hover:translate-y-[-2px]': true,
							'bg-primary-default text-primary-on': isSelected,
							'bg-surface-high text-surface-on': !isSelected,
							relative: true,
							group: true,
							'overflow-hidden': true,
						}

						// State layer classes for hover effect (matching time-selection-step)
						const stateLayerClasses = {
							absolute: true,
							'inset-0': true,
							'z-0': true,
							'rounded-xl': true,
							'transition-opacity': true,
							'duration-200': true,
							'opacity-0': true,
							'group-hover:opacity-8': true,
							'bg-primary-on': isSelected,
							'bg-primary-default': !isSelected,
						}

						return html`
							<div
								@click=${() => this.dispatchEvent(new CustomEvent('change', { detail: duration }))}
								class=${this.classMap(cardClasses)}
							>
								<!-- State layer for hover effects -->
								<div class=${this.classMap(stateLayerClasses)}></div>

								<!-- Popular badge -->
								${isPopular
									? html`
											<div
												class="absolute top-0 right-0 bg-secondary-default text-secondary-on text-xs font-bold py-1 px-2 rounded-bl-lg rounded-tr-xl z-10"
											>
												POPULAR
											</div>
									  `
									: ''}

								<!-- Duration content with higher z-index -->
								<div class="relative z-10 flex flex-col items-center gap-2 pointer-events-none">
									<schmancy-typography type="headline" token="md" weight=${isSelected ? 'bold' : 'normal'}>
										${duration.label}
									</schmancy-typography>

									<schmancy-typography
										type="title"
										token="lg"
										class="font-bold ${isSelected ? 'text-primary-on' : 'text-primary-default'}"
									>
										$${duration.price}
									</schmancy-typography>

									${isSelected ? html` <schmancy-icon class="mt-1">check_circle</schmancy-icon> ` : ''}
								</div>
							</div>
						`
					})}
				</div>
			</schmancy-surface>
		`
	}
}
