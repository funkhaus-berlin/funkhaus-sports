import { mutationObserver } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html, nothing } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { when } from 'lit/directives/when.js'
import { delay, fromEvent, merge, startWith, takeUntil } from 'rxjs'
import { Venue } from 'src/db/venue-collection'
import '../logo'

// Define golden ratio constant
const GOLDEN_RATIO = 1.618

@customElement('funkhaus-venue-card')
export default class FunkhausVenueCard extends $LitElement(css`
	:host {
		display: block;
	}
`) {
	@query('section') card!: HTMLElement
  @property({ type: Boolean }) readonly :boolean = false
	@property({ type: Object }) venue!: Venue
	@property({ type: Object }) theme: { logo?: string; primary?: string; text?: string } = {}

	// Track hover state for animations
	@state() isHovered: boolean = false

	firstUpdated(): void {
		// Adjust card dimensions on resize
		merge(mutationObserver(this), fromEvent(window, 'resize'))
			.pipe(startWith(1), delay(100), takeUntil(this.disconnecting))
			.subscribe(() => {
				if (!this.card) return
				this.card.removeAttribute('hidden')
				// Set fixed height to match event card
				this.card.style.height = '400px'
				this.card.style.width = '280px'
			})
	}

	// Get suitable icon for each facility
	private getFacilityIcon(facility: string): string {
		const iconMap: Record<string, string> = {
			shower: 'shower',
			lockers: 'lock',
			parking: 'local_parking',
			restaurant: 'restaurant',
			cafe: 'restaurant',
			wifi: 'wifi',
			wheelchairAccess: 'accessible',
			accessibilityFeatures: 'accessible',
			lighting: 'lightbulb',
			toilets: 'wc',
			shop: 'shopping_bag',
			childrenArea: 'child_care',
			equipmentRental: 'handyman',
			spectatorSeating: 'weekend',
			securityService: 'security',
			waterStation: 'water_drop',
			firstAid: 'medical_services',
		}

		return iconMap[facility] || 'sports_tennis'
	}

	// Format operating hours for display
	private formatOperatingHours(): string {
		const today = new Date().toLocaleDateString('en', { weekday: 'long' }).toLowerCase()
		const hours = this.venue.operatingHours?.[today as keyof typeof this.venue.operatingHours]

		if (!hours) return 'Closed today'
		return `Today: ${hours.open} - ${hours.close}`
	}

	// Format address in a clean way
	private formatAddress(): string {
		const { address } = this.venue
		if (!address) return ''
		return `${address.street}, ${address.city}`
	}

	protected render() {
		if (!this.venue) return nothing
		// Get theme values with defaults
		const primaryColor = this.theme?.primary || '#5e808e'
		const textColor = this.theme?.text || '#ffffff'
		const logoType = this.theme?.logo || 'light'

		// Calculate golden ratio based spacing
		const basePadding = 16
		const goldenPadding = Math.round(basePadding * GOLDEN_RATIO) // ~26px
		const goldenIconSize = Math.round(18 * GOLDEN_RATIO) // ~29px

		// Calculate logo position using golden ratio
		const logoScale = 1.618
		const logoTranslateX = Math.round((25 * GOLDEN_RATIO) / 2) // ~20%
		const logoTranslateY = Math.round(25 * GOLDEN_RATIO) // ~40%

		// Create styles for text color
		const textStyle = {
			color: textColor,
		}

		// Card styles
		const cardClasses = {
			'mx-auto': true,
			group: true,
			relative: true,
			'overflow-hidden': true,
			'cursor-pointer': true,
			'transition-all': true,
			'duration-300': true,
			'ease-in-out': true,
			'hover:scale-105': true,
			'w-full': true,
			'rounded-lg': true,
			'shadow-md': true,
			'hover:shadow-xl': true,
		}

		const cardStyles = {
			backgroundColor: primaryColor,
			color: textColor,
		}

		// Text overlay to ensure good contrast
		const overlayStyle = {
			position: 'absolute',
			inset: '0',
			background: `linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.3))`,
			zIndex: '5',
			pointerEvents: 'none',
		}

		return html`
			<schmancy-theme .color="${primaryColor}">
				<section
				
					@mouseenter=${() => (this.isHovered = true)}
					@mouseleave=${() => (this.isHovered = false)}
					hidden
					class=${this.classMap(cardClasses)}
					style=${this.styleMap(cardStyles)}
				>
					<!-- Subtle overlay for better text contrast -->
					<div style=${this.styleMap(overlayStyle)}></div>

					<!-- Booking badge that appears on hover -->
					<schmancy-button  
          .hidden=${this.readonly}
						variant="filled tonal"
						class="absolute bottom-3 right-3 font-bold py-1 px-3 rounded-full opacity-0 transform -translate-y-2 transition-all duration-300 ease-in-out group-hover:opacity-100 group-hover:translate-y-0 z-10"
					>
						Book now
					</schmancy-button>

					<!-- Card content with golden ratio padding -->
					<div class="relative h-full flex flex-col justify-between z-10" style="padding: ${goldenPadding}px;">
						<!-- Top section with name and type -->
						<div class="flex-1">
							<schmancy-typography type="display" token="md" class="mb-2" style=${styleMap(textStyle)}>
								${this.venue.name}
							</schmancy-typography>
						</div>

						<!-- Bottom section with location details -->
						<div class="mt-auto grid gap-2">
							<!-- Operating hours -->
							<schmancy-typography class="" type="body" token="sm" style=${styleMap(textStyle)}>
								${this.formatOperatingHours()}
							</schmancy-typography>

							<section>
								<schmancy-typography type="label" token="sm" style=${styleMap(textStyle)}>
									${this.formatAddress()}
								</schmancy-typography>

								<schmancy-typography class="opacity-80" type="label" token="sm" style=${styleMap(textStyle)}>
									${this.venue.address?.postalCode} ${this.venue.address?.city}
								</schmancy-typography>
							</section>

							<!-- Facilities icons -->
							${when(
								this.venue.facilities && this.venue.facilities.length > 0,
								() => html`
									<div class="flex flex-wrap gap-2 mt-1">
										${this.venue.facilities?.slice(0, 5).map(
											facility => html`
												<div
													class="flex items-center justify-center rounded-full  bg-opacity-20 p-1 transition-all"
													title="${this.formatFacilityName(facility)}"
												>
													<schmancy-icon size="${Math.round(goldenIconSize * 0.618)}px" style=${styleMap(textStyle)}>
														${this.getFacilityIcon(facility)}
													</schmancy-icon>
												</div>
											`,
										)}
										${this.venue.facilities && this.venue.facilities.length > 5
											? html`
													<div class="flex items-center justify-center rounded-full  bg-opacity-20 p-1">
														<schmancy-typography type="label" token="sm" style=${styleMap(textStyle)}>
															+${this.venue.facilities.length - 5}
														</schmancy-typography>
													</div>
												`
											: nothing}
									</div>
								`,
							)}
						</div>
					</div>

					<!-- Funkhaus Logo in the background with adjusted positioning -->
					<funkhaus-logo
						style="transform: translateX(${logoTranslateX}%) translateY(${logoTranslateY}%) scale(${logoScale});"
						class="z-0 absolute inset-0 select-none transition-all duration-300 opacity-25 pointer-events-none"
						width="100%"
						.dark=${logoType === 'dark'}
					></funkhaus-logo>
				</section>
			</schmancy-theme>
		`
	}

	// Format facility name
	private formatFacilityName(facility: string): string {
		return facility
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, str => str.toUpperCase())
			.trim()
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-venue-card': FunkhausVenueCard
	}
}
