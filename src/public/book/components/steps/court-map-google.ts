import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { BehaviorSubject, EMPTY, Subject, combineLatest, from, fromEvent, merge, of } from 'rxjs'
import { catchError, debounceTime, distinctUntilChanged, filter, finalize, map, switchMap, take, takeUntil, tap, toArray } from 'rxjs/operators'
import { Court, SportTypeEnum } from 'src/types/booking/court.types'
import { VenueAddress } from 'src/types/booking/venue.types'

type CourtAvailabilityType = 'full' | 'partial' | 'none'

// CourtAvailabilityStatus interface (from court-select component)
interface CourtAvailabilityStatus {
	courtId: string
	courtName: string
	available: boolean
	availableTimeSlots: string[]
	unavailableTimeSlots: string[]
	fullyAvailable: boolean
}


// Court overlay class for displaying courts on the map
class CourtDisplayOverlay {
	private bounds: any
	private div: HTMLDivElement | null = null
	private courtDiv: HTMLDivElement | null = null
	private markerDiv: HTMLDivElement | null = null
	private courtType: keyof typeof SportTypeEnum
	private courtName: string
	private rotation: number
	private availability: CourtAvailabilityType
	private isSelected: boolean
	private onClick: () => void
	private overlay: any
	private destroyed$ = new Subject<void>()
	private currentZoom$ = new BehaviorSubject<number>(18)
	private markerElement: HTMLElement | null = null
	private availability$ = new BehaviorSubject<CourtAvailabilityType>('full')
	private isSelected$ = new BehaviorSubject<boolean>(false)

	constructor(
		bounds: any,
		mapInstance: any,
		courtType: keyof typeof SportTypeEnum,
		courtName: string,
		rotation: number = 0,
		availability: CourtAvailabilityType = 'full',
		isSelected: boolean = false,
		onClick: () => void
	) {
		this.bounds = bounds
		this.courtType = courtType
		this.courtName = courtName
		this.rotation = rotation
		this.availability = availability
		this.isSelected = isSelected
		this.onClick = onClick
		
		// Initialize reactive state
		this.availability$.next(availability)
		this.isSelected$.next(isSelected)
		
		// Get initial zoom if map is ready
		if (mapInstance?.getZoom) {
			this.currentZoom$.next(mapInstance.getZoom())
		}
		
		this.setMap(mapInstance)
		this.setupReactiveUpdates()
	}
	
	private setupReactiveUpdates(): void {
		// React to zoom changes
		this.currentZoom$.pipe(
			distinctUntilChanged(),
			tap(() => this.updateMarkerForZoom()),
			takeUntil(this.destroyed$)
		).subscribe()
		
		// React to availability changes
		this.availability$.pipe(
			distinctUntilChanged(),
			tap(() => this.refreshOverlay()),
			takeUntil(this.destroyed$)
		).subscribe()
		
		// React to selection changes
		this.isSelected$.pipe(
			distinctUntilChanged(),
			tap(() => this.refreshOverlay()),
			takeUntil(this.destroyed$)
		).subscribe()
	}
	
	private setupInteractionHandling(element: HTMLElement): void {
		if (!element) return
		
		// Click event stream for desktop
		const click$ = fromEvent<MouseEvent>(element, 'click')
		
		// Touch event streams for mobile
		const touchStart$ = fromEvent<TouchEvent>(element, 'touchstart', { passive: true })
		const touchMove$ = fromEvent<TouchEvent>(element, 'touchmove', { passive: true })
		const touchEnd$ = fromEvent<TouchEvent>(element, 'touchend', { passive: false })
		
		// Create touch tap stream (tap = touchstart + touchend without significant movement)
		const touchTap$ = touchStart$.pipe(
			filter(e => e.touches.length === 1),
			switchMap(startEvent => {
				const startX = startEvent.touches[0].clientX
				const startY = startEvent.touches[0].clientY
				let moved = false
				
				// Track movement
				const moveTracker = touchMove$.pipe(
					tap(moveEvent => {
						if (moveEvent.touches.length === 1) {
							const deltaX = Math.abs(moveEvent.touches[0].clientX - startX)
							const deltaY = Math.abs(moveEvent.touches[0].clientY - startY)
							moved = deltaX > 10 || deltaY > 10
						}
					}),
					takeUntil(touchEnd$)
				).subscribe()
				
				return touchEnd$.pipe(
					take(1),
					filter(() => !moved),
					tap(() => moveTracker.unsubscribe())
				)
			})
		)
		
		// Merge all interaction events
		merge(click$, touchTap$).pipe(
			tap(e => {
				e.preventDefault()
				e.stopPropagation()
				console.log('Court image clicked:', this.courtName)
				console.log('Calling onClick callback')
				this.onClick()
			}),
			takeUntil(this.destroyed$)
		).subscribe()
	}

