import { fullHeight, select, sheet, TableColumn } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { Court } from 'src/db/courts.collection'
import { courtsContext } from './context'
import { CourtForm, formatEnum } from './form'

// --- Court Management Component ---
@customElement('court-management')
export class CourtManagement extends $LitElement() {
	@select(courtsContext, undefined, {
		required: true,
	})
	courts!: Map<string, Court>
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

	render() {
		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all" elevation="1">
				<div ${fullHeight()} class="max-w-4xl mx-auto p-4 h-full grid grid-rows-[auto_1fr] gap-4">
					<schmancy-flex justify="between" align="center" class="pb-4">
						<schmancy-typography type="headline">Court Management</schmancy-typography>
						<schmancy-button
							variant="filled"
							@click=${() => {
								sheet.open({
									component: new CourtForm(),
								})
							}}
						>
							<schmancy-icon>add</schmancy-icon>Add Court
						</schmancy-button>
					</schmancy-flex>

					${when(
						this.error,
						() => html`<schmancy-alert variant="error">${this.error}</schmancy-alert>`,
						() =>
							when(courtsContext.ready === true, () =>
								when(
									this.courts.size === 0,
									() => html`<schmancy-empty-state
										icon="sports_tennis"
										title="No Courts Found"
										description="Add a court to get started managing your sports facilities."
									>
										<schmancy-button
											variant="filled"
											@click=${() => {
												sheet.open({
													component: new CourtForm(),
												})
											}}
										>
											Add Your First Court
										</schmancy-button>
									</schmancy-empty-state>`,
									() => html`<schmancy-table-v2
										.cols=${this.columns.map(col => '1fr').join(' ')}
										.columns=${this.columns}
										.data=${Array.from(this.courts.values())}
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
