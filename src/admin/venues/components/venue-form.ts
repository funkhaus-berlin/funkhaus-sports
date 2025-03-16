import {
	$notify,
	schmancyCheckBoxChangeEvent,
	SchmancyInputChangeEvent,
	SchmancySelectChangeEvent,
	sheet,
} from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { takeUntil } from 'rxjs'
import {
	defaultOperatingHours,
	FacilityEnum,
	OperatingHours,
	Venue,
	VenuesDB,
	VenueTypeEnum,
} from 'src/db/venue-collection'
import { auth } from 'src/firebase/firebase'
import { confirm } from 'src/schmancy'

// Format enum values to display labels
export const formatEnum = (value: string): string =>
	value
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, str => str.toUpperCase())
		.trim()

@customElement('venue-form')
export class VenueForm extends $LitElement() {
	@state() venue: Partial<Venue> = {
		name: '',
		venueType: 'sportsFacility',
		address: {
			street: '',
			city: '',
			postalCode: '',
			country: '',
		},
		facilities: [],
		operatingHours: { ...defaultOperatingHours },
		status: 'active',
	}

	constructor(private editingVenue?: Venue) {
		super()
		if (editingVenue) {
			this.venue = { ...editingVenue }
		}
	}

	render() {
		return html`
			<schmancy-surface type="surface">
				<schmancy-form @submit=${this.onSave} class="py-3 px-5 grid gap-6">
					<!-- Basic Information -->
					<div class="grid gap-3 mb-4">
						<schmancy-grid>
							<schmancy-typography type="title">Basic Information</schmancy-typography>
							<schmancy-divider></schmancy-divider>
						</schmancy-grid>

						<schmancy-input
							label="Venue Name"
							required
							.value="${this.venue.name || ''}"
							@change=${(e: SchmancyInputChangeEvent) => this.updateProps('name', e.detail.value)}
						></schmancy-input>

						<schmancy-textarea
							label="Description"
							rows="3"
							.value="${this.venue.description || ''}"
							@change=${(e: SchmancyInputChangeEvent) => this.updateProps('description', e.detail.value)}
						></schmancy-textarea>

						<schmancy-select
							label="Venue Type"
							required
							.value=${this.venue.venueType || ''}
							@change=${(e: SchmancySelectChangeEvent) => this.updateProps('venueType', e.detail.value as string)}
						>
							${Object.values(VenueTypeEnum).map(
								type =>
									html`<schmancy-option .value=${type} .label=${formatEnum(type)}
										>${formatEnum(type)}</schmancy-option
									>`,
							)}
						</schmancy-select>

						<schmancy-input
							label="Max Court Capacity"
							type="number"
							min="1"
							step="1"
							.value="${this.venue.maxCourtCapacity?.toString() || ''}"
							@change=${(e: SchmancyInputChangeEvent) =>
								this.updateProps('maxCourtCapacity', parseInt(e.detail.value, 10))}
						></schmancy-input>
					</div>

					<!-- Address -->
					<div class="grid gap-3 mb-4">
						<schmancy-grid>
							<schmancy-typography type="title">Address</schmancy-typography>
							<schmancy-divider></schmancy-divider>
						</schmancy-grid>

						<schmancy-input
							label="Street"
							required
							.value="${this.venue.address?.street || ''}"
							@change=${(e: SchmancyInputChangeEvent) => {
								const value = e.detail.value
								this.venue = {
									...this.venue,
									address: {
										...this.venue.address,
										street: value,
									},
								} as Venue
							}}
						></schmancy-input>

						<schmancy-input
							label="City"
							required
							.value="${this.venue.address?.city || ''}"
							@change=${(e: SchmancyInputChangeEvent) => {
								const value = e.detail.value
								this.venue = {
									...this.venue,
									address: {
										...this.venue.address,
										city: value,
									},
								} as Venue
							}}
						></schmancy-input>

						<schmancy-input
							label="Postal Code"
							required
							.value="${this.venue.address?.postalCode || ''}"
							@change=${(e: SchmancyInputChangeEvent) => {
								const value = e.detail.value
								this.venue = {
									...this.venue,
									address: {
										...this.venue.address,
										postalCode: value,
									},
								} as Venue
							}}
						></schmancy-input>

						<schmancy-input
							label="Country"
							required
							.value="${this.venue.address?.country || ''}"
							@change=${(e: SchmancyInputChangeEvent) => {
								const value = e.detail.value
								this.venue = {
									...this.venue,
									address: {
										...this.venue.address,
										country: value,
									},
								} as Venue
							}}
						></schmancy-input>
					</div>

					<!-- Facilities -->
					<div class="grid gap-3 mb-4">
						<schmancy-grid>
							<schmancy-typography type="title">Facilities</schmancy-typography>
							<schmancy-divider></schmancy-divider>
						</schmancy-grid>

						<schmancy-select
							label="Available Facilities"
							multi
							.value=${this.venue.facilities || []}
							@change=${(e: SchmancySelectChangeEvent) => this.updateProps('facilities', e.detail.value as string[])}
						>
							${Object.values(FacilityEnum).map(
								facility =>
									html`<schmancy-option .value=${facility} .label=${formatEnum(facility)}
										>${formatEnum(facility)}</schmancy-option
									>`,
							)}
						</schmancy-select>
					</div>

					<!-- Operating Hours -->
					<div class="grid gap-3 mb-4">
						<schmancy-grid>
							<schmancy-typography type="title">Operating Hours</schmancy-typography>
							<schmancy-divider></schmancy-divider>
						</schmancy-grid>

						${this.renderOperatingHours()}
					</div>

					<!-- Contact Information -->
					<div class="grid gap-3 mb-4">
						<schmancy-grid>
							<schmancy-typography type="title">Contact Information</schmancy-typography>
							<schmancy-divider></schmancy-divider>
						</schmancy-grid>

						<schmancy-input
							label="Email"
							type="email"
							.value="${this.venue.contactEmail || ''}"
							@change=${(e: SchmancyInputChangeEvent) => this.updateProps('contactEmail', e.detail.value)}
						></schmancy-input>

						<schmancy-input
							label="Phone"
							.value="${this.venue.contactPhone || ''}"
							@change=${(e: SchmancyInputChangeEvent) => this.updateProps('contactPhone', e.detail.value)}
						></schmancy-input>

						<schmancy-input
							label="Website"
							.value="${this.venue.website || ''}"
							@change=${(e: SchmancyInputChangeEvent) => this.updateProps('website', e.detail.value)}
						></schmancy-input>
					</div>

					<!-- Status -->
					<div class="grid gap-3 mb-4">
						<schmancy-grid>
							<schmancy-typography type="title">Status</schmancy-typography>
							<schmancy-divider></schmancy-divider>
						</schmancy-grid>
						<schmancy-select
							label="Venue Status"
							required
							.value=${this.venue.status || 'active'}
							@change=${(e: SchmancySelectChangeEvent) => this.updateProps('status', e.detail.value as string)}
						>
							<schmancy-option value="active" label="Active">Active</schmancy-option>
							<schmancy-option value="maintenance" label="Under Maintenance">Under Maintenance</schmancy-option>
							<schmancy-option value="inactive" label="Inactive">Inactive</schmancy-option>
						</schmancy-select>
					</div>

					<!-- Actions -->
					<div class="flex gap-4 justify-between">
						${this.editingVenue
							? html`
									<schmancy-button @click=${() => this.confirmDelete(this.editingVenue!.id)}>
										<span class="text-error-default flex gap-2">
											<schmancy-icon>delete</schmancy-icon>
											Delete
										</span>
									</schmancy-button>
							  `
							: html`<div></div>`}
						<div class="flex gap-2">
							<schmancy-button variant="outlined" @click=${() => sheet.dismiss(this.tagName)}>Cancel</schmancy-button>
							<schmancy-button variant="filled" type="submit">Save</schmancy-button>
						</div>
					</div>
				</schmancy-form>
			</schmancy-surface>
		`
	}

