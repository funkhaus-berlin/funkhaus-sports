import { select, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit' // Removed CSS import since we're not using custom CSS
import { customElement, property } from 'lit/decorators.js'
import { Venue } from 'src/types/booking/venue.types'
import { venueContext } from '../venue-context'
import { VenueForm } from './venue-form'

@customElement('venue-detail-header')
export class VenueDetailHeader extends $LitElement() {
	// Removed CSS parameter
	@select(venueContext) venue!: Venue
	@property({ type: Number }) courtsCount: number = 0

	// Convert status configuration to a method for simplicity
	private getStatusDetails(status: string) {
		const config = {
			active: { color: 'success', icon: 'check_circle', label: 'Open' },
			maintenance: { color: 'warning', icon: 'construction', label: 'Under Maintenance' },
			inactive: { color: 'error', icon: 'cancel', label: 'Closed' },
		}
		return config[status as keyof typeof config] || config.inactive
	}

	// Extracted to separate method
	private openEditForm() {
		sheet.open({
			component: new VenueForm(this.venue),
		})
	}

	render() {
		const status = this.venue.status || 'inactive'
		const statusDetails = this.getStatusDetails(status)

		return html`
			<!-- Header with title and actions -->
			<sch-flex justify="between" align="start">
				<!-- Left side: back button, title and status -->
				<sch-flex>
					<sch-flex align="center" gap="2">
						<schmancy-typography type="headline" token="sm">${this.venue.name}</schmancy-typography>
						<schmancy-chip .selected=${status === 'active'} .label=${statusDetails.label} readOnly>
							${statusDetails.icon}
						</schmancy-chip>
					</sch-flex>
				</sch-flex>

				<!-- Right side: court count and edit button -->
				<sch-flex class="" gap="2">
					<schmancy-button variant="filled" @click=${this.openEditForm}>
						<schmancy-icon>edit</schmancy-icon>
						Edit Venue
					</schmancy-button>
				</sch-flex>
			</sch-flex>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'venue-detail-header': VenueDetailHeader
	}
}
