import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html, PropertyValues } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { CourtPreferences } from 'src/bookingServices/court-assignment.service'
import { Booking, bookingContext } from '../context'

// Context key for storing court preferences
const PREFERENCES_KEY = 'courtPreferences'

/**
 * Court preferences selection step with smooth transitions
 * Allows users to set their preferences for court type, location, etc.
 */
@customElement('court-preferences-step')
export class CourtPreferencesStep extends $LitElement(css`
	.transition-height {
		transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.cross-fade-container {
		position: relative;
		width: 100%;
	}

	.fade-view {
		transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.absolute-position {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
	}
`) {
	@property({ type: Object }) preferences: CourtPreferences = {}
	@property({ type: Boolean }) active: boolean = false
	@property({ type: Boolean }) hidden: boolean = false

	// Data binding to booking context
	@select(bookingContext) booking!: Booking

	// DOM references for animation targets
	@query('.active-view') activeView!: HTMLElement
	@query('.compact-view') compactView!: HTMLElement
	@query('.cross-fade-container') container!: HTMLElement

	// Local state for preferences
	@state() private localPreferences: CourtPreferences = {}
	@state() private contentHeight: number = 0
	@state() private previousActive: boolean = false
	@state() private animating: boolean = false

	// Cached heights for smooth transitions
	private _activeHeight: number = 0
	private _compactHeight: number = 0
	private _resizeObserver: ResizeObserver | null = null

	connectedCallback() {
		super.connectedCallback()

		// Initialize local preferences from provided preferences or get from sessionStorage
		if (Object.keys(this.preferences).length > 0) {
			this.localPreferences = { ...this.preferences }
		} else {
			this.loadPreferencesFromStorage()
		}

		// Track previous active state
		this.previousActive = this.active
	}

	disconnectedCallback() {
		super.disconnectedCallback()

		// Clean up resize observer
		if (this._resizeObserver) {
			this._resizeObserver.disconnect()
			this._resizeObserver = null
		}
	}

	protected firstUpdated(_changedProperties: PropertyValues) {
		super.firstUpdated(_changedProperties)

		// If we have preferences from the property, save them to storage
		if (Object.keys(this.preferences).length > 0) {
			this.savePreferencesToStorage(this.preferences)
		}

		// Set up resize observer
		this._setupResizeObserver()

		// Initial measurement of heights
		requestAnimationFrame(() => {
			this._measureHeights()
			this._setupInitialState()
		})
	}

	protected updated(changedProperties: PropertyValues) {
		super.updated(changedProperties)

		// Check if preferences property changed
		if (
			changedProperties.has('preferences') &&
			JSON.stringify(this.preferences) !== JSON.stringify(changedProperties.get('preferences'))
		) {
			this.localPreferences = { ...this.preferences }
			this.savePreferencesToStorage(this.localPreferences)
		}

		// Handle transition when active state changes
		if (changedProperties.has('active') && this.previousActive !== this.active) {
			this.previousActive = this.active

			// If heights are measured, animate the transition
			if (this._activeHeight > 0 && this._compactHeight > 0 && !this.animating) {
				this._animateTransition()
			}
		}
	}

	/**
	 * Set up resize observer for responsive height measurements
	 */
	private _setupResizeObserver(): void {
		if (typeof ResizeObserver !== 'undefined') {
			this._resizeObserver = new ResizeObserver(() => {
				if (!this.animating) {
					this._measureHeights()
				}
			})

			this.updateComplete.then(() => {
				if (this.container && this._resizeObserver) {
					this._resizeObserver.observe(this.container)
				}
			})
		}
	}

	/**
	 * Measure heights of views for smooth transitions
	 */
	private _measureHeights(): void {
		if (this.activeView && this.compactView) {
			// Save original display settings
			const activeDisplay = this.activeView.style.display || 'block'
			const compactDisplay = this.compactView.style.display || 'block'
			const activePosition = this.activeView.style.position || 'static'
			const compactPosition = this.compactView.style.position || 'static'

			// Measure active view height
			this.activeView.style.display = 'block'
			this.activeView.style.position = 'static'
			this.compactView.style.display = 'none'
			this._activeHeight = this.activeView.scrollHeight

			// Measure compact view height
			this.activeView.style.display = 'none'
			this.compactView.style.display = 'block'
			this.compactView.style.position = 'static'
			this._compactHeight = this.compactView.scrollHeight

			// Restore original display settings
			this.activeView.style.display = activeDisplay
			this.activeView.style.position = activePosition
			this.compactView.style.display = compactDisplay
			this.compactView.style.position = compactPosition

			// Set initial content height based on active state
			this.contentHeight = this.active ? this._activeHeight : this._compactHeight
		}
	}

	/**
	 * Set up initial display state based on active property
	 */
	private _setupInitialState(): void {
		if (this.activeView && this.compactView) {
			// Initially show appropriate view, hide the other
			if (this.active) {
				this.activeView.style.display = 'block'
				this.activeView.style.opacity = '1'
				this.compactView.style.display = 'none'
				this.compactView.style.opacity = '0'
			} else {
				this.activeView.style.display = 'none'
				this.activeView.style.opacity = '0'
				this.compactView.style.display = 'block'
				this.compactView.style.opacity = '1'
			}

			// Set initial content height
			this.contentHeight = this.active ? this._activeHeight : this._compactHeight
			this.requestUpdate()
		}
	}

	/**
	 * Animate cross-fade transition between views
	 */
	private _animateTransition(): void {
		if (!this.activeView || !this.compactView || !this.container) return

		// Set transition flag
		this.animating = true

		// Set target height
		this.contentHeight = this.active ? this._activeHeight : this._compactHeight

		// Both views start as absolute positioned during transition
		this.activeView.style.position = 'absolute'
		this.compactView.style.position = 'absolute'
		this.activeView.style.width = '100%'
		this.compactView.style.width = '100%'
		this.activeView.style.top = '0'
		this.compactView.style.top = '0'

		// Define animation parameters
		const fadeInKeyframes = [{ opacity: 0 }, { opacity: 1 }]
		const fadeOutKeyframes = [{ opacity: 1 }, { opacity: 0 }]
		const animOptions = {
			duration: 300,
			easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
			fill: 'forwards' as FillMode,
		}

		if (this.active) {
			// Fade in active view
			this.activeView.style.display = 'block'
			const activeAnim = this.activeView.animate(fadeInKeyframes, animOptions)

			// Fade out compact view
			this.compactView.style.display = 'block'
			this.compactView.animate(fadeOutKeyframes, animOptions)

			// When animations complete, update final state
			activeAnim.onfinish = () => {
				this.activeView.style.position = 'static'
				this.activeView.style.opacity = '1'
				this.compactView.style.display = 'none'
				this.animating = false
			}
		} else {
			// Fade in compact view
			this.compactView.style.display = 'block'
			const compactAnim = this.compactView.animate(fadeInKeyframes, animOptions)

			// Fade out active view
			this.activeView.style.display = 'block'
			this.activeView.animate(fadeOutKeyframes, animOptions)

			// When animations complete, update final state
			compactAnim.onfinish = () => {
				this.compactView.style.position = 'static'
				this.compactView.style.opacity = '1'
				this.activeView.style.display = 'none'
				this.animating = false
			}
		}
	}

	/**
	 * Load court preferences from session storage
	 */
	private loadPreferencesFromStorage() {
		try {
			const stored = sessionStorage.getItem(PREFERENCES_KEY)
			if (stored) {
				this.localPreferences = JSON.parse(stored)

				// Update the property if we loaded from storage
				if (
					Object.keys(this.localPreferences).length > 0 &&
					JSON.stringify(this.localPreferences) !== JSON.stringify(this.preferences)
				) {
					// We need to notify the parent component to sync the property
					this.dispatchEvent(
						new CustomEvent('change', {
							detail: this.localPreferences,
							bubbles: true,
						}),
					)
				}
			}
		} catch (error) {
			console.error('Error loading court preferences from storage:', error)
		}
	}

	/**
	 * Save court preferences to session storage
	 */
	private savePreferencesToStorage(preferences: CourtPreferences) {
		try {
			sessionStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
		} catch (error) {
			console.error('Error saving court preferences to storage:', error)
		}
	}

	/**
	 * Event to notify parent when preferences change
	 */
	private updatePreferences(updates: Partial<CourtPreferences>) {
		const newPreferences = {
			...this.localPreferences,
			...updates,
		}

		// Update local state
		this.localPreferences = newPreferences

		// Save to storage
		this.savePreferencesToStorage(newPreferences)

		// Add subtle animation to selected option
		this._animateSelectedOption(updates)

		// Notify parent component
		this.dispatchEvent(
			new CustomEvent('change', {
				detail: newPreferences,
				bubbles: true,
			}),
		)
	}

	/**
	 * Add subtle animation to selected option
	 */
	private _animateSelectedOption(updates: Partial<CourtPreferences>): void {
		// Find the selected option element
		setTimeout(() => {
			let selector = ''
			if (updates.preferIndoor) {
				selector = '.indoor-option'
			} else if (updates.preferOutdoor) {
				selector = '.outdoor-option'
			}

			if (selector) {
				const element = this.shadowRoot?.querySelector(selector)
				if (element instanceof HTMLElement) {
					// Apply pulse animation
					element.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }], {
						duration: 400,
						easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
					})
				}
			}
		}, 0)
	}

	render() {
		if (this.hidden) return html``

		// Create container style with animated height
		const containerStyle = {
			height: `${this.contentHeight}px`,
			overflow: 'hidden',
		}

		// Top-level container classes
		const containerClasses = {
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'shadow-xs': true,
			'transition-all': true,
			'duration-300': true,
			'overflow-hidden': true,
		}

		return html`
			<div class=${classMap(containerClasses)}>
				<div class="cross-fade-container transition-height " style=${styleMap(containerStyle)}>
					<!-- Compact View -->
					<div class="compact-view fade-view px-2 py-3">
						<div class="flex justify-between items-center">
							<schmancy-typography type="title" token="sm">Court Preferences</schmancy-typography>
							<div class="flex gap-2">
								<!-- Indoor option -->
								<div
									class="indoor-option px-3 py-1 rounded-full cursor-pointer text-sm transition-all duration-200
                  ${this.localPreferences.preferIndoor
										? 'bg-primary-default text-primary-on'
										: 'bg-surface-container text-surface-on hover:bg-surface-container-high hover:shadow-sm'}"
									@click=${() =>
										this.updatePreferences({
											preferIndoor: !this.localPreferences.preferIndoor,
											preferOutdoor: false,
										})}
								>
									<span class="flex items-center">
										<schmancy-icon class="mr-1" size="16px">home</schmancy-icon>
										Indoor
									</span>
								</div>

								<!-- Outdoor option -->
								<div
									class="outdoor-option px-3 py-1 rounded-full cursor-pointer text-sm transition-all duration-200
                  ${this.localPreferences.preferOutdoor
										? 'bg-primary-default text-primary-on'
										: 'bg-surface-container text-surface-on hover:bg-surface-container-high hover:shadow-sm'}"
									@click=${() =>
										this.updatePreferences({
											preferOutdoor: !this.localPreferences.preferOutdoor,
											preferIndoor: false,
										})}
								>
									<span class="flex items-center">
										<schmancy-icon class="mr-1" size="16px">wb_sunny</schmancy-icon>
										Outdoor
									</span>
								</div>

								<!-- "No preference" indicator -->
								${!this.localPreferences.preferIndoor && !this.localPreferences.preferOutdoor
									? html`<div class="text-surface-on-variant text-sm flex items-center">No preference</div>`
									: ''}
							</div>
						</div>
					</div>

					<!-- Active (Expanded) View -->
					<div class="active-view fade-view">
						<div class="p-2">
							<!-- Title and explanation -->
							<div class="mb-4">
								<schmancy-typography type="title" token="md" class="mb-1">
									Court Preferences <span class="text-sm font-normal">(Non binding)</span>
								</schmancy-typography>
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant">
									We will try to match your preferences based on availability
								</schmancy-typography>
							</div>

							<!-- Court type preference -->
							<schmancy-surface type="containerLow" rounded="all" class=" mb-4">
								<!-- Grid using golden ratio proportions -->
								<div class="grid grid-cols-2 gap-3">
									<!-- Indoor option with icon - using golden ratio for proportions -->
									<div
										class="indoor-option flex items-center justify-center cursor-pointer h-16 rounded-xl transition-all duration-200
                    ${this.localPreferences.preferIndoor
											? 'bg-primary-default text-primary-on shadow-md'
											: 'bg-surface-container hover:bg-surface-container-high hover:shadow-sm hover:-translate-y-1'}"
										@click=${() =>
											this.updatePreferences({
												preferIndoor: !this.localPreferences.preferIndoor,
												preferOutdoor: false,
											})}
									>
										<schmancy-icon class="mr-2" size="20px">home</schmancy-icon>
										<schmancy-typography>Indoor</schmancy-typography>
									</div>

									<!-- Outdoor option with icon - matching height and using golden ratio -->
									<div
										class="outdoor-option flex items-center justify-center cursor-pointer h-16 rounded-xl transition-all duration-200
                    ${this.localPreferences.preferOutdoor
											? 'bg-primary-default text-primary-on shadow-md'
											: 'bg-surface-container hover:bg-surface-container-high hover:shadow-sm hover:-translate-y-1'}"
										@click=${() =>
											this.updatePreferences({
												preferOutdoor: !this.localPreferences.preferOutdoor,
												preferIndoor: false,
											})}
									>
										<schmancy-icon class="mr-2" size="20px">wb_sunny</schmancy-icon>
										<schmancy-typography>Outdoor</schmancy-typography>
									</div>
								</div>
							</schmancy-surface>
						</div>
					</div>
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'court-preferences-step': CourtPreferencesStep
	}
}
