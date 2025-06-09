import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { FacilityEnum, Venue } from 'src/types/booking/venue.types'
import { formatEnum } from './venue-form'

@customElement('venue-info-card')
export class VenueInfoCard extends $LitElement() {
	@property({ type: Object }) venue!: Venue

	// Helper to determine if current day matches the given day
	private isToday(day: string): boolean {
		return new Date().toLocaleDateString('en', { weekday: 'long' }).toLowerCase() === day.toLowerCase()
	}

	// Format time to be more readable (e.g., "9:00" → "9:00 AM")
	private formatTime(time: string): string {
		if (!time) return ''

		const [hours, minutes] = time.split(':').map(Number)
		const period = hours >= 12 ? 'PM' : 'AM'
		const displayHours = hours % 12 || 12 // Convert 0 to 12 for 12 AM

		return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
	}

	private renderOperatingHours() {
		const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

		return html`
			<schmancy-surface type="container" rounded="all">
				<sch-flex flow="row" align="center" class="mb-3">
					<schmancy-icon class="mr-2 text-primary-default">schedule</schmancy-icon>
					<schmancy-typography type="title" token="md">Operating Hours</schmancy-typography>
				</sch-flex>

				<schmancy-grid cols="1fr" gap="md" class="mb-4">
					${days.map(day => {
						const hours = this.venue.operatingHours?.[day as keyof typeof this.venue.operatingHours]
						const isCurrentDay = this.isToday(day)

						return html`
							<sch-flex justify="between" align="center">
								<schmancy-typography type="label" token="lg" weight="${isCurrentDay ? 'bold' : 'normal'}">
									${formatEnum(day)}
									${isCurrentDay ? html`<span class="ml-2 text-xs text-primary-default">(Today)</span>` : ''}
								</schmancy-typography>

								<schmancy-typography
									type="body"
									class="${hours ? 'text-surface-on' : 'text-surface-onVariant'} ${isCurrentDay ? 'font-medium' : ''}"
								>
									${hours
										? html`${this.formatTime(hours.open)} - ${this.formatTime(hours.close)}`
										: html`<i>Closed</i>`}
								</schmancy-typography>
							</sch-flex>
						`
					})}
				</schmancy-grid>
			</schmancy-surface>
		`
	}

	private renderFacilities() {
		if (!this.venue.facilities || this.venue.facilities.length === 0) return ''

		const facilitiesIcons: Record<string, string> = {
			[FacilityEnum.parking]: 'local_parking',
			[FacilityEnum.wifi]: 'wifi',
			[FacilityEnum.toilets]: 'wc',
			[FacilityEnum.cafe]: 'restaurant',
			[FacilityEnum.lockers]: 'lock',
			[FacilityEnum.showers]: 'shower',
			[FacilityEnum.wheelchairAccess]: 'accessible',
			[FacilityEnum.shop]: 'store',
			[FacilityEnum.childrenArea]: 'child_care',
			// Default icon for unknown facilities
			default: 'check_circle',
		}

		return html`
			<schmancy-surface type="container" rounded="all" class="">
				<sch-flex flow="row" align="center" class="mb-3">
					<schmancy-icon class="mr-2 text-primary-default">stars</schmancy-icon>
					<schmancy-typography type="title" token="md">Facilities</schmancy-typography>
				</sch-flex>

				<schmancy-grid cols="repeat(auto-fill, minmax(140px, 1fr))" gap="md">
					${this.venue.facilities.map(facility => {
						const icon = facilitiesIcons[facility] || facilitiesIcons.default
						const facilityLabel = formatEnum(facility)

						return html`
							<schmancy-surface type="container" rounded="all" class="p-3">
								<sch-flex flow="row" align="center" gap="2">
									<schmancy-icon class="text-secondary-default">${icon}</schmancy-icon>
									<schmancy-typography type="body" token="md">${facilityLabel}</schmancy-typography>
								</sch-flex>
							</schmancy-surface>
						`
					})}
				</schmancy-grid>
			</schmancy-surface>
		`
	}

