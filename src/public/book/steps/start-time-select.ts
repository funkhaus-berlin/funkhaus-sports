import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { distinctUntilChanged, map, takeUntil } from 'rxjs'
import { AvailabilityService } from '../availability.service'
import { bookingContext } from '../context'
import { TimeSlot } from '../types'

@customElement('time-selection-step')
export class TimeSelectionStep extends $LitElement() {
	@property({ type: Boolean }) active = true
	@property({ attribute: false }) onTimeSelected?: (time: number) => void

	// Use private backing field for the value property with custom getter/setter
	private _value?: number

	@property({ type: Number })
	get value(): number | undefined {
		return this._value
	}

	set value(val: number | undefined) {
		const oldValue = this._value
		this._value = val
		this.requestUpdate('value', oldValue)

		// When value changes, scroll to it once the DOM has updated
		if (val !== undefined && val !== oldValue) {
			// Use setTimeout to ensure DOM is updated
			setTimeout(() => this._scrollToSelectedTime(), 0)
		}
	}

	@state() timeSlots: TimeSlot[] = []
	@state() hoveredTime: number | null = null
	@state() viewMode: 'timeline' | 'list' = 'list'

	private availabilityService: AvailabilityService

	constructor() {
		super()
		this.availabilityService = new AvailabilityService()

		// Set initial view mode based on screen size
		this.viewMode = window.innerWidth < 768 ? 'list' : 'timeline'

		// Listen for window resize to adjust view mode
		window.addEventListener('resize', () => {
			this.viewMode = window.innerWidth < 768 ? 'list' : 'timeline'
		})
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		bookingContext.$.pipe(
			map(booking => booking.date),
			distinctUntilChanged(),
			takeUntil(this.disconnecting),
		).subscribe({
			next: date => this.loadTimeSlots(date),
		})

		// If there's a value already set, scroll to it when the component is first rendered
		if (this.value !== undefined) {
			setTimeout(() => this._scrollToSelectedTime(), 100)
		}
	}

