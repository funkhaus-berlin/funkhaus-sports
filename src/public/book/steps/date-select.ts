import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'

@customElement('date-selection-step')
export class DateSelectionStep extends $LitElement() {
	@property({ type: String })
	value?: string

	// Generate next 14 days for date selection
	private getNext14Days(): Date[] {
		return Array.from({ length: 14 }, (_, i) => {
			const date = new Date()
			date.setDate(date.getDate() + i)
			return date
		})
	}

	private _handleDateClick(date: Date) {
		this.value = date.toISOString()
		this.dispatchEvent(new CustomEvent('change', { detail: this.value }))
	}

	render() {
		return html`
			<div class="w-full max-w-full bg-surface-low py-4 rounded-lg">
				<!-- Title -->
				<h3 class="text-lg font-medium mb-4 px-4">Select Date</h3>

				<!-- Dates Container with horizontal scroll and left padding only -->
				<schmancy-scroll hide>
					<div class="flex gap-2 pb-2 pl-4 pr-4">
						${this.getNext14Days().map(date => {
							const isSelected = dayjs(this.value).isSame(dayjs(date), 'D') // default milliseconds

							const dateClasses = {
								'flex-none': true,
								'w-16': true,
								'py-3': true,
								'px-1': true,
								'rounded-full': true,
								flex: true,
								'flex-col': true,
								'items-center': true,
								'justify-center': true,
								'transition-colors': true,
								'cursor-pointer': true,
								'bg-primary-default text-primary-on': isSelected,
								'bg-surface-high text-surface-on': !isSelected,
								relative: true, // Added for absolute positioning of state layer
								group: true, // Added for group hover functionality
							}

							// State layer classes - similar to SchmancyButton implementation
							const stateLayerClasses = {
								'absolute inset-0 z-0 rounded-full transition-opacity duration-200': true,
								'opacity-0 hover:opacity-8 group-hover:opacity-8': true, // Start invisible, show on hover
								'bg-primary-on': isSelected, // Different hover color for selected state
								'bg-primary-default': !isSelected, // Default hover color
							}

							return html`
								<div class=${this.classMap(dateClasses)} @click=${() => this._handleDateClick(date)}>
									<!-- State layer for hover effects -->
									<div class=${this.classMap(stateLayerClasses)}></div>

									<!-- Date content with higher z-index to stay above state layer -->
									<!-- pointer-events-none allows hover events to pass through to parent -->
									<div class="relative z-10 pointer-events-none">
										<div class="text-sm font-medium">${dayjs(date).format('ddd')}</div>
										<div class="text-xl font-bold">${date.getDate()}</div>
										<div class="text-xs mt-1">${dayjs(date).format('MMM')}</div>
									</div>
								</div>
							`
						})}
					</div>
				</schmancy-scroll>
			</div>
		`
	}
}