	private renderAddress() {
		if (!this.venue.address) return ''
		const { street, city, postalCode, country } = this.venue.address
		const addressText = `${street}, ${city}, ${postalCode}, ${country}`
		const mapUrl = this.venue.address.coordinates
			? `https://www.google.com/maps?q=${this.venue.address.coordinates.lat},${this.venue.address.coordinates.lng}`
			: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`

		return html`
			<schmancy-surface type="container" rounded="all" class="">
				<sch-flex flow="row" align="center" class="mb-2">
					<schmancy-icon class="mr-2 text-primary-default">location_on</schmancy-icon>
					<schmancy-typography type="title" token="md">Location</schmancy-typography>
				</sch-flex>

				<schmancy-grid gap="md" class="mb-3">
					<schmancy-typography type="body" token="md" class="text-surface-onVariant"> ${street} </schmancy-typography>

					<schmancy-typography type="body" token="md" class="text-surface-onVariant">
						${city}, ${postalCode}
					</schmancy-typography>

					<schmancy-typography type="body" token="md" class="text-surface-onVariant"> ${country} </schmancy-typography>
				</schmancy-grid>

				<a class="w-full text-primary-default flex gap-2" href="${mapUrl}" target="_blank">
					<schmancy-icon slot="prefix">directions</schmancy-icon>
					Get Directions
				</a>
			</schmancy-surface>
		`
	}

	private renderContactInfo() {
		if (!this.venue.contactPhone && !this.venue.contactEmail && !this.venue.website) return ''

		return html`
			<schmancy-surface type="container" rounded="all" class="">
				<sch-flex flow="row" align="center" class="mb-3">
					<schmancy-icon class="mr-2 text-primary-default">contact_support</schmancy-icon>
					<schmancy-typography type="title" token="md">Contact Information</schmancy-typography>
				</sch-flex>

				<schmancy-grid gap="md">
					${this.venue.contactPhone
						? html`
								<sch-flex flow="row" align="center">
									<schmancy-icon class="mr-3 text-secondary-default">phone</schmancy-icon>
									<schmancy-typography type="body" token="md">
										<a href="tel:${this.venue.contactPhone}" class="text-primary-default">
											${this.venue.contactPhone}
										</a>
									</schmancy-typography>
								</sch-flex>
						  `
						: ''}
					${this.venue.contactEmail
						? html`
								<sch-flex flow="row" align="center">
									<schmancy-icon class="mr-3 text-secondary-default">email</schmancy-icon>
									<schmancy-typography type="body" token="md">
										<a href="mailto:${this.venue.contactEmail}" class="text-primary-default">
											${this.venue.contactEmail}
										</a>
									</schmancy-typography>
								</sch-flex>
						  `
						: ''}
					${this.venue.website
						? html`
								<sch-flex flow="row" align="center">
									<schmancy-icon class="mr-3 text-secondary-default">language</schmancy-icon>
									<schmancy-typography type="body" token="md">
										<a href="${this.venue.website}" target="_blank" class="text-primary-default">
											${this.venue.website}
										</a>
									</schmancy-typography>
								</sch-flex>
						  `
						: ''}
				</schmancy-grid>
			</schmancy-surface>
		`
	}

	render() {
		if (!this.venue) {
			return html`
				<schmancy-surface type="container" rounded="all" class="p-5">
					<sch-flex justify="center" align="center" class="h-64">
						<schmancy-spinner></schmancy-spinner>
					</sch-flex>
				</schmancy-surface>
			`
		}

		return html`
			<schmancy-surface type="container" rounded="all" class="h-full">
				<!-- Main Content -->
				<schmancy-grid class="py-8" cols="1fr" gap="lg">
					${this.renderAddress()} ${this.renderContactInfo()} ${this.renderFacilities()} ${this.renderOperatingHours()}
				</schmancy-grid>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'venue-info-card': VenueInfoCard
	}
}
