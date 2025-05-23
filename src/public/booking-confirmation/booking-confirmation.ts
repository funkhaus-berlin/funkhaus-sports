// Example updated booking confirmation with wallet pass integration
import { $dialog, $notify, area, fullHeight, SchmancyInputChangeEventV2 } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { courtsContext } from 'src/admin/venues/courts/context'
import { venuesContext } from 'src/admin/venues/venue-context'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { VenueLandingPage } from 'src/public/venues/venues'
import { BookingUtils } from '../book/booking-utils'
// import '../book/components/wallet-button' // Temporarily disabled
import { resendBookingEmail } from '../book/components/services'
import { Booking, bookingContext, BookingProgressContext } from '../book/context'

@customElement('booking-confirmation')
export class BookingConfirmation extends $LitElement() {
  @property({ type: Object }) booking!: Booking
  @property({ type: Object }) selectedCourt?: Court
  @property({ type: String }) customerEmail: string = ''
  @property({ type: String }) customerName: string = ''
  @property({ type: String }) bookingId: string = ''
  // Wallet properties temporarily disabled
  // @property({ type: Boolean }) autoGenerateWallet: boolean = false
  // @property({ type: String }) walletPlatform: string = ''
  @property({ attribute: false }) onNewBooking?: () => void

  // Utilities for booking data formatting and operations
  private venue?: Venue
  private downloading: boolean = false
  @state() private resendingEmail: boolean = false

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
            value=${this.customerEmail}
            required
            @change=${(e:SchmancyInputChangeEventV2)=>{
              if(!e.detail.value) return
              this.customerEmail = e.detail.value
            }}
          ></schmancy-input>
        </div>
      `,
      confirmText: 'Send',
      cancelText: 'Cancel'
    });
    
    if (result) {
      
      if (!this.customerEmail || !this.customerEmail.includes('@')) {
        $notify.error('Please enter a valid email address');
        return;
      }
      
      this.resendingEmail = true;
      
      try {
        // Prepare booking data for API
        const bookingData = {
          bookingId: this.bookingId,
          customerEmail: this.customerEmail,
          customerName: this.customerName,
          customerPhone: '',
          venueInfo: {
            name: this.venue?.name || '',
            address: this.venue?.address.street || '',
            city: this.venue?.address.city || '',
            postalCode: this.venue?.address.postalCode || '',
            country: this.venue?.address.country || ''
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
            $notify.success(`Confirmation email sent to ${this.customerEmail}`);
            
            // Update the customer email if it changed
            if (this.customerEmail !== this.customerEmail) {
              this.customerEmail = this.customerEmail;
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
      } catch (error :any) {
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
      <schmancy-surface ${fullHeight()} type="container" rounded="all">
        <section class="mx-auto max-w-md pt-4">
          <schmancy-grid gap="sm" justify="center" class="h-full mx-auto max-w-md">
            <!-- Header/Logo Section -->
          
            <schmancy-grid gap="md" justify="stretch" class="px-6 py-2 md:py-6 max-w-4xl mx-auto w-full">
              <!-- Booking Info & QR Code -->
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
                    
                    <!-- Address with map link (full width at bottom) -->
                    <div class="col-span-2 mt-2 border-t border-surface-variant pt-2">
                      <div class="flex flex-col gap-1">
                        <schmancy-typography type="label" token="sm" class="text-surface-on-variant">
                          Address:
                        </schmancy-typography>
                        ${this.venue?.address 
                          ? html`
                            <a 
                              href="${this.getMapUrl()}" 
                              target="_blank"
                              class="text-primary-default hover:underline flex items-center gap-1" 
                            >
                              <schmancy-typography type="body" weight="medium" class="flex-grow">
                                ${this.getFormattedAddress()}
                              </schmancy-typography>
                              <schmancy-icon>directions</schmancy-icon>
                            </a>
                          ` 
                          : html`
                            <schmancy-typography type="body" weight="medium">
                              Address unavailable
                            </schmancy-typography>
                          `
                        }
                      </div>
                    </div>
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
              
             
              
              <sch-flex gap="2">
                <schmancy-button 
                  variant="filled tonal" 
                  @click=${() => this.handleResendEmail()}
                  .disabled=${this.resendingEmail}
                >
                  <schmancy-icon>email</schmancy-icon>
                  ${this.resendingEmail ? 'Sending...' : 'Resend Email'}
                </schmancy-button>
                
                <schmancy-button variant="outlined" @click=${() => this.returnToHome()}>
                  <schmancy-icon>add</schmancy-icon>
                  Book Again
                </schmancy-button>
              </sch-flex>
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
