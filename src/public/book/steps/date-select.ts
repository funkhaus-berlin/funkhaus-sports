import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

@customElement('date-selection-step')
export class DateSelectionStep extends $LitElement() {
	// Golden ratio constant
	private readonly GOLDEN_RATIO = 1.618

	// Use private backing field for the value property with custom getter/setter
	private _value?: string

	@property({ type: String })
	get value(): string | undefined {
		return this._value
	}

	set value(val: string | undefined) {
		const oldValue = this._value
		this._value = val
		this.requestUpdate('value', oldValue)

		// When value changes, scroll to it once the DOM has updated
		if (val !== undefined && val !== oldValue) {
			setTimeout(() => this._scrollToSelectedDate(), 0)
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

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Set default value to today if not provided
		if (!this.value) {
			this.value = dayjs().toISOString()
		}

		// Set current month and year
		const today = dayjs()
		this.currentMonth = today.format('MMMM')
		this.currentYear = today.format('YYYY')

		// Add resize observer for responsive grid
		this.setupResizeObserver()

		// Scroll to selected date on first render
		setTimeout(() => this._scrollToSelectedDate(), 100)
	}

	protected updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties)

		// If active state changes, scroll to the selected date
		if (changedProperties.has('active') && this.value !== undefined) {
			setTimeout(() => this._scrollToSelectedDate(), 0)
		}
	}

	// Setup resize observer to handle responsiveness
	private setupResizeObserver() {
		if (typeof ResizeObserver !== 'undefined') {
			const observer = new ResizeObserver(entries => {
				const containerWidth = entries[0].contentRect.width

				// Determine if we're in mobile mode based on container width
				this.isMobile = containerWidth < 500

				// Adjust columns based on container width
				if (containerWidth < 300) {
					this.mobileColumns = 2 // Very small screens
				} else if (containerWidth < 400) {
					this.mobileColumns = 3 // Small screens
				} else if (containerWidth < 500) {
					this.mobileColumns = 4 // Medium mobile screens
				}

				this.requestUpdate()
			})

			// Start observing once the element is in the DOM
			this.updateComplete.then(() => {
				const container = this.shadowRoot?.querySelector('.calendar-container')
				if (container) {
					observer.observe(container)
				}
			})
		}
	}

	// Generate next 28 days (4 weeks)
	private getNext28Days(): Date[] {
		return Array.from({ length: 28 }, (_, i) => {
			const date = new Date()
			date.setDate(date.getDate() + i)
			return date
		})
	}

	// Group days into weeks for better calendar view
	private groupIntoWeeks(dates: Date[]): Date[][] {
		const weeks: Date[][] = []
		let currentWeek: Date[] = []

		// Process all dates into weeks
		for (const date of dates) {
			// Start a new week when we hit Saturday (we're using Sat-Fri weeks based on the images)
			if (date.getDay() === 6 && currentWeek.length > 0) {
				// 6 = Saturday
				weeks.push([...currentWeek]) // Create a copy to avoid reference issues
				currentWeek = []
			}

			// Add date to current week
			currentWeek.push(date)
		}

		// Add the last week if it's not empty
		if (currentWeek.length > 0) {
			weeks.push(currentWeek)
		}

		return weeks
	}

	private _handleDateClick(date: Date) {
		this.value = date.toISOString()
		this.dispatchEvent(new CustomEvent('change', { detail: this.value }))
	}

	// Scroll to the selected date and center it in the view
	private _scrollToSelectedDate() {
		if (this.value === undefined) return

		// Wait for next render cycle to ensure elements are available
		requestAnimationFrame(() => {
			try {
				// Find the selected date element - we'll use a unique data attribute
				const dateValue = dayjs(this.value).format('YYYY-MM-DD')
				const selectedDateEl = this.shadowRoot?.querySelector(`[data-date="${dateValue}"]`) as HTMLElement

				if (!selectedDateEl) {
					console.debug('Selected date element not found')
					return
				}

				// Find the parent container
				const container = this.shadowRoot?.querySelector('.date-grid-container')

				if (!container) {
					console.debug('Date container not found')
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

		// Get all dates
		const dates = this.getNext28Days()
		// Group into weeks for desktop view
		const weeks = this.groupIntoWeeks(dates)

		// Days of week for header
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
		const isSelected = dayjs(this.value).isSame(dayjs(date), 'D')
		const isToday = dayjs(date).isSame(dayjs(), 'day')
		const isWeekend = date.getDay() === 0 || date.getDay() === 6 // 0 is Sunday, 6 is Saturday
		const dateValue = dayjs(date).format('YYYY-MM-DD')
		const isCurrentMonth = dayjs(date).month() === dayjs().month()

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
			'cursor-pointer': true,
			'rounded-3xl': this.active, // More oval for active
			'rounded-full': !this.active, // Circular for inactive
			'bg-primary-default text-primary-on': isSelected,
			'bg-surface-high text-surface-on': !isSelected,
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
			'opacity-0 hover:opacity-8 group-hover:opacity-8': true,
			'rounded-3xl': this.active,
			'rounded-full': !this.active,
			'bg-primary-on': isSelected,
			'bg-primary-default': !isSelected,
		}

		// Responsive text sizes
		const dayClass = `text-xs font-medium ${isWeekend && !isSelected ? 'text-primary-default' : ''}`
		const dateClass = !this.active ? 'text-lg font-bold' : 'text-xl font-bold'
		const monthClass = `text-xs ${!isCurrentMonth && !isSelected ? 'text-primary-default' : ''}`

		// Format day names based on locale (Mon, Tue, etc.)
		const dayOfWeek = dayjs(date).format('ddd')

		return html`
			<div class=${this.classMap(dateClasses)} @click=${() => this._handleDateClick(date)} data-date=${dateValue}>
				<!-- State layer for hover effects -->
				<div class=${this.classMap(stateLayerClasses)}></div>

				<!-- Date content with higher z-index -->
				<div class="relative z-10 pointer-events-none flex flex-col items-center justify-center h-full">
					<div class=${dayClass}>${dayOfWeek}</div>
					<div class=${dateClass}>${date.getDate()}</div>
					<div class=${monthClass}>${dayjs(date).format('MMM')}</div>
				</div>
			</div>
		`
	}
}
