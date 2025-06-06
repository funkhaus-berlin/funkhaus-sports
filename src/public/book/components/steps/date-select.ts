import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html, PropertyValues } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import { debounceTime, distinctUntilChanged, filter, fromEvent, map, merge, startWith, takeUntil, tap } from 'rxjs'
import { availabilityContext } from 'src/availability-context'
import { transitionToNextStep } from '../../booking-steps-utils'
import { bookingContext, BookingProgressContext, BookingStep } from '../../context'

// Define golden ratio constant
const GOLDEN_RATIO = 1.618

// Animation presets
const ANIMATIONS: {
	[key: string]: {
		keyframes: Keyframe[]
		options: AnimationKeyFrame[] | KeyframeAnimationOptions
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
	@select(availabilityContext)
	availability!: any

	// Cached values to improve performance
	private _today = dayjs()
	private _todayISO = this._today.format('YYYY-MM-DD')
	private _cachedDates: Date[] | null = null
	private _cachedWeeks: Date[][] | null = null
	private _activeHeight = 0
	private _compactHeight = 0
	private _animationInProgress = false
	private _transitionActive = false
	private _firstDayOfWeek: number

	// Query selectors for animation targets and measurements
	@query('.calendar-container') calendarContainer!: HTMLElement
	@query('.calendar-wrapper') calendarWrapper!: HTMLElement
	@query('.active-view') activeView!: HTMLElement
	@query('.compact-view') compactView!: HTMLElement

	// ResizeObserver reference to clean up properly
	private _resizeObserver: ResizeObserver | null = null

	// Add a property to control whether the step is active
	@state() active = true

	// Track viewport size to determine layout
	@state() private isMobile = window.innerWidth < 640
	@state() private mobileColumns = 3
	@state() currentMonth = ''
	@state() currentYear = ''
	@state() private contentHeight = 0
	@state() value: string = ''

	constructor() {
		super()
		// Get first day of week from system locale (0 for Sunday, 1 for Monday)
		// Default to Monday (1) if locale info is unavailable
		try {
			const locale = navigator.language || 'en-US'
			const sampleDate = new Date(2023, 0, 1) // January 1, 2023 (arbitrary date)
			this._firstDayOfWeek = new Intl.DateTimeFormat(locale, { weekday: 'long' })
				.formatToParts(sampleDate)
				.find(part => part.type === 'weekday')
				? 1 // Default to Monday if we can't determine
				: 1
		} catch (e) {
			this._firstDayOfWeek = 1 // Default to Monday if there's an error
		}
	}

	connectedCallback(): void {
		super.connectedCallback()

		merge(
			// Handle window resize events
			fromEvent(window, 'resize').pipe(
				debounceTime(100),
				startWith(window.innerWidth),
				tap(() => this._handleResize()),
			),

			// Enhanced BookingProgressContext subscription with animation handling
			BookingProgressContext.$.pipe(
				map(progress => {
					// Find the position of Date step in the steps array
					const dateStepIndex = progress.steps.findIndex(s => s.step === BookingStep.Date)
					// Check if this position matches the current step
					return progress.currentStep === dateStepIndex +1
				}),
				distinctUntilChanged(),
				filter(() => !this._transitionActive), // Only process if not already transitioning
				tap(isActive => {
					if (this.active !== isActive) {
						// Set transition flag to enable smooth animations
						this._transitionActive = true
						
						// Update active state
						this.active = isActive
						
						// Reset transition flag after animation
						setTimeout(() => {
							this._transitionActive = false
							this.requestUpdate()
						}, 350)
						
						this.requestUpdate()
					}
				}),
			),

			// Handle booking context changes
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

	disconnectedCallback(): void {
		super.disconnectedCallback()
		// Cleanup resize observer
		if (this._resizeObserver) {
			this._resizeObserver.disconnect()
			this._resizeObserver = null
		}
	}

	/**
	 * Handle window resize events
	 */
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
			const activeAnim = this.activeView.animate(ANIMATIONS.fadeIn.keyframes, 200)

			// Fade out compact view
			this.compactView.style.display = 'block'
			this.compactView.animate(ANIMATIONS.fadeOut.keyframes, 200)

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
			const compactAnim = this.compactView.animate(ANIMATIONS.fadeIn.keyframes, 200)

			// Fade out active view
			this.activeView.style.display = 'block'
			this.activeView.animate(ANIMATIONS.fadeOut.keyframes, 200)

			// When animations complete, update final state
			compactAnim.onfinish = () => {
				this.compactView.style.position = 'static'
				this.compactView.style.opacity = '1'
				this.activeView.style.display = 'none'
				this._animationInProgress = false
			}
		}
	}

	/**
	 * Setup resize observer for container width changes
	 */
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

	/**
	 * Generate dates for the calendar (exactly 28 days - 4 rows)
	 * Includes past dates to fill complete weeks
	 */
	private getNext28Days(): Date[] {
		// Use cached value if available
		if (this._cachedDates !== null) {
			return this._cachedDates
		}

		const today = new Date()
		today.setHours(0, 0, 0, 0) // Normalize to start of day
		
		// Find the start of the week containing today
		const dayOfWeek = today.getDay()
		const daysToSubtract = this._firstDayOfWeek === 1 
			? (dayOfWeek === 0 ? 6 : dayOfWeek - 1) // Monday as first day
			: dayOfWeek // Sunday as first day
		
		const startDate = new Date(today)
		startDate.setDate(today.getDate() - daysToSubtract)
		
		// Always generate exactly 28 days (4 rows of 7 days)
		this._cachedDates = Array.from({ length: 28 }, (_, i) => {
			const date = new Date(startDate)
			date.setDate(startDate.getDate() + i)
			return date
		})

		return this._cachedDates
	}

	/**
	 * Group days into weeks for the calendar
	 * Since we always have exactly 28 days starting from the beginning of a week,
	 * we can simply group them into 4 weeks of 7 days each
	 */
	private groupIntoWeeks(dates: Date[]): Date[][] {
		// Use cached value if available
		if (this._cachedWeeks !== null) {
			return this._cachedWeeks
		}

		// Since we always have exactly 28 days starting from the first day of the week,
		// we can simply chunk them into groups of 7
		const weeks: Date[][] = []
		
		for (let i = 0; i < dates.length; i += 7) {
			weeks.push(dates.slice(i, i + 7))
		}

		this._cachedWeeks = weeks
		return weeks
	}

	/**
	 * Get the ordered days of week based on locale setting
	 */
	private getDaysOfWeek(): string[] {
		// Default days starting with Sunday
		const allDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

		// If first day is Monday, rotate the array
		if (this._firstDayOfWeek === 1) {
			return [...allDays.slice(1), allDays[0]]
		}

		return allDays
	}

	/**
	 * Check if a date is a weekend
	 * Adjusted to handle different first day of week settings
	 */
	private isWeekend(date: Date): boolean {
		const day = date.getDay()
		// Sunday (0) and Saturday (6) are weekend days
		return day === 0 || day === 6
	}

	/**
	 * Handle date selection with dynamic flow support
	 */
	private _handleDateClick(date: Date): void {
		// Don't allow selection of dates before today
		const clickedDay = dayjs(date)
		if (clickedDay.isBefore(this._today, 'day')) {
			return
		}

		// Update value and dispatch event
		const dateString = clickedDay.format('YYYY-MM-DD')

		// Add pulse animation to the selected date element
		setTimeout(() => {
			const selectedEl = this.shadowRoot?.querySelector(`[data-date="${dateString}"]`)
			if (selectedEl) {
				selectedEl.animate(ANIMATIONS.pulse.keyframes, 200)
			}
		}, 50)

		// Only update the date, preserving other user selections
		// Use YYYY-MM-DD format as expected by backend
		bookingContext.set(
			{
				date: dateString,
			},
			true,
		)

		// Use the utility function to transition to the next step
		// This handles both updating currentStep and expandedSteps
		transitionToNextStep('Date')
	}

	/**
	 * Scroll to selected date
	 */
	private _scrollToSelectedDate(): void {
		if (!this.value) return

		try {
			const dateValue = dayjs(this.value).format('YYYY-MM-DD')
			const selector = this.active
				? `.active-view [data-date="${dateValue}"]`
				: `.compact-view [data-date="${dateValue}"]`

			const activeEl = this.shadowRoot?.querySelector(selector)

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

	/**
	 * Render date tile with Tailwind classes
	 */
	private renderDateTile(date: Date, isCompact = false) {
		const dateDay = dayjs(date)
		const isSelected = dayjs(this.value).isSame(dateDay, 'day')
		const isToday = dateDay.isSame(this._today, 'day')
		const isWeekend = this.isWeekend(date)
		const isPastDate = dateDay.isBefore(this._today, 'day')
		const dateValue = dateDay.format('YYYY-MM-DD')

		// Apply golden ratio to width/height with responsive sizing
		const compactWidth = 'w-12 sm:w-14'
		const compactHeight = 'h-20 sm:h-24'
		const activeWidth = 'w-full'
		const activeHeight = isCompact ? compactHeight : 'h-16 sm:h-20 md:h-24'

		// ARIA attributes for accessibility
		const ariaSelected = isSelected ? 'true' : 'false'
		const ariaDisabled = isPastDate ? 'true' : 'false'
		const ariaLabel = `${dateDay.format('dddd, MMMM D, YYYY')}${isToday ? ', Today' : ''}`

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
			<div
				class=${classMap(tileClasses)}
				@click=${() => this._handleDateClick(date)}
				data-date=${dateValue}
				role="button"
				tabindex=${isPastDate ? '-1' : '0'}
				aria-selected=${ariaSelected}
				aria-disabled=${ariaDisabled}
				aria-label=${ariaLabel}
			>
				<div class="text-xs sm:text-sm font-medium ${isWeekend && !isSelected ? 'text-primary-default' : ''}">
					${dateDay.format('ddd')}
				</div>
				<div class="${isCompact ? 'text-sm sm:text-base' : 'text-base sm:text-lg md:text-xl'} font-bold">${date.getDate()}</div>
			</div>
		`
	}

	render() {
		// Get all dates
		const dates = this.getNext28Days()

		// Group into weeks for desktop view
		const weeks = this.groupIntoWeeks(dates)

		// Days of week for header - adjusted for locale
		const daysOfWeek = this.getDaysOfWeek()
		
		// Determine the primary month to display based on majority of visible dates
		// Find the month that has the most days in the current view
		const monthCounts = new Map<string, number>()
		dates.forEach(date => {
			const monthKey = dayjs(date).format('MMMM YYYY')
			monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1)
		})
		
		// Get the month with the most days
		let displayMonth = this.currentMonth
		let displayYear = this.currentYear
		let maxCount = 0
		monthCounts.forEach((count, monthYear) => {
			if (count > maxCount) {
				maxCount = count
				const [month, year] = monthYear.split(' ')
				displayMonth = month
				displayYear = year
			}
		})

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
			height: this.contentHeight > 0 ? `${this.contentHeight}px` : 'auto',
			transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
			position: 'relative',
			overflow: 'hidden',
		}

		return html`
			<div
				class=${classMap(containerClasses)}
				class="calendar-container"
				role="region"
				aria-label="Date selection calendar"
			>
				<!-- Month and Year header - Outside the animated wrapper -->
				<div class="text-center p-3 pb-0">
					<h2 class="${this.active ? 'text-lg sm:text-xl md:text-2xl' : 'text-base sm:text-lg'} font-semibold text-primary-default transition-all duration-300">
						${displayMonth} ${displayYear}
					</h2>
				</div>
				
				<!-- Fixed height wrapper for smooth transitions -->
				<div class="calendar-wrapper" style=${styleMap(wrapperStyle)}>
					<!-- Active (Expanded) View -->
					<div class="active-view p-4 pt-2" role="grid">
						<!-- Days of week header -->
						<div class="grid grid-cols-7 gap-2 mb-3 pb-2 border-b border-outlineVariant" role="row">
							${daysOfWeek.map(
								day =>
									html`<div class="text-center text-xs font-semibold text-primary-default" role="columnheader">
										${day}
									</div>`,
							)}
						</div>

						<!-- Week-based grid for active view -->
						<div class="overflow-visible pb-4">
							${repeat(
								weeks,
								(_week, i) => `week-${i}`, // Use index as key
								(week, index) => html`
									<div class="grid grid-cols-7 gap-2 mb-2" role="row" aria-rowindex=${index + 2}>
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
					<div class="compact-view p-2" role="grid">
						<!-- Horizontal scroll for compact view -->
						<div class="flex gap-0 overflow-x-auto scrollbar-hide snap-x py-1" role="row">
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
}
