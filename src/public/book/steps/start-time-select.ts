import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { distinctUntilChanged, map, takeUntil } from 'rxjs'
import { AvailabilityService } from '../../../bookingServices/availability.service'
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

	private availabilityService: AvailabilityService

	constructor() {
		super()
		this.availabilityService = new AvailabilityService()

		// Always use timeline view for now
		this.viewMode = 'timeline'
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

					// If no courts have availability, use default hours (12PM-10PM)
					if (!courtsAvailability || Object.keys(courtsAvailability).length === 0) {
						this._createDefaultTimeSlots()
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

						// Sort by time
						slots.sort((a, b) => a.value - b.value)
						this.timeSlots = slots
					}

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

	// Create default time slots (12PM-10PM with half-hour intervals)
	private _createDefaultTimeSlots() {
		const defaultSlots: TimeSlot[] = []
		// Start from 12PM (noon)
		for (let hour = 12; hour < 22; hour++) {
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

	// private _toggleViewMode() {
	// 	this.viewMode = this.viewMode === 'timeline' ? 'list' : 'timeline'
	// }

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

	// Helper function to group time slots into 2-hour blocks
	// private _getTimeSlotBlocks() {
	// 	const blocks: TimeSlot[][] = []
	// 	let currentBlock: TimeSlot[] = []
	// 	let currentBlockStartHour = -1

	// 	// Sort slots by time
	// 	const sortedSlots = [...this.timeSlots].sort((a, b) => a.value - b.value)

	// 	for (const slot of sortedSlots) {
	// 		const slotHour = Math.floor(slot.value / 60)
	// 		// Determine which 2-hour block this slot belongs to (0-1, 2-3, 4-5, etc.)
	// 		const blockIndex = Math.floor(slotHour / 2)

	// 		if (currentBlockStartHour === -1 || Math.floor(currentBlockStartHour / 2) !== blockIndex) {
	// 			// If we have slots in the current block, add it to our blocks array
	// 			if (currentBlock.length > 0) {
	// 				blocks.push([...currentBlock])
	// 			}

	// 			// Start a new block
	// 			currentBlock = [slot]
	// 			currentBlockStartHour = slotHour
	// 		} else {
	// 			// Add to current block
	// 			currentBlock.push(slot)
	// 		}
	// 	}

	// 	// Add the last block if it has slots
	// 	if (currentBlock.length > 0) {
	// 		blocks.push(currentBlock)
	// 	}

	// 	return blocks
	// }

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

		// For inactive state, we'll just use the timeline view
		// const displayMode = !this.active ? 'timeline' : this.viewMode

		return html`
			<div class=${this.classMap(containerClasses)}>
				<!-- Title and View Toggle - Only shown when active -->
				${this.active
					? html`
							<div class="flex justify-between items-center mb-5">
								<div class="text-lg font-medium">Select Time</div>
								<!-- View toggle button removed for now -->
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

	// private _renderListView() {
	// 	// Get time slots organized in 2-hour blocks
	// 	const timeBlocks = this._getTimeSlotBlocks()

	// 	return html`
	// 		<div class="pb-4">
	// 			${timeBlocks.map(block => {
	// 				if (block.length === 0) return ''

	// 				const startTime = this._formatTimeDisplay(block[0].value)
	// 				const endTime = this._formatTimeDisplay(block[block.length - 1].value)

	// 				return html`
	// 					<div class="mb-5 last:mb-0">
	// 						<!-- Block header -->
	// 						<div class="text-sm font-medium text-primary-default mb-2">${startTime} - ${endTime}</div>

	// 						<!-- Block time slots grid -->
	// 						<div class="grid grid-cols-4 gap-2">
	// 							${block.map(slot => {
	// 								const isSelected = this.value === slot.value

	// 								return html`
	// 									<button
	// 										class="p-3 rounded-lg text-center transition-all duration-200
	//                     ${isSelected
	// 											? 'bg-primary-default text-primary-on shadow-sm'
	// 											: slot.available
	// 											? 'bg-surface-high hover:bg-primary-default hover:bg-opacity-70 hover:text-primary-on hover:shadow-sm'
	// 											: 'bg-gray-200 text-gray-400 cursor-not-allowed'}"
	// 										@click=${() => this._handleTimeSelect(slot)}
	// 										@mouseover=${() => this._handleTimeHover(slot)}
	// 										@mouseleave=${this._handleTimeLeave}
	// 										?disabled=${!slot.available}
	// 										data-time-value=${slot.value}
	// 									>
	// 										<span class="block text-sm font-medium"> ${this._formatTimeDisplay(slot.value)} </span>
	// 									</button>
	// 								`
	// 							})}
	// 						</div>
	// 					</div>
	// 				`
	// 			})}
	// 		</div>
	// 	`
	// }
}
