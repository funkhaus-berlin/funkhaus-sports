import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { unsafeSVG } from 'lit/directives/unsafe-svg.js'

// Import SVGs as raw strings (assumes proper webpack/vite configuration)
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
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
export class SportCourtCard extends $LitElement(css`
	:host {
		display: block;
		cursor: pointer;
		transition: scale 0.2s ease-in-out;
	}
	:host(:hover) {
		scale: 1.05;
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
`) {
	// Static styles using Lit's static css method

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
		// Ensure the SVG has appropriate ARIA attributes
		const svgContent = this.svgCache[type] || this.svgCache.pickleball

		// This is a basic approach to add aria-hidden to the SVG
		// For production, you might want a more robust parser
		return svgContent.replace('<svg', '<svg aria-hidden="true" focusable="false"')
	}

	// Handle court click and keyboard interactions
	private handleInteraction(e: MouseEvent | KeyboardEvent) {
		// Prevent interaction if disabled
		if (this.disabled) {
			e.preventDefault()
			return
		}

		// Ensure keyboard events only trigger on Enter or Space
		if (e instanceof KeyboardEvent) {
			if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
				e.preventDefault() // Prevent page scroll on space
			} else {
				return
			}
		}

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

		// Create unique IDs for ARIA associations
		const courtId = `court-${this.id}`
		const statusId = `court-status-${this.id}`
		const nameId = `court-name-${this.id}`

		// Create descriptive label for screen readers
		const ariaLabel = `${courtName}${this.selected ? ', selected' : ''}${this.disabled ? ', unavailable' : ''}`

		return html`
			<div
				id="${courtId}"
				role="button"
				tabindex="${this.disabled ? '-1' : '0'}"
				aria-pressed="${this.selected}"
				aria-disabled="${this.disabled}"
				aria-label="${ariaLabel}"
				aria-describedby="${this.disabled ? statusId : nameId}"
				class="cursor-pointer court-card flex flex-col w-full border-2 rounded-lg overflow-hidden 
          transition-all duration-200  
          ${!this.disabled ? 'hover:shadow-md hover:scale-[1.05] ' : ''}
          ${this.disabled ? 'opacity-60' : ''}
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
						id="${nameId}"
					>
						${courtName}
					</div>
				</div>

				<!-- Court Visualization -->
				<div class="flex items-center justify-center flex-shrink overflow-hidden relative bg-gray-100 p-2">
					<div class="svg-wrapper">${unsafeSVG(this.getCourtSVG(this.type))}</div>
				</div>

				<!-- Status Badge (if disabled) -->

				<!-- Selected Indicator (with screen reader support) -->
				${this.selected && !this.compact
					? html`<div
							class="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary-default text-white flex items-center justify-center"
							aria-hidden="true"
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
