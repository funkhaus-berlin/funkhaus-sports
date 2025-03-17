import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { Court } from 'src/db/courts.collection'
import { Booking } from '../context'

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
	private generateQRCodeUrl(): string {
		const bookingInfo = encodeURIComponent(
			JSON.stringify({
				id: this.booking.id,
				date: this.booking.date,
				time: dayjs(this.booking.startTime).format('HH:mm'),
				court: this.selectedCourt?.name || 'Court',
			}),
		)

		return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${bookingInfo}`
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
				}

				.details-grid {
					display: grid;
					grid-template-columns: 1fr 1fr;
					gap: 12px;
				}

				.detail-item {
					margin-bottom: 8px;
				}

				.actions {
					display: flex;
					flex-wrap: wrap;
					gap: 8px;
					justify-content: center;
				}
			</style>

			<schmancy-surface type="containerLow" rounded="all" class="booking-card">
				<!-- Success Header -->
				<div class="flex items-center justify-center gap-2 text-primary-default">
					<schmancy-icon>check_circle</schmancy-icon>
					<schmancy-typography type="headline" token="md">Confirmed!</schmancy-typography>
				</div>

				<!-- Essential Booking Info -->
				<div class="grid gap-8">
					<!-- QR Code & Reference -->
					<div class="text-center mb-4">
						${this.booking.id
							? html`<img
									src=${this.generateQRCodeUrl()}
									alt="Booking QR Code"
									width="120"
									height="120"
									class="mx-auto mb-2"
							  />`
							: ''}
						<schmancy-typography type="label" token="sm" class="text-surface-on-variant">
							Ref #${this.booking.id?.substring(0, 8).toUpperCase() || 'N/A'}
						</schmancy-typography>
					</div>

					<!-- Primary Details -->
					<schmancy-grid class="px-6  py-5 bg-surface-high">
						<div class="details-grid">
							<div class="detail-item">
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant">Date</schmancy-typography>
								<schmancy-typography type="body" weight="medium">${dateFormatted}</schmancy-typography>
							</div>
							<div class="detail-item">
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant">Time</schmancy-typography>
								<schmancy-typography type="body" weight="medium">${timeFormatted}</schmancy-typography>
							</div>
							<div class="detail-item">
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant">Court</schmancy-typography>
								<schmancy-typography type="body" weight="medium">
									${this.selectedCourt?.name || 'Court'}
								</schmancy-typography>
							</div>
							<div class="detail-item">
								<schmancy-typography type="label" token="sm" class="text-surface-on-variant">Total</schmancy-typography>
								<schmancy-typography type="body" weight="medium" class="text-primary-default">
									€${this.booking.price.toFixed(2)}
								</schmancy-typography>
							</div>
						</div>
					</schmancy-grid>

					<!-- Actions -->
					<div class="actions ">
						<schmancy-button variant="filled" href=${calendarUrl} download="tennis-court-booking.ics">
							<schmancy-icon>calendar_month</schmancy-icon>
							Calendar
						</schmancy-button>
						<schmancy-button variant="outlined" @click=${() => this.shareBooking()}>
							<schmancy-icon>share</schmancy-icon>
							Share
						</schmancy-button>
						<schmancy-button variant="filled tonal" @click=${() => this.onNewBooking?.()}> Book Again </schmancy-button>
					</div>
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
