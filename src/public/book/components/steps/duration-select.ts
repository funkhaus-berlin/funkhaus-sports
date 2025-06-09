import { $notify, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { collection, doc } from 'firebase/firestore'
import { css, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { createRef, ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'
import { catchError, of, takeUntil, tap } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { availabilityContext, availabilityLoading$, getAvailableDurations } from 'src/availability-context'
import { BookingService } from 'src/bookingServices/booking.service'
import { db } from 'src/firebase/firebase'
import { BookingFlowType } from 'src/types'
import { Court } from 'src/types/booking/court.types'
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
	@select(availabilityContext) availability!: any

	// Core state
	@state() durations: Duration[] = []
	@state() loading = true
	@state() error: string | null = null
	@state() isExpanded = false
	@state() isCreatingBooking = false
	@state() isMobileScreen = window.innerWidth < 768

	// DOM refs
	private scrollContainerRef = createRef<HTMLElement>()
	private durationRefs = new Map<number, HTMLElement>()
	private bookingService = new BookingService()

	connectedCallback(): void {
		super.connectedCallback()
		this.setupObservers()
	}

	disconnectedCallback(): void {
		super.disconnectedCallback()
		this.durationRefs.clear()
	}

	private setupObservers(): void {
		// Watch screen size changes
		const checkScreenSize = () => {
			const newIsMobile = window.innerWidth < 768
			if (this.isMobileScreen !== newIsMobile) {
				this.isMobileScreen = newIsMobile
			}
		}
		window.addEventListener('resize', checkScreenSize)

		// Watch booking progress
		BookingProgressContext.$.pipe(takeUntil(this.disconnecting)).subscribe(progress => {
			this.isExpanded = progress.expandedSteps.includes(BookingStep.Duration)
		})

		// Watch booking context for data changes and load durations
		bookingContext.$.pipe(takeUntil(this.disconnecting)).subscribe(booking => {
			if (booking?.date && booking?.startTime) {
				this.loadDurations()
			}
			if (booking?.endTime) {
				setTimeout(() => this.scrollToSelectedDuration(), 250)
			}
		})

		// Watch availability loading state
		availabilityLoading$.pipe(takeUntil(this.disconnecting)).subscribe(loading => {
			this.loading = loading
		})
	}

	private loadDurations(): void {
		if (!this.booking?.startTime) return

		this.loading = true
		this.error = null

		try {
			const courtId = this.availability.bookingFlowType === BookingFlowType.DATE_COURT_TIME_DURATION 
				? this.booking.courtId : undefined
			
			const durations = getAvailableDurations(this.booking.startTime, courtId)
			
			if (durations.length > 0) {
				this.durations = durations
			} else {
				this.durations = this.generateEstimatedDurations()
				this.error = 'Using estimated pricing - actual prices may vary'
			}
		} catch (error) {
			console.error('Error loading durations:', error)
			this.durations = this.generateEstimatedDurations()
			this.error = 'Error loading durations. Using estimates instead.'
		} finally {
			this.loading = false
		}

		// Validate current selection
		this.validateCurrentSelection()
	}

	private generateEstimatedDurations(): Duration[] {
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

	private getCurrentDuration(): number {
		if (!this.booking?.startTime || !this.booking?.endTime) return 0
		return Math.max(0, dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minute'))
	}

	private validateCurrentSelection(): void {
		const currentDuration = this.getCurrentDuration()
		if (!currentDuration) return
		
		const isValid = this.durations.some(d => d.value === currentDuration) && 
			!this.wouldExceedClosingTime({ value: currentDuration } as Duration)
		
		if (!isValid) {
			bookingContext.set({ endTime: '', price: 0 }, true)
		}
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
		const isDisabled = this.wouldExceedClosingTime(duration)
		const label = DURATION_LABELS[duration.value]?.compact || `${duration.value}m`
		
		return html`
			<selection-tile
				${ref(el => el && this.durationRefs.set(duration.value, el as HTMLElement))}
				?selected=${isSelected}
				?compact=${this.isMobileScreen}
				icon=${isDisabled ? 'timer_off' : 'timer'}
				label=${label}
				.dataValue=${duration.value.toString()}
				.showPrice=${true}
				price=${duration.price}
				?disabled=${isDisabled}
				description=${isDisabled ? 'Exceeds closing time' : ''}
				@click=${() => !isDisabled && this.handleDurationSelect(duration)}
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
		
		if (this.loading && this.durations.length === 0) {
			return html`
				<div class="text-center py-6">
					<div class="inline-block w-8 h-8 border-3 border-primary-default border-t-transparent rounded-full animate-spin"></div>
					<schmancy-typography type="body" token="sm" class="mt-2 text-surface-on-variant">
						Loading durations...
					</schmancy-typography>
				</div>
			`
		}
		
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
				${this.error ? html`
					<div class="bg-error-container p-2 rounded-t-lg text-error-on-container text-sm text-center mb-3">
						${this.error}
					</div>
				` : nothing}
				
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
						${this.error ? html`
							<p class="text-warning-default mt-1">
								<schmancy-icon class="mr-1" size="12px">info</schmancy-icon>
								Estimated prices. Actual price may vary.
							</p>
						` : nothing}
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