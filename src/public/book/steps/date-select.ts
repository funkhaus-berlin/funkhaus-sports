import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { cache } from 'lit/directives/cache.js'

@customElement('date-selection-step')
export class DateSelectionStep extends $LitElement() {
	// Use private backing field for the value property with custom getter/setter
	private _value?: string

	// Cached values to improve performance
	private _today = dayjs()
	private _todayISO = this._today.toISOString()
	private _cachedDates: Date[] | null = null
	private _cachedWeeks: Date[][] | null = null

	// ResizeObserver reference to clean up properly
	private _resizeObserver: ResizeObserver | null = null

	@property({ type: String })
	get value(): string | undefined {
		return this._value
	}

	set value(val: string | undefined) {
		// Prevent selection of dates before today
		if (val && dayjs(val).isBefore(this._today, 'day')) {
			val = this._todayISO
		}

		const oldValue = this._value
		this._value = val
		this.requestUpdate('value', oldValue)

		// When value changes, scroll to it once the DOM has updated
		if (val !== undefined && val !== oldValue) {
			// Use requestAnimationFrame instead of setTimeout for smoother animation
			requestAnimationFrame(() => this._scrollToSelectedDate())
		}
	}

	// Add a property to control whether the step is active
	@property({ type: Boolean })
	active = true

	// Track viewport size to determine layout
	@state() private isMobile = false
	@state() private mobileColumns = 3 // Default for very small screens
	@state() private currentMonth = ''
	@state() private currentYear = ''

	// Track if component is connected to improve performance
	private _isConnected = false

	connectedCallback(): void {
		super.connectedCallback()
		this._isConnected = true
	}

	disconnectedCallback(): void {
		super.disconnectedCallback()
		this._isConnected = false

		// Clean up resize observer
		if (this._resizeObserver) {
			this._resizeObserver.disconnect()
			this._resizeObserver = null
		}
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Set default value to today if not provided
		if (!this.value) {
			this.value = this._todayISO
		}

		// Set current month and year
		this.currentMonth = this._today.format('MMMM')
		this.currentYear = this._today.format('YYYY')

		// Add resize observer for responsive grid
		this.setupResizeObserver()

		// Scroll to selected date on first render with requestAnimationFrame
		// for better performance
		requestAnimationFrame(() => this._scrollToSelectedDate())
	}

