import {
  $notify,
  fullHeight,
  schmancyCheckBoxChangeEvent,
  SchmancyInputChangeEvent,
  SchmancySelectChangeEvent,
  select,
  sheet,
} from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { takeUntil } from 'rxjs'
import { FacilityEnum, OperatingHours, Venue, VenuesDB, VenueTypeEnum } from 'src/db/venue-collection'
import { auth } from 'src/firebase/firebase'
import { confirm } from 'src/schmancy'
// Import the venue context and venue card component
import { venueContext } from '../venue-context'
import './venue-info-card'

// Format enum values to display labels
export const formatEnum = (value: string): string =>
	value
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, str => str.toUpperCase())
		.trim()

@customElement('venue-form')
export class VenueForm extends $LitElement() {
	@state() busy = false
	@state() formErrors: Record<string, string> = {}

	@state() venue!: Venue
	@select(venueContext) venueData!: Partial<Venue>

	constructor(initialData?: Venue) {
		super()
		if (initialData) {
			this.venue = initialData
			// Create deep copy to avoid mutation issues
		} else {
			// Initialize new venue with default values
			this.initializeNewVenue()
		}

		console.log('VenueForm initialized with data:', initialData)
		this.dispatchEvent(new CustomEvent('fullscreen', { bubbles: true, composed: true, detail: true }))
	}

	// Handle case where venue data comes from context
	connectedCallback() {
		super.connectedCallback()

		// If we don't have an initialized venue but have one in context, use that
		if (!this.venue?.id && this.venueData?.id) {
			console.log('Using venue from context in VenueForm:', this.venueData)
			this.venue = this.venueData as Venue
		}
	}

	// Initialize new venue with default values
	private initializeNewVenue(): void {
		this.venue = {
			id: '',
			name: '',
			status: 'active',
			createdAt: '',
			updatedAt: '',
			address: {
				street: '',
				city: '',
				postalCode: '',
				country: '',
			},
			theme: {
				primary: '#5e808e',
				text: '#ffffff',
				logo: 'light',
			},
			operatingHours: {
				monday: { open: '11:00', close: '22:00' },
				tuesday: { open: '11:00', close: '22:00' },
				wednesday: { open: '11:00', close: '22:00' },
				thursday: { open: '11:00', close: '22:00' },
				friday: { open: '11:00', close: '22:00' },
				saturday: { open: '11:00', close: '22:00' },
				sunday: { open: '11:00', close: '22:00' },
			},
			venueType: Object.values(VenueTypeEnum)[0],
			facilities: [],
		} as Venue
	}