	onAdd() {
		// Create wrapper div that won't rotate
		this.div = document.createElement('div')
		this.div.style.position = 'absolute'
		this.div.style.pointerEvents = 'none' // Disable pointer events on container
		this.div.style.userSelect = 'none'
		// Fix for mobile Safari
		;(this.div.style as any).webkitUserSelect = 'none'
		;(this.div.style as any).webkitTapHighlightColor = 'transparent'
		
		// Don't setup interactions here - will be on the image itself
		
		// Create inner container for rotating court
		this.courtDiv = document.createElement('div')
		this.courtDiv.style.cssText = 'width: 100%; height: 100%; position: absolute; pointer-events: none;'
		
		// Create court SVG container
		const svgContainer = this.createSvgContainer()
		this.courtDiv.appendChild(svgContainer)
		this.div.appendChild(this.courtDiv)
		
		// Create marker/label container that stays on top and doesn't rotate
		this.markerDiv = document.createElement('div')
		this.markerDiv.style.cssText = 'position: absolute; width: 100%; height: 100%; pointer-events: none; z-index: 1000;'
		const marker = this.createMarkerElement()
		this.markerDiv.appendChild(marker)
		this.markerElement = marker
		this.div.appendChild(this.markerDiv)
		
		// Add to map pane - use overlayMouseTarget for better interaction handling
		const panes = this.getPanes()
		if (panes?.overlayMouseTarget) {
			panes.overlayMouseTarget.appendChild(this.div)
		} else if (panes?.overlayLayer) {
			panes.overlayLayer.appendChild(this.div)
		}
	}

	private createSvgContainer(): HTMLDivElement {
		const container = document.createElement('div')
		container.style.cssText = 'width: 100%; height: 100%; position: relative; pointer-events: none;'
		
		// Add court SVG image
		const img = this.createCourtImage()
		container.appendChild(img)
		
		// // Add info panel
		// const infoPanel = this.createInfoPanel()
		// container.appendChild(infoPanel)
		
		// // Setup hover interactions on the image itself
		// this.setupHoverInteractions(img, infoPanel)
		
		// Setup click/touch interactions on the image
		this.setupInteractionHandling(img)
		
		return container
	}
	
	private createCourtImage(): HTMLImageElement {
		const styles = this.getOverlayStyles()
		const img = document.createElement('img')
		img.src = this.getSvgPath(this.courtType)
		// Apply opacity and enhanced shadow for selected courts
		const shadowIntensity = this.isSelected ? '0.5' : '0.3'
		img.style.cssText = `width: 100%; height: 100%; object-fit: contain; opacity: ${styles.opacity}; filter: drop-shadow(0 2px 4px rgba(0,0,0,${shadowIntensity})); pointer-events: auto; cursor: pointer;`
		img.alt = `${String(this.courtType)} court`
		img.draggable = false // Prevent image dragging on mobile
		// Fix for mobile Safari
		;(img.style as any).webkitUserSelect = 'none'
		;(img.style as any).webkitTapHighlightColor = 'transparent'
		return img
	}
	
	private createMarkerElement(): HTMLDivElement {
		const marker = document.createElement('div')
		marker.className = 'court-marker'
		
		const config = this.getMarkerConfig()
		if (config.isPin) {
			this.applyPinStyles(marker, config)
		} else {
			this.applyLabelStyles(marker, config)
		}
		
		return marker
	}
	
	private applyPinStyles(marker: HTMLElement, config: any): void {
		marker.innerHTML = this.createPinSvg(config.pinColor)
		marker.style.cssText = `
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -100%) rotate(0deg) !important;
			transform-origin: center bottom;
			width: ${config.size}px;
			height: ${config.size * 1.5}px;
			pointer-events: none;
			user-select: none;
			z-index: 1000;
			opacity: ${config.opacity};
		`
	}
	
