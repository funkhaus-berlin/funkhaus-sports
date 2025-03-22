import { html, LitElement, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'

// Define interfaces for Leaflet since we're dynamically loading it
declare global {
	interface Window {
		L: any
	}
}

@customElement('simple-map')
export class SimpleMap extends LitElement {
	@property({ type: Number }) latitude: number = 52.4934
	@property({ type: Number }) longitude: number = 13.4967
	@property({ type: String }) address: string = 'Köpenicker Ch 11-14, 10317 Berlin'

	@state() private leafletLoaded: boolean = false
	private map: any = null

	// Explicitly disable shadow DOM
	createRenderRoot() {
		return this
	}

	protected firstUpdated(): void {
		this._loadLeafletLibraries().then(() => {
			this.leafletLoaded = true
			// Initialize map after a brief delay to ensure DOM is ready
			setTimeout(() => {
				this._initializeMap()
			}, 100)
		})
	}

	protected updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties)

		// Re-initialize map if coordinates change and Leaflet is loaded
		if (this.leafletLoaded && (changedProperties.has('latitude') || changedProperties.has('longitude'))) {
			this._initializeMap()
		}
	}

	disconnectedCallback(): void {
		super.disconnectedCallback()
		// Clean up the map when element is removed
		if (this.map) {
			this.map.remove()
			this.map = null
		}
	}

	private async _loadLeafletLibraries(): Promise<void> {
		return new Promise<void>(resolve => {
			// Check if Leaflet is already loaded
			if (window.L) {
				resolve()
				return
			}

			// Load Leaflet CSS
			const leafletCss = document.createElement('link')
			leafletCss.rel = 'stylesheet'
			leafletCss.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
			leafletCss.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
			leafletCss.crossOrigin = ''
			document.head.appendChild(leafletCss)

			// Load Leaflet JS
			const leafletScript = document.createElement('script')
			leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
			leafletScript.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
			leafletScript.crossOrigin = ''
			leafletScript.onload = () => resolve()
			document.head.appendChild(leafletScript)
		})
	}

	private _initializeMap(): void {
		// Use querySelector directly since we're not using shadow DOM
		const mapElement = this.querySelector('#map') as HTMLElement

		if (!mapElement || !window.L) return

		// If a map already exists, remove it first
		if (this.map) {
			this.map.remove()
			this.map = null
		}

		// Initialize map with minimal controls
		const L = window.L

		this.map = L.map(mapElement, {
			center: [this.latitude, this.longitude],
			zoom: 16,
			dragging: false,
			touchZoom: false,
			scrollWheelZoom: false,
			doubleClickZoom: false,
			boxZoom: false,
			keyboard: false,
			zoomControl: false,
			attributionControl: true,
		})

		// Add a simple tile layer
		L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
		}).addTo(this.map)

		// Add a marker for the location
		L.marker([this.latitude, this.longitude]).addTo(this.map).bindPopup(this.address).openPopup()

		// Force a redraw of the map to ensure proper rendering
		setTimeout(() => {
			if (this.map) {
				this.map.invalidateSize(true)
			}
		}, 200)
	}

	render() {
		return html`
			<div id="map" class="h-[300px] w-full border border-gray-300 rounded-md overflow-hidden"></div>
			<div class="mt-2 text-sm text-gray-500">
				${unsafeHTML(
					'&copy; <a href="https://www.openstreetmap.org/copyright" class="text-blue-500 hover:underline">OpenStreetMap</a> contributors',
				)}
			</div>
		`
	}
}