	render() {
		return html`
			<div ${fullHeight()} class="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full relative inset-0">
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
								.value="${this.venue?.name || ''}"
								.error=${Boolean(this.formErrors.name)}
								@change=${(e: SchmancyInputChangeEvent) => this.updateProps('name', e.detail.value)}
							></schmancy-input>

							<schmancy-textarea
								label="Description"
								rows="3"
								.value="${this.venue?.description || ''}"
								@change=${(e: SchmancyInputChangeEvent) => this.updateProps('description', e.detail.value)}
							></schmancy-textarea>

							<schmancy-select
								label="Venue Type"
								required
								.value=${this.venue?.venueType || ''}
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
									label="Theme"
									.value="${this.venue?.theme?.primary || '#5e808e'}"
									@change=${(e: SchmancyInputChangeEvent) => this.updateTheme('primary', e.detail.value)}
								></schmancy-input>

								<!-- Text Color -->
								<schmancy-input
									type="color"
									label="Text Color"
									.value="${this.venue?.theme?.text || '#ffffff'}"
									@change=${(e: SchmancyInputChangeEvent) => this.updateTheme('text', e.detail.value)}
								></schmancy-input>

								<!-- Logo Type -->
								<schmancy-select
									label="Logo Color"
									.value=${this.venue?.theme?.logo || 'light'}
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
								.value="${this.venue?.address?.street || ''}"
								.error=${Boolean(this.formErrors['address.street'])}
								@change=${(e: SchmancyInputChangeEvent) => this.updateAddress('street', e.detail.value)}
							></schmancy-input>

							<schmancy-input
								label="City"
								required
								.value="${this.venue?.address?.city || ''}"
								.error=${Boolean(this.formErrors['address.city'])}
								@change=${(e: SchmancyInputChangeEvent) => this.updateAddress('city', e.detail.value)}
							></schmancy-input>

							<schmancy-input
								label="Postal Code"
								required
								.value="${this.venue?.address?.postalCode || ''}"
								.error=${Boolean(this.formErrors['address.postalCode'])}
								@change=${(e: SchmancyInputChangeEvent) => this.updateAddress('postalCode', e.detail.value)}
							></schmancy-input>

							<schmancy-input
								label="Country"
								required
								.value="${this.venue?.address?.country || ''}"
								.error=${Boolean(this.formErrors['address.country'])}
								@change=${(e: SchmancyInputChangeEvent) => this.updateAddress('country', e.detail.value)}
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
								.value=${this.venue?.facilities || []}
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
								.value="${this.venue?.contactEmail || ''}"
								.error=${Boolean(this.formErrors.contactEmail)}
								@change=${(e: SchmancyInputChangeEvent) => this.updateProps('contactEmail', e.detail.value)}
							></schmancy-input>

							<schmancy-input
								label="Phone"
								.value="${this.venue?.contactPhone || ''}"
								@change=${(e: SchmancyInputChangeEvent) => this.updateProps('contactPhone', e.detail.value)}
							></schmancy-input>

							<schmancy-input
								label="Website"
								.value="${this.venue?.website || ''}"
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
								.value=${this.venue?.status || 'active'}
								@change=${(e: SchmancySelectChangeEvent) => this.updateProps('status', e.detail.value as string)}
							>
								<schmancy-option value="active" label="Active">Active</schmancy-option>
								<schmancy-option value="maintenance" label="Under Maintenance">Under Maintenance</schmancy-option>
								<schmancy-option value="inactive" label="Inactive">Inactive</schmancy-option>
							</schmancy-select>
						</div>

						<!-- Actions -->
						<div class="flex gap-4 justify-between">
							${this.venue.id
								? html`
										<schmancy-button @click=${this.handleDeleteClick} .disabled=${this.busy} type="button">
											<span class="text-error-default flex gap-2">
												<schmancy-icon>delete</schmancy-icon>
												Delete
											</span>
										</schmancy-button>
								  `
								: html`<div></div>`}
							<div class="flex gap-2">
								<schmancy-button variant="outlined" type="button" @click=${this.handleCancel} .disabled=${this.busy}
									>Cancel</schmancy-button
								>
								<schmancy-button variant="filled" type="submit" .disabled=${this.busy}>
									${this.venue.id ? 'Update' : 'Save'}
								</schmancy-button>
							</div>
						</div>
					</schmancy-form>
				</div>

				<!-- Preview Column -->
				<div class="bg-surface-container-low p-6 rounded-lg flex flex-col items-center sticky top-6 overflow-y-auto">
					<schmancy-typography type="title" class="mb-6">Venue Preview</schmancy-typography>

					<!-- Venue Card Preview -->
					<div class="preview-container flex flex-col items-center justify-start w-full">
						<funkhaus-venue-card
							.venue=${this.venue}
							.theme=${this.venue?.theme || { primary: '#5e808e', text: '#ffffff', logo: 'light' }}
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

		// Ensure operatingHours exists
		const operatingHours = this.venue?.operatingHours || {}

		return html`
			<div class="grid gap-2">
				${days.map(day => {
					const isOpen = !!operatingHours[day.key as keyof OperatingHours]
					const hours = operatingHours[day.key as keyof OperatingHours]

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

	// Update top-level properties
	updateProps(prop: keyof Venue, val: string | number | string[]) {
		this.venue = { ...this.venue, [prop]: val }
		this.requestUpdate()
		// Clear any errors for this field
		if (this.formErrors[prop]) {
			const updatedErrors = { ...this.formErrors }
			delete updatedErrors[prop]
			this.formErrors = updatedErrors
		}
	}

	// Update theme properties safely
	updateTheme(prop: 'primary' | 'text' | 'logo', val: string | 'light' | 'dark') {
		// Create a new theme object with defaults and existing values
		const theme = {
			primary: '#5e808e',
			text: '#ffffff',
			logo: 'light',
			...(this.venue?.theme || {}),
			[prop]: val, // Update the specific property
		}

		this.venue = {
			...this.venue,
			theme,
		}
		this.requestUpdate()
	}

	// Update address properties safely
	updateAddress(field: keyof Venue['address'], value: string) {
		// Create a new address object with defaults and existing values
		const address = {
			...(this.venue?.address || {}),
			[field]: value, // Update the specific field
		}

		this.venue = {
			...this.venue,
			address,
		}
		this.requestUpdate()

		// Clear any errors for this address field
		const errorKey = `address.${field}`
		if (this.formErrors[errorKey]) {
			const updatedErrors = { ...this.formErrors }
			delete updatedErrors[errorKey]
			this.formErrors = updatedErrors
		}
	}

	// Toggle day operation safely
	toggleDayOperation(day: keyof OperatingHours, isOpen: boolean) {
		// Create a new operatingHours object with defaults and existing values
		const operatingHours = { ...(this.venue?.operatingHours || {}) }

		if (isOpen) {
			operatingHours[day] = { open: '09:00', close: '22:00' }
		} else {
			operatingHours[day] = null
		}

		this.venue = {
			...this.venue,
			operatingHours,
		}
		this.requestUpdate()
	}

	// Update operating hours safely
	updateOperatingHours(day: keyof OperatingHours, field: 'open' | 'close', value: string) {
		// Create a new operatingHours object with defaults and existing values
		const operatingHours = { ...(this.venue?.operatingHours || {}) }

		// Get current day's hours or default
		const dayHours = operatingHours[day] || { open: '09:00', close: '22:00' }

		// Update the specific field
		operatingHours[day] = { ...dayHours, [field]: value }

		this.venue = {
			...this.venue,
			operatingHours,
		}
		this.requestUpdate()
	}

	// Enhanced validation
	validateForm(): boolean {
		const errors: Record<string, string> = {}

		// Required fields validation
		if (!this.venue?.name?.trim()) {
			errors.name = 'Venue name is required'
		}

		if (!this.venue?.venueType) {
			errors.venueType = 'Venue type is required'
		}

		// Address validation
		if (!this.venue?.address?.street?.trim()) {
			errors['address.street'] = 'Street is required'
		}

		if (!this.venue?.address?.city?.trim()) {
			errors['address.city'] = 'City is required'
		}

		if (!this.venue?.address?.postalCode?.trim()) {
			errors['address.postalCode'] = 'Postal code is required'
		}

		if (!this.venue?.address?.country?.trim()) {
			errors['address.country'] = 'Country is required'
		}

		// Email validation
		if (this.venue?.contactEmail && !this.isValidEmail(this.venue.contactEmail)) {
			errors.contactEmail = 'Please enter a valid email address'
		}

		this.formErrors = errors
		return Object.keys(errors).length === 0
	}

	// Email validation helper
	isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		return emailRegex.test(email)
	}

	// Handle cancel button click
	handleCancel = () => {
		sheet.dismiss(this.tagName)
	}

	// Handle delete button click
	handleDeleteClick = () => {
		if (this.venue?.id) {
			this.confirmDelete(this.venue.id)
		}
	}

	// Form submission handler
	onSave = (e: Event) => {
		e.preventDefault()

		// Run validation
		if (!this.validateForm()) {
			$notify.error('Please fix the errors in the form')
			return
		}

		this.busy = true

		// Log current venue state for debugging
		console.log('Current venue state:', JSON.stringify(this.venue))
		console.log('Editing venue?', this.venue ? this.venue.id : 'No')

		// Prepare venue data for saving
		let venue: Venue

		if (this.venue.id) {
			// Update existing venue - explicitly preserve ID
			venue = {
				...this.venue,
				id: this.venue.id, // Force ID to match original
				updatedAt: new Date().toISOString(),
			} as Venue
			console.log('Updating venue with ID:', venue.id)
		} else {
			// Create new venue with explicit UUID
			const newVenueId = crypto.randomUUID();
			venue = {
				...this.venue,
				id: newVenueId, // Set a specific UUID for new venues
				updatedAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				createdBy: auth.currentUser?.uid || '',
			} as Venue
			console.log('Creating new venue with generated ID:', newVenueId)
		}

		// Save to database with explicit handling for updates vs. creates
		let saveOperation

		if (this.venue.id) {
			// For updates, explicitly pass the original ID as second parameter
			console.log(`Updating venue ${this.venue.id} with data:`, venue)
			saveOperation = VenuesDB.upsert(venue, this.venue.id)
		} else {
			// For new venues, explicitly pass the newly generated ID
			console.log('Creating new venue with data:', venue)
			saveOperation = VenuesDB.upsert(venue, venue.id)
		}

		saveOperation.pipe(takeUntil(this.disconnecting)).subscribe({
			next: () => {
				$notify.success(`Venue ${this.venue ? 'updated' : 'added'} successfully`)
				this.busy = false
				sheet.dismiss(this.tagName)
			},
			error: err => {
				console.error('Error saving venue:', err)
				$notify.error(`Failed to ${this.venue ? 'update' : 'add'} venue: ${err.message || 'Unknown error'}`)
				this.busy = false
			},
		})
	}

	private async confirmDelete(id: string) {
		try {
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
							$notify.error(`Failed to delete venue: ${err.message || 'Unknown error'}`)
							this.busy = false
						},
					})
			}
		} catch (err) {
			console.error('Error in delete confirmation:', err)
			$notify.error('An error occurred while trying to delete the venue')
		}
	}
}
