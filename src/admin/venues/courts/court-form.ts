// src/admin/courts/form.ts
import { $notify, SchmancyInputChangeEvent, SchmancySelectChangeEvent, select, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { takeUntil } from 'rxjs'
import { Court, CourtsDB, CourtTypeEnum, Pricing } from 'src/db/courts.collection'
import { confirm } from 'src/schmancy'
import { venueContext, venuesContext } from '../venue-context'

// Format enum values to display labels
export const formatEnum = (value: string): string =>
	value
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, str => str.toUpperCase())
		.trim()

@customElement('court-form')
export class CourtForm extends $LitElement() {
	@state() court: Partial<Court> = {
		name: '',
		courtType: 'indoor',
		pricing: { baseHourlyRate: 0 },
		status: 'active',
	}

	@select(venuesContext) venues!: Map<string, any>

	@state() busy = false
	@state() isCloning = false

	constructor(private editingCourt?: Court) {
		super()
		if (editingCourt) {
			this.court = { ...editingCourt }
		}
	}

	connectedCallback() {
		super.connectedCallback()

		// If we're not editing a court, set the venueId from context
		if (!this.editingCourt && this.venues?.size > 0) {
			const currentVenueId = venuesContext.value.values().next().value?.id
			if (currentVenueId) {
				this.court = {
					...this.court,
					venueId: currentVenueId,
				}
			}
		}
	}

	render() {
		return html`
			<schmancy-surface type="surface">
				<schmancy-form @submit=${this.onSave} class="py-3 px-5 grid gap-6">
					<!-- Basic Information -->
					<div class="grid gap-3 mb-4">
						<sch-grid>
							<schmancy-typography type="title"
								>${this.isCloning ? 'Clone Court' : this.editingCourt ? 'Edit Court' : 'Add Court'}</schmancy-typography
							>
							<schmancy-divider></schmancy-divider>
						</sch-grid>

						<sch-input
							label="Court Name"
							required
							.value="${this.court.name || ''}"
							@change=${(e: SchmancyInputChangeEvent) => this.updateProps('name', e.detail.value)}
						></sch-input>

						<schmancy-select
							label="Court Type"
							required
							.value=${this.court.courtType || ''}
							@change=${(e: SchmancySelectChangeEvent) => this.updateProps('courtType', e.detail.value as string)}
						>
							${Object.values(CourtTypeEnum).map(
								type =>
									html`<schmancy-option .value=${type} .label=${formatEnum(type)}
										>${formatEnum(type)}</schmancy-option
									>`,
							)}
						</schmancy-select>
					</div>

					<!-- Pricing -->
					<div class="grid gap-3 mb-4">
						<sch-grid>
							<schmancy-typography type="title">Pricing</schmancy-typography>
							<schmancy-divider></schmancy-divider>
						</sch-grid>
						<sch-input
							label="Base Hourly Rate (€)"
							type="number"
							min="0"
							step="0.01"
							required
							.value="${this.court.pricing?.baseHourlyRate?.toString() || '0'}"
							@change=${(e: SchmancyInputChangeEvent) =>
								this.updatePricing('baseHourlyRate', parseFloat(e.detail.value))}
						></sch-input>

						<sch-input
							label="Peak Hour Rate (€)"
							type="number"
							min="0"
							step="0.01"
							.value="${this.court.pricing?.peakHourRate?.toString() || ''}"
							@change=${(e: SchmancyInputChangeEvent) => this.updatePricing('peakHourRate', parseFloat(e.detail.value))}
						></sch-input>

						<sch-input
							label="Weekend Rate (€)"
							type="number"
							min="0"
							step="0.01"
							.value="${this.court.pricing?.weekendRate?.toString() || ''}"
							@change=${(e: SchmancyInputChangeEvent) => this.updatePricing('weekendRate', parseFloat(e.detail.value))}
						></sch-input>
					</div>

					<!-- Status -->
					<div class="grid gap-3 mb-4">
						<sch-grid>
							<schmancy-typography type="title">Status</schmancy-typography>
							<schmancy-divider></schmancy-divider>
						</sch-grid>
						<schmancy-select
							label="Court Status"
							required
							.value=${this.court.status || 'active'}
							@change=${(e: SchmancySelectChangeEvent) => this.updateProps('status', e.detail.value as string)}
						>
							<schmancy-option value="active" label="Active">Active</schmancy-option>
							<schmancy-option value="maintenance" label="Under Maintenance">Under Maintenance</schmancy-option>
							<schmancy-option value="inactive" label="Inactive">Inactive</schmancy-option>
						</schmancy-select>
					</div>

					<!-- Actions -->
					<div class="flex gap-4 justify-between">
						<div>
							${this.editingCourt && !this.isCloning
								? html`
										<schmancy-button @click=${() => this.confirmDelete(this.editingCourt!.id)}>
											<span class="text-error-default flex gap-2">
												<schmancy-icon>delete</schmancy-icon>
												Delete
											</span>
										</schmancy-button>
								  `
								: html``}
						</div>
						<div class="flex gap-2">
							<schmancy-button variant="outlined" @click=${() => sheet.dismiss(this.tagName)}>Cancel</schmancy-button>
							${this.editingCourt && !this.isCloning
								? html`
										<schmancy-button variant="outlined" @click=${this.cloneCourt}>
											<span class="flex gap-2 items-center">
												<schmancy-icon>content_copy</schmancy-icon>
												Clone
											</span>
										</schmancy-button>
								  `
								: html``}
							<schmancy-button variant="filled" type="submit">Save</schmancy-button>
						</div>
					</div>
				</schmancy-form>
			</schmancy-surface>

			${when(this.busy, () => html`<schmancy-busy class="fixed inset-0"></schmancy-busy>`)}
		`
	}

