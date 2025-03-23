import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'

/**
 * Reusable selection tile component for displaying time slots, durations, etc.
 * Enhanced with better grid view sizing, spacing, and typography
 */
@customElement('selection-tile')
export class SelectionTile extends $LitElement(css`
	:host {
		display: block;
	}

	/* Add pulse animation */
	@keyframes pulse {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.05);
		}
		100% {
			transform: scale(1);
		}
	}

	.pulse {
		animation: pulse 0.1s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Improve focus styles for accessibility */
	.tile:focus-visible {
		outline: 2px solid var(--sys-color-primary-default, #3d75f3);
		outline-offset: 2px;
	}

	/* Price tag styles */
	.price-tag {
		background-color: rgba(0, 0, 0, 0.06);
		border-radius: 12px;
		padding: 2px 4px;
		font-weight: 500;
		transition: all 0.3s ease;
	}

	/* Enhanced hover effect */
	.tile:not(.disabled):not(.selected):hover .price-tag {
		background-color: rgba(0, 0, 0, 0.1);
	}

	/* Selected state price tag */
	.tile.selected .price-tag {
		background-color: rgba(255, 255, 255, 0.2);
	}
`) {
	/**
	 * Whether this tile is selected
	 */
	@property({ type: Boolean, reflect: true })
	selected = false

	/**
	 * Whether this tile is disabled
	 */
	@property({ type: Boolean, reflect: true })
	disabled = false

	/**
	 * Whether to render in compact mode
	 */
	@property({ type: Boolean, reflect: true })
	compact = false

	/**
	 * Type of selection (time, duration, etc.)
	 */
	@property({ type: String })
	type = 'time'

	/**
	 * Icon name to display
	 */
	@property({ type: String })
	icon = 'schedule'

	/**
	 * Primary label text
	 */
	@property({ type: String })
	label = ''

	/**
	 * Secondary description (e.g. 'Available')
	 */
	@property({ type: String })
	description = ''

	/**
	 * Data value for identifying this tile
	 */
	@property({ type: String })
	dataValue = ''

	/**
	 * Price for duration options
	 */
	@property({ type: Number })
	price = 0

	/**
	 * Whether to show the price (for duration tiles)
	 */
	@property({ type: Boolean })
	showPrice = false

	/**
	 * Handle keyboard navigation for accessibility
	 */
	private handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			this.dispatchEvent(new CustomEvent('click', { bubbles: true }))
		}
	}

	render() {
		const dimensions = {
			time: {
				normal: { width: 'w-16 sm:w-16 md:w-18', height: 'h-16 sm:h-16 md:h-18' },
				compact: { width: 'w-14', height: 'h-10' },
			},
			duration: {
				normal: { width: 'w-20', height: 'h-20' },
				compact: { width: 'w-16', height: 'h-16' },
			},
		}

		// Get the right dimensions
		const mode = this.compact ? 'compact' : 'normal'
		const size = dimensions[this.type as keyof typeof dimensions]?.[mode] || dimensions.time[mode] // Default to time if type not found

		// Font size based on compact mode and selection state - optimized for grid density
		const fontSize = this.compact
			? 'text-base' // Always keep compact mode text small
			: this.selected
			? 'text-xl'
			: 'text-lg' // Slightly smaller text in normal mode too

		// Padding based on compact mode - reduced for more compact display
		const padding = this.compact ? 'p-1' : 'p-2'

		// Tile classes with improved grid view styling
		const tileClasses = {
			tile: true,
			grid: true,
			'rounded-lg': true,
			'items-center': true,
			'justify-center': true, // Always use space-between for better vertical distribution

			// Sizing based on type and compact state
			[size.width]: true,
			[size.height]: true,
			[padding]: true,

			// Border styling
			border: true,
			'border-2': this.selected, // Thicker border when selected

			// Transitions for smooth animations
			'transition-all': true,
			'duration-100': true,
			transform: true,
			'ease-in-out': true,

			// Interaction states
			'cursor-pointer': !this.disabled,
			'cursor-not-allowed': this.disabled,
			'hover:scale-105': !this.disabled && !this.selected,
			'hover:shadow-md': !this.disabled && !this.selected,
			'active:scale-95': !this.disabled && !this.selected,

			// Selected animation
			'scale-105': this.selected,
			'shadow-md': this.selected,

			// Visual states
			'bg-primary-default': this.selected,
			'text-primary-on': this.selected,
			'border-primary-default': this.selected,
			'bg-success-container/10': !this.selected && !this.disabled,
			'border-outlineVariant': !this.selected && !this.disabled,
			'text-surface-on': !this.selected && !this.disabled,
			'bg-error-container/10': this.disabled,
			'border-error-container': this.disabled,
			'text-error-default': this.disabled,
			'opacity-60': this.disabled,
			selected: this.selected,
			disabled: this.disabled,
		}

		// Label styling - improved for horizontal layout
		const labelClasses = {
			[fontSize]: true,
			'font-bold': true,
			'text-center': true,
			'transition-all': true,
			'duration-100': true,
			'leading-tight': true,
		}

		// Description styling
		const descriptionClasses = {
			'transition-all': true,
			'duration-100': true,
			'text-xs': !this.compact,
			'text-2xs': this.compact,
			'mt-1': !this.compact,
			'mt-0.5': this.compact,
			'text-success-default': !this.disabled,
			'text-error-default': this.disabled,
			'text-center': true,
		}

		return html`
			<div
				class=${this.classMap(tileClasses)}
				data-value=${this.dataValue}
				@keydown=${this.handleKeyDown}
				role="option"
				aria-selected=${this.selected}
				aria-disabled=${this.disabled}
				tabindex=${this.disabled ? '-1' : '0'}
			>
				<!-- Label (primary content) with small inline icon -->
				<schmancy-grid
					gap="sm"
					rows="${this.icon && !this.compact && this.type !== 'duration' ? '1fr 2fr' : '1fr'}"
					justify="stretch"
					align="center"
					class="w-full h-full"
				>
					${when(
						this.icon && !this.compact && this.type !== 'duration', // Show a small inline icon next to the label
						() => html`
							<schmancy-icon
								class="${this.selected ? 'text-primary-on' : 'text-primary-default'} opacity-70 mx-auto"
								size="${this.compact ? '12px' : '16px'}"
							>
								${this.icon}
							</schmancy-icon>
						`,
					)}
					<div class=${this.classMap(labelClasses)}>${this.label}</div>
				</schmancy-grid>
				<!-- Bottom section with price or description - more compact -->
				${when(
					this.type === 'duration' && this.showPrice && this.price > 0,
					() => html`
						<div
							class="price-tag mt-1 ${this.compact ? 'text-xs' : 'text-sm'} ${this.selected
								? 'text-primary-on'
								: 'text-primary-default'}"
						>
							€${this.price.toFixed(2)}
						</div>
					`,
					() =>
						when(
							this.description && (!this.compact || this.disabled),
							() => html`
								<div class=${this.classMap(descriptionClasses)}>
									${this.compact
										? this.description
										: html`<schmancy-typography type="label" token="sm">${this.description}</schmancy-typography>`}
								</div>
							`,
						),
				)}
			</div>
		`
	}
}

// Register element in global namespace
declare global {
	interface HTMLElementTagNameMap {
		'selection-tile': SelectionTile
	}
}