	private applyLabelStyles(marker: HTMLElement, config: any): void {
		const courtNumber = this.extractCourtNumber()
		marker.textContent = courtNumber
		
		// Enhanced styles for selected courts
		const isSelectedStyles = this.isSelected ? `
			background-color: #000000;
			color: #ffffff;
			padding: 4px 8px;
			border-radius: 4px;
			box-shadow: 0 2px 4px rgba(0,0,0,0.3);
		` : `
			color: #000000;
			text-shadow: 0 0 3px rgba(255,255,255,0.8), 0 0 6px rgba(255,255,255,0.6);
		`
		
		marker.style.cssText = `
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			font-weight: bold;
			font-size: ${config.fontSize}px;
			${isSelectedStyles}
			pointer-events: none;
			user-select: none;
			z-index: ${this.isSelected ? 100 : 10};
			opacity: ${this.isSelected ? '1' : config.opacity};
		`
	}
	
	private extractCourtNumber(): string {
		return this.courtName.match(/\d+/)?.[0] || this.courtName.charAt(0).toUpperCase()
	}
	
	private createInfoPanel(): HTMLDivElement {
		const panel = document.createElement('div')
		panel.style.cssText = `
			position: absolute;
			bottom: 10px;
			left: 50%;
			transform: translateX(-50%) translateY(10px);
			background: rgba(0, 0, 0, 0.9);
			color: white;
			padding: 8px 16px;
			border-radius: 6px;
			font-size: 14px;
			font-weight: 500;
			white-space: nowrap;
			opacity: 0;
			pointer-events: none;
			transition: all 0.3s ease;
			z-index: 1000;
		`
		
		// React to availability changes for text updates
		combineLatest([
			this.availability$.pipe(map(() => this.getAvailabilityText())),
			of(this.courtName)
		]).pipe(
			map(([availText, name]) => `
				<div style="text-align: center;">
					<div style="font-weight: bold; margin-bottom: 4px;">${name}</div>
					<div style="font-size: 12px; opacity: 0.8;">${availText}</div>
				</div>
			`),
			tap(html => panel.innerHTML = html),
			takeUntil(this.destroyed$)
		).subscribe()
		
		return panel
	}

	private getOverlayStyles() {
		// Set opacity based on availability
		let opacity = '1' // Default to full visibility
		
		// Apply reduced opacity for unavailable courts (similar to court-select step)
		if (this.availability === 'none') {
			opacity = '0.5' // 50% opacity for unavailable courts
		} else if (this.availability === 'partial') {
			opacity = '0.9' // 90% opacity for partially available courts
		}
		
		// Selected courts always have full opacity
		if (this.isSelected) {
			opacity = '1'
		}
		
		const styles = {
			opacity: opacity,
			backgroundColor: 'rgba(255, 255, 255, 0.9)',  // White background like editor
			textColor: '#1f2937',  // Dark text
			border: 'none',
			scale: '1'
		}
		
		return styles
	}

	public draw() {
		if (!this.div) return
		
		const projection = this.getProjection()
		if (!projection || !projection.fromLatLngToDivPixel) return
		
		try {
			const sw = projection.fromLatLngToDivPixel(this.bounds.getSouthWest())
			const ne = projection.fromLatLngToDivPixel(this.bounds.getNorthEast())
			
			if (sw && ne && typeof sw.x === 'number' && typeof ne.x === 'number') {
				const styles = this.getOverlayStyles()
				const scale = styles.scale
				
				// Calculate dimensions
				const width = Math.abs(ne.x - sw.x)
				const height = Math.abs(sw.y - ne.y)
				
				// Apply scale adjustment for selected courts
				const scaledWidth = width * parseFloat(scale)
				const scaledHeight = height * parseFloat(scale)
				
				// Center the scaled court
				const centerX = (sw.x + ne.x) / 2
				const centerY = (sw.y + ne.y) / 2
				
				this.div.style.left = `${Math.round(centerX - scaledWidth / 2)}px`
				this.div.style.top = `${Math.round(centerY - scaledHeight / 2)}px`
				this.div.style.width = `${Math.round(scaledWidth)}px`
				this.div.style.height = `${Math.round(scaledHeight)}px`
				
				// Apply rotation only to courtDiv
				if (this.courtDiv) {
					if (this.rotation !== 0) {
						this.courtDiv.style.transform = `rotate(${this.rotation}deg)`
						this.courtDiv.style.transformOrigin = 'center center'
					}
				}
			}
		} catch (error) {
			console.warn('Error drawing court overlay:', error)
		}
	}

