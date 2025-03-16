import { fullHeight, select, sheet, TableColumn } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { venuesContext } from '../venue-context'
import { formatEnum } from '../venue-form'
import { courtsContext } from './context'
import { CourtForm } from './court-form'

// --- Court Management Component ---
@customElement('court-management')
export class CourtManagement extends $LitElement() {
	@select<Court, Court>(courtsContext)
	courts!: Map<string, Court>

	@select(venuesContext, (venues: Map<string, Venue>) => Array.from(venues.values()))
	venues: Venue[] = []

	@property({ type: String }) venueId: string = ''
	@state() loading: boolean = true
	@state() error: string | null = null
	@state() selectedVenueId: string = ''

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
				const venue = this.venues.find(v => v.id === court.venueId)
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
					@click=${() => {
						sheet.open({
							component: new CourtForm(court),
						})
					}}
					title="Edit"
					>edit</schmancy-icon-button
				>
			`,
		},
	]

	// If venueId is provided, use it as the filter
	connectedCallback() {
		super.connectedCallback()
		if (this.venueId) {
			this.selectedVenueId = this.venueId
		}
	}

	// Handle venue selection change
	handleVenueChange(e: CustomEvent) {
		this.selectedVenueId = e.detail.value
	}

	// Get filtered courts based on venue selection
	getFilteredCourts() {
		if (!this.selectedVenueId) {
			return Array.from(this.courts.values())
		}

		return Array.from(this.courts.values()).filter(court => court.venueId === this.selectedVenueId)
	}

	render() {
		// Hide venue filter if venueId is provided as a property
		const showVenueFilter = !this.venueId

		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all" elevation="1">
				<div ${fullHeight()} class="max-w-4xl mx-auto p-4 h-full grid grid-rows-[auto_auto_1fr] gap-4">
					<schmancy-flex justify="between" align="center" class="pb-4">
						<schmancy-typography type="headline">Court Management</schmancy-typography>
						<schmancy-button
							variant="filled"
							@click=${() => {
								const courtForm = new CourtForm()
								// Pre-select venue if filtering
								if (this.selectedVenueId) {
									courtForm.court.venueId = this.selectedVenueId
								}
								sheet.open({
									component: courtForm,
								})
							}}
						>
							<schmancy-icon>add</schmancy-icon>Add Court
						</schmancy-button>
					</schmancy-flex>

					${when(
						showVenueFilter,
						() => html`
							<schmancy-flex justify="start" align="center" class="pb-2">
								<schmancy-select
									label="Filter by Venue"
									class="w-64"
									.value=${this.selectedVenueId}
									@change=${this.handleVenueChange}
								>
									<schmancy-option value="" label="All Venues">All Venues</schmancy-option>
									${this.venues.map(
										venue => html`
											<schmancy-option .value=${venue.id} .label=${venue.name}> ${venue.name} </schmancy-option>
										`,
									)}
								</schmancy-select>
							</schmancy-flex>
						`,
					)}
					${when(
						this.error,
						() => html`<schmancy-alert variant="error">${this.error}</schmancy-alert>`,
						() =>
							when(courtsContext.ready === true, () =>
								when(
									this.getFilteredCourts().length === 0,
									() => html`<schmancy-empty-state
										icon="sports_tennis"
										title="${this.selectedVenueId ? 'No Courts Found for This Venue' : 'No Courts Found'}"
										description="${this.selectedVenueId
											? 'Add a court to this venue to get started.'
											: 'Add a court to get started managing your sports facilities.'}"
									>
										<schmancy-button
											variant="filled"
											@click=${() => {
												const courtForm = new CourtForm()
												// Pre-select venue if filtering
												if (this.selectedVenueId) {
													courtForm.court.venueId = this.selectedVenueId
												}
												sheet.open({
													component: courtForm,
												})
											}}
										>
											Add Your First Court
										</schmancy-button>
									</schmancy-empty-state>`,
									() => html`<schmancy-table-v2
										.cols=${this.columns.map(_ => '1fr').join(' ')}
										.columns=${showVenueFilter ? this.columns : this.columns.filter(col => col.name !== 'Venue')}
										.data=${this.getFilteredCourts()}
										sortable
									></schmancy-table-v2>`,
								),
							),
					)}
				</div>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'court-management': CourtManagement
	}
}
