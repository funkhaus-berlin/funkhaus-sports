import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html, PropertyValues } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import { debounceTime, distinctUntilChanged, filter, fromEvent, map, merge, startWith, takeUntil, tap } from 'rxjs'
import { bookingContext, BookingProgressContext, BookingStep } from '../../context'

// Define golden ratio constant
const GOLDEN_RATIO = 1.618

/**
 * Date Selection component with zero layout shifts
 * Uses fixed dimensions and absolute positioning to prevent any layout shifts
 */
@customElement('date-selection-step')
export class DateSelectionStep extends $LitElement(css`
	.scrollbar-hide {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none; /* Chrome, Safari, and Opera */
	}
`) {
	// Cached values to improve performance
	private _today = dayjs()
	private _todayISO = this._today.format('YYYY-MM-DD')
	private _cachedDates: Date[] | null = null
	private _cachedWeeks: Date[][] | null = null
	private _activeHeight = 0
	private _compactHeight = 0
	private _animationInProgress = false
	private _transitionActive = false

	// Query selectors for animation targets and measurements
	@query('.calendar-container') calendarContainer!: HTMLElement
	@query('.calendar-wrapper') calendarWrapper!: HTMLElement
	@query('.active-view') activeView!: HTMLElement
	@query('.compact-view') compactView!: HTMLElement

	// ResizeObserver reference to clean up properly
	private _resizeObserver: ResizeObserver | null = null

	// Add a property to control whether the step is active
	@state()
	active = true

	// Track viewport size to determine layout
	@state() private isMobile = window.innerWidth < 640
	@state() private mobileColumns = 3
	@state() currentMonth = ''
	@state() currentYear = ''
	@state() private contentHeight = 0

	@state() value: string = ''
	// Animation keyframes and options
	private animations: {
		[key: string]: {
			keyframes: Keyframe[]
			options: AnimationEffectTiming
		}
	} = {
		fadeIn: {
			keyframes: [{ opacity: 0 }, { opacity: 1 }],
			options: {
				duration: 300,
				easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
				fill: 'forwards',
			},
		},
		fadeOut: {
			keyframes: [{ opacity: 1 }, { opacity: 0 }],
			options: {
				duration: 300,
				easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
				fill: 'forwards',
			},
		},
		pulse: {
			keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }],
			options: {
				duration: 400,
				easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
			},
		},
	}

	connectedCallback(): void {
		super.connectedCallback()

		merge(
			fromEvent(window, 'resize').pipe(
				debounceTime(100),
				startWith(window.innerWidth),
				tap(() => {
					this._handleResize()
				}),
			),

			BookingProgressContext.$.pipe(
				startWith(BookingProgressContext.value),
				tap(b => {
					this.active = b.currentStep === BookingStep.Date
				}),
			),

			bookingContext.$.pipe(
				startWith(bookingContext.value),
				filter(() => bookingContext.ready),
				map(b => b.date),
				distinctUntilChanged(),
				tap(date => {
					// if date is before today, reset it
					if (date && dayjs(date).isBefore(this._today, 'day')) {
						date = this._todayISO
					}
					if (date) {
						this.value = date

						// Update current month and year display based on selected date
						const selectedDate = dayjs(date)
						this.currentMonth = selectedDate.format('MMMM')
						this.currentYear = selectedDate.format('YYYY')

						// Scroll to the selected date after a short delay to ensure rendering
						this.updateComplete.then(() => {
							setTimeout(() => this._scrollToSelectedDate(), 100)
						})
					}
				}),
			),
		)
			.pipe(takeUntil(this.disconnecting))
			.subscribe()
	}

	// Handle window resize events
	private _handleResize = (): void => {
		const wasMobile = this.isMobile
		this.isMobile = window.innerWidth < 640

		if (wasMobile !== this.isMobile) {
			this.requestUpdate()
		}

		// Measure heights again after resize
		this.updateComplete.then(() => {
			this._measureHeights()
		})
	}

	firstUpdated(): void {
		// Set default value to today if not provided
		if (!this.value) {
			this.value = this._todayISO
		}

		// Set current month and year
		this.currentMonth = this._today.format('MMMM')
		this.currentYear = this._today.format('YYYY')

		// Add resize observer for responsive grid
		this._setupResizeObserver()

		// Initial measurement of both views to establish heights
		this.updateComplete.then(() => {
			// Wait a bit for initial render to complete
			setTimeout(() => {
				this._measureHeights()
				this._setupInitialState()
			}, 50)
		})

		// Scroll to selected date on first render
		bookingContext.$.pipe(startWith(bookingContext.value), debounceTime(500)).subscribe({
			next: () => {
				this._scrollToSelectedDate()
			},
		})
	}

	/**
	 * Measure heights of active and compact views for proper transitions
	 */
	private _measureHeights(): void {
		if (this.activeView && this.compactView) {
			// Save original display settings
			const activeDisplay = this.activeView.style.display
			const compactDisplay = this.compactView.style.display

			// Measure active view height
			this.activeView.style.display = 'block'
			this.compactView.style.display = 'none'
			this._activeHeight = this.activeView.offsetHeight

			// Measure compact view height
			this.activeView.style.display = 'none'
			this.compactView.style.display = 'block'
			this._compactHeight = this.compactView.offsetHeight

			// Restore original display settings
			this.activeView.style.display = activeDisplay
			this.compactView.style.display = compactDisplay

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

	protected updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties)

		// If active state changes and heights are measured, animate the transition
		if (
			changedProperties.has('active') &&
			this._activeHeight > 0 &&
			this._compactHeight > 0 &&
			!this._animationInProgress
		) {
			// Set transition flag to prevent multiple transitions
			this._animationInProgress = true
			this._transitionActive = true

			// Set target height for container
			this.contentHeight = this.active ? this._activeHeight : this._compactHeight

			// Perform cross-fade animation between views
			this._animateCrossFade()

			// Scroll to selected date after transition
			if (this.value !== undefined) {
				setTimeout(() => {
					this._scrollToSelectedDate()
					this._transitionActive = false
				}, 350)
			}
		}
	}

	/**
	 * Animate cross-fade between active and compact views
	 */
	private _animateCrossFade(): void {
		if (!this.activeView || !this.compactView) return

		// Both views start as absolute positioned during transition
		this.activeView.style.position = 'absolute'
		this.compactView.style.position = 'absolute'
		this.activeView.style.width = '100%'
		this.compactView.style.width = '100%'
		this.activeView.style.top = '0'
		this.compactView.style.top = '0'

		if (this.active) {
			// Fade in active view
			this.activeView.style.display = 'block'
			const activeAnim = this.activeView.animate(this.animations.fadeIn.keyframes, this.animations.fadeIn.options)

			// Fade out compact view
			this.compactView.style.display = 'block'
			this.compactView.animate(this.animations.fadeOut.keyframes, this.animations.fadeOut.options)

			// When animations complete, update final state
			activeAnim.onfinish = () => {
				this.activeView.style.position = 'static'
				this.activeView.style.opacity = '1'
				this.compactView.style.display = 'none'
				this._animationInProgress = false
			}
		} else {
			// Fade in compact view
			this.compactView.style.display = 'block'
			const compactAnim = this.compactView.animate(this.animations.fadeIn.keyframes, this.animations.fadeIn.options)

			// Fade out active view
			this.activeView.style.display = 'block'
			this.activeView.animate(this.animations.fadeOut.keyframes, this.animations.fadeOut.options)

			// When animations complete, update final state
			compactAnim.onfinish = () => {
				this.compactView.style.position = 'static'
				this.compactView.style.opacity = '1'
				this.activeView.style.display = 'none'
				this._animationInProgress = false
			}
		}
	}

	// Setup resize observer for container width changes
	private _setupResizeObserver(): void {
		if (typeof ResizeObserver !== 'undefined') {
			this._resizeObserver = new ResizeObserver(entries => {
				const containerWidth = entries[0].contentRect.width

				// Adjust columns based on container width
				let newColumns = 3 // Default

				if (containerWidth < 300) {
					newColumns = 2 // Very small screens
				} else if (containerWidth < 400) {
					newColumns = 3 // Small screens
				} else if (containerWidth < 500) {
					newColumns = 4 // Medium screens
				} else {
					newColumns = 7 // Large screens (full week)
				}

				if (this.mobileColumns !== newColumns) {
					this.mobileColumns = newColumns
					this.requestUpdate()
				}

				// Re-measure heights if needed
				if (!this._transitionActive) {
					this._measureHeights()
				}
			})

			this.updateComplete.then(() => {
				const container = this.shadowRoot?.querySelector('.calendar-container')
				if (container && this._resizeObserver) {
					this._resizeObserver.observe(container)
				}
			})
		}
	}

	// Generate dates for the calendar (28 days from today)
	private getNext28Days(): Date[] {
		// Use cached value if available
		if (this._cachedDates !== null) {
			return this._cachedDates
		}

		const today = new Date()
		this._cachedDates = Array.from({ length: 28 }, (_, i) => {
			const date = new Date(today)
			date.setDate(date.getDate() + i)
			return date
		})

		return this._cachedDates
	}

	// Group days into weeks for the calendar
	private groupIntoWeeks(dates: Date[]): Date[][] {
		// Use cached value if available
		if (this._cachedWeeks !== null) {
			return this._cachedWeeks
		}

		// Start with the first date
		const startDate = new Date(dates[0])
		const startDayOfWeek = startDate.getDay() // 0 = Sunday

		// Create week groups
		const weeks: Date[][] = []
		let currentWeek: Date[] = []

		// Fill the first week with placeholder days if needed
		if (startDayOfWeek !== 0) {
			// If not starting on Sunday
			for (let i = 0; i < startDayOfWeek; i++) {
				const placeholderDate = new Date(startDate)
				placeholderDate.setDate(startDate.getDate() - (startDayOfWeek - i))
				currentWeek.push(placeholderDate)
			}
		}

		// Add all dates to appropriate weeks
		for (const date of dates) {
			currentWeek.push(date)

			// If we've reached the end of the week (Saturday)
			if (date.getDay() === 6) {
				weeks.push([...currentWeek])
				currentWeek = []
			}
		}

		// Add any remaining dates in the last week
		if (currentWeek.length > 0) {
			weeks.push([...currentWeek])
		}

		this._cachedWeeks = weeks
		return weeks
	}

	// Handle date selection
	private _handleDateClick(date: Date): void {
		// Don't allow selection of dates before today
		const clickedDay = dayjs(date)
		if (clickedDay.isBefore(this._today, 'day')) {
			return
		}

		// Update value and dispatch event
		const newValue = date.toISOString()
		this.value = newValue

		// Add pulse animation to the selected date element
		setTimeout(() => {
			const dateValue = clickedDay.format('YYYY-MM-DD')
			const selectedEl = this.shadowRoot?.querySelector(`[data-date="${dateValue}"]`)

			if (selectedEl) {
				selectedEl.animate(this.animations.pulse.keyframes, this.animations.pulse.options)
			}
		}, 50)
		bookingContext.set({
			date: newValue,
			courtId: '',
			startTime: '',
			endTime: '',
		})

		BookingProgressContext.set({
			currentStep: BookingStep.Court,
		})

		this.dispatchEvent(new CustomEvent('change', { detail: newValue }))
	}

	// Scroll to selected date
	private _scrollToSelectedDate(): void {
		if (this.value === undefined) return

		try {
			const dateValue = dayjs(this.value).format('YYYY-MM-DD')
			const activeEl = this.active
				? this.shadowRoot?.querySelector(`.active-view [data-date="${dateValue}"]`)
				: this.shadowRoot?.querySelector(`.compact-view [data-date="${dateValue}"]`)

			if (activeEl && activeEl instanceof HTMLElement) {
				// Smooth scroll with options to minimize layout impact
				activeEl.scrollIntoView({
					behavior: 'smooth',
					block: 'nearest',
					inline: 'center',
				})
			}
		} catch (error) {
			console.error('Error scrolling to selected date:', error)
		}
	}

	render() {
		// Get all dates
		const dates = this.getNext28Days()

		// Group into weeks for desktop view
		const weeks = this.groupIntoWeeks(dates)

		// Days of week for header
		const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

		// Date range for display
		// const startDateDisplay = dayjs(dates[0]).format('MMM D')
		// const endDateDisplay = dayjs(dates[dates.length - 1]).format('MMM D')

		// Calculate padding using golden ratio
		Math.round(16 * (this.active ? GOLDEN_RATIO : 1))

		// Container classes with proper Tailwind utilities
		const containerClasses = {
			'px-1': true,
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'transition-all': true,
			'duration-300': true,
			'overflow-hidden': true,
			relative: true,
		}

		// Wrapper style with fixed height to prevent layout shifts
		const wrapperStyle = {
			height: `${this.contentHeight}px`,
			transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
			position: 'relative',
			overflow: 'hidden',
		}

		return html`
			<div class=${classMap(containerClasses)} class="calendar-container">
				<!-- Fixed height wrapper for smooth transitions -->
				<div class="calendar-wrapper" style=${styleMap(wrapperStyle)}>
					<!-- Active (Expanded) View -->
					<div class="active-view p-4">
						<!-- Days of week header -->
						<div class="grid grid-cols-7 gap-2 mb-3 pb-2 border-b border-outlineVariant">
							${daysOfWeek.map(
								day => html` <div class="text-center text-xs font-semibold text-primary-default">${day}</div> `,
							)}
						</div>

						<!-- Week-based grid for active view -->
						<div class="overflow-visible pb-4">
							${repeat(
								weeks,
								(_week, i) => `week-${i}`, // Use index as key
								week => html`
									<div class="grid grid-cols-7 gap-2 mb-2">
										${repeat(
											week,
											date => date.toISOString(), // Use ISO string as key
											date => this.renderDateTile(date, false),
										)}
									</div>
								`,
							)}
						</div>
					</div>

					<!-- Compact View -->
					<div class="compact-view">
						<!-- Horizontal scroll for compact view -->
						<div class="flex gap-0 overflow-x-auto scrollbar-hide snap-x py-1">
							${repeat(
								dates,
								date => date.toISOString(),
								date => this.renderDateTile(date, true),
							)}
						</div>
					</div>
				</div>
			</div>
		`
	}

	// Render date tile with Tailwind classes
	private renderDateTile(date: Date, isCompact = false) {
		const dateDay = dayjs(date)
		const isSelected = dayjs(this.value).isSame(dateDay, 'day')
		const isToday = dateDay.isSame(this._today, 'day')
		const isWeekend = date.getDay() === 0 || date.getDay() === 6
		const isPastDate = dateDay.isBefore(this._today, 'day')
		const dateValue = dateDay.format('YYYY-MM-DD')

		// Apply golden ratio to width/height
		const compactWidth = 'w-14'
		const compactHeight = `h-${Math.round(14 * GOLDEN_RATIO)}`
		const activeWidth = 'w-full'
		const activeHeight = isCompact ? compactHeight : 'h-20'

		// Tailwind classes for date tile
		const tileClasses = {
			// Base styles
			flex: true,
			'flex-col': true,
			'items-center': true,
			'justify-center': true,
			'rounded-xl': true,
			'transition-all': true,
			'duration-300': true,
			transform: true,
			'cursor-pointer': !isPastDate,
			'cursor-not-allowed': isPastDate,
			relative: true,
			'snap-center': isCompact, // Add snap points for horizontal scrolling

			// Sizing based on compact state
			[compactWidth]: isCompact,
			[compactHeight]: isCompact,
			[activeWidth]: !isCompact,
			[activeHeight]: !isCompact,

			// Padding
			'py-3': isCompact,
			'py-4': !isCompact,
			'px-3': true,

			// Colors and states
			'bg-primary-default': isSelected,
			'text-primary-on': isSelected,
			'bg-surface-high': !isSelected && !isPastDate,
			'text-surface-on': !isSelected && !isPastDate,
			'opacity-50': isPastDate,
			'border-0': isToday && !isSelected,
			'border-tertiary-default': isToday && !isSelected,
			'hover:shadow-md': !isPastDate,
			'hover:-translate-y-1': !isPastDate,
			'shadow-sm': isSelected,

			// Spacing for consistent layout
			'mx-1': isCompact, // Add horizontal margin to prevent crowding
			'my-1': true, // Add vertical margin for spacing
		}

		return html`
			<div class=${classMap(tileClasses)} @click=${() => this._handleDateClick(date)} data-date=${dateValue}>
				<div class="text-xs font-medium ${isWeekend && !isSelected ? 'text-primary-default' : ''}">
					${dateDay.format('ddd')}
				</div>
				<div class="text-${isCompact ? 'base' : 'lg'} font-bold">${date.getDate()}</div>
				<div class="text-xs">${dateDay.format('MMM')}</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'date-selection-step': DateSelectionStep
	}
}
