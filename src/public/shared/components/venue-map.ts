import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { BehaviorSubject, EMPTY, from, fromEvent, Observable, of } from 'rxjs'
import { catchError, debounceTime, distinctUntilChanged, filter, finalize, map, switchMap, take, takeUntil, tap } from 'rxjs/operators'
import { VenueAddress } from 'src/types/booking/venue.types'

// Define the Google Maps API types we need
declare global {
	interface Window {
		google?: {
			maps: {
				Map: new (element: HTMLElement, options: any) => any
				Marker: new (options: any) => any
				LatLng: new (lat: number, lng: number) => any
				Geocoder: new () => any
				Animation: {
					DROP: any
				}
				MapTypeControlStyle: {
					DEFAULT: any
					HORIZONTAL_BAR: any
					DROPDOWN_MENU: any
				}
				ControlPosition: {
					TOP_LEFT: any
					TOP_CENTER: any
					TOP_RIGHT: any
					LEFT_CENTER: any
					RIGHT_CENTER: any
					BOTTOM_LEFT: any
					BOTTOM_CENTER: any
					BOTTOM_RIGHT: any
				}
			}
		}
		initMap?: () => void
	}
}

/**
 * Google Maps component to display venue location
 * Follows project's functional programming patterns with RxJS
 * 
 * Features:
 * - Satellite view by default (configurable via mapType prop)
 * - Configurable map controls (zoom, map type, street view, etc.)
 * - Only zoom control enabled by default
 * - Automatic geocoding for addresses without coordinates
 * - Responsive and accessible design
 */
@customElement('venue-map')
export class VenueMap extends $LitElement(css`
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

	@state() private mapLoaded = false
	@state() private loading = true
	@state() private error: string | null = null

	@query('#map-container') mapContainer!: HTMLDivElement

	private map: any
	private marker: any
	
	// RxJS subjects for reactive state management
	private mapLoaded$ = new BehaviorSubject<boolean>(false)
	private address$ = new BehaviorSubject<VenueAddress | undefined>(undefined)

	connectedCallback() {
		super.connectedCallback()
		
		// Initialize Google Maps loading and map creation pipeline
		of(this.address).pipe(
			tap(() => this.loading = true),
			tap(address => this.address$.next(address)),
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
			filter(address => !!address && this.mapLoaded),
			debounceTime(300),
			switchMap(() => this.updateMapLocation()),
			takeUntil(this.disconnecting)
		).subscribe()
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		// Clean up map resources
		if (this.marker) {
			this.marker.setMap(null)
			this.marker = null
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
				} else if (address) {
					return this.geocodeAddress(address)
				} else {
					// Default location
					return of({ lat: 52.5200, lng: 13.4050 }) // Berlin
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
		if (!this.map || !this.address) return EMPTY

		return of(this.address).pipe(
			switchMap(address => {
				if (address.coordinates) {
					return of({ lat: address.coordinates.lat, lng: address.coordinates.lng })
				} else {
					return this.geocodeAddress(address)
				}
			}),
			tap(coords => {
				if (coords && window.google?.maps) {
					const center = new window.google.maps.LatLng(coords.lat, coords.lng)
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

		const center = new window.google.maps.LatLng(lat, lng)
		
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
				style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
				position: window.google.maps.ControlPosition.TOP_RIGHT
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
		this.map = new window.google.maps.Map(this.mapContainer, mapOptions)

		// Add marker if requested
		if (this.showMarker) {
			this.marker = new window.google.maps.Marker({
				position: center,
				map: this.map,
				title: this.venueName,
				animation: window.google.maps.Animation.DROP
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
		const fullAddress = `${street}, ${city}, ${postalCode}, ${country}`

		return of(new window.google.maps.Geocoder()).pipe(
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
					class="w-full h-full"
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
		'venue-map': VenueMap
	}
}
