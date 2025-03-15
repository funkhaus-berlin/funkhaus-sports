import { $notify, SchmancyInputChangeEvent, SchmancySelectChangeEvent, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { takeUntil } from 'rxjs'
import { Court, CourtsDB, CourtTypeEnum, Pricing, SportTypeEnum } from 'src/db/courts.collection'
import { confirm } from 'src/schmancy'

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
		sportTypes: ['pickleball'],
		courtType: 'indoor',
		pricing: { baseHourlyRate: 0 },
		status: 'active',
	}

	constructor(private editingCourt?: Court) {
		super()
		if (editingCourt) {
			this.court = { ...editingCourt }
		}
	}

	render() {
		return html`
			<schmancy-surface type="surface">
				<schmancy-form @submit=${this.onSave} class="py-3 px-5 grid gap-6">
					<!-- Basic Information -->
					<div class="grid gap-3 mb-4">
						<sch-grid>
							<schmancy-typography type="title">Basic Information</schmancy-typography>
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

						<schmancy-select
							label="Primary Sport"
							required
							multi
							.value=${this.court.sportTypes ?? []}
							@change=${(e: SchmancySelectChangeEvent) => this.updateProps('sportTypes', e.detail.value as string[])}
						>
							${Object.values(SportTypeEnum).map(
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
						${this.editingCourt
							? html`
									<schmancy-button @click=${() => this.confirmDelete(this.editingCourt!.id)}>
										<span class="text-error-default flex gap-2">
											<schmancy-icon>delete</schmancy-icon>
											Delete
										</span>
									</schmancy-button>
							  `
							: ''}
						<schmancy-button variant="outlined" @click=${() => sheet.dismiss(this.tagName)}>Cancel</schmancy-button>
						<schmancy-button variant="filled" type="submit">Save</schmancy-button>
					</div>
				</schmancy-form>
			</schmancy-surface>
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

	onSave = () => {
		// Basic validation
		if (!this.court.name?.trim()) {
			$notify.error('Court name is required')
			return
		}

		if (!this.court.pricing || this.court.pricing.baseHourlyRate <= 0) {
			$notify.error('Base hourly rate must be greater than zero')
			return
		}

		// Prepare court data for saving
		const court = {
			...this.court,
			updatedAt: new Date().toISOString(),
			...(this.editingCourt ? {} : { createdAt: new Date().toISOString() }),
		}

		// Save to database
		const saveOperation = this.editingCourt ? CourtsDB.upsert(court, this.editingCourt.id) : CourtsDB.upsert(court)

		saveOperation.pipe(takeUntil(this.disconnecting)).subscribe({
			next: () => {
				$notify.success(`Court ${this.editingCourt ? 'updated' : 'added'} successfully`)
				sheet.dismiss(this.tagName)
			},
			error: () => $notify.error(`Failed to ${this.editingCourt ? 'update' : 'add'} court.`),
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
			CourtsDB.delete(id)
				.pipe(takeUntil(this.disconnecting))
				.subscribe({
					next: () => $notify.success('Court deleted successfully'),
					error: () => $notify.error('Failed to delete court'),
				})
		}
	}
}
