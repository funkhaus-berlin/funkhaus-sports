import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'

@customElement('date-selection-step')
export class DateSelectionStep extends $LitElement() {
	@property({ type: String })
	value?: string

	// Add a property to control whether the step is active
	@property({ type: Boolean })
	active = true

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
		// Use different classes based on active state
		const containerClasses = {
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'py-4': this.active,
			'py-2': !this.active,
		}

		return html`
			<div class=${this.classMap(containerClasses)}>
				<!-- Title - Only shown when active -->
				${this.active ? html`<h3 class="text-lg font-medium mb-4 px-4">Select Date</h3>` : ''}

				<!-- Dates Container - reduced padding when not active -->
				<schmancy-scroll hide>
					<div class=${this.active ? 'flex gap-2 pb-2 pl-4 pr-4' : 'flex gap-1 pb-1 pl-2 pr-2'}>
						${this.getNext14Days().map(date => {
							const isSelected = dayjs(this.value).isSame(dayjs(date), 'D')

							// Adjust size for compact mode
							const dateClasses = {
								'flex-none': true,
								flex: true,
								'flex-col': true,
								'items-center': true,
								'justify-center': true,
								'transition-colors': true,
								'cursor-pointer': true,
								'rounded-full': true,
								'bg-primary-default text-primary-on': isSelected,
								'bg-surface-high text-surface-on': !isSelected,
								relative: true,
								group: true,
								// Different sizes based on active state
								'w-16 py-3 px-1': this.active,
								'w-12 py-2 px-1': !this.active,
							}

							// State layer classes
							const stateLayerClasses = {
								'absolute inset-0 z-0 rounded-full transition-opacity duration-200': true,
								'opacity-0 hover:opacity-8 group-hover:opacity-8': true,
								'bg-primary-on': isSelected,
								'bg-primary-default': !isSelected,
							}

							// Different text sizes based on active state
							const dayClass = this.active ? 'text-sm font-medium' : 'text-xs font-medium'
							const dateClass = this.active ? 'text-xl font-bold' : 'text-lg font-bold'
							const monthClass = this.active ? 'text-xs mt-1' : 'text-xs'

							return html`
								<div class=${this.classMap(dateClasses)} @click=${() => this._handleDateClick(date)}>
									<!-- State layer for hover effects -->
									<div class=${this.classMap(stateLayerClasses)}></div>

									<!-- Date content with higher z-index -->
									<div class="relative z-10 pointer-events-none">
										<div class=${dayClass}>${dayjs(date).format('ddd')}</div>
										<div class=${dateClass}>${date.getDate()}</div>
										${this.active ? html`<div class=${monthClass}>${dayjs(date).format('MMM')}</div>` : ''}
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
