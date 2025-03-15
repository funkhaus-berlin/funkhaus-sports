import { area, mutationObserver } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { PropertyValueMap, html, nothing } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { delay, fromEvent, merge, startWith, takeUntil } from 'rxjs'
import { Venue } from 'src/db/venue-collection'
import { CourtBookingSystem } from '../book/book'
import './logo'

// Define golden ratio constant
const GOLDEN_RATIO = 1.618

@customElement('funkhaus-venue-card')
export default class FunkhausVenueCard extends $LitElement() {
	@query('section') card!: HTMLElement
	@property({ type: Object }) venue!: Venue
	@property({ type: Boolean }) featured: boolean = false
	@property({ type: Object }) theme: { logo?: string; primary?: string; text?: string } = {}

	protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
		super.firstUpdated(_changedProperties)

		// Adjust card dimensions on resize
		merge(mutationObserver(this), fromEvent(window, 'resize'))
			.pipe(startWith(1), delay(100), takeUntil(this.disconnecting))
			.subscribe(() => {
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
			wifi: 'wifi',
			accessibilityFeatures: 'accessible',
			lighting: 'lightbulb',
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
		return `${address.street}, ${address.city}`
	}

	protected render() {
		if (!this.venue) return nothing

		const primaryColor = this.theme.primary || '#5e808e'

		// Calculate golden ratio based spacing
		const basePadding = 16
		const goldenPadding = Math.round(basePadding * GOLDEN_RATIO) // ~26px
		const goldenSpacingSm = Math.round(8 * GOLDEN_RATIO) // ~13px
		const goldenSpacingMd = Math.round(12 * GOLDEN_RATIO) // ~19px
		const goldenIconSize = Math.round(18 * GOLDEN_RATIO) // ~29px

		// Calculate logo position using golden ratio
		const logoScale = 1.618
		const logoTranslateX = Math.round((25 * GOLDEN_RATIO) / 2) // ~20%
		const logoTranslateY = Math.round(25 * GOLDEN_RATIO) // ~40%

		return html`
			<schmancy-theme color="${primaryColor}">
				<section
					@click=${() => {
						area.push({
							component: new CourtBookingSystem(),
							area: 'root',
						})
					}}
					hidden
					class="mx-auto bg-primary-default text-primary-on group relative overflow-hidden cursor-pointer transition-all duration-300 ease-in-out hover:scale-105 w-full rounded-lg"
				>
					<!-- Booking badge that appears on hover -->
					<schmancy-button
						variant="filled tonal"
						class="absolute bottom-3 right-3 font-bold py-1 px-3 rounded-full opacity-0 transform -translate-y-2 transition-all duration-300 ease-in-out group-hover:opacity-100 group-hover:translate-y-0 z-10"
					>
						Book now
					</schmancy-button>

					<!-- Card content with golden ratio padding -->
					<div class="relative h-full flex flex-col justify-between z-10" style="padding: ${goldenPadding}px;">
						<!-- Top section with name and type -->
						<div>
							<schmancy-typography type="display" token="md" class="mb-2"> ${this.venue.name} </schmancy-typography>

							<schmancy-typography
								type="label"
								token="sm"
								class="opacity-80"
								style="margin-bottom: ${goldenSpacingMd}px;"
							>
								${this.venue.venueType.replace(/([A-Z])/g, ' $1').trim()}
							</schmancy-typography>

							<!-- Status indicator -->
							<div style="margin-bottom: ${goldenSpacingMd}px;">
								<schmancy-chip
									.selected=${this.venue.status === 'active'}
									.label=${this.venue.status === 'active'
										? 'Open Now'
										: this.venue.status === 'maintenance'
										? 'Under Maintenance'
										: 'Closed'}
									readOnly
								>
									${this.venue.status === 'active'
										? 'check_circle'
										: this.venue.status === 'maintenance'
										? 'construction'
										: 'cancel'}
								</schmancy-chip>
							</div>

							<!-- Operating hours -->
							<schmancy-typography class="mb-2" type="body" token="sm">
								${this.formatOperatingHours()}
							</schmancy-typography>
						</div>

						<!-- Facility icons -->
						${when(
							this.venue.facilities && this.venue.facilities.length > 0,
							() => html`
								<div class="flex flex-wrap gap-2" style="margin: ${goldenSpacingMd}px 0;">
									${this.venue.facilities?.map(
										facility => html`
											<div
												class="flex items-center justify-center rounded-full"
												style="width: ${goldenIconSize}px; height: ${goldenIconSize}px;"
											>
												<schmancy-icon size="${Math.round(goldenIconSize * 0.618)}px"
													>${this.getFacilityIcon(facility)}</schmancy-icon
												>
											</div>
										`,
									)}
								</div>
							`,
						)}

						<!-- Bottom section with location details -->
						<div class="mt-auto">
							<schmancy-typography class="mb-1" type="body" token="sm"> ${this.formatAddress()} </schmancy-typography>

							<schmancy-typography class="opacity-70" type="label" token="sm">
								${this.venue.address.postalCode} ${this.venue.address.city}
							</schmancy-typography>

							<!-- Court capacity -->
							${when(
								this.venue.maxCourtCapacity,
								() => html`
									<div class="flex items-center" style="margin-top: ${goldenSpacingSm}px">
										<schmancy-icon class="mr-1" style="font-size: ${Math.round(goldenIconSize * 0.618)}px;"
											>sports_tennis</schmancy-icon
										>
										<schmancy-typography type="label" token="sm">
											${this.venue.maxCourtCapacity} courts
										</schmancy-typography>
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
					></funkhaus-logo>
				</section>
			</schmancy-theme>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-venue-card': FunkhausVenueCard
	}
}
