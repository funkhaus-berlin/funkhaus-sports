import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { Venue } from 'src/db/venue-collection'
import { formatEnum } from './venue-form'

@customElement('admin-venue-card')
export class AdminVenueCard extends $LitElement() {
	@property({ type: Object }) venue!: Venue
	courtCount: number = 0
	@state() expanded: boolean = false

	private readonly iconMap: Record<string, string> = {
		shower: 'shower',
		lockers: 'lock',
		parking: 'local_parking',
		restaurant: 'restaurant',
		wifi: 'wifi',
		accessibilityFeatures: 'accessible',
		lighting: 'lightbulb',
	}

	private get currentStatusDetails() {
		const config = {
			active: { color: 'success', icon: 'check_circle', label: 'Open' },
			maintenance: { color: 'warning', icon: 'construction', label: 'Under Maintenance' },
			inactive: { color: 'error', icon: 'cancel', label: 'Closed' },
		}
		const status = (this.venue.status as keyof typeof config) || 'inactive'
		return config[status]
	}

	getFacilityIcons() {
		if (!this.venue.facilities?.length) {
			return html`<div class="text-surface-on-variant text-sm italic">No facilities listed</div>`
		}
		return html`
			<div class="flex flex-wrap -mb-2">
				${this.venue.facilities.map(
					facility => html`
						<div
							class="facility-badge flex items-center px-2 py-1 rounded-full bg-gray-100 mr-2 mb-2 transition-all duration-200 hover:bg-purple-700 hover:text-white"
						>
							<schmancy-icon size="16px" class="mr-1"> ${this.iconMap[facility] || 'sports_tennis'} </schmancy-icon>
							<span class="text-xs">${formatEnum(facility)}</span>
						</div>
					`,
				)}
			</div>
		`
	}

	getTodaysHours() {
		const day = new Date().toLocaleDateString('en', { weekday: 'long' }).toLowerCase()
		const hours = this.venue.operatingHours?.[day as keyof typeof this.venue.operatingHours]
		return hours ? `${hours.open} - ${hours.close}` : 'Closed today'
	}

	formatAddress() {
		const { street, city, postalCode } = this.venue.address
		return `${street}, ${city}, ${postalCode}`
	}

	toggleExpand(e: Event) {
		e.stopPropagation()
		e.preventDefault()
		this.expanded = !this.expanded
	}

	private renderHeader() {
		const { name, venueType } = this.venue
		const statusDetails = this.currentStatusDetails
		const statusIndicatorClass = `status-indicator w-2 h-2 rounded-full mr-1.5 shadow-[0_0_6px_0_theme(colors.${statusDetails.color}-500)] bg-${statusDetails.color}-500`
		return html`
			<div class="flex justify-between items-start mb-4">
				<div>
					<div class="flex items-center mb-1">
						<div class="${statusIndicatorClass}"></div>
						<schmancy-typography type="title" token="md" class="font-semibold"> ${name} </schmancy-typography>
					</div>
					<schmancy-typography type="label" token="sm" class="text-surface-on-variant">
						${formatEnum(venueType)}
					</schmancy-typography>
				</div>
				<schmancy-button variant="text" @click=${this.toggleExpand} class="min-w-0 h-8 px-2">
					<schmancy-icon>${this.expanded ? 'expand_less' : 'expand_more'}</schmancy-icon>
				</schmancy-button>
			</div>
		`
	}

	private renderMainContent() {
		const statusDetails = this.currentStatusDetails
		const status = this.venue.status
		return html`
			<div class="grid grid-cols-1 md:grid-cols-12 gap-x-6 gap-y-3">
				<div class="md:col-span-5">
					<div class="flex items-start">
						<schmancy-icon class="mt-1 mr-3 text-primary-default">location_on</schmancy-icon>
						<schmancy-typography type="body" token="sm" class="line-clamp-2">
							${this.formatAddress()}
						</schmancy-typography>
					</div>
				</div>
				<div class="md:col-span-3">
					<div class="flex items-start">
						<schmancy-icon class="mt-1 mr-3 text-primary-default">schedule</schmancy-icon>
						<div>
							<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-0.5">
								Today's Hours
							</schmancy-typography>
							<schmancy-typography type="body" token="sm" class="font-medium">
								${this.getTodaysHours()}
							</schmancy-typography>
						</div>
					</div>
				</div>
				<div class="md:col-span-4">
					<div class="flex items-start">
						<schmancy-icon class="mt-1 mr-3 text-primary-default">sports_tennis</schmancy-icon>
						<div>
							<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-0.5">
								Courts
							</schmancy-typography>
							<div class="flex items-center">
								<schmancy-typography type="body" token="md" class="font-medium">
									${this.courtCount}
								</schmancy-typography>
								<schmancy-chip
									class="ml-2"
									.label=${status === 'active' ? 'Open' : status === 'maintenance' ? 'Maintenance' : 'Closed'}
									.selected=${status === 'active'}
									readOnly
									size="sm"
								>
									${statusDetails.icon}
								</schmancy-chip>
							</div>
						</div>
					</div>
				</div>
			</div>
		`
	}

