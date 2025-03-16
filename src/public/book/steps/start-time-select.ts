// src/public/book/steps/start-time-select.ts

import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { distinctUntilChanged, map, takeUntil, switchMap, tap, catchError } from 'rxjs'
import { AvailabilityService } from '../../../bookingServices/availability'
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
	// Always use timeline view for now
	@state() viewMode: 'timeline' | 'list' = 'timeline'
	@state() loading: boolean = false
	@state() error: string | null = null

	private availabilityService: AvailabilityService

	constructor() {
		super()
		this.availabilityService = new AvailabilityService()

		// Always use timeline view for now
		this.viewMode = 'timeline'
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Subscribe to date changes from the booking context
		bookingContext.$.pipe(
			map(booking => booking.date),
			distinctUntilChanged(),
			tap(() => {
				// Show loading state when date changes
				this.loading = true
				// Reset current time slots while loading
				this.timeSlots = []
			}),
			switchMap(date => {
				if (!date) return []

				// Load time slots for the selected date for all courts
				return this.availabilityService.getAllCourtsAvailability(date).pipe(
					// Handle errors gracefully
					catchError(err => {
						console.error('Error loading time slots:', err)
						this.error = 'Unable to load available time slots. Please try again.'
						this.loading = false
						return []
					}),
				)
			}),
			takeUntil(this.disconnecting),
		).subscribe({
			next: courtsAvailability => {
				this.error = null
				this.loading = false

				if (!courtsAvailability || Object.keys(courtsAvailability).length === 0) {
					this._createDefaultTimeSlots()
					return
				}

				// Process the availability data
				this._processAvailabilityData(courtsAvailability)

				// If we already have a selected value, make sure we scroll to it
				if (this.value !== undefined) {
					setTimeout(() => this._scrollToSelectedTime(), 100)
				}
			},
			error: err => {
				console.error('Error in subscription:', err)
				this.error = 'An error occurred. Please try again.'
				this.loading = false
				this._createDefaultTimeSlots()
			},
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

	/**
	 * Process availability data from all courts to create time slots
	 * @param courtsAvailability - Availability data for all courts
	 */
	private _processAvailabilityData(courtsAvailability: Record<string, Record<string, { isAvailable: boolean }>>) {
		// Start with an empty array
		const slots: TimeSlot[] = []

		// If no courts are available, use default slots
		if (Object.keys(courtsAvailability).length === 0) {
			this._createDefaultTimeSlots()
			return
		}

		// Get all unique time slots from all courts
		const allTimeSlots = new Set<string>()
		Object.values(courtsAvailability).forEach(courtSlots => {
			Object.keys(courtSlots).forEach(timeKey => {
				allTimeSlots.add(timeKey)
			})
		})

		// Convert time slots to a sorted array
		const sortedTimeSlots = Array.from(allTimeSlots).sort()

		// For each time slot, check if it's available in ANY court
		sortedTimeSlots.forEach(timeKey => {
			const [hour, minute] = timeKey.split(':').map(Number)
			const value = hour * 60 + (minute || 0)

			// A slot is available if at least one court has it available
			const isAvailable = Object.values(courtsAvailability).some(courtSlots => courtSlots[timeKey]?.isAvailable)

			slots.push({
				label: timeKey,
				value,
				available: isAvailable,
			})
		})

		// Sort by time
		slots.sort((a, b) => a.value - b.value)
		this.timeSlots = slots
	}

	/**
	 * Create default time slots (8AM-10PM with half-hour intervals)
	 * Used as a fallback when no data is available
	 */
	private _createDefaultTimeSlots() {
		const defaultSlots: TimeSlot[] = []

		// Business hours: 8AM to 10PM
		for (let hour = 8; hour < 22; hour++) {
			// Full hour slot
			const timeKey = `${hour.toString().padStart(2, '0')}:00`
			const value = hour * 60

			defaultSlots.push({
				label: timeKey,
				value,
				available: true,
			})

			// Half-hour slot
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

	/**
	 * Handle time selection and dispatch events
	 */
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

	/**
	 * Format time for display
	 */
	private _formatTimeDisplay(minutes: number): string {
		const timeObj = dayjs().startOf('day').add(minutes, 'minutes')
		return timeObj.format('h:mm A')
	}

	/**
	 * Scroll to the selected time slot and center it
	 */
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

	render() {
		// Container classes based on active state
		const containerClasses = {
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'shadow-sm': true,
			'py-6 px-4': this.active,
			'py-3 px-2': !this.active,
		}

		return html`
			<div class=${this.classMap(containerClasses)}>
				<!-- Title and View Toggle - Only shown when active -->
				${this.active
					? html`
							<div class="flex justify-between items-center mb-5">
								<div class="text-lg font-medium">Select Time</div>
							</div>
					  `
					: this.value !== undefined
					? html`
							<!-- When inactive but has a selected time, show it -->
							<div class="text-base font-medium mb-3 text-center">${this._formatTimeDisplay(this.value)}</div>
					  `
					: html`
							<!-- When inactive with no selection -->
							<div class="text-base font-medium mb-3 text-center">Time</div>
					  `}

				<!-- Loading State -->
				${this.loading
					? html`
							<div class="flex justify-center items-center py-8">
								<schmancy-spinner size="32px"></schmancy-spinner>
							</div>
					  `
					: this.error
					? html`
							<div class="text-error-default text-center py-4">
								${this.error}
								<div class="mt-2">
									<schmancy-button variant="outlined" @click=${() => this._createDefaultTimeSlots()}>
										Show Default Times
									</schmancy-button>
								</div>
							</div>
					  `
					: html`
							<!-- Always use timeline view -->
							${this._renderTimeline()}

							<!-- Simple time range indicator - only when active -->
							${this.active && this.timeSlots.length > 0
								? html`
										<div class="flex justify-between text-xs text-gray-500 mt-4 px-4 pt-2 border-t">
											<span>From ${this._formatTimeDisplay(this.timeSlots[0].value)}</span>
											<span>To ${this._formatTimeDisplay(this.timeSlots[this.timeSlots.length - 1].value)}</span>
										</div>
								  `
								: ''}
					  `}
			</div>
		`
	}

	private _renderTimeline() {
		// Filter slots to include only the hour and half-hour markers
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

						// Classes for time slots - adjust size based on active state
						const slotClasses = {
							'flex-none': true,
							'rounded-lg': true,
							flex: true,
							'flex-col': true,
							'items-center': true,
							'justify-center': true,
							'transition-colors': true,
							'duration-200': true,
							relative: true,
							'cursor-pointer': slot.available,
							'cursor-not-allowed': !slot.available,
							'bg-primary-default text-primary-on': isSelected,
							'bg-surface-high text-surface-on': !isSelected && slot.available,
							'bg-gray-200 text-gray-400': !slot.available,
							'shadow-sm': isSelected,
							'hover:shadow-sm': slot.available && !isSelected,
							// Different sizes based on active state and whether it's an hour or half-hour marker
							'w-16 h-20 py-3 px-1': this.active && !isHalfHour,
							'w-14 h-16 py-2 px-1': this.active && isHalfHour,
							'w-12 h-16 py-2 px-1': !this.active && !isHalfHour,
							'w-10 h-12 py-1 px-1': !this.active && isHalfHour,
						}

						// Text size classes based on active state
						const textClasses = {
							'font-bold': true,
							'text-base': this.active && !isHalfHour,
							'text-sm': (this.active && isHalfHour) || (!this.active && !isHalfHour),
							'text-xs': !this.active && isHalfHour,
						}

						const subTextClasses = {
							'font-medium': true,
							'text-xs': this.active,
							'text-xs opacity-75': !this.active,
						}

						return html`
							<div
								class=${this.classMap(slotClasses)}
								@click=${() => slot.available && this._handleTimeSelect(slot)}
								@mouseover=${() => slot.available && this._handleTimeHover(slot)}
								@mouseleave=${this._handleTimeLeave}
								data-time-value=${slot.value}
							>
								<!-- Availability indicator dot at the top -->
								${this.active
									? html`
											<div
												class="absolute top-1 right-1 w-2 h-2 rounded-full ${slot.available
													? 'bg-success-default'
													: 'bg-error-default'}"
											></div>
									  `
									: ''}

								<div class=${this.classMap(textClasses)}>
									${isHalfHour ? html`${hour > 12 ? hour - 12 : hour}:30` : html`${hour > 12 ? hour - 12 : hour}`}
								</div>
								<div class=${this.classMap(subTextClasses)}>${hour >= 12 ? 'PM' : 'AM'}</div>
							</div>
						`
					})}
				</div>
			</schmancy-scroll>
		`
	}
}
