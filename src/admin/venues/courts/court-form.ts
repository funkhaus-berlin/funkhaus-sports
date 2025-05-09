// src/courts/form.ts
import { $notify, SchmancyInputChangeEvent, SchmancySelectChangeEvent, select, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html, TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { takeUntil } from 'rxjs'
import { Court, CourtsDB, CourtTypeEnum, Pricing, SportTypeEnum } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { confirm } from 'src/schmancy'
import { venueContext, venuesContext } from '../venue-context'
import { selectedCourtContext } from './context'
import '../components/court-map-editor'

// Format enum values to display labels
export const formatEnum = (value: string): string =>
	value
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, str => str.toUpperCase())
		.trim()

@customElement('court-form')
export class CourtForm extends $LitElement() {
	@state() court: Partial<Court & { recommendedPlayers?: number }> = {
		name: '',
		courtType: 'indoor',
		pricing: { baseHourlyRate: 0 },
		status: 'active',
		sportTypes: ['pickleball'],
		recommendedPlayers: 4,
		mapCoordinates: undefined,
	}

	@select(venuesContext) venues!: Map<string, any>
	@select(venueContext) venueData!: Partial<Venue>
	@select(selectedCourtContext) selectedCourtData!: Partial<Court>

	@state() busy = false
	@state() isCloning = false
	@property({ type: String }) venueId: string = ''
	@property({ type: Object }) courtData?: Court

	constructor(private editingCourt?: Court & { recommendedPlayers?: number }) {
		super()
		if (editingCourt) {
			this.court = { ...editingCourt }
			this.venueId = editingCourt.venueId
		}
	}

	connectedCallback() {
		super.connectedCallback()
		console.log('CourtForm connected with courtData:', this.courtData, 'selectedCourtData:', this.selectedCourtData);

		// Try loading court data from different sources with priority:
		// 1. Direct courtData property (passed via component props)
		// 2. editingCourt (passed via constructor)
		// 3. selectedCourtContext (stored in context)
		
		// Check if we have courtData passed directly
		if (this.courtData) {
			console.log('Using court data passed directly in props:', this.courtData);
			this.court = { ...this.courtData };
			this.venueId = this.courtData.venueId;
		}
		// If already using editingCourt from constructor, don't override it
		else if (!this.editingCourt && this.selectedCourtData && Object.keys(this.selectedCourtData).length > 0) {
			console.log('Using court data from selectedCourtContext:', this.selectedCourtData);
			this.court = { ...this.selectedCourtData };
			
			if (this.selectedCourtData.venueId) {
				this.venueId = this.selectedCourtData.venueId;
			}
		}
		
		// Set venueId with simple priority logic if not already set
		if (!this.venueId && this.venueData?.id) {
			this.venueId = this.venueData.id;
		}

		// Set the venueId on the court object
		if (this.venueId) {
			this.court = {
				...this.court,
				venueId: this.venueId,
			}
		}

		// Ensure sportTypes is initialized properly
		if (!this.court.sportTypes || !Array.isArray(this.court.sportTypes)) {
			this.court.sportTypes = ['pickleball']
		}
		
		// If venue doesn't have coordinates but has address, try to set the coordinates
		this._ensureVenueCoordinates();
		
		// Log the initialized court data
		console.log('Court form initialized with data:', this.court);
	}
	
