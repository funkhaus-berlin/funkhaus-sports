// src/admin/venues/venue-detail.ts
import { fullHeight, sheet, TableColumn } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { takeUntil } from 'rxjs'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { courtsContext, selectMyCourts } from './courts/context'
import { CourtForm } from './courts/court-form'
import { formatEnum, VenueForm } from './venue-form'

@customElement('venue-detail-view')
export class VenueDetailView extends $LitElement(css`
	.header-panel {
		background: linear-gradient(
			to right,
			var(--schmancy-sys-color-surface-container, #efefef),
			var(--schmancy-sys-color-surface-highest, #ffffff)
		);
		border-radius: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.info-section {
		margin-bottom: 1.5rem;
	}

	.info-title {
		color: var(--schmancy-sys-color-primary-default, #6750a4);
		margin-bottom: 0.5rem;
		font-weight: 500;
	}

	.info-item {
		display: flex;
		align-items: flex-start;
		margin-bottom: 0.75rem;
	}

	.info-icon {
		color: var(--schmancy-sys-color-primary-default, #6750a4);
		margin-right: 0.75rem;
		margin-top: 0.125rem;
	}

	.facility-tag {
		display: inline-flex;
		align-items: center;
		background-color: var(--schmancy-sys-color-surface-low, #f5f5f5);
		padding: 0.25rem 0.5rem;
		border-radius: 1rem;
		margin-right: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.facility-tag-icon {
		margin-right: 0.25rem;
	}

	.hours-container {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 0.5rem 2rem;
	}

	.day-row {
		display: flex;
		justify-content: space-between;
		padding: 0.375rem 0;
		border-bottom: 1px solid var(--schmancy-sys-color-surface-outline-variant, #e0e0e0);
	}

	.today-row {
		background-color: var(--schmancy-sys-color-primary-container, #eaddff);
		border-radius: 0.25rem;
		padding: 0.375rem 0.5rem;
		margin: 0 -0.5rem;
		border-bottom: none;
		font-weight: 500;
	}

	.court-count-badge {
		background-color: var(--schmancy-sys-color-primary-default, #6750a4);
		color: var(--schmancy-sys-color-primary-on, #ffffff);
		border-radius: 1rem;
		padding: 0.25rem 0.75rem;
		font-weight: 500;
		display: inline-flex;
		align-items: center;
	}

	.court-count-icon {
		margin-right: 0.375rem;
	}

	.courts-table {
		border-radius: 0.5rem;
		overflow: hidden;
	}

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
`) {
	@property({ type: Object }) venue!: Venue
	@state() loading: boolean = true
	@state() error: string | null = null

	// Status configuration for courts display
	private statusConfig = {
		active: { label: 'Active', icon: 'visibility', next: 'maintenance', nextLabel: 'Under Maintenance' },
		maintenance: { label: 'Maintenance', icon: 'construction', next: 'inactive', nextLabel: 'Inactive' },
		inactive: { label: 'Inactive', icon: 'visibility_off', next: 'active', nextLabel: 'Active' },
	}

	@state()
	courts!: Map<string, Court>

	// Table columns definition for courts
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

	connectedCallback(): void {
		super.connectedCallback()
		selectMyCourts.pipe(takeUntil(this.disconnecting)).subscribe(courts => {
			this.courts = courts
			this.requestUpdate()
		})
	}
	handleEditVenue() {
		sheet.open({
			component: new VenueForm(this.venue),
		})
	}

	handleBackClick() {
		this.dispatchEvent(new CustomEvent('back-to-venues'))
	}

	handleAddCourt() {
		const newCourt = new CourtForm()
		// Pre-populate the venueId for the new court and disable venue selection
		newCourt.court.venueId = this.venue.id
		newCourt.venueSelectionDisabled = true

		sheet.open({
			component: newCourt,
		})
	}

	// Format facility tags with icons
	getFacilityTags() {
		if (!this.venue.facilities || this.venue.facilities.length === 0) {
			return html`<div class="text-surface-on-variant italic">No facilities listed</div>`
		}

		const iconMap: Record<string, string> = {
			shower: 'shower',
			lockers: 'lock',
			parking: 'local_parking',
			restaurant: 'restaurant',
			wifi: 'wifi',
			accessibilityFeatures: 'accessible',
			lighting: 'lightbulb',
		}

		return html`
			<div class="flex flex-wrap -mb-2">
				${this.venue.facilities.map(
					facility => html`
						<div class="facility-tag">
							<schmancy-icon class="facility-tag-icon" size="16px"
								>${iconMap[facility] || 'sports_tennis'}</schmancy-icon
							>
							<span class="text-sm">${formatEnum(facility)}</span>
						</div>
					`,
				)}
			</div>
		`
	}

	// Render operating hours in a clean format
	renderOperatingHours() {
		return html`
			<div class="hours-container">
				${['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
					const hours = this.venue.operatingHours?.[day as keyof typeof this.venue.operatingHours]
					const isToday = new Date().toLocaleDateString('en', { weekday: 'long' }).toLowerCase() === day

					return html`
						<div class="day-row ${isToday ? 'today-row' : ''}">
							<div class="font-medium">${formatEnum(day)}</div>
							<div class="${hours ? '' : 'text-surface-on-variant italic'}">
								${hours ? `${hours.open} - ${hours.close}` : 'Closed'}
							</div>
						</div>
					`
				})}
			</div>
		`
	}

	render() {
		const courtsCount = this.courts?.size || 0
		const status = this.venue.status || 'inactive'

		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all" elevation="1">
				<div ${fullHeight()} class="max-w-6xl mx-auto p-6 h-full grid grid-rows-[auto_1fr] gap-4">
					<!-- Header with venue title and back button -->
					<div class="header-panel p-5 animate-in">
						<div class="flex justify-between items-start mb-2">
							<schmancy-flex align="center" gap="sm">
								<schmancy-icon-button @click=${this.handleBackClick} title="Back to Venues" class="mr-1">
									arrow_back
								</schmancy-icon-button>
								<div>
									<div class="flex items-center space-x-3">
										<schmancy-typography type="headline" token="sm">${this.venue.name}</schmancy-typography>
										<schmancy-chip
											.selected=${status === 'active'}
											.label=${status === 'active' ? 'Open' : status === 'maintenance' ? 'Maintenance' : 'Closed'}
											readOnly
										>
											${status === 'active' ? 'check_circle' : status === 'maintenance' ? 'construction' : 'cancel'}
										</schmancy-chip>
									</div>
									<schmancy-typography type="label" token="md" class="text-surface-on-variant">
										${formatEnum(this.venue.venueType)}
									</schmancy-typography>
								</div>
							</schmancy-flex>

							<div class="flex space-x-3">
								<div class="court-count-badge">
									<schmancy-icon class="court-count-icon" size="20px">sports_tennis</schmancy-icon>
									<span>${courtsCount} ${courtsCount === 1 ? 'Court' : 'Courts'}</span>
								</div>

								<schmancy-button variant="filled" @click=${this.handleEditVenue}>
									<schmancy-icon>edit</schmancy-icon>Edit Venue
								</schmancy-button>
							</div>
						</div>

						<!-- Address bar just below the header -->
						<schmancy-flex align="center" class="mt-4">
							<schmancy-icon class="info-icon">location_on</schmancy-icon>
							<schmancy-typography type="body">
								${this.venue.address.street}, ${this.venue.address.city}, ${this.venue.address.postalCode},
								${this.venue.address.country}
							</schmancy-typography>
						</schmancy-flex>
					</div>

					<!-- Main content area with info and courts -->
					<div class="overflow-y-auto">
						<!-- Venue details cards -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 animate-in" style="animation-delay: 0.1s">
							<!-- Left column -->
							<schmancy-surface type="containerLow" rounded="all" class="p-5">
								<!-- Description -->
								${this.venue.description
									? html`
											<div class="info-section">
												<div class="info-title">About</div>
												<schmancy-typography type="body">${this.venue.description}</schmancy-typography>
											</div>
									  `
									: ''}

								<!-- Operating hours -->
								<div class="info-section">
									<div class="info-title">Operating Hours</div>
									${this.renderOperatingHours()}
								</div>
							</schmancy-surface>

							<!-- Right column -->
							<schmancy-surface type="containerLow" rounded="all" class="p-5">
								<!-- Facilities -->
								<div class="info-section">
									<div class="info-title">Facilities</div>
									${this.getFacilityTags()}
								</div>

								<!-- Contact information -->
								${this.venue.contactEmail || this.venue.contactPhone || this.venue.website
									? html`
											<div class="info-section">
												<div class="info-title">Contact Information</div>

												${this.venue.contactEmail
													? html`
															<div class="info-item">
																<schmancy-icon class="info-icon">email</schmancy-icon>
																<schmancy-typography type="body">${this.venue.contactEmail}</schmancy-typography>
															</div>
													  `
													: ''}
												${this.venue.contactPhone
													? html`
															<div class="info-item">
																<schmancy-icon class="info-icon">phone</schmancy-icon>
																<schmancy-typography type="body">${this.venue.contactPhone}</schmancy-typography>
															</div>
													  `
													: ''}
												${this.venue.website
													? html`
															<div class="info-item">
																<schmancy-icon class="info-icon">language</schmancy-icon>
																<schmancy-typography type="body">${this.venue.website}</schmancy-typography>
															</div>
													  `
													: ''}
											</div>
									  `
									: ''}

								<!-- Capacity -->
								${this.venue.maxCourtCapacity
									? html`
											<div class="info-section">
												<div class="info-title">Capacity</div>
												<div class="info-item">
													<schmancy-icon class="info-icon">sports_tennis</schmancy-icon>
													<schmancy-typography type="body">
														${this.venue.maxCourtCapacity} courts maximum capacity
													</schmancy-typography>
												</div>
											</div>
									  `
									: ''}
							</schmancy-surface>
						</div>

						<!-- Courts section -->
						<div class="animate-in" style="animation-delay: 0.2s">
							<schmancy-flex justify="between" align="center" class="mb-4">
								<schmancy-typography type="title" token="lg">Courts</schmancy-typography>
								<schmancy-button variant="filled" @click=${this.handleAddCourt}>
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
											() => html`
												<schmancy-surface type="containerLow" rounded="all" class="py-12">
													<schmancy-empty-state
														icon="sports_tennis"
														title="No Courts Found"
														description="Add courts to this venue to make it available for booking."
													>
														<schmancy-button variant="filled" @click=${this.handleAddCourt}>
															Add First Court
														</schmancy-button>
													</schmancy-empty-state>
												</schmancy-surface>
											`,
											() => html`
												<schmancy-surface type="containerLow" rounded="all" class="courts-table">
													<schmancy-table-v2
														.cols=${this.columns.map(_ => '1fr').join(' ')}
														.columns=${this.columns}
														.data=${Array.from(this.courts.values())}
														sortable
													></schmancy-table-v2>
												</schmancy-surface>
											`,
										),
									),
							)}
						</div>
					</div>
				</div>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'venue-detail-view': VenueDetailView
	}
}