	onRemove() {
		this.destroyed$.next()
		this.destroyed$.complete()
		
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
		this.overlay = new (window as any).google.maps.OverlayView()
		this.overlay.onAdd = () => this.onAdd()
		this.overlay.draw = () => this.draw()
		this.overlay.onRemove = () => this.onRemove()
		this.overlay.setMap(mapInstance)
	}

	private getSvgPath(courtType: keyof typeof SportTypeEnum): string {
		const paths: Record<string, string> = {
			padel: '/svg/padel-court.svg',
			volleyball: '/svg/volleyball-court.svg',
			pickleball: '/svg/pickleball-court.svg'
		}
		return paths[String(courtType)] || paths.pickleball
	}
	
	private getAvailabilityText(): string {
		const textMap: Record<CourtAvailabilityType, string> = {
			'full': 'Available',
			'partial': 'Limited Availability',
			'none': 'Not Available'
		}
		return textMap[this.availability] || 'Not Available'
	}
	
	private getMarkerSize(): { size: number; fontSize: number; position: number; opacity: string } {
		const currentZoom = this.currentZoom$.value
		
		// Zoom level to scale mapping
		const scaleMap = new Map<number, { scale: number; opacity: string }>([
			[20, { scale: 1.2, opacity: '1' }],
			[19, { scale: 1, opacity: '1' }],
			[18, { scale: 0.85, opacity: '1' }],
			[17, { scale: 0.7, opacity: '1' }],
			[16, { scale: 0.55, opacity: '1' }],
			[15, { scale: 0.4, opacity: '0.8' }],
			[14, { scale: 0.3, opacity: '0.6' }]
		])
		
		// Find appropriate scale based on zoom level
		let scale = 0.2
		let opacity = '0'
		
		for (const [zoomLevel, config] of scaleMap) {
			if (currentZoom >= zoomLevel) {
				scale = config.scale
				opacity = config.opacity
				break
			}
		}
		
		const baseSize = 28
		const baseFontSize = 18  // Increased base font size for better visibility
		const basePosition = 10
		
		return {
			size: Math.round(baseSize * scale),
			fontSize: Math.round(baseFontSize * scale),
			position: Math.round(basePosition * scale * 0.5),
			opacity: opacity
		}
	}
	
	// Get marker configuration based on zoom level
	private getMarkerConfig(): { isPin: boolean; size: number; fontSize: number; opacity: string; pinColor?: string } {
		const markerSize = this.getMarkerSize()
		
		// Always use labels, never pins
		return {
			isPin: false,
			size: 0, // Not used for labels
			fontSize: markerSize.fontSize,
			opacity: markerSize.opacity
		}
	}
	
	// Create SVG for pin marker
	private createPinSvg(color: string): string {
		return `
			<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;">
				<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" 
					fill="${color}" 
					stroke="white" 
					stroke-width="1"/>
				<circle cx="12" cy="9" r="2.5" fill="white"/>
			</svg>
		`
	}
	
	// Update zoom level and resize marker
	updateZoom(zoom: number): void {
		this.currentZoom$.next(zoom)
	}
	
	private updateMarkerForZoom(): void {
		if (!this.markerElement || !this.div) return
		
		of(this.getMarkerConfig()).pipe(
			tap(config => {
				if (config.isPin) {
					this.transitionToPin(config)
				} else {
					this.transitionToLabel(config)
				}
			}),
			take(1)
		).subscribe()
	}
	
	private transitionToPin(config: any): void {
		if (!this.markerElement) return
		
		this.markerElement.innerHTML = this.createPinSvg(config.pinColor!)
		this.markerElement.style.setProperty('width', `${config.size}px`)
		this.markerElement.style.setProperty('height', `${config.size * 1.5}px`)
		this.markerElement.style.setProperty('top', '50%')
		this.markerElement.style.setProperty('left', '50%')
		this.markerElement.style.setProperty('transform', 'translate(-50%, -100%)')
		this.markerElement.style.setProperty('opacity', config.opacity)
		// Remove circle-specific styles
		this.markerElement.style.removeProperty('background')
		this.markerElement.style.removeProperty('border-radius')
		this.markerElement.style.removeProperty('font-size')
	}
	
