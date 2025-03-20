import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import padelSVG from '/public/svg/padel-court.svg?raw'
import pickleballSVG from '/public/svg/pickleball-court.svg?raw'
import volleyballSVG from '/public/svg/volleyball-court.svg?raw'
/**
 * A simplified component to display a sport court using Tailwind for styling
 * With redesigned SVGs using CSS variables for theming
 */
@customElement('sport-court-card')
export class SportCourtCard extends $LitElement(css`
	:host {
		display: block;
	}
`) {
	/**
	 * Court ID
	 */
	@property({ type: String })
	id: string = ''

	/**
	 * Court name
	 */
	@property({ type: String })
	name: string = ''

	/**
	 * Court type
	 */
	@property({ type: String })
	type: 'padel' | 'pickleball' | 'volleyball' = 'volleyball'

	/**
	 * Whether this court is selected
	 */
	@property({ type: Boolean })
	selected: boolean = false

	/**
	 * Whether the court is disabled (unavailable)
	 */
	@property({ type: Boolean })
	disabled: boolean = false

	/**
	 * Whether to display in compact mode
	 */
	@property({ type: Boolean })
	compact: boolean = false

	/**
	 * Get SVG content for the specified court type
	 */
	private getCourtSVG(type: string): string {
		// Return the appropriate SVG based on court type
		switch (type.toLowerCase()) {
			case 'padel':
				return padelSVG
			case 'volleyball':
				return volleyballSVG
			case 'pickleball':
			default:
				return pickleballSVG
		}
	}

	/**
	 * Handle court click
	 */
	private handleClick() {
		if (!this.disabled) {
			this.dispatchEvent(
				new CustomEvent('court-click', {
					detail: {
						id: this.id,
						type: this.type,
						name: this.name,
					},
					bubbles: true,
					composed: true,
				}),
			)
		}
	}

	/**
	 * Get court aspect ratio classes based on court type
	 * Different court types have different aspect ratios
	 */
	private getCourtAspectRatio(): { width: string; height: string } {
		// Define aspect ratios for different court types to maintain proper dimensions
		switch (this.type) {
			case 'padel':
				// Padel courts are more rectangular (longer)
				return {
					width: this.compact ? 'w-32' : 'w-40',
					height: this.compact ? 'h-24' : 'h-32',
				}
			case 'volleyball':
				// Volleyball courts are more square
				return {
					width: this.compact ? 'w-32' : 'w-40',
					height: this.compact ? 'h-24' : 'h-32',
				}
			case 'pickleball':
			default:
				// Pickleball courts have a standard ratio
				return {
					width: this.compact ? 'w-32' : 'w-40',
					height: this.compact ? 'h-24' : 'h-32',
				}
		}
	}

	/**
	 * Calculate scale value based on view mode
	 */
	private getScaleStyle(): string {
		if (this.compact) {
			return 'transform: scale(0.85); transform-origin: center;'
		}
		return ''
	}

	render() {
		// Get court display name (fallback to capitalized type if no name provided)
		const courtName = this.name || `${this.type.charAt(0).toUpperCase() + this.type.slice(1)} Court`

		// Get court dimensions based on type
		const dimensions = this.getCourtAspectRatio()

		// Background color class for court header
		const headerBgClass = this.selected ? 'bg-primary-default text-white' : 'bg-gray-50'

		return html`
			<div
				class="flex flex-col ${dimensions.height} ${dimensions.width} border-2 rounded-lg overflow-hidden 
				transition-all duration-200 shadow-sm ${!this.disabled ? 'hover:shadow-md' : ''}
				${this.disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
				${this.selected ? 'border-primary-default' : 'border-gray-200'} relative mx-auto"
				@click=${this.handleClick}
			>
				<!-- Court Header -->
				<div
					class="${this.compact
						? 'pl-2 py-1'
						: 'p-2'} ${headerBgClass} flex justify-between items-center transition-colors duration-200"
				>
					<div class="font-bold overflow-hidden text-ellipsis whitespace-nowrap ${this.compact ? 'text-sm' : ''}">
						${courtName}
					</div>
				</div>

				<!-- Court Visualization with fixed dimensions -->
				<div
					class="flex items-center justify-center flex-grow overflow-hidden relative bg-black  bg-primary-default/50"
				>
					<div
						class="w-full h-full  transition-transform duration-200 bg-opacity-5 block"
						style="${this.getScaleStyle()}"
					>
						${unsafeHTML(this.getCourtSVG(this.type))}
					</div>
				</div>

				<!-- Status Badge (if disabled) -->
				${this.disabled
					? html`<div class="mt-auto py-1 px-2 text-xs text-center bg-red-100 text-red-800">Currently unavailable</div>`
					: null}

				<!-- Selected Indicator -->
				${this.selected && !this.compact
					? html`<div
							class="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary-default text-white flex items-center justify-center"
					  >
							<schmancy-icon>check</schmancy-icon>
					  </div>`
					: null}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'sport-court-card': SportCourtCard
	}
}
