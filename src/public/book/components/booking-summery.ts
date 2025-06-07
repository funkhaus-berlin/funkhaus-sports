import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venueContext } from 'src/admin/venues/venue-context'
import { Court } from 'src/db/courts.collection'
import { Booking, bookingContext } from '../context'
import dayjs from 'dayjs'

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
		return dayjs(timeStr).format('HH:mm')
	}

	private formatDuration(): string {
		if (!this.booking?.startTime || !this.booking?.endTime) {
			return 'TBD'
		}

		const duration = dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minute')
		const hours = Math.floor(duration / 60)
		const minutes = duration % 60

		if (hours > 0) {
			return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
		}
		return `${minutes}m`
	}

	private formatPrice(price: number): string {
		if (price === null || price === undefined) {
			return '€0.00'
		}

		return `€${price.toFixed(2)}`
	}

	render() {
		const court = this.getSelectedCourt()
		const hasBookingDetails = this.booking?.date && this.booking?.startTime

		return html`
			<schmancy-surface type="containerHigh" rounded="all" class="p-3">
				<!-- Compact always-visible summary -->
				<div class="flex items-center justify-between gap-2">
					<!-- Left side - booking info -->
					<div class="flex-1 min-w-0">
						${hasBookingDetails ? html`
							<div class="flex items-center gap-2 flex-wrap">
								<!-- Date & Time -->
								<div class="flex items-center gap-1.5">
									<schmancy-icon size="16px" class="text-primary-default">calendar_today</schmancy-icon>
									<schmancy-typography type="body" token="sm" class="font-medium">
										${this.formatDate(this.booking.date)}
									</schmancy-typography>
								</div>
								
								<!-- Time Range -->
								<div class="flex items-center gap-1.5">
									<schmancy-icon size="16px" class="text-primary-default">schedule</schmancy-icon>
									<schmancy-typography type="body" token="sm">
										${this.formatTime(this.booking.startTime)} - ${this.formatTime(this.booking.endTime)}
									</schmancy-typography>
								</div>
								
								<!-- Court (if selected) -->
								${court ? html`
									<div class="flex items-center gap-1.5">
										<schmancy-icon size="16px" class="text-primary-default">sports_tennis</schmancy-icon>
										<schmancy-typography type="body" token="sm">
											${court.name}
										</schmancy-typography>
									</div>
								` : ''}
							</div>
						` : html`
							<schmancy-typography type="body" token="sm" class="text-surface-on-variant">
								Complete your booking details
							</schmancy-typography>
						`}
					</div>
					
					<!-- Right side - price and toggle -->
					<div class="flex items-center gap-2">
						<schmancy-typography type="title" token="md" class="text-primary-default font-bold">
							${this.formatPrice(this.booking?.price)}
						</schmancy-typography>
						
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
