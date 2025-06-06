// Example updated booking confirmation with wallet pass integration
import { $dialog, $notify, area, SchmancyInputChangeEventV2 } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { VenuesLandingPage } from 'src/public/venues/venues'
import { BookingUtils } from '../book/booking-utils'
import { resendBookingEmail } from '../book/components/services'
import { Booking, bookingContext, BookingProgressContext } from '../book/context'
import '../shared/components/social-buttons'

// Set up dayjs plugins
dayjs.extend(utc)
dayjs.extend(timezone)

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
	@state() private resendingEmail: boolean = false
	@state() private enteredEmail: string = ''

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

		// Initialize enteredEmail with customerEmail
		this.enteredEmail = this.customerEmail
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
				component: VenuesLandingPage,
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
	 * Format time for display in 24-hour format
	 */
	private formatTime(start: string, end: string): string {
		// Import timezone utilities
		const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'
		
		// Convert UTC times to user's timezone for display
		const startLocal = dayjs(start).tz(userTimezone).format('HH:mm')
		const endLocal = dayjs(end).tz(userTimezone).format('HH:mm')
		
		return `${startLocal} - ${endLocal}`
	}

	/**
	 * Get formatted address string from venue data
	 */
	private getFormattedAddress(): string {
		if (!this.venue?.address) return 'Address unavailable'

		// Handle both string and object address formats
		if (typeof this.venue.address === 'string') {
			return this.venue.address
		}

		const address = this.venue.address
		const parts = []

		if (address.street) parts.push(address.street)
		if (address.city) parts.push(address.city)
		if (address.postalCode) parts.push(address.postalCode)
		if (address.country) parts.push(address.country)

		return parts.join(', ') || 'Address unavailable'
	}

	/**
	 * Generate Google Maps URL for directions to the venue
	 */
	private getMapUrl(): string {
		const address = this.getFormattedAddress()
		const venueName = this.venue?.name || ''

		// Construct a Google Maps URL with the venue name and address
		const query = encodeURIComponent(`${venueName}, ${address}`)
		return `https://maps.google.com/maps?q=${query}&daddr=${query}&dirflg=d`
	}

	/**
	 * Handle resending email confirmation
	 * Prompts user for email address then calls API
	 */
	private async handleResendEmail() {
		// Reset enteredEmail to current customerEmail
		this.enteredEmail = this.customerEmail

		// Prompt for email address with the current one prefilled
		const result = await $dialog.confirm({
			title: 'Resend Booking Confirmation',
			content: html`
				<div class="space-y-4">
					<p>Enter the email address to receive the booking confirmation:</p>
					<schmancy-input
						id="email-input"
						label="Email Address"
						type="email"
						value=${this.enteredEmail}
						required
						@change=${(e: SchmancyInputChangeEventV2) => {
							if (!e.detail.value) return
							this.enteredEmail = e.detail.value
						}}
					></schmancy-input>
				</div>
			`,
			confirmText: 'Send',
			cancelText: 'Cancel',
		})

		if (result) {
			if (!this.enteredEmail || !this.enteredEmail.includes('@')) {
				$notify.error('Please enter a valid email address')
				return
			}

			this.resendingEmail = true

			try {
				// Prepare booking data for API
				const bookingData = {
					bookingId: this.bookingId,
					customerEmail: this.enteredEmail,
					customerName: this.customerName,
					customerPhone: '',
					venueInfo: {
						name: this.venue?.name || '',
						address: typeof this.venue?.address === 'string' ? this.venue.address : this.venue?.address?.street || '',
						city: typeof this.venue?.address === 'object' ? this.venue?.address?.city || '' : '',
						postalCode: typeof this.venue?.address === 'object' ? this.venue?.address?.postalCode || '' : '',
						country: typeof this.venue?.address === 'object' ? this.venue?.address?.country || '' : '',
					},
					bookingDetails: {
						date: this.booking.date,
						startTime: this.booking.startTime, // Send full ISO string
						endTime: this.booking.endTime,     // Send full ISO string
						userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin',
						price: this.booking.price.toString(),
						court: this.selectedCourt?.name || 'Court',
						venue: this.venue?.name || 'Venue',
					},
				}

				// Use the email service to resend the email
				resendBookingEmail(bookingData).subscribe({
					next: () => {
						$notify.success(`Confirmation email sent to ${this.enteredEmail}`)

						// Update the customer email if it changed
						if (this.enteredEmail !== this.customerEmail) {
							this.customerEmail = this.enteredEmail
						}
					},
					error: error => {
						console.error('Error resending email:', error)
						$notify.error(`Failed to send email: ${error?.message || 'Unknown error'}`)
					},
					complete: () => {
						this.resendingEmail = false
					},
				})
			} catch (error: any) {
				console.error('Error resending email:', error)
				$notify.error(`Failed to send email: ${error?.message || 'Unknown error'}`)
				this.resendingEmail = false
			}
		}
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
			<schmancy-scroll class="h-screen bg-surface-default">
				<div class="min-h-screen flex items-center justify-center p-2">
					<div class="w-full max-w-2xl">
						<!-- Main vertical flow container -->
						<div class="flex flex-col items-center gap-2">
							<!-- Logo -->
							<img
								src="/logo.svg"
								alt="Funkhaus Sports Logo"
								
								class="cursor-pointer size-1/6"
								@click=${() => this.returnToHome()}
							/>

							<!-- Title -->
							<schmancy-grid gap="xs" class="text-center">
								<schmancy-typography type="title" token="lg">Booking Confirmed!</schmancy-typography>
							</schmancy-grid>

							<!-- QR Code -->
							<schmancy-surface type="containerLow" rounded="all" class="p-4">
								<schmancy-grid gap="sm" align="center">
									<img
										src=${BookingUtils.generateQRCodeDataUrl(this.booking, this.selectedCourt)}
										alt="Booking QR Code"
										width="160"
										height="160"
										class="block"
									/>
									<sch-flex gap="2" align="center" justify="between" class="w-full">
										<schmancy-typography> Check-in QR code </schmancy-typography>
										<schmancy-icon-button
											size="sm"
											variant="outlined"
											@click=${() => this.downloadQRCode()}
											.disabled=${this.downloading}
										>
											download
										</schmancy-icon-button>
									</sch-flex>
								</schmancy-grid>
							</schmancy-surface>
							<schmancy-flex align="center" justify="center" gap="sm">
								<schmancy-grid>
									<schmancy-typography type="label" class="text-surface-onVariant"> Email sent to </schmancy-typography>
									<sch-flex align="center" gap="2">
										<schmancy-typography> ${this.customerEmail}</schmancy-typography>

										<schmancy-icon-button
											variant="text"
											size="sm"
											@click=${() => this.handleResendEmail()}
											.disabled=${this.resendingEmail}
											title="Resend email"
										>
											${this.resendingEmail ? 'hourglass_empty' : 'undo'}
										</schmancy-icon-button>
									</sch-flex>
								</schmancy-grid>
							</schmancy-flex>

							<!-- Booking Details Card -->
							<schmancy-card class="w-full max-w-sm">
								<schmancy-grid gap="sm" class="p-3">
									<!-- Venue & Court -->
									<schmancy-flex justify="between" align="center">
										<schmancy-flex gap="sm" align="start">
											<schmancy-icon class="text-surface-onVariant">location_on</schmancy-icon>
											<div class="flex-1 text-left">
												<schmancy-typography type="body" token="md" class="font-medium"
													>${venueName}</schmancy-typography
												>
												<schmancy-typography type="body" token="sm" class="text-surface-onVariant"
													>${courtName}</schmancy-typography
												>
											</div>
										</schmancy-flex>
										<schmancy-typography type="title" token="md" class="text-primary-default">
											€${this.booking.price.toFixed(2)}
										</schmancy-typography>
									</schmancy-flex>
									<schmancy-divider></schmancy-divider>

									<!-- Date & Time -->
									<schmancy-flex gap="sm" align="start">
										<schmancy-icon class="text-surface-onVariant">event</schmancy-icon>
										<div class="flex-1 text-left">
											<schmancy-typography type="body" token="md">${dateFormatted}</schmancy-typography>
											<schmancy-typography type="body" token="sm" class="text-surface-onVariant">
												${timeFormatted} • ${BookingUtils.formatDuration(this.booking.startTime, this.booking.endTime)}
											</schmancy-typography>
										</div>
									</schmancy-flex>

									<!-- Address -->
									${this.venue?.address
										? html`
												<schmancy-divider></schmancy-divider>
												<a
													href="${this.getMapUrl()}"
													target="_blank"
													class="flex items-center gap-3 text-surface-on hover:text-primary-default transition-colors"
												>
													<schmancy-icon>directions</schmancy-icon>
													<schmancy-typography type="body" token="sm" class="flex-1">
														${this.getFormattedAddress()}
													</schmancy-typography>
												</a>
											`
										: ''}
								</schmancy-grid>
							</schmancy-card>

							<!-- Action Buttons -->
							<schmancy-grid gap="sm" class="w-full">
								<schmancy-flex gap="sm" justify="center">
									<schmancy-button variant="outlined" href=${calendarUrl} width="full">
										<schmancy-icon>calendar_month</schmancy-icon>
										Add To Calendar
									</schmancy-button>
									<schmancy-icon-button
										variant="outlined"
										width="full"
										@click=${() => BookingUtils.shareBooking(this.booking, this.selectedCourt?.name)}
									>
										share
									</schmancy-icon-button>
									<!-- <schmancy-button variant="outlined" width="full" @click=${() => this.returnToHome()}>
                    <schmancy-icon>add</schmancy-icon>
                    Book More
                  </schmancy-button> -->
								</schmancy-flex>
							</schmancy-grid>

							<!-- Social Buttons -->
							<social-buttons></social-buttons>
						</div>
					</div>
				</div>
			</schmancy-scroll>
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
					<schmancy-button variant="filled" @click=${() => this.returnToHome()}>Return to Booking</schmancy-button>
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
