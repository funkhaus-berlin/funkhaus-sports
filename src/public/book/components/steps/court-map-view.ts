import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html, PropertyValues } from 'lit'
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

// Define Leaflet types with corrected definitions
interface LeafletLatLng {
	lat: number
	lng: number
}

interface LeafletMapOptions {
	zoomControl?: boolean
	attributionControl?: boolean
	[key: string]: any
}

interface LeafletTileLayerOptions {
	maxZoom?: number
	attribution?: string
	[key: string]: any
}

interface LeafletMarkerOptions {
	icon?: any
	[key: string]: any
}

interface LeafletIconOptions {
	className?: string
	html?: string
	iconSize?: [number, number]
	iconAnchor?: [number, number]
	[key: string]: any
}

interface LeafletPopupOptions {
	closeButton?: boolean
	className?: string
	[key: string]: any
}

interface LeafletControlOptions {
	position?: string
	[key: string]: any
}

interface LeafletMap {
	setView: (center: [number, number], zoom: number) => LeafletMap
	remove: () => void
	fitBounds: (bounds: any, options?: any) => LeafletMap
	closePopup: () => LeafletMap
	getZoom: () => number
	invalidateSize: (animate?: boolean) => LeafletMap // Fixed: Added missing method
	on: (event: string, callback: Function) => LeafletMap // Added event handler
	off: (event: string, callback?: Function) => LeafletMap // Added event handler removal
}

interface LeafletMarker {
	getLatLng: () => LeafletLatLng
	remove: () => void
	bindPopup: (popup: any) => LeafletMarker
	openPopup: () => LeafletMarker
	on: (event: string, handler: Function) => LeafletMarker
	off: (event: string, handler?: Function) => LeafletMarker
	addTo: (map: LeafletMap) => LeafletMarker // Fixed: Added missing method
}

interface LeafletControl {
	addAttribution: (attribution: string) => LeafletControl
	addTo: (map: LeafletMap) => LeafletControl
}

interface LeafletLayer {
	addTo: (map: LeafletMap) => LeafletLayer
}

interface LeafletLatLngBounds {
	extend: (latlng: [number, number]) => LeafletLatLngBounds
	isValid: () => boolean // Added to check validity
}

