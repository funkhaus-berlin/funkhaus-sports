import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { when } from 'lit/directives/when.js'

/**
 * Reusable selection tile component for displaying time slots, durations, etc.
 * Used by time selection and duration selection components
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
		animation: pulse 0.4s cubic-bezier(0.4, 0, 0.2, 1);
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

	render() {
		// Size classes based on compact mode
		const sizeClasses = {
			// Normal size
			'w-24': !this.compact && this.type === 'time',
			'h-24': !this.compact && this.type === 'time',
			'w-28': !this.compact && this.type === 'duration',
			'h-28': !this.compact && this.type === 'duration',
			// Compact size
			'w-16': this.compact && this.type === 'time',
			'h-16': this.compact && this.type === 'time',
			'w-20': this.compact && this.type === 'duration',
			'h-20': this.compact && this.type === 'duration',
		}

		// Classes for the tile
		const tileClasses = {
			// Basic layout
			'flex-none': true,
			'rounded-lg': true,
			flex: true,
			'flex-col': true,
			'items-center': true,
			'justify-center': true,
			border: true,

			// Sizes based on type and compact state
			...sizeClasses,

			// Transitions for smooth animations
			'transition-all': true,
			'duration-300': true,
			transform: true,
			'ease-in-out': true,

			// Interaction states
			'cursor-pointer': !this.disabled,
			'cursor-not-allowed': this.disabled,
			'hover:scale-105': !this.disabled && !this.selected,
			'hover:shadow-md': !this.disabled && !this.selected,
			'active:scale-95': !this.disabled && !this.selected, // Add press animation

			// Selected animation
			'scale-105': this.selected, // Make selected items slightly larger
			'shadow-md': this.selected, // Add shadow to selected items

			// Visual states based on selection and disabled state
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
		}

		// Icon animation classes
		const iconClasses = {
			'transition-all': true,
			'duration-300': true,
			transform: true,
			'text-primary-on': this.selected,
			'text-primary-default': !this.selected && !this.disabled,
			'text-error-default': this.disabled,
			'scale-125': this.selected, // Enlarge icon when selected
		}

		// Label classes
		const labelClasses = {
			'font-bold': true,
			'mt-1': true,
			'transition-all': true,
			'duration-300': true,
			'text-base': !this.compact && this.selected, // Keep text readable even in compact mode when selected
			'text-sm': this.compact || !this.selected,
		}

		// Status text classes
		const statusClasses = {
			'transition-all': true,
			'duration-300': true,
			...(this.compact ? { 'text-2xs': true, 'mt-0.5': true } : { 'text-xs': true, 'mt-1': true }),
			'text-success-default': !this.disabled,
			'text-error-default': this.disabled,
		}

		return html`
			<div
				class=${classMap(tileClasses)}
				data-value=${this.dataValue}
				role="option"
				aria-selected="${this.selected ? 'true' : 'false'}"
				aria-disabled="${this.disabled ? 'true' : 'false'}"
			>
				<!-- Icon with animation -->
				<schmancy-icon class=${classMap(iconClasses)} size=${this.compact ? '14px' : '16px'}>
					${this.icon}
				</schmancy-icon>

				<!-- Primary label -->
				<div class=${classMap(labelClasses)}>${this.label}</div>

				<!-- Status/description (optional) -->
				${when(
					this.description && (!this.compact || this.disabled),
					() => html`
						<div class=${classMap(statusClasses)}>
							<schmancy-typography type="label" token="sm"> ${this.description} </schmancy-typography>
						</div>
					`,
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