	protected updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties)

		// If active state changes, scroll to the selected date
		if (changedProperties.has('active') && this.value !== undefined) {
			requestAnimationFrame(() => this._scrollToSelectedDate())
		}
	}

	// Setup resize observer to handle responsiveness
	private setupResizeObserver() {
		if (typeof ResizeObserver !== 'undefined') {
			this._resizeObserver = new ResizeObserver(this._handleResize.bind(this))

			// Start observing once the element is in the DOM
			this.updateComplete.then(() => {
				const container = this.shadowRoot?.querySelector('.calendar-container')
				if (container && this._resizeObserver) {
					this._resizeObserver.observe(container)
				}
			})
		}
	}

	// Extracted resize handling logic to avoid inline function creation
	private _handleResize(entries: ResizeObserverEntry[]) {
		if (!this._isConnected) return

		const containerWidth = entries[0].contentRect.width
		const wasMobile = this.isMobile
		const oldColumns = this.mobileColumns

		// Determine if we're in mobile mode based on container width
		this.isMobile = containerWidth < 500

		// Adjust columns based on container width
		let newColumns = this.mobileColumns
		if (containerWidth < 300) {
			newColumns = 2 // Very small screens
		} else if (containerWidth < 400) {
			newColumns = 3 // Small screens
		} else if (containerWidth < 500) {
			newColumns = 4 // Medium mobile screens
		}

		// Only update if something changed to avoid unnecessary renders
		if (wasMobile !== this.isMobile || oldColumns !== newColumns) {
			this.mobileColumns = newColumns
			this.requestUpdate()
		}
	}

	// Generate next 28 days (4 weeks) starting from today
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

	// Group days into weeks for better calendar view
	private groupIntoWeeks(dates: Date[]): Date[][] {
		// Use cached value if available
		if (this._cachedWeeks !== null) {
			return this._cachedWeeks
		}

		// Start with the first date
		const startDate = new Date(dates[0])
		// Calculate the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
		const startDayOfWeek = startDate.getDay()

		// Create proper week-aligned groups
		const weeks: Date[][] = []
		let currentWeek: Date[] = []

		// Fill the first week with placeholder days if needed
		if (startDayOfWeek !== 6) {
			// If not starting on Saturday
			// Add empty placeholders for days before the start date
			// We use 6 as our first day of the week (Saturday)
			const numPlaceholders = (startDayOfWeek + 1) % 7
			for (let i = 0; i < numPlaceholders; i++) {
				const placeholderDate = new Date(startDate)
				placeholderDate.setDate(startDate.getDate() - (numPlaceholders - i))
				currentWeek.push(placeholderDate)
			}
		}

		// Add all dates to appropriate weeks
		for (const date of dates) {
			currentWeek.push(date)

			// If we've reached Saturday (end of the week) or this is the last date
			if (date.getDay() === 5) {
				// Friday is the end of our display week
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

	private _handleDateClick(date: Date) {
		// Don't allow selection of dates before today
		const clickedDay = dayjs(date)
		if (clickedDay.isBefore(this._today, 'day')) {
			return
		}

		this.value = date.toISOString()
		this.dispatchEvent(new CustomEvent('change', { detail: this.value }))
	}

	// Scroll to the selected date and center it in the view
	private _scrollToSelectedDate() {
		if (this.value === undefined || !this._isConnected) return

		// Use requestAnimationFrame for smoother scrolling
		requestAnimationFrame(() => {
			try {
				// Find the selected date element - we'll use a unique data attribute
				const dateValue = dayjs(this.value).format('YYYY-MM-DD')
				const selectedDateEl = this.shadowRoot?.querySelector(`[data-date="${dateValue}"]`) as HTMLElement

				if (!selectedDateEl) {
					return
				}

				// Find the parent container
				const container = this.shadowRoot?.querySelector('.date-grid-container')

				if (!container) {
					return
				}

				// Use the scrollIntoView API with options for better browser support
				selectedDateEl.scrollIntoView({
					behavior: 'smooth',
					block: 'nearest',
					inline: 'center',
				})
			} catch (error) {
				console.error('Error scrolling to selected date:', error)
			}
		})
	}

	render() {
		// Use different classes based on active state
		const containerClasses = {
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'py-4': this.active,
			'py-2': !this.active,
			'shadow-sm': true,
		}

		// Get all dates - using memoized function
		const dates = this.getNext28Days()
		// Group into weeks for desktop view - using memoized function
		const weeks = this.groupIntoWeeks(dates)

		// Days of week for header - properly ordered to match the display
		const daysOfWeek = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']

		// Calculate date range for display
		const startDateDisplay = dayjs(dates[0]).format('MMM D')
		const endDateDisplay = dayjs(dates[dates.length - 1]).format('MMM D')

		return html`
			<div class=${this.classMap(containerClasses)} class="calendar-container">
				<!-- Calendar Header - Shown when active -->
				${this.active
					? html`
							<div class="flex justify-between items-center mb-3 px-4">
								<h3 class="text-lg font-medium">Select Date</h3>
								<div class="text-sm font-medium text-surface-on-variant">${this.currentMonth} ${this.currentYear}</div>
							</div>
					  `
					: ''}

				<!-- Days of week header - styled to look more like a calendar -->
				${this.active
					? html`
							<div
								class="grid ${this.isMobile
									? `grid-cols-${this.mobileColumns}`
									: 'grid-cols-7'} gap-2 px-4 mb-3 border-b pb-2"
							>
								${this.isMobile
									? html`` // On mobile, don't show day headers to save space
									: daysOfWeek.map(
											day => html` <div class="text-center text-xs font-semibold text-primary-default">${day}</div> `,
									  )}
							</div>
					  `
					: ''}

				<!-- Dates Container - with calendar-like styling -->
				<div class="date-grid-container px-4 overflow-auto">
					<!-- When active, use responsive grid -->
					${this.active
						? this.isMobile
							? html`
									<!-- Mobile view: simple grid -->
									<div class="grid grid-cols-${this.mobileColumns} gap-2">
										${dates.map(date => this.renderDateTile(date))}
									</div>
							  `
							: html`
									<!-- Desktop view: organized by weeks -->
									${weeks.map(
										week => html`
											<div class="grid grid-cols-7 gap-2 mb-2">${week.map(date => this.renderDateTile(date))}</div>
										`,
									)}
							  `
						: html`
								<!-- Inactive view: horizontal scroll -->
								<schmancy-scroll hide>
									<div class="flex gap-2 pb-1">${dates.map(date => this.renderDateTile(date, true))}</div>
								</schmancy-scroll>
						  `}
				</div>

				<!-- Calendar-like footer - only in active mode -->
				${this.active
					? html`
							<div class="mt-3 px-4 pt-2 border-t flex justify-between items-center text-xs text-surface-on-variant">
								<div>Showing: ${startDateDisplay} - ${endDateDisplay}</div>
								<div>Today: ${dayjs().format('MMM D, YYYY')}</div>
							</div>
					  `
					: ''}
			</div>
		`
	}

	// Extracted method to render date tiles to avoid code duplication
	private renderDateTile(date: Date, isCompact = false) {
		// Use cache directive to avoid re-rendering unchanged tiles
		return cache(this._renderDateTileContent(date, isCompact))
	}

	private _renderDateTileContent(date: Date, isCompact = false) {
		const dateDay = dayjs(date)
		const isSelected = dayjs(this.value).isSame(dateDay, 'day')
		const isToday = dateDay.isSame(this._today, 'day')
		const isWeekend = date.getDay() === 0 || date.getDay() === 6 // 0 is Sunday, 6 is Saturday
		const dateValue = dateDay.format('YYYY-MM-DD')
		const isCurrentMonth = dateDay.month() === this._today.month()

		// Check if date is before today to disable it
		const isPastDate = dateDay.isBefore(this._today, 'day')

		// Calculate golden ratio height - approximating in tailwind classes
		const heightClass = this.active && !isCompact ? 'py-3' : 'py-2'

		// Adjust size for compact mode
		const dateClasses = {
			'flex-none': true,
			flex: true,
			'flex-col': true,
			'items-center': true,
			'justify-center': true,
			'transition-colors': true,
			'cursor-pointer': !isPastDate,
			'cursor-not-allowed': isPastDate,
			'opacity-50': isPastDate, // Dim past dates
			'rounded-3xl': this.active, // More oval for active
			'rounded-full': !this.active, // Circular for inactive
			'bg-primary-default text-primary-on': isSelected && !isPastDate,
			'bg-surface-high text-surface-on': !isSelected || isPastDate,
			relative: true,
			group: true,
			// Different sizes based on active state
			'w-full': this.active && !isCompact,
			[heightClass]: true,
			'w-12': !this.active || isCompact,
		}

		// Add border for today
		if (isToday && !isSelected) {
			dateClasses['border-2'] = true
			dateClasses['border-primary-default'] = true
		}

		// State layer classes - match the rounded corners of the container
		const stateLayerClasses = {
			'absolute inset-0 z-0 transition-opacity duration-200': true,
			'opacity-0 hover:opacity-8 group-hover:opacity-8': !isPastDate, // Only allow hover effect for valid dates
			'rounded-3xl': this.active,
			'rounded-full': !this.active,
			'bg-primary-on': isSelected && !isPastDate,
			'bg-primary-default': !isSelected && !isPastDate,
		}

		// Responsive text sizes
		const dayClass = `text-xs font-medium ${isWeekend && !isSelected ? 'text-primary-default' : ''}`
		const dateClass = !this.active ? 'text-lg font-bold' : 'text-xl font-bold'
		const monthClass = `text-xs ${!isCurrentMonth && !isSelected ? 'text-primary-default' : ''}`

		// Format day names based on locale (Mon, Tue, etc.)
		const dayOfWeek = dateDay.format('ddd')

		return html`
			<div class=${this.classMap(dateClasses)} @click=${() => this._handleDateClick(date)} data-date=${dateValue}>
				<!-- State layer for hover effects -->
				<div class=${this.classMap(stateLayerClasses)}></div>

				<!-- Date content with higher z-index -->
				<div class="relative z-10 pointer-events-none flex flex-col items-center justify-center h-full">
					<div class=${dayClass}>${dayOfWeek}</div>
					<div class=${dateClass}>${date.getDate()}</div>
					<div class=${monthClass}>${dateDay.format('MMM')}</div>
				</div>
			</div>
		`
	}
}
