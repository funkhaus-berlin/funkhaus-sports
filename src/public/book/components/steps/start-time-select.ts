import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { css, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { createRef, ref, Ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'
import { takeUntil } from 'rxjs'
import {
	availabilityContext,
	AvailabilityData,
	availabilityLoading$,
	getAvailableTimeSlots,
} from 'src/availability-context'
import { BookingFlowType } from 'src/types'
import { toUTC } from 'src/utils/timezone'
import { transitionToNextStep } from '../../booking-steps-utils'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'
import { TimeSlot } from '../../types'

// Configure dayjs with timezone plugins
dayjs.extend(utc)
dayjs.extend(timezone)

// Animation for selected time slot
const PULSE_ANIMATION = {
	keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }],
	options: { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
}

// Utility functions
function getUserTimezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'
	} catch {
		return 'Europe/Berlin'
	}
}

function toUserTimezone(isoString: string): dayjs.Dayjs {
	return dayjs(isoString).tz(getUserTimezone())
}

/**
 * Simplified time selection component
 */
@customElement('time-selection-step')
export class TimeSelectionStep extends $LitElement(css`
	:host {
		display: block;
		position: relative;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
	.view-container {
		position: relative;
		min-height: 45px;
	}
	.grid-view, .list-view {
		opacity: 0;
		visibility: hidden;
		transition: opacity 100ms ease, visibility 0ms 100ms;
		position: absolute;
		width: 100%;
		top: 0;
		left: 0;
	}
	.grid-view.active, .list-view.active {
		opacity: 1;
		visibility: visible;
		transition: opacity 100ms ease, visibility 0ms;
		position: relative;
	}
`) {
	@property({ type: Boolean }) active = true
	@property({ type: Boolean }) hidden = false

	@select(bookingContext) booking!: Booking
	@select(BookingProgressContext) bookingProgress!: BookingProgress
	@select(availabilityContext) availability!: AvailabilityData

	// Core state
	@state() timeSlots: TimeSlot[] = []
	@state() loading = true
	@state() error: string | null = null
	@state() viewMode: 'grid' | 'list' = 'grid'
	@state() isExpanded = false
	@state() isDesktopOrTablet = window.innerWidth >= 768

	// DOM refs
	private scrollContainerRef: Ref<HTMLElement> = createRef<HTMLElement>()
	private timeSlotRefs = new Map<number, HTMLElement>()
	private resizeObserver: ResizeObserver | null = null

	connectedCallback(): void {
		super.connectedCallback()
		this.setupObservers()
	}

	disconnectedCallback(): void {
		super.disconnectedCallback()
		this.resizeObserver?.disconnect()
		this.timeSlotRefs.clear()
	}

	private setupObservers(): void {
		// Watch screen size changes
		this.resizeObserver = new ResizeObserver(() => {
			const newIsDesktop = window.innerWidth >= 768
			if (this.isDesktopOrTablet !== newIsDesktop) {
				this.isDesktopOrTablet = newIsDesktop
				if (!newIsDesktop && this.viewMode === 'grid') {
					this.viewMode = 'list'
				}
			}
		})
		this.resizeObserver.observe(document.body)

		// Watch booking progress
		BookingProgressContext.$.pipe(takeUntil(this.disconnecting)).subscribe(progress => {
			this.isExpanded = progress.expandedSteps.includes(BookingStep.Time)
		})

		// Watch booking context for data changes
		bookingContext.$.pipe(takeUntil(this.disconnecting)).subscribe(booking => {
			if (booking?.date && booking?.venueId) {
				this.loadTimeSlots()
			}
			// Update view mode based on selection
			const hasSelection = !!booking?.startTime
			if (hasSelection || !this.isDesktopOrTablet) {
				this.viewMode = 'list'
				this.scrollToSelectedTime()
			} else if (this.isDesktopOrTablet) {
				this.viewMode = 'grid'
			}
		})

		// Watch availability loading state
		availabilityLoading$.pipe(takeUntil(this.disconnecting)).subscribe(loading => {
			this.loading = loading
		})
	}

	private loadTimeSlots(): void {
		if (!this.booking?.date || !this.booking?.venueId) return

		this.loading = true
		this.error = null

		try {
			const slots = this.availability.bookingFlowType === BookingFlowType.DATE_COURT_TIME_DURATION && this.booking.courtId
				? getAvailableTimeSlots(this.booking.courtId)
				: getAvailableTimeSlots()

			if (slots.length > 0) {
				this.timeSlots = slots
				this.error = this.availability.error
			} else {
				this.timeSlots = this.generateEstimatedSlots()
				this.error = 'No valid time options available for this date. Please select a different date.'
			}
		} catch (error) {
			console.error('Error loading time slots:', error)
			this.timeSlots = this.generateEstimatedSlots()
			this.error = 'Error determining available times. Using estimates instead.'
		} finally {
			this.loading = false
		}
	}

	private generateEstimatedSlots(): TimeSlot[] {
		const userTimezone = getUserTimezone()
		const selectedDate = dayjs(this.booking.date).tz(userTimezone)
		const now = dayjs().tz(userTimezone)
		const isToday = selectedDate.format('YYYY-MM-DD') === now.format('YYYY-MM-DD')

		let startHour = 8
		let startMinute = 0

		if (isToday) {
			startHour = now.hour()
			startMinute = now.minute() < 30 ? 30 : 0
			if (startMinute === 0) startHour += 1
			if (startHour >= 22) return []
		}

		const slots: TimeSlot[] = []
		for (let hour = startHour; hour <= 22; hour++) {
			const minutes = hour === startHour ? [startMinute, startMinute === 0 ? 30 : null].filter(Boolean) : [0, 30]
			for (const minute of minutes as number[]) {
				if (hour === 22 && minute > 0) continue
				slots.push({
					label: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
					value: hour * 60 + minute,
					available: true,
				})
			}
		}
		return slots
	}

	private handleTimeSelect(slot: TimeSlot): void {
		if (!slot.available) return

		const isCurrentlySelected = this.isTimeSelected(slot)
		
		if (isCurrentlySelected) {
			// Unselect current time
			bookingContext.set({ startTime: '', endTime: '' }, true)
			this.animateSlot(slot.value)
			return
		}

		// Select new time
		const hour = Math.floor(slot.value / 60)
		const minute = slot.value % 60
		const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
		const newStartTime = toUTC(this.booking.date, timeString)

		// Calculate end time if duration exists
		let newEndTime = ''
		if (this.booking.endTime && this.booking.startTime) {
			const oldDuration = dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minute')
			if (oldDuration > 0) {
				newEndTime = dayjs(newStartTime).add(oldDuration, 'minute').toISOString()
			}
		}

		bookingContext.set({ startTime: newStartTime, endTime: newEndTime }, true)
		this.animateSlot(slot.value)
		transitionToNextStep('Time')

		this.dispatchEvent(new CustomEvent('next', { bubbles: true, composed: true }))
	}

	private isTimeSelected(slot: TimeSlot): boolean {
		if (!this.booking?.startTime) return false
		const localStartTime = toUserTimezone(this.booking.startTime)
		const timeValue = localStartTime.hour() * 60 + localStartTime.minute()
		return timeValue === slot.value
	}

	private animateSlot(slotValue: number): void {
		const element = this.timeSlotRefs.get(slotValue)
		element?.animate(PULSE_ANIMATION.keyframes, PULSE_ANIMATION.options)
	}

	private scrollToSelectedTime(): void {
		if (!this.booking?.startTime || this.viewMode !== 'list') return
		
		setTimeout(() => {
			const localTime = toUserTimezone(this.booking.startTime)
			const timeValue = localTime.hour() * 60 + localTime.minute()
			const element = this.timeSlotRefs.get(timeValue)
			const container = this.scrollContainerRef.value

			if (container && element) {
				const elementOffset = element.offsetLeft
				const elementWidth = element.offsetWidth
				const containerWidth = container.clientWidth
				const scrollPosition = elementOffset - containerWidth / 2 + elementWidth / 2

				container.scrollTo({ left: scrollPosition, behavior: 'smooth' })
			}
		}, 100)
	}

	private renderTimeSlot(slot: TimeSlot) {
		const isSelected = this.isTimeSelected(slot)
		const timeSlotRef = (element: Element | undefined) => {
			if (element) this.timeSlotRefs.set(slot.value, element as HTMLElement)
		}

		return html`
			<selection-tile
				${ref(timeSlotRef)}
				?selected=${isSelected}
				?compact=${!this.isDesktopOrTablet}
				type="time"
				icon="schedule"
				label=${slot.label}
				dataValue=${slot.value?.toString()}
				@click=${() => this.handleTimeSelect(slot)}
				?disabled=${!slot.available}>
			</selection-tile>
		`
	}

	private renderGridView(slots: TimeSlot[]) {
		return html`
			<div class="grid grid-cols-5 sm:grid-cols-6 gap-3 py-2" role="listbox">
				${repeat(slots, slot => slot.value, slot => this.renderTimeSlot(slot))}
			</div>
		`
	}

	private renderListView(slots: TimeSlot[]) {
		// Ensure minimum 5 slots for consistent layout
		const displaySlots = slots.length >= 5 ? slots : [
			...slots,
			...Array(5 - slots.length).fill({ placeholder: true })
		]

		return html`
			<div
				${ref(this.scrollContainerRef)}
				class="grid grid-flow-col py-2 overflow-x-auto scrollbar-hide gap-3"
				role="listbox">
				${repeat(displaySlots, (item, index) => 
					'placeholder' in item ? `placeholder-${index}` : item.value,
					item => 'placeholder' in item 
						? html`<div class="w-14 h-10 invisible"></div>`
						: this.renderTimeSlot(item)
				)}
			</div>
		`
	}

	render() {
		if (this.hidden) return nothing

		const { timeSlots, loading, error, viewMode, isExpanded } = this

		if (!loading && timeSlots.length === 0) {
			return html`
				<div class="text-center py-6 grid gap-4 justify-center">
					<schmancy-icon size="48px" class="text-surface-on-variant opacity-50">schedule</schmancy-icon>
					<schmancy-typography type="body" token="md">No time slots available for this date.</schmancy-typography>
				</div>
			`
		}

		return html`
			<div class="w-full bg-surface-low/50 rounded-lg transition-all duration-300 p-2 ${isExpanded ? 'block' : 'hidden'}">
				${error ? html`
					<div class="bg-error-container p-2 rounded-t-lg text-error-on-container text-sm text-center mb-3">
						${error}
						<button @click=${() => this.loadTimeSlots()} class="ml-2 underline font-medium">Refresh</button>
					</div>
				` : nothing}

				${timeSlots.length > 0 ? html`
					<div class="flex items-center justify-between mb-2">
						<schmancy-typography type="label" token="lg" class="font-medium text-primary-default">
							Select Time
						</schmancy-typography>
						<div class="text-xs text-surface-on-variant">
							Times shown in your local timezone (${getUserTimezone()})
						</div>
					</div>
				` : nothing}

				<div class="view-container">
					<div class="grid-view ${viewMode === 'grid' ? 'active' : ''}">
						${this.renderGridView(timeSlots)}
					</div>
					<div class="list-view ${viewMode === 'list' ? 'active' : ''}">
						${this.renderListView(timeSlots)}
					</div>
				</div>
			</div>
		`
	}
}