import { css, html, LitElement } from 'lit'
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
 * A simplified map-based view of tennis courts using Leaflet.js
 */
@customElement('court-map-view')
export class CourtMapView extends LitElement {
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

	static styles = css`
		:host {
			display: block;
			width: 100%;
		}

		.map-container {
			width: 100%;
			height: 400px;
			border-radius: 8px;
			position: relative;
			overflow: hidden;
		}

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

		.retry-button {
			margin-top: 12px;
			padding: 8px 16px;
			background-color: #3b82f6;
			color: white;
			border: none;
			border-radius: 4px;
			cursor: pointer;
		}

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

		.loading-spinner {
			border: 4px solid rgba(0, 0, 0, 0.1);
			width: 36px;
			height: 36px;
			border-radius: 50%;
			border-left-color: #3b82f6;
			animation: spin 1s linear infinite;
		}

		@keyframes spin {
			0% {
				transform: rotate(0deg);
			}
			100% {
				transform: rotate(360deg);
			}
		}
	`

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
				resolve()
				return
			}

			// Load CSS if not already present
			if (!document.querySelector('link[href*="leaflet.css"]')) {
				const link = document.createElement('link')
				link.rel = 'stylesheet'
				link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
				link.crossOrigin = 'anonymous'
				this.shadowRoot?.append(link)
			}

			// Load Leaflet JS
			const leafletScript = document.createElement('script')
			leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
			leafletScript.crossOrigin = 'anonymous'

			leafletScript.onload = () => {
				resolve()
			}

			leafletScript.onerror = () => {
				reject(new Error('Failed to load Leaflet script'))
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
				.catch(() => {
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
	 * Initialize the map with simplified options
	 */
	private _initializeMap(): void {
		requestAnimationFrame(() => {
			if (!this.mapContainer || !window.L) {
				this.error = 'Could not initialize map'
				this.loading = false
				return
			}

			// If a map already exists, remove it first
			if (this.map) {
				this.map.remove()
				this.map = null
			}

			try {
				const L = window.L

				// Create a simple map instance
				this.map = L.map(this.mapContainer, {
					center: [51.505, -0.09], // Default center (will be adjusted based on courts)
					zoom: 13,
					zoomControl: true,
				})

				// Add a basic tile layer
				L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
					maxZoom: 25,
					attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
				}).addTo(this.map)

				// Create court markers
				this._updateCourts()

				// Force a redraw to ensure proper display
				setTimeout(() => {
					if (this.map) {
						this.map.invalidateSize(true)
					}
				}, 300)

				this.loading = false
			} catch (error) {
				this.error = 'Failed to initialize map'
				this.loading = false
			}
		})
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
			return
		}

		try {
			// Clean up previous event handlers
			this._clearAllPopupEventHandlers()

			// Clear existing markers
			Object.values(this.markers).forEach(marker => {
				marker.remove()
			})
			this.markers = {}

			// Create bounds for map fitting
			const bounds = window.L.latLngBounds()
			let hasValidCourts = false

			// Create court markers
			this.courts.forEach((court, index) => {
				// Create simulated location for the court
				// In a real implementation, courts would have actual coordinates
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

				// Create simple marker icon
				const isSelected = this.selectedCourtId === court.id
				const iconSize = isSelected ? 34 : 28

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
					">
						${index + 1}
					</div>
				`

				const L = window.L
				const icon = L.divIcon({
					html: iconHtml,
					iconSize: [iconSize, iconSize],
					iconAnchor: [iconSize / 2, iconSize / 2],
					className: '',
				})

				// Create marker
				const marker = L.marker([lat, lng], { icon })
				marker.addTo(this.map)

				// Get court details for popup
				const sportTypes =
					court.sportTypes && court.sportTypes.length > 0 ? court.sportTypes.join(', ') : 'Standard court'

				const isAvailable = availabilityStatus !== 'none'
				const buttonId = `select-court-${court.id}-${Date.now()}`

				// Create simple popup content
				const popupContent = `
					<div style="text-align: center; padding: 5px;">
						<h3 style="margin: 0; font-size: 16px; font-weight: bold;">${court.name}</h3>
						<p style="margin: 5px 0; font-size: 12px;">${sportTypes}</p>
						${
							isAvailable
								? `<button id="${buttonId}" style="background-color: ${
										isSelected ? '#9333ea' : '#3b82f6'
								  }; color: white; border: none; border-radius: 4px; padding: 6px 12px; margin-top: 5px; font-size: 13px; cursor: pointer;">
									${isSelected ? 'Selected' : 'Select Court'}
								</button>`
								: `<div style="background-color: #f3f4f6; color: #6b7280; border-radius: 4px; padding: 6px 12px; margin-top: 5px; font-size: 13px;">
									Unavailable
								</div>`
						}
					</div>
				`

				// Create popup
				const popup = L.popup().setContent(popupContent)
				marker.bindPopup(popup)

				// Create handler function for the button
				const handleCourtSelect = () => {
					this._handleCourtSelect(court)
					this.map.closePopup()
				}

				// Add popup open event to safely add event listener to button
				marker.on('popupopen', () => {
					const selectButton = document.getElementById(buttonId)
					if (selectButton) {
						this.popupEventHandlers.set(buttonId, handleCourtSelect)
						selectButton.addEventListener('click', handleCourtSelect as EventListener)
					}
				})

				// Store marker and extend bounds
				this.markers[court.id] = marker
				bounds.extend([lat, lng])
				hasValidCourts = true
			})

			// Fit map to show all markers
			if (hasValidCourts && this.map) {
				this.map.fitBounds(bounds, { padding: [30, 30] })
			}

			// Open popup for selected court
			if (this.selectedCourtId && this.markers[this.selectedCourtId]) {
				setTimeout(() => {
					if (this.markers[this.selectedCourtId]) {
						this.markers[this.selectedCourtId].openPopup()
					}
				}, 300)
			}
		} catch (error) {
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

		if (this.map) {
			this.map.remove()
			this.map = null
		}

		this._loadLeafletScript()
			.then(() => {
				this.leafletLoaded = true
				this._initializeMap()
			})
			.catch(() => {
				this.error = 'Failed to load map. Please check your connection and try again.'
				this.loading = false
			})
	}

	/**
	 * Render the component
	 */
	render() {
		return html`
			<div class="map-container">
				${when(
					this.loading,
					() => html`
						<div class="map-loading-overlay">
							<div class="loading-spinner"></div>
						</div>
					`,
					() => html`
						${when(
							this.error,
							() => html`
								<div class="map-error-overlay">
									<div style="text-align: center;">
										<div>⚠️</div>
										<p>${this.error}</p>
										<button @click=${() => this._retryInitialization()} class="retry-button">Retry</button>
									</div>
								</div>
							`,
							() => html`
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
