import { $notify, area, fullHeight, select, TableColumn } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { takeUntil } from 'rxjs'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { formatEnum } from '../components/venue-form'
import { venueContext, venuesContext } from '../venue-context'
import { courtsContext, selectMyCourts } from './context'
import './court-detail'

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
				const status = (court.status as keyof typeof this.statusConfig) || 'inactive'
				const config = this.statusConfig[status]
				return html`
					<schmancy-chip
						@click=${(e: Event) => {
							e.preventDefault()
						}}
						.selected=${status === 'active'}
						.label=${config.label}
						readOnly
					>
						${config.icon}
					</schmancy-chip>
				`
			},
		},
		{
			name: ' ',
			align: 'right',
			render: (court: Court) => html`
				<schmancy-icon-button
					@click=${() => this.navigateToCourtDetail(court.id)}
					title="Edit"
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
		if (this.venueId) {
			// Update URL for bookmarking/sharing without full page navigation
			const url = new URL(window.location.href);
			url.pathname = `/admin/venues/${this.venueId}/courts/new`;
			window.history.pushState({ venueId: this.venueId }, '', url.toString());
			
			// Use Schmancy area to navigate
			area.push({
				component: 'court-detail',
				area: 'venue',
				state: { 
					venueId: this.venueId,
					isNew: true 
				}
			});
		}
	}

	// Method to navigate to the court detail page for an existing court
	navigateToCourtDetail(courtId: string) {
		if (this.venueId) {
			// Get the court from courts map
			const court = this.courts.get(courtId);
			
			if (court) {
				// Update URL for bookmarking/sharing without full page navigation
				const url = new URL(window.location.href);
				url.pathname = `/admin/venues/${this.venueId}/courts/${courtId}`;
				window.history.pushState({ venueId: this.venueId, courtId }, '', url.toString());
				
				// Use Schmancy area to navigate - just pass the ENTIRE court object directly
				area.push({
					component: 'court-detail',
					area: 'venue',
					state: { 
						venueId: this.venueId, 
						courtId,
						courtData: court // Pass the full court object directly
					}
				});
			} else {
				console.error('Court not found in courts map:', courtId);
				$notify.error('Court not found');
			}
		}
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
				<div class="flex flex-col flex-1 overflow-hidden">
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
													.data=${Array.from(this.courts.values())}
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