	private renderExpandedContent() {
		const today = new Date().toLocaleDateString('en', { weekday: 'long' }).toLowerCase()
		return html`
			<div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
				<div>
					${this.venue.description
						? html`
								<div class="mb-5">
									<schmancy-typography type="body" class="mb-1.5 text-primary-default"> About </schmancy-typography>
									<schmancy-typography type="body" class="text-surface-on">
										${this.venue.description}
									</schmancy-typography>
								</div>
						  `
						: ''}
					<div class="mb-5">
						<schmancy-typography type="body" class="mb-1.5 text-primary-default"> Facilities </schmancy-typography>
						${this.getFacilityIcons()}
					</div>
				</div>
				<div>
					<schmancy-typography type="body" class="mb-2 text-primary-default"> Operating Hours </schmancy-typography>
					<div class="hours-grid grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 items-center">
						${['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
							const hours = this.venue.operatingHours?.[day as keyof typeof this.venue.operatingHours]
							const isToday = today === day
							const highlight = isToday
								? "today-highlight relative font-medium before:content-[''] before:absolute before:inset-[-3px_-3px_-1px_-1px] before:bg-purple-700/10 before:rounded-sm before:z-0"
								: ''
							return html`
								<div class="${highlight}">
									<schmancy-typography type="label" token="sm" class="${isToday ? 'relative z-10' : ''}">
										${formatEnum(day)}
									</schmancy-typography>
								</div>
								<div class="${highlight}">
									<schmancy-typography
										type="body"
										token="sm"
										class="${hours
											? isToday
												? 'relative z-10'
												: ''
											: 'text-surface-on-variant italic ' + (isToday ? 'relative z-10' : '')}"
									>
										${hours ? `${hours.open} - ${hours.close}` : 'Closed'}
									</schmancy-typography>
								</div>
							`
						})}
					</div>
					${this.venue.contactEmail || this.venue.contactPhone
						? html`
								<div class="mt-5">
									<schmancy-typography type="body" class="mb-1.5 text-primary-default"> Contact </schmancy-typography>
									<div class="grid grid-cols-1 gap-2">
										${this.venue.contactEmail
											? html`
													<div class="flex items-center">
														<schmancy-icon class="mr-3 text-primary-default" size="18px"> email </schmancy-icon>
														<schmancy-typography type="body" token="sm">
															${this.venue.contactEmail}
														</schmancy-typography>
													</div>
											  `
											: ''}
										${this.venue.contactPhone
											? html`
													<div class="flex items-center">
														<schmancy-icon class="mr-3 text-primary-default" size="18px"> phone </schmancy-icon>
														<schmancy-typography type="body" token="sm">
															${this.venue.contactPhone}
														</schmancy-typography>
													</div>
											  `
											: ''}
										${this.venue.website
											? html`
													<div class="flex items-center">
														<schmancy-icon class="mr-3 text-primary-default" size="18px"> language </schmancy-icon>
														<schmancy-typography type="body" token="sm"> ${this.venue.website} </schmancy-typography>
													</div>
											  `
											: ''}
									</div>
								</div>
						  `
						: ''}
				</div>
			</div>
		`
	}

	render() {
		return html`
			<schmancy-surface
				type="surface"
				rounded="all"
				elevation="1"
				class="venue-card w-full hover:shadow-md cursor-pointer overflow-hidden transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg"
			>
				<div class="p-5">
					${this.renderHeader()} ${this.renderMainContent()}
					<div
						class="expanded-content mt-4 pt-3 border-t border-surface-outline-variant transition-[max-height,opacity] duration-300 ease-in-out overflow-hidden"
						style="${this.expanded
							? ''
							: 'max-height: 0; opacity: 0; padding-top: 0; margin-top: 0; border-top: none;'}"
					>
						${this.expanded ? this.renderExpandedContent() : ''}
					</div>
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
