import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import qrcode from 'qrcode-generator'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { Court } from 'src/db/courts.collection'
import { Booking, bookingContext } from '../context'
@customElement('booking-confirmation')
export class BookingConfirmation extends $LitElement() {
	@property({ type: Object }) booking!: Booking
	@property({ type: Object }) selectedCourt?: Court
	@property({ type: String }) customerEmail: string = ''
	@property({ type: String }) customerName: string = ''
	@property({ type: String }) bookingId: string = ''
	@property({ attribute: false }) onNewBooking?: () => void

	/**
	 * Generate downloadable calendar file (ICS)
	 */
	private generateCalendarFile(): string {
		const startDate = dayjs(this.booking.startTime)
		const endDate = dayjs(this.booking.endTime)
		const eventTitle = `Court Booking: ${this.selectedCourt?.name || 'Tennis Court'}`
		const location = 'Funkhaus Berlin Sports Center'
		const start = startDate.format('YYYYMMDDTHHmmss')
		const end = endDate.format('YYYYMMDDTHHmmss')
		const now = dayjs().format('YYYYMMDDTHHmmss')
		const uid = `booking-${this.bookingId || Math.random().toString(36).substring(2, 11)}@funkhaus-sports.com`

		const icsContent = [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Funkhaus Berlin Sports//Court Booking//EN',
			'CALSCALE:GREGORIAN',
			'METHOD:PUBLISH',
			'BEGIN:VEVENT',
			`UID:${uid}`,
			`DTSTAMP:${now}Z`,
			`DTSTART:${start}Z`,
			`DTEND:${end}Z`,
			`SUMMARY:${eventTitle}`,
			`LOCATION:${location}`,
			'STATUS:CONFIRMED',
			'SEQUENCE:0',
			'BEGIN:VALARM',
			'TRIGGER:-PT1H',
			'ACTION:DISPLAY',
			'DESCRIPTION:Reminder',
			'END:VALARM',
			'END:VEVENT',
			'END:VCALENDAR',
		].join('\r\n')

		return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsContent)
	}

	/**
	 * Generate a QR code with the booking details
	 */
	private getQRCodeDataUrl(): string {
		// First, import the qrcode-generator library
		// This should be added to your project dependencies
		// npm install qrcode-generator

		const bookingInfo = JSON.stringify({
			id: this.booking.id,
			date: this.booking.date,
			time: dayjs(this.booking.startTime).format('HH:mm'),
			court: this.selectedCourt?.name || 'Court',
		})
		// Create QR code (type 0 is the default)
		const qr = qrcode(0, 'M')
		qr.addData(bookingInfo)
		qr.make()

		// Return the QR code as a data URL
		return qr.createDataURL(5) // 5 is the cell size in pixels
	}

	/**
	 * Download QR code image
	 */
	private async downloadQRCode() {
		const qrDataUrl = await this.getQRCodeDataUrl()
		const link = document.createElement('a')
		link.href = qrDataUrl
		console.log(this.booking.id)
		const court = courtsContext.value.get(this.booking.courtId)
		const venue = venuesContext.value.get(court?.venueId || '')
		const formattedDate = dayjs(this.booking.startTime).format('dddd MMM @HH mm A')
		const venueName = (venue?.name || 'venue').replace(/[^a-z0-9]/gi, '-').toLowerCase()
		const courtName = (court?.name || 'court').replace(/[^a-z0-9]/gi, '-').toLowerCase()
		link.download = `booking-${venueName}-${courtName}-${formattedDate}.png`
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
	}

	render() {
		const startTime = dayjs(this.booking.startTime)
		const endTime = dayjs(this.booking.endTime)
		const dateFormatted = startTime.format('ddd, MMM D')
		const timeFormatted = `${startTime.format('h:mm A')} - ${endTime.format('h:mm A')}`
		const calendarUrl = this.generateCalendarFile()

		return html`
			<style>
				:host {
					display: block;
					max-width: 100%;
					padding: 16px;
				}

				.booking-card {
					min-height: calc(100vh - 32px);
					display: flex;
					flex-direction: column;
					justify-content: space-between;
					padding: 24px 16px;
				}

				.details-grid {
					display: grid;
					grid-template-columns: 1fr 1fr;
					gap: 16px;
				}

				.detail-item {
					margin-bottom: 12px;
				}

				.actions {
					display: flex;
					flex-wrap: wrap;
					gap: 12px;
					justify-content: center;
					margin-top: 24px;
				}

				.qr-container {
					position: relative;
					width: fit-content;
					margin: 0 auto;
				}

				.qr-download-btn:hover {
					background-color: var(--schmancy-primary-container);
				}

				.confirmation-header {
					margin-bottom: 24px;
				}

				.booking-details {
					margin-bottom: 24px;
				}
			</style>

			<schmancy-surface type="containerLow" rounded="all" class="booking-card">
				<!-- Success Header -->
				<div class="confirmation-header flex items-center justify-center gap-3 text-primary-default">
					<schmancy-icon size="large">check_circle</schmancy-icon>
					<schmancy-typography type="headline" token="md">Booking Confirmed!</schmancy-typography>
				</div>

				<!-- Essential Booking Info -->
				<div class="booking-details">
					<!-- QR Code & Reference -->
					<div class="text-center mb-6">
						${this.booking.id
							? html`
									<div class="qr-container">
										<img
											src=${this.getQRCodeDataUrl()}
											alt="Booking QR Code"
											width="150"
											height="150"
											class="mx-auto mb-3"
										/>
										<div
											class="absolute bottom-0 right-2"
											@click=${() => this.downloadQRCode()}
											title="Download QR Code"
										>
											<schmancy-icon-button class="animate-bounce" variant="filled">download</schmancy-icon-button>
										</div>
									</div>
							  `
							: ''}
						<!-- <schmancy-typography type="label" token="sm" class="text-surface-on-variant mt-3">
							Booking Reference: #${this.booking.id?.substring(0, 8).toUpperCase() || 'N/A'}
						</schmancy-typography> -->
					</div>

					<!-- Primary Details -->
					<schmancy-grid class="px-6 py-6 bg-surface-high rounded-md">
						<div class="details-grid">
							<div class="detail-item">
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-1"
									>Date</schmancy-typography
								>
								<schmancy-typography type="body" weight="medium">${dateFormatted}</schmancy-typography>
							</div>
							<div class="detail-item">
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-1"
									>Time</schmancy-typography
								>
								<schmancy-typography type="body" weight="medium">${timeFormatted}</schmancy-typography>
							</div>
							<div class="detail-item">
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-1"
									>Court</schmancy-typography
								>
								<schmancy-typography type="body" weight="medium">
									${this.selectedCourt?.name || 'Court'}
								</schmancy-typography>
							</div>
							<div class="detail-item">
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-1"
									>Total</schmancy-typography
								>
								<schmancy-typography type="body" weight="medium" class="text-primary-default">
									€${this.booking.price.toFixed(2)}
								</schmancy-typography>
							</div>
						</div>
					</schmancy-grid>
				</div>

				<!-- Actions -->
				<div class="actions">
					<schmancy-button variant="filled" href=${calendarUrl} download="tennis-court-booking.ics">
						<schmancy-icon>calendar_month</schmancy-icon>
						Add to Calendar
					</schmancy-button>
					<schmancy-button variant="outlined" @click=${() => this.shareBooking()}>
						<schmancy-icon>share</schmancy-icon>
						Share
					</schmancy-button>
					<schmancy-button
						variant="filled tonal"
						@click=${() => {
							bookingContext.clear()
							this.onNewBooking?.()
						}}
					>
						<schmancy-icon>add</schmancy-icon>
						Book Again
					</schmancy-button>
				</div>
			</schmancy-surface>
		`
	}

	/**
	 * Share booking details using the Web Share API if available
	 */
	private shareBooking() {
		const startTime = dayjs(this.booking.startTime)
		const text = `I've booked a court at Funkhaus Berlin Sports on ${startTime.format('MMMM D')} at ${startTime.format(
			'h:mm A',
		)}. Join me!`

		if (navigator.share) {
			navigator
				.share({
					title: 'My Court Booking',
					text: text,
					url: window.location.href,
				})
				.catch(error => console.log('Error sharing', error))
		} else {
			const textArea = document.createElement('textarea')
			textArea.value = text
			document.body.appendChild(textArea)
			textArea.select()
			document.execCommand('copy')
			document.body.removeChild(textArea)
			alert('Booking details copied to clipboard!')
		}
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-confirmation': BookingConfirmation
	}
}
