import { ActiveRoute, area, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { filter, map, startWith, takeUntil } from 'rxjs'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { VenuBookingsList } from './bookings/bookings'
import './components'
import { VenueAnalytics, VenueCourtsPreview } from './components'
import { selectMyCourts } from './courts/context'
import { VenueCourts } from './courts/courts'
import './courts/court-routes'
import { venueContext, venuesContext } from './venue-context'
import { VenueManagement } from './venues'

@customElement('venue-detail-view')
export class VenueDetailView extends $LitElement(css`
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-in {
		animation: fadeIn 0.3s ease-out forwards;
	}

	.animate-in-delay-1 {
		animation: fadeIn 0.3s ease-out 0.1s forwards;
		opacity: 0;
	}

	.animate-in-delay-2 {
		animation: fadeIn 0.3s ease-out 0.2s forwards;
		opacity: 0;
	}

	.main-content {
		height: calc(100% - 1rem);
		display: grid;
		grid-template-rows: auto 1fr;
		gap: 1rem;
		overflow: hidden;
	}
`) {
	@property({ type: Object }) venue!: Venue
	@state() loading: boolean = true
	@state() error: string | null = null
	@state() courts!: Map<string, Court>
	@state() activeTab: string = 'venue-courts-preview'
	@state() fullScreen = false
	@state() venueId: string = ''

	// Add a select for venue context to ensure data is properly loaded
	@select(venueContext, undefined, {
		required: true,
	})
	venueData!: Partial<Venue>

	// Add a select for venues context to retrieve venue by ID if needed
	@select(venuesContext, undefined, {
		required: true,
	})
	venues!: Map<string, Venue>

	constructor(venue?: Venue) {
		super()
		if (venue) {
			this.venue = venue
			this.venueId = venue.id
		}
	}

	connectedCallback(): void {
		super.connectedCallback()

		// Signal that this component should be fullscreen
		this.dispatchEvent(new CustomEvent('fullscreen', { bubbles: true, composed: true, detail: true }))

		// Get venueId from URL parameters if available
		const urlParams = new URLSearchParams(window.location.search)
		const paramVenueId = urlParams.get('venueId')

		// If we have a venue ID from params, use it to ensure we have the correct venue
		if (paramVenueId) {
			this.venueId = paramVenueId
			console.log('Using venueId from URL params:', this.venueId)
		} else if (this.venueData?.id) {
			// Otherwise use the ID from context
			this.venueId = this.venueData.id
			console.log('Using venueId from context:', this.venueId)
		}

		// If we have a venueId but no venue object yet, try to get it from the venues map
		if (this.venueId && !this.venue && this.venues) {
			const venueFromMap = this.venues.get(this.venueId)
			if (venueFromMap) {
				this.venue = venueFromMap
				// Also update the context to ensure consistency
				if (!this.venueData || this.venueData.id !== this.venueId) {
					console.log('Updating venue context from venues map:', venueFromMap)
					venueContext.set(venueFromMap)
				}
			}
		}

		// Log the current venue state for debugging
		console.log('VenueDetailView connected with venueId:', this.venueId, 'and venue:', this.venue)

		// Subscribe to courts for this venue
		selectMyCourts.pipe(startWith(new Map<string, Court>()), takeUntil(this.disconnecting)).subscribe({
			next: courts => {
				console.log('VenueDetailView: courts loaded:', courts.size)
				this.courts = courts
				this.loading = false
			},
			error: err => {
				console.error('VenueDetailView: Error loading courts:', err)
				this.error = 'Error loading courts'
				this.loading = false
			},
		})

		// Track active tab in venue area
		area.$current
			.pipe(
				filter(r => r.has('venue')),
				map(r => r.get('venue') as ActiveRoute),
				takeUntil(this.disconnecting),
			)
			.subscribe(r => {
				this.activeTab = r.component.toLowerCase()
			})
	}

	handleBackClick() {
		this.dispatchEvent(new CustomEvent('back-to-venues'))
	}

	render() {
		const courtsCount = this.courts?.size || 0
		const contentDrawerClasses = {
			'rounded-lg px-4 sm:px-6 md:px-8': this.fullScreen === false,
		}

		// Show error message if there's an error loading courts
		if (this.error) {
			console.warn('VenueDetailView: Showing error state:', this.error)
		}

		return html`
			<schmancy-nav-drawer .fullscreen=${this.fullScreen}>
				<schmancy-nav-drawer-navbar .hidden=${this.fullScreen} width="200px">
					<schmancy-grid class="h-full" rows="1fr auto">
						<!-- Back Button -->
						<schmancy-list>
							<!-- Courts Item -->
							<schmancy-list-item
								.selected=${this.activeTab === 'funkhaus-venue-courts'}
								@click=${() => {
									// Ensure venue context is properly set before navigating
									if (this.venue) {
										console.log('Setting venue context before navigating to courts:', this.venue)
										venueContext.set(this.venue)
									} else {
										console.warn('No venue object available when navigating to courts')
									}

									// Add the venueId to both state and URL query params for better propagation
									setTimeout(() => {
										const state = { venueId: this.venueId }
										const url = new URL(window.location.href)
										url.searchParams.set('venueId', this.venueId)

										// Update URL without navigating
										window.history.replaceState(state, '', url.toString())

										// Then navigate to the courts component
										area.push({
											component: VenueCourts,
											area: 'venue',
											state: state,
										})
									}, 100)
								}}
								rounded
								variant="container"
							>
								<schmancy-flex gap="md">
									<schmancy-icon>sports_tennis</schmancy-icon>
									Courts (${courtsCount})
								</schmancy-flex>
							</schmancy-list-item>

							<schmancy-list-item
								.selected=${this.activeTab === 'venue-bookings'}
								@click=${() => {
									// Ensure venue context is properly set before navigating
									if (this.venue) {
										console.log('Setting venue context before navigating to bookings:', this.venue)
										venueContext.set(this.venue)
									} else {
										console.warn('No venue object available when navigating to bookings')
									}

									// Add the venueId to URL for consistency
									setTimeout(() => {
										const state = { venueId: this.venueId }
										const url = new URL(window.location.href)
										url.searchParams.set('venueId', this.venueId)

										// Update URL without navigating
										window.history.replaceState(state, '', url.toString())

										area.push({
											component: VenuBookingsList,
											area: 'venue',
											state: state,
										})
									}, 100)
								}}
								rounded
								variant="container"
							>
								<schmancy-flex gap="md">
									<schmancy-icon>calendar_month</schmancy-icon>
									Bookings
								</schmancy-flex>
							</schmancy-list-item>
							<!-- Analytics Item -->
							<schmancy-list-item
								.selected=${this.activeTab === VenueCourtsPreview.name.toLowerCase()}
								@click=${() => {
									// Ensure venue context is properly set before navigating
									if (this.venue) {
										console.log('Setting venue context before navigating to analytics:', this.venue)
										venueContext.set(this.venue)
									} else {
										console.warn('No venue object available when navigating to analytics')
									}

									// Add the venueId to URL for consistency
									setTimeout(() => {
										const state = { venueId: this.venueId }
										const url = new URL(window.location.href)
										url.searchParams.set('venueId', this.venueId)

										// Update URL without navigating
										window.history.replaceState(state, '', url.toString())

										area.push({
											component: VenueAnalytics,
											area: 'venue',
											state: state,
										})
									}, 100)
								}}
								rounded
								variant="container"
							>
								<schmancy-flex gap="md">
									<schmancy-icon>insights</schmancy-icon>
									Analytics
								</schmancy-flex>
							</schmancy-list-item>
						</schmancy-list>

						<schmancy-button
							@click=${() => {
								// Turn off fullscreen mode
								this.dispatchEvent(new CustomEvent('fullscreen', { bubbles: true, composed: true, detail: false }))

								// Navigate back to venue management with slight delay to ensure event is processed
								setTimeout(() => {
									area.push({
										component: VenueManagement,
										area: 'admin',
										historyStrategy: 'replace', // Replace history to prevent back button issues
									})
								}, 50)
							}}
							variant="filled tonal"
						>
							<schmancy-icon>arrow_back</schmancy-icon>
							Back
						</schmancy-button>
					</schmancy-grid>
				</schmancy-nav-drawer-navbar>

				<schmancy-nav-drawer-content class=${this.classMap(contentDrawerClasses)}>
					${this.error
						? html`
								<div class="p-5 text-center bg-error-container rounded-lg mt-5">
									<schmancy-icon style="font-size: 48px;" class="text-error-default mb-3">error_outline</schmancy-icon>
									<p class="text-error-on-container mb-2">${this.error}</p>
									<p class="text-error-on-container text-sm">
										<schmancy-button @click=${() => window.location.reload()} variant="filled">Retry</schmancy-button>
									</p>
								</div>
						  `
						: html`
								<schmancy-area
									${fullHeight()}
									name="venue"
									class="animate-in-delay-1"
									.default=${VenueCourts}
								></schmancy-area>
						  `}
				</schmancy-nav-drawer-content>
			</schmancy-nav-drawer>
		`
	}
}
