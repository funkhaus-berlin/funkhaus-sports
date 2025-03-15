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
	@property({ type: Number }) value?: number
	@property({ attribute: false }) onTimeSelected?: (time: number) => void
	@state() timeSlots: TimeSlot[] = []

	private availabilityService: AvailabilityService
	constructor() {
		super()
		this.availabilityService = new AvailabilityService()
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		bookingContext.$.pipe(
			map(booking => booking.date),
			distinctUntilChanged(),
			takeUntil(this.disconnecting),
		).subscribe({ next: date => this.loadTimeSlots(date) })
	}

	// Load time slots for selected date from backend API
	async loadTimeSlots(date: string) {
		try {
			const formattedDate = dayjs(date).format('YYYY-MM-DD')

			// Get all courts availability for the selected date
			// Use default operating hours 8AM-10PM (8-22)
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
				},
				error: error => {
					console.error('Error loading time slots:', error)
				},
			})
		} catch (err) {
			console.error('Error loading time slots:', err)

			// Create default time slots on error (8AM-10PM)
			const defaultSlots: TimeSlot[] = []
			for (let hour = 8; hour < 22; hour++) {
				const timeKey = `${hour.toString().padStart(2, '0')}:00`
				const value = hour * 60

				defaultSlots.push({
					label: timeKey,
					value,
					available: true, // Default to available
				})
			}

			this.timeSlots = defaultSlots
		}
	}

	private _handleTimeSelect(slot: TimeSlot) {
		if (!slot.available) return

		this.dispatchEvent(new CustomEvent('change', { detail: slot }))

		if (this.onTimeSelected) {
			this.onTimeSelected(slot.value)
		}
	}

	render() {
		return html`
			<div class="w-full max-w-full bg-surface-low py-4 rounded-lg">
				<!-- Title -->
				<schmancy-typography class="mb-4 px-4">
					<schmancy-typewriter> Select Time </schmancy-typewriter>
				</schmancy-typography>

				<div class="grid grid-cols-3 gap-4 px-4">
					${this.timeSlots.map(slot => {
						const timeObj = dayjs().startOf('day').add(slot.value, 'minutes')
						const hourMin = timeObj.format('h:mm')
						const period = timeObj.format('A')

						const isAvailable = slot.available
						const isSelected = this.value === slot.value

						const timeClasses = {
							'flex-none': true,
							'py-3': true,
							'px-1': true,
							'rounded-xl': true,
							flex: true,
							'flex-col': true,
							'items-center': true,
							'justify-center': true,
							'transition-colors': true,
							'cursor-pointer': isAvailable,
							'cursor-not-allowed': !isAvailable,
							'bg-primary-default text-primary-on': isSelected && isAvailable,
							'bg-surface-high text-surface-on': !isSelected && isAvailable,
							'bg-gray-100 text-gray-400': !isAvailable,
							relative: true,
							group: isAvailable,
						}

						// State layer classes for hover effect
						const stateLayerClasses = {
							absolute: true,
							'inset-0': true,
							'z-0': true,
							'rounded-xl': true,
							'transition-opacity': true,
							'duration-200': true,
							'opacity-0': true,
							'hover:opacity-8 group-hover:opacity-8': isAvailable,
							'bg-primary-on': isSelected,
							'bg-primary-default': !isSelected,
						}

						return html`
							<div @click=${() => isAvailable && this._handleTimeSelect(slot)} class=${this.classMap(timeClasses)}>
								<!-- State layer for hover effects -->
								${isAvailable ? html`<div class=${this.classMap(stateLayerClasses)}></div>` : ''}

								<!-- Time content with higher z-index to stay above state layer -->
								<div class="relative z-10 pointer-events-none">
									<schmancy-typography> ${hourMin} </schmancy-typography>
									<schmancy-typography> ${period} </schmancy-typography>
								</div>
							</div>
						`
					})}
				</div>
			</div>
		`
	}
}