	renderOperatingHours() {
		const days = [
			{ key: 'monday', label: 'Monday' },
			{ key: 'tuesday', label: 'Tuesday' },
			{ key: 'wednesday', label: 'Wednesday' },
			{ key: 'thursday', label: 'Thursday' },
			{ key: 'friday', label: 'Friday' },
			{ key: 'saturday', label: 'Saturday' },
			{ key: 'sunday', label: 'Sunday' },
		]

		return html`
			<div class="grid gap-2">
				${days.map(day => {
					const isOpen = !!this.venue.operatingHours?.[day.key as keyof OperatingHours]
					const hours = this.venue.operatingHours?.[day.key as keyof OperatingHours]

					return html`
						<schmancy-grid gap="sm" cols="1fr 3fr">
							<schmancy-checkbox
								.value=${isOpen}
								@change=${(e: schmancyCheckBoxChangeEvent) =>
									this.toggleDayOperation(day.key as keyof OperatingHours, e.detail.value)}
							>
								${day.label}
							</schmancy-checkbox>

							<div class="flex gap-2 flex-1 ${isOpen ? '' : 'opacity-50 pointer-events-none'}">
								<schmancy-input
									type="time"
									.value="${hours?.open || '09:00'}"
									@change=${(e: SchmancyInputChangeEvent) =>
										this.updateOperatingHours(day.key as keyof OperatingHours, 'open', e.detail.value)}
								></schmancy-input>
								<schmancy-typography>to</schmancy-typography>
								<schmancy-input
									type="time"
									.value="${hours?.close || '22:00'}"
									@change=${(e: SchmancyInputChangeEvent) =>
										this.updateOperatingHours(day.key as keyof OperatingHours, 'close', e.detail.value)}
								></schmancy-input>
							</div>
						</schmancy-grid>
					`
				})}
			</div>
		`
	}

