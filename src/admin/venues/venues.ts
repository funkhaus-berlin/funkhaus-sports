// src/admin/venues/venues.ts
import { area, fullHeight, select, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { Venue } from 'src/db/venue-collection'
import './admin-venue-card' // Import admin venue card
import { VenueForm } from './components/venue-form'
import { venuesContext } from './venue-context'
import { VenueDetailView } from './venue-detail'
// --- Venue Management Component ---
@customElement('venue-management')
export class VenueManagement extends $LitElement() {
	@select(venuesContext, undefined, {
		required: true,
	})
	venues!: Map<string, Venue>

	@state() loading: boolean = true
	@state() error: string | null = null
	@state() selectedVenue: Venue | null = null
	@state() searchQuery: string = ''

	// Get venues filtered by search query
	getFilteredVenues(): Venue[] {
		const venues = Array.from(this.venues.values())

		// Filter by search query if present
		return this.searchQuery
			? venues.filter(
					venue =>
						venue.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
						venue.address.city.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
						venue.venueType.toLowerCase().includes(this.searchQuery.toLowerCase()),
			  )
			: venues
	}

	// Handle search query changes
	handleSearchChange(e: CustomEvent) {
		this.searchQuery = e.detail.value
	}

	render() {
		// Otherwise show the venues list
		const venueCount = this.getFilteredVenues().length
		const totalVenues = this.venues.size

		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all" elevation="1">
				<div ${fullHeight()} class="max-w-6xl mx-auto p-6 h-full grid grid-rows-[auto_auto_1fr] gap-4">
					<!-- Header with title -->
					<div class="flex justify-between items-center mb-2">
						<schmancy-typography type="headline">Venue Management</schmancy-typography>
						<schmancy-button
							variant="filled"
							@click=${() => {
								sheet.open({
									component: new VenueForm(),
								})
							}}
						>
							<schmancy-icon>add</schmancy-icon>Add Venue
						</schmancy-button>
					</div>

					<!-- Controls bar with search -->
					<div class="rounded-lg p-3 mb-2">
						<div class="flex flex-col md:flex-row justify-between gap-3">
							<!-- Search input -->
							<sch-input
								placeholder="Search venues..."
								class="w-full md:w-64"
								.value=${this.searchQuery}
								@change=${this.handleSearchChange}
							></sch-input>

							<div class="flex gap-2 items-center">
								<!-- Filter info text -->
								${this.searchQuery
									? html`
											<schmancy-typography type="label" token="sm" class="text-surface-on-variant mr-2">
												Showing ${venueCount} of ${totalVenues} venues
											</schmancy-typography>
									  `
									: ''}
							</div>
						</div>
					</div>

					<div class="overflow-y-auto">
						<div class="flex flex-col gap-4 p-2">
							${this.getFilteredVenues().map(venue => this.renderVenueCard(venue))}
						</div>
					</div>
				</div>
			</schmancy-surface>
		`
	}

	// Render a single venue card with action buttons
	renderVenueCard(venue: Venue) {
		return html`
			<div class="relative group">
				<admin-venue-card
					.venue=${venue}
					@click=${() => {
						area.push({
							component: new VenueDetailView(venue),
							area: 'admin',
						})
					}}
				></admin-venue-card>

				<!-- Floating Action Buttons - visible on hover -->
				<div
					class="absolute top-5 right-5 z-10 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
				>
					<schmancy-button
						variant="filled tonal"
						@click=${(e: Event) => {
							e.stopPropagation() // Prevent venue card click
							sheet.open({
								component: new VenueForm(venue),
							})
						}}
						title="Edit Venue"
					>
						<schmancy-icon>edit</schmancy-icon>
						Edit
					</schmancy-button>
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'venue-management': VenueManagement
	}
}