	protected updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties)

		// If active state changes, we might need to scroll to the selected time
		if (changedProperties.has('active') && this.value !== undefined) {
			setTimeout(() => this._scrollToSelectedTime(), 0)
		}
	}

	// Load time slots for selected date from backend API
	async loadTimeSlots(date: string) {
		try {
			const formattedDate = dayjs(date).format('YYYY-MM-DD')

			// Get all courts availability for the selected date
			this.availabilityService.getAllCourtsAvailability(formattedDate).subscribe({
				next: courtsAvailability => {
					// Convert the backend availability data to time slots
					const slots: TimeSlot[] = []

					// If no courts have availability, use default hours (8AM-10PM)
					if (!courtsAvailability || Object.keys(courtsAvailability).length === 0) {
						// Create default time slots (8AM-10PM)
						for (let hour = 8; hour < 22; hour++) {
							const timeKey = `${hour.toString().padStart(2, '0')}:00`
							const value = hour * 60

							slots.push({
								label: timeKey,
								value,
								available: true, // Default to available
							})

							// Add half-hour slots for more granular selection
							const halfHourKey = `${hour.toString().padStart(2, '0')}:30`
							const halfHourValue = hour * 60 + 30

							slots.push({
								label: halfHourKey,
								value: halfHourValue,
								available: true,
							})
						}
					} else {
						// Get availability for first court as sample (we'll filter more specifically later)
						const firstCourtId = Object.keys(courtsAvailability)[0]
						const firstCourtSlots = courtsAvailability[firstCourtId]

						// Convert backend time format (HH:00) to minutes for our UI
						Object.entries(firstCourtSlots).forEach(([timeKey, timeSlot]) => {
							const [hour, minute] = timeKey.split(':').map(Number)
							const value = hour * 60 + (minute || 0)

							slots.push({
								label: timeKey,
								value,
								available: timeSlot.isAvailable,
							})
						})
					}

					// Sort by time
					slots.sort((a, b) => a.value - b.value)
					this.timeSlots = slots

					// If we already have a selected value, make sure we scroll to it
					if (this.value !== undefined) {
						setTimeout(() => this._scrollToSelectedTime(), 100)
					}
				},
				error: error => {
					console.error('Error loading time slots:', error)
					this._createDefaultTimeSlots()
				},
			})
		} catch (err) {
			console.error('Error loading time slots:', err)
			this._createDefaultTimeSlots()
		}
	}

	// Create default time slots (8AM-10PM with half-hour intervals)
	private _createDefaultTimeSlots() {
		const defaultSlots: TimeSlot[] = []
		for (let hour = 8; hour < 22; hour++) {
			const timeKey = `${hour.toString().padStart(2, '0')}:00`
			const value = hour * 60

			defaultSlots.push({
				label: timeKey,
				value,
				available: true,
			})

			// Add half-hour slots
			const halfHourKey = `${hour.toString().padStart(2, '0')}:30`
			const halfHourValue = hour * 60 + 30

			defaultSlots.push({
				label: halfHourKey,
				value: halfHourValue,
				available: true,
			})
		}

		this.timeSlots = defaultSlots

		// If we have a selected value, scroll to it
		if (this.value !== undefined) {
			setTimeout(() => this._scrollToSelectedTime(), 100)
		}
	}

	// Handle time selection and auto-scroll
	private _handleTimeSelect(slot: TimeSlot) {
		if (!slot.available) return

		this.value = slot.value
		this.dispatchEvent(new CustomEvent('change', { detail: slot }))

		if (this.onTimeSelected) {
			this.onTimeSelected(slot.value)
		}
	}

	private _handleTimeHover(slot: TimeSlot) {
		if (slot.available) {
			this.hoveredTime = slot.value
		}
	}

	private _handleTimeLeave() {
		this.hoveredTime = null
	}

	private _formatTimeDisplay(minutes: number): string {
		const timeObj = dayjs().startOf('day').add(minutes, 'minutes')
		return timeObj.format('h:mm A')
	}

	private _toggleViewMode() {
		this.viewMode = this.viewMode === 'timeline' ? 'list' : 'timeline'
	}

	// Scroll to the selected time slot and center it in the view
	private _scrollToSelectedTime() {
		if (this.value === undefined) return

		// Wait for next render cycle to ensure elements are available
		requestAnimationFrame(() => {
			try {
				// Find the selected time element
				const selectedTimeEl = this.shadowRoot?.querySelector(`[data-time-value="${this.value}"]`) as HTMLElement
				if (!selectedTimeEl) {
					console.debug('Selected time element not found')
					return
				}

				// Use the scrollIntoView API with options for better browser support
				selectedTimeEl.scrollIntoView({
					behavior: 'smooth',
					block: 'nearest',
					inline: 'center',
				})
			} catch (error) {
				console.error('Error scrolling to selected time:', error)
			}
		})
	}

	// Helper to get the popularity level based on time
	private _getPopularityLevel(slot: TimeSlot) {
		const hour = Math.floor(slot.value / 60)
		if (hour >= 17 && hour < 20) return 'high'
		if (hour >= 11 && hour < 14) return 'medium'
		return 'low'
	}

	// Group time slots by period (Morning, Afternoon, Evening)
	private _getSlotsByPeriod() {
		return {
			Morning: this.timeSlots.filter(slot => {
				const hour = Math.floor(slot.value / 60)
				return hour < 12
			}),
			Afternoon: this.timeSlots.filter(slot => {
				const hour = Math.floor(slot.value / 60)
				return hour >= 12 && hour < 17
			}),
			Evening: this.timeSlots.filter(slot => {
				const hour = Math.floor(slot.value / 60)
				return hour >= 17
			}),
		}
	}

	render() {
		// Determine start and end times from slots or use defaults
		const startTime = this.timeSlots.length > 0 ? Math.min(...this.timeSlots.map(slot => slot.value)) : 8 * 60

		const endTime = this.timeSlots.length > 0 ? Math.max(...this.timeSlots.map(slot => slot.value)) : 22 * 60

		const totalDuration = endTime - startTime

		// Get display time (either hovered, selected, or prompt)
		const displayTime =
			this.hoveredTime !== null
				? this._formatTimeDisplay(this.hoveredTime)
				: this.value !== undefined
				? this._formatTimeDisplay(this.value)
				: 'Select a time'

		// Group time slots by period for rendering
		const periodTimes = this._getSlotsByPeriod()

		// Container classes based on active state
		const containerClasses = {
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'py-6 px-4': this.active,
			'py-3 px-2': !this.active,
		}

		return html`
			<div class=${this.classMap(containerClasses)}>
				<!-- Title and View Toggle - Only shown when active -->
				${this.active
					? html`
							<div class="flex justify-between items-center mb-4">
								<schmancy-typography>
									<schmancy-typewriter> Select Time </schmancy-typewriter>
								</schmancy-typography>

								<!-- View toggle button -->
								<button
									@click=${this._toggleViewMode}
									class="text-sm text-primary-default hover:text-primary-hover focus:outline-none"
								>
									Switch to ${this.viewMode === 'timeline' ? 'List View' : 'Timeline View'}
								</button>
							</div>

							<!-- Time display -->
							<div class="flex justify-center mb-6">
								<div class="text-2xl font-bold text-primary-default">${displayTime}</div>
							</div>

							<!-- Active view uses selected view mode -->
							${this.viewMode === 'timeline'
								? this._renderTimeline(startTime, endTime, totalDuration, periodTimes)
								: this._renderListView(periodTimes)}
					  `
					: html`
							<!-- When inactive, show compact time display -->
							<div class="flex justify-center ${this.value !== undefined ? 'mb-2' : ''}">
								<div class="text-lg font-bold text-primary-default">${displayTime}</div>
							</div>

							<!-- Compact view always uses timeline -->
							${this._renderTimeline(startTime, endTime, totalDuration, periodTimes)}
					  `}
			</div>
		`
	}

	private _renderTimeline(
		startTime: number,
		endTime: number,
		totalDuration: number,
		periodTimes: Record<string, TimeSlot[]>,
	) {
		// Filter slots to include both hour and half-hour markers
		const timelineSlots = this.timeSlots.filter(slot => slot.value % 30 === 0)

		return html`
			<!-- Timeline with horizontal scroll -->
			<schmancy-scroll hide>
				<div class=${this.active ? 'flex gap-2 pb-2 pl-4 pr-4 mb-2' : 'flex gap-1 pb-1 pl-2 pr-2'}>
					${timelineSlots.map(slot => {
						const hour = Math.floor(slot.value / 60)
						const minute = slot.value % 60
						const isHalfHour = minute === 30
						const isSelected = this.value === slot.value

						// Build class map for time element - adjust size based on active state
						const timeClasses = {
							'flex-none': true,
							'rounded-lg': true,
							flex: true,
							'flex-col': true,
							'items-center': true,
							'justify-center': true,
							'transition-colors': true,
							relative: true,
							group: true,
							'cursor-pointer': slot.available,
							'cursor-not-allowed': !slot.available,
							'bg-primary-default text-primary-on': isSelected,
							'bg-surface-high text-surface-on': !isSelected && slot.available,
							'bg-gray-200 text-gray-400': !slot.available,
							// Different sizes based on active state and whether it's an hour or half-hour marker
							'w-16 h-20 py-3 px-1': this.active && !isHalfHour,
							'w-14 h-16 py-2 px-1': this.active && isHalfHour,
							'w-12 h-16 py-2 px-1': !this.active && !isHalfHour,
							'w-10 h-12 py-1 px-1': !this.active && isHalfHour,
						}

						// State layer classes for hover effect
						const stateLayerClasses = {
							'absolute inset-0 z-0 rounded-lg transition-opacity duration-200': true,
							'opacity-0 group-hover:opacity-8': slot.available, // Only show hover effect if available
							'bg-primary-on': isSelected,
							'bg-primary-default': !isSelected && slot.available,
						}

						// Determine popularity for the current time
						const popularity = this._getPopularityLevel(slot)

						// Adjust text sizes based on active state and hour/half-hour
						const timeTextClasses = {
							'font-bold': true,
							'text-lg': this.active && !isHalfHour,
							'text-base': (this.active && isHalfHour) || (!this.active && !isHalfHour),
							'text-sm': !this.active && isHalfHour,
						}

						const amPmClasses = {
							'font-medium': true,
							'text-xs': true,
						}

						return html`
							<div
								class=${this.classMap(timeClasses)}
								@click=${() => slot.available && this._handleTimeSelect(slot)}
								@mouseover=${() => slot.available && this._handleTimeHover(slot)}
								@mouseleave=${this._handleTimeLeave}
								data-time-value=${slot.value}
							>
								<!-- State layer for hover effects -->
								<div class=${this.classMap(stateLayerClasses)}></div>

								<!-- Time content with higher z-index -->
								<div class="relative z-10 pointer-events-none flex flex-col items-center">
									<div class=${this.classMap(timeTextClasses)}>
										${isHalfHour ? html`${hour > 12 ? hour - 12 : hour}:30` : html`${hour > 12 ? hour - 12 : hour}`}
									</div>
									<div class=${this.classMap(amPmClasses)}>${hour >= 12 ? 'PM' : 'AM'}</div>

									<!-- Popularity indicator dot - smaller or hidden in compact mode -->
									${slot.available && (this.active || !isHalfHour)
										? html`
												<div
													class="${isHalfHour ? 'w-2 h-2' : 'w-3 h-3'} rounded-full mt-1 ${popularity === 'high'
														? 'bg-orange-400'
														: popularity === 'medium'
														? 'bg-yellow-300'
														: 'bg-green-300'}"
												></div>
										  `
										: ''}
								</div>
							</div>
						`
					})}
				</div>
			</schmancy-scroll>

			<!-- Period markers and other elements - only show when active -->
			${this.active
				? html`
						<!-- Period markers -->
						<div class="flex justify-between mt-4 mb-2 border-t pt-4">
							${Object.entries(periodTimes).map(([period, slots]) => {
								if (slots.length === 0) return ''

								return html`
									<div class="flex flex-col items-center">
										<span class="text-sm font-medium text-gray-700">${period}</span>
										<span class="text-xs text-gray-500 mt-1">
											${slots.length > 0 ? this._formatTimeDisplay(slots[0].value) : ''} -
											${slots.length > 0 ? this._formatTimeDisplay(slots[slots.length - 1].value) : ''}
										</span>
									</div>
								`
							})}
						</div>

						<!-- Time range details -->
						<div class="flex justify-between text-xs text-gray-500 mb-4 px-4">
							<span>${this._formatTimeDisplay(startTime)}</span>
							<span>${this._formatTimeDisplay(endTime)}</span>
						</div>

						<!-- Popular times legend -->
						${this.timeSlots.some(slot => slot.available)
							? html`
									<div class="mt-4 pt-4 border-t px-4">
										<div class="flex justify-between items-center mb-2">
											<div class="text-sm font-medium text-gray-700">Popular Times</div>
											<div class="flex items-center space-x-4">
												<div class="flex items-center">
													<div class="w-3 h-3 rounded-full bg-green-300 mr-1"></div>
													<span class="text-xs">Less busy</span>
												</div>
												<div class="flex items-center">
													<div class="w-3 h-3 rounded-full bg-orange-400 mr-1"></div>
													<span class="text-xs">Busy</span>
												</div>
											</div>
										</div>
									</div>
							  `
							: ''}
				  `
				: ''}
		`
	}

	private _renderListView(periodTimes: Record<string, TimeSlot[]>) {
		// Regular list view (only used when active)
		return html`
			<!-- List View -->
			<div class="space-y-6">
				${Object.entries(periodTimes).map(([period, slots]) => {
					if (slots.length === 0) return ''

					return html`
						<div class="border-b pb-4 last:border-b-0">
							<h3 class="text-lg font-medium text-gray-700 mb-3">${period}</h3>
							<div class="grid grid-cols-2 gap-2">
								${slots.map(slot => {
									const popularity = this._getPopularityLevel(slot)

									return html`
										<button
											class="relative p-3 rounded-lg text-left transition-all duration-200
                        ${this.value === slot.value
												? 'bg-primary-default text-primary-on'
												: slot.available
												? 'bg-surface-high hover:bg-primary-default hover:bg-opacity-70 hover:text-primary-on'
												: 'bg-gray-200 text-gray-400 cursor-not-allowed'}"
											@click=${() => this._handleTimeSelect(slot)}
											@mouseover=${() => this._handleTimeHover(slot)}
											@mouseleave=${() => this._handleTimeLeave()}
											?disabled=${!slot.available}
											data-time-value=${slot.value}
										>
											<!-- Time text -->
											<span class="block text-sm font-medium">${this._formatTimeDisplay(slot.value)}</span>

											<!-- Popularity indicator -->
											${slot.available
												? html`
														<span
															class="absolute top-1 right-1 w-2 h-2 rounded-full ${popularity === 'high'
																? 'bg-orange-400'
																: popularity === 'medium'
																? 'bg-yellow-300'
																: 'bg-green-300'}"
														></span>
												  `
												: ''}
										</button>
									`
								})}
							</div>
						</div>
					`
				})}
			</div>

			<!-- Quick scroll indicators -->
			<div class="flex justify-center space-x-2 mt-4">
				${Object.keys(periodTimes).map(
					period => html`
						<button
							@click=${() => {
								// Scroll to section
								const sectionElement = this.shadowRoot?.querySelector(`h3:first-of-type`)
								if (sectionElement) {
									sectionElement.scrollIntoView({ behavior: 'smooth' })
								}
							}}
							class="w-8 h-8 flex items-center justify-center rounded-full
                bg-surface-high text-xs font-medium hover:bg-primary-default hover:text-primary-on"
						>
							${period.substring(0, 1)}
						</button>
					`,
				)}
			</div>
		`
	}
}
