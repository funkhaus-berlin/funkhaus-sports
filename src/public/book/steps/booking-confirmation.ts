// src/public/book/steps/booking-confirmation.ts

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
		// Format the booking data for calendar
		const startDate = dayjs(this.booking.startTime)
		const endDate = dayjs(this.booking.endTime)
		const eventTitle = `Court Booking: ${this.selectedCourt?.name || 'Tennis Court'}`
		const location = 'Funkhaus Berlin Sports Center'

		// Format dates for iCalendar (UTC format)
		const start = startDate.format('YYYYMMDDTHHmmss')
		const end = endDate.format('YYYYMMDDTHHmmss')
		const now = dayjs().format('YYYYMMDDTHHmmss')

		// Create unique identifier
		const uid = `booking-${this.bookingId || Math.random().toString(36).substring(2, 11)}@funkhaus-sports.com`

		// Construct iCalendar content
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

		// Create data URI
		return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsContent)
	}

	/**
	 * Generate a QR code with the booking details
	 * This is just a placeholder - in a real app, you would generate a proper QR code URL
	 */
	private generateQRCodeUrl(): string {
		// In a real implementation, you would generate a QR code containing booking info
		// For now, we'll just use a placeholder URL
		const bookingInfo = encodeURIComponent(
			JSON.stringify({
				id: this.booking.id,
				date: this.booking.date,
				time: dayjs(this.booking.startTime).format('HH:mm'),
				court: this.selectedCourt?.name || 'Court',
			}),
		)

		return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${bookingInfo}`
	}

	render() {
		const startTime = dayjs(this.booking.startTime)
		const endTime = dayjs(this.booking.endTime)
		const duration = endTime.diff(startTime, 'minute')
		const durationText = duration >= 60 ? `${duration / 60} ${duration > 60 ? 'hours' : 'hour'}` : `${duration} minutes`

		// Format for display
		const dateFormatted = startTime.format('dddd, MMMM D, YYYY')
		const timeFormatted = `${startTime.format('h:mm A')} - ${endTime.format('h:mm A')}`

		// Generate calendar download link
		const calendarUrl = this.generateCalendarFile()

		return html`
			<schmancy-surface type="containerLow" rounded="all" class="px-6 py-8">
				<!-- Success Header -->
				<div class="text-center mb-8">
					<div class="inline-block bg-success-container text-success-on p-4 rounded-full mb-4">
						<schmancy-icon class="text-4xl">check_circle</schmancy-icon>
					</div>
					<schmancy-typography type="headline" token="lg" class="mb-2">Booking Confirmed!</schmancy-typography>
					<schmancy-typography class="text-surface-on-variant">
						Your court has been successfully booked.
					</schmancy-typography>
				</div>

				<!-- Booking Details Card -->
				<schmancy-surface type="container" rounded="all" class="mb-6 p-5">
					<schmancy-typography type="title" token="md" class="mb-4">Booking Details</schmancy-typography>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<schmancy-typography type="label" token="sm" class="text-surface-on-variant">
								Booking Reference
							</schmancy-typography>
							<schmancy-typography type="body" weight="medium">
								#${this.booking.id?.substring(0, 8).toUpperCase() || 'N/A'}
							</schmancy-typography>
						</div>

						<div>
							<schmancy-typography type="label" token="sm" class="text-surface-on-variant">
								Payment Status
							</schmancy-typography>
							<div class="flex items-center">
								<span class="inline-block w-2 h-2 rounded-full bg-success-default mr-2"></span>
								<schmancy-typography type="body" weight="medium"> Paid </schmancy-typography>
							</div>
						</div>

						<div>
							<schmancy-typography type="label" token="sm" class="text-surface-on-variant"> Date </schmancy-typography>
							<schmancy-typography type="body" weight="medium"> ${dateFormatted} </schmancy-typography>
						</div>

						<div>
							<schmancy-typography type="label" token="sm" class="text-surface-on-variant"> Time </schmancy-typography>
							<schmancy-typography type="body" weight="medium"> ${timeFormatted} </schmancy-typography>
						</div>

						<div>
							<schmancy-typography type="label" token="sm" class="text-surface-on-variant">
								Duration
							</schmancy-typography>
							<schmancy-typography type="body" weight="medium"> ${durationText} </schmancy-typography>
						</div>

						<div>
							<schmancy-typography type="label" token="sm" class="text-surface-on-variant"> Court </schmancy-typography>
							<schmancy-typography type="body" weight="medium">
								${this.selectedCourt?.name || 'Court'}
							</schmancy-typography>
						</div>

						<div class="col-span-2">
							<schmancy-typography type="label" token="sm" class="text-surface-on-variant">
								Booked For
							</schmancy-typography>
							<schmancy-typography type="body" weight="medium">
								${this.customerName || this.booking.userName || 'Guest'}
							</schmancy-typography>
						</div>

						<div class="col-span-2">
							<schmancy-divider class="my-2"></schmancy-divider>
							<div class="flex justify-between items-center">
								<schmancy-typography type="label" token="md"> Total Amount: </schmancy-typography>
								<schmancy-typography type="headline" token="sm" class="text-primary-default">
									€${this.booking.price.toFixed(2)}
								</schmancy-typography>
							</div>
						</div>
					</div>
				</schmancy-surface>

				<!-- Add to Calendar and Share Section -->
				<div class="flex flex-wrap gap-4 justify-center mb-6">
					<schmancy-button variant="filled" href=${calendarUrl} download="tennis-court-booking.ics">
						<schmancy-icon>calendar_month</schmancy-icon>
						Add to Calendar
					</schmancy-button>

					<schmancy-button variant="filled tonal" @click=${() => this.shareBooking()}>
						<schmancy-icon>share</schmancy-icon>
						Share
					</schmancy-button>
				</div>

				<!-- Confirmation Email Notice -->
				<div class="bg-surface-container p-4 rounded-lg mb-6">
					<schmancy-flex align="center" gap="sm">
						<schmancy-icon class="text-primary-default">email</schmancy-icon>
						<schmancy-typography>
							A confirmation email has been sent to
							<strong>${this.customerEmail || this.booking.customerEmail || 'your email address'}</strong>
						</schmancy-typography>
					</schmancy-flex>
				</div>

				<!-- QR Code Section - Only shown if booking ID exists -->
				${this.booking.id
					? html`
							<div class="text-center mb-6">
								<schmancy-typography type="title" token="sm" class="mb-2">Booking QR Code</schmancy-typography>
								<schmancy-typography class="text-surface-on-variant mb-4">
									Show this QR code when you arrive at the sports center
								</schmancy-typography>

								<div class="inline-block bg-white p-2 rounded-lg border">
									<img src=${this.generateQRCodeUrl()} alt="Booking QR Code" width="150" height="150" />
								</div>
							</div>
					  `
					: ''}

				<!-- What's Next Section -->
				<div class="bg-surface-default text-primary-on p-4 rounded-lg mb-6">
					<schmancy-typography type="title" token="sm" class="mb-2">What's Next?</schmancy-typography>
					<ul class="list-disc ml-6 space-y-2">
						<li>Please arrive 10-15 minutes before your booking time</li>
						<li>Bring your own racquets and balls (or rent them at the center)</li>
						<li>Wear appropriate tennis/sports shoes</li>
						<li>Check in at the reception desk upon arrival</li>
					</ul>
				</div>

				<!-- Buttons -->
				<div class="flex justify-center gap-4">
					<schmancy-button variant="outlined" @click=${() => window.print()}>
						<schmancy-icon>print</schmancy-icon>
						Print
					</schmancy-button>

					<schmancy-button variant="filled" @click=${() => this.onNewBooking?.()}> Book Another Court </schmancy-button>
				</div>
			</schmancy-surface>
		`
	}

	/**
	 * Share booking details
	 * Uses the Web Share API if available
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
			// Fallback for browsers that don't support the Web Share API
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
