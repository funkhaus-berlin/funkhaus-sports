// src/admin/venues/bookings/components/booking-details.ts
import { $dialog, $notify, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { resendBookingEmail } from 'src/public/book/components/services'
import { Booking, BookingStatus } from 'src/types/booking/models'
import { courtsContext } from '../../courts/context'
import { venueContext } from '../../venue-context'

/**
 * Component that displays booking information in a user-friendly way
 * @element booking-details
 */
@customElement('booking-details')
export class BookingDetails extends $LitElement() {
  @property({ type: Object }) booking!: Booking
  @select(courtsContext) courts!: Map<string, Court>
  @select(venueContext) venue!: Partial<Venue>
  @state() courtName: string = ''
  @state() resendingEmail: boolean = false // Tracks email resend operation state

  constructor(booking?: Booking) {
    super()
    if (booking) {
      this.booking = booking
    }
  }
  
  connectedCallback() {
    super.connectedCallback()
    // Try to get court name after courts are loaded
    if (this.booking?.courtId) {
      this.getCourtName()
    }
  }
  
  /**
   * Get court name from court ID using courts context
   */
  private getCourtName(): void {
    if (!this.booking?.courtId) {
      this.courtName = 'Not specified'
      return
    }
    
    // If courts are already loaded
    if (courtsContext.ready && this.courts) {
      const court = this.courts.get(this.booking.courtId)
      this.courtName = court?.name || `Court ${this.booking.courtId}`
      return
    }
    
    // Otherwise, subscribe to courts changes
    const subscription = courtsContext.$.subscribe(() => {
      if (!courtsContext.ready) return
      
      const court = this.courts.get(this.booking.courtId)
      this.courtName = court?.name || `Court ${this.booking.courtId}`
      subscription.unsubscribe()
    })
  }

  /**
   * Format time string for display (ISO date string -> 24h)
   */
  private formatTimeDisplay(timeString: string): string {
    // Parse ISO date string and format in local time with 24-hour format
    return dayjs(timeString).local().format('HH:mm')
  }

  /**
   * Format date for display
   */
  private formatDate(dateStr: string): string {
    return dayjs(dateStr).format('dddd, MMMM D, YYYY')
  }

  /**
   * Get status-specific styling
   */
  private getStatusConfig(status: BookingStatus): { color: string, bgColor: string, icon: string } {
    switch(status) {
      case 'confirmed':
        return { color: 'text-blue-800', bgColor: 'bg-blue-100', icon: 'event_available' }
      case 'completed':
        return { color: 'text-green-800', bgColor: 'bg-green-100', icon: 'check_circle' }
      case 'cancelled':
        return { color: 'text-gray-600', bgColor: 'bg-gray-100', icon: 'cancel' }
      case 'holding':
        return { color: 'text-yellow-800', bgColor: 'bg-yellow-100', icon: 'pending' }
      default:
        return { color: 'text-blue-800', bgColor: 'bg-blue-100', icon: 'event_available' }
    }
  }


  /**
   * Check if actions should be displayed
   */
  private showActions(): boolean {
    return true // Always show actions since we're only showing email resend now
  }

  /**
   * Format price to display with currency
   */
  private formatPrice(price?: number): string {
    if (price === undefined || price === null) return 'N/A'
    return `$${price.toFixed(2)}`
  }
  
  /**
   * Calculate booking duration in minutes
   */
  private calculateDuration(): number {
    if (!this.booking?.startTime || !this.booking?.endTime) return 0
    
    const start = dayjs(this.booking.startTime)
    const end = dayjs(this.booking.endTime)
    
    if (!start.isValid() || !end.isValid()) return 0
    
    // Calculate difference in minutes
    return end.diff(start, 'minute')
  }
  
  /**
   * Format date timestamp for display
   */
  private formatTimestamp(timestamp: string): string {
    if (!timestamp) return 'N/A'
    return dayjs(timestamp).local().format('MMM D, YYYY HH:mm')
  }
  
  /**
   * Handle resending email confirmation
   * Prompts user for email address then calls API
   */
  private async handleResendEmail() {
    if (this.resendingEmail) return;

    const customerEmail = this.booking.userEmail || this.booking.customerEmail || '';
    const customerName = this.booking.userName || '';
    
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
            value=${customerEmail}
            required
          ></schmancy-input>
        </div>
      `,
      confirmText: 'Send',
      cancelText: 'Cancel'
    });
    
    if (result) {
      // Get updated email value from input
      const emailInput = document.getElementById('email-input') as HTMLInputElement;
      const email = emailInput?.value || customerEmail;
      
      if (!email || !email.includes('@')) {
        $notify.error('Please enter a valid email address');
        return;
      }
      
      this.resendingEmail = true;
      
      try {
        // Find court name for display
        const court = this.courts.get(this.booking.courtId);
        const courtName = court?.name || 'Court';
        
        // Prepare booking data for API
        const bookingData = {
          bookingId: this.booking.id,
          customerEmail: email,
          customerName: customerName,
          customerPhone: this.booking.customerPhone || this.booking.userPhone || '',
          venueInfo: {
            name: this.venue?.name || '',
            address: this.venue?.address ? {
              street: this.venue.address.street || '',
              city: this.venue.address.city || '',
              postalCode: this.venue.address.postalCode || '',
              country: this.venue.address.country || ''
            } : ''
          },
          bookingDetails: {
            date: this.booking.date,
            startTime: dayjs(this.booking.startTime).local().format('HH:mm'),
            endTime: dayjs(this.booking.endTime).local().format('HH:mm'),
            price: this.booking.price.toString(),
            court: courtName,
            venue: this.venue?.name || 'Venue'
          }
        };
        
        // Use the email service to resend the email
        resendBookingEmail(bookingData).subscribe({
          next: () => {
            $notify.success(`Confirmation email sent to ${email}`);
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
    if (!this.booking) {
      return html`
        <div class="p-6 text-center">
          <schmancy-typography type="body" token="md">No booking information available</schmancy-typography>
        </div>
      `
    }

    const { icon } = this.getStatusConfig(this.booking.status)
    const formattedDate = this.formatDate(this.booking.date)
    const formattedStartTime = this.formatTimeDisplay(this.booking.startTime)
    const formattedEndTime = this.formatTimeDisplay(this.booking.endTime)

    return html`
      <div class="p-6">
        <!-- Header with status and ID -->
        <div class="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
          <div>
            <schmancy-typography type="headline" token="sm" class="mb-1">Booking Details</schmancy-typography>
            <div class="flex items-center text-gray-500 text-sm">
              <schmancy-icon size="16px" class="mr-1">confirmation_number</schmancy-icon>
              <span>${this.booking.id}</span>
            </div>
          </div>
          <div class="flex items-center border border-gray-200 px-4 py-2 rounded-md">
            <schmancy-icon class="mr-2" size="20px">${icon}</schmancy-icon>
            <span class="font-medium">${this.booking.status.charAt(0).toUpperCase() + this.booking.status.slice(1)}</span>
          </div>
        </div>

        <div class="space-y-6">
          <!-- Booking information section -->
          <div>
            <schmancy-typography type="title" token="sm" class="mb-3 border-b border-gray-200 pb-2">Booking Information</schmancy-typography>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <schmancy-typography type="label" token="sm">Date</schmancy-typography>
                <schmancy-typography type="body" token="md">${formattedDate}</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Time</schmancy-typography>
                <schmancy-typography type="body" token="md">${formattedStartTime} - ${formattedEndTime}</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Duration</schmancy-typography>
                <schmancy-typography type="body" token="md">${this.calculateDuration()} minutes</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Court</schmancy-typography>
                <schmancy-typography type="body" token="md">${this.courtName || this.booking.courtId || 'Not specified'}</schmancy-typography>
              </div>
            </div>
          </div>

          <!-- Customer information section -->
          <div>
            <schmancy-typography type="title" token="sm" class="mb-3 border-b border-gray-200 pb-2">Customer Information</schmancy-typography>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <schmancy-typography type="label" token="sm">Name</schmancy-typography>
                <schmancy-typography type="body" token="md">${this.booking.userName || 'Not provided'}</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Email</schmancy-typography>
                <schmancy-typography type="body" token="md">${this.booking.userEmail || this.booking.customerEmail || 'Not provided'}</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Phone</schmancy-typography>
                <schmancy-typography type="body" token="md">${this.booking.userPhone || this.booking.customerPhone || 'Not provided'}</schmancy-typography>
              </div>
              ${this.booking.customerAddress ? html`
                <div>
                  <schmancy-typography type="label" token="sm">Location</schmancy-typography>
                  <schmancy-typography type="body" token="md">
                    ${this.booking.customerAddress.city}, ${this.booking.customerAddress.country}
                  </schmancy-typography>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Payment information section -->
          <div>
            <schmancy-typography type="title" token="sm" class="mb-3 border-b border-gray-200 pb-2">Payment Information</schmancy-typography>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <schmancy-typography type="label" token="sm">Price</schmancy-typography>
                <schmancy-typography type="body" token="md">${this.formatPrice(this.booking.price)}</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Payment Status</schmancy-typography>
                <schmancy-typography type="body" token="md">${this.booking.paymentStatus || 'Not specified'}</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Payment ID</schmancy-typography>
                <schmancy-typography type="body" token="md" class="truncate">${this.booking.paymentIntentId || 'Not available'}</schmancy-typography>
              </div>
              ${this.booking.invoiceNumber ? html`
                <div>
                  <schmancy-typography type="label" token="sm">Invoice #</schmancy-typography>
                  <schmancy-typography type="body" token="md">${this.booking.invoiceNumber}</schmancy-typography>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Notes section (if available) -->
          ${this.booking.notes ? html`
            <div>
              <schmancy-typography type="title" token="sm" class="mb-3 border-b border-gray-200 pb-2">Notes</schmancy-typography>
              <schmancy-typography type="body" token="md">${this.booking.notes}</schmancy-typography>
            </div>
          ` : ''}
          
          <!-- Additional information -->
          <div>
            <schmancy-typography type="title" token="sm" class="mb-3 border-b border-gray-200 pb-2">Additional Information</schmancy-typography>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <schmancy-typography type="label" token="sm">Created</schmancy-typography>
                <schmancy-typography type="body" token="md">${this.booking.createdAt ? this.formatTimestamp(this.booking.createdAt) : 'Not available'}</schmancy-typography>
              </div>
              
              ${this.booking.updatedAt ? html`
                <div>
                  <schmancy-typography type="label" token="sm">Updated</schmancy-typography>
                  <schmancy-typography type="body" token="md">${this.formatTimestamp(this.booking.updatedAt)}</schmancy-typography>
                </div>
              ` : ''}
              
              <div>
                <schmancy-typography type="label" token="sm">Email Sent</schmancy-typography>
                <schmancy-typography type="body" token="md">
                  ${this.booking.emailSent ? 'Yes' : 'No'}
                  ${this.booking.emailSentAt ? ` (${this.formatTimestamp(this.booking.emailSentAt)})` : ''}
                </schmancy-typography>
              </div>
              
              <!-- Email resend status is not tracked in the Booking model -->
              
              <!-- Guest booking status isn't in the model -->
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="mt-6 pt-4 border-t border-gray-200">
          <schmancy-typography type="title" token="sm" class="mb-3">Actions</schmancy-typography>
          <div class="flex flex-wrap gap-3">
            <schmancy-button 
              variant="outlined" 
              @click=${this.handleResendEmail}
              .disabled=${this.resendingEmail}
            >
              <schmancy-icon slot="prefix">email</schmancy-icon>
              ${this.resendingEmail ? 'Sending...' : 'Resend Email'}
            </schmancy-button>
            
            <schmancy-menu>
              <schmancy-button 
                slot="button"
                variant="outlined" 
              >
                <div class="flex items-center gap-2">
                  <schmancy-icon>share</schmancy-icon>
                  <span>Share</span>
                </div>
              </schmancy-button>

              <schmancy-menu-item @click=${() => {
                // Build a comprehensive booking info with all important details
                const venueName = this.venue?.name || 'Venue';
                const courtName = this.courtName || this.booking.courtId || 'Court';
                const duration = this.calculateDuration();
                const price = this.formatPrice(this.booking.price);
                const status = this.booking.status.charAt(0).toUpperCase() + this.booking.status.slice(1);
                const customerName = this.booking.userName || 'Customer';
                const customerEmail = this.booking.customerEmail || this.booking.userEmail || '';
                const customerPhone = this.booking.customerPhone || this.booking.userPhone || '';
                
                const bookingInfo = [
                  `📅 BOOKING DETAILS`,
                  `------------------`,
                  `🆔 Booking ID: ${this.booking.id}`,
                  `📆 Date: ${formattedDate}`,
                  `⏰ Time: ${formattedStartTime} - ${formattedEndTime} (${duration} min)`,
                  `🏆 Status: ${status}`,
                  `💵 Price: ${price}`,
                  ``,
                  `📍 VENUE INFO`,
                  `------------------`,
                  `🏢 Venue: ${venueName}`,
                  `🎾 Court: ${courtName}`,
                  ``,
                  `👤 CUSTOMER INFO`,
                  `------------------`,
                  `👤 Name: ${customerName}`,
                  `✉️ Email: ${customerEmail}`,
                  `📱 Phone: ${customerPhone}`,
                  ``,
                  `🗒️ Notes: ${this.booking.notes || 'None'}`
                ].join('\n');
                
                if (navigator.share) {
                  navigator.share({
                    title: `Booking #${this.booking.id} - ${venueName}`,
                    text: bookingInfo
                  }).catch(err => {
                    console.error('Share failed:', err);
                    // Fallback to clipboard
                    navigator.clipboard.writeText(bookingInfo);
                    $notify.info('Booking details copied to clipboard');
                  });
                } else {
                  navigator.clipboard.writeText(bookingInfo);
                  $notify.success('Booking details copied to clipboard');
                }
              }}>
                <div class="flex items-center gap-2">
                  <schmancy-icon>content_copy</schmancy-icon>
                  <span>Copy to Clipboard</span>
                </div>
              </schmancy-menu-item>

              <schmancy-menu-item @click=${() => {
                // Build a more WhatsApp-friendly message format
                const venueName = this.venue?.name || 'Venue';
                const courtName = this.courtName || this.booking.courtId || 'Court';
                const status = this.booking.status.charAt(0).toUpperCase() + this.booking.status.slice(1);
                
                const message = [
                  `*BOOKING DETAILS*`,
                  `----------------`,
                  `*Booking:* #${this.booking.id}`,
                  `*Date:* ${formattedDate}`,
                  `*Time:* ${formattedStartTime} - ${formattedEndTime}`,
                  `*Status:* ${status}`,
                  `*Venue:* ${venueName}`,
                  `*Court:* ${courtName}`,
                  ``,
                  `Please contact us if you have any questions about your booking.`
                ].join('\n');
                
                // Open WhatsApp with pre-filled message
                const encoded = encodeURIComponent(message);
                window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
                $notify.success('Opening WhatsApp sharing');
              }}>
                <div class="flex items-center gap-2">
                  <schmancy-icon>chat</schmancy-icon>
                  <span>Share via WhatsApp</span>
                </div>
              </schmancy-menu-item>
              
              <schmancy-menu-item @click=${() => {
                // Format for SMS
                const message = `Booking #${this.booking.id}: ${formattedDate} at ${formattedStartTime} - ${formattedEndTime}, ${this.venue?.name || 'Venue'}, ${this.courtName || this.booking.courtId || 'Court'}`;
                
                // Open SMS
                const encoded = encodeURIComponent(message);
                window.open(`sms:?&body=${encoded}`, '_blank');
                $notify.success('Opening SMS app');
              }}>
                <div class="flex items-center gap-2">
                  <schmancy-icon>sms</schmancy-icon>
                  <span>Share via SMS</span>
                </div>
              </schmancy-menu-item>
              
            </schmancy-menu>
          </div>
        </div>
      </div>
    `
  }
}




declare global {
  interface HTMLElementTagNameMap {
    'booking-details': BookingDetails
  }
}
