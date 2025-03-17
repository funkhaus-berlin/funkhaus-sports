import { area, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { venuesContext } from 'src/admin/venues/venue-context'
import { Venue } from 'src/db/venue-collection'
import { CourtBookingSystem } from 'src/public/book/book'
import './venue.card'

@customElement('venue-landing-page')
export class VenueLandingPage extends $LitElement() {
	@select(venuesContext)
	venues!: Map<string, Venue>

	@state() loading: boolean = true

	// Handle venue card click to navigate to booking
	private handleVenueClick(venue: Venue) {
		area.push({
			component: CourtBookingSystem,
			area: 'root',
			state: { venueId: venue.id },
		})
	}

	firstUpdated() {
		// Simulate data loading
		setTimeout(() => {
			this.loading = false
		}, 300)
	}

	render() {
		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all" elevation="0">
				<div class="flex flex-col items-center px-4 sm:px-6 py-8 max-w-md mx-auto">
					<!-- Logo Section -->
					<div class="text-center mb-10">
						<img src="/logo.svg" alt="Funkhaus Sports Logo" class="w-20 h-20 mx-auto mb-4" />
						<schmancy-typography type="display" token="sm" class="mb-4">
							<schmancy-animated-text>Funkhaus Sports</schmancy-animated-text>
						</schmancy-typography>
					</div>

					<!-- Content Section with Loading State -->
					${when(
						this.loading,
						() => html`
							<div class="flex justify-center items-center h-40 w-full">
								<schmancy-spinner size="40px"></schmancy-spinner>
							</div>
						`,
						() => html`
							<div class="w-full">
								<div class="grid gap-6 w-full">
									${repeat(
										Array.from(this.venues.values()),
										venue => venue.id,
										venue => html`
											<div class="w-full">
												<funkhaus-venue-card
													.venue=${venue}
													@click=${() => this.handleVenueClick(venue)}
													.theme=${venue.theme!}
													class="w-full transform transition-transform duration-150 hover:-translate-y-1"
												>
													<slot slot="stripe-element" name="stripe-element"></slot>
												</funkhaus-venue-card>
											</div>
										`,
									)}
								</div>
							</div>
						`,
					)}
				</div>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'venue-landing-page': VenueLandingPage
	}
}