	/**
	 * Ensure venue has coordinates, fetch them from address if needed
	 */
	private async _ensureVenueCoordinates() {
		if ((!this.venueData?.latitude || !this.venueData?.longitude) && 
			this.venueData?.address && !this.venueData?.address?.coordinates) {
			
			const { street, city, postalCode, country } = this.venueData.address;
			
			if (street && city && country) {
				try {
					const addressStr = `${street}, ${city}, ${postalCode || ''}, ${country}`;
					const encodedAddress = encodeURIComponent(addressStr);
					const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}`;
					
					// Add delay to respect rate limits
					await new Promise(resolve => setTimeout(resolve, 1000));
					
					const response = await fetch(url, {
						headers: {
							'User-Agent': 'FunkhausSports/1.0'
						}
					});
					
					if (response.ok) {
						const data = await response.json();
						if (data && data.length > 0) {
							const { lat, lon } = data[0];
							
							// Update venue data with coordinates
							if (typeof this.venueData === 'object') {
								this.venueData = {
									...this.venueData,
									latitude: parseFloat(lat),
									longitude: parseFloat(lon),
									address: {
										...this.venueData.address,
										coordinates: {
											lat: parseFloat(lat),
											lng: parseFloat(lon)
										}
									}
								};
								
								// Force update
								this.requestUpdate();
							}
						}
					}
				} catch (error) {
					console.error('Error geocoding venue address:', error);
				}
			}
		}
	}

	// Handle sport type change for single selection
	handleSportTypeChange(sportType: keyof typeof SportTypeEnum) {
		// Always set to a single-item array with the selected sport type
		const updatedSportTypes: (keyof typeof SportTypeEnum)[] = [sportType]
		
		// Update the court object
		this.updateProps('sportTypes', updatedSportTypes)
	}
	
	// Legacy method kept for reference, not used with single selection
	toggleSportType(sportType: keyof typeof SportTypeEnum) {
		let updatedSportTypes: (keyof typeof SportTypeEnum)[] = []

		// Ensure sportTypes is an array
		if (!this.court.sportTypes || !Array.isArray(this.court.sportTypes)) {
			updatedSportTypes = [sportType]
		} else {
			// Check if the sport type is already in the array
			if (this.court.sportTypes.includes(sportType)) {
				// Don't allow removing the last sport type
				if (this.court.sportTypes.length === 1) {
					return
				}
				// Remove it
				updatedSportTypes = this.court.sportTypes.filter(type => type !== sportType)
			} else {
				// Add it
				updatedSportTypes = [...this.court.sportTypes, sportType]
			}
		}

		// Update the court object
		this.updateProps('sportTypes', updatedSportTypes)
	}

	render() {
		return html`
			<schmancy-surface type="surface">
				<schmancy-form @submit=${this.onSave} class="py-3 px-5 grid gap-6">
					<!-- Basic Information -->
					<div class="grid gap-3 mb-4">
						<schmancy-grid>
							<schmancy-typography type="title"
								>${this.isCloning ? 'Clone Court' : this.editingCourt ? 'Edit Court' : 'Add Court'}</schmancy-typography
							>
							<schmancy-divider></schmancy-divider>
						</schmancy-grid>

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

						<!-- Sport Type Selection (Single-select) -->
						<div>
							<p class="text-sm font-medium mb-2">Sport Type</p>
							<div class="flex flex-wrap gap-2">
								${Object.values(SportTypeEnum).map(
									sportType => html`
										<schmancy-chip
											.selected=${Array.isArray(this.court.sportTypes) &&
											this.court.sportTypes[0] === sportType}
											@click=${() => this.handleSportTypeChange(sportType as keyof typeof SportTypeEnum)}
										>
											${formatEnum(sportType)}
										</schmancy-chip>
									`,
								)}
							</div>
							<p class="text-xs text-gray-500 mt-1">Select a sport type for this court</p>
						</div>
						
						<!-- Recommended Number of Players -->
						<sch-input
							label="Recommended Number of Players"
							type="number"
							min="1"
							step="0.1"
							.value="${this.court.recommendedPlayers?.toString() || ''}"
							@change=${(e: SchmancyInputChangeEvent) => 
								this.updateProps('recommendedPlayers', parseFloat(e.detail.value))}
						></sch-input>

						<!-- Court Preview -->
						<div class="mt-2 border rounded p-2 bg-gray-50">
							<div class="text-sm font-medium mb-2">Court Preview</div>
							<div class="flex flex-wrap gap-6 justify-center">
								${this.renderCourtPreview(
									Array.isArray(this.court.sportTypes) && this.court.sportTypes.length > 0
										? this.court.sportTypes[0]
										: 'pickleball'
								)}
							</div>
						</div>
						
						<!-- Court Map Placement -->
						<div class="mt-4 border rounded p-2 bg-gray-50">
							<div class="text-sm font-medium mb-2">Court Map Placement</div>
							<p class="text-xs text-gray-500 mb-2">Draw a rectangle on the map to represent the court's location and size</p>
							${!this.venueData?.latitude && !this.venueData?.longitude && 
	  (!this.venueData?.address?.coordinates?.lat || !this.venueData?.address?.coordinates?.lng) ? 
								html`<div class="text-amber-600 bg-amber-50 p-2 mb-2 text-sm rounded">
									<schmancy-icon class="mr-1">warning</schmancy-icon>
									Venue coordinates are not set. The map will use default coordinates.
									Please update venue address information to set precise coordinates.
								</div>` : ''}
							<court-map-editor
								.mapCoordinates=${this.court.mapCoordinates}
								.venueLatitude=${this.venueData?.latitude || this.venueData?.address?.coordinates?.lat}
								.venueLongitude=${this.venueData?.longitude || this.venueData?.address?.coordinates?.lng}
								@bounds-change=${this.handleBoundsChange}
								@no-venue-coordinates=${() => $notify.info('Venue coordinates are not set. Using default map location.')}
							></court-map-editor>
						</div>
					</div>

					<!-- Pricing -->
					<div class="grid gap-3 mb-4">
						<schmancy-grid>
							<schmancy-typography type="title">Pricing</schmancy-typography>
							<schmancy-divider></schmancy-divider>
						</schmancy-grid>
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
						<schmancy-grid>
							<schmancy-typography type="title">Status</schmancy-typography>
							<schmancy-divider></schmancy-divider>
						</schmancy-grid>
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

	updateProps(prop: keyof (Court & { recommendedPlayers?: number }), val: string | number | string[]) {
		this.court = { ...this.court, [prop]: val }
	}

	updatePricing(prop: keyof Pricing, val: number) {
		this.court = {
			...this.court,
			pricing: { ...this.court.pricing, [prop]: val } as Pricing,
		}
	}
	
	/**
	 * Handle bounds change from court map editor
	 */
	handleBoundsChange(e: CustomEvent) {
		const { bounds } = e.detail
		
		// Convert bounds array to a Firestore-compatible object format to avoid nested arrays
		// Firestore doesn't support nested arrays like [[lat1, lng1], [lat2, lng2]]
		let mapCoordinates
		
		if (bounds) {
			mapCoordinates = {
				southWest: {
					lat: bounds[0][0],
					lng: bounds[0][1]
				},
				northEast: {
					lat: bounds[1][0],
					lng: bounds[1][1]
				}
			}
			
			// Check if rotation data is provided (in bounds[2])
			if (bounds[2] && bounds[2][0] && bounds[2][0][0] === 'rotation' && bounds[2][1] && bounds[2][1][0] !== undefined) {
				// mapCoordinates.rotation = bounds[2][1][0];
			}
		} else {
			mapCoordinates = undefined
		}
		
		this.court = {
			...this.court,
			mapCoordinates
		}
	}

	cloneCourt = () => {
		this.isCloning = true
		this.court = {
			...this.court,
			name: `${this.court.name} (Copy)`,
			id: undefined,
		}
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

		// Get venue ID from context if not already set
		if (!this.court.venueId) {
			this.court.venueId = this.venueData?.id
		}

		// Final validation for venue ID
		if (!this.court.venueId) {
			$notify.error('Unable to determine the venue. Please try again or refresh the page.')
			this.busy = false
			return
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
		
		// Ensure we have a valid recommended players value (if provided)
		if (court.recommendedPlayers !== undefined && isNaN(court.recommendedPlayers)) {
			delete court.recommendedPlayers;
		}
		
		// Ensure map coordinates are properly stored
		if (this.court.mapCoordinates) {
			court.mapCoordinates = this.court.mapCoordinates;
		}

		// Determine if we're creating a new court (either adding or cloning)
		const isNewCourt = this.isCloning || !this.editingCourt

		// Save to database
		const saveOperation = isNewCourt ? CourtsDB.upsert(court) : CourtsDB.upsert(court, this.editingCourt!.id)

		saveOperation.pipe(takeUntil(this.disconnecting)).subscribe({
			next: (savedCourt) => {
				let action = 'added'
				if (this.isCloning) {
					action = 'cloned'
				} else if (this.editingCourt) {
					action = 'updated'
				}
				
				// Update the selectedCourtContext with the saved court data
				if (savedCourt) {
					console.log('Setting selected court in context after save:', savedCourt);
					selectedCourtContext.set(savedCourt);
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

	// Render court preview for a specific sport type
	renderCourtPreview(sportType: keyof typeof SportTypeEnum): TemplateResult {
		switch (sportType) {
			case 'padel':
				return html`
					<div class="flex flex-col items-center">
						<img src="/svg/padel-court.svg" alt="Padel Court" width="180" height="100" class="object-contain" />
						<span class="text-xs mt-1">Padel</span>
					</div>
				`
			case 'volleyball':
				return html`
					<div class="flex flex-col items-center">
						<img
							src="/svg/volleyball-court.svg"
							alt="Volleyball Court"
							width="180"
							height="100"
							class="object-contain"
						/>
						<span class="text-xs mt-1">Volleyball</span>
					</div>
				`
			case 'pickleball':
			default:
				return html`
					<div class="flex flex-col items-center">
						<img
							src="/svg/pickleball-court.svg"
							alt="Pickleball Court"
							width="180"
							height="100"
							class="object-contain"
						/>
						<span class="text-xs mt-1">Pickleball</span>
					</div>
				`
		}
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
