// src/admin/venues/admin-venue-card.ts
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { Venue } from 'src/db/venue-collection'
import { formatEnum } from './components/venue-form'

const STATUS_CONFIG = {
	active: { color: 'success', icon: 'check_circle', label: 'Open' },
	maintenance: { color: 'warning', icon: 'construction', label: 'Under Maintenance' },
	inactive: { color: 'error', icon: 'cancel', label: 'Closed' },
}

const ICON_MAP: Record<string, string> = {
	shower: 'shower',
	lockers: 'lock',
	parking: 'local_parking',
	cafe: 'restaurant',
	wifi: 'wifi',
	wheelchairAccess: 'accessible',
	toilet: 'wc',
	toilets: 'wc',
	shop: 'shopping_bag',
	childrenArea: 'child_care',
	equipmentRental: 'handyman',
	lighting: 'lightbulb',
	spectatorSeating: 'weekend',
	securityService: 'security',
	waterStation: 'water_drop',
	firstAid: 'medical_services',
}

@customElement('admin-venue-card')
export class AdminVenueCard extends $LitElement() {
	@property({ type: Object }) venue!: Venue
	@property({ type: Number }) courtCount: number = 0

	// Get operating hours for today
	private getTodayHours(): string {
		const today = new Date().toLocaleDateString('en', { weekday: 'long' }).toLowerCase()
		const hours = this.venue.operatingHours?.[today as keyof typeof this.venue.operatingHours]
		return hours ? `${hours.open} - ${hours.close}` : 'Closed today'
	}

	// Format facility names
	private formatFacilityName(facility: string): string {
		return formatEnum(facility)
	}

	// Get max facilities to display
	private getDisplayableFacilities(max: number = 3): string[] {
		if (!this.venue.facilities || this.venue.facilities.length === 0) {
			return []
		}
		return this.venue.facilities.slice(0, max)
	}

	render() {
		// Determine status configuration
		STATUS_CONFIG[this.venue.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.inactive

		// Get today's operating hours
		const todayHours = this.getTodayHours()

		// Format address
		const { street, city, postalCode } = this.venue.address
		const address = `${street}, ${city}, ${postalCode}`

		// Get display facilities
		const displayFacilities = this.getDisplayableFacilities()
		const additionalFacilities = Math.max(0, (this.venue.facilities?.length || 0) - displayFacilities.length)

		return html`
			<schmancy-surface
				type="surface"
				rounded="all"
				elevation="1"
				class="venue-card w-full hover:shadow-md cursor-pointer overflow-hidden transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg"
			>
				<div class="p-5 flex flex-col gap-2">
					<!-- Header with Name and Status -->
					<div class="flex items-center justify-between mb-2">
						<schmancy-typography type="headline" token="md" class="font-semibold">
							${this.venue.name}
						</schmancy-typography>
					</div>

					<!-- Main Content Grid -->
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<!-- Location -->
						<div class="flex items-center gap-2">
							<schmancy-icon class="text-primary-default">location_on</schmancy-icon>
							<div>
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-0.5">
									Location
								</schmancy-typography>
								<schmancy-typography type="body" token="sm" class="font-medium line-clamp-1">
									${address}
								</schmancy-typography>
							</div>
						</div>

						<!-- Today's Hours -->
						<div class="flex items-center gap-2">
							<schmancy-icon class="text-primary-default">schedule</schmancy-icon>
							<div>
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-0.5">
									Today's Hours
								</schmancy-typography>
								<schmancy-typography type="body" token="sm" class="font-medium"> ${todayHours} </schmancy-typography>
							</div>
						</div>

						<!-- Courts -->
						<div class="flex items-center gap-2">
							<schmancy-icon class="text-primary-default">sports_tennis</schmancy-icon>
							<div>
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-0.5">
									Courts
								</schmancy-typography>
								<schmancy-typography type="body" token="md" class="font-medium">
									${this.courtCount} ${this.courtCount === 1 ? 'court' : 'courts'}
								</schmancy-typography>
							</div>
						</div>
					</div>

					<!-- Facilities Section -->
					${this.venue.facilities?.length
						? html`
								<div class="mt-2">
									<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-2">
										Facilities
									</schmancy-typography>
									<div class="flex flex-wrap gap-2">
										${displayFacilities.map(
											facility => html`
												<div
													class="facility-badge flex items-center px-2 py-1 rounded-full bg-gray-100 transition-all duration-200 hover:bg-primary-container hover:text-primary-on"
												>
													<schmancy-icon size="16px" class="mr-1">
														${ICON_MAP[facility] || 'check_circle'}
													</schmancy-icon>
													<span class="text-xs">${this.formatFacilityName(facility)}</span>
												</div>
											`,
										)}
										${additionalFacilities > 0
											? html`
													<div
														class="facility-badge flex items-center px-2 py-1 rounded-full bg-gray-100 transition-all duration-200"
													>
														<span class="text-xs">+${additionalFacilities} more</span>
													</div>
											  `
											: ''}
									</div>
								</div>
						  `
						: html` <div class="text-surface-on-variant text-sm italic">No facilities listed</div> `}

					<!-- Contact Info Preview -->
					${this.venue.contactPhone || this.venue.contactEmail
						? html`
								<div class="mt-1 flex gap-3">
									${this.venue.contactPhone
										? html`
												<div class="flex items-center gap-1 text-xs text-surface-on-variant">
													<schmancy-icon size="14px">phone</schmancy-icon>
													${this.venue.contactPhone}
												</div>
										  `
										: ''}
									${this.venue.contactEmail
										? html`
												<div class="flex items-center gap-1 text-xs text-surface-on-variant">
													<schmancy-icon size="14px">email</schmancy-icon>
													${this.venue.contactEmail}
												</div>
										  `
										: ''}
								</div>
						  `
						: ''}
				</div>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'admin-venue-card': AdminVenueCard
	}
}
