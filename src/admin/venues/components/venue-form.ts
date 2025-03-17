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

// Moved to inside the component class to ensure proper subscription and updates

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
		theme: {
			primary: '#5e808e',
			text: '#ffffff',
			logo: 'light',
		},
	}

	// Clone of venue for preview - this ensures the component updates when properties change
	@state() previewVenue: Partial<Venue> = { ...this.venue }

	@state() busy = false

	constructor(private editingVenue?: Venue) {
		super()
		if (editingVenue) {
			this.venue = { ...editingVenue }
			// Initialize theme if not present
			if (!this.venue.theme) {
				this.venue.theme = {
					primary: '#5e808e',
					text: '#ffffff',
					logo: 'light',
				}
			}
		}
		// Initialize preview venue with current venue data
		this.previewVenue = { ...this.venue }
		this.dispatchEvent(new CustomEvent('fullscreen', { bubbles: true, composed: true, detail: true }))
	}

	render() {
		return html`
			<div class="grid grid-cols-2 lg:grid-cols-2 gap-6 h-full">
				<!-- Form Column -->
				<div class="overflow-y-auto p-4">
					<schmancy-form @submit=${this.onSave} class="py-3 px-3 grid gap-6">
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
						</div>

						<!-- Theme Settings -->
						<div class="grid gap-3 mb-4">
							<schmancy-grid>
								<schmancy-typography type="title">Theme Settings</schmancy-typography>
								<schmancy-divider></schmancy-divider>
							</schmancy-grid>

							<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
								<!-- Primary Color -->
								<schmancy-input
									type="color"
									label="Primary Theme Color"
									.value="${this.venue.theme?.primary || '#5e808e'}"
									@change=${(e: SchmancyInputChangeEvent) => this.updateTheme('primary', e.detail.value)}
								></schmancy-input>

								<!-- Text Color -->
								<schmancy-input
									type="color"
									label="Text Color"
									.value="${this.venue.theme?.text || '#ffffff'}"
									@change=${(e: SchmancyInputChangeEvent) => this.updateTheme('text', e.detail.value)}
								></schmancy-input>

								<!-- Logo Type -->
								<schmancy-select
									label="Logo Color"
									.value=${this.venue.theme?.logo || 'light'}
									@change=${(e: SchmancySelectChangeEvent) =>
										this.updateTheme('logo', e.detail.value as 'light' | 'dark')}
								>
									<schmancy-option value="light" label="Light">Light</schmancy-option>
									<schmancy-option value="dark" label="Dark">Dark</schmancy-option>
								</schmancy-select>
							</div>
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
									this.previewVenue = { ...this.venue }
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
									this.previewVenue = { ...this.venue }
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
									this.previewVenue = { ...this.venue }
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
									this.previewVenue = { ...this.venue }
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
										<schmancy-button @click=${() => this.confirmDelete(this.editingVenue!.id)} .disabled=${this.busy}>
											<span class="text-error-default flex gap-2">
												<schmancy-icon>delete</schmancy-icon>
												Delete
											</span>
										</schmancy-button>
								  `
								: html`<div></div>`}
							<div class="flex gap-2">
								<schmancy-button variant="outlined" @click=${() => sheet.dismiss(this.tagName)} .disabled=${this.busy}
									>Cancel</schmancy-button
								>
								<schmancy-button variant="filled" type="submit" .disabled=${this.busy}>
									${this.editingVenue ? 'Update' : 'Save'}
								</schmancy-button>
							</div>
						</div>
					</schmancy-form>
				</div>

				<!-- Preview Column -->
				<div class="bg-surface-container-low p-6 rounded-lg flex flex-col items-center">
					<schmancy-typography type="title" class="mb-6">Venue Preview</schmancy-typography>

					<!-- Venue Card Preview -->
					<div class="preview-container flex flex-col items-center justify-start w-full">
						<funkhaus-venue-card
							.venue=${this.previewVenue as Venue}
							.theme=${this.previewVenue.theme || { primary: '#5e808e', text: '#ffffff', logo: 'light' }}
							featured
							class="mb-8 transform scale-110"
						></funkhaus-venue-card>
					</div>
				</div>
			</div>

			${this.busy ? html`<schmancy-busy></schmancy-busy>` : ''}
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
		// Update preview venue as well to trigger re-render
		this.previewVenue = { ...this.venue }
	}

	updateTheme(prop: 'primary' | 'text' | 'logo', val: string | 'light' | 'dark') {
		if (!this.venue.theme) {
			this.venue.theme = {
				primary: '#5e808e',
				text: '#ffffff',
				logo: 'light',
			}
		}

		this.venue = {
			...this.venue,
			theme: {
				...this.venue.theme,
				[prop]: val,
			},
		}

		// Update preview venue as well to trigger re-render
		this.previewVenue = { ...this.venue }
	}

	toggleDayOperation(day: keyof OperatingHours, isOpen: boolean) {
		const operatingHours = { ...(this.venue.operatingHours || {}) }

		if (isOpen) {
			operatingHours[day] = { open: '09:00', close: '22:00' }
		} else {
			operatingHours[day] = null
		}

		this.venue = { ...this.venue, operatingHours } as Venue
		// Update preview venue as well to trigger re-render
		this.previewVenue = { ...this.venue }
	}

	updateOperatingHours(day: keyof OperatingHours, field: 'open' | 'close', value: string) {
		const operatingHours = { ...(this.venue.operatingHours || {}) }
		const dayHours = operatingHours[day] || { open: '09:00', close: '22:00' }

		operatingHours[day] = { ...dayHours, [field]: value }

		this.venue = { ...this.venue, operatingHours } as Venue
		// Update preview venue as well to trigger re-render
		this.previewVenue = { ...this.venue }
	}

	onSave = (e: Event) => {
		e.preventDefault()
		this.busy = true

		// Basic validation
		if (!this.venue.name?.trim()) {
			$notify.error('Venue name is required')
			this.busy = false
			return
		}

		if (
			!this.venue.address?.street ||
			!this.venue.address?.city ||
			!this.venue.address?.postalCode ||
			!this.venue.address?.country
		) {
			$notify.error('All address fields are required')
			this.busy = false
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
				this.busy = false
				sheet.dismiss(this.tagName)
			},
			error: err => {
				console.error('Error saving venue:', err)
				$notify.error(`Failed to ${this.editingVenue ? 'update' : 'add'} venue.`)
				this.busy = false
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
			this.busy = true
			VenuesDB.delete(id)
				.pipe(takeUntil(this.disconnecting))
				.subscribe({
					next: () => {
						$notify.success('Venue deleted successfully')
						this.busy = false
						sheet.dismiss(this.tagName)
					},
					error: err => {
						console.error('Error deleting venue:', err)
						$notify.error('Failed to delete venue')
						this.busy = false
					},
				})
		}
	}
}
