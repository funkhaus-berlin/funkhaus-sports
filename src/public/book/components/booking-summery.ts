import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venueContext } from 'src/admin/venues/venue-context'
import { Court } from 'src/db/courts.collection'
import { toUserTimezone } from 'src/utils/timezone'
import { Booking, bookingContext, BookingProgressContext, BookingStep } from '../context'

/**
 * Booking summary component with ultra-compact, single-line design
 * Displays date, time range, court, and price in a condensed format
 */
@customElement('booking-summary')
export class BookingSummary extends $LitElement() {
	@select(bookingContext) booking!: Booking
	@select(courtsContext) courts!: Map<string, Court>
	@select(venueContext) venue!: any

	@property({ type: Object }) selectedCourt?: Court


	private getSelectedCourt(): Court | undefined {
		if (this.selectedCourt) {
			return this.selectedCourt
		}

		if (this.booking?.courtId && courtsContext.ready) {
			return this.courts.get(this.booking.courtId)
		}

		return undefined
	}

	private formatDate(dateStr: string): string {
		if (!dateStr) return 'TBD'
		return dayjs(dateStr).format('ddd, MMM D')
	}

	private formatTime(timeStr: string): string {
		if (!timeStr) return 'TBD'
		// Convert from UTC to user's local timezone for display
		return toUserTimezone(timeStr).format('HH:mm')
	}




	/**
	 * Handle edit button click - go back to the previous completed step
	 */
	private handleEdit(): void {
		const progress = BookingProgressContext.value
		
		// Find the last completed step before payment
		let targetStep = BookingStep.Duration // Default to duration step
		
		if (this.booking?.endTime) {
			targetStep = BookingStep.Duration
		} else if (this.booking?.startTime) {
			targetStep = BookingStep.Time
		} else if (this.booking?.courtId) {
			targetStep = BookingStep.Court
		} else if (this.booking?.date) {
			targetStep = BookingStep.Date
		}
		
		// Update the progress context to go to the target step
		BookingProgressContext.set({
			...progress,
			currentStep: targetStep,
			expandedSteps: [...progress.expandedSteps, targetStep]
		})
	}

	render() {
		const court = this.getSelectedCourt()
		const hasBookingDetails = this.booking?.date && this.booking?.startTime

		return html`
			<schmancy-surface type="containerHigh" rounded="all" class="p-2 md:p-3">
				<!-- Compact always-visible summary -->
				<div class="flex items-center justify-between gap-2">
					<!-- Left side - booking info -->
					<div class="flex-1 min-w-0">
						${hasBookingDetails ? html`
							<div class="flex items-center gap-4 flex-wrap">
								<!-- Date & Time -->
								<div class="flex items-center gap-[4px]">
									<schmancy-icon size="16px" class="text-primary-default">calendar_today</schmancy-icon>
									<schmancy-typography type="body" token="sm" class="font-medium">
										${this.formatDate(this.booking.date)}
									</schmancy-typography>
								</div>

                	<!-- Court (if selected) -->
								${court ? html`
									<div class="flex items-center gap-[4px]">
										<schmancy-icon size="16px" class="text-primary-default">sports_tennis</schmancy-icon>
										<schmancy-typography type="body" token="sm">
											${court.name}
										</schmancy-typography>
									</div>
								` : ''}
								
								<!-- Time Range -->
								<div class="flex items-center gap-[4px]">
									<schmancy-icon size="16px" class="text-primary-default">schedule</schmancy-icon>
									<schmancy-typography type="body" token="sm">
										${this.formatTime(this.booking.startTime)} - ${this.formatTime(this.booking.endTime)}
									</schmancy-typography>
								</div>
								
							
							</div>
						` : html`
							<schmancy-typography type="body" token="sm" class="text-surface-on-variant">
								Complete your booking details
							</schmancy-typography>
						`}
					</div>
					
					<!-- Right side - edit button -->
					<div class="flex items-center gap-2">
						<schmancy-button
							size="sm"
							variant="filled tonal"
							@click=${() => this.handleEdit()}
						>
							<schmancy-icon size="20px">edit</schmancy-icon>
							<span class="hidden sm:block">Change</span>
						</schmancy-button>
					</div>
				</div>

			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-summary': BookingSummary
	}
}
