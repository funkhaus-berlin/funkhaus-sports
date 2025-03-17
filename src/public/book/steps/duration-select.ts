import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { css, html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { debounceTime, fromEvent, takeUntil } from 'rxjs'
import { pricingService } from 'src/bookingServices/dynamic-pricing-service'
import { courtsContext } from '../../../admin/venues/courts/context'
import { Court } from '../../../db/courts.collection'
import { Booking, bookingContext } from '../context'
import { Duration } from '../types'

@customElement('duration-selection-step')
export class DurationSelectionStep extends $LitElement(css`
	.scrollbar-hide {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none; /* Chrome, Safari, and Opera */
	}
`) {
	@property({ type: Number }) selectedDuration!: number
	@property({ type: Boolean }) active = true
	@property({ type: Boolean }) hidden = false

	// Data binding to booking context
	@select(bookingContext) booking!: Booking
	@select(courtsContext) courts!: Map<string, Court>

	// Track if we're on a mobile device
	@state() isMobile = window.innerWidth < 640
	@state() recommendedDuration: number = 60 // Default to 1 hour as recommended
	@state() durations: Duration[] = []
	@state() selectedCourt?: Court

	connectedCallback() {
		super.connectedCallback()

		// Set up window resize listener for responsive design
		window.addEventListener('resize', this.handleResize)

		fromEvent(window, 'resize')
			.pipe(takeUntil(this.disconnecting), debounceTime(100))
			.subscribe({
				next: () => this.handleResize(),
			})
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		window.removeEventListener('resize', this.handleResize)
	}

	firstUpdated(_changedProperties: PropertyValues): void {
		super.firstUpdated(_changedProperties)

		// Calculate current duration from booking
		this.calculateDurationFromBooking()

		// Update durations based on booking data and selected court
		this.updateDurations()
	}

	updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties)

		// If booking or courts context changes, recalculate
		if (changedProperties.has('booking') || changedProperties.has('courts')) {
			this.calculateDurationFromBooking()
			this.updateDurations()
		}
	}

	/**
	 * Handle window resize events
	 */
	private handleResize = () => {
		this.checkMobileView()
	}

	/**
	 * Check if we're on a mobile view
	 */
	private checkMobileView() {
		const wasMobile = this.isMobile
		this.isMobile = window.innerWidth < 640

		if (wasMobile !== this.isMobile) {
			this.requestUpdate()
		}
	}

	/**
	 * Calculate duration from booking start and end times
	 */
	private calculateDurationFromBooking(): void {
		if (this.booking.startTime && this.booking.endTime) {
			const start = dayjs(this.booking.startTime)
			const end = dayjs(this.booking.endTime)
			const duration = end.diff(start, 'minute')

			if (this.selectedDuration !== duration) {
				this.selectedDuration = duration
			}
		}
	}

	/**
	 * Update durations based on selected court and start time
	 */
	private updateDurations(): void {
		// Find selected court
		if (this.booking.courtId && this.courts) {
			this.selectedCourt = this.courts.get(this.booking.courtId)
		}

		// If we have a court and start time, calculate prices
		if (this.selectedCourt && this.booking.startTime) {
			this.durations = pricingService.getStandardDurationPrices(
				this.selectedCourt,
				this.booking.startTime,
				this.booking.userId,
			)
		} else {
			// Fallback to default durations if court not yet selected
			this.durations = [
				{ label: '30m', value: 30, price: 15 },
				{ label: '1h', value: 60, price: 30 },
				{ label: '1.5h', value: 90, price: 45 },
				{ label: '2h', value: 120, price: 60 },
				{ label: '2.5h', value: 150, price: 75 },
				{ label: '3h', value: 180, price: 90 },
			]
		}
	}

	/**
	 * Handle duration selection
	 */
	private handleDurationSelect(duration: Duration): void {
		// Update selected duration
		this.selectedDuration = duration.value

		// Update booking context
		if (this.booking.startTime) {
			const startTime = dayjs(this.booking.startTime)
			const endTime = startTime.add(duration.value, 'minute').toISOString()

			bookingContext.set(
				{
					endTime,
					price: duration.price,
				},
				true,
			)
		}

		// Dispatch change event for parent component
		this.dispatchEvent(new CustomEvent('change', { detail: duration }))
	}

	/**
	 * Get full labels for durations
	 */
	private getFullLabel(duration: Duration): string {
		const map: Record<number, string> = {
			30: '30 min',
			60: '1 hour',
			90: '1.5 hours',
			120: '2 hours',
			150: '2.5 hours',
			180: '3 hours',
		}

		return map[duration.value] || `${duration.value} min`
	}

	render() {
		if (this.hidden) return html``

		// Container classes based on active state
		const containerClasses = {
			'w-full': true,
			'max-w-full': true,
			'bg-surface-low': true,
			'rounded-lg': true,
			'shadow-xs': true,
			'py-6 px-4': this.active && !this.isMobile,
			'py-4 px-3': this.active && this.isMobile,
			'py-3 px-2': !this.active,
		}

		// If not active, show compact view that remains interactive
		if (!this.active) {
			return html`
				<div class=${this.classMap(containerClasses)}>
					<div class="flex justify-between items-center">
						<schmancy-typography type="title" token="sm">Duration</schmancy-typography>
						<div class="flex flex-wrap gap-1">
							${this.durations.map(duration => {
								const isSelected = this.selectedDuration === duration.value

								return html`
									<div
										class="px-2 py-1 rounded-full cursor-pointer text-xs transition-colors
                      ${isSelected
											? 'bg-primary-default text-primary-on'
											: 'bg-surface-container text-surface-on hover:bg-surface-container-high'}"
										@click=${() => this.handleDurationSelect(duration)}
									>
										${duration.label}
										${isSelected ? html`<schmancy-icon class="ml-1" size="12px">check</schmancy-icon>` : ''}
									</div>
								`
							})}
						</div>
					</div>
				</div>
			`
		}

		// Mobile-optimized active view - horizontal scrolling
		if (this.isMobile) {
			return html`
				<div class=${this.classMap(containerClasses)}>
					<!-- Title section -->
					<div class="mb-3">
						<schmancy-typography type="title" token="md">Select Duration</schmancy-typography>
					</div>

					<!-- Horizontal scrollable duration options -->
					<div class="overflow-x-auto scrollbar-hide pb-2 -mx-2 px-2">
						<div class="flex gap-2 snap-x w-full pb-2">
							${this.durations.map(duration => {
								const isSelected = this.selectedDuration === duration.value
								const isPopular = this.recommendedDuration === duration.value

								return html`
									<div
										@click=${() => this.handleDurationSelect(duration)}
										class="flex-none snap-center flex flex-col items-center justify-center 
                           p-3 rounded-xl cursor-pointer transition-all min-w-20
                           ${isSelected
											? 'bg-primary-default text-primary-on shadow-sm'
											: 'bg-surface-high text-surface-on hover:shadow-sm'}"
									>
										<!-- Popular badge if applicable -->
										${isPopular
											? html`<div
													class="absolute -top-1 -right-1 bg-secondary-default text-secondary-on text-xs 
                                         font-bold px-1 rounded-full"
											  >
													Best
											  </div>`
											: ''}

										<!-- Duration label -->
										<div class="font-medium">${this.getFullLabel(duration)}</div>

										<!-- Price -->
										<div class="font-bold ${isSelected ? 'text-primary-on' : 'text-primary-default'}">
											€${duration.price.toFixed(2)}
										</div>
									</div>
								`
							})}
						</div>
					</div>

					<!-- Hint text -->
					<div class="mt-2 text-center text-surface-on-variant text-xs">
						<p>All prices include VAT</p>
					</div>
				</div>
			`
		}

		// Desktop view - grid layout
		return html`
			<div class=${this.classMap(containerClasses)}>
				<!-- Title section -->
				<div class="mb-2">
					<schmancy-typography type="title" token="md" class="mb-2">Select Duration</schmancy-typography>
				</div>

				<!-- Duration options - Grid layout for desktop -->
				<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
					${this.durations.map(duration => {
						const isSelected = this.selectedDuration === duration.value
						const isPopular = this.recommendedDuration === duration.value

						return html`
							<div
								@click=${() => this.handleDurationSelect(duration)}
								class="relative overflow-hidden flex flex-col items-center justify-center 
                       py-3 px-2 h-24 rounded-xl cursor-pointer transition-all 
                       hover:shadow-md hover:-translate-y-1 group
                       ${isSelected
									? 'bg-primary-default text-primary-on shadow-sm'
									: 'bg-surface-high text-surface-on'}"
							>
								<!-- Popular badge if applicable -->
								${isPopular
									? html`<div
											class="absolute top-0 right-0 bg-secondary-default text-secondary-on text-xs 
                                    font-bold py-0.5 px-1.5 rounded-bl-lg rounded-tr-xl"
									  >
											POPULAR
									  </div>`
									: ''}

								<!-- Duration label -->
								<schmancy-typography type="title" token="md" weight=${isSelected ? 'bold' : 'normal'} class="mb-1">
									${this.getFullLabel(duration)}
								</schmancy-typography>

								<!-- Price -->
								<schmancy-typography
									type="headline"
									token="sm"
									class="font-bold ${isSelected ? 'text-primary-on' : 'text-primary-default'}"
								>
									€${duration.price.toFixed(2)}
								</schmancy-typography>

								${isSelected ? html`<schmancy-icon class="mt-1" size="18px">check_circle</schmancy-icon>` : ''}
							</div>
						`
					})}
				</div>

				<!-- Hint text -->
				<div class="mt-4 text-center text-surface-on-variant text-sm">
					<p>All prices include VAT</p>
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'duration-selection-step': DurationSelectionStep
	}
}
