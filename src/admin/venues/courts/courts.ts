import { fullHeight, select, sheet, TableColumn } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { takeUntil } from 'rxjs'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { formatEnum } from '../components/venue-form'
import { venuesContext } from '../venue-context'
import { courtsContext, selectMyCourts } from './context'
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

		selectMyCourts.pipe(takeUntil(this.disconnecting)).subscribe(courts => {
			console.log('selected', courts)
			this.courts = courts
			this.loading = false
			this.requestUpdate()
		})
	}

	// Handle venue selection change
	handleVenueChange(e: CustomEvent) {
		this.selectedVenueId = e.detail.value
	}

	render() {
		return html`
			<schmancy-grid class="py-4" gap="md" ${fullHeight()} rows="auto 1fr">
				<schmancy-nav-drawer-appbar>
					<schmancy-grid cols="auto 1fr auto" gap="md" align="center">
						<schmancy-typography type="headline" token="sm"> Courts Management </schmancy-typography>
						<span></span>
						<schmancy-button
							variant="filled"
							@click=${() => {
								const courtForm = new CourtForm()
								sheet.open({
									component: courtForm,
								})
							}}
						>
							<schmancy-icon>add</schmancy-icon>Add Court
						</schmancy-button>
					</schmancy-grid>
				</schmancy-nav-drawer-appbar>
				${when(
					courtsContext.ready === true,
					() =>
						html`<schmancy-table-v2
							.cols=${this.columns.map(_ => '1fr').join(' ')}
							.columns=${this.columns}
							.data=${Array.from(this.courts.values())}
							sortable
						></schmancy-table-v2>`,
				)}
			</schmancy-grid>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-venue-courts': VenueCourts
	}
}