	private transitionToLabel(config: any): void {
		if (!this.markerElement) return
		
		const courtNumber = this.extractCourtNumber()
		this.markerElement.innerHTML = ''
		this.markerElement.textContent = courtNumber
		
		// Apply label styles
		this.markerElement.style.setProperty('position', 'absolute')
		this.markerElement.style.setProperty('top', '50%')
		this.markerElement.style.setProperty('left', '50%')
		this.markerElement.style.setProperty('transform', 'translate(-50%, -50%)')
		this.markerElement.style.setProperty('font-weight', 'bold')
		this.markerElement.style.setProperty('font-size', `${config.fontSize}px`)
		this.markerElement.style.setProperty('color', '#000000')
		this.markerElement.style.setProperty('text-shadow', '0 0 3px rgba(255,255,255,0.8), 0 0 6px rgba(255,255,255,0.6)')
		this.markerElement.style.setProperty('opacity', config.opacity)
		// Remove circle-specific styles
		this.markerElement.style.removeProperty('width')
		this.markerElement.style.removeProperty('height')
		this.markerElement.style.removeProperty('background')
		this.markerElement.style.removeProperty('border-radius')
	}

	// Helper methods for Google Maps integration
	getPanes(): any {
		return this.overlay?.getPanes() || {}
	}

	getProjection(): any {
		return this.overlay?.getProjection() || {}
	}
	
	// Update methods
	updateAvailability(availability: CourtAvailabilityType) {
		this.availability = availability
		this.availability$.next(availability)
	}
	
	updateSelection(isSelected: boolean) {
		this.isSelected = isSelected
		this.isSelected$.next(isSelected)
	}
	
	private refreshOverlay(): void {
		if (!this.div || !this.courtDiv) return
		
		// Re-create the SVG container with new styles
		this.courtDiv.innerHTML = ''
		const svgContainer = this.createSvgContainer()
		this.courtDiv.appendChild(svgContainer)
		
		// Update marker/label based on selection state
		if (this.markerDiv && this.markerElement) {
			// Update existing marker/label
			const config = this.getMarkerConfig()
			if (config.isPin) {
				this.applyPinStyles(this.markerElement, config)
			} else {
				this.applyLabelStyles(this.markerElement, config)
			}
		} else if (!this.markerDiv) {
			// Create marker/label if it doesn't exist
			this.markerDiv = document.createElement('div')
			this.markerDiv.style.cssText = 'position: absolute; width: 100%; height: 100%; pointer-events: none; z-index: 1000;'
			const marker = this.createMarkerElement()
			this.markerDiv.appendChild(marker)
			this.markerElement = marker
			this.div.appendChild(this.markerDiv)
		}
		
		// Force redraw to apply scale changes
		this.draw()
	}
}

/**
 * Court Map Component using Google Maps
 * Shows courts on a real map with their actual positions using SVG overlays
 */
