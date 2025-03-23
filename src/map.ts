import { css, html, LitElement, PropertyValues } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'

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

	@query('#map') mapElement!: HTMLElement

	private map: any = null
	private leafletLoaded: boolean = false

	// Include Leaflet CSS in the shadow DOM
	static styles = css`
		:host {
			display: block;
		}

		#map {
			height: 300px;
			width: 100%;
			border: 1px solid #ccc;
			border-radius: 4px;
			overflow: hidden;
		}

		.attribution {
			margin-top: 8px;
			font-size: 12px;
			color: #666;
		}

		.attribution a {
			color: #0078a8;
			text-decoration: none;
		}

		.attribution a:hover {
			text-decoration: underline;
		}

		/* Include essential Leaflet styles directly in component */
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
	`

	connectedCallback() {
		super.connectedCallback()
		this._loadLeafletScript().then(() => {
			this.leafletLoaded = true
		})
	}

	protected firstUpdated(): void {
		if (this.leafletLoaded) {
			this._initializeMap()
		} else {
			this._loadLeafletScript().then(() => {
				this.leafletLoaded = true
				this._initializeMap()
			})
		}
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

	private async _loadLeafletScript(): Promise<void> {
		return new Promise<void>(resolve => {
			// Check if Leaflet is already loaded
			if (window.L) {
				resolve()
				return
			}

			// Load Leaflet JS (we handle CSS internally via static styles)
			const leafletScript = document.createElement('script')
			leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
			leafletScript.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
			leafletScript.crossOrigin = ''

			leafletScript.onload = () => {
				resolve()
			}

			document.head.appendChild(leafletScript)
		})
	}

	private _initializeMap(): void {
		// Wait for DOM to be ready
		requestAnimationFrame(() => {
			if (!this.mapElement || !window.L) return

			// If a map already exists, remove it first
			if (this.map) {
				this.map.remove()
				this.map = null
			}

			// Initialize map with minimal controls
			const L = window.L

			// Create map with the proper container
			this.map = L.map(this.mapElement, {
				center: [this.latitude, this.longitude],
				zoom: 16,
				dragging: false,
				touchZoom: false,
				scrollWheelZoom: false,
				doubleClickZoom: false,
				boxZoom: false,
				keyboard: false,
				zoomControl: false,
				attributionControl: false, // We'll add our own attribution
			})

			// Add a simple tile layer
			L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '',
			}).addTo(this.map)

			// Add a marker for the location
			L.marker([this.latitude, this.longitude]).addTo(this.map).bindPopup(this.address).openPopup()

			// Force a redraw of the map
			setTimeout(() => {
				if (this.map) {
					this.map.invalidateSize(true)
				}
			}, 200)
		})
	}

	render() {
		return html`
			<div id="map"></div>
			<div class="attribution">
				©
				<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors
			</div>
		`
	}
}
