import { $notify, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { collection, doc } from 'firebase/firestore'
import { css, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { createRef, ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { catchError, combineLatest, debounceTime, distinctUntilChanged, filter, map, of, switchMap, takeUntil } from 'rxjs'
import { tap } from 'rxjs/operators'
import { courtsContext } from 'src/admin/venues/courts/context'
import { availabilityContext, availabilityLoading$, BookingFlowType, getAvailableDurations } from 'src/availability-context'
import { BookingService } from 'src/bookingServices/booking.service'
import { Court } from 'src/db/courts.collection'
import { db } from 'src/firebase/firebase'
import { toUserTimezone } from 'src/utils/timezone'
import { transitionToNextStep } from '../../booking-steps-utils'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'
import { Duration } from '../../types'

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

@customElement('duration-selection-step')
export class DurationSelectionStep extends $LitElement(css`
	:host { display: block; }
	.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
	.scrollbar-hide::-webkit-scrollbar { display: none; }
`) {
	@property({ type: Boolean }) hidden = false
	
	@select(bookingContext) booking!: Booking
	@select(courtsContext) courts!: Map<string, Court>
	@select(BookingProgressContext) bookingProgress!: BookingProgress
	@select(availabilityContext) availability!: any
	
	@state() private durations: Duration[] = []
	@state() private loading = true
	@state() private error: string | null = null
	@state() private isExpanded = false
	@state() private isCompact = false
	@state() private isCreatingBooking = false
	
	private scrollContainerRef = createRef<HTMLElement>()
	private durationRefs = new Map<number, HTMLElement>()
	private lastSuccessfulDurations: Duration[] = []
	private bookingService = new BookingService()

	connectedCallback(): void {
		super.connectedCallback()
		
		// Progress state
		BookingProgressContext.$.pipe(
			takeUntil(this.disconnecting),
			map(progress => ({
				isExpanded: progress.expandedSteps.includes(BookingStep.Duration),
				isCompact: progress.currentStep !== BookingStep.Duration
			}))
		).subscribe(({ isExpanded, isCompact }) => {
			this.isExpanded = isExpanded
			this.isCompact = isCompact
		})
		
		// Scroll to selected duration when it changes
		bookingContext.$.pipe(
			takeUntil(this.disconnecting),
			map(b => b?.endTime),
			distinctUntilChanged(),
			filter(endTime => !!endTime)
		).subscribe(() => {
			setTimeout(() => this.scrollToSelectedDuration(), 250)
		})
		
		// Load durations
		combineLatest([
			bookingContext.$,
			availabilityContext.$,
			availabilityLoading$
		]).pipe(
			takeUntil(this.disconnecting),
			filter(([booking]) => !!booking?.date && !!booking?.startTime),
			debounceTime(100),
			switchMap(([booking, availability, loading]) => {
				if (loading) return of({ durations: this.lastSuccessfulDurations, loading: true })
				
				const courtId = availability.bookingFlowType === BookingFlowType.DATE_COURT_TIME_DURATION 
					? booking.courtId : undefined
				const durations = getAvailableDurations(booking.startTime, courtId)
				
				return of({ 
					durations: durations.length > 0 ? durations : this.getEstimatedDurations(), 
					loading: false 
				})
			}),
			catchError(() => of({ durations: this.getEstimatedDurations(), loading: false }))
		).subscribe(({ durations, loading }) => {
			this.durations = durations
			this.loading = loading
			if (durations.length > 0) this.lastSuccessfulDurations = durations
			this.validateCurrentSelection(durations)
		})
	}

	disconnectedCallback(): void {
		super.disconnectedCallback()
		this.durationRefs.clear()
	}

	private getCurrentDuration(): number {
		if (!this.booking?.startTime || !this.booking?.endTime) return 0
		return Math.max(0, dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minute'))
	}

	private validateCurrentSelection(durations: Duration[]): void {
		const currentDuration = this.getCurrentDuration()
		if (!currentDuration) return
		
		const isValid = durations.some(d => d.value === currentDuration) && 
			!this.wouldExceedClosingTime({ value: currentDuration } as Duration)
		
		if (!isValid) {
			bookingContext.set({ endTime: '', price: 0 }, true)
			this.announceForScreenReader('Duration unselected as it\'s no longer available')
		}
	}

	private getEstimatedDurations(): Duration[] {
		const baseRate = this.getAverageHourlyRate()
		return [30, 60, 90, 120, 150, 180, 210, 240, 270, 300].map(minutes => ({
			label: DURATION_LABELS[minutes]?.compact || `${minutes}m`,
			value: minutes,
			price: Math.round(baseRate * minutes / 60)
		}))
	}

	private getAverageHourlyRate(): number {
		if (!courtsContext.ready || !this.courts?.size) return 30
		
		const activeCourts = Array.from(this.courts.values()).filter(c => c.status === 'active')
		if (!activeCourts.length) return 30
		
		const totalRate = activeCourts.reduce((sum, court) => sum + (court.pricing?.baseHourlyRate || 30), 0)
		return Math.round(totalRate / activeCourts.length)
	}

	private handleDurationSelect(duration: Duration): void {
		if (!this.booking?.startTime) return
		
		// Simply add duration to the UTC start time - no timezone conversion needed
		const endTime = dayjs(this.booking.startTime)
			.add(duration.value, 'minute')
			.toISOString()
		
		bookingContext.set({ endTime, price: duration.price }, true)
		
		this.animateElement(this.durationRefs.get(duration.value))
		setTimeout(() => this.scrollToSelectedDuration(), 150)
		
		const label = DURATION_LABELS[duration.value]?.full || `${duration.value} minutes`
		this.announceForScreenReader(`Selected ${label} for €${duration.price.toFixed(2)}`)
	}

	private scrollToSelectedDuration(): void {
		const duration = this.getCurrentDuration()
		if (duration) this.scrollToElement(this.durationRefs.get(duration))
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

	private announceForScreenReader(message: string): void {
		const announcement = document.createElement('div')
		announcement.setAttribute('aria-live', 'assertive')
		announcement.setAttribute('class', 'sr-only')
		announcement.textContent = message
		document.body.appendChild(announcement)
		setTimeout(() => document.body.removeChild(announcement), 1000)
	}

	private wouldExceedClosingTime(duration: Duration): boolean {
		if (!this.booking?.startTime || !this.booking?.date) return false
		
		const endTime = dayjs(this.booking.startTime).add(duration.value, 'minute')
		const dayOfWeek = dayjs(this.booking.date).format('dddd').toLowerCase()
		const closeTime = this.availability?.venue?.operatingHours?.[dayOfWeek]?.close
		
		const closingTime = closeTime
			? dayjs(this.booking.date).hour(+closeTime.split(':')[0]).minute(+closeTime.split(':')[1] || 0)
			: dayjs(this.booking.date).hour(22).minute(0)
		
		return endTime.isAfter(closingTime)
	}
	
	private hasValidSelection(): boolean {
		return !!this.booking?.endTime && !!this.booking?.price && this.getCurrentDuration() > 0
	}
	
	private proceedToPayment(): void {
		if (!this.hasValidSelection()) {
			this.announceForScreenReader('Please select a duration before proceeding')
			return
		}
		
		// Prevent multiple clicks
		if (this.isCreatingBooking) {
			return
		}
		
		this.isCreatingBooking = true
		
		// Debug: Log current booking data
		console.log('Current booking data before creating temporary booking:', {
			courtId: this.booking.courtId,
			date: this.booking.date,
			startTime: this.booking.startTime,
			endTime: this.booking.endTime,
			price: this.booking.price,
			venueId: this.booking.venueId,
			userId: this.booking.userId,
			userName: this.booking.userName,
			fullBookingObject: this.booking
		})
		
		// Validate we have all required fields before proceeding
		if (!this.booking.courtId || !this.booking.date || !this.booking.startTime || !this.booking.endTime || !this.booking.price || this.booking.price <= 0 || !this.booking.venueId) {
			console.error('Missing or invalid required fields:', {
				courtId: this.booking.courtId,
				date: this.booking.date,
				startTime: this.booking.startTime,
				endTime: this.booking.endTime,
				price: this.booking.price,
				priceValid: this.booking.price > 0,
				venueId: this.booking.venueId
			})
			$notify.error('Please complete all booking details before proceeding')
			this.isCreatingBooking = false
			return
		}
		
		// Prepare booking data with holding status
		const bookingData: Booking = {
			...this.booking,
			status: 'holding',
			paymentStatus: 'pending',
			createdAt: new Date().toISOString(),
			lastActive: new Date().toISOString(),
			venueId: this.booking.venueId // Explicitly include venueId
		}
		
		// Debug: Log booking data being sent
		console.log('Booking data being sent to createBooking:', bookingData)
		
		// Generate a new booking ID
		const bookingsRef = collection(db, 'bookings')
		const newBookingRef = doc(bookingsRef)
		const bookingId = newBookingRef.id
		
		// Add the ID to booking data
		const bookingWithId = { ...bookingData, id: bookingId }
		
		// Create temporary booking using BookingService with conflict checking
		this.bookingService.createBooking(bookingWithId)
			.pipe(
				tap(() => console.log(`Successfully created booking ${bookingId}`)),
				catchError(error => {
					console.error('Failed to create temporary booking:', error)
					
					// Check if the error is due to time slot conflict
					if (error.message?.includes('already booked')) {
						// Show the error message from the service (it already has a good message)
						$notify.error(error.message, { duration: 5000 })
						
						
						// Clear the current time selection
						bookingContext.set({
							...this.booking,
							startTime: undefined,
							endTime: undefined,
							price: 0
						}, true)
					} else {
						// For other errors, show a generic message
						$notify.error(error.message || 'Failed to reserve booking. Please try again.')
					}
					
					this.isCreatingBooking = false
					return of(null)
				})
			)
			.subscribe(createdBooking => {
				if (createdBooking) {
					// Update booking context with the created booking data
					bookingContext.set(createdBooking, true)
					
					// Transition to payment step
					transitionToNextStep('Duration')
				}
				this.isCreatingBooking = false
			})
	}

	private renderDurationOption(duration: Duration) {
		const isSelected = this.getCurrentDuration() === duration.value
		const isDisabled = this.wouldExceedClosingTime(duration)
		const label = DURATION_LABELS[duration.value]?.compact || `${duration.value}m`
		
		return html`
			<selection-tile
				${ref(el => el && this.durationRefs.set(duration.value, el as HTMLElement))}
				?selected=${isSelected}
				?compact=${this.isCompact}
				icon=${isDisabled ? 'timer_off' : 'timer'}
				label=${label}
				.dataValue=${duration.value.toString()}
				.showPrice=${true}
				price=${duration.price}
				?disabled=${isDisabled}
				description=${isDisabled ? 'Exceeds closing time' : ''}
				@click=${() => !isDisabled && this.handleDurationSelect(duration)}
				type="duration"
			></selection-tile>
		`
	}

	render() {
		if (this.hidden || !this.isExpanded) return nothing
		
		const durations = this.durations.length > 0 ? this.durations : this.lastSuccessfulDurations
		
		if (this.loading && durations.length === 0) {
			return html`
				<div class="text-center py-6">
					<div class="inline-block w-8 h-8 border-3 border-primary-default border-t-transparent rounded-full animate-spin"></div>
					<schmancy-typography type="body" token="sm" class="mt-2 text-surface-on-variant">
						Loading durations...
					</schmancy-typography>
				</div>
			`
		}
		
		if (!this.loading && durations.length === 0) {
			return html`
				<div class="text-center py-6 grid gap-4 justify-center">
					<schmancy-icon size="48px" class="text-surface-on-variant opacity-50">timer_off</schmancy-icon>
					<schmancy-typography type="body" token="md" class="mt-2">
						No duration options available for this time.
					</schmancy-typography>
				</div>
			`
		}
		
		const isEstimated = this.durations.length === 0 || 
			this.durations.every((d, i) => d === this.getEstimatedDurations()[i])
		
		return html`
			<div class="w-full bg-surface-low rounded-lg transition-all duration-300 p-2">
				${when(this.error, () => html`
					<div class="bg-error-container p-2 rounded-t-lg text-error-on-container text-sm text-center mb-3">
						${this.error}
					</div>
				`)}
				
				${when(!this.isCompact && durations.length > 0, () => html`
					<div class="mb-2">
						<schmancy-typography type="label" token="lg" class="font-medium text-primary-default">
							Select Duration
						</schmancy-typography>
						<div class="text-xs text-surface-on-variant mt-1">Choose how long you'd like to play</div>
					</div>
				`)}
				
				<div ${ref(this.scrollContainerRef)} 
					class="flex py-2 overflow-x-auto scrollbar-hide ${this.isCompact ? 'gap-2' : 'gap-3'}" 
					role="listbox"
					aria-label="Available Duration Options">
					${this.renderDurations(durations)}
				</div>
				
				${when(!this.isCompact, () => html`
					<div class="text-center text-xs pb-2">
						<p class="text-surface-on-variant">All prices include VAT</p>
						${when(isEstimated, () => html`
							<p class="text-warning-default mt-1">
								<schmancy-icon class="mr-1" size="12px">info</schmancy-icon>
								Estimated prices. Actual price may vary.
							</p>
						`)}
					</div>
				`)}
				
				${when(this.hasValidSelection(), () => html`
					<div class="mt-4 flex justify-center">
						<schmancy-button 
							variant="filled" 
							@click=${() => this.proceedToPayment()}
							class="min-w-[200px]"
							?disabled=${this.isCreatingBooking}
						>
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
				`)}
			</div>
		`
	}
	
	private renderDurations(durations: Duration[]) {
		const minCount = 4
		const items = [...durations]
		while (items.length < minCount) items.push({ placeholder: true } as any)
		
		return repeat(
			items,
			(item, idx) => 'placeholder' in item ? `ph-${idx}` : item.value,
			(item) => 'placeholder' in item 
				? html`<div class="w-20 h-20 invisible"></div>`
				: this.renderDurationOption(item)
		)
	}
}
