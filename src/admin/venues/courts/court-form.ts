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
				<schmancy-form @submit=${this.onSave} class="py-6 px-6 max-w-6xl mx-auto">
					<!-- Header -->
					<div class="mb-8">
						<schmancy-typography type="headline" token="md" class="mb-2">
							${this.isCloning ? 'Clone Court' : this.editingCourt ? 'Edit Court' : 'Add Court'}
						</schmancy-typography>
						<schmancy-typography type="body" token="md" class="text-surface-on-variant">
							${this.isCloning ? 'Create a copy of this court with customized settings.' : 
							this.editingCourt ? 'Modify court details and settings.' : 'Create a new court for this venue.'}
						</schmancy-typography>
						<schmancy-divider class="mt-4"></schmancy-divider>
					</div>

					<!-- Two Column Layout -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
						<!-- Left Column - Basic Information -->
						<div class="space-y-6">
							<schmancy-typography type="title" class="mb-4">Basic Information</schmancy-typography>
							
							<sch-input
								label="Court Name"
								required
								class="w-full"
								.value="${this.court.name || ''}"
								@change=${(e: SchmancyInputChangeEvent) => this.updateProps('name', e.detail.value)}
							></sch-input>

							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<schmancy-select
									label="Court Type"
									required
									class="w-full"
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

								<sch-input
									label="Recommended Players"
									type="number"
									min="1"
									step="1"
									class="w-full"
									.value="${this.court.recommendedPlayers?.toString() || ''}"
									@change=${(e: SchmancyInputChangeEvent) => 
										this.updateProps('recommendedPlayers', parseFloat(e.detail.value))}
								></sch-input>
							</div>

							<!-- Sport Type Selection (Single-select) -->
							<div class="space-y-2">
								<schmancy-typography type="label" class="block">Sport Type</schmancy-typography>
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
								<schmancy-typography type="caption" class="text-surface-on-variant">
									Select a sport type for this court
								</schmancy-typography>
							</div>

							<!-- Court Preview -->
							<div class="bg-surface-container p-4 rounded-lg">
								<schmancy-typography type="label" class="block mb-3">Court Preview</schmancy-typography>
								<div class="flex justify-center p-2">
									${this.renderCourtPreview(
										Array.isArray(this.court.sportTypes) && this.court.sportTypes.length > 0
											? this.court.sportTypes[0]
											: 'pickleball'
									)}
								</div>
							</div>

							<!-- Pricing Section -->
							<div class="space-y-4 mt-8">
								<schmancy-typography type="title" class="mb-2">Pricing</schmancy-typography>
								<schmancy-divider class="mb-4"></schmancy-divider>
								
								<sch-input
									label="Base Hourly Rate (€)"
									type="number"
									min="0"
									step="0.01"
									required
									class="w-full"
									.value="${this.court.pricing?.baseHourlyRate?.toString() || '0'}"
									@change=${(e: SchmancyInputChangeEvent) =>
										this.updatePricing('baseHourlyRate', parseFloat(e.detail.value))}
								></sch-input>

								<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
									<sch-input
										label="Peak Hour Rate (€)"
										type="number"
										min="0"
										step="0.01"
										class="w-full"
										.value="${this.court.pricing?.peakHourRate?.toString() || ''}"
										@change=${(e: SchmancyInputChangeEvent) => this.updatePricing('peakHourRate', parseFloat(e.detail.value))}
									></sch-input>

									<sch-input
										label="Weekend Rate (€)"
										type="number"
										min="0"
										step="0.01"
										class="w-full"
										.value="${this.court.pricing?.weekendRate?.toString() || ''}"
										@change=${(e: SchmancyInputChangeEvent) => this.updatePricing('weekendRate', parseFloat(e.detail.value))}
									></sch-input>
								</div>
							</div>
						</div>

						<!-- Right Column - Map and Status -->
						<div class="space-y-6">
							<!-- Court Map Placement -->
							<div class="space-y-3">
								<schmancy-typography type="title" class="mb-2">Court Map Placement</schmancy-typography>
								
								<div class="bg-surface-container p-4 rounded-lg">
									<div class="flex items-center mb-2">
										<schmancy-icon class="text-surface-on-variant mr-2">map</schmancy-icon>
										<schmancy-typography type="label">Location on Venue Map</schmancy-typography>
									</div>
									
									<schmancy-typography type="caption" class="block mb-3 text-surface-on-variant">
										Draw a rectangle on the map to represent the court's location and size
									</schmancy-typography>
									
									${!this.venueData?.latitude && !this.venueData?.longitude && 
									(!this.venueData?.address?.coordinates?.lat || !this.venueData?.address?.coordinates?.lng) ? 
										html`<div class="flex items-center p-3 mb-3 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
											<schmancy-icon class="mr-2">warning</schmancy-icon>
											<span class="text-sm">
												Venue coordinates are not set. The map will use default coordinates.
												Please update venue address information to set precise coordinates.
											</span>
										</div>` : ''}
									
									<div class="h-[400px] border border-surface-outline rounded-lg overflow-hidden">
										<court-map-editor
											.mapCoordinates=${this.court.mapCoordinates}
											.venueLatitude=${this.venueData?.latitude || this.venueData?.address?.coordinates?.lat}
											.venueLongitude=${this.venueData?.longitude || this.venueData?.address?.coordinates?.lng}
											@bounds-change=${this.handleBoundsChange}
											@no-venue-coordinates=${() => $notify.info('Venue coordinates are not set. Using default map location.')}
										></court-map-editor>
									</div>
								</div>
							</div>

							<!-- Status -->
							<div class="space-y-4 mt-8">
								<schmancy-typography type="title" class="mb-2">Status</schmancy-typography>
								<schmancy-divider class="mb-4"></schmancy-divider>
								
								<div class="bg-surface-container p-4 rounded-lg">
									<schmancy-select
										label="Court Status"
										required
										class="w-full"
										.value=${this.court.status || 'active'}
										@change=${(e: SchmancySelectChangeEvent) => this.updateProps('status', e.detail.value as string)}
									>
										<schmancy-option value="active" label="Active">
											<div class="flex items-center">
												<schmancy-icon class="mr-2 text-success-default">check_circle</schmancy-icon>
												Active
											</div>
										</schmancy-option>
										<schmancy-option value="maintenance" label="Under Maintenance">
											<div class="flex items-center">
												<schmancy-icon class="mr-2 text-warning-default">construction</schmancy-icon>
												Under Maintenance
											</div>
										</schmancy-option>
										<schmancy-option value="inactive" label="Inactive">
											<div class="flex items-center">
												<schmancy-icon class="mr-2 text-error-default">cancel</schmancy-icon>
												Inactive
											</div>
										</schmancy-option>
									</schmancy-select>
								</div>
							</div>
						</div>
					</div>

					<!-- Actions Footer -->
					<div class="flex justify-between mt-10 pt-6 border-t border-surface-outline-variant">
						<div>
							${this.editingCourt && !this.isCloning
								? html`
										<schmancy-button @click=${() => this.confirmDelete(this.editingCourt!.id)}>
											<span class="text-error-default flex gap-2 items-center">
												<schmancy-icon>delete</schmancy-icon>
												Delete Court
											</span>
										</schmancy-button>
								  `
								: html``}
						</div>
						<div class="flex gap-3">
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
							<schmancy-button variant="filled" type="submit">
								<span class="flex gap-2 items-center">
									<schmancy-icon>save</schmancy-icon>
									Save Court
								</span>
							</schmancy-button>
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