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
	restaurant: 'restaurant',
	wifi: 'wifi',
	accessibilityFeatures: 'accessible',
	lighting: 'lightbulb',
}

@customElement('admin-venue-card')
export class AdminVenueCard extends $LitElement() {
	@property({ type: Object }) venue!: Venue
	courtCount: number = 0

	render() {
		// Determine status configuration
		const statusDetails = STATUS_CONFIG[this.venue.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.inactive

		// Determine today's operating hours
		const today = new Date().toLocaleDateString('en', { weekday: 'long' }).toLowerCase()
		const hours = this.venue.operatingHours?.[today as keyof typeof this.venue.operatingHours]
		const todayHours = hours ? `${hours.open} - ${hours.close}` : 'Closed today'

		// Format address
		const { street, city, postalCode } = this.venue.address
		const address = `${street}, ${city}, ${postalCode}`

		return html`
			<schmancy-surface
				type="surface"
				rounded="all"
				elevation="1"
				class="venue-card w-full hover:shadow-md cursor-pointer overflow-hidden transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg"
			>
				<div class="p-5 flex flex-col gap-2">
					<!-- Header -->
					<div class="flex items-center gap-2 ">
						<schmancy-typography type="headline" token="md" class="font-semibold">
							${this.venue.name}
						</schmancy-typography>
					</div>
					<!-- Main Content -->
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
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
						<div class="flex items-center gap-2">
							<schmancy-icon class="text-primary-default">schedule</schmancy-icon>
							<div>
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-0.5">
									Today's Hours
								</schmancy-typography>
								<schmancy-typography type="body" token="sm" class="font-medium"> ${todayHours} </schmancy-typography>
							</div>
						</div>
						<div class="flex items-center gap-2">
							<schmancy-icon class="text-primary-default">sports_tennis</schmancy-icon>
							<div>
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-0.5">
									Courts
								</schmancy-typography>
								<schmancy-typography type="body" token="md" class="font-medium">
									${this.courtCount}
								</schmancy-typography>
							</div>
						</div>
					</div>
					<!-- Facilities Section -->
					${this.venue.facilities?.length
						? html`
								<div>
									<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-2">
										Facilities
									</schmancy-typography>
									<div class="flex flex-wrap gap-2">
										${this.venue.facilities.map(
											facility => html`
												<div
													class="facility-badge flex items-center px-2 py-1 rounded-full bg-gray-100 transition-all duration-200 hover:bg-purple-700 hover:text-white"
												>
													<schmancy-icon size="16px" class="mr-1">
														${ICON_MAP[facility] || 'sports_tennis'}
													</schmancy-icon>
													<span class="text-xs">${formatEnum(facility)}</span>
												</div>
											`,
										)}
									</div>
								</div>
						  `
						: html` <div class="text-surface-on-variant text-sm italic">No facilities listed</div> `}
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
