// src/public/book/steps/booking-confirmation.ts

import { $notify, fullHeight } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html, HTMLTemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { Court } from 'src/db/courts.collection'
import { BookingUtilities } from '../booking-utilities'
import { Booking, bookingContext } from '../context'

@customElement('booking-confirmation')
export class BookingConfirmation extends $LitElement() {
	@property({ type: Object }) booking!: Booking
	@property({ type: Object }) selectedCourt?: Court
	@property({ type: String }) customerEmail: string = ''
	@property({ type: String }) customerName: string = ''
	@property({ type: String }) bookingId: string = ''
	@property({ attribute: false }) onNewBooking?: () => void

	// Utilities for booking data formatting and operations
	private utilities = new BookingUtilities()

	/**
	 * Download QR code image
	 */
	private async downloadQRCode() {
		try {
			// Generate QR code
			const qrDataUrl = this.utilities.generateQRCodeDataUrl(this.booking, this.selectedCourt)

			// Get court and venue data for filename
			const court = courtsContext.value.get(this.booking.courtId)
			const venue = court ? venuesContext.value.get(court.venueId) : undefined

			// Generate filename
			const filename = this.utilities.generateQRFilename(this.booking, court, venue)

			// Create download link
			const link = document.createElement('a')
			link.href = qrDataUrl
			link.download = filename
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)

			$notify.success('QR code downloaded successfully')
		} catch (error) {
			console.error('Error downloading QR code:', error)
			$notify.error('Failed to download QR code')
		}
	}

	render() {
		if (!this.booking || !this.booking.startTime || !this.booking.endTime) {
			// Render error state if booking data is incomplete
			return this.renderErrorState()
		}

		// Format booking details
		const dateFormatted = this.utilities.formatDate(this.booking.date)
		const timeFormatted = this.utilities.formatTimeRange(this.booking.startTime, this.booking.endTime)
		const calendarUrl = this.utilities.generateCalendarFile(this.booking, this.selectedCourt?.name)

		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all">
				<schmancy-grid class="h-full" justify="center" gap="md">
					<div class="pt-4 md:pt-8 lg:pt-16 xl:pt-20 flex items-center justify-center gap-3 text-primary-default">
						<schmancy-icon size="large">check_circle</schmancy-icon>
						<schmancy-typography type="headline" token="md">Booking Confirmed!</schmancy-typography>
					</div>
					${when(
						this.booking.id,
						() => this.renderQRCode(),
						() => html`<p>No booking ID available</p>`,
					)}
					<schmancy-grid gap="md" justify="start" cols="1fr 1fr" class="px-6 py-6 bg-surface-high rounded-md">
						${this.renderDetailItem('Date', dateFormatted)} ${this.renderDetailItem('Time', timeFormatted)}
						${this.renderDetailItem('Court', this.selectedCourt?.name || 'Court')}
						${this.renderDetailItem(
							'Total',
							html`<span class="text-primary-default">&euro;${this.booking.price.toFixed(2)}</span>`,
						)}
					</schmancy-grid>
				</schmancy-grid>

				<!-- Actions -->
				<sch-flex justify="center" gap="4" class="p-6">
					<schmancy-button variant="filled" href=${calendarUrl}>
						<schmancy-icon>calendar_month</schmancy-icon>
						Add to Calendar
					</schmancy-button>
					<schmancy-button
						variant="outlined"
						@click=${() => this.utilities.shareBooking(this.booking, this.selectedCourt?.name)}
					>
						<schmancy-icon>share</schmancy-icon>
						Share
					</schmancy-button>
					<schmancy-button
						variant="outlined"
						@click=${() => {
							bookingContext.clear()
							this.onNewBooking?.()
						}}
					>
						<schmancy-icon>add</schmancy-icon>
						Book Again
					</schmancy-button>
				</sch-flex>
			</schmancy-surface>
		`
	}

	/**
	 * Render detail item for the booking info grid
	 */
	private renderDetailItem(label: string, value: string | HTMLTemplateResult) {
		return html`
			<schmancy-grid>
				<schmancy-typography type="label" token="sm" class="text-surface-on-variant">${label}</schmancy-typography>
				<schmancy-typography type="body" weight="medium">${value}</schmancy-typography>
			</schmancy-grid>
		`
	}

	/**
	 * Render QR code with download button
	 */
	private renderQRCode() {
		return html`
			<schmancy-grid justify="center" gap="md" class="p-6">
				<img
					src=${this.utilities.generateQRCodeDataUrl(this.booking, this.selectedCourt)}
					alt="Booking QR Code"
					width="150"
					height="150"
					class="mx-auto mb-3"
				/>

				<schmancy-icon-button @click=${() => this.downloadQRCode()} class="animate-bounce" variant="filled"
					>download</schmancy-icon-button
				>
			</schmancy-grid>
		`
	}

	/**
	 * Render error state when booking data is incomplete
	 */
	private renderErrorState() {
		return html`
			<schmancy-surface type="containerLow" rounded="all" class="p-6">
				<schmancy-flex flow="col" align="center" justify="center" gap="md">
					<schmancy-icon class="text-error-default" size="48px">error</schmancy-icon>
					<schmancy-typography type="title" token="md">Booking Information Error</schmancy-typography>
					<schmancy-typography type="body" token="md" class="text-center">
						We couldn't retrieve complete booking information. This may be due to a temporary system issue.
					</schmancy-typography>
					<schmancy-button variant="filled" @click=${() => this.onNewBooking?.()}> Return to Booking </schmancy-button>
				</schmancy-flex>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-confirmation': BookingConfirmation
	}
}