	updateProps(prop: keyof Venue, val: string | number | string[]) {
		this.venue = { ...this.venue, [prop]: val }
	}

	toggleDayOperation(day: keyof OperatingHours, isOpen: boolean) {
		const operatingHours = { ...(this.venue.operatingHours || {}) }

		if (isOpen) {
			operatingHours[day] = { open: '09:00', close: '22:00' }
		} else {
			operatingHours[day] = null
		}

		this.venue = { ...this.venue, operatingHours } as Venue
	}

	updateOperatingHours(day: keyof OperatingHours, field: 'open' | 'close', value: string) {
		const operatingHours = { ...(this.venue.operatingHours || {}) }
		const dayHours = operatingHours[day] || { open: '09:00', close: '22:00' }

		operatingHours[day] = { ...dayHours, [field]: value }

		this.venue = { ...this.venue, operatingHours } as Venue
	}

	onSave = (e: Event) => {
		e.preventDefault()

		// Basic validation
		if (!this.venue.name?.trim()) {
			$notify.error('Venue name is required')
			return
		}

		if (
			!this.venue.address?.street ||
			!this.venue.address?.city ||
			!this.venue.address?.postalCode ||
			!this.venue.address?.country
		) {
			$notify.error('All address fields are required')
			return
		}

		// Prepare venue data for saving
		const venue = {
			...this.venue,
			updatedAt: new Date().toISOString(),
			...(this.editingVenue
				? {}
				: {
						createdAt: new Date().toISOString(),
						createdBy: auth.currentUser?.uid,
				  }),
		} as Venue

		// Save to database
		const saveOperation = this.editingVenue ? VenuesDB.upsert(venue, this.editingVenue.id) : VenuesDB.upsert(venue)

		saveOperation.pipe(takeUntil(this.disconnecting)).subscribe({
			next: () => {
				$notify.success(`Venue ${this.editingVenue ? 'updated' : 'added'} successfully`)
				sheet.dismiss(this.tagName)
			},
			error: err => {
				console.error('Error saving venue:', err)
				$notify.error(`Failed to ${this.editingVenue ? 'update' : 'add'} venue.`)
			},
		})
	}

	private async confirmDelete(id: string) {
		const confirmed = await confirm({
			message: 'Are you sure you want to delete this venue? This action cannot be undone.',
			title: 'Delete Venue',
			confirmText: 'Delete',
			confirmColor: 'error',
			showIcon: true,
			icon: 'delete',
		})

		if (confirmed) {
			VenuesDB.delete(id)
				.pipe(takeUntil(this.disconnecting))
				.subscribe({
					next: () => {
						$notify.success('Venue deleted successfully')
						sheet.dismiss(this.tagName)
					},
					error: () => $notify.error('Failed to delete venue'),
				})
		}
	}
}
