import { css, html, LitElement } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { CourtMapCoordinates } from 'src/db/courts.collection'

// Define global Leaflet interface to handle dynamic loading
declare global {
  interface Window {
    L: any
  }
}

/**
 * Court Map Editor Component
 *
 * A component that allows users to draw a rectangle on a map to represent a court
 */
@customElement('court-map-editor')
export class CourtMapEditor extends LitElement {
  /**
   * Map coordinates object
   */
  @property({ type: Object })
  mapCoordinates?: CourtMapCoordinates

  /**
   * Venue latitude (if available)
   */
  @property({ type: Number })
  venueLatitude?: number
  
  /**
   * Venue longitude (if available)
   */
  @property({ type: Number })
  venueLongitude?: number

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
   * Map edit mode state
   */
  @state()
  isEditingActive = false

  /**
   * Reference to the map container element
   */
  @query('.map-container')
  mapContainer!: HTMLElement

  // Private properties
  private map: any = null
  private drawnItems: any = null
  private drawControl: any = null
  private rectangle: any = null
  private leafletLoaded: boolean = false
  private leafletDrawLoaded: boolean = false
  private baseLayers: any = {}
  private layerControl: any = null

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
      /* Fix for map disappearing in Safari */
      transform: translateZ(0);
      /* Critical to keep Leaflet from escaping the shadow DOM */
      isolation: isolate;
    }

    /* Make sure Leaflet controls stay inside shadow DOM */
    ::slotted(.leaflet-control-container) {
      position: absolute;
      z-index: 1000;
    }

    /* Override Leaflet CSS to work properly with shadow DOM */
    :host .leaflet-container {
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
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

    .reset-button-container {
      position: absolute;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
    }
    
    .reset-button {
      background-color: #ef4444;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      font-weight: bold;
    }
    
    .edit-mode {
      cursor: crosshair !important;
      position: relative;
    }
    
    .edit-mode::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(59, 130, 246, 0.05);
      pointer-events: none;
      z-index: 990;
      border: 2px solid #3b82f6;
      border-radius: 8px;
    }
    
    /* Disable standard controls while editing */
    .edit-mode .leaflet-control:not(.leaflet-control-custom) {
      opacity: 0.5;
      pointer-events: none;
    }
    
    /* For rotated rectangles */
    .rotated-icon {
      /* This class will be applied to rectangles with rotation */
      transform-origin: center center;
      transition: transform 0.15s ease;
    }
    
    /* Enhanced Rotation control */
    .rotation-control {
      position: absolute;
      bottom: 80px;
      right: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      background: white;
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      z-index: 1000;
    }
    
    .rotation-label {
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .rotation-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      justify-content: center;
      margin-bottom: 5px;
    }
    
    .rotation-button {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background-color: #3b82f6;
      color: white;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      transition: transform 0.1s ease, background-color 0.1s ease;
    }
    
    .rotation-button:hover {
      background-color: #2563eb;
      transform: scale(1.05);
    }
    
    .rotation-button.fine {
      width: 30px;
      height: 30px;
      font-size: 14px;
      background-color: #6b7280;
    }
    
    .rotation-button.fine:hover {
      background-color: #4b5563;
    }
    
    .rotation-angle-row {
      display: flex;
      align-items: center;
      margin-top: 5px;
      gap: 8px;
    }
    
    .rotation-value {
      font-size: 14px;
      font-weight: bold;
      color: #1f2937;
      min-width: 38px;
      text-align: center;
    }
    
    .rotation-input {
      width: 60px;
      padding: 4px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      text-align: center;
      font-size: 12px;
    }
    
    .apply-rotation {
      padding: 4px 8px;
      background-color: #10b981;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }
    
    .apply-rotation:hover {
      background-color: #059669;
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
    this.loadLeaflet()
  }

  /**
   * Load Leaflet and its plugins
   */
  /**
   * Load Leaflet and its plugins
   */
  private async loadLeaflet(): Promise<void> {
    // First load Leaflet core
    try {
      await this._loadLeafletScript()
      this.leafletLoaded = true
      
      // Then load Leaflet Draw plugin
      await this._loadLeafletDrawScript()
      this.leafletDrawLoaded = true
      
      // No need for Path Transform plugin anymore - using CSS rotation
      
      // Initialize the map
      this.initializeMap()
    } catch (error) {
      console.error('Error loading map libraries:', error)
      this.error = 'Failed to load map libraries. Please try again.'
      this.loading = false
    }
  }

  /**
   * Load Leaflet core script and CSS
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
   * Load Leaflet Draw plugin
   */
  private async _loadLeafletDrawScript(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Check if Leaflet is available
      if (!window.L) {
        reject(new Error('Leaflet core must be loaded first'))
        return
      }
      
      // Load CSS if not already present
      if (!document.querySelector('link[href*="leaflet.draw.css"]')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css'
        link.crossOrigin = 'anonymous'
        this.shadowRoot?.append(link)
      }

      // Load Leaflet Draw JS
      const drawScript = document.createElement('script')
      drawScript.src = 'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js'
      drawScript.crossOrigin = 'anonymous'

      drawScript.onload = () => {
        resolve()
      }

      drawScript.onerror = () => {
        reject(new Error('Failed to load Leaflet Draw script'))
      }

      document.head.appendChild(drawScript)
    })
  }
  
  // We don't need the Path Transform plugin anymore - using CSS rotation approach

  /**
   * Initialize the map
   */
  private initializeMap(): void {
    // Using requestAnimationFrame to ensure the DOM is ready
    requestAnimationFrame(() => {
      if (!this.mapContainer || !window.L) {
        this.error = 'Could not initialize map'
        this.loading = false
        return
      }

      try {
        const L = window.L

        // Center coordinates - use venue coordinates if available, or fallback to defaults
        const centerLat = this.venueLatitude || 51.505
        const centerLng = this.venueLongitude || -0.09
        
        // Notify if venue coordinates are missing
        if (!this.venueLatitude || !this.venueLongitude) {
          this.dispatchEvent(new CustomEvent('no-venue-coordinates', {
            bubbles: true,
            composed: true
          }))
        }
        
        // Set initial zoom level based on context
        const initialZoom = 18 // Slightly lower zoom for better initial context
        
        // Create map directly on the shadow DOM element with improved options
        this.map = L.map(this.mapContainer, {
          center: [centerLat, centerLng],
          zoom: initialZoom,
          zoomControl: true,
          // Additional options to improve user experience
          minZoom: 3,        // Don't let users zoom out too far
          maxZoom: 22,       // Allow deep zoom for courts
          zoomDelta: 0.5,    // Smoother zooming
          zoomSnap: 0.5,     // Smoother zooming
          wheelPxPerZoomLevel: 120, // More precise mouse wheel zooming
          bounceAtZoomLimits: false // Don't bounce at zoom limits
        })

        // Add base tile layers
        this.setupBaseLayers(L)
        
        // Add controls
        this.setupControls(L)
        
        // Initialize drawing features
        this.setupDrawingTools(L)
        
        // Show existing rectangle if coordinates are provided
        if (this.mapCoordinates) {
          this.updateRectangle()
        } else {
          // If no rectangle exists, zoom in a bit more to provide context for drawing
          setTimeout(() => {
            if (this.map && this.venueLatitude && this.venueLongitude) {
              this.map.setView([this.venueLatitude, this.venueLongitude], 19, { animate: true });
            }
          }, 1000);
        }

        // Force a redraw to ensure proper display
        setTimeout(() => {
          if (this.map) {
            this.map.invalidateSize(true)
          }
        }, 300)

        this.loading = false
      } catch (error) {
        console.error('Map initialization error:', error)
        this.error = 'Failed to initialize map. Please refresh the page.'
        this.loading = false
      }
    })
  }

  // We no longer need the mapContainerDiv since we're using the shadow DOM element directly

  /**
   * Set up base map layers
   */
  private setupBaseLayers(L: any): void {
    // Satellite imagery - use Google Satellite with better zoom levels
    const satelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      maxZoom: 22,
      attribution: 'Map data &copy; Google'
    })
    
    // Street map - using OpenStreetMap
    const streetsLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, // OpenStreetMap typically only supports up to 19
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    })
    
    // Add a backup layer (hybrid) in case others fail
    const hybridLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 22,
      attribution: 'Map data &copy; Google'
    })
    
    // Organize layers
    this.baseLayers = {
      "Satellite": satelliteLayer,
      "Streets": streetsLayer,
      "Hybrid": hybridLayer
    }
    
    // Add satellite by default
    satelliteLayer.addTo(this.map)
  }

  /**
   * Set up map controls
   */
  private setupControls(L: any): void {
    // Layer control
    this.layerControl = L.control.layers(this.baseLayers).addTo(this.map)
    
    // Scale control
    L.control.scale().addTo(this.map)
    
    // Custom edit control
    const editControl = this.createEditControl(L)
    this.map.addControl(editControl)
  }

  /**
   * Create a custom edit control button
   */
  private createEditControl(L: any): any {
    const EditControl = L.Control.extend({
      options: {
        position: 'topright'
      },
      
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom')
        
        // Create edit button
        const button = L.DomUtil.create('a', 'leaflet-control-button', container)
        button.href = '#'
        button.title = 'Edit Court Rectangle'
        button.innerHTML = '✏️'
        button.style.fontSize = '22px'
        button.style.width = '36px'
        button.style.height = '36px'
        button.style.lineHeight = '36px'
        button.style.textAlign = 'center'
        button.style.background = 'white'
        button.style.boxShadow = '0 1px 5px rgba(0,0,0,0.65)'
        button.style.borderRadius = '4px'
        button.style.cursor = 'pointer'
        button.style.display = 'flex'
        button.style.justifyContent = 'center'
        button.style.alignItems = 'center'
        
        // Prevent map event propagation
        L.DomEvent.disableClickPropagation(container)
        L.DomEvent.disableScrollPropagation(container)
        
        // Handle click
        L.DomEvent.on(button, 'click', (e: MouseEvent) => {
          L.DomEvent.stop(e)
          
          if (this.rectangle) {
            const isEditing = this.isEditingRectangle()
            
            if (isEditing) {
              // Save changes
              this.disableEditing()
              button.innerHTML = '✏️'
              button.title = 'Edit Court Rectangle'
            } else {
              // Enable editing
              this.enableEditing()
              button.innerHTML = '✅'
              button.title = 'Save Changes'
            }
          }
        })
        
        return container
      }
    })
    
    return new EditControl()
  }

  /**
   * Set up drawing tools on the map
   */
  private setupDrawingTools(L: any): void {
    // Add the polyfill for skipped function if not present
    if (L.DomEvent && !L.DomEvent.skipped) {
      L.DomEvent.skipped = function(e: Event) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
    }
  
    // Create feature group for drawn items
    this.drawnItems = new L.FeatureGroup()
    this.map.addLayer(this.drawnItems)
    
    // Set up draw options - IMPORTANT: Don't set transform in shape options
    const drawOptions = {
      position: 'topright',
      draw: {
        // Disable all drawing tools except rectangle
        polyline: false,
        polygon: false,
        circle: false,
        marker: false,
        circlemarker: false,
        rectangle: {
          shapeOptions: {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.8,
            fillColor: '#3b82f6',
            fillOpacity: 0.4,
            dashArray: '5, 5'
            // Don't use transform: true here - we'll initialize it manually
          },
          showArea: true,
          metric: true
        }
      },
      edit: {
        featureGroup: this.drawnItems,
        remove: true
      }
    }
    
    // Create and add the draw control
    this.drawControl = new L.Control.Draw(drawOptions)
    this.map.addControl(this.drawControl)
    
    // Set up event handlers
    this.setupDrawEventHandlers(L)
  }

  /**
   * Set up event handlers for drawing operations
   */
  private setupDrawEventHandlers(L: any): void {
    // Drawing started
    this.map.on(L.Draw.Event.DRAWSTART, () => {
      this.disableMapInteractions()
    })
    
    // Drawing stopped
    this.map.on(L.Draw.Event.DRAWSTOP, () => {
      if (!this.isEditingRectangle()) {
        this.enableMapInteractions()
      }
    })
    
    // Shape created
    this.map.on(L.Draw.Event.CREATED, (e: any) => {
      // Clear existing shapes
      this.drawnItems.clearLayers()
      
      // Store the new rectangle
      this.rectangle = e.layer
      this.drawnItems.addLayer(this.rectangle)
      
      // Setup rectangle event handlers
      this.setupRectangleEventHandlers(L)
      
      // Update coordinates
      this.updateCoordinatesFromRectangle()
      
      // Enable editing automatically for better UX
      setTimeout(() => this.enableEditing(), 100)
    })
    
    // Shape edited
    this.map.on(L.Draw.Event.EDITED, (e: any) => {
      e.layers.eachLayer((layer: any) => {
        this.updateCoordinatesFromRectangle(layer)
      })
      this.enableMapInteractions()
    })
    
    // Shape deleted
    this.map.on(L.Draw.Event.DELETED, () => {
      if (this.drawnItems.getLayers().length === 0) {
        this.rectangle = null
        this.mapCoordinates = undefined
        this.dispatchCoordinatesChange()
      }
      this.enableMapInteractions()
    })
    
    // Edit started
    this.map.on(L.Draw.Event.EDITSTART, () => {
      this.disableMapInteractions()
    })
    
    // Edit stopped
    this.map.on(L.Draw.Event.EDITSTOP, () => {
      this.enableMapInteractions()
    })
    
    // Delete started
    this.map.on(L.Draw.Event.DELETESTART, () => {
      this.disableMapInteractions()
    })
    
    // Delete stopped
    this.map.on(L.Draw.Event.DELETESTOP, () => {
      this.enableMapInteractions()
    })
  }

  /**
   * Set up event handlers for the rectangle
   */
  private setupRectangleEventHandlers(L: any): void {
    if (!this.rectangle) return
    
    // Prevent map clicks when clicking on rectangle
    this.rectangle.on('click', (e: any) => {
      L.DomEvent.stopPropagation(e)
      if (e.originalEvent) {
        e.originalEvent.stopPropagation()
      }
    })
    
    // Add polyfill for backward compatibility
    if (L.DomEvent && !L.DomEvent.skipped) {
      L.DomEvent.skipped = function(e: Event) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
    }
    
    // Update coordinates when rectangle is modified
    const events = ['dragend', 'edit', 'editmove', 'editresize']
    events.forEach(event => {
      this.rectangle.on(event, () => {
        // Re-apply rotation before updating coordinates
        if (this.rotationDegrees !== 0 && this.rectangle._path) {
          this.rectangle._path.style.transformOrigin = 'center center'
          this.rectangle._path.style.transform = `rotate(${this.rotationDegrees}deg)`
          this.rectangle._path.classList.add('rotated-icon')
        }
        
        this.updateCoordinatesFromRectangle()
      })
    })
    
    // Explicitly handle drag events to prevent map zooming
    this.rectangle.on('dragstart', () => {
      this.disableMapInteractions()
    })
    
    this.rectangle.on('dragend', () => {
      // Short delay to prevent immediate re-enabling
      setTimeout(() => {
        if (!this.isEditingRectangle()) {
          this.enableMapInteractions()
        }
      }, 100)
    })
  }

  /**
   * Disable map interactions during editing
   */
  private disableMapInteractions(): void {
    if (!this.map) return
    
    // Disable map interactions
    this.map.dragging.disable()
    this.map.touchZoom.disable()
    this.map.doubleClickZoom.disable()
    this.map.scrollWheelZoom.disable()
    this.map.boxZoom.disable()
    this.map.keyboard.disable()
    
    // Add edit mode class to container
    if (this.mapContainer) {
      this.mapContainer.classList.add('edit-mode')
    }
    
    this.isEditingActive = true
  }

  /**
   * Enable map interactions after editing
   */
  private enableMapInteractions(): void {
    if (!this.map) return
    
    // Re-enable map interactions
    this.map.dragging.enable()
    this.map.touchZoom.enable()
    this.map.doubleClickZoom.enable()
    this.map.scrollWheelZoom.enable()
    this.map.boxZoom.enable()
    this.map.keyboard.enable()
    
    // Remove edit mode class from container
    if (this.mapContainer) {
      this.mapContainer.classList.remove('edit-mode')
    }
    
    this.isEditingActive = false
  }

  /**
   * Check if the rectangle is currently in edit mode
   */
  private isEditingRectangle(): boolean {
    if (!this.rectangle) return false
    
    // Check standard editing
    if (this.rectangle.editing && typeof this.rectangle.editing.enabled === 'function' && this.rectangle.editing.enabled()) {
      return true
    }
    
    // Check _editing property
    if (this.rectangle._editing && this.rectangle._editing._enabled) {
      return true
    }
    
    return false
  }

  /**
   * Enable editing on the rectangle
   */
  private enableEditing(): void {
    if (!this.rectangle) return
    
    this.disableMapInteractions()
    
    // First disable all editing modes to avoid conflicts
    this.disableEditing()
    
    const L = window.L
    
    // Add the polyfill for skipped function if not present (for backward compatibility)
    if (L && L.DomEvent && !L.DomEvent.skipped) {
      L.DomEvent.skipped = function(e: Event) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
    }
    
    // Initialize editing if needed for standard Leaflet rectangle editing
    if (L.Edit && L.Edit.Rectangle && !this.rectangle.editing) {
      try {
        this.rectangle.editing = new L.Edit.Rectangle(this.rectangle, {})
      } catch (e) {
        console.warn('Failed to initialize rectangle editing:', e)
      }
    }
    
    // Enable standard editing
    if (this.rectangle.editing && typeof this.rectangle.editing.enable === 'function') {
      try {
        this.rectangle.editing.enable()
      } catch (e) {
        console.warn('Standard editing failed:', e)
      }
    }
    
    // Re-apply CSS rotation if needed
    if (this.rotationDegrees !== 0 && this.rectangle._path) {
      const rectangleElement = this.rectangle._path
      rectangleElement.style.transformOrigin = 'center center'
      rectangleElement.style.transform = `rotate(${this.rotationDegrees}deg)`
      rectangleElement.classList.add('rotated-icon')
    }
    
    // Force map to stay disabled during editing
    setTimeout(() => {
      if (this.map && this.isEditingRectangle()) {
        this.disableMapInteractions()
      }
    }, 100)
  }

  /**
   * Disable editing on the rectangle
   */
  private disableEditing(): void {
    if (!this.rectangle) return
    
    // Disable standard editing if active
    if (this.rectangle.editing && typeof this.rectangle.editing.disable === 'function') {
      this.rectangle.editing.disable()
    }
    
    // Disable editing via _editing property if available
    if (this.rectangle._editing && typeof this.rectangle._editing.disable === 'function') {
      this.rectangle._editing.disable()
    }
    
    // Update coordinates from rectangle
    this.updateCoordinatesFromRectangle()
    
    // Re-enable map interactions
    this.enableMapInteractions()
  }

  /**
   * Update mapCoordinates from the rectangle
   */
  private updateCoordinatesFromRectangle(layer?: any): void {
    const rect = layer || this.rectangle
    if (!rect || !rect.getBounds) return
    
    try {
      // Get bounds
      const bounds = rect.getBounds()
      const southWest = bounds.getSouthWest()
      const northEast = bounds.getNorthEast()
      
      // Create coordinates object
      const coordinates: CourtMapCoordinates = {
        southWest: {
          lat: southWest.lat,
          lng: southWest.lng
        },
        northEast: {
          lat: northEast.lat,
          lng: northEast.lng
        }
      }
      
      // Add rotation from the rotation state if non-zero
      if (this.rotationDegrees !== 0) {
        coordinates.rotation = this.rotationDegrees
      }
      
      // Update map coordinates
      this.mapCoordinates = coordinates
      
      // Dispatch event
      this.dispatchCoordinatesChange()
    } catch (e) {
      console.error('Error updating coordinates:', e)
    }
  }

  /**
   * Update the rectangle from mapCoordinates
   */
  private updateRectangle(): void {
    if (!this.map || !window.L || !this.mapCoordinates) return
    
    const L = window.L
    
    // Clear existing drawn items
    this.drawnItems.clearLayers()
    
    // Create bounds from coordinates
    const bounds = [
      [this.mapCoordinates.southWest.lat, this.mapCoordinates.southWest.lng],
      [this.mapCoordinates.northEast.lat, this.mapCoordinates.northEast.lng]
    ]
    
    // Create rectangle with simple options
    this.rectangle = L.rectangle(bounds, {
      color: '#3b82f6',
      weight: 3,
      opacity: 0.8,
      fillColor: '#3b82f6',
      fillOpacity: 0.4,
      dashArray: '5, 5',
      interactive: true
    })
    
    // Add rectangle to map
    this.drawnItems.addLayer(this.rectangle)
    
    // Update the rotation state from saved coordinates
    if (this.mapCoordinates.rotation !== undefined) {
      this.rotationDegrees = this.mapCoordinates.rotation
    } else {
      this.rotationDegrees = 0
    }
    
    // Set up event handlers
    this.setupRectangleEventHandlers(L)
    
    // Fit map to show the rectangle
    this.map.fitBounds(bounds, { padding: [50, 50] })
    
    // Make rectangle editable with standard Leaflet editing
    if (L.Edit && L.Edit.Rectangle) {
      try {
        if (!this.rectangle.editing) {
          this.rectangle.editing = new L.Edit.Rectangle(this.rectangle)
        }
      } catch (e) {
        console.warn('Failed to initialize rectangle editing', e)
      }
    }
    
    // Apply CSS rotation after a small delay to ensure the rectangle is rendered
    setTimeout(() => {
      if (!this.rectangle || !this.rectangle._path) return
      
      // Apply rotation using CSS transform
      const rectangleElement = this.rectangle._path
      if (rectangleElement && this.rotationDegrees !== 0) {
        rectangleElement.style.transformOrigin = 'center center'
        rectangleElement.style.transform = `rotate(${this.rotationDegrees}deg)`
        rectangleElement.classList.add('rotated-icon')
      }
    }, 100)
  }

  /**
   * Reset the rectangle
   */
  private resetRectangle(): void {
    if (!this.map || !this.drawnItems) return
    
    // Clear all drawn shapes
    this.drawnItems.clearLayers()
    this.rectangle = null
    
    // Reset coordinates
    this.mapCoordinates = undefined
    
    // Dispatch event
    this.dispatchCoordinatesChange()
  }

  /**
   * Dispatch coordinates change event
   */
  private dispatchCoordinatesChange(): void {
    // Dispatch coordinates-change event
    this.dispatchEvent(new CustomEvent<{coordinates: CourtMapCoordinates | undefined}>('coordinates-change', {
      detail: { coordinates: this.mapCoordinates },
      bubbles: true,
      composed: true
    }))
    
    // Also dispatch bounds-change event for backward compatibility
    let bounds: any = undefined
    
    if (this.mapCoordinates) {
      bounds = [
        [this.mapCoordinates.southWest.lat, this.mapCoordinates.southWest.lng],
        [this.mapCoordinates.northEast.lat, this.mapCoordinates.northEast.lng]
      ]
      
      // Include rotation if available
      if (this.mapCoordinates.rotation !== undefined) {
        bounds[2] = [['rotation'], [this.mapCoordinates.rotation]]
      }
    }
    
    this.dispatchEvent(new CustomEvent('bounds-change', {
      detail: { bounds },
      bubbles: true,
      composed: true
    }))
  }

  /**
   * Center the map on the venue coordinates
   */
  private centerMap(): void {
    if (!this.map || !this.venueLatitude || !this.venueLongitude) return
    this.map.setView([this.venueLatitude, this.venueLongitude], 19)
  }

  /**
   * Clean up on disconnect
   */
  disconnectedCallback(): void {
    super.disconnectedCallback()
    
    // Clean up map and controls
    if (this.map) {
      // Remove all controls and layers first
      if (this.drawControl) {
        this.map.removeControl(this.drawControl)
      }
      
      if (this.layerControl) {
        this.map.removeControl(this.layerControl)
      }
      
      if (this.drawnItems) {
        this.map.removeLayer(this.drawnItems)
      }
      
      if (this.rectangle) {
        this.map.removeLayer(this.rectangle)
      }
      
      // Remove the map instance
      this.map.remove()
    }
    
    // Reset all properties
    this.map = null
    this.drawControl = null
    this.layerControl = null
    this.drawnItems = null
    this.rectangle = null
    this.baseLayers = {}
  }

  /**
   * Update when properties change
   */
  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties)
    
    if (!this.map || !this.leafletLoaded) return
    
    // Update rectangle if mapCoordinates changed
    if (changedProperties.has('mapCoordinates') && this.mapCoordinates) {
      this.updateRectangle()
    }
    
    // Center map if venue coordinates changed
    if ((changedProperties.has('venueLatitude') || changedProperties.has('venueLongitude')) && 
        this.venueLatitude && this.venueLongitude) {
      this.centerMap()
    }
  }

  /**
   * Retry initialization after an error
   */
  private retryInitialization(): void {
    this.loading = true
    this.error = null
    
    if (this.map) {
      this.map.remove()
      this.map = null
    }
    
    this.loadLeaflet()
  }

  /**
   * Track rotation value for the rectangle
   */
  @state()
  private rotationDegrees: number = 0;

  /**
   * Rotate the court rectangle by a specified angle
   */
  private rotateRectangle(angleDelta: number): void {
    if (!this.rectangle) return;

    // Update rotation value (keep within 0-360 range)
    this.rotationDegrees = (this.rotationDegrees + angleDelta) % 360;
    if (this.rotationDegrees < 0) this.rotationDegrees += 360;

    // Apply CSS transform to the rectangle's DOM element
    const rectangleElement = this.rectangle._path;
    if (rectangleElement) {
      rectangleElement.style.transformOrigin = 'center center';
      rectangleElement.style.transform = `rotate(${this.rotationDegrees}deg)`;
      rectangleElement.classList.add('rotated-icon');
    }

    // Store the rotation in the coordinates object
    if (!this.mapCoordinates) {
      this.updateCoordinatesFromRectangle();
    } else {
      this.mapCoordinates.rotation = this.rotationDegrees;
      this.dispatchCoordinatesChange();
    }
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
                    <button @click=${() => this.retryInitialization()} class="retry-button">Retry</button>
                  </div>
                </div>
              `,
              () => html`
                ${when(
                  this.mapCoordinates,
                  () => html`
                    <div class="reset-button-container">
                      <button @click=${() => this.resetRectangle()} class="reset-button">
                        Reset Court Placement
                      </button>
                    </div>
                    
                    <!-- New Rotation Control -->
                    <div class="rotation-control">
                      <div class="rotation-label">Rotate Court</div>
                      <div class="rotation-buttons">
                        <button @click=${() => this.rotateRectangle(-45)} class="rotation-button" title="Rotate counter-clockwise">↺</button>
                        <button @click=${() => this.rotateRectangle(45)} class="rotation-button" title="Rotate clockwise">↻</button>
                      </div>
                      <div class="rotation-value">${this.rotationDegrees}°</div>
                    </div>
                  `
                )}
              `
            )}
          `
        )}
      </div>
    `
  }
}

// Add the element to the global namespace for TypeScript
declare global {
  interface HTMLElementTagNameMap {
    'court-map-editor': CourtMapEditor
  }
}
