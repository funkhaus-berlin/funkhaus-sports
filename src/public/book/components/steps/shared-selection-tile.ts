import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html, nothing } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { when } from 'lit/directives/when.js'

/**
 * A unified selection tile component
 * Matches styling and behavior of time-selection-step component
 * Enhanced for better state visibility and usability
 * Uses a standard aspect ratio (Golden Ratio ~1.618:1)
 */
@customElement('selection-tile')
export class SelectionTile extends $LitElement(css`
	:host {
		display: block;
	}
	.selection-tile {
		transform-origin: center;
		transition: all 0.3s ease-in-out;
		position: relative;
		/* More balanced aspect ratio - slightly taller than wide */
		aspect-ratio: 0.85 / 1;
		width: 100%;
		max-width: 7rem; /* Balanced maximum width */
	}

	.status-indicator {
		position: absolute;
		top: 0;
		right: 0;
		border-radius: 0 0.5rem 0 0.5rem;
		width: 1rem;
		height: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.6rem;
	}

	.unavailable-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		border-radius: 0.5rem;
		background: repeating-linear-gradient(
			45deg,
			rgba(244, 67, 54, 0.1),
			rgba(244, 67, 54, 0.1) 10px,
			rgba(244, 67, 54, 0.05) 10px,
			rgba(244, 67, 54, 0.05) 20px
		);
		pointer-events: none;
	}

	/* Compact variation */
	.selection-tile.compact {
		aspect-ratio: 0.85 / 1;
		max-width: 5rem;
	}

	/* Content container for better spacing */
	.content-container {
		height: 100%;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		box-sizing: border-box;
	}
`) {
	@property({ type: Boolean }) selected = false
	@property({ type: Boolean }) compact = false
	@property({ type: String }) icon = ''
	@property({ type: String }) label = ''
	@property({ type: Number }) price = 0
	@property({ type: Boolean }) showPrice = false
	@property({ type: String }) dataValue = ''
	@property({ type: Boolean }) available = true
	@property({ type: String }) subLabel = ''

	render() {
		// Base classes for the tile
		const tileClasses = {
			// Basic layout
			'selection-tile': true,
			'flex-none': true,
			'rounded-lg': true,
			relative: true,

			// Compact state
			compact: this.compact,

			// Border styles - thicker for better visibility
			'border-2': true,

			// Transitions - matching time-selection-step
			'transition-all': true,
			'duration-300': true,
			transform: true,
			'ease-in-out': true,

			// Interaction states
			'cursor-pointer': this.available,
			'cursor-not-allowed': !this.available,
			'hover:scale-105': this.available && !this.selected,
			'hover:shadow-md': this.available && !this.selected,
			'active:scale-95': this.available && !this.selected,

			// Selected animation
			'scale-105': this.selected,
			'shadow-lg': this.selected,
			'ring-2': this.selected,
			'ring-primary-default': this.selected,

			// Visual states
			'bg-primary-default': this.selected,
			'text-primary-on': this.selected,
			'border-primary-default': this.selected,
			'bg-success-container/10': !this.selected && this.available,
			'border-outlineVariant': !this.selected && this.available,
			'text-surface-on': !this.selected && this.available,
			'bg-error-container/10': !this.available,
			'border-error-container': !this.available,
			'text-error-default': !this.available,
			'opacity-75': !this.available,
		}

		// Icon animation classes
		const iconClasses = {
			'transition-all': true,
			'duration-300': true,
			transform: true,
			'text-primary-on': this.selected,
			'text-primary-default': !this.selected && this.available,
			'text-error-default': !this.available,
			'scale-125': this.selected, // Slightly reduced for better proportions
			'mb-1': true,
			'font-bold': true,
		}

		// Text animation classes - adjusted for better flow
		const textClasses = {
			'font-bold': this.selected,
			'font-medium': !this.selected,
			'transition-all': true,
			'duration-300': true,
			'text-md': !this.selected,
			'text-center': true, // Ensure text is centered
			'tracking-wide': this.selected,
			'w-full': true, // Full width to prevent text overflow
			'overflow-hidden': true, // Prevent overflow
			'text-ellipsis': true, // Add ellipsis for long text
		}

		// Price classes - adjusted for better proportions
		const priceClasses = {
			'font-bold': this.selected,
			'font-medium': !this.selected,
			'mt-1': true,
			'transition-all': true,
			'duration-300': true,
			'text-md': !this.compact && this.selected,
			'text-sm': this.compact || !this.selected,
			'px-2': true,
			'py-0.5': true,
			rounded: true,
			'bg-opacity-20': true,
			'bg-primary-default': this.selected,
		}

		return html`
			<div
				class=${classMap(tileClasses)}
				data-value=${this.dataValue}
				role="option"
				aria-selected="${this.selected ? 'true' : 'false'}"
				aria-disabled="${!this.available ? 'true' : 'false'}"
			>
				<!-- Selected status indicator -->
				${this.selected
					? html`
							<div class="status-indicator bg-primary-on text-primary-default">
								<schmancy-icon size="10px">check</schmancy-icon>
							</div>
					  `
					: nothing}

				<!-- Unavailable pattern overlay -->
				${!this.available ? html`<div class="unavailable-overlay"></div>` : nothing}

				<!-- Content container for better spacing -->
				<div class="content-container">
					<!-- Status icon with enhanced animation -->
					${when(
						!this.showPrice,
						() => html`<schmancy-icon class=${classMap(iconClasses)} size=${this.compact ? '16px' : '20px'}>
							${this.available ? this.icon : 'block'}
						</schmancy-icon>`,
					)}

					<!-- Label display with enhanced animation -->
					<div class=${classMap(textClasses)}>${this.label}</div>

					<!-- Price (only shown when showPrice is true) -->
					${this.showPrice && this.available
						? html` <div class=${classMap(priceClasses)}>€${this.price.toFixed(2)}</div> `
						: nothing}

					<!-- Sub label or availability label -->
					${this.available && !this.selected && this.subLabel
						? html`
								<div
									class="transition-all duration-300 ${this.compact
										? 'text-2xs mt-0.5'
										: 'text-xs mt-1'} text-success-default font-medium px-1 rounded bg-success-container/20"
								>
									${this.compact ? '' : this.subLabel}
								</div>
						  `
						: nothing}
					${!this.available
						? html`
								<div
									class="transition-all duration-300 ${this.compact
										? 'text-2xs mt-0.5'
										: 'text-xs mt-1'} text-error-default font-medium px-1 py-0.5 rounded bg-error-container/20"
								>
									<schmancy-typography type="label" token="sm">
										${this.compact ? '' : 'Unavailable'}
									</schmancy-typography>
								</div>
						  `
						: nothing}
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'selection-tile': SelectionTile
	}
}