interface LeafletStatic {
	map: (container: HTMLElement | string, options?: LeafletMapOptions) => LeafletMap
	tileLayer: (url: string, options?: LeafletTileLayerOptions) => LeafletLayer
	marker: (latlng: [number, number], options?: LeafletMarkerOptions) => LeafletMarker
	divIcon: (options: LeafletIconOptions) => any
	popup: (options?: LeafletPopupOptions) => any
	latLngBounds: (bounds?: any[]) => LeafletLatLngBounds
	control: {
		attribution: (options?: LeafletControlOptions) => LeafletControl
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

	/* Rest of styles preserved... */
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
	private _map: LeafletMap | null = null
	private _markers: Record<string, LeafletMarker> = {}
	private _L: LeafletStatic | null = null
	private _initialized: boolean = false
	private _loadPromise: Promise<LeafletStatic> | null = null
	private _initAttempts: number = 0
	private _maxInitAttempts: number = 3
	private _resizeObserver: ResizeObserver | null = null
	private _mapResizeHandlerBound: (() => void) | null = null
	private _initTimeoutId: number | null = null
	private _leafletLoaded: boolean = false
	private _popupEventHandlers: Map<string, Function> = new Map()

	/**
	 * When component is first connected to DOM
	 */
	connectedCallback(): void {
		super.connectedCallback()
		// Start preloading Leaflet as soon as possible
		this._preloadLeaflet()
	}

	/**
	 * Pre-load Leaflet library to improve initial render time
	 */
	private _preloadLeaflet(): void {
		if (!this._loadPromise && !this._leafletLoaded) {
			// Start loading but don't await - just kick off the process
			this._loadPromise = this._loadLeaflet()
			this._loadPromise
				.then(() => {
					this._leafletLoaded = true
				})
				.catch(error => {
					console.error('Error preloading Leaflet:', error)
				})
				.finally(() => {
					this._loadPromise = null
				})
		}
	}

	private _fixMapRendering(): void {
		if (!this._map || !this.mapContainer) return

		try {
			// Force the map to take up the entire container
			const mapElement = this.mapContainer.querySelector('.leaflet-container')
			if (mapElement) {
				// Force correct dimensions
				;(mapElement as HTMLElement).style.width = '100%'
				;(mapElement as HTMLElement).style.height = '100%'
				;(mapElement as HTMLElement).style.position = 'absolute'
				;(mapElement as HTMLElement).style.top = '0'
				;(mapElement as HTMLElement).style.left = '0'
			}

			// Force a redraw of the map
			this._map.invalidateSize(true)

			// Reset bounds to ensure map centers correctly
			if (this.courts.length > 0) {
				const bounds = this._createBoundsFromCourts()
				if (bounds && bounds.isValid()) {
					this._map.fitBounds(bounds, { padding: [35, 35] })
				}
			}
		} catch (e) {
			console.error('Error fixing map rendering:', e)
		}
	}

	/**
	 * Create proper bounds from court coordinates
	 */
	private _createBoundsFromCourts(): any {
		if (!this._L) return null

		try {
			const bounds = this._L.latLngBounds()
			this.courts.forEach((court, index) => {
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
	 * After first render, initialize the map
	 */
	async firstUpdated(changedProperties: PropertyValues): Promise<void> {
		this.loading = true
		this.error = null

		// Add initializing class to ensure container has dimensions
		if (this.mapContainer) {
			this.mapContainer.classList.add('initializing')
		}

		try {
			// Load Leaflet if not already loaded
			this._L = await this._getLeaflet()

			// Initialize map with a delay to ensure container is ready
			this._scheduleInitialization()
		} catch (error) {
			console.error('Error initializing map:', error)
			this.error = 'Failed to load map library. Please try again.'
			this.loading = false
		}
	}

	/**
	 * Schedule map initialization with multiple attempts if needed
	 */
	private _scheduleInitialization(delay: number = 100): void {
		// Clear any existing timeout
		if (this._initTimeoutId !== null) {
			window.clearTimeout(this._initTimeoutId)
		}

		this._initTimeoutId = window.setTimeout(() => {
			this._initTimeoutId = null
			this._attemptInitializeMap()
		}, delay)
	}

	/**
	 * Attempt to initialize the map with retry logic
	 */
	private _attemptInitializeMap(): void {
		// Increment attempt counter
		this._initAttempts++

		// Check if container is ready
		if (!this.mapContainer || !this._L) {
			if (this._initAttempts < this._maxInitAttempts) {
				// Try again with increasing delay
				const delay = Math.min(100 * Math.pow(2, this._initAttempts), 1000)
				this._scheduleInitialization(delay)
			} else {
				this.error = 'Map container not found or Leaflet not loaded'
				this.loading = false
			}
			return
		}

		// Check container dimensions
		const hasValidDimensions = this.mapContainer.offsetWidth > 0 && this.mapContainer.offsetHeight > 0

		if (!hasValidDimensions) {
			if (this._initAttempts < this._maxInitAttempts) {
				// Try again with increasing delay
				const delay = Math.min(100 * Math.pow(2, this._initAttempts), 1000)
				this._scheduleInitialization(delay)
			} else {
				// Force dimensions as last resort
				this.mapContainer.style.width = '100%'
				this.mapContainer.style.height = '400px'
				this._initializeMap()
			}
			return
		}

		// Container looks good, try to initialize
		if (this._initializeMap()) {
			// Success - remove initializing class
			this.mapContainer.classList.remove('initializing')

			// Setup resize handling
			this._setupResizeHandling()

			// Update court markers
			this._updateCourts()

			// Complete loading
			this.loading = false
		} else if (this._initAttempts < this._maxInitAttempts) {
			// Try again with increasing delay
			const delay = Math.min(100 * Math.pow(2, this._initAttempts), 1000)
			this._scheduleInitialization(delay)
		} else {
			// Give up after max attempts
			this.error = 'Failed to initialize map after multiple attempts'
			this.loading = false
		}
	}

	/**
	 * Setup resize handling for the map
	 */
	private _setupResizeHandling(): void {
		// Cleanup any existing handlers
		this._cleanupResizeHandling()

		if (!this._map) return

		// Setup a handler function
		this._mapResizeHandlerBound = () => {
			if (this._map) {
				try {
					this._map.invalidateSize(true)
				} catch (e) {
					console.warn('Error invalidating map size:', e)
				}
			}
		}

		// Setup ResizeObserver for modern browsers
		try {
			this._resizeObserver = new ResizeObserver(entries => {
				if (this._mapResizeHandlerBound) {
					this._mapResizeHandlerBound()
				}
			})
			this._resizeObserver.observe(this.mapContainer)
		} catch (e) {
			console.warn('ResizeObserver not supported, falling back to window resize:', e)
			// Fallback to window resize events
			window.addEventListener('resize', this._mapResizeHandlerBound)
		}

		// Also listen for Leaflet's own events
		if (this._map) {
			this._map.on('resize', this._mapResizeHandlerBound)
		}
	}

	/**
	 * Cleanup resize handlers
	 */
	private _cleanupResizeHandling(): void {
		// Remove ResizeObserver
		if (this._resizeObserver) {
			this._resizeObserver.disconnect()
			this._resizeObserver = null
		}

		// Remove window event listener
		if (this._mapResizeHandlerBound) {
			window.removeEventListener('resize', this._mapResizeHandlerBound)

			// Remove Leaflet event listener
			if (this._map) {
				this._map.off('resize', this._mapResizeHandlerBound)
			}

			this._mapResizeHandlerBound = null
		}
	}

	/**
	 * Update when relevant properties change
	 */
	updated(changedProperties: Map<string, unknown>): void {
		super.updated(changedProperties)

		// If the map exists but isn't fully initialized, try to complete initialization
		if (this._map && this._initialized) {
			// Wait for rendering to complete
			requestAnimationFrame(() => {
				this._fixMapRendering()
			})
		}

		// Force map to recalculate dimensions on any update
		if (this._map && this._initialized) {
			// Use requestAnimationFrame to ensure DOM is fully updated
			requestAnimationFrame(() => {
				if (this._map) {
					try {
						this._map.invalidateSize(true)
					} catch (e) {
						console.warn('Error invalidating map size:', e)
					}
				}
			})
		}

		// Update map when properties change and map is initialized
		if (
			this._map &&
			this._initialized &&
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

		// Clear any pending initialization timeout
		if (this._initTimeoutId !== null) {
			window.clearTimeout(this._initTimeoutId)
			this._initTimeoutId = null
		}

		// Clean up resize handling
		this._cleanupResizeHandling()

		// Clean up map to prevent memory leaks
		this._destroyMap()
	}

	/**
	 * Get Leaflet library (with caching)
	 */
	private async _getLeaflet(): Promise<LeafletStatic> {
		if (this._L) {
			return this._L
		}

		// Reuse existing promise if loading is in progress
		if (this._loadPromise) {
			return this._loadPromise
		}

		this._loadPromise = this._loadLeaflet()

		try {
			const result = await this._loadPromise
			return result
		} finally {
			this._loadPromise = null
		}
	}

	/**
	 * Load Leaflet library dynamically
	 */
	private async _loadLeaflet(): Promise<LeafletStatic> {
		// Add Leaflet CSS if not already added
		if (!document.querySelector('link[href*="leaflet.css"]')) {
			return new Promise<LeafletStatic>((resolve, reject) => {
				// Create and add the CSS link
				const link = document.createElement('link')
				link.rel = 'stylesheet'
				link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
				link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
				link.crossOrigin = ''

				// Handle CSS loading errors
				link.onerror = () => {
					reject(new Error('Failed to load Leaflet CSS'))
				}

				// Wait for CSS to load before loading JS
				link.onload = () => {
					// Check if Leaflet is already loaded
					if ((window as any).L) {
						resolve((window as any).L)
						return
					}

					// Load Leaflet JS
					const script = document.createElement('script')
					script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
					script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
					script.crossOrigin = ''
					script.onload = () => resolve((window as any).L)
					script.onerror = () => reject(new Error('Failed to load Leaflet JS'))
					document.body.appendChild(script)
				}

				document.head.appendChild(link)
			})
		} else {
			// CSS already loaded, just check for JS
			// Check if Leaflet is already loaded
			if ((window as any).L) {
				return (window as any).L
			}

			// Load Leaflet JS
			return new Promise<LeafletStatic>((resolve, reject) => {
				const script = document.createElement('script')
				script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
				script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
				script.crossOrigin = ''
				script.onload = () => resolve((window as any).L)
				script.onerror = () => reject(new Error('Failed to load Leaflet JS'))
				document.body.appendChild(script)
			})
		}
	}

	/**
	 * Initialize Leaflet map
	 * @returns boolean indicating whether initialization was successful
	 */
	private _initializeMap(): boolean {
		if (!this.mapContainer || !this._L) {
			console.error('Map container not found or Leaflet not loaded')
			return false
		}

		try {
			// Ensure container has explicit dimensions before initialization
			this.mapContainer.style.width = '100%'
			this.mapContainer.style.height = '400px'

			// Ensure any previous map is fully removed
			if (this._map) {
				this._destroyMap()
			}

			// Create map instance with improved settings
			this._map = this._L
				.map(this.mapContainer, {
					zoomControl: true,
					attributionControl: false,
					// Eliminate any animations that could cause layout issues
					fadeAnimation: false,
					markerZoomAnimation: false,
					zoomAnimation: false,
					// Use canvas renderer for better performance
					preferCanvas: true,
					// Prevent touch behaviors that might interfere with page scrolling
					tap: false,
				})
				.setView([51.505, -0.09], 15)

			// Add tile layer with error handling
			try {
				this._L
					.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
						maxZoom: 19,
						attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
					})
					.addTo(this._map)
			} catch (e) {
				console.error('Error adding tile layer:', e)
				// Try alternate tile source if main one fails
				try {
					this._L
						.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
							maxZoom: 19,
							attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
						})
						.addTo(this._map)
				} catch (e2) {
					console.error('Error adding alternate tile layer:', e2)
				}
			}

			// Add attribution in a cleaner way
			this._L.control
				.attribution({
					position: 'bottomleft',
				})
				.addAttribution('Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors')
				.addTo(this._map)

			// Apply immediate layout fixes
			this._fixMapRendering()

			// Apply additional fixes after small delay
			setTimeout(() => this._fixMapRendering(), 100)

			// And once more after a longer delay to catch any late layout shifts
			setTimeout(() => this._fixMapRendering(), 500)

			this._initialized = true
			return true
		} catch (error) {
			console.error('Error initializing map:', error)
			this.error = 'Failed to initialize map'
			return false
		}
	}
	/**
	 * Clean up map resources
	 */
	private _destroyMap(): void {
		// Clear popup event handlers
		this._clearAllPopupEventHandlers()

		// Clear markers
		for (const key in this._markers) {
			if (Object.prototype.hasOwnProperty.call(this._markers, key)) {
				try {
					this._markers[key].remove()
				} catch (e) {
					console.warn('Error removing marker:', e)
				}
			}
		}
		this._markers = {}

		// Remove map
		if (this._map) {
			try {
				this._map.remove()
			} catch (e) {
				console.warn('Error removing map:', e)
			}
			this._map = null
		}

		this._initialized = false
		this._initAttempts = 0
	}

	/**
	 * Clear all popup event handlers to prevent memory leaks
	 */
	private _clearAllPopupEventHandlers(): void {
		this._popupEventHandlers.forEach((handler, id) => {
			const element = document.getElementById(id)
			if (element) {
				element.removeEventListener('click', handler as EventListener)
			}
		})
		this._popupEventHandlers.clear()
	}

	/**
	 * Update court markers on the map
	 */
	private _updateCourts(): void {
		if (!this._map || !this._L || !this._initialized) {
			console.warn('Cannot update courts: map not initialized')
			return
		}

		try {
			// Clean up previous event handlers to prevent memory leaks
			this._clearAllPopupEventHandlers()

			// Clear existing markers
			Object.values(this._markers).forEach(marker => {
				try {
					marker.remove()
				} catch (e) {
					console.warn('Error removing marker:', e)
				}
			})
			this._markers = {}

			// Create bounds for map fitting
			const bounds = this._L.latLngBounds()
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

					if (!this._L || !this._map) {
						throw new Error('Leaflet or map not initialized')
					}

					const icon = this._L.divIcon({
						className: 'court-marker',
						html: iconHtml,
						iconSize: [iconSize, iconSize],
						iconAnchor: [iconSize / 2, iconSize / 2],
					})

					// Create marker
					const marker = this._L.marker([lat, lng], { icon })

					// Add to map safely
					marker.addTo(this._map)

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
					const popup = this._L
						.popup({
							closeButton: true,
							className: 'court-popup',
						})
						.setContent(popupContent)

					// Bind popup to marker
					marker.bindPopup(popup)

					// Create handler function for the button
					const handleCourtSelect = () => {
						this._handleCourtSelect(court)
						if (this._map) {
							this._map.closePopup()
						}
					}

					// Add popup open event to safely add event listener to button
					marker.on('popupopen', () => {
						// Add click handler to select button
						const selectButton = document.getElementById(buttonId)
						if (selectButton) {
							// Store the handler to remove it later
							this._popupEventHandlers.set(buttonId, handleCourtSelect)
							selectButton.addEventListener('click', handleCourtSelect as EventListener)
						}
					})

					// Store marker and extend bounds
					this._markers[court.id] = marker
					bounds.extend([lat, lng])
					hasValidCourts = true
				} catch (e) {
					console.error(`Error creating marker for court ${court.id}:`, e)
				}
			})

			// Fit map to show all markers
			if (hasValidCourts && this._map && bounds.isValid && bounds.isValid()) {
				try {
					this._map.fitBounds(bounds, { padding: [35, 35] })
				} catch (e) {
					console.warn('Error fitting bounds:', e)
					// Fallback to default view
					this._map.setView([51.505, -0.09], 15)
				}
			}

			// Open popup for selected court
			if (this.selectedCourtId && this._markers[this.selectedCourtId] && this._map) {
				try {
					// First make sure the map is at the right location
					const marker = this._markers[this.selectedCourtId]
					const latLng = marker.getLatLng()

					// Center map on selected court
					this._map.setView([latLng.lat, latLng.lng], this._map.getZoom())

					// Open the popup after a short delay to ensure the map is ready
					setTimeout(() => {
						if (this._markers[this.selectedCourtId]) {
							this._markers[this.selectedCourtId].openPopup()
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
		this._initAttempts = 0

		// Destroy existing map if any
		this._destroyMap()

		// Attempt to reinitialize
		this._getLeaflet()
			.then(leaflet => {
				this._L = leaflet
				this._scheduleInitialization(100)
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
