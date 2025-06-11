import { $notify, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { collection, doc } from 'firebase/firestore'
import { css, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { createRef, ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'
import { catchError, combineLatest, of, takeUntil } from 'rxjs'
import { map, tap } from 'rxjs/operators'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { availabilityContext } from 'src/availability-context'
import { BookingService } from 'src/bookingServices/booking.service'
import { db } from 'src/firebase/firebase'
import { Court } from 'src/types/booking/court.types'
import { transitionToNextStep } from '../../booking-steps-utils'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'
import { Duration } from '../../types'
import { Venue } from 'src/types'

const DURATION_LABELS: Record<number, { full: string; compact: string }> = {
	30: { full: '30 minutes', compact: '30m' },
	60: { full: '1 hour', compact: '1h' },
	90: { full: '1.5 hours', compact: '1.5h' },
	120: { full: '2 hours', compact: '2h' },
	150: { full: '2.5 hours', compact: '2.5h' },
	180: { full: '3 hours', compact: '3h' },
	210: { full: '3.5 hours', compact: '3.5h' },
	240: { full: '4 hours', compact: '4h' },
	270: { full: '4.5 hours', compact: '4.5h' },
	300: { full: '5 hours', compact: '5h' },
}

/**
 * Simplified duration selection component
 */
@customElement('duration-selection-step')
export class DurationSelectionStep extends $LitElement(css`
	:host {
		display: block;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
`) {
	@property({ type: Boolean }) hidden = false

	@select(bookingContext) booking!: Booking
	@select(courtsContext) courts!: Map<string, Court>
	@select(BookingProgressContext) bookingProgress!: BookingProgress
	@select(availabilityContext) availability!: typeof availabilityContext.value
	@select(venuesContext) venues!: Map<string, Venue>

	// Core state
	@state() durations: Duration[] = []
	@state() loading = true
	@state() isExpanded = false
	@state() isCreatingBooking = false
	@state() isMobileScreen = window.innerWidth < 768

	// DOM refs
	private scrollContainerRef = createRef<HTMLElement>()
	private durationRefs = new Map<number, HTMLElement>()
	private bookingService = new BookingService()

	connectedCallback(): void {
		super.connectedCallback()
		
		// Watch screen size changes
		const checkScreenSize = () => {
			const newIsMobile = window.innerWidth < 768
			if (this.isMobileScreen !== newIsMobile) {
				this.isMobileScreen = newIsMobile
			}
		}
		window.addEventListener('resize', checkScreenSize)

		// Main reactive pipeline
		combineLatest([
			bookingContext.$,
			availabilityContext.$,
			venuesContext.$,
			courtsContext.$,
			BookingProgressContext.$
		]).pipe(
			takeUntil(this.disconnecting),
			map(([booking, _, __, ___, progress]) => {
				// Update expanded state
				this.isExpanded = progress.expandedSteps.includes(BookingStep.Duration)
				
				// Calculate durations if we have required data
				if (booking?.date && booking?.startTime && booking?.venueId) {
					const durations = this.calculateAvailableDurations()
					return { durations, booking }
				}
				
				return { durations: [], booking }
			}),
			tap(({ durations, booking }) => {
				this.durations = durations
				this.loading = false
				
				// Scroll to selected duration if exists
				if (booking?.endTime) {
					setTimeout(() => this.scrollToSelectedDuration(), 250)
				}
				
				// Validate current selection
				if (booking?.endTime) {
					const currentDuration = this.getCurrentDuration()
					const isValid = durations.some(d => d.value === currentDuration)
					
					if (!isValid && currentDuration > 0) {
						console.log('Selected duration is no longer valid, clearing selection')
						bookingContext.set({ endTime: '', price: 0 }, true)
					}
				}
			})
		).subscribe()
	}

	disconnectedCallback(): void {
		super.disconnectedCallback()
		this.durationRefs.clear()
	}


	private calculateAvailableDurations(): Duration[] {
		if (!this.booking?.startTime || !this.booking?.date || !this.booking?.venueId) {
			return []
		}

		const venue = this.venues.get(this.booking.venueId)
		if (!venue) return []

		// Get venue closing time
		const dayOfWeek = dayjs(this.booking.date).format('dddd').toLowerCase()
		const operatingHours = venue.operatingHours?.[dayOfWeek as keyof typeof venue.operatingHours]
		const closeHour = operatingHours?.close ? parseInt(operatingHours.close.split(':')[0]) : 22
		const closeMinute = operatingHours?.close ? parseInt(operatingHours.close.split(':')[1] || '0') : 0
		const closingMinutes = closeHour * 60 + closeMinute

		// Get start time in minutes
		const startTimeDayjs = dayjs(this.booking.startTime)
		const startMinutes = startTimeDayjs.hour() * 60 + startTimeDayjs.minute()

		// Standard durations
		const standardDurations = [
			{ label: '30m', value: 30 },
			{ label: '1h', value: 60 },
			{ label: '1.5h', value: 90 },
			{ label: '2h', value: 120 },
			{ label: '2.5h', value: 150 },
			{ label: '3h', value: 180 },
			{ label: '3.5h', value: 210 },
			{ label: '4h', value: 240 },
			{ label: '4.5h', value: 270 },
			{ label: '5h', value: 300 },
		]

		// Get bookings from availability context
		const bookings = this.availability?.bookings || []

		// Filter available durations
		const durations = standardDurations
			.map(duration => {
				// Check if duration would exceed closing time
				if (startMinutes + duration.value > closingMinutes) {
					return null
				}

				const endTime = startTimeDayjs.add(duration.value, 'minute')

				// If court is already selected, check if duration is available for that court
				if (this.booking.courtId) {
					// Check for conflicts with existing bookings
					const hasConflict = bookings.some(existingBooking => {
						if (existingBooking.courtId !== this.booking.courtId) return false
						
						const existingStart = dayjs(existingBooking.startTime)
						const existingEnd = dayjs(existingBooking.endTime)
						
						// Check for overlap
						return startTimeDayjs.isBefore(existingEnd) && endTime.isAfter(existingStart)
					})
					
					if (hasConflict) return null
					
					// Calculate price for the specific court
					const court = this.courts.get(this.booking.courtId)
					if (!court) return null
					
					// Calculate price inline
					const durationHours = endTime.diff(startTimeDayjs, 'hour', true)
					const basePrice = court.pricing?.baseHourlyRate || 50
					const price = Math.round(basePrice * durationHours * 100) / 100
					
					return {
						...duration,
						price
					}
				} else {
					// No court selected - check if any court is available for this duration
					const activeCourts = Array.from(this.courts.values())
						.filter(court => court.status === 'active' && court.venueId === this.booking.venueId)
					
					let totalPrice = 0
					let availableCourtCount = 0
					
					for (const court of activeCourts) {
						const hasConflict = bookings.some(existingBooking => {
							if (existingBooking.courtId !== court.id) return false
							
							const existingStart = dayjs(existingBooking.startTime)
							const existingEnd = dayjs(existingBooking.endTime)
							
							return startTimeDayjs.isBefore(existingEnd) && endTime.isAfter(existingStart)
						})
						
						if (!hasConflict) {
							availableCourtCount++
							// Calculate price inline
							const durationHours = endTime.diff(startTimeDayjs, 'hour', true)
							const basePrice = court.pricing?.baseHourlyRate || 50
							totalPrice += Math.round(basePrice * durationHours * 100) / 100
						}
					}
					
					if (availableCourtCount === 0) return null
					
					return {
						...duration,
						price: Math.round((totalPrice / availableCourtCount + Number.EPSILON) * 100) / 100
					}
				}
			})
			.filter(Boolean) as Duration[]

		return durations
	}

	private getCurrentDuration(): number {
		if (!this.booking?.startTime || !this.booking?.endTime) return 0
		return Math.max(0, dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minute'))
	}

	private handleDurationSelect(duration: Duration): void {
		if (!this.booking?.startTime) return
		
		const endTime = dayjs(this.booking.startTime)
			.add(duration.value, 'minute')
			.toISOString()
		
		bookingContext.set({ endTime, price: duration.price }, true)
		
		this.animateElement(this.durationRefs.get(duration.value))
		setTimeout(() => this.scrollToSelectedDuration(), 150)
	}

	private scrollToSelectedDuration(): void {
		const duration = this.getCurrentDuration()
		if (duration) {
			const element = this.durationRefs.get(duration)
			this.scrollToElement(element)
		}
	}

	private scrollToElement(element?: HTMLElement): void {
		const container = this.scrollContainerRef.value
		if (!container || !element) return
		
		const containerRect = container.getBoundingClientRect()
		const elementRect = element.getBoundingClientRect()
		
		if (elementRect.left >= containerRect.left && elementRect.right <= containerRect.right) return
		
		container.scrollTo({
			left: element.offsetLeft - container.clientWidth / 2 + element.offsetWidth / 2,
			behavior: 'smooth'
		})
	}

	private animateElement(element?: HTMLElement): void {
		element?.animate([
			{ transform: 'scale(1)' },
			{ transform: 'scale(1.05)' },
			{ transform: 'scale(1)' }
		], { duration: 400, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })
	}

	private hasValidSelection(): boolean {
		return !!this.booking?.endTime && !!this.booking?.price && this.getCurrentDuration() > 0
	}

	private proceedToPayment(): void {
		if (!this.hasValidSelection() || this.isCreatingBooking) return
		
		// Validate required fields
		if (!this.booking.courtId || !this.booking.date || !this.booking.startTime || 
			!this.booking.endTime || !this.booking.price || this.booking.price <= 0 || 
			!this.booking.venueId) {
			$notify.error('Please complete all booking details before proceeding')
			return
		}
		
		this.isCreatingBooking = true
		
		// Generate booking ID and prepare data
		const bookingsRef = collection(db, 'bookings')
		const newBookingRef = doc(bookingsRef)
		const bookingId = newBookingRef.id
		
		const bookingData: Booking = {
			...this.booking,
			id: bookingId,
			status: 'holding',
			paymentStatus: 'pending',
			createdAt: new Date().toISOString(),
			lastActive: new Date().toISOString(),
		}
		
		// Create temporary booking
		this.bookingService.createBooking(bookingData)
			.pipe(
				tap(() => console.log(`Successfully created booking ${bookingId}`)),
				catchError(error => {
					console.error('Failed to create temporary booking:', error)
					
					if (error.message?.includes('already booked')) {
						$notify.error(error.message, { duration: 5000 })
						// Clear time selection on conflict
						bookingContext.set({
							...this.booking,
							startTime: undefined,
							endTime: undefined,
							price: 0
						}, true)
					} else {
						$notify.error(error.message || 'Failed to reserve booking. Please try again.')
					}
					
					this.isCreatingBooking = false
					return of(null)
				})
			)
			.subscribe(createdBooking => {
				if (createdBooking) {
					bookingContext.set(createdBooking, true)
					transitionToNextStep('Duration')
				}
				this.isCreatingBooking = false
			})
	}

	private renderDurationOption(duration: Duration) {
		const isSelected = this.getCurrentDuration() === duration.value
		const label = DURATION_LABELS[duration.value]?.compact || `${duration.value}m`
		
		return html`
			<selection-tile
				${ref(el => el && this.durationRefs.set(duration.value, el as HTMLElement))}
				?selected=${isSelected}
				?compact=${this.isMobileScreen}
				icon="timer"
				label=${label}
				.dataValue=${duration.value.toString()}
				.showPrice=${true}
				price=${duration.price}
				@click=${() => this.handleDurationSelect(duration)}
				type="duration">
			</selection-tile>
		`
	}

	private renderDurations(durations: Duration[]) {
		// Ensure minimum 4 items for consistent layout
		const items = [...durations]
		while (items.length < 4) items.push({ placeholder: true } as any)
		
		return repeat(
			items,
			(item, idx) => 'placeholder' in item ? `ph-${idx}` : item.value,
			(item) => 'placeholder' in item 
				? html`<div class="w-20 h-20 invisible"></div>`
				: this.renderDurationOption(item)
		)
	}

	render() {
		if (this.hidden || !this.isExpanded) return nothing
		
		if (!this.loading && this.durations.length === 0) {
			return html`
				<div class="text-center py-6 grid gap-4 justify-center">
					<schmancy-icon size="48px" class="text-surface-on-variant opacity-50">timer_off</schmancy-icon>
					<schmancy-typography type="body" token="md">No duration options available for this time.</schmancy-typography>
				</div>
			`
		}
		
		return html`
			<div class="w-full bg-surface-low/50 rounded-lg transition-all duration-300 p-2">
				${!this.hasValidSelection() && this.durations.length > 0 ? html`
					<div class="mb-2">
						<schmancy-typography type="label" token="lg" class="font-medium text-primary-default">
							Select Duration
						</schmancy-typography>
						<div class="text-xs text-surface-on-variant mt-1">Choose how long you'd like to play</div>
					</div>
				` : nothing}
				
				<div ${ref(this.scrollContainerRef)} 
					class="flex py-2 overflow-x-auto scrollbar-hide gap-3" 
					role="listbox"
					aria-label="Available Duration Options">
					${this.renderDurations(this.durations)}
				</div>
				
				${!this.hasValidSelection() ? html`
					<div class="text-center text-xs pb-2">
						<p class="text-surface-on-variant">All prices include VAT</p>
					</div>
				` : nothing}
				
				${this.hasValidSelection() ? html`
					<div class="mt-4 flex justify-center">
						<schmancy-button 
							variant="filled" 
							@click=${() => this.proceedToPayment()}
							class="min-w-[200px]"
							?disabled=${this.isCreatingBooking}>
							${this.isCreatingBooking ? html`
								<span class="flex items-center gap-2">
									<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
									<span>Reserving...</span>
								</span>
							` : html`
								<schmancy-icon>payment</schmancy-icon>
								<span>Proceed to Payment</span>
							`}
						</schmancy-button>
					</div>
				` : nothing}
			</div>
		`
	}
}
