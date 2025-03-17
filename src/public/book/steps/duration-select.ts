import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { Duration } from '../types'

@customElement('duration-selection-step')
export class DurationSelectionStep extends $LitElement() {
	@property({ type: Number }) selectedDuration!: number
	@property({ type: Boolean }) active = true
	@property({ type: Boolean }) hidden = false
	@state() recommendedDuration: number = 60 // Default to 1 hour as recommended

	// Common durations for booking
	private durations: Duration[] = [
		{ label: '30 min', value: 30, price: 15 },
		{ label: '1 hour', value: 60, price: 30 },
		{ label: '1.5 hours', value: 90, price: 45 },
		{ label: '2 hours', value: 120, price: 60 },
	]

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
						<schmancy-typography type="title" token="sm">Duration</schmancy-typography>
						<div class="flex gap-2">
							${this.durations.map(duration => {
								const isSelected = this.selectedDuration === duration.value

								return html`
									<div
										class="px-3 py-1 rounded-full cursor-pointer text-sm transition-colors flex items-center
                      ${isSelected
											? 'bg-primary-default text-primary-on'
											: 'bg-surface-container text-surface-on hover:bg-surface-container-high'}"
										@click=${() => this.dispatchEvent(new CustomEvent('change', { detail: duration }))}
									>
										${duration.label}
										${isSelected ? html`<schmancy-icon class="ml-1" size="16px">check</schmancy-icon>` : ''}
									</div>
								`
							})}
						</div>
					</div>
				</div>
			`
		}

		return html`
			<div class=${this.classMap(containerClasses)}>
				<!-- Title section -->
				<div class="mb-5">
					<schmancy-typography type="title" token="md" class="mb-2">Select Duration</schmancy-typography>
					<schmancy-typography type="body" token="sm" class="text-surface-on-variant">
						Choose how long you'd like to play
					</schmancy-typography>
				</div>

				<!-- Duration options - Using golden ratio for better proportions -->
				<div class="grid grid-cols-2 gap-3">
					${this.durations.map(duration => {
						const isSelected = this.selectedDuration === duration.value
						const isPopular = this.recommendedDuration === duration.value

						// Golden ratio calculations (approximately 1:1.618)
						// Base height around 80px (for standard card height)
						// Width is then roughly 1.618 times the height for each card
						// We'll use proper tailwind classes for padding/margins with golden ratio proportions

						// Card classes with improved styling using golden ratio
						const cardClasses = {
							relative: true,
							'overflow-hidden': true,
							flex: true,
							'flex-col': true,
							'items-center': true,
							'justify-center': true,
							'py-3': true, // Golden ratio based padding
							'px-2': true,
							'h-20': true, // Base height (80px)
							'rounded-xl': true,
							'transition-all': true,
							'duration-200': true,
							'cursor-pointer': true,
							'hover:shadow-md': true,
							'hover:translate-y-[-2px]': true,
							'bg-primary-default text-primary-on': isSelected,
							'bg-surface-container text-surface-on': !isSelected,
							'shadow-sm': isSelected,
							group: true,
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

								<!-- Popular badge if applicable - adjusted size -->
								${isPopular
									? html`
											<div
												class="absolute top-0 right-0 bg-secondary-default text-secondary-on text-xs font-bold py-0.5 px-1.5 rounded-bl-lg rounded-tr-xl z-10"
											>
												POPULAR
											</div>
									  `
									: ''}

								<!-- Duration content - adjusted spacing using golden ratio approximations -->
								<div class="relative z-10 flex flex-col items-center pointer-events-none">
									<schmancy-typography type="title" token="md" weight=${isSelected ? 'bold' : 'normal'} class="mb-1">
										${duration.label}
									</schmancy-typography>

									<schmancy-typography
										type="headline"
										token="sm"
										class="font-bold ${isSelected ? 'text-primary-on' : 'text-primary-default'}"
									>
										€${duration.price}
									</schmancy-typography>

									${isSelected ? html`<schmancy-icon class="mt-1" size="18px">check_circle</schmancy-icon>` : ''}
								</div>
							</div>
						`
					})}
				</div>

				<!-- Hint text -->
				<div class="mt-4 text-center text-surface-on-variant text-sm">
					<p>All prices include VAT</p>
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'duration-selection-step': DurationSelectionStep
	}
}
