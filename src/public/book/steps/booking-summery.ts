import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { courtsContext } from 'src/admin/venues/courts/context'
import { Court } from 'src/db/courts.collection'
import { Booking, bookingContext } from '../context'

@customElement('booking-summery')
export class BookingSummery extends $LitElement() {
	@select(bookingContext) booking!: Booking
	@select(courtsContext) courts!: Map<string, Court>

	@property({ type: Object }) selectedCourt?: Court

	@state() summaryExpanded = false
	render() {
		// Function to format date
		const formatDate = (dateStr: string) => {
			const date = new Date(dateStr)
			return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
		}

		// Format time from ISO string
		const formatTime = (timeStr: string) => {
			const date = new Date(timeStr)
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
		}

		// Calculate duration
		const startTime = new Date(this.booking.startTime)
		const endTime = new Date(this.booking.endTime)
		const durationMs = endTime.getTime() - startTime.getTime()
		const durationHours = Math.floor(durationMs / (1000 * 60 * 60))
		const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))
		const durationText =
			durationHours > 0
				? `${durationHours} hour${durationHours > 1 ? 's' : ''}${durationMinutes > 0 ? ` ${durationMinutes} min` : ''}`
				: `${durationMinutes} minutes`

		return html`
			<div class="bg-surface-container p-4 rounded-lg mb-4 shadow-sm">
				<!-- Summary header with toggle -->
				<div
					class="flex justify-between items-center cursor-pointer"
					@click=${() => {
						this.summaryExpanded = !this.summaryExpanded
						this.requestUpdate()
					}}
				>
					<schmancy-typography type="title" token="sm">Booking Summary</schmancy-typography>
					<schmancy-icon>${this.summaryExpanded ? 'expand_less' : 'expand_more'}</schmancy-icon>
				</div>

				<!-- Collapsible content -->
				${when(
					this.summaryExpanded,
					() => html`
						<div class="mt-3 grid gap-2 animate-fadeIn">
							<div class="flex justify-between">
								<schmancy-typography type="label" token="sm">Date:</schmancy-typography>
								<schmancy-typography type="body" weight="bold">${formatDate(this.booking.date)}</schmancy-typography>
							</div>

							<div class="flex justify-between">
								<schmancy-typography type="label" token="sm">Time:</schmancy-typography>
								<schmancy-typography type="body" weight="bold">
									${formatTime(this.booking.startTime)} - ${formatTime(this.booking.endTime)}
								</schmancy-typography>
							</div>

							<div class="flex justify-between">
								<schmancy-typography type="label" token="sm">Duration:</schmancy-typography>
								<schmancy-typography type="body" weight="bold">${durationText}</schmancy-typography>
							</div>

							<div class="flex justify-between">
								<schmancy-typography type="label" token="sm">Court:</schmancy-typography>
								<schmancy-typography type="body" weight="bold">
									${this.selectedCourt ? this.selectedCourt.name : 'Auto-assigned'}
								</schmancy-typography>
							</div>

							<div class="border-t border-outline-variant pt-2 mt-1">
								<div class="flex justify-between items-center">
									<schmancy-typography type="title" token="sm">Total:</schmancy-typography>
									<schmancy-typography type="display" token="sm" class="text-primary-default">
										€${this.booking.price.toFixed(2)}
									</schmancy-typography>
								</div>
							</div>
						</div>
					`,
					() => html`
						<!-- Compact summary when collapsed -->
						<div class="flex justify-between mt-1">
							<schmancy-typography type="body" token="sm" class="text-surface-on-variant">
								${formatDate(this.booking.date)} · ${formatTime(this.booking.startTime)}
							</schmancy-typography>
							<schmancy-typography type="title" token="sm" class="text-primary-default">
								€${this.booking.price.toFixed(2)}
							</schmancy-typography>
						</div>
					`,
				)}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-summery': BookingSummery
	}
}
