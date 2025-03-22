import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'

// Define court interfaces
export interface Court {
	id: string
	name: string
	sportTypes?: string[]
	status?: string
	venueId?: string
}

export interface CourtAvailabilityStatus {
	courtId: string
	available: boolean
	fullyAvailable: boolean
	availableTimeSlots: string[]
	unavailableTimeSlots: string[]
}

// Define global Leaflet interface to handle dynamic loading
declare global {
	interface Window {
		L: any
	}
}

type CourtAvailabilityType = 'full' | 'partial' | 'none'

/**
 * Court Map View Component
 *
 * A map-based view of tennis courts using Leaflet.js
 * Displays courts with availability indicators and selection capabilities
 */
@customElement('court-map-view')
export class CourtMapView extends $LitElement(css`
	:host {
		display: block;
		width: 100%;
		/* Contain everything properly */
		contain: layout paint;
	}

	/* Core map container - critical fixes */
	.map-container {
		width: 100%;
		height: 400px;
		border-radius: 8px;
		position: relative;
		overflow: hidden;
		/* Force a single layer to prevent fragmentation */
		isolation: isolate;
		/* Force containing block */
		transform: translateZ(0);
		/* Ensure the map stays together with a clear stacking context */
		z-index: 0;
	}

	/* Map loading overlay */
	.map-loading-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(255, 255, 255, 0.8);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}

	/* Map error overlay */
	.map-error-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(255, 255, 255, 0.9);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}

	/* Retry button */
	.retry-button {
		margin-top: 12px;
		padding: 8px 16px;
		background-color: #3b82f6;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	/* Force Leaflet container to respect boundaries */
	.leaflet-container {
		width: 100% !important;
		height: 100% !important;
		position: absolute !important;
		top: 0 !important;
		left: 0 !important;
		right: 0 !important;
		bottom: 0 !important;
	}

	/* Fix for map legend - move to bottom of container */
	.map-legend {
		position: absolute;
		bottom: 10px;
		right: 10px;
		background-color: white;
		padding: 6px 10px;
		border-radius: 4px;
		box-shadow: 0 1px 5px rgba(0, 0, 0, 0.2);
		z-index: 1000;
		font-size: 12px;
		display: flex;
		gap: 12px;
	}

	/* Legend dots */
	.legend-item {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.legend-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		display: inline-block;
	}

	.dot-available {
		background-color: #22c55e;
	}

	.dot-limited {
		background-color: #f97316;
	}

	.dot-unavailable {
		background-color: #ef4444;
	}

	/* Include essential Leaflet styles directly in component to prevent FOUC */
	.leaflet-pane,
	.leaflet-tile,
	.leaflet-marker-icon,
	.leaflet-marker-shadow,
	.leaflet-tile-container,
	.leaflet-pane > svg,
	.leaflet-pane > canvas,
	.leaflet-zoom-box,
	.leaflet-image-layer,
	.leaflet-layer {
		position: absolute;
		left: 0;
		top: 0;
	}

	.leaflet-container {
		overflow: hidden;
	}

	.leaflet-tile,
	.leaflet-marker-icon,
	.leaflet-marker-shadow {
		-webkit-user-select: none;
		-moz-user-select: none;
		user-select: none;
		-webkit-user-drag: none;
	}

	.leaflet-control {
		position: relative;
		z-index: 800;
	}

	.leaflet-pane {
		z-index: 400;
	}

	.leaflet-tile-pane {
		z-index: 200;
	}

	.leaflet-overlay-pane {
		z-index: 400;
	}

	.leaflet-shadow-pane {
		z-index: 500;
	}

	.leaflet-marker-pane {
		z-index: 600;
	}

	.leaflet-tooltip-pane {
		z-index: 650;
	}

	.leaflet-popup-pane {
		z-index: 700;
	}
`) {
	/**
	 * Array of courts to display on the map
	 */
	@property({ type: Array })
	courts: Court[] = []

	/**
	 * ID of the currently selected court
	 */
	@property({ type: String })
	selectedCourtId: string = ''

	/**
	 * Map of court availability statuses keyed by court ID
	 */
	@property({ type: Object })
	courtAvailability: Map<string, CourtAvailabilityStatus> = new Map()

	/**
	 * Loading state of the map
	 */
	@state()
	loading: boolean = true

	/**
	 * Error state message
	 */
	@state()
	error: string | null = null

	/**
	 * Reference to the map container element
	 */
	@query('.map-container')
	mapContainer!: HTMLElement

	// Private properties
	private map: any = null
	private markers: Record<string, any> = {}
	private leafletLoaded: boolean = false
	private popupEventHandlers: Map<string, Function> = new Map()

	/**
	 * When component is connected to DOM, load Leaflet
	 */
	connectedCallback(): void {
		super.connectedCallback()
		this._loadLeafletScript().then(() => {
			this.leafletLoaded = true
		})
	}

	/**
	 * Load Leaflet script and CSS
	 */
	private async _loadLeafletScript(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			// Check if Leaflet is already loaded
			if (window.L) {
				console.log('Leaflet already loaded')
				resolve()
				return
			}

			console.log('Loading Leaflet script and CSS')

			// Load CSS if not already present
			if (!document.querySelector('link[href*="leaflet.css"]')) {
				const link = document.createElement('link')
				link.rel = 'stylesheet'
				link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
				link.crossOrigin = 'anonymous'
				document.head.appendChild(link)
			}

			// Load Leaflet JS
			const leafletScript = document.createElement('script')
			leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
			leafletScript.crossOrigin = 'anonymous'

			leafletScript.onload = () => {
				resolve()
			}

			document.head.appendChild(leafletScript)
		})
	}

	/**
	 * After first render, initialize the map
	 */
	protected firstUpdated(): void {
		this.loading = true
		this.error = null

		if (this.leafletLoaded) {
			this._initializeMap()
		} else {
			this._loadLeafletScript()
				.then(() => {
					this.leafletLoaded = true
					this._initializeMap()
				})
				.catch(error => {
					console.error('Error loading Leaflet:', error)
					this.error = 'Failed to load map library. Please try again.'
					this.loading = false
				})
		}
	}

	/**
	 * Update when relevant properties change
	 */
	protected updated(changedProperties: Map<string, unknown>): void {
		super.updated(changedProperties)

		// Re-initialize map if coordinates change and Leaflet is loaded
		if (
			this.leafletLoaded &&
			this.map &&
			(changedProperties.has('courts') ||
				changedProperties.has('selectedCourtId') ||
				changedProperties.has('courtAvailability'))
		) {
			this._updateCourts()
		}
	}

	/**
	 * Clean up on disconnect
	 */
	disconnectedCallback(): void {
		super.disconnectedCallback()

		// Clean up map to prevent memory leaks
		if (this.map) {
			this.map.remove()
			this.map = null
		}
	}

	/**
	 * Initialize the map
	 */
	private _initializeMap(): void {
		// Log the status of Leaflet loading
		console.log('Initializing map, Leaflet loaded:', !!window.L)

		// Wait for DOM to be ready
		requestAnimationFrame(() => {
			if (!this.mapContainer) {
				console.error('Map container not found')
				this.error = 'Map container not found'
				this.loading = false
				return
			}

			if (!window.L) {
				console.error('Leaflet not loaded properly')
				this.error = 'Map library not loaded properly'
				this.loading = false
				return
			}

			// Log container dimensions to help debug
			console.log('Map container dimensions:', this.mapContainer.offsetWidth, this.mapContainer.offsetHeight)

			// If a map already exists, remove it first
			if (this.map) {
				this.map.remove()
				this.map = null
			}

			try {
				const L = window.L

				// Create map instance
				this.map = L.map(this.mapContainer, {
					center: [51.505, -0.09],
					zoom: 15,
					zoomControl: true,
					attributionControl: false,
					fadeAnimation: false,
					markerZoomAnimation: false,
					zoomAnimation: false,
					preferCanvas: true,
					tap: false,
				})

				// Add tile layer with multiple fallback options
				try {
					// First try with standard OpenStreetMap tiles
					L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
						maxZoom: 19,
						subdomains: 'abc',
						attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
					}).addTo(this.map)
				} catch (e) {
					console.error('Error adding primary tile layer:', e)
					try {
						// Second fallback to OSM HOT
						L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
							maxZoom: 19,
							subdomains: 'abc',
							attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
						}).addTo(this.map)
					} catch (e2) {
						console.error('Error adding secondary tile layer:', e2)
						try {
							// Third fallback to CartoDB
							L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
								maxZoom: 19,
								subdomains: 'abcd',
								attribution:
									'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>',
							}).addTo(this.map)
						} catch (e3) {
							console.error('All tile layers failed:', e3)
						}
					}
				}

				// Add attribution in a cleaner way
				L.control
					.attribution({
						position: 'bottomleft',
					})
					.addAttribution('Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors')
					.addTo(this.map)

				// Create court markers
				this._updateCourts()

				// Force multiple redraws of the map to ensure proper rendering
				setTimeout(() => {
					if (this.map) {
						this.map.invalidateSize(true)
					}
				}, 100)

				setTimeout(() => {
					if (this.map) {
						this.map.invalidateSize(true)

						// Explicitly check and log the map container dimensions
						if (this.mapContainer) {
							console.log('Map container dimensions:', this.mapContainer.offsetWidth, this.mapContainer.offsetHeight)
						}
					}
				}, 500)

				this.loading = false
			} catch (error) {
				console.error('Error initializing map:', error)
				this.error = 'Failed to initialize map'
				this.loading = false
			}
		})
	}

	/**
	 * Create proper bounds from court coordinates
	 */
	private _createBoundsFromCourts(): any {
		if (!window.L || this.courts.length === 0) return null

		try {
			const bounds = window.L.latLngBounds()
			this.courts.forEach((_court, index) => {
				// Create location for the court (in production, use real coordinates)
				const lat = 51.505 + Math.cos(index * 0.7) * 0.002
				const lng = -0.09 + Math.sin(index * 0.7) * 0.002
				bounds.extend([lat, lng])
			})
			return bounds
		} catch (e) {
			console.error('Error creating bounds:', e)
			return null
		}
	}

	/**
	 * Clear all popup event handlers to prevent memory leaks
	 */
	private _clearAllPopupEventHandlers(): void {
		this.popupEventHandlers.forEach((handler, id) => {
			const element = document.getElementById(id)
			if (element) {
				element.removeEventListener('click', handler as EventListener)
			}
		})
		this.popupEventHandlers.clear()
	}

	/**
	 * Update court markers on the map
	 */
	private _updateCourts(): void {
		if (!this.map || !window.L || !this.mapContainer) {
			console.warn('Cannot update courts: map not initialized')
			return
		}

		try {
			// Clean up previous event handlers to prevent memory leaks
			this._clearAllPopupEventHandlers()

			// Clear existing markers
			Object.values(this.markers).forEach(marker => {
				try {
					marker.remove()
				} catch (e) {
					console.warn('Error removing marker:', e)
				}
			})
			this.markers = {}

			// Create bounds for map fitting
			const bounds = window.L.latLngBounds()
			let hasValidCourts = false

			// Create court markers
			this.courts.forEach((court, index) => {
				try {
					// Create location for the court (in production, use real coordinates)
					// For demo purposes, we're creating fake coordinates around a center point
					const lat = 51.505 + Math.cos(index * 0.7) * 0.002
					const lng = -0.09 + Math.sin(index * 0.7) * 0.002

					// Get availability status
					const availabilityStatus = this._getCourtAvailabilityStatus(court.id)

					// Set marker color based on availability
					let markerColor: string
					switch (availabilityStatus) {
						case 'full':
							markerColor = '#22c55e' // Green for fully available
							break
						case 'partial':
							markerColor = '#f97316' // Orange for partially available
							break
						case 'none':
						default:
							markerColor = '#ef4444' // Red for unavailable
					}

					// Create custom marker icon
					const isSelected = this.selectedCourtId === court.id
					const iconSize = isSelected ? 36 : 30
					const iconHtml = `
            <div style="
              width: ${iconSize}px; 
              height: ${iconSize}px; 
              background-color: ${markerColor}; 
              border-radius: 50%; 
              display: flex; 
              align-items: center; 
              justify-content: center;
              color: white;
              font-weight: bold;
              border: 2px solid white;
              box-shadow: 0 2px 5px rgba(0,0,0,0.2);
              transition: all 0.3s ease;
            ">
              ${index + 1}
            </div>
          `

					const L = window.L

					const icon = L.divIcon({
						className: 'court-marker',
						html: iconHtml,
						iconSize: [iconSize, iconSize],
						iconAnchor: [iconSize / 2, iconSize / 2],
					})

					// Create marker
					const marker = L.marker([lat, lng], { icon })

					// Add to map safely
					marker.addTo(this.map)

					// Get court details for popup
					const sportTypes =
						court.sportTypes && court.sportTypes.length > 0 ? court.sportTypes.join(', ') : 'Standard court'

					const isAvailable = availabilityStatus !== 'none'

					// Create unique ID for this court's button
					const buttonId = `select-court-${court.id}-${Date.now()}`

					// Create popup content
					const popupContent = `
            <div style="text-align: center; padding: 5px;">
              <h3 style="margin: 0; font-size: 16px; font-weight: bold;">${court.name}</h3>
              <p style="margin: 5px 0; font-size: 12px;">${sportTypes}</p>
              ${
								isAvailable
									? `
                <button 
                  id="${buttonId}" 
                  style="
                    background-color: ${isSelected ? '#9333ea' : '#3b82f6'};
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 6px 12px;
                    margin-top: 5px;
                    font-size: 13px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                  "
                >
                  ${isSelected ? 'Selected' : 'Select Court'}
                </button>
              `
									: `
                <div style="
                  background-color: #f3f4f6;
                  color: #6b7280;
                  border-radius: 4px;
                  padding: 6px 12px;
                  margin-top: 5px;
                  font-size: 13px;
                ">
                  Unavailable
                </div>
              `
							}
            </div>
          `

					// Create popup
					const popup = L.popup({
						closeButton: true,
						className: 'court-popup',
					}).setContent(popupContent)

					// Bind popup to marker
					marker.bindPopup(popup)

					// Create handler function for the button
					const handleCourtSelect = () => {
						this._handleCourtSelect(court)
						if (this.map) {
							this.map.closePopup()
						}
					}

					// Add popup open event to safely add event listener to button
					marker.on('popupopen', () => {
						// Add click handler to select button
						const selectButton = document.getElementById(buttonId)
						if (selectButton) {
							// Store the handler to remove it later
							this.popupEventHandlers.set(buttonId, handleCourtSelect)
							selectButton.addEventListener('click', handleCourtSelect as EventListener)
						}
					})

					// Store marker and extend bounds
					this.markers[court.id] = marker
					bounds.extend([lat, lng])
					hasValidCourts = true
				} catch (e) {
					console.error(`Error creating marker for court ${court.id}:`, e)
				}
			})

			// Fit map to show all markers
			if (hasValidCourts && this.map) {
				try {
					this.map.fitBounds(bounds, { padding: [35, 35] })
				} catch (e) {
					console.warn('Error fitting bounds:', e)
					// Fallback to default view
					this.map.setView([51.505, -0.09], 15)
				}
			}

			// Open popup for selected court
			if (this.selectedCourtId && this.markers[this.selectedCourtId] && this.map) {
				try {
					// First make sure the map is at the right location
					const marker = this.markers[this.selectedCourtId]
					const latLng = marker.getLatLng()

					// Center map on selected court
					this.map.setView([latLng.lat, latLng.lng], this.map.getZoom())

					// Open the popup after a short delay to ensure the map is ready
					setTimeout(() => {
						if (this.markers[this.selectedCourtId]) {
							this.markers[this.selectedCourtId].openPopup()
						}
					}, 300)
				} catch (e) {
					console.warn('Error focusing selected court:', e)
				}
			}
		} catch (error) {
			console.error('Error updating courts on map:', error)
			this.error = 'Failed to update courts on map'
		}
	}

	/**
	 * Get court availability status
	 */
	private _getCourtAvailabilityStatus(courtId: string): CourtAvailabilityType {
		const status = this.courtAvailability.get(courtId)

		if (!status) return 'none'

		if (status.fullyAvailable) return 'full'

		if (status.available) return 'partial'

		return 'none'
	}

	/**
	 * Handle court selection
	 */
	private _handleCourtSelect(court: Court): void {
		// Only allow selection of available courts
		const status = this.courtAvailability.get(court.id)
		if (!status || !status.available) return

		// Dispatch event to parent
		this.dispatchEvent(
			new CustomEvent('court-select', {
				detail: { court },
				bubbles: true,
				composed: true,
			}),
		)
	}

	/**
	 * Retry initialization after an error
	 */
	private _retryInitialization(): void {
		this.loading = true
		this.error = null

		// Destroy existing map if any
		if (this.map) {
			this.map.remove()
			this.map = null
		}

		// Attempt to reinitialize
		this._loadLeafletScript()
			.then(() => {
				this.leafletLoaded = true
				this._initializeMap()
			})
			.catch(error => {
				console.error('Error in retry initialization:', error)
				this.error = 'Failed to load map. Please check your connection and try again.'
				this.loading = false
			})
	}

	/**
	 * Render the component
	 */
	render() {
		return html`
			<div class="map-container ${this.loading ? 'initializing' : ''}">
				${when(
					this.loading,
					() => html`
						<div class="map-loading-overlay">
							<div class="flex justify-center items-center h-full">
								<schmancy-spinner size="48px"></schmancy-spinner>
							</div>
						</div>
					`,
					() => html`
						${when(
							this.error,
							() => html`
								<div class="map-error-overlay">
									<div class="text-center">
										<schmancy-icon size="48px" class="text-error-default">error_outline</schmancy-icon>
										<p class="mt-2">${this.error}</p>
										<button @click=${() => this._retryInitialization()} class="retry-button">Retry</button>
									</div>
								</div>
							`,
							() => html`
								<!-- Map will be mounted here -->
								<div class="map-legend">
									<div class="legend-item">
										<span class="legend-dot dot-available"></span>
										<span>Available</span>
									</div>
									<div class="legend-item">
										<span class="legend-dot dot-limited"></span>
										<span>Limited</span>
									</div>
									<div class="legend-item">
										<span class="legend-dot dot-unavailable"></span>
										<span>Unavailable</span>
									</div>
								</div>
							`,
						)}
					`,
				)}
			</div>
		`
	}
}

// Add the element to the global namespace for TypeScript
declare global {
	interface HTMLElementTagNameMap {
		'court-map-view': CourtMapView
	}
}
