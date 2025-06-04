// Example updated booking confirmation with wallet pass integration
import { $dialog, $notify, area, SchmancyInputChangeEventV2 } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
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
    return `${dayjs(start).format('HH:mm')} - ${dayjs(end).format('HH:mm')}`
  }
  
  /**
   * Get formatted address string from venue data
   */
  private getFormattedAddress(): string {
    if (!this.venue?.address) return 'Address unavailable';
    
    // Handle both string and object address formats
    if (typeof this.venue.address === 'string') {
      return this.venue.address;
    }
    
    const address = this.venue.address;
    const parts = [];
    
    if (address.street) parts.push(address.street);
    if (address.city) parts.push(address.city);
    if (address.postalCode) parts.push(address.postalCode);
    if (address.country) parts.push(address.country);
    
    return parts.join(', ') || 'Address unavailable';
  }
  
  /**
   * Generate Google Maps URL for directions to the venue
   */
  private getMapUrl(): string {
    const address = this.getFormattedAddress();
    const venueName = this.venue?.name || '';
    
    // Construct a Google Maps URL with the venue name and address
    const query = encodeURIComponent(`${venueName}, ${address}`);
    return `https://maps.google.com/maps?q=${query}&daddr=${query}&dirflg=d`;
  }
  
  /**
   * Handle resending email confirmation
   * Prompts user for email address then calls API
   */
  private async handleResendEmail() {
    // Reset enteredEmail to current customerEmail
    this.enteredEmail = this.customerEmail;
    
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
              if (!e.detail.value) return;
              this.enteredEmail = e.detail.value;
            }}
          ></schmancy-input>
        </div>
      `,
      confirmText: 'Send',
      cancelText: 'Cancel'
    });
    
    if (result) {
      if (!this.enteredEmail || !this.enteredEmail.includes('@')) {
        $notify.error('Please enter a valid email address');
        return;
      }
      
      this.resendingEmail = true;
      
      try {
        // Prepare booking data for API
        const bookingData = {
          bookingId: this.bookingId,
          customerEmail: this.enteredEmail,
          customerName: this.customerName,
          customerPhone: '',
          venueInfo: {
            name: this.venue?.name || '',
            address: typeof this.venue?.address === 'string' 
              ? this.venue.address 
              : this.venue?.address?.street || '',
            city: typeof this.venue?.address === 'object' 
              ? this.venue?.address?.city || '' 
              : '',
            postalCode: typeof this.venue?.address === 'object' 
              ? this.venue?.address?.postalCode || '' 
              : '',
            country: typeof this.venue?.address === 'object' 
              ? this.venue?.address?.country || '' 
              : ''
          },
          bookingDetails: {
            date: this.booking.date,
            startTime: dayjs(this.booking.startTime).format('HH:mm'),
            endTime: dayjs(this.booking.endTime).format('HH:mm'),
            price: this.booking.price.toString(),
            court: this.selectedCourt?.name || 'Court',
            venue: this.venue?.name || 'Venue'
          }
        };
        
        // Use the email service to resend the email
        resendBookingEmail(bookingData).subscribe({
          next: () => {
            $notify.success(`Confirmation email sent to ${this.enteredEmail}`);
            
            // Update the customer email if it changed
            if (this.enteredEmail !== this.customerEmail) {
              this.customerEmail = this.enteredEmail;
            }
          },
          error: error => {
            console.error('Error resending email:', error);
            $notify.error(`Failed to send email: ${error?.message || 'Unknown error'}`);
          },
          complete: () => {
            this.resendingEmail = false;
          }
        });
      } catch (error: any) {
        console.error('Error resending email:', error);
        $notify.error(`Failed to send email: ${error?.message || 'Unknown error'}`);
        this.resendingEmail = false;
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
        <div class="min-h-screen flex items-center justify-center p-4">
          <div class="w-full max-w-2xl">
            <!-- Main vertical flow container -->
            <div class="flex flex-col items-center gap-4">
              <!-- Logo -->
              <img 
                src="/logo.svg" 
                alt="Funkhaus Sports Logo" 
                width="60" 
                height="60"
                class="cursor-pointer" 
                @click=${() => this.returnToHome()}
              />

              <!-- Title -->
              <schmancy-grid gap="xs" class="text-center">
                <schmancy-typography type="title" token="lg">Booking Confirmed!</schmancy-typography>
                <schmancy-flex align="center" justify="center" gap="sm">
                  <schmancy-typography type="body" token="sm" class="text-surface-onVariant">
                    Check-in with QR code • Email sent to ${this.customerEmail}
                  </schmancy-typography>
                  <schmancy-icon-button
                    variant="text"
                    @click=${() => this.handleResendEmail()}
                    .disabled=${this.resendingEmail}
                    title="Resend email"
                  >
                    <schmancy-icon>${this.resendingEmail ? 'hourglass_empty' : 'refresh'}</schmancy-icon>
                  </schmancy-icon-button>
                </schmancy-flex>
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
                  <schmancy-button
                    variant="text"
                    @click=${() => this.downloadQRCode()}
                    .disabled=${this.downloading}
                  >
                    <schmancy-icon>download</schmancy-icon>
                    ${this.downloading ? 'Downloading...' : 'Download QR'}
                  </schmancy-button>
                </schmancy-grid>
              </schmancy-surface>

              <!-- Venue Card - Desktop Only -->
              ${this.venue ? html`
                <funkhaus-venue-card
                  class="hidden md:block w-full"
                  .venue=${this.venue}
                  .theme=${this.venue.theme!}
                  readonly
                ></funkhaus-venue-card>
              ` : ''}

              <!-- Booking Details Card -->
              <schmancy-card class="w-full">
                <schmancy-grid gap="sm" class="p-3">
                  <!-- Venue & Court -->
                  <schmancy-flex justify="between" align="center">
                    <schmancy-flex gap="sm" align="center">
                      <schmancy-icon class="text-surface-onVariant">stadium</schmancy-icon>
                      <div class="flex-1 text-left">
                        <schmancy-typography type="body" token="md" class="font-medium">${venueName}</schmancy-typography>
                        <schmancy-typography type="body" token="sm" class="text-surface-onVariant">${courtName}</schmancy-typography>
                      </div>
                    </schmancy-flex>
                    <schmancy-typography type="title" token="md" class="text-primary-default">
                      €${this.booking.price.toFixed(2)}
                    </schmancy-typography>
                  </schmancy-flex>
                  <schmancy-divider></schmancy-divider>

                  <!-- Date & Time -->
                  <schmancy-flex gap="sm" align="center">
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
                    : ''
                  }
                </schmancy-grid>
              </schmancy-card>

              <!-- Action Buttons -->
              <schmancy-grid gap="sm" class="w-full">
                <schmancy-grid cols="1fr 1fr 1fr" gap="sm">
                  <schmancy-button variant="filled" href=${calendarUrl} width="full">
                    <schmancy-icon>calendar_month</schmancy-icon>
                    Calendar
                  </schmancy-button>
                  <schmancy-button
                    variant="filled"
                    width="full"
                    @click=${() => BookingUtils.shareBooking(this.booking, this.selectedCourt?.name)}
                  >
                    <schmancy-icon>share</schmancy-icon>
                    Share
                  </schmancy-button>
                  <schmancy-button variant="outlined" width="full" @click=${() => this.returnToHome()}>
                    <schmancy-icon>add</schmancy-icon>
                    Book More
                  </schmancy-button>
                </schmancy-grid>
              </schmancy-grid>

              <!-- Social Buttons -->
              <schmancy-flex gap="sm" justify="center">
                <a 
                  href="https://chat.whatsapp.com/LsIWyP8U9mRJZKkBqGTOS7"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                  WhatsApp
                </a>
                
                <a 
                  href="https://www.instagram.com/picklehaus.berlin"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-xs font-medium transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM5.838 12a6.162 6.162 0 1112.324 0 6.162 6.162 0 01-12.324 0zM12 16a4 4 0 110-8 4 4 0 010 8zm4.965-10.405a1.44 1.44 0 112.881.001 1.44 1.44 0 01-2.881-.001z"/>
                  </svg>
                  Instagram
                </a>
              </schmancy-flex>
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
