import { LitElement, css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { unsafeSVG } from 'lit/directives/unsafe-svg.js'

// Import SVGs as raw strings (assumes proper webpack/vite configuration)
import padelSVG from '/public/svg/padel-court.svg?raw'
import pickleballSVG from '/public/svg/pickleball-court.svg?raw'
import volleyballSVG from '/public/svg/volleyball-court.svg?raw'

// Define court types as a const to ensure type safety
const COURT_TYPES = ['padel', 'pickleball', 'volleyball'] as const
type CourtType = (typeof COURT_TYPES)[number]

interface CourtClickDetail {
	id: string
	type: CourtType
	name: string
}

@customElement('sport-court-card')
export class SportCourtCard extends LitElement {
	// Static styles using Lit's static css method
	static styles = css`
		:host {
			cursor: pointer;
			display: block;
			width: 100%;
			height: 100%;
		}
		.svg-wrapper {
			width: 100%;
			height: 100%;
			min-height: 100px;
			display: flex;
			justify-content: center;
			align-items: center;
			overflow: visible;
		}
		.svg-wrapper svg {
			width: 100%;
			height: 100%;
			max-width: 100%;
			max-height: 100%;
			object-fit: contain;
		}
		/* Ensure focus state is visible */
		.court-card:focus-visible {
			outline: 3px solid var(--focus-outline-color, #4299e1);
			outline-offset: 2px;
		}
		/* Keyboard and mouse hover states */
		.court-card:not([disabled]):hover,
		.court-card:not([disabled]):focus-visible {
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		}
	`

	// Court ID
	@property({ type: String })
	id = ''

	// Court name
	@property({ type: String })
	name = ''

	// Court type with type safety
	@property({ type: String })
	type: CourtType = 'volleyball'

	// Whether this court is selected
	@property({ type: Boolean, reflect: true })
	selected = false

	// Whether the court is disabled (unavailable)
	@property({ type: Boolean, reflect: true })
	disabled = false

	// Whether to display in compact mode
	@property({ type: Boolean })
	compact = false

	// Cached SVG content to prevent re-parsing
	private svgCache: Record<CourtType, string> = {
		padel: padelSVG,
		pickleball: pickleballSVG,
		volleyball: volleyballSVG,
	}

	// Get SVG content for the specified court type
	private getCourtSVG(type: CourtType): string {
		return this.svgCache[type] || this.svgCache.pickleball
	}

	// Handle court click and keyboard interactions
	private handleInteraction(e: MouseEvent | KeyboardEvent) {
		// Prevent interaction if disabled
		if (this.disabled) return

		// Ensure keyboard events only trigger on Enter or Space
		if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return

		const detail: CourtClickDetail = {
			id: this.id,
			type: this.type,
			name: this.name,
		}

		this.dispatchEvent(
			new CustomEvent<CourtClickDetail>('court-click', {
				detail,
				bubbles: true,
				composed: true,
			}),
		)
	}

	render() {
		// Get court display name (fallback to capitalized type if no name provided)
		const courtName = this.name || `${this.type.charAt(0).toUpperCase() + this.type.slice(1)} Court`

		return html`
			<div
				role="button"
				tabindex="${this.disabled ? '-1' : '0'}"
				aria-pressed="${this.selected}"
				aria-disabled="${this.disabled}"
				class="court-card flex flex-col w-full border-2 rounded-lg overflow-hidden 
					transition-all duration-200 shadow-sm 
					${!this.disabled ? 'hover:shadow-md' : ''}
					${this.disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
					${this.selected ? 'border-primary-default' : 'border-gray-200'}"
				@click=${this.handleInteraction}
				@keydown=${this.handleInteraction}
			>
				<!-- Court Header -->
				<div
					class="${this.compact ? 'pl-2 py-1' : 'p-2'} ${this.selected
						? 'bg-primary-default text-white'
						: 'bg-gray-50'} flex justify-between items-center transition-colors duration-200"
				>
					<div
						class="font-bold overflow-hidden text-ellipsis whitespace-nowrap ${this.compact ? 'text-sm' : ''}"
						id="court-name-${this.id}"
					>
						${courtName}
					</div>
				</div>

				<!-- Court Visualization -->
				<div
					class="flex items-center justify-center flex-shrink overflow-hidden relative bg-gray-100 p-2"
					aria-labelledby="court-name-${this.id}"
				>
					<div class="svg-wrapper" aria-hidden="true">${unsafeSVG(this.getCourtSVG(this.type))}</div>
				</div>

				<!-- Status Badge (if disabled) -->
				${this.disabled
					? html`<div class="mt-auto py-1 px-2 text-xs text-center bg-red-100 text-red-800" role="status">
							Currently unavailable
					  </div>`
					: null}

				<!-- Selected Indicator -->
				${this.selected && !this.compact
					? html`<div
							class="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary-default text-white flex items-center justify-center"
							aria-label="Selected"
					  >
							<schmancy-icon>check</schmancy-icon>
					  </div>`
					: null}
			</div>
		`
	}
}

// Augment global interface for TypeScript
declare global {
	interface HTMLElementTagNameMap {
		'sport-court-card': SportCourtCard
	}
}
