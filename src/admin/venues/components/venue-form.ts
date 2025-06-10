import {
  $notify,
  fullHeight,
  schmancyCheckBoxChangeEvent,
  SchmancyInputChangeEvent,
  SchmancySelectChangeEvent,
  sheet,
} from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { takeUntil } from 'rxjs'
import { VenuesDB } from 'src/db/venue-collection'
import { FacilityEnum, OperatingHours, Venue, VenueTypeEnum, VenueSettings, defaultVenueSettings } from 'src/types/booking/venue.types'
import { auth } from 'src/firebase/firebase'
import { confirm } from 'src/schmancy'
import './venue-info-card'
import 'src/public/shared/components/venue-map-interactive'

// Format enum values to display labels
export const formatEnum = (value: string): string =>
  value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim()

@customElement('venue-form')
export class VenueForm extends $LitElement() {
  // Properties that can be passed in
  @property({ type: Object }) venue?: Partial<Venue>
  
  // Internal state
  @state() private busy = false
  @state() private formErrors: Record<string, string> = {}
  @state() private formData: Venue = this.createEmptyVenue()
  @state() private isEditMode = false

  // Create an empty venue with defaults
  private createEmptyVenue(): Venue {
    return {
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
      settings: defaultVenueSettings,
    } as Venue
  }

