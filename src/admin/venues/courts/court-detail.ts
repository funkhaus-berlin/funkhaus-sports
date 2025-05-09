import { $notify, area, SchmancyInputChangeEvent, SchmancySelectChangeEvent, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { takeUntil } from 'rxjs'
import { Court, CourtMapCoordinates, CourtsDB, CourtTypeEnum, Pricing, SportTypeEnum } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { confirm } from 'src/schmancy'
import '../../admin'
import '../components/court-map-editor'
import { venueContext } from '../venue-context'
import { formatEnum } from './court-form'

/**
 * Court Detail Component
 * 
 * A component for viewing and editing court details in a full page view
 */
@customElement('court-detail')
export class CourtDetail extends $LitElement() {
  /**
   * Court ID to edit
   */
  @property({ type: String })
  courtId?: string

  /**
   * Venue ID (required for new courts)
   */
  @property({ type: String })
  venueId?: string

  /**
   * Court data directly passed in state
   */
  @property({ type: Object })
  courtData?: Court;

  /**
   * Current court data
   */
  @state() court: Partial<Court & { recommendedPlayers?: number }> = {
    name: '',
    courtType: 'indoor',
    pricing: { baseHourlyRate: 0 },
    status: 'active',
    sportTypes: ['pickleball'],
    recommendedPlayers: 4,
    mapCoordinates: undefined,
  }

  /**
   * Get venue data from context
   */
  @select(venueContext) venueData!: Partial<Venue>
  
  /**
   * Computed venue coordinates
   */
  private get venueCoordinates(): { lat: number | undefined, lng: number | undefined } {
    // First try direct latitude/longitude properties
    if (typeof this.venueData?.latitude === 'number' && typeof this.venueData?.longitude === 'number') {
      return {
        lat: this.venueData.latitude,
        lng: this.venueData.longitude
      }
    }
    
    // Then try address coordinates
    if (this.venueData?.address?.coordinates?.lat && this.venueData?.address?.coordinates?.lng) {
      return {
        lat: this.venueData.address.coordinates.lat,
        lng: this.venueData.address.coordinates.lng
      }
    }
    
    // Return undefined if no coordinates available
    return {
      lat: undefined,
      lng: undefined
    }
  }

  /**
   * Loading state
   */
  @state() busy = false

  /**
   * Whether this is a new court
   */
  @property({ type: Boolean })
  isNew = false

  /**
   * Component lifecycle - connected
   */
  connectedCallback(): void {
    super.connectedCallback()
    console.log('CourtDetail connected with courtId:', this.courtId, 'courtData:', this.courtData);

    // Set venue ID if available
    if (this.venueId) {
      this.court.venueId = this.venueId
    } else if (this.venueData?.id) {
      this.court.venueId = this.venueData.id
      this.venueId = this.venueData.id
    }

    // Determine if this is a new court if not explicitly set
    if (this.isNew === undefined) {
      this.isNew = !this.courtId
    }

    // Load from selectedCourtContext first (consistent with venue pattern)
    import('./context').then(({ selectedCourtContext }) => {
      const selectedCourt = selectedCourtContext.value;
      
      // Check if we have usable data in context
      if (selectedCourt && Object.keys(selectedCourt).length > 0 && 
          (this.courtId === undefined || selectedCourt.id === this.courtId)) {
        console.log('Using court data from selectedCourtContext:', selectedCourt);
        this.court = { ...selectedCourt };
        
        // If venue ID not set, use the court's venue ID
        if (!this.venueId && selectedCourt.venueId) {
          this.venueId = selectedCourt.venueId;
        }
        
        // If court ID not set but available in context, set it
        if (!this.courtId && selectedCourt.id) {
          this.courtId = selectedCourt.id;
        }
      }
      // Fall back to direct data if available
      else if (this.courtData) {
        console.log('Using court data passed directly in state:', this.courtData);
        this.court = { ...this.courtData };
        
        // If venue ID not set, use the court's venue ID
        if (!this.venueId && this.courtData.venueId) {
          this.venueId = this.courtData.venueId;
        }
        
        // Update context with this data for consistency
        selectedCourtContext.set(this.courtData);
      }
      // Last resort: load from database
      else if (this.courtId) {
        console.log('No context data or direct data, loading from database for ID:', this.courtId);
        this.busy = true;
        CourtsDB.get(this.courtId)
          .pipe(takeUntil(this.disconnecting))
          .subscribe({
            next: (court) => {
              if (court) {
                console.log('Court data loaded from database:', court);
                this.court = { ...court };
                
                // If venue ID not set, use the court's venue ID
                if (!this.venueId) {
                  this.venueId = court.venueId;
                }
                
                // Update context with this data for consistency
                selectedCourtContext.set(court);
              } else {
                console.error('Court not found in database');
                $notify.error('Court not found');
                this._navigateBack();
              }
              this.busy = false;
            },
            error: (err) => {
              console.error('Error loading court:', err);
              $notify.error('Failed to load court data');
              this.busy = false;
              this._navigateBack();
            }
          });
      }

      // Ensure sportTypes is initialized properly
      if (!this.court.sportTypes || !Array.isArray(this.court.sportTypes)) {
        this.court.sportTypes = ['pickleball'];
      }
      
      // Log the result for debugging
      console.log('Court data initialized:', this.court);
    });
  }

  /**
   * Handle sport type change
   */
  handleSportTypeChange(sportType: keyof typeof SportTypeEnum): void {
    // Always set to a single-item array with the selected sport type
    const updatedSportTypes: (keyof typeof SportTypeEnum)[] = [sportType]
    
    // Update the court object
    this.updateProps('sportTypes', updatedSportTypes)
  }

  /**
   * Update court properties
   */
  updateProps(prop: keyof (Court & { recommendedPlayers?: number }), val: string | number | string[]): void {
    this.court = { ...this.court, [prop]: val }
  }

  /**
   * Update pricing properties
   */
  updatePricing(prop: keyof Pricing, val: number): void {
    this.court = {
      ...this.court,
      pricing: { ...this.court.pricing, [prop]: val } as Pricing,
    }
  }

  /**
   * Handle map coordinates change (from coordinates-change event)
   * This handles the new format where coordinates include southWest, northEast, and rotation
   */
  handleCoordinatesChange(e: CustomEvent<{coordinates: CourtMapCoordinates | undefined}>): void {
    const { coordinates } = e.detail
    // Ensure we properly handle the coordinates object with possible rotation
    this.court = {
      ...this.court,
      mapCoordinates: coordinates
    }
    console.log('Coordinates updated:', this.court.mapCoordinates)
  }

  /**
   * Handle bounds change from court map editor (legacy event)
   * This handles the older format where bounds come as nested arrays
   */
  handleBoundsChange(e: CustomEvent): void {
    const { bounds } = e.detail
    
    // Convert bounds array to a Firestore-compatible object format
    let mapCoordinates
    
    if (bounds) {
      // Make sure we have at least the basic bounds coordinates
      if (bounds.length >= 2 && Array.isArray(bounds[0]) && Array.isArray(bounds[1])) {
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
        
        // Check if rotation data is provided in the bounds array
        // This special format is used by the court-map-editor for backward compatibility
        if (bounds[2] && Array.isArray(bounds[2]) && 
            bounds[2][0] && bounds[2][0][0] === 'rotation' && 
            bounds[2][1] && bounds[2][1][0] !== undefined) {
          // mapCoordinates.rotation = bounds[2][1][0]
        }
      } else {
        console.warn('Invalid bounds format received:', bounds)
        return
      }
    } else {
      mapCoordinates = undefined
    }
    
    this.court = {
      ...this.court,
      mapCoordinates
    }
    
    console.log('Bounds converted to coordinates:', this.court.mapCoordinates)
  }

  /**
   * Save court data
   */
  save(): void {
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
      ...(this.isNew ? { createdAt: new Date().toISOString() } : {}),
    }
    
    // Ensure we have a valid recommended players value (if provided)
    if (court.recommendedPlayers !== undefined && isNaN(court.recommendedPlayers)) {
      delete court.recommendedPlayers
    }
    
    // Ensure map coordinates are properly stored
    if (this.court.mapCoordinates?.southWest && this.court.mapCoordinates?.northEast) {
      court.mapCoordinates = {
        southWest: {
          lat: this.court.mapCoordinates.southWest.lat,
          lng: this.court.mapCoordinates.southWest.lng
        },
        northEast: {
          lat: this.court.mapCoordinates.northEast.lat,
          lng: this.court.mapCoordinates.northEast.lng
        }
      }
      
      // Only include rotation if it's defined and is a valid number
      if (this.court.mapCoordinates.rotation !== undefined && 
          !isNaN(this.court.mapCoordinates.rotation)) {
        court.mapCoordinates.rotation = this.court.mapCoordinates.rotation
      }
    }

    // Save to database
    const saveOperation = this.isNew ? CourtsDB.upsert(court) : CourtsDB.upsert(court, this.courtId!)

    saveOperation.pipe(takeUntil(this.disconnecting)).subscribe({
      next: (savedCourt) => {
        // IMPORTANT: Update the selectedCourtContext with the saved court data
        // This ensures data consistency across the application
        if (savedCourt) {
          console.log('Setting selected court in context after save:', savedCourt);
          // Import needed to avoid circular dependency
          import('./context').then(({ selectedCourtContext }) => {
            selectedCourtContext.set(savedCourt);
          });
        }
        
        $notify.success(`Court ${this.isNew ? 'added' : 'updated'} successfully`)
        this._navigateBack()
      },
      error: (err) => {
        console.error('Error saving court:', err)
        $notify.error(`Failed to save court. Please try again.`)
        this.busy = false
      },
      complete: () => {
        this.busy = false
      },
    })
  }

  /**
   * Delete court
   */
  async deleteCourt(): Promise<void> {
    if (!this.courtId) return

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
      CourtsDB.delete(this.courtId)
        .pipe(takeUntil(this.disconnecting))
        .subscribe({
          next: () => {
            // Clear the selectedCourtContext on delete
            // Import needed to avoid circular dependency
            import('./context').then(({ selectedCourtContext }) => {
              selectedCourtContext.set({});
            });
            
            $notify.success('Court deleted successfully')
            this._navigateBack()
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

  /**
   * Navigate back to venue courts list
   */
  private _navigateBack(): void {
    if (this.venueId) {
      // Ensure venue context is set before navigating back
      if (this.venueData && this.venueData.id) {
        console.log('Navigating back with venue context:', this.venueData);
        venueContext.set(this.venueData);
      }
      
      // Update URL without reloading page
      const url = new URL(window.location.href);
      url.pathname = `/admin/venues/${this.venueId}/courts`;
      
      // Create consistent state object with venueId
      const state = { venueId: this.venueId };
      window.history.pushState(state, '', url.toString());
      
      // Use setTimeout to ensure context updates are processed
      // This matches the pattern used in venue-detail.ts
      setTimeout(() => {
        // Use Schmancy area to navigate back to courts list
        area.push({
          component: 'funkhaus-venue-courts',
          area: 'venue',
          state: state
        });
      }, 100);
    }
  }

  /**
   * Render the component
   */
  render() {
    return html`
      <admin-page>
        <div class="container mx-auto max-w-5xl px-4 py-6">
          <!-- Header -->
          <div class="flex justify-between items-center mb-6">
            <div>
              <h1 class="text-2xl font-bold">${this.isNew ? 'Add New Court' : 'Edit Court'}</h1>
              ${when(this.venueData?.name, () => html`
                <p class="text-gray-500">Venue: ${this.venueData?.name}</p>
              `)}
            </div>
            <div class="flex gap-2">
              <schmancy-button variant="outlined" @click=${this._navigateBack}>
                Cancel
              </schmancy-button>
              <schmancy-button variant="filled" @click=${this.save}>
                Save
              </schmancy-button>
            </div>
          </div>

          <!-- Main content in two columns -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Left column - Basic Information -->
            <div>
              <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
                <h2 class="text-lg font-semibold mb-4">Basic Information</h2>
                
                <!-- Court Name -->
                <div class="mb-4">
                  <sch-input
                    label="Court Name"
                    required
                    .value="${this.court.name || ''}"
                    @change=${(e: SchmancyInputChangeEvent) => this.updateProps('name', e.detail.value)}
                  ></sch-input>
                </div>
                
                <!-- Court Type -->
                <div class="mb-4">
                  <schmancy-select
                    label="Court Type"
                    required
                    .value=${this.court.courtType || ''}
                    @change=${(e: SchmancySelectChangeEvent) => this.updateProps('courtType', e.detail.value as string)}
                  >
                    ${Object.values(CourtTypeEnum).map(
                      type => html`<schmancy-option .value=${type} .label=${formatEnum(type)}>${formatEnum(type)}</schmancy-option>`
                    )}
                  </schmancy-select>
                </div>
                
                <!-- Sport Type -->
                <div class="mb-4">
                  <p class="text-sm font-medium mb-2">Sport Type</p>
                  <div class="flex flex-wrap gap-2">
                    ${Object.values(SportTypeEnum).map(
                      sportType => html`
                        <schmancy-chip
                          .selected=${Array.isArray(this.court.sportTypes) && this.court.sportTypes[0] === sportType}
                          @click=${() => this.handleSportTypeChange(sportType as keyof typeof SportTypeEnum)}
                        >
                          ${formatEnum(sportType)}
                        </schmancy-chip>
                      `
                    )}
                  </div>
                </div>
                
                <!-- Recommended Players -->
                <div class="mb-4">
                  <sch-input
                    label="Recommended Number of Players"
                    type="number"
                    min="1"
                    step="0.1"
                    .value="${this.court.recommendedPlayers?.toString() || ''}"
                    @change=${(e: SchmancyInputChangeEvent) => this.updateProps('recommendedPlayers', parseFloat(e.detail.value))}
                  ></sch-input>
                </div>
                
                <!-- Status -->
                <div class="mb-4">
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
              </div>
              
              <!-- Pricing -->
              <div class="bg-white rounded-lg shadow-sm p-6">
                <h2 class="text-lg font-semibold mb-4">Pricing</h2>
                
                <!-- Base Hourly Rate -->
                <div class="mb-4">
                  <sch-input
                    label="Base Hourly Rate (€)"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    .value="${this.court.pricing?.baseHourlyRate?.toString() || '0'}"
                    @change=${(e: SchmancyInputChangeEvent) => this.updatePricing('baseHourlyRate', parseFloat(e.detail.value))}
                  ></sch-input>
                </div>
                
                <!-- Peak Hour Rate -->
                <div class="mb-4">
                  <sch-input
                    label="Peak Hour Rate (€)"
                    type="number"
                    min="0"
                    step="0.01"
                    .value="${this.court.pricing?.peakHourRate?.toString() || ''}"
                    @change=${(e: SchmancyInputChangeEvent) => this.updatePricing('peakHourRate', parseFloat(e.detail.value))}
                  ></sch-input>
                </div>
                
                <!-- Weekend Rate -->
                <div class="mb-4">
                  <sch-input
                    label="Weekend Rate (€)"
                    type="number"
                    min="0"
                    step="0.01"
                    .value="${this.court.pricing?.weekendRate?.toString() || ''}"
                    @change=${(e: SchmancyInputChangeEvent) => this.updatePricing('weekendRate', parseFloat(e.detail.value))}
                  ></sch-input>
                </div>
              </div>
            </div>
            
            <!-- Right column - Map and Court Preview -->
            <div>
              <!-- Court Preview -->
              <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
                <h2 class="text-lg font-semibold mb-4">Court Preview</h2>
                <div class="flex justify-center">
                  ${this._renderCourtPreview(
                    Array.isArray(this.court.sportTypes) && this.court.sportTypes.length > 0
                      ? this.court.sportTypes[0]
                      : 'pickleball'
                  )}
                </div>
              </div>
              
              <!-- Court Map Placement -->
              <div class="bg-white rounded-lg shadow-sm p-6">
                <h2 class="text-lg font-semibold mb-4">Court Map Placement</h2>
                <p class="text-sm text-gray-500 mb-4">Draw a rectangle on the map to represent the court's location and size</p>
                
                ${!this.venueCoordinates.lat || !this.venueCoordinates.lng ? 
                  html`
                    <div class="text-amber-600 bg-amber-50 p-2 mb-4 text-sm rounded flex items-center">
                      <schmancy-icon class="mr-1">warning</schmancy-icon>
                      <span>Venue coordinates are not set. The map will use default coordinates.</span>
                    </div>
                  ` : ''}
                
                <court-map-editor
                  .mapCoordinates=${this.court.mapCoordinates}
                  .venueLatitude=${this.venueCoordinates.lat}
                  .venueLongitude=${this.venueCoordinates.lng}
                  @coordinates-change=${this.handleCoordinatesChange}
                  @bounds-change=${this.handleBoundsChange}
                  @no-venue-coordinates=${() => {
                    $notify.warning('Venue coordinates are not set. Please set venue coordinates in the venue details for accurate court placement.');
                  }}
                ></court-map-editor>
              </div>
              
              <!-- Delete button for existing courts -->
              ${!this.isNew ? html`
                <div class="mt-6 text-right">
                  <schmancy-button @click=${this.deleteCourt}>
                    <span class="text-error-default flex gap-2 items-center">
                      <schmancy-icon>delete</schmancy-icon>
                      Delete Court
                    </span>
                  </schmancy-button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
        
        ${when(this.busy, () => html`<schmancy-busy class="fixed inset-0"></schmancy-busy>`)}
      </admin-page>
    `
  }

  /**
   * Render court preview based on sport type
   */
  private _renderCourtPreview(sportType: keyof typeof SportTypeEnum) {
    switch (sportType) {
      case 'padel':
        return html`
          <div class="flex flex-col items-center">
            <img src="/svg/padel-court.svg" alt="Padel Court" width="300" height="160" class="object-contain" />
            <span class="text-sm mt-2">Padel Court</span>
          </div>
        `
      case 'volleyball':
        return html`
          <div class="flex flex-col items-center">
            <img src="/svg/volleyball-court.svg" alt="Volleyball Court" width="300" height="160" class="object-contain" />
            <span class="text-sm mt-2">Volleyball Court</span>
          </div>
        `
      case 'pickleball':
      default:
        return html`
          <div class="flex flex-col items-center">
            <img src="/svg/pickleball-court.svg" alt="Pickleball Court" width="300" height="160" class="object-contain" />
            <span class="text-sm mt-2">Pickleball Court</span>
          </div>
        `
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'court-detail': CourtDetail
  }
}
