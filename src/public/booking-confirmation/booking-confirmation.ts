// Example updated booking confirmation with wallet pass integration
import { $dialog, $notify, area, fullHeight, SchmancyInputChangeEventV2 } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { VenuesLandingPage } from 'src/public/venues/venues'
import { Court } from 'src/types/booking/court.types'
import { Venue } from 'src/types/booking/venue.types'
import { BookingUtils } from '../book/booking-utils'
import { resendBookingEmail } from '../book/components/services'
import { Booking, bookingContext, BookingProgressContext } from '../book/context'
import '../shared/components/banner'
import '../shared/components/social-buttons'
import '../shared/components/venue-map'

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
						endTime: this.booking.endTime, // Send full ISO string
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
			<schmancy-grid ${fullHeight()} rows="auto 1fr" class="bg-surface-default">
				<!-- Banner - same as book page -->
				<page-header-banner
					class="h-[15vh] sm:h-[20vh] lg:h-[25vh] lg:block"
					.title=${venueName}
					description="BOOKING CONFIRMED!"
					imageSrc="/assets/still02.jpg"
				>
     
                       <div class="absolute right-0 top-[1vh] lg:top-[5vh] my-auto">
                           <img
											src="/logo.svg"
											alt="Funkhaus Sports Logo"
											class="cursor-pointer h-[15vh] lg:h-[20vh] w-auto"
											@click=${() => this.returnToHome()}
										/>
        </div>
				</page-header-banner>

				<!-- Main Content Grid -->
				<schmancy-scroll>
					<schmancy-grid
						.rcols=${{
							sm: '1fr',
							lg: '2fr 1fr',
						}}
						class="min-h-0"
					>
						<!-- Left Column - Confirmation Details -->
						<section class="max-w-3xl w-full justify-self-center lg:justify-end flex">
							<schmancy-scroll hide class="w-full">
								<div class="p-4 lg:p-6">
								

									<!-- Success Title -->
									<!-- <div class="text-center mb-8">
										<schmancy-typography type="display" token="sm" class="text-primary-default mb-2">
											Booking Confirmed!
										</schmancy-typography>
										<schmancy-typography type="body" token="lg" class="text-surface-onVariant">
											Your court is reserved and ready
										</schmancy-typography>
									</div> -->

									<!-- QR Code Section -->
									<schmancy-surface type="containerLow" rounded="all" class="p-6 mb-6">
										<schmancy-grid gap="md" align="center" class="text-center">
											<img
												src=${BookingUtils.generateQRCodeDataUrl(this.booking, this.selectedCourt)}
												alt="Booking QR Code"
												width="180"
												height="180"
												class="mx-auto"
											/>
											<schmancy-grid gap="sm">
												<schmancy-typography type="headline" token="sm"> Check-in QR Code </schmancy-typography>
												<schmancy-typography type="body" token="sm" class="text-surface-onVariant">
													Present this code at the venue for quick check-in
												</schmancy-typography>
											</schmancy-grid>
											<schmancy-button
												variant="outlined"
												@click=${() => this.downloadQRCode()}
												.disabled=${this.downloading}
												class="w-full sm:w-auto"
											>
												<schmancy-icon>download</schmancy-icon>
												Download QR Code
											</schmancy-button>
										</schmancy-grid>
									</schmancy-surface>

									<!-- Email Confirmation -->
									<schmancy-surface type="containerLow" rounded="all" class="p-4 mb-6">
										<schmancy-flex align="center" justify="between" gap="md">
											<schmancy-grid gap="xs" class="flex-1">
												<schmancy-typography type="label" token="sm" class="text-surface-onVariant">
													Confirmation email sent to:
												</schmancy-typography>
												<schmancy-typography type="body" token="md" class="font-medium">
													${this.customerEmail}
												</schmancy-typography>
											</schmancy-grid>
											<schmancy-button
												variant="text"
												@click=${() => this.handleResendEmail()}
												.disabled=${this.resendingEmail}
												class="flex-shrink-0"
											>
												<schmancy-icon>${this.resendingEmail ? 'hourglass_empty' : 'email'}</schmancy-icon>
												${this.resendingEmail ? 'Sending...' : 'Resend'}
											</schmancy-button>
										</schmancy-flex>
									</schmancy-surface>

									<!-- Booking Details -->
									<schmancy-surface type="containerLow" rounded="all" class="p-4 mb-6">
										<schmancy-grid gap="md">
											<!-- Header -->
											<schmancy-flex justify="between" align="center">
												<schmancy-typography type="headline" token="sm"> Booking Details </schmancy-typography>
												<schmancy-typography type="title" token="lg" class="text-primary-default">
													€${this.booking.price.toFixed(2)}
												</schmancy-typography>
											</schmancy-flex>

											<schmancy-divider></schmancy-divider>

											<!-- Venue & Court -->
											<schmancy-flex gap="sm" align="start">
												<schmancy-icon class="text-primary-default mt-1">location_on</schmancy-icon>
												<schmancy-grid gap="xs" class="flex-1">
													<schmancy-typography type="body" token="md" class="font-medium">
														${venueName}
													</schmancy-typography>
													<schmancy-typography type="body" token="sm" class="text-surface-onVariant">
														${courtName}
													</schmancy-typography>
												</schmancy-grid>
											</schmancy-flex>

											<!-- Date & Time -->
											<schmancy-flex gap="sm" align="start">
												<schmancy-icon class="text-primary-default mt-1">event</schmancy-icon>
												<schmancy-grid gap="xs" class="flex-1">
													<schmancy-typography type="body" token="md" class="font-medium">
														${dateFormatted}
													</schmancy-typography>
													<schmancy-typography type="body" token="sm" class="text-surface-onVariant">
														${timeFormatted} •
														${BookingUtils.formatDuration(this.booking.startTime, this.booking.endTime)}
													</schmancy-typography>
												</schmancy-grid>
											</schmancy-flex>

											<!-- Address (if available) -->
											${this.venue?.address
												? html`
														<schmancy-flex class="flex lg:hidden" gap="sm" align="start">
															<schmancy-icon class="text-primary-default mt-1">directions</schmancy-icon>
															<schmancy-grid gap="xs" class="flex-1">
																<schmancy-typography type="body" token="sm" class="text-surface-onVariant">
																	${this.getFormattedAddress()}
																</schmancy-typography>
															</schmancy-grid>
														</schmancy-flex>
													`
												: ''}
										</schmancy-grid>
									</schmancy-surface>

									<!-- Action Buttons -->
									<schmancy-grid gap="sm" class="mb-20">
										<schmancy-flex gap="sm" justify="center" class="flex-wrap">
											<schmancy-button variant="filled" href=${calendarUrl} >
												<schmancy-icon>calendar_month</schmancy-icon>
												 Calendar
											</schmancy-button>
											<schmancy-button
												variant="outlined"
												@click=${() => BookingUtils.shareBooking(this.booking, this.selectedCourt?.name)}
												
											>
												<schmancy-icon>share</schmancy-icon>
												<span class="hidden lg:inline">Share Booking</span>
											</schmancy-button>
                      	<schmancy-button variant="outlined" @click=${() => this.returnToHome()} >
											<schmancy-icon>add</schmancy-icon>
                      
											Book Another Court
										</schmancy-button>
										</schmancy-flex>
									
									</schmancy-grid>

									<!-- Social Buttons -->
									<div class="fixed inset-x-0 bottom-4 mx-0 lg:flex  justify-center">
                    <sch-flex justify="center" class="w-full">
										<social-buttons></social-buttons>

                    </sch-flex>
									</div>
								</div>
							</schmancy-scroll>
						</section>

						<!-- Right Column - Venue Map (Desktop Only) -->
						<schmancy-surface rounded="all" type="container" class="max-w-lg w-full hidden lg:block mx-auto m-4">
							<schmancy-grid gap="md" class="p-4">
								<!-- Map Component -->
								<venue-map
									.address=${this.venue?.address}
									.venueName=${venueName}
									zoom=${16}
									showMarker
									interactive
									class="h-64 w-full rounded-lg overflow-hidden"
								></venue-map>

								<!-- Address and Directions -->
								${this.venue?.address
									? html`
											<schmancy-divider></schmancy-divider>
											<schmancy-grid gap="sm">
												<schmancy-flex align="center" gap="sm">
													<schmancy-icon class="text-primary-default">location_on</schmancy-icon>
													<schmancy-typography type="headline" token="sm"> ${venueName} </schmancy-typography>
												</schmancy-flex>
												<schmancy-typography type="body" token="sm" class="text-surface-onVariant ml-8">
													${this.getFormattedAddress()}
												</schmancy-typography>

												<schmancy-button
													variant="outlined"
													width="full"
													@click=${() => {
														const mapUrl = this.getMapUrl()
														window.open(mapUrl, '_blank')
													}}
												>
													<schmancy-icon slot="prefix">directions</schmancy-icon>
													Get Directions
												</schmancy-button>
											</schmancy-grid>
										`
									: ''}
							</schmancy-grid>
						</schmancy-surface>
					</schmancy-grid>
				</schmancy-scroll>
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