  connectedCallback() {
    super.connectedCallback()
    
    // Initialize form data based on input
    if (this.venue && this.venue.id) {
      // Edit mode - copy the venue data
      this.formData = { ...this.venue } as Venue
      this.isEditMode = true
      console.log('VenueForm: Edit mode for venue:', this.venue.id)
    } else {
      // Create mode
      this.formData = this.createEmptyVenue()
      this.isEditMode = false
      console.log('VenueForm: Create mode')
    }
    
    // Request fullscreen
    this.dispatchEvent(new CustomEvent('fullscreen', { bubbles: true, composed: true, detail: true }))
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
                .value="${this.formData.name || ''}"
                .error=${Boolean(this.formErrors.name)}
                @change=${(e: SchmancyInputChangeEvent) => this.updateField('name', e.detail.value)}
              ></schmancy-input>

              <schmancy-textarea
                label="Description"
                rows="3"
                .value="${this.formData.description || ''}"
                @change=${(e: SchmancyInputChangeEvent) => this.updateField('description', e.detail.value)}
              ></schmancy-textarea>

              <schmancy-select
                label="Venue Type"
                required
                .value=${this.formData.venueType || ''}
                @change=${(e: SchmancySelectChangeEvent) => this.updateField('venueType', e.detail.value as string)}
              >
                ${Object.values(VenueTypeEnum).map(
                  type => html`<schmancy-option .value=${type} .label=${formatEnum(type)}>${formatEnum(type)}</schmancy-option>`
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
                  .value="${this.formData.theme?.primary || '#5e808e'}"
                  @change=${(e: SchmancyInputChangeEvent) => this.updateTheme('primary', e.detail.value)}
                ></schmancy-input>

                <!-- Text Color -->
                <schmancy-input
                  type="color"
                  label="Text Color"
                  .value="${this.formData.theme?.text || '#ffffff'}"
                  @change=${(e: SchmancyInputChangeEvent) => this.updateTheme('text', e.detail.value)}
                ></schmancy-input>

                <!-- Logo Type -->
                <schmancy-select
                  label="Logo Color"
                  .value=${this.formData.theme?.logo || 'light'}
                  @change=${(e: SchmancySelectChangeEvent) => this.updateTheme('logo', e.detail.value as 'light' | 'dark')}
                >
                  <schmancy-option value="light">Light</schmancy-option>
                  <schmancy-option value="dark">Dark</schmancy-option>
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
                .value="${this.formData.address?.street || ''}"
                .error=${Boolean(this.formErrors['address.street'])}
                @change=${(e: SchmancyInputChangeEvent) => this.updateAddress('street', e.detail.value)}
              ></schmancy-input>

              <schmancy-input
                label="City"
                required
                .value="${this.formData.address?.city || ''}"
                .error=${Boolean(this.formErrors['address.city'])}
                @change=${(e: SchmancyInputChangeEvent) => this.updateAddress('city', e.detail.value)}
              ></schmancy-input>

              <schmancy-input
                label="Postal Code"
                required
                .value="${this.formData.address?.postalCode || ''}"
                .error=${Boolean(this.formErrors['address.postalCode'])}
                @change=${(e: SchmancyInputChangeEvent) => this.updateAddress('postalCode', e.detail.value)}
              ></schmancy-input>

              <schmancy-input
                label="Country"
                required
                .value="${this.formData.address?.country || ''}"
                .error=${Boolean(this.formErrors['address.country'])}
                @change=${(e: SchmancyInputChangeEvent) => this.updateAddress('country', e.detail.value)}
              ></schmancy-input>
              
              <!-- Interactive Map for Location Selection -->
              <div class="col-span-1">
                <schmancy-typography type="label" token="sm" class="mb-2 block">Select Location on Map</schmancy-typography>
                <div class="h-[50vh] rounded-lg overflow-hidden border border-surface-containerHigh">
                  <venue-map-interactive
                    .address=${this.formData.address}
                    .venueName=${this.formData.name}
                    .selectionMode=${true}
                    .showMarker=${true}
                    .selectedLocation=${this.formData.address?.coordinates}
                    .zoom=${15}
                    .mapType=${'satellite'}
                    .showMapTypeControl=${true}
                    @location-selected=${(e: CustomEvent) => this.handleLocationSelected(e)}
                  ></venue-map-interactive>
                </div>
                ${this.formData.address?.coordinates ? html`
                  <schmancy-typography type="body" token="sm" class="mt-2 text-surface-onVariant">
                    <schmancy-icon size="14px" class="inline mr-1">location_on</schmancy-icon>
                    Coordinates: ${this.formData.address.coordinates.lat.toFixed(6)}, ${this.formData.address.coordinates.lng.toFixed(6)}
                  </schmancy-typography>
                ` : ''}
              </div>
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
                .value=${this.formData.facilities || []}
                @change=${(e: SchmancySelectChangeEvent) => this.updateField('facilities', e.detail.value as string[])}
              >
                ${Object.values(FacilityEnum).map(
                  facility => html`<schmancy-option .value=${facility} .label=${formatEnum(facility)}>${formatEnum(facility)}</schmancy-option>`
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
                .value="${this.formData.contactEmail || ''}"
                .error=${Boolean(this.formErrors.contactEmail)}
                @change=${(e: SchmancyInputChangeEvent) => this.updateField('contactEmail', e.detail.value)}
              ></schmancy-input>

              <schmancy-input
                label="Phone"
                .value="${this.formData.contactPhone || ''}"
                @change=${(e: SchmancyInputChangeEvent) => this.updateField('contactPhone', e.detail.value)}
              ></schmancy-input>

              <schmancy-input
                label="Website"
                .value="${this.formData.website || ''}"
                @change=${(e: SchmancyInputChangeEvent) => this.updateField('website', e.detail.value)}
              ></schmancy-input>
            </div>

            <!-- Booking Settings -->
            <div class="grid gap-3 mb-4">
              <schmancy-grid>
                <schmancy-typography type="title">Booking Settings</schmancy-typography>
                <schmancy-divider></schmancy-divider>
              </schmancy-grid>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <!-- Minimum Booking Time -->
                <schmancy-select
                  label="Minimum Booking Time"
                  required
                  .value=${String(this.formData.settings?.minBookingTime || 30)}
                  @change=${(e: SchmancySelectChangeEvent) => this.updateSettings('minBookingTime', Number(e.detail.value))}
                >
                  <schmancy-option value="30">30 minutes</schmancy-option>
                  <schmancy-option value="60">1 hour</schmancy-option>
                  <schmancy-option value="90">1.5 hours</schmancy-option>
                  <schmancy-option value="120">2 hours</schmancy-option>
                </schmancy-select>

                <!-- Maximum Booking Time -->
                <schmancy-select
                  label="Maximum Booking Time"
                  required
                  .value=${String(this.formData.settings?.maxBookingTime || 180)}
                  @change=${(e: SchmancySelectChangeEvent) => this.updateSettings('maxBookingTime', Number(e.detail.value))}
                >
                  <schmancy-option value="60">1 hour</schmancy-option>
                  <schmancy-option value="90">1.5 hours</schmancy-option>
                  <schmancy-option value="120">2 hours</schmancy-option>
                  <schmancy-option value="150">2.5 hours</schmancy-option>
                  <schmancy-option value="180">3 hours</schmancy-option>
                  <schmancy-option value="210">3.5 hours</schmancy-option>
                  <schmancy-option value="240">4 hours</schmancy-option>
                  <schmancy-option value="270">4.5 hours</schmancy-option>
                  <schmancy-option value="300">5 hours</schmancy-option>
                </schmancy-select>

                <!-- Booking Time Step -->
                <schmancy-select
                  label="Time Slot Interval"
                  required
                  .value=${String(this.formData.settings?.bookingTimeStep || 30)}
                  @change=${(e: SchmancySelectChangeEvent) => this.updateSettings('bookingTimeStep', Number(e.detail.value))}
                >
                  <schmancy-option value="15">15 minutes</schmancy-option>
                  <schmancy-option value="30">30 minutes</schmancy-option>
                  <schmancy-option value="60">1 hour</schmancy-option>
                </schmancy-select>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <!-- Advance Booking Limit -->
                <schmancy-input
                  type="number"
                  label="Advance Booking Limit (days)"
                  min="1"
                  max="365"
                  .value="${String(this.formData.settings?.advanceBookingLimit || 14)}"
                  @change=${(e: SchmancyInputChangeEvent) => this.updateSettings('advanceBookingLimit', Number(e.detail.value))}
                ></schmancy-input>

                <!-- Booking Flow Type -->
                <schmancy-select
                  label="Booking Flow"
                  required
                  .value=${this.formData.settings?.bookingFlow || 'DATE_COURT_TIME_DURATION'}
                  @change=${(e: SchmancySelectChangeEvent) => this.updateSettings('bookingFlow', e.detail.value as string)}
                >
                  <schmancy-option value="DATE_COURT_TIME_DURATION">Date → Court → Time → Duration</schmancy-option>
                  <schmancy-option value="DATE_TIME_DURATION_COURT">Date → Time → Duration → Court</schmancy-option>
                  <schmancy-option value="DATE_TIME_COURT_DURATION">Date → Time → Court → Duration</schmancy-option>
                </schmancy-select>
              </div>

              <!-- Cancellation Policy -->
              <div class="mt-4">
                <schmancy-typography type="label" token="sm" class="mb-2 block">Cancellation Policy</schmancy-typography>
                <div class="grid gap-3">
                  <schmancy-checkbox
                    .value=${this.formData.settings?.cancellationPolicy?.allowCancellation || true}
                    @change=${(e: schmancyCheckBoxChangeEvent) => 
                      this.updateCancellationPolicy('allowCancellation', e.detail.value)}
                  >
                    Allow Cancellations
                  </schmancy-checkbox>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 ${this.formData.settings?.cancellationPolicy?.allowCancellation ? '' : 'opacity-50 pointer-events-none'}">
                    <schmancy-input
                      type="number"
                      label="Refund Cutoff (hours before booking)"
                      min="0"
                      max="168"
                      .value="${String(this.formData.settings?.cancellationPolicy?.refundCutoff || 24)}"
                      @change=${(e: SchmancyInputChangeEvent) => 
                        this.updateCancellationPolicy('refundCutoff', Number(e.detail.value))}
                    ></schmancy-input>

                    <schmancy-input
                      type="number"
                      label="Refund Percentage (%)"
                      min="0"
                      max="100"
                      .value="${String(this.formData.settings?.cancellationPolicy?.refundPercentage || 80)}"
                      @change=${(e: SchmancyInputChangeEvent) => 
                        this.updateCancellationPolicy('refundPercentage', Number(e.detail.value))}
                    ></schmancy-input>
                  </div>
                </div>
              </div>
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
                .value=${this.formData.status || 'active'}
                @change=${(e: SchmancySelectChangeEvent) => this.updateField('status', e.detail.value as string)}
              >
                <schmancy-option value="active">Active</schmancy-option>
                <schmancy-option value="maintenance">Under Maintenance</schmancy-option>
                <schmancy-option value="inactive">Inactive</schmancy-option>
              </schmancy-select>
            </div>

            <!-- Actions -->
            <div class="flex gap-4 justify-between">
              ${this.isEditMode
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
                <schmancy-button variant="outlined" type="button" @click=${this.handleCancel} .disabled=${this.busy}>
                  Cancel
                </schmancy-button>
                <schmancy-button variant="filled" type="submit" .disabled=${this.busy}>
                  ${this.isEditMode ? 'Update' : 'Create'}
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
              .venue=${this.formData}
              .theme=${this.formData.theme || { primary: '#5e808e', text: '#ffffff', logo: 'light' }}
              class="mb-8 transform scale-110"
            ></funkhaus-venue-card>
            
            <!-- Map Preview if coordinates are set -->
            ${this.formData.address?.coordinates ? html`
              <div class="w-full mt-4">
                <schmancy-typography type="label" token="sm" class="mb-2 block">Location Preview</schmancy-typography>
                <div class="h-48 rounded-lg overflow-hidden border border-surface-containerHigh">
                  <venue-map-interactive
                    .address=${this.formData.address}
                    .venueName=${this.formData.name}
                    .selectedLocation=${this.formData.address.coordinates}
                    .showMarker=${true}
                    .interactive=${false}
                    .zoom=${16}
                    .mapType=${'satellite'}
                  ></venue-map-interactive>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      ${this.busy ? html`<schmancy-busy></schmancy-busy>` : ''}
    `
  }

  private renderOperatingHours() {
    const days = [
      { key: 'monday', label: 'Monday' },
      { key: 'tuesday', label: 'Tuesday' },
      { key: 'wednesday', label: 'Wednesday' },
      { key: 'thursday', label: 'Thursday' },
      { key: 'friday', label: 'Friday' },
      { key: 'saturday', label: 'Saturday' },
      { key: 'sunday', label: 'Sunday' },
    ]

    const operatingHours = this.formData.operatingHours || {}

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

  // Update field
  private updateField(field: keyof Venue, value: any) {
    this.formData = { ...this.formData, [field]: value }
    this.requestUpdate()
    
    // Clear error for this field
    if (this.formErrors[field]) {
      const updatedErrors = { ...this.formErrors }
      delete updatedErrors[field]
      this.formErrors = updatedErrors
    }
  }

  // Update theme
  private updateTheme(prop: 'primary' | 'text' | 'logo', value: string | 'light' | 'dark') {
    const theme = {
      primary: '#5e808e',
      text: '#ffffff',
      logo: 'light' as const,
      ...this.formData.theme,
      [prop]: value,
    }
    this.formData = { ...this.formData, theme }
    this.requestUpdate()
  }

  // Update address
  private updateAddress(field: keyof Venue['address'], value: string) {
    const address = {
      ...this.formData.address,
      [field]: value,
    }
    this.formData = { ...this.formData, address }
    this.requestUpdate()
    
    // Clear error for this address field
    const errorKey = `address.${field}`
    if (this.formErrors[errorKey]) {
      const updatedErrors = { ...this.formErrors }
      delete updatedErrors[errorKey]
      this.formErrors = updatedErrors
    }
  }
  
  // Handle location selected from map
  private handleLocationSelected(e: CustomEvent) {
    const { location, address } = e.detail
    
    if (location) {
      // Update coordinates
      const updatedAddress = {
        ...this.formData.address,
        coordinates: {
          lat: location.lat,
          lng: location.lng
        }
      }
      
      // If we got address from reverse geocoding, update those fields too
      if (address && address.street && address.city) {
        updatedAddress.street = address.street || updatedAddress.street
        updatedAddress.city = address.city || updatedAddress.city
        updatedAddress.postalCode = address.postalCode || updatedAddress.postalCode
        updatedAddress.country = address.country || updatedAddress.country
      }
      
      this.formData = { ...this.formData, address: updatedAddress }
      this.requestUpdate()
      
      // Clear any address errors since we got valid coordinates
      const addressErrors = Object.keys(this.formErrors).filter(key => key.startsWith('address.'))
      if (addressErrors.length > 0) {
        const updatedErrors = { ...this.formErrors }
        addressErrors.forEach(key => delete updatedErrors[key])
        this.formErrors = updatedErrors
      }
      
      $notify.success('Location selected on map')
    }
  }

  // Toggle day operation
  private toggleDayOperation(day: keyof OperatingHours, isOpen: boolean) {
    const operatingHours = { ...this.formData.operatingHours }
    
    if (isOpen) {
      operatingHours[day] = { open: '09:00', close: '22:00' }
    } else {
      operatingHours[day] = null
    }
    
    this.formData = { ...this.formData, operatingHours }
    this.requestUpdate()
  }

  // Update operating hours
  private updateOperatingHours(day: keyof OperatingHours, field: 'open' | 'close', value: string) {
    const operatingHours = { ...this.formData.operatingHours }
    const dayHours = operatingHours[day] || { open: '09:00', close: '22:00' }
    operatingHours[day] = { ...dayHours, [field]: value }
    
    this.formData = { ...this.formData, operatingHours }
    this.requestUpdate()
  }

  // Update settings
  private updateSettings(field: keyof VenueSettings, value: any) {
    const settings = {
      ...defaultVenueSettings,
      ...this.formData.settings,
      [field]: value,
    }
    this.formData = { ...this.formData, settings }
    this.requestUpdate()
  }

  // Update cancellation policy
  private updateCancellationPolicy(field: keyof VenueSettings['cancellationPolicy'], value: any) {
    const settings = {
      ...defaultVenueSettings,
      ...this.formData.settings,
      cancellationPolicy: {
        ...defaultVenueSettings.cancellationPolicy,
        ...this.formData.settings?.cancellationPolicy,
        [field]: value,
      },
    }
    this.formData = { ...this.formData, settings }
    this.requestUpdate()
  }

  // Validate form
  private validateForm(): boolean {
    const errors: Record<string, string> = {}

    // Required fields validation
    if (!this.formData.name?.trim()) {
      errors.name = 'Venue name is required'
    }

    if (!this.formData.venueType) {
      errors.venueType = 'Venue type is required'
    }

    // Address validation
    if (!this.formData.address?.street?.trim()) {
      errors['address.street'] = 'Street is required'
    }

    if (!this.formData.address?.city?.trim()) {
      errors['address.city'] = 'City is required'
    }

    if (!this.formData.address?.postalCode?.trim()) {
      errors['address.postalCode'] = 'Postal code is required'
    }

    if (!this.formData.address?.country?.trim()) {
      errors['address.country'] = 'Country is required'
    }

    // Email validation
    if (this.formData.contactEmail && !this.isValidEmail(this.formData.contactEmail)) {
      errors.contactEmail = 'Please enter a valid email address'
    }

    this.formErrors = errors
    return Object.keys(errors).length === 0
  }

  // Email validation helper
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Handle cancel
  private handleCancel = () => {
    sheet.dismiss(this.tagName)
  }

  // Handle delete
  private handleDeleteClick = () => {
    if (this.formData.id) {
      this.confirmDelete(this.formData.id)
    }
  }

  // Save venue
  private onSave = (e: Event) => {
    e.preventDefault()

    if (!this.validateForm()) {
      $notify.error('Please fix the errors in the form')
      return
    }

    this.busy = true

    let venueToSave: Venue

    if (this.isEditMode) {
      // Update existing venue
      venueToSave = {
        ...this.formData,
        updatedAt: new Date().toISOString(),
      }
    } else {
      // Create new venue
      const newId = crypto.randomUUID()
      venueToSave = {
        ...this.formData,
        id: newId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || '',
      }
    }

    VenuesDB.upsert(venueToSave, venueToSave.id)
      .pipe(takeUntil(this.disconnecting))
      .subscribe({
        next: () => {
          $notify.success(`Venue ${this.isEditMode ? 'updated' : 'created'} successfully`)
          this.busy = false
          sheet.dismiss(this.tagName)
        },
        error: err => {
          console.error('Error saving venue:', err)
          $notify.error(`Failed to ${this.isEditMode ? 'update' : 'create'} venue: ${err.message || 'Unknown error'}`)
          this.busy = false
        },
      })
  }

  // Confirm delete
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

declare global {
  interface HTMLElementTagNameMap {
    'venue-form': VenueForm
  }
}
