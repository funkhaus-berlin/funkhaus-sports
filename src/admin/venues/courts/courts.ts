import { area, fullHeight, select, TableColumn } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { takeUntil } from 'rxjs'
import { Court } from 'src/types/booking/court.types'
import { createCourt } from 'src/db/courts.collection'
import { Venue } from 'src/types/booking/venue.types'
import { formatEnum } from '../components/venue-form'
import { venueContext, venuesContext } from '../venue-context'
import { courtsContext, selectedCourtContext, selectMyCourts } from './context'
import { CourtForm } from './court-form'

// --- Court Management Component ---
@customElement('funkhaus-venue-courts')
export class VenueCourts extends $LitElement() {
	@state()
	courts!: Map<string, Court>

	@select(venuesContext)
	venues!: Map<string, Venue>

	@property({ type: String }) venueId: string = ''
	@state() loading: boolean = true
	@state() error: string | null = null

	// Status configuration
	private statusConfig = {
		active: { label: 'Active', icon: 'visibility', next: 'maintenance', nextLabel: 'Under Maintenance' },
		maintenance: { label: 'Maintenance', icon: 'construction', next: 'inactive', nextLabel: 'Inactive' },
		inactive: { label: 'Inactive', icon: 'visibility_off', next: 'active', nextLabel: 'Active' },
	}

	// Table columns definition
	private columns: TableColumn[] = [
		{ name: 'Name', key: 'name', align: 'left', sortable: true },
		{
			name: 'Venue',
			align: 'left',
			render: (court: Court) => {
				const venue = Array.from(this.venues.values()).find(v => v.id === court.venueId)
				return venue ? venue.name : 'Unknown Venue'
			},
		},
		{
			name: 'Type',
			align: 'left',
			render: (court: Court) => formatEnum(court.courtType || ''),
		},
		{
			name: 'Sports',
			align: 'left',
			render: (court: Court) => court.sportTypes?.map(formatEnum).join(', ') || '',
		},
		{
			name: 'Rate',
			align: 'left',
			render: (court: Court) => html`€${(court.pricing?.baseHourlyRate ?? 0).toFixed(2)}`,
		},
		{
			name: 'Status',
			align: 'left',
			render: (court: Court) => {
				return html`
					<sch-badge
						@click=${(e: Event) => {
							e.preventDefault()
						}}
					>
						${court.status}
					</sch-badge>
				`
			},
		},
		{
			name: ' ',
			align: 'right',
			render: (court: Court) => html`
				<schmancy-icon-button @click=${() => this.navigateToCourtDetail(court.id)} title="Edit"
					>edit</schmancy-icon-button
				>
			`,
		},
	]

	@select(venueContext)
	venueData!: Partial<Venue>

	connectedCallback() {
		super.connectedCallback()
		this.loading = true

		// Get venueId from context if available
		if (this.venueData?.id) {
			this.venueId = this.venueData.id
		}

		// Fetch courts
		selectMyCourts.pipe(takeUntil(this.disconnecting)).subscribe({
			next: courts => {
				this.courts = courts
				this.loading = false
				this.requestUpdate()
			},
			error: err => {
				console.error('Error loading courts:', err)
				this.error = 'Failed to load courts. Please try again.'
				this.loading = false
				this.requestUpdate()
			},
		})
	}

	// Method to navigate to the court detail page for a new court
	addNewCourt() {
		selectedCourtContext.set(createCourt(this.venueId))

		area.push({
			component: new CourtForm(createCourt(this.venueId)),

			area: 'venue',
		})
	}

	// Method to navigate to the court detail page for an existing court
	navigateToCourtDetail(courtId: string) {
		selectedCourtContext.set(courtsContext.value.get(courtId)!)
		area.push({
			component: new CourtForm(courtsContext.value.get(courtId)!),
			area: 'venue',
		})
	}

	render() {
		return html`
			<schmancy-grid class="py-4" gap="md" ${fullHeight()} rows="auto 1fr">
				<schmancy-nav-drawer-appbar>
					<schmancy-grid cols="auto 1fr auto" gap="md" align="center">
						<schmancy-typography type="headline" token="sm">
							Courts Management
							${when(
								this.venueData?.name,
								() => html`<span class="text-sm ml-2 text-surface-on-variant">(${this.venueData.name})</span>`,
							)}
						</schmancy-typography>
						<span></span>
						<schmancy-button
							variant="filled"
							@click=${() => this.addNewCourt()}
							?disabled=${!this.venueId || this.loading}
						>
							<schmancy-icon>add</schmancy-icon>Add Court
						</schmancy-button>
					</schmancy-grid>
				</schmancy-nav-drawer-appbar>

				<!-- Content Area with Loading, Error, and Data States -->
				<div>
					${when(
						this.loading,
						() => html`
							<div class="flex-1 flex items-center justify-center">
								<div class="text-center">
									<div
										class="inline-block w-8 h-8 border-4 border-t-primary-default border-r-outlineVariant border-b-outlineVariant border-l-outlineVariant rounded-full animate-spin mb-3"
									></div>
									<div>Loading courts...</div>
								</div>
							</div>
						`,
						() =>
							when(
								this.error,
								() => html`
									<div class="flex-1 flex items-center justify-center">
										<div class="bg-error-container p-6 rounded-lg text-center max-w-md">
											<schmancy-icon size="32px" class="text-error-default mb-2">error_outline</schmancy-icon>
											<p class="text-error-on-container mb-4">${this.error}</p>
											<schmancy-button @click=${() => window.location.reload()} variant="filled">Retry</schmancy-button>
										</div>
									</div>
								`,
								() =>
									when(courtsContext.ready === true, () =>
										when(
											this.courts && this.courts.size > 0,
											() => html`
												<schmancy-table
													.cols=${this.columns.map(_ => '1fr').join(' ')}
													.columns=${this.columns}
													.data=${Array.from(this.courts.values()).sort((a, b) => {
											// Natural sort that handles numbers properly
											return a.name.localeCompare(b.name, undefined, { 
												numeric: true, 
												sensitivity: 'base' 
											})
										})}
													sortable
												></schmancy-table>
											`,
											() => html`
												<div class="flex-1 flex items-center justify-center">
													<div class="text-center p-6">
														<schmancy-icon size="48px" class="text-surface-on-variant opacity-50 mb-3"
															>sports_tennis</schmancy-icon
														>
														<p class="mb-4">No courts found for this venue.</p>
														<schmancy-button variant="filled" @click=${() => this.addNewCourt()}>
															<schmancy-icon>add</schmancy-icon>Add Court
														</schmancy-button>
													</div>
												</div>
											`,
										),
									),
							),
					)}
				</div>
			</schmancy-grid>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-venue-courts': VenueCourts
	}
}