	updateProps(prop: keyof Court, val: string | number | string[]) {
		this.court = { ...this.court, [prop]: val }
	}

	updatePricing(prop: keyof Pricing, val: number) {
		this.court = {
			...this.court,
			pricing: { ...this.court.pricing, [prop]: val } as Pricing,
		}
	}

	cloneCourt = () => {
		this.isCloning = true

		// Update the court object to create a new one based on the existing one
		this.court = {
			...this.court,
			name: `${this.court.name} (Copy)`,
			id: undefined, // Remove the ID so a new one will be created
		}

		// Force a re-render
		this.requestUpdate()
	}

	onSave = () => {
		this.busy = true
		// Basic validation
		if (!this.court.name?.trim()) {
			$notify.error('Court name is required')
			this.busy = false
			return
		}

		if (!this.court.venueId) {
			// Get venue ID from context if missing
			const currentVenueId = venueContext.value.id
			if (!currentVenueId) {
				$notify.error('Venue information is missing')
				this.busy = false
				return
			}
			this.court.venueId = currentVenueId
		}

		if (!this.court.pricing || this.court.pricing.baseHourlyRate <= 0) {
			$notify.error('Base hourly rate must be greater than zero')
			this.busy = false
			return
		}

		// Ensure sportTypes array exists (default to pickleball)
		if (!this.court.sportTypes || !Array.isArray(this.court.sportTypes) || this.court.sportTypes.length === 0) {
			this.court.sportTypes = ['pickleball']
		}

		// Prepare court data for saving
		const court = {
			...this.court,
			updatedAt: new Date().toISOString(),
			...(this.isCloning || !this.editingCourt ? { createdAt: new Date().toISOString() } : {}),
		}

		// Determine if we're creating a new court (either adding or cloning)
		const isNewCourt = this.isCloning || !this.editingCourt

		// Save to database
		const saveOperation = isNewCourt ? CourtsDB.upsert(court) : CourtsDB.upsert(court, this.editingCourt!.id)

		saveOperation.pipe(takeUntil(this.disconnecting)).subscribe({
			next: () => {
				let action = 'added'
				if (this.isCloning) {
					action = 'cloned'
				} else if (this.editingCourt) {
					action = 'updated'
				}

				$notify.success(`Court ${action} successfully`)
				sheet.dismiss(this.tagName)
			},
			error: err => {
				console.error('Error saving court:', err)
				$notify.error(`Failed to save court. Please try again.`)
				this.busy = false
			},
			complete: () => {
				this.busy = false
			},
		})
	}

	private async confirmDelete(id: string) {
		const confirmed = await confirm({
			message: 'Are you sure you want to delete this court? This action cannot be undone.',
			title: 'Delete Court',
			confirmText: 'Delete',
			confirmColor: 'error',
			showIcon: true,
			icon: 'delete',
		})

		if (confirmed) {
			this.busy = true
			CourtsDB.delete(id)
				.pipe(takeUntil(this.disconnecting))
				.subscribe({
					next: () => {
						$notify.success('Court deleted successfully')
						sheet.dismiss(this.tagName)
					},
					error: () => {
						$notify.error('Failed to delete court')
						this.busy = false
					},
					complete: () => {
						this.busy = false
					},
				})
		}
	}
}
