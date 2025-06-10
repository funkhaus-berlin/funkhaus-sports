import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { BehaviorSubject, EMPTY, from, fromEvent, Observable, of } from 'rxjs'
import { catchError, debounceTime, distinctUntilChanged, filter, finalize, map, switchMap, take, takeUntil, tap } from 'rxjs/operators'
import { VenueAddress } from 'src/types/booking/venue.types'

/**
 * Interactive Google Maps component with location selection capability
 * Extends the base venue-map component to support interactive location picking
 * 
 * Features:
 * - Click on map to select location
 * - Reverse geocoding to get address from coordinates
 * - Visual marker for selected location
 * - Emits location-selected events with coordinates and address
 */
@customElement('venue-map-interactive')
export class VenueMapInteractive extends $LitElement(css`
	:host {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 300px;
		position: relative;
		overflow: hidden;
		border-radius: 12px;
	}
`) {
	@property({ type: Object }) address?: VenueAddress
	@property({ type: String }) venueName = ''
	@property({ type: String }) apiKey?: string
	@property({ type: Number }) zoom = 15
	@property({ type: Boolean }) showMarker = true
	@property({ type: Boolean }) interactive = true
	@property({ type: String }) mapType: 'roadmap' | 'satellite' | 'hybrid' | 'terrain' = 'satellite'
	
	// Map control properties - all false by default except zoom
	@property({ type: Boolean }) showZoomControl = true
	@property({ type: Boolean }) showMapTypeControl = false
	@property({ type: Boolean }) showStreetViewControl = false
	@property({ type: Boolean }) showFullscreenControl = false
	@property({ type: Boolean }) showRotateControl = false
	@property({ type: Boolean }) showScaleControl = false
	
	// Interactive selection mode
	@property({ type: Boolean }) selectionMode = false
	@property({ type: Object }) selectedLocation?: { lat: number; lng: number }

	@state() private mapLoaded = false
	@state() private loading = true
	@state() private error: string | null = null

	@query('#map-container') mapContainer!: HTMLDivElement

	private map: any
	private marker: any
	private selectionMarker: any
	
	// RxJS subjects for reactive state management
	private mapLoaded$ = new BehaviorSubject<boolean>(false)
	private address$ = new BehaviorSubject<VenueAddress | undefined>(undefined)
	private selectedLocation$ = new BehaviorSubject<{ lat: number; lng: number } | undefined>(undefined)

	connectedCallback() {
		super.connectedCallback()
		
		// Initialize Google Maps loading and map creation pipeline
		// Always initialize the map, even without an address
		of(true).pipe(
			tap(() => this.loading = true),
			tap(() => this.address$.next(this.address)),
			switchMap(() => this.loadGoogleMapsScript()),
			tap(() => this.mapLoaded$.next(true)),
			switchMap(() => this.waitForMapContainer()),
			switchMap(() => this.initializeMap()),
			catchError(err => {
				console.error('Map initialization error:', err)
				this.error = err.message || 'Failed to load map'
				return EMPTY
			}),
			finalize(() => this.loading = false),
			takeUntil(this.disconnecting)
		).subscribe()

		// React to address changes
		this.address$.pipe(
			distinctUntilChanged(),
			filter(() => this.mapLoaded),
			debounceTime(300),
			switchMap(() => this.updateMapLocation()),
			takeUntil(this.disconnecting)
		).subscribe()
		
		// Handle selected location changes
		this.selectedLocation$.pipe(
			distinctUntilChanged(),
			filter(location => !!location && this.mapLoaded),
			tap(location => {
				if (location) {
					this.updateSelectionMarker(location)
				}
			}),
			takeUntil(this.disconnecting)
		).subscribe()
	}
	
	updated(changedProperties: Map<string | number | symbol, unknown>) {
		super.updated(changedProperties)
		
		// Handle address prop changes
		if (changedProperties.has('address')) {
			this.address$.next(this.address)
		}
		
		// Handle selectedLocation prop changes
		if (changedProperties.has('selectedLocation')) {
			this.selectedLocation$.next(this.selectedLocation)
		}
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		// Clean up map resources
		if (this.marker) {
			this.marker.setMap(null)
			this.marker = null
		}
		if (this.selectionMarker) {
			this.selectionMarker.setMap(null)
			this.selectionMarker = null
		}
		if (this.map) {
			this.map = null
		}
	}

	/**
	 * Load Google Maps script using RxJS
	 */
	private loadGoogleMapsScript() {
		// Check if already loaded
		if (window.google?.maps) {
			this.mapLoaded = true
			return of(true)
		}

		// Check if script is already being loaded
		const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
		if (existingScript) {
			return fromEvent(existingScript, 'load').pipe(
				take(1),
				tap(() => this.mapLoaded = true),
				map(() => true)
			)
		}

		// Get API key
		const apiKey = this.apiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY
		if (!apiKey) {
			console.warn('Google Maps API key not configured. Add VITE_GOOGLE_MAPS_API_KEY to your .env file')
			// Don't return EMPTY here, throw error to be caught in the pipeline
			throw new Error('Google Maps API key not configured. Please add VITE_GOOGLE_MAPS_API_KEY to your .env file')
		}

		// Create and load script
		return of(null).pipe(
			map(() => {
				const script = document.createElement('script')
				script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap`
				script.async = true
				script.defer = true
				return script
			}),
			switchMap(script => {
				// Set up global callback
				const loadPromise = new Promise<boolean>((resolve, reject) => {
					window.initMap = () => {
						this.mapLoaded = true
						resolve(true)
					}
					script.onerror = () => reject(new Error('Failed to load Google Maps'))
				})
				
				document.head.appendChild(script)
				return from(loadPromise)
			})
		)
	}

	/**
	 * Wait for map container to be available in DOM
	 */
	private waitForMapContainer() {
		return from(this.updateComplete).pipe(
			switchMap(() => {
				if (this.mapContainer) {
					return of(this.mapContainer)
				}
				// Retry after a short delay if container not ready
				return of(null).pipe(
					debounceTime(100),
					switchMap(() => from(this.updateComplete)),
					map(() => this.mapContainer),
					filter(container => !!container)
				)
			})
		)
	}

	/**
	 * Initialize the map with coordinates or address
	 */
	private initializeMap() {
		if (!window.google?.maps) {
			throw new Error('Google Maps not loaded')
		}

		return of(this.address).pipe(
			switchMap(address => {
				if (address?.coordinates) {
					return of({ lat: address.coordinates.lat, lng: address.coordinates.lng })
				} else if (address && address.street && address.city) {
					// Only try geocoding if we have enough address info
					return this.geocodeAddress(address)
				} else {
					// Default location - center of Europe (for better general coverage)
					return of({ lat: 50.1109, lng: 8.6821 }) // Frankfurt, Germany
				}
			}),
			tap(coords => {
				if (coords) {
					this.createMap(coords.lat, coords.lng)
				} else {
					// Geocoding failed, show address fallback
					this.mapLoaded = false
					this.loading = false
				}
			})
		)
	}

	/**
	 * Update map location when address changes
	 */
	private updateMapLocation() {
		if (!this.map) return EMPTY
		
		// If no address, don't update location
		if (!this.address) return EMPTY

		return of(this.address).pipe(
			switchMap(address => {
				if (address.coordinates) {
					return of({ lat: address.coordinates.lat, lng: address.coordinates.lng })
				} else if (address.street && address.city) {
					// Only geocode if we have at least street and city
					return this.geocodeAddress(address)
				} else {
					// Not enough info to geocode
					return EMPTY
				}
			}),
			tap(coords => {
				if (coords && window.google?.maps) {
					const center = new (window as any).google.maps.LatLng(coords.lat, coords.lng)
					this.map.setCenter(center)
					
					if (this.marker) {
						this.marker.setPosition(center)
					}
				}
			})
		)
	}

	/**
	 * Create the map with given coordinates
	 */
	private createMap(lat: number, lng: number) {
		if (!this.mapContainer || !window.google) return

		const center = new (window as any).google.maps.LatLng(lat, lng)
		
		// Map options
		const mapOptions = {
			center,
			zoom: this.zoom,
			mapTypeId: this.mapType,
			disableDefaultUI: true, // Disable all default UI first
			zoomControl: this.interactive && this.showZoomControl,
			mapTypeControl: this.interactive && this.showMapTypeControl,
			mapTypeControlOptions: {
				mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain'],
				style: (window as any).google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
				position: (window as any).google.maps.ControlPosition.TOP_RIGHT
			},
			streetViewControl: this.interactive && this.showStreetViewControl,
			fullscreenControl: this.interactive && this.showFullscreenControl,
			rotateControl: this.interactive && this.showRotateControl,
			scaleControl: this.interactive && this.showScaleControl,
			scrollwheel: this.interactive,
			draggable: this.interactive,
			styles: this.mapType === 'roadmap' ? [
				{
					featureType: 'poi',
					elementType: 'labels',
					stylers: [{ visibility: 'off' }]
				}
			] : []
		}

		// Create map
		this.map = new (window as any).google.maps.Map(this.mapContainer, mapOptions)

		// Add marker if requested
		if (this.showMarker) {
			this.marker = new (window as any).google.maps.Marker({
				position: center,
				map: this.map,
				title: this.venueName,
				animation: (window as any).google.maps.Animation.DROP
			})
		}
		
		// Set up click handler for selection mode
		if (this.selectionMode) {
			this.map.addListener('click', (e: any) => {
				const location = {
					lat: e.latLng.lat(),
					lng: e.latLng.lng()
				}
				this.selectedLocation = location
				this.selectedLocation$.next(location)
				
				// Dispatch event for parent component
				this.dispatchEvent(new CustomEvent('location-selected', {
					detail: { location, address: null },
					bubbles: true,
					composed: true
				}))
				
				// Reverse geocode to get address
				this.reverseGeocode(location).subscribe(address => {
					if (address) {
						this.dispatchEvent(new CustomEvent('location-selected', {
							detail: { location, address },
							bubbles: true,
							composed: true
						}))
					}
				})
			})
		}
	}

	/**
	 * Geocode address to get coordinates using RxJS
	 * Returns null if geocoding fails
	 */
	private geocodeAddress(address: VenueAddress): Observable<{ lat: number; lng: number } | null> {
		if (!window.google?.maps) {
			throw new Error('Google Maps not loaded')
		}

		const { street, city, postalCode, country } = address
		
		// Build address string from available components
		const addressParts = []
		if (street) addressParts.push(street)
		if (city) addressParts.push(city)
		if (postalCode) addressParts.push(postalCode)
		if (country) addressParts.push(country)
		
		if (addressParts.length === 0) {
			return of(null)
		}
		
		const fullAddress = addressParts.join(', ')

		return of(new (window as any).google.maps.Geocoder()).pipe(
			switchMap(geocoder => 
				from(new Promise<any>((resolve, reject) => {
					geocoder.geocode({ address: fullAddress }, (results: any, status: any) => {
						if (status === 'OK' && results?.[0]) {
							resolve(results[0])
						} else {
							reject(new Error(`Geocoding failed: ${status}`))
						}
					})
				}))
			),
			map(result => ({
				lat: result.geometry.location.lat(),
				lng: result.geometry.location.lng()
			})),
			catchError(err => {
				console.error('Geocoding error:', err)
				// Instead of throwing, return null to indicate geocoding failed
				return of(null)
			})
		)
	}
	
	/**
	 * Update selection marker position
	 */
	private updateSelectionMarker(location: { lat: number; lng: number }) {
		if (!this.map || !window.google?.maps) return
		
		const position = new (window as any).google.maps.LatLng(location.lat, location.lng)
		
		if (!this.selectionMarker) {
			// Create selection marker with different color
			this.selectionMarker = new (window as any).google.maps.Marker({
				position,
				map: this.map,
				title: 'Selected Location',
				icon: {
					path: (window as any).google.maps.SymbolPath.CIRCLE,
					scale: 10,
					fillColor: '#ff4444',
					fillOpacity: 0.8,
					strokeColor: '#ffffff',
					strokeWeight: 2
				},
				animation: (window as any).google.maps.Animation.DROP
			})
		} else {
			this.selectionMarker.setPosition(position)
		}
		
		// Center map on selection
		this.map.panTo(position)
	}
	
	/**
	 * Reverse geocode coordinates to get address
	 */
	private reverseGeocode(location: { lat: number; lng: number }): Observable<VenueAddress | null> {
		if (!window.google?.maps) {
			return of(null)
		}
		
		return of(new (window as any).google.maps.Geocoder()).pipe(
			switchMap(geocoder => 
				from(new Promise<any>((resolve, reject) => {
					const latLng = new (window.google as any).maps.LatLng(location.lat, location.lng)
					geocoder.geocode({ location: latLng }, (results: any, status: any) => {
						if (status === 'OK' && results?.[0]) {
							resolve(results[0])
						} else {
							reject(new Error(`Reverse geocoding failed: ${status}`))
						}
					})
				}))
			),
			map(result => {
				// Parse Google result into VenueAddress format
				const components = result.address_components || []
				const address: VenueAddress = {
					street: '',
					city: '',
					postalCode: '',
					country: '',
					coordinates: location
				}
				
				// Extract address components
				for (const component of components) {
					const types = component.types || []
					
					if (types.includes('street_number')) {
						address.street = component.long_name + ' ' + address.street
					} else if (types.includes('route')) {
						address.street = address.street + component.long_name
					} else if (types.includes('locality')) {
						address.city = component.long_name
					} else if (types.includes('postal_code')) {
						address.postalCode = component.long_name
					} else if (types.includes('country')) {
						address.country = component.long_name
					}
				}
				
				// Clean up street
				address.street = address.street.trim()
				
				return address
			}),
			catchError(err => {
				console.error('Reverse geocoding error:', err)
				return of(null)
			})
		)
	}


	render() {
		return html`
			<schmancy-surface type="container" rounded="all" class="h-full w-full relative overflow-hidden">
				${when(this.loading,
					() => html`
						<div class="absolute inset-0 flex items-center justify-center bg-surface-low">
							<schmancy-circular-progress size="md"></schmancy-circular-progress>
						</div>
					`
				)}
				
				${when(this.error,
					() => html`
						<div class="flex flex-col items-center justify-center h-full p-6 text-center">
							<schmancy-icon class="text-error-default mb-4">error_outline</schmancy-icon>
							<schmancy-typography type="body" token="md" class="text-error-default mb-2">
								${this.error}
							</schmancy-typography>
							${this.error?.includes('API key') ? html`
								<schmancy-typography type="body" token="sm" class="text-surface-onVariant mt-4">
									To enable Google Maps:
								</schmancy-typography>
								<ol class="text-left mt-2 text-sm text-surface-onVariant">
									<li>1. Get an API key from <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" class="text-primary-default underline">Google Cloud Console</a></li>
									<li>2. Add to your .env file: <code class="bg-surface-high px-2 py-1 rounded">VITE_GOOGLE_MAPS_API_KEY=your_key_here</code></li>
									<li>3. Restart the development server</li>
								</ol>
							` : ''}
						</div>
					`
				)}
				
				${when(!this.mapLoaded && this.address && !this.loading && !this.error,
					() => html`
						<div class="flex flex-col items-center justify-center h-full p-6 text-center bg-surface-low">
							<schmancy-icon size="3rem" class="mb-4 text-surface-onVariant">map</schmancy-icon>
							<schmancy-typography type="body" token="md" class="text-surface-onVariant">
								Map view unavailable
							</schmancy-typography>
							<schmancy-typography type="body" token="sm" class="text-surface-onVariant mt-2">
								Use the "Get Directions" button below for navigation
							</schmancy-typography>
						</div>
					`
				)}
				
				<div 
					id="map-container"
					class="w-full h-full ${this.selectionMode ? 'cursor-crosshair' : ''}"
					style="min-height: 300px;"
					@click=${(e: Event) => {
						if (!this.interactive) {
							e.preventDefault()
							e.stopPropagation()
						}
					}}
				></div>
		
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'venue-map-interactive': VenueMapInteractive
	}
}