@customElement('court-map-google')
export class CourtMapGoogle extends $LitElement(css`
	:host {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 400px;
		position: relative;
		overflow: hidden;
		border-radius: 12px;
	}

	.map-container {
		width: 100%;
		height: 100%;
		min-height: 400px;
		position: relative;
	}

	.map-legend {
		position: absolute;
		bottom: 16px;
		right: 16px;
		background-color: white;
		padding: 12px 16px;
		border-radius: 8px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		z-index: 1000;
		font-size: 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.legend-dot {
		width: 16px;
		height: 16px;
		border-radius: 3px;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
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
`) {
	@property({ type: Array }) courts: Court[] = []
	@property({ type: String }) selectedCourtId: string = ''
	@property({ type: Object }) courtAvailability: Map<string, CourtAvailabilityStatus> = new Map()
	@property({ type: Object }) venueAddress?: VenueAddress
	@property({ type: String }) venueName: string = ''
	@property({ type: String }) apiKey?: string
	@property({ type: Number }) zoom = 18

	@state() private mapLoaded = false
	@state() private loading = true
	@state() private error: string | null = null

	@query('#google-map-container') mapContainer!: HTMLDivElement

	private map: any
	private courtOverlays: Map<string, CourtDisplayOverlay> = new Map()
	
	// RxJS subjects for reactive state management
	private mapLoaded$ = new BehaviorSubject<boolean>(false)
	private courts$ = new BehaviorSubject<Court[]>([])
	private selectedCourtId$ = new BehaviorSubject<string>('')
	private courtAvailability$ = new BehaviorSubject<Map<string, CourtAvailabilityStatus>>(new Map())
	private destroyed$ = new Subject<void>()

	connectedCallback() {
		super.connectedCallback()
		
		// Initialize subjects with current values
		this.courts$.next(this.courts)
		this.selectedCourtId$.next(this.selectedCourtId)
		this.courtAvailability$.next(this.courtAvailability)
		
		// Main initialization pipeline
		this.initializeMapPipeline()
		
		// Setup reactive subscriptions
		this.setupReactiveSubscriptions()
	}
	
	private initializeMapPipeline(): void {
		of(true).pipe(
			tap(() => this.loading = true),
			tap(() => this.courts$.next(this.courts)),
			switchMap(() => this.loadGoogleMapsScript()),
			tap(() => this.mapLoaded$.next(true)),
			switchMap(() => this.waitForMapContainer()),
			switchMap(() => this.initializeMap()),
			catchError(err => this.handleMapError(err)),
			finalize(() => this.loading = false),
			takeUntil(this.destroyed$)
		).subscribe()
	}
	
	private setupReactiveSubscriptions(): void {
		// React to courts changes
		this.courts$.pipe(
			distinctUntilChanged(),
			filter(() => this.mapLoaded),
			debounceTime(300),
			tap(() => this.updateCourts()),
			takeUntil(this.destroyed$)
		).subscribe()
		
		// React to selection and availability changes - no debounce for immediate updates
		combineLatest([
			this.selectedCourtId$,
			this.courtAvailability$
		]).pipe(
			filter(() => this.mapLoaded),
			tap(() => {
				this.updateCourtOverlays()
			}),
			takeUntil(this.destroyed$)
		).subscribe()
	}
	
	private handleMapError(err: any): typeof EMPTY {
		console.error('Map initialization error:', err)
		this.error = err.message || 'Failed to load map'
		return EMPTY
	}
	
	updated(changedProperties: Map<string | number | symbol, unknown>) {
		super.updated(changedProperties)
		
		// Handle courts prop changes
		if (changedProperties.has('courts')) {
			this.courts$.next(this.courts)
		}
		
		// Handle selectedCourtId changes
		if (changedProperties.has('selectedCourtId')) {
			this.selectedCourtId$.next(this.selectedCourtId)
		}
		
		// Handle courtAvailability changes
		if (changedProperties.has('courtAvailability')) {
			this.courtAvailability$.next(this.courtAvailability)
		}
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		this.destroyed$.next()
		this.destroyed$.complete()
		
		// Clean up map resources
		this.courtOverlays.forEach(overlay => {
			overlay.setMap(null)
		})
		this.courtOverlays.clear()
		if (this.map) {
			this.map = null
		}
	}

	/**
	 * Load Google Maps script using RxJS
	 */
	private loadGoogleMapsScript() {
		return of(window.google?.maps).pipe(
			switchMap(mapsLoaded => {
				if (mapsLoaded) {
					return of(true).pipe(tap(() => this.mapLoaded = true))
				}
				return this.loadMapsScriptFromDOM()
			})
		)
	}
	
	private loadMapsScriptFromDOM() {
		const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
		
		return of(existingScript).pipe(
			switchMap(script => {
				if (script) {
					return fromEvent(script, 'load').pipe(
						take(1),
						tap(() => this.mapLoaded = true),
						map(() => true)
					)
				}
				return this.createAndLoadMapsScript()
			})
		)
	}
	
	private createAndLoadMapsScript() {
		return of(this.apiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY).pipe(
			tap(apiKey => {
				if (!apiKey) throw new Error('Google Maps API key not configured')
			}),
			map(apiKey => this.createMapsScriptElement(apiKey)),
			switchMap(script => this.loadScriptElement(script))
		)
	}
	
	private createMapsScriptElement(apiKey: string): HTMLScriptElement {
		const script = document.createElement('script')
		script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap`
		script.async = true
		script.defer = true
		return script
	}
	
	private loadScriptElement(script: HTMLScriptElement) {
		return from(new Promise<boolean>((resolve, reject) => {
			window.initMap = () => {
				this.mapLoaded = true
				resolve(true)
			}
			script.onerror = () => reject(new Error('Failed to load Google Maps'))
			document.head.appendChild(script)
		}))
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
	 * Initialize the map with venue location
	 */
	private initializeMap() {
		return of(window.google?.maps).pipe(
			tap(maps => {
				if (!maps) throw new Error('Google Maps not loaded')
			}),
			switchMap(() => this.calculateMapCenter()),
			tap(center => this.createMap(center.lat, center.lng))
		)
	}
	
	private calculateMapCenter() {
		return combineLatest([
			of(this.venueAddress),
			of(this.courts)
		]).pipe(
			map(([address, courts]) => {
				// Priority 1: Venue address coordinates
				if (address?.coordinates) {
					return { lat: address.coordinates.lat, lng: address.coordinates.lng }
				}
				
				// Priority 2: First court with coordinates
				const courtWithCoords = courts.find(c => c.mapCoordinates)
				if (courtWithCoords?.mapCoordinates) {
					const coords = courtWithCoords.mapCoordinates
					return {
						lat: (coords.southWest.lat + coords.northEast.lat) / 2,
						lng: (coords.southWest.lng + coords.northEast.lng) / 2
					}
				}
				
				// Default: Berlin
				return { lat: 52.5200, lng: 13.4050 }
			})
		)
	}

	/**
	 * Create the map with given coordinates
	 */
	private createMap(lat: number, lng: number) {
		of({ lat, lng }).pipe(
			filter(() => !!this.mapContainer && !!window.google),
			map(coords => ({
				center: new (window as any).google.maps.LatLng(coords.lat, coords.lng),
				options: this.getMapOptions()
			})),
			tap(({ center, options }) => {
				// Create map instance
				this.map = new (window as any).google.maps.Map(
					this.mapContainer, 
					{ ...options, center }
				)
			}),
			tap(() => this.setupMapEventListeners()),
			tap(() => this.updateCourts()),
			take(1)
		).subscribe()
	}
	
	private getMapOptions() {
		return {
			zoom: this.zoom,
			mapTypeId: 'satellite',
			tilt: 0,
			disableDefaultUI: false,
			zoomControl: true,
			mapTypeControl: true,
			mapTypeControlOptions: {
				mapTypeIds: ['roadmap', 'satellite'],
				style: (window as any).google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
				position: (window as any).google.maps.ControlPosition.TOP_RIGHT
			},
			streetViewControl: false,
			fullscreenControl: true,
			rotateControl: false,
			scaleControl: true,
			styles: [
				{
					featureType: 'poi',
					elementType: 'labels',
					stylers: [{ visibility: 'off' }]
				}
			]
		}
	}
	
	private setupMapEventListeners() {
		if (!this.map || !window.google?.maps) return
		
		// Create a subject for zoom changes
		const zoomChanged$ = new Subject<number>()
		
		// Listen for zoom changes
		;(window as any).google.maps.event.addListener(this.map, 'zoom_changed', () => {
			zoomChanged$.next(this.map.getZoom())
		})
		
		// Handle zoom changes reactively
		zoomChanged$.pipe(
			distinctUntilChanged(),
			tap(zoom => this.updateOverlaysZoom(zoom)),
			takeUntil(this.destroyed$)
		).subscribe()
	}
	
	private updateOverlaysZoom(zoom: number) {
		this.courtOverlays.forEach(overlay => overlay.updateZoom(zoom))
	}

	/**
	 * Update court overlays on the map
	 */
	private updateCourts() {
		of(this.map).pipe(
			filter(map => !!map && !!window.google?.maps),
			tap(() => this.clearExistingOverlays()),
			switchMap(() => this.createCourtOverlays()),
			tap(({ bounds, hasCoordinates }) => {
				if (hasCoordinates) {
					this.fitMapToBounds(bounds)
				}
			}),
			take(1)
		).subscribe()
	}
	
	private clearExistingOverlays(): void {
		this.courtOverlays.forEach(overlay => overlay.setMap(null))
		this.courtOverlays.clear()
	}
	
	private createCourtOverlays() {
		const bounds = new (window as any).google.maps.LatLngBounds()
		
		return from(this.courts).pipe(
			filter(court => !!court.mapCoordinates),
			map(court => this.createCourtOverlay(court, bounds)),
			tap(overlay => {
				if (overlay) {
					overlay.updateZoom(this.map.getZoom())
					this.courtOverlays.set(overlay.courtId, overlay)
				}
			}),
			toArray(),
			map(overlays => ({
				bounds,
				hasCoordinates: overlays.length > 0
			}))
		)
	}
	
	private createCourtOverlay(court: Court, bounds: any): any {
		const coords = court.mapCoordinates!
		
		// Create bounds for this court
		const courtBounds = new (window as any).google.maps.LatLngBounds(
			new (window as any).google.maps.LatLng(coords.southWest.lat, coords.southWest.lng),
			new (window as any).google.maps.LatLng(coords.northEast.lat, coords.northEast.lng)
		)
		
		// Extend map bounds
		bounds.extend(courtBounds.getSouthWest())
		bounds.extend(courtBounds.getNorthEast())
		
		// Create overlay
		const overlay = new CourtDisplayOverlay(
			courtBounds,
			this.map,
			(court.sportTypes?.[0] || 'pickleball') as keyof typeof SportTypeEnum,
			court.name,
			coords.rotation || 0,
			this.getCourtAvailabilityStatus(court.id),
			this.selectedCourtId === court.id,
			() => this.handleCourtSelect(court)
		)
		
		// Add court ID for reference
		;(overlay as any).courtId = court.id
		
		return overlay
	}
	
	private fitMapToBounds(bounds: any): void {
		this.map.fitBounds(bounds)
		
		// Create a subject for idle event
		const mapIdle$ = new Subject<void>()
		
		const listener = (window as any).google.maps.event.addListener(this.map, 'idle', () => {
			mapIdle$.next()
		})
		
		// Adjust zoom if too close
		mapIdle$.pipe(
			take(1),
			tap(() => {
				if (this.map.getZoom() > 20) {
					this.map.setZoom(20)
				}
				(window as any).google.maps.event.removeListener(listener)
			})
		).subscribe()
	}

	/**
	 * Update overlay states without recreating them
	 */
	private updateCourtOverlays() {
		this.courtOverlays.forEach((overlay, courtId) => {
			const availabilityStatus = this.getCourtAvailabilityStatus(courtId)
			const isSelected = this.selectedCourtId === courtId
			
			overlay.updateAvailability(availabilityStatus)
			overlay.updateSelection(isSelected)
		})
	}

	/**
	 * Get court availability status
	 */
	private getCourtAvailabilityStatus(courtId: string): CourtAvailabilityType {
		const status = this.courtAvailability.get(courtId)
		
		if (!status) return 'none'
		if (status.fullyAvailable) return 'full'
		if (status.available) return 'partial'
		return 'none'
	}

	/**
	 * Handle court selection
	 */
	private handleCourtSelect(court: Court): void {
		// Dispatch event to parent - let the parent component handle availability checks
		// and all selection logic including confirmation dialogs
		const event = new CustomEvent('court-select', {
			detail: { court },
			bubbles: true,
			composed: true,
		})
		console.log('Dispatching court-select event')
		this.dispatchEvent(event)
	}

	render() {
		return html`
			<schmancy-surface type="container" rounded="all" class="h-full w-full relative overflow-hidden">
				${this.renderLoadingState()}
				${this.renderErrorState()}
				${this.renderMapContainer()}
			</schmancy-surface>
		`
	}
	
	private renderLoadingState() {
		return when(this.loading,
			() => html`
				<div class="absolute inset-0 flex items-center justify-center bg-surface-low">
					<schmancy-circular-progress size="md"></schmancy-circular-progress>
				</div>
			`
		)
	}
	
	private renderErrorState() {
		return when(this.error,
			() => html`
				<div class="flex flex-col items-center justify-center h-full p-6 text-center">
					<schmancy-icon class="text-error-default mb-4">error_outline</schmancy-icon>
					<schmancy-typography type="body" token="md" class="text-error-default">
						${this.error}
					</schmancy-typography>
				</div>
			`
		)
	}
	
	private renderMapContainer() {
		return html`<div id="google-map-container" class="map-container"></div>`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'court-map-google': CourtMapGoogle
	}
}
