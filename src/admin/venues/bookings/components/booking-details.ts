// src/admin/venues/bookings/components/booking-details.ts
import { $dialog, $notify, select, SchmancyInputChangeEventV2 } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { Court } from 'src/types/booking/court.types'
import { Venue } from 'src/types/booking/venue.types'
import { resendBookingEmail } from 'src/public/book/components/services'
import { Booking, BookingStatus } from 'src/types/booking/booking.types'
import { courtsContext } from '../../courts/context'
import { venueContext } from '../../venue-context'
import { getAuth } from 'firebase/auth'

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
  @state() processingRefund: boolean = false // Tracks refund operation state

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

  /**
   * Handle refund processing
   * Prompts user for refund amount and reason
   */
  private async handleRefund() {
    if (this.processingRefund) return

    // Check if booking can be refunded
    if (this.booking.status !== 'confirmed') {
      $notify.error('Only confirmed bookings can be refunded')
      return
    }

    if (this.booking.refundStatus === 'refunded' || this.booking.refundStatus === 'partially_refunded') {
      $notify.error('This booking has already been refunded')
      return
    }

    // Prepare dialog content with refund amount input
    const fullAmount = this.booking.price || 0
    let refundAmount = fullAmount
    let refundReason = ''

    const result = await $dialog.confirm({
      title: 'Process Refund',
      content: html`
        <div class="space-y-4">
          <schmancy-typography type="body" token="md">
            Process a refund for booking #${this.booking.id}
          </schmancy-typography>
          
          <div class="bg-surface-container p-3 rounded-md">
            <schmancy-typography type="label" token="sm" class="text-surface-onVariant">
              Original Payment
            </schmancy-typography>
            <schmancy-typography type="title" token="md">
              €${fullAmount.toFixed(2)}
            </schmancy-typography>
          </div>

          <schmancy-input
            id="refund-amount"
            label="Refund Amount (€)"
            type="number"
            value=${fullAmount}
            min="0.01"
            max=${fullAmount}
            step="0.01"
            required
            helper="Enter the amount to refund (max: €${fullAmount.toFixed(2)})"
            @change=${(e: SchmancyInputChangeEventV2) => {
              const value = parseFloat(e.detail.value || '0')
              refundAmount = Math.min(Math.max(0.01, value), fullAmount)
            }}
          ></schmancy-input>

          <schmancy-input
            id="refund-reason"
            label="Reason for Refund"
            type="text"
            placeholder="e.g., Customer request, venue closed, etc."
            @change=${(e: SchmancyInputChangeEventV2) => {
              refundReason = e.detail.value || ''
            }}
          ></schmancy-input>

          <schmancy-typography type="body" token="sm" class="text-warning-default">
            ⚠️ This action cannot be undone. The refund will be processed immediately.
          </schmancy-typography>
        </div>
      `,
      confirmText: 'Process Refund',
      cancelText: 'Cancel'
    })

    if (result) {
      // Get final values from inputs
      const amountInput = document.getElementById('refund-amount') as HTMLInputElement
      const reasonInput = document.getElementById('refund-reason') as HTMLInputElement
      
      refundAmount = parseFloat(amountInput?.value || fullAmount.toString())
      refundReason = reasonInput?.value || 'Admin initiated refund'

      if (refundAmount <= 0 || refundAmount > fullAmount) {
        $notify.error('Invalid refund amount')
        return
      }

      this.processingRefund = true

      try {
        // Get auth token
        const auth = getAuth()
        const user = auth.currentUser
        if (!user) {
          throw new Error('User not authenticated')
        }
        
        const token = await user.getIdToken()
        
        // Call refund API
        const response = await fetch(`${import.meta.env.DEV ? import.meta.env.VITE_BASE_URL : ''}/api/process-refund`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            bookingId: this.booking.id,
            amount: refundAmount,
            reason: refundReason
          })
        })

        const result = await response.json()

        if (!response.ok) {
          // Handle specific error codes from the refund API
          const errorCode = result.errorCode || 'unknown_error'
          const canRetry = result.canRetry || false
          
          let userMessage = result.error || 'Failed to process refund'
          
          // Provide user-friendly messages based on error code
          switch (errorCode) {
            case 'charge_already_refunded':
              userMessage = 'This booking has already been refunded'
              break
            case 'insufficient_funds':
              userMessage = 'Unable to process refund due to insufficient funds. Please contact your payment processor.'
              break
            case 'charge_disputed':
              userMessage = 'Cannot refund a payment that is currently disputed. Please resolve the dispute first.'
              break
            case 'amount_too_large':
              userMessage = 'The refund amount exceeds the original charge amount'
              break
            case 'payment_not_succeeded':
              userMessage = 'Cannot refund a payment that hasn\'t been successfully charged'
              break
            case 'no_charge_found':
              userMessage = 'No charge found for this payment'
              break
            case 'api_error':
            case 'connection_error':
              userMessage = 'Service temporarily unavailable. Please try again in a few moments.'
              break
            case 'rate_limit':
              userMessage = 'Too many requests. Please wait a moment and try again.'
              break
            case 'authentication_error':
              userMessage = 'Authentication failed. Please contact support.'
              break
          }
          
          // Show error with retry option if applicable
          if (canRetry) {
            const retry = await $dialog.confirm({
              title: 'Refund Failed',
              content: html`
                <div class="space-y-4">
                  <schmancy-typography type="body" token="md">
                    ${userMessage}
                  </schmancy-typography>
                  <schmancy-typography type="body" token="sm" class="text-surface-onVariant">
                    This is a temporary issue. Would you like to try again?
                  </schmancy-typography>
                </div>
              `,
              confirmText: 'Retry',
              cancelText: 'Cancel'
            })
            
            if (retry) {
              // Retry the refund
              this.processingRefund = false
              setTimeout(() => this.handleRefund(), 500)
              return
            }
          } else {
            $notify.error(userMessage)
          }
          
          throw new Error(userMessage)
        }

        if (result.success) {
          $notify.success(`Refund of €${refundAmount.toFixed(2)} processed successfully`)
          
          // Update local booking object to reflect refund
          this.booking = {
            ...this.booking,
            refundStatus: refundAmount < fullAmount ? 'partially_refunded' : 'refunded',
            refundAmount: refundAmount,
            refundedAt: new Date().toISOString(),
            refundReason: refundReason,
            status: 'cancelled'
          }
          
          // Trigger update
          this.requestUpdate()
        } else {
          throw new Error(result.error || 'Refund failed')
        }
      } catch (error: any) {
        console.error('Refund processing error:', error)
        // Only show error if we haven't already shown a more specific message
        if (!error.message.includes('Service temporarily unavailable') && 
            !error.message.includes('Too many requests') &&
            !error.message.includes('Authentication failed')) {
          $notify.error(`Failed to process refund: ${error.message || 'Unknown error'}`)
        }
      } finally {
        this.processingRefund = false
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
              
              <!-- Refund information if applicable -->
              ${this.booking.refundStatus ? html`
                <div>
                  <schmancy-typography type="label" token="sm">Refund Status</schmancy-typography>
                  <div class="flex items-center gap-2">
                    <schmancy-icon size="16px" class="${this.booking.refundStatus === 'refunded' ? 'text-green-600' : 'text-orange-600'}">
                      ${this.booking.refundStatus === 'refunded' ? 'check_circle' : 'info'}
                    </schmancy-icon>
                    <schmancy-typography type="body" token="md" class="${this.booking.refundStatus === 'refunded' ? 'text-green-600' : 'text-orange-600'}">
                      ${this.booking.refundStatus === 'refunded' ? 'Fully Refunded' : 'Partially Refunded'}
                    </schmancy-typography>
                  </div>
                </div>
              ` : ''}
              
              ${this.booking.refundAmount ? html`
                <div>
                  <schmancy-typography type="label" token="sm">Refund Amount</schmancy-typography>
                  <schmancy-typography type="body" token="md">€${this.booking.refundAmount.toFixed(2)}</schmancy-typography>
                </div>
              ` : ''}
              
              ${this.booking.refundedAt ? html`
                <div>
                  <schmancy-typography type="label" token="sm">Refunded On</schmancy-typography>
                  <schmancy-typography type="body" token="md">${this.formatTimestamp(this.booking.refundedAt)}</schmancy-typography>
                </div>
              ` : ''}
              
              ${this.booking.refundReason ? html`
                <div class="col-span-2">
                  <schmancy-typography type="label" token="sm">Refund Reason</schmancy-typography>
                  <schmancy-typography type="body" token="md">${this.booking.refundReason}</schmancy-typography>
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
            
            <!-- Refund button - only show for confirmed bookings that haven't been fully refunded -->
            ${this.booking.status === 'confirmed' && this.booking.refundStatus !== 'refunded' ? html`
              <schmancy-button 
                variant="outlined" 
                @click=${this.handleRefund}
                .disabled=${this.processingRefund}
                class="text-error-default"
              >
                <schmancy-icon slot="prefix">payments</schmancy-icon>
                ${this.processingRefund ? 'Processing...' : 'Refund'}
              </schmancy-button>
            ` : ''}
            
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
