import { $notify, area, fullHeight } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { VenueLandingPage } from 'src/public/venues/venues'
import { BookingUtils } from '../book/booking-utils'
import { Booking, bookingContext, BookingProgressContext } from '../book/context'

@customElement('booking-confirmation')
export class BookingConfirmation extends $LitElement() {
	@property({ type: Object }) booking!: Booking
	@property({ type: Object }) selectedCourt?: Court
	@property({ type: String }) customerEmail: string = ''
	@property({ type: String }) customerName: string = ''
	@property({ type: String }) bookingId: string = ''
	@property({ attribute: false }) onNewBooking?: () => void

	// Utilities for booking data formatting and operations
	private venue?: Venue
	private downloading: boolean = false

	connectedCallback(): void {
		super.connectedCallback()

		// Get venue for the booking
		if (this.selectedCourt) {
			this.venue = venuesContext.value.get(this.selectedCourt.venueId)
		} else if (this.booking.courtId) {
			const court = courtsContext.value.get(this.booking.courtId)
			if (court) {
				this.venue = venuesContext.value.get(court.venueId)
			}
		}
	}

	/**
	 * Download QR code for the booking
	 */
	private async downloadQRCode() {
		try {
			this.downloading = true

			// Generate QR code
			const qrDataUrl = BookingUtils.generateQRCodeDataUrl(this.booking, this.selectedCourt)

			// Generate filename
			const filename = BookingUtils.generateQRFilename(this.booking, this.selectedCourt, this.venue)

			// Create download link
			const link = document.createElement('a')
			link.href = qrDataUrl
			link.download = filename
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)

			$notify.success('Booking QR code downloaded successfully')
		} catch (error) {
			console.error('Error downloading QR code:', error)
			$notify.error('Failed to download QR code')
		} finally {
			this.downloading = false
		}
	}

	/**
	 * Return to venue selection page
	 */
	private returnToHome() {
		bookingContext.clear()
		BookingProgressContext.clear()
		if (this.onNewBooking) {
			this.onNewBooking()
		} else {
			area.push({
				component: VenueLandingPage,
				area: 'root',
			})
		}
	}

	/**
	 * Format date for display
	 */
	private formatDate(date: string): string {
		return dayjs(date).format('dddd, MMMM D, YYYY')
	}

	/**
	 * Format time for display
	 */
	private formatTime(start: string, end: string): string {
		return `${dayjs(start).format('h:mm A')} - ${dayjs(end).format('h:mm A')}`
	}

	render() {
		if (!this.booking || !this.booking.startTime || !this.booking.endTime) {
			return this.renderErrorState()
		}

		// Format booking details
		const dateFormatted = this.formatDate(this.booking.date)
		const timeFormatted = this.formatTime(this.booking.startTime, this.booking.endTime)
		const calendarUrl = BookingUtils.generateCalendarFile(this.booking, this.selectedCourt?.name)
		const courtName = this.selectedCourt?.name || 'Court'
		const venueName = this.venue?.name || 'Venue'

		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all">
				<section class="mx-auto max-w-md">
					<schmancy-grid gap="sm" justify="center" class="h-full mx-auto max-w-md">
						<!-- Header/Logo Section -->
						<div class="pt-4 md:pt-8 lg:pt-12 xl:pt-16 flex items-center justify-center">
							<schmancy-icon size="56px" class="text-primary-default">check_circle</schmancy-icon>
						</div>

						<schmancy-grid gap="md" justify="stretch" class="px-6 py-2  md:py-6 max-w-4xl mx-auto w-full">
							<!-- Left Column: Booking Info & QR Code -->
							<div class="grid md:grid-cols-1 gap-2">
								<div class="space-y-1">
									<!-- Booking Information Text -->
									<schmancy-typography align="center" type="body" token="md">
										A confirmation has been sent to
									</schmancy-typography>
									<schmancy-typography align="center" type="title" token="lg">
										${this.customerEmail}
									</schmancy-typography>
									<!-- QR Code Section -->
									<div class="flex flex-col items-center py-4">
										<img
											src=${BookingUtils.generateQRCodeDataUrl(this.booking, this.selectedCourt)}
											alt="Booking QR Code"
											width="160"
											height="160"
											class="mb-3"
										/>
										<schmancy-button
											variant="outlined"
											@click=${() => this.downloadQRCode()}
											.disabled=${this.downloading}
										>
											<schmancy-icon>download</schmancy-icon>
											${this.downloading ? 'Downloading...' : 'Download QR Code'}
										</schmancy-button>
									</div>
								</div>

								<div class="bg-surface-container rounded-xl px-2 space-y-1">
									<!-- Details Grid -->
									<div class="grid grid-cols-2 gap-2">
										<!-- Venue -->
										<schmancy-grid>
											<schmancy-typography type="label" token="sm" class="text-surface-on-variant"
												>Venue:</schmancy-typography
											>
											<schmancy-typography type="body" weight="medium">${venueName}</schmancy-typography>
										</schmancy-grid>

										<!-- Court -->
										<schmancy-grid>
											<schmancy-typography type="label" token="sm" class="text-surface-on-variant"
												>Court:</schmancy-typography
											>
											<schmancy-typography type="body" weight="medium">${courtName}</schmancy-typography>
										</schmancy-grid>

										<!-- Date -->

										<schmancy-grid>
											<schmancy-typography type="label" token="sm" class="text-surface-on-variant"
												>Date:</schmancy-typography
											>
											<schmancy-typography type="body" weight="medium">${dateFormatted}</schmancy-typography>
										</schmancy-grid>

										<!-- Time -->

										<schmancy-grid>
											<schmancy-typography type="label" token="sm" class="text-surface-on-variant"
												>Time:</schmancy-typography
											>
											<schmancy-typography type="body" weight="medium">${timeFormatted}</schmancy-typography>
										</schmancy-grid>

										<!-- Duration -->
										<schmancy-grid>
											<schmancy-typography type="label" token="sm" class="text-surface-on-variant"
												>Duration:</schmancy-typography
											>
											<schmancy-typography type="body" weight="medium">
												${BookingUtils.formatDuration(this.booking.startTime, this.booking.endTime)}
											</schmancy-typography>
										</schmancy-grid>

										<!-- Price -->
										<schmancy-grid>
											<schmancy-typography type="label" token="sm" class="text-surface-on-variant"
												>Total:</schmancy-typography
											>
											<schmancy-typography type="body" weight="medium">
												€${this.booking.price.toFixed(2)}
											</schmancy-typography>
										</schmancy-grid>
									</div>
								</div>
							</div>
						</schmancy-grid>

						<!-- Action Buttons -->
						<div class="flex flex-nowrap flex-col items-center justify-center gap-4 pb-4">
							<sch-flex gap="2">
								<schmancy-button variant="filled" href=${calendarUrl}>
									<schmancy-icon>calendar_month</schmancy-icon>
									Add to Calendar
								</schmancy-button>

								<schmancy-button
									variant="filled"
									@click=${() => BookingUtils.shareBooking(this.booking, this.selectedCourt?.name)}
								>
									<schmancy-icon>share</schmancy-icon>
									Share
								</schmancy-button>
							</sch-flex>
							<schmancy-button variant="outlined" @click=${() => this.returnToHome()}>
								<schmancy-icon>add</schmancy-icon>
								Book Again
							</schmancy-button>
						</div>
					</schmancy-grid>
				</section>
			</schmancy-surface>
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
					<schmancy-button variant="filled" @click=${() => this.returnToHome()}> Return to Booking </schmancy-button>
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
