import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { 
  BehaviorSubject, 
  EMPTY, 
  Subject, 
  combineLatest, 
  defer, 
  from, 
  fromEvent, 
  interval, 
  merge, 
  of, 
  throwError, 
  timer 
} from 'rxjs'
import { 
  catchError, 
  debounceTime, 
  distinctUntilChanged, 
  filter, 
  finalize, 
  map, 
  retry, 
  switchMap, 
  take, 
  takeUntil, 
  tap, 
  withLatestFrom 
} from 'rxjs/operators'
import { CourtMapCoordinates } from 'src/types/booking/court.types'
import { SportTypeEnum } from 'src/types/booking/court.types'

// Custom overlay for court SVG
class CourtOverlay {
  private bounds: any
  private div: HTMLDivElement | null = null
  private courtType: keyof typeof SportTypeEnum
  private courtName: string
  private rotation: number
  private onUpdate: (bounds: any) => void
  private isReadOnly: boolean = false
  private isDragging$ = new BehaviorSubject<boolean>(false)
  private destroyed$ = new Subject<void>()
  
  // Cleanup tracking
  private eventCleanup: (() => void)[] = []
  private overlay: any

  constructor(
    bounds: any,
    mapInstance: any,
    courtType: keyof typeof SportTypeEnum,
    courtName: string,
    rotation: number = 0,
    onUpdate: (bounds: any) => void,
    private onDragStateChange?: (isDragging: boolean) => void
  ) {
    this.bounds = bounds
    this.courtType = courtType
    this.courtName = courtName
    this.rotation = rotation
    this.onUpdate = onUpdate
    this.setMap(mapInstance)
    
    // Subscribe to drag state changes
    this.isDragging$.pipe(
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe(isDragging => {
      if (this.onDragStateChange) {
        this.onDragStateChange(isDragging)
      }
    })
  }

  onAdd() {
    this.div = document.createElement('div')
    this.div.style.position = 'absolute'
    this.div.style.cursor = this.isReadOnly ? 'default' : 'move'
    this.div.style.userSelect = 'none'
    
    // Prevent event propagation with proper cleanup tracking
    const preventPropagation = (e: Event) => e.stopPropagation()
    const events = ['mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'touchstart', 'touchmove', 'touchend']
    
    events.forEach(eventName => {
      this.div!.addEventListener(eventName, preventPropagation, true)
      this.eventCleanup.push(() => this.div?.removeEventListener(eventName, preventPropagation, true))
    })
    
    // Create court SVG container
    const svgContainer = this.createSvgContainer()
    this.div.appendChild(svgContainer)
    
    // Setup interactions if not read-only
    if (!this.isReadOnly) {
      this.setupDragInteractions()
    }
    
    // Add to map pane
    const panes = this.getPanes()
    if (panes?.overlayLayer) {
      panes.overlayLayer.appendChild(this.div)
    }
  }

  private createSvgContainer(): HTMLDivElement {
    const svgContainer = document.createElement('div')
    svgContainer.style.cssText = 'width: 100%; height: 100%; position: relative;'
    
    const svgPath = this.getSvgPath(this.courtType)
    const styles = this.getOverlayStyles()
    
    svgContainer.innerHTML = `
      <img src="${svgPath}" 
        style="width: 100%; height: 100%; object-fit: contain; opacity: ${styles.opacity}; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); pointer-events: none;" 
        alt="${String(this.courtType)} court"
      />
      <div class="court-label" style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${styles.backgroundColor};
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: bold;
        font-size: 14px;
        color: ${styles.textColor};
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        white-space: nowrap;
        pointer-events: ${this.isReadOnly ? 'none' : 'auto'};
        cursor: ${this.isReadOnly ? 'default' : 'grab'};
        user-select: none;
        z-index: 10;
      ">${this.courtName}</div>
    `
    
    return svgContainer
  }

  private getOverlayStyles() {
    return {
      opacity: this.isReadOnly ? '0.4' : '0.7',
      backgroundColor: this.isReadOnly ? 'rgba(200, 200, 200, 0.8)' : 'rgba(255, 255, 255, 0.9)',
      textColor: this.isReadOnly ? '#666' : '#1f2937'
    }
  }

  public draw() {
    // Skip drawing if we're dragging or div doesn't exist
    if (!this.div || this.isDragging$.value) return
    
    // Use RxJS to ensure projection is ready
    this.getProjectionReady$().pipe(
      take(1),
      tap(projection => {
        if (!projection || !this.div) return
        
        try {
          const sw = projection.fromLatLngToDivPixel(this.bounds.getSouthWest())
          const ne = projection.fromLatLngToDivPixel(this.bounds.getNorthEast())
          
          if (sw && ne && typeof sw.x === 'number' && typeof ne.x === 'number') {
            // Hide first to prevent shadows
            this.div.style.visibility = 'hidden'
            
            // Reset position and size
            this.div.style.left = `${Math.round(sw.x)}px`
            this.div.style.top = `${Math.round(ne.y)}px`
            this.div.style.width = `${Math.round(Math.abs(ne.x - sw.x))}px`
            this.div.style.height = `${Math.round(Math.abs(sw.y - ne.y))}px`
            
            // Clear any transforms
            this.div.style.transform = 'none'
            this.div.style.transition = 'none'
            
            // Force browser to recalculate layout
            void this.div.offsetHeight
            
            // Apply rotation if needed
            if (this.rotation !== 0) {
              this.div.style.transform = `rotate(${this.rotation}deg)`
              this.div.style.transformOrigin = 'center center'
            }
            
            // Show again
            this.div.style.visibility = 'visible'
          }
        } catch (error) {
          console.warn('Error drawing court overlay:', error)
        }
      }),
      takeUntil(this.destroyed$)
    ).subscribe()
  }

  private getProjectionReady$() {
    return defer(() => {
      const projection = this.getProjection()
      if (projection?.fromLatLngToDivPixel && projection?.fromDivPixelToLatLng) {
        return of(projection)
      }
      
      // Retry mechanism with exponential backoff
      return interval(100).pipe(
        map(() => this.getProjection()),
        filter(p => p?.fromLatLngToDivPixel && p?.fromDivPixelToLatLng),
        take(1),
        retry({ count: 10, delay: 200 })
      )
    })
  }

  onRemove() {
    this.destroyed$.next()
    this.destroyed$.complete()
    
    // Clean up all event listeners
    this.eventCleanup.forEach(cleanup => {
      try {
        cleanup()
      } catch (error) {
        console.warn('Error during cleanup:', error)
      }
    })
    this.eventCleanup = []
    
    // Remove DOM element
    if (this.div?.parentNode) {
      this.div.parentNode.removeChild(this.div)
      this.div = null
    }
  }

  setMap(mapInstance: any) {
    if (!window.google?.maps) return
    
    // Clean up existing overlay if any
    if (this.overlay) {
      this.overlay.setMap(null)
      this.overlay = null
    }
    
    // Create custom overlay
    this.overlay = new (window.google.maps as any).OverlayView()
    this.overlay.onAdd = () => this.onAdd()
    this.overlay.draw = () => this.draw()
    this.overlay.onRemove = () => this.onRemove()
    this.overlay.setMap(mapInstance)
  }

  private setupDragInteractions() {
    if (!this.div || !window.google?.maps) return
    
    // Setup drag for both the overlay div and the label
    const setupDragForElement = (element: HTMLElement, isLabel: boolean = false) => {
      const dragState = {
        startMouseX: 0,
        startMouseY: 0,
        startLat: 0,
        startLng: 0
      }
      
      // Mouse down handler
      const handleStart = (clientX: number, clientY: number) => {
        this.isDragging$.next(true)
        
        dragState.startMouseX = clientX
        dragState.startMouseY = clientY
        
        const center = this.bounds.getCenter()
        dragState.startLat = center.lat()
        dragState.startLng = center.lng()
        
        element.style.cursor = 'grabbing'
        document.body.style.cursor = 'grabbing'
      }
      
      // Mouse move handler
      const handleMove = (clientX: number, clientY: number) => {
        if (!this.isDragging$.value) return
        
        const deltaX = clientX - dragState.startMouseX
        const deltaY = clientY - dragState.startMouseY
        
        this.getProjectionReady$().pipe(
          take(1),
          tap(projection => {
            if (!projection) return
            
            // Convert start center to pixels
            const startCenterPixel = projection.fromLatLngToDivPixel(
              new window.google!.maps.LatLng(dragState.startLat, dragState.startLng)
            )
            
            // Calculate new center
            const newCenterPixel = {
              x: startCenterPixel.x + deltaX,
              y: startCenterPixel.y + deltaY
            }
            
            const newCenter = projection.fromDivPixelToLatLng(newCenterPixel)
            
            // Update bounds
            const sw = this.bounds.getSouthWest()
            const ne = this.bounds.getNorthEast()
            const latDiff = (ne.lat() - sw.lat()) / 2
            const lngDiff = (ne.lng() - sw.lng()) / 2
            
            this.bounds = new window.google!.maps.LatLngBounds(
              new window.google!.maps.LatLng(
                newCenter.lat() - latDiff,
                newCenter.lng() - lngDiff
              ),
              new window.google!.maps.LatLng(
                newCenter.lat() + latDiff,
                newCenter.lng() + lngDiff
              )
            )
            
            this.updatePositionDuringDrag()
          }),
          takeUntil(this.destroyed$)
        ).subscribe()
      }
      
      // Mouse up handler
      const handleEnd = () => {
        if (!this.isDragging$.value) return
        
        this.isDragging$.next(false)
        element.style.cursor = isLabel ? 'grab' : 'move'
        document.body.style.cursor = 'default'
        
        // Trigger proper redraw after drag ends
        timer(50).pipe(
          tap(() => this.draw()),
          tap(() => this.onUpdate(this.bounds)),
          takeUntil(this.destroyed$)
        ).subscribe()
      }
      
      // Create observables for mouse events
      const mousedown$ = fromEvent<MouseEvent>(element, 'mousedown')
      const touchstart$ = fromEvent<TouchEvent>(element, 'touchstart')
      
      const dragStart$ = merge(
        mousedown$.pipe(map(e => ({ x: e.clientX, y: e.clientY }))),
        touchstart$.pipe(
          filter(e => e.touches.length === 1),
          map(e => ({ x: e.touches[0].clientX, y: e.touches[0].clientY }))
        )
      )
      
      const documentMove$ = merge(
        fromEvent<MouseEvent>(document, 'mousemove').pipe(
          map(e => ({ x: e.clientX, y: e.clientY }))
        ),
        fromEvent<TouchEvent>(document, 'touchmove').pipe(
          filter(e => e.touches.length === 1),
          map(e => ({ x: e.touches[0].clientX, y: e.touches[0].clientY }))
        )
      )
      
      const documentEnd$ = merge(
        fromEvent(document, 'mouseup'),
        fromEvent(document, 'touchend')
      )
      
      // Setup drag stream
      dragStart$.pipe(
        tap(pos => handleStart(pos.x, pos.y)),
        switchMap(() => 
          documentMove$.pipe(
            tap(pos => handleMove(pos.x, pos.y)),
            takeUntil(documentEnd$.pipe(tap(() => handleEnd())))
          )
        ),
        takeUntil(this.destroyed$)
      ).subscribe()
    }
    
    // Setup drag for main div
    setupDragForElement(this.div)
    
    // Setup drag for label if it exists
    const label = this.div.querySelector('.court-label') as HTMLElement
    if (label) {
      setupDragForElement(label, true)
    }
  }

  private updatePositionDuringDrag() {
    if (!this.div) return
    
    this.getProjectionReady$().pipe(
      take(1),
      tap(projection => {
        if (!projection || !this.div) return
        
        try {
          const sw = projection.fromLatLngToDivPixel(this.bounds.getSouthWest())
          const ne = projection.fromLatLngToDivPixel(this.bounds.getNorthEast())
          
          if (sw && ne && typeof sw.x === 'number' && typeof ne.x === 'number') {
            this.div.style.left = `${Math.round(sw.x)}px`
            this.div.style.top = `${Math.round(ne.y)}px`
          }
        } catch (error) {
          // Silent fail during drag
        }
      }),
      takeUntil(this.destroyed$)
    ).subscribe()
  }

  // Public methods
  getBounds() {
    return this.bounds
  }

  setBounds(bounds: any) {
    this.bounds = bounds
    // Trigger Google Maps to redraw the overlay
    if (this.overlay && window.google?.maps?.event) {
      window.google.maps.event.trigger(this.overlay, 'draw')
    }
  }

  setRotation(rotation: number) {
    this.rotation = rotation
    // Trigger Google Maps to redraw the overlay
    if (this.overlay && window.google?.maps?.event) {
      window.google.maps.event.trigger(this.overlay, 'draw')
    }
  }

  updateCourtInfo(courtType: keyof typeof SportTypeEnum, courtName: string) {
    this.courtType = courtType
    this.courtName = courtName
    if (this.div) {
      this.onRemove()
      this.onAdd()
      this.draw()
    }
  }

  setReadOnly(readOnly: boolean) {
    this.isReadOnly = readOnly
    if (this.div) {
      this.div.style.cursor = readOnly ? 'default' : 'move'
      this.onRemove()
      this.onAdd()
      this.draw()
    }
  }

  private getSvgPath(courtType: keyof typeof SportTypeEnum): string {
    const paths: Record<string, string> = {
      padel: '/svg/padel-court.svg',
      volleyball: '/svg/volleyball-court.svg',
      pickleball: '/svg/pickleball-court.svg'
    }
    return paths[String(courtType)] || paths.pickleball
  }

  // Helper methods for Google Maps integration
  getPanes(): any {
    return this.overlay?.getPanes() || {}
  }

  getProjection(): any {
    return this.overlay?.getProjection() || {}
  }
}

/**
 * Google Maps-based Court Map Editor Component
 */
@customElement('court-map-editor-google')
export class CourtMapEditorGoogle extends $LitElement(css`
  :host {
    display: block;
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    border-radius: 8px;
  }

  .controls-container {
    position: absolute;
    bottom: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 1000;
  }

  .control-button {
    background: white;
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    transition: all 0.2s ease;
  }

  .control-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  }

  .control-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .control-button.primary {
    background: #3b82f6;
    color: white;
  }

  .control-button.danger {
    background: #ef4444;
    color: white;
  }

  .instructions {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.95);
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    font-size: 14px;
    text-align: center;
    z-index: 1000;
  }
`) {
  @property({ type: Object }) mapCoordinates?: CourtMapCoordinates
  @property({ type: Number }) venueLatitude?: number
  @property({ type: Number }) venueLongitude?: number
  @property({ type: String }) courtType: keyof typeof SportTypeEnum = 'pickleball'
  @property({ type: String }) courtName = 'Court'
  @property({ type: String }) apiKey?: string
  @property({ type: Array }) existingCourts: any[] = []

  @state() private loading = true
  @state() private error: string | null = null
  @state() private hasCourtPlaced = false
  @state() private rotation = 0
  @state() private courtSize = 1.0

  @query('#map-container') mapContainer!: HTMLDivElement

  // RxJS subjects for state management
  private mapLoaded$ = new BehaviorSubject<boolean>(false)
  private isDragging$ = new BehaviorSubject<boolean>(false)
  private mapReady$ = new BehaviorSubject<any>(null)
  private destroyed$ = new Subject<void>()
  
  // References
  private map: any
  private courtOverlay: CourtOverlay | null = null
  private existingCourtOverlays: CourtOverlay[] = []
  private mapEventListeners: any[] = []

  connectedCallback() {
    super.connectedCallback()
    this.initializeComponent()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.destroyed$.next()
    this.destroyed$.complete()
    this.cleanup()
  }

  private initializeComponent() {
    // Main initialization pipeline
    of(true).pipe(
      tap(() => this.loading = true),
      switchMap(() => this.loadGoogleMapsScript()),
      tap(() => this.mapLoaded$.next(true)),
      switchMap(() => this.waitForMapContainer()),
      switchMap(() => this.initializeMap()),
      tap(map => {
        this.map = map
        this.mapReady$.next(map)
      }),
      switchMap(() => this.setupInitialState()),
      catchError(err => {
        console.error('Map initialization error:', err)
        this.error = err.message || 'Failed to load map'
        return EMPTY
      }),
      finalize(() => this.loading = false),
      takeUntil(this.destroyed$)
    ).subscribe()
  }

  private loadGoogleMapsScript() {
    // Check if already loaded
    if (window.google?.maps) {
      return of(true)
    }

    // Check for existing script
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
    if (existingScript) {
      return fromEvent(existingScript, 'load').pipe(
        take(1),
        map(() => true)
      )
    }

    // Validate API key
    const apiKey = this.apiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return throwError(() => new Error('Google Maps API key not configured'))
    }

    // Load script
    return defer(() => {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initCourtMap`
      script.async = true
      script.defer = true
      
      const loadPromise = new Promise<boolean>((resolve, reject) => {
        (window as any).initCourtMap = () => resolve(true)
        script.onerror = () => reject(new Error('Failed to load Google Maps'))
      })
      
      document.head.appendChild(script)
      return from(loadPromise)
    })
  }

  private waitForMapContainer() {
    return from(this.updateComplete).pipe(
      switchMap(() => {
        if (this.mapContainer) {
          return of(this.mapContainer)
        }
        
        // Retry mechanism
        return interval(100).pipe(
          switchMap(() => from(this.updateComplete)),
          map(() => this.mapContainer),
          filter(container => !!container),
          take(1)
        )
      })
    )
  }

  private initializeMap() {
    return defer(() => {
      if (!window.google?.maps) {
        throw new Error('Google Maps not loaded')
      }

      const centerLat = this.venueLatitude || 50.1109
      const centerLng = this.venueLongitude || 8.6821
      
      const mapOptions = {
        center: { lat: centerLat, lng: centerLng },
        zoom: 19,
        mapTypeId: window.google.maps.MapTypeId.SATELLITE,
        tilt: 0,
        mapTypeControl: true,
        mapTypeControlOptions: {
          mapTypeIds: ['roadmap', 'satellite', 'hybrid'],
          position: window.google.maps.ControlPosition.TOP_RIGHT
        },
        streetViewControl: false,
        fullscreenControl: false,
        rotateControl: false,
        styles: [
          { elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
          { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
          { featureType: 'poi', stylers: [{ visibility: 'off' }] }
        ]
      }

      const map = new window.google.maps.Map(this.mapContainer, mapOptions)
      this.setupMapEventListeners(map)
      
      return of(map)
    })
  }

  private setupInitialState() {
    // Show existing court if coordinates are provided
    const showExistingCourt$ = defer(() => {
      if (this.mapCoordinates) {
        this.showExistingCourt()
      }
      return of(true)
    })

    // Show other existing courts after delay
    const showOtherCourts$ = timer(200).pipe(
      tap(() => this.showExistingCourts())
    )

    return combineLatest([showExistingCourt$, showOtherCourts$])
  }

  private setupMapEventListeners(map: any) {
    if (!map || !window.google?.maps) return

    // Create separate streams for different events
    const zoomEvent$ = new Subject<void>()
    const boundsEvent$ = new Subject<void>()
    const resizeEvent$ = new Subject<void>()
    
    // Handle zoom changes with longer debounce to prevent shadows
    zoomEvent$.pipe(
      debounceTime(300),
      withLatestFrom(this.isDragging$),
      filter(([_, isDragging]) => !isDragging),
      tap(() => this.redrawAllOverlays()),
      takeUntil(this.destroyed$)
    ).subscribe()
    
    // Handle bounds changes with shorter debounce
    boundsEvent$.pipe(
      debounceTime(100),
      withLatestFrom(this.isDragging$),
      filter(([_, isDragging]) => !isDragging),
      tap(() => this.redrawAllOverlays()),
      takeUntil(this.destroyed$)
    ).subscribe()
    
    // Handle resize immediately
    resizeEvent$.pipe(
      withLatestFrom(this.isDragging$),
      filter(([_, isDragging]) => !isDragging),
      tap(() => this.redrawAllOverlays()),
      takeUntil(this.destroyed$)
    ).subscribe()

    // Map event listeners
    const zoomListener = window.google!.maps.event.addListener(map, 'zoom_changed', () => {
      zoomEvent$.next()
    })
    const boundsListener = window.google!.maps.event.addListener(map, 'bounds_changed', () => {
      boundsEvent$.next()
    })
    const resizeListener = window.google!.maps.event.addListener(map, 'resize', () => {
      resizeEvent$.next()
    })
    
    this.mapEventListeners.push(zoomListener, boundsListener, resizeListener)

    // Handle drag state changes
    this.isDragging$.pipe(
      distinctUntilChanged(),
      tap(isDragging => {
        if (map) {
          map.setOptions({ draggable: !isDragging })
        }
      }),
      takeUntil(this.destroyed$)
    ).subscribe()
  }

  private redrawAllOverlays() {
    if (this.isDragging$.value) return
    
    timer(50).pipe(
      filter(() => !this.isDragging$.value),
      tap(() => {
        // Redraw main court
        if (this.courtOverlay) {
          this.courtOverlay.draw()
        }
        
        // Redraw existing courts
        this.existingCourtOverlays.forEach(overlay => {
          try {
            overlay.draw()
          } catch (error) {
            console.warn('Error redrawing overlay:', error)
          }
        })
      }),
      takeUntil(this.destroyed$)
    ).subscribe()
  }

  private showExistingCourt() {
    if (!this.map || !this.mapCoordinates || !window.google?.maps) return
    
    const bounds = new window.google.maps.LatLngBounds(
      new window.google.maps.LatLng(
        this.mapCoordinates.southWest.lat,
        this.mapCoordinates.southWest.lng
      ),
      new window.google.maps.LatLng(
        this.mapCoordinates.northEast.lat,
        this.mapCoordinates.northEast.lng
      )
    )
    
    this.rotation = this.mapCoordinates.rotation || 0
    
    this.courtOverlay = new CourtOverlay(
      bounds,
      this.map,
      this.courtType,
      this.courtName,
      this.rotation,
      (newBounds) => this.handleBoundsUpdate(newBounds),
      (isDragging) => this.isDragging$.next(isDragging)
    )
    
    this.hasCourtPlaced = true
    this.map.fitBounds(bounds, 50)
  }

  private showExistingCourts() {
    if (!this.map || !this.existingCourts?.length || !window.google?.maps) return

    // Clean up existing overlays
    this.existingCourtOverlays.forEach(overlay => {
      try {
        overlay.setMap(null)
      } catch (error) {
        console.warn('Error removing overlay:', error)
      }
    })
    this.existingCourtOverlays = []

    // Add new overlays
    this.existingCourts.forEach((court, index) => {
      try {
        if (court.mapCoordinates?.southWest && court.mapCoordinates?.northEast) {
          const bounds = new window.google!.maps.LatLngBounds(
            new window.google!.maps.LatLng(
              court.mapCoordinates.southWest.lat,
              court.mapCoordinates.southWest.lng
            ),
            new window.google!.maps.LatLng(
              court.mapCoordinates.northEast.lat,
              court.mapCoordinates.northEast.lng
            )
          )

          const overlay = new CourtOverlay(
            bounds,
            this.map,
            court.sportTypes?.[0] || 'pickleball',
            court.name || `Court ${index + 1}`,
            court.mapCoordinates.rotation || 0,
            () => {},
            undefined
          )

          overlay.setReadOnly(true)
          this.existingCourtOverlays.push(overlay)
        }
      } catch (error) {
        console.warn(`Error creating overlay for court ${court.name}:`, error)
      }
    })
  }

  private placeCourt() {
    if (!this.map || !window.google?.maps) return
    
    const center = this.map.getCenter()
    const courtWidthDegrees = 0.0002 * this.courtSize
    const courtHeightDegrees = 0.0001 * this.courtSize
    
    const bounds = new window.google.maps.LatLngBounds(
      new window.google.maps.LatLng(
        center.lat() - courtHeightDegrees / 2,
        center.lng() - courtWidthDegrees / 2
      ),
      new window.google.maps.LatLng(
        center.lat() + courtHeightDegrees / 2,
        center.lng() + courtWidthDegrees / 2
      )
    )
    
    this.courtOverlay = new CourtOverlay(
      bounds,
      this.map,
      this.courtType,
      this.courtName,
      this.rotation,
      (newBounds) => this.handleBoundsUpdate(newBounds),
      (isDragging) => this.isDragging$.next(isDragging)
    )
    
    this.hasCourtPlaced = true
    this.handleBoundsUpdate(bounds)
  }

  private handleBoundsUpdate(bounds: any) {
    if (!bounds) return
    
    const sw = bounds.getSouthWest()
    const ne = bounds.getNorthEast()
    
    this.mapCoordinates = {
      southWest: { lat: sw.lat(), lng: sw.lng() },
      northEast: { lat: ne.lat(), lng: ne.lng() },
      rotation: this.rotation
    }
    
    this.dispatchCoordinatesChange()
  }

  rotateCourt(delta: number) {
    this.rotation = (this.rotation + delta + 360) % 360
    
    if (this.courtOverlay) {
      this.courtOverlay.setRotation(this.rotation)
      if (this.mapCoordinates) {
        this.mapCoordinates.rotation = this.rotation
        this.dispatchCoordinatesChange()
      }
    }
  }

  moveCourt(direction: 'up' | 'down' | 'left' | 'right') {
    if (!this.courtOverlay || !window.google?.maps) return
    
    const bounds = this.courtOverlay.getBounds()
    const sw = bounds.getSouthWest()
    const ne = bounds.getNorthEast()
    
    const latDiff = (ne.lat() - sw.lat()) * 0.0125
    const lngDiff = (ne.lng() - sw.lng()) * 0.0125
    
    const movements = {
      up: { lat: latDiff, lng: 0 },
      down: { lat: -latDiff, lng: 0 },
      left: { lat: 0, lng: -lngDiff },
      right: { lat: 0, lng: lngDiff }
    }
    
    const movement = movements[direction]
    
    const newBounds = new window.google.maps.LatLngBounds(
      new window.google.maps.LatLng(sw.lat() + movement.lat, sw.lng() + movement.lng),
      new window.google.maps.LatLng(ne.lat() + movement.lat, ne.lng() + movement.lng)
    )
    
    this.courtOverlay.setBounds(newBounds)
    this.handleBoundsUpdate(newBounds)
  }

  changeCourtSize(delta: number) {
    if (!this.courtOverlay || !window.google?.maps) return
    
    this.courtSize = Math.max(0.5, Math.min(3.0, this.courtSize + delta))
    
    const bounds = this.courtOverlay.getBounds()
    const center = bounds.getCenter()
    
    const newWidthDegrees = 0.0002 * this.courtSize
    const newHeightDegrees = 0.0001 * this.courtSize
    
    const newBounds = new window.google.maps.LatLngBounds(
      new window.google.maps.LatLng(
        center.lat() - newHeightDegrees / 2,
        center.lng() - newWidthDegrees / 2
      ),
      new window.google.maps.LatLng(
        center.lat() + newHeightDegrees / 2,
        center.lng() + newWidthDegrees / 2
      )
    )
    
    this.courtOverlay.setBounds(newBounds)
    this.handleBoundsUpdate(newBounds)
  }

  private resetCourt() {
    if (this.courtOverlay) {
      this.courtOverlay.setMap(null)
      this.courtOverlay = null
    }
    
    this.hasCourtPlaced = false
    this.rotation = 0
    this.courtSize = 1.0
    this.mapCoordinates = undefined
    this.dispatchCoordinatesChange()
  }

  private dispatchCoordinatesChange() {
    let bounds: any = undefined
    
    if (this.mapCoordinates) {
      bounds = [
        [this.mapCoordinates.southWest.lat, this.mapCoordinates.southWest.lng],
        [this.mapCoordinates.northEast.lat, this.mapCoordinates.northEast.lng]
      ]
      
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

  private cleanup() {
    // Clean up map event listeners
    this.mapEventListeners.forEach(listener => {
      try {
        window.google?.maps?.event?.removeListener(listener)
      } catch (error) {
        console.warn('Error removing listener:', error)
      }
    })
    this.mapEventListeners = []
    
    // Clean up overlays
    if (this.courtOverlay) {
      this.courtOverlay.setMap(null)
      this.courtOverlay = null
    }
    
    this.existingCourtOverlays.forEach(overlay => {
      overlay.setMap(null)
    })
    this.existingCourtOverlays = []
    
    // Clear map reference
    this.map = null
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties)
    
    // Update court info
    if ((changedProperties.has('courtType') || changedProperties.has('courtName')) && this.courtOverlay) {
      this.courtOverlay.updateCourtInfo(this.courtType, this.courtName)
    }
    
    // Update coordinates
    if (changedProperties.has('mapCoordinates') && this.courtOverlay && this.mapCoordinates && window.google?.maps) {
      const bounds = new window.google.maps.LatLngBounds(
        new window.google.maps.LatLng(
          this.mapCoordinates.southWest.lat,
          this.mapCoordinates.southWest.lng
        ),
        new window.google.maps.LatLng(
          this.mapCoordinates.northEast.lat,
          this.mapCoordinates.northEast.lng
        )
      )
      
      this.rotation = this.mapCoordinates.rotation || 0
      this.courtOverlay.setBounds(bounds)
      this.courtOverlay.setRotation(this.rotation)
    }
    
    // Update existing courts
    if (changedProperties.has('existingCourts') && this.map) {
      this.showExistingCourts()
    }
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
              <schmancy-typography type="body" token="md" class="text-error-default">
                ${this.error}
              </schmancy-typography>
            </div>
          `
        )}
        
        <div id="map-container" class="w-full h-full"></div>
        
        ${when(!this.loading && !this.error,
          () => html`
            ${when(!this.hasCourtPlaced,
              () => html`
                <div class="instructions">
                  <schmancy-typography type="body" token="sm">
                    Click "Place Court" to add a court to the map
                  </schmancy-typography>
                </div>
              `
            )}
            
            <div class="controls-container">
              <button 
                @click=${this.hasCourtPlaced ? () => this.resetCourt() : () => this.placeCourt()} 
                class="control-button ${this.hasCourtPlaced ? 'danger' : 'primary'}"
              >
                ${this.hasCourtPlaced ? 'Reset Court' : 'Place Court'}
              </button>
            </div>
          `
        )}
      </schmancy-surface>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'court-map-editor-google': CourtMapEditorGoogle
  }
}
