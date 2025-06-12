import { $dialog, $notify, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { getAuth } from 'firebase/auth'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { EMPTY, from, of } from 'rxjs'
import { catchError, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators'
import { resendBookingEmail } from '../../../../public/book/components/services'
import { Booking, BookingStatus } from '../../../../types/booking/booking.types'
import { Court } from '../../../../types/booking/court.types'
import { Venue } from '../../../../types/booking/venue.types'
import { courtsContext } from '../../courts/context'
import { venueContext } from '../../venue-context'
import './refund-dialog'

@customElement('booking-details')
export class BookingDetails extends $LitElement() {
  @property({ type: Object }) booking!: Booking
  @select(courtsContext) courts!: Map<string, Court>
  @select(venueContext) venue!: Partial<Venue>
  
  @state() resendingEmail = false

  connectedCallback() {
    super.connectedCallback()
  }

  render() {
    if (!this.booking) {
      return html`
        <div class="p-6 text-center">
          <schmancy-typography type="body" token="md">No booking information available</schmancy-typography>
        </div>
      `
    }

    // Get court name
    const court = this.courts.get(this.booking.courtId)
    const courtName = court?.name || 'Court'
    
    // Format dates and times
    const formattedDate = dayjs(this.booking.date).format('dddd, D MMMM YYYY')
    const startTime = this.booking.startTime?.includes('T') 
      ? dayjs(this.booking.startTime).format('HH:mm')
      : this.booking.startTime || ''
    const endTime = this.booking.endTime?.includes('T')
      ? dayjs(this.booking.endTime).format('HH:mm') 
      : this.booking.endTime || ''
    const duration = this.booking.startTime && this.booking.endTime
      ? dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minute')
      : 0

    // Status configuration
    const statusConfig = (() => {
      switch (this.booking.status) {
        case 'confirmed':
          return { color: 'text-success-default', icon: 'check_circle', label: 'Confirmed' }
        case 'completed':
          return { color: 'text-primary-default', icon: 'done_all', label: 'Completed' }
        case 'cancelled':
          return { color: 'text-error-default', icon: 'cancel', label: 'Cancelled' }
        case 'holding':
          return { color: 'text-warning-default', icon: 'schedule', label: 'Holding' }
        default:
          return { color: 'text-surface-on-variant', icon: 'help', label: 'Unknown' }
      }
    })()

    // Refund status
    const refundStatus = (() => {
      if (!this.booking.refundStatus) return null
      switch (this.booking.refundStatus) {
        case 'succeeded':
          return { color: 'text-success-default', label: 'Refunded' }
        case 'pending':
        case 'processing':
          return { color: 'text-warning-default', label: 'Refund Processing' }
        case 'failed':
          return { color: 'text-error-default', label: 'Refund Failed' }
        default:
          return { color: 'text-surface-on-variant', label: this.booking.refundStatus }
      }
    })()

    return html`
      <div class="p-4 md:p-6 max-w-4xl mx-auto">
        <!-- Header with status and ID -->
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 border-b border-gray-200 pb-4">
          <div>
            <schmancy-typography type="headline" token="sm" class="mb-1">Booking Details</schmancy-typography>
            <div class="flex items-center text-gray-500 text-sm">
              <schmancy-icon size="16px" class="mr-1">confirmation_number</schmancy-icon>
              <span>Booking #${this.booking.orderNumber || this.booking.invoiceNumber || this.booking.id}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <schmancy-chip 
              class="${statusConfig.color}"
              variant="filled"
            >
              <schmancy-icon slot="start" size="16px">${statusConfig.icon}</schmancy-icon>
              ${statusConfig.label}
            </schmancy-chip>
            ${when(refundStatus, () => html`
              <schmancy-chip 
                class="${refundStatus!.color}"
                variant="filled"
              >
                <schmancy-icon slot="start" size="16px">payments</schmancy-icon>
                ${refundStatus!.label}
              </schmancy-chip>
            `)}
          </div>
        </div>

        <div class="space-y-6">
          <!-- Booking information section -->
          <div>
            <schmancy-typography type="title" token="sm" class="mb-3 border-b border-gray-200 pb-2">
              Booking Information
            </schmancy-typography>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <schmancy-typography type="label" token="sm">Date</schmancy-typography>
                <schmancy-typography type="body" token="md">${formattedDate}</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Time</schmancy-typography>
                <schmancy-typography type="body" token="md">${startTime} - ${endTime}</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Duration</schmancy-typography>
                <schmancy-typography type="body" token="md">${duration} minutes</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Court</schmancy-typography>
                <schmancy-typography type="body" token="md">${courtName}</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Price</schmancy-typography>
                <schmancy-typography type="body" token="md">€${this.booking.price?.toFixed(2) || '0.00'}</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Payment Status</schmancy-typography>
                <schmancy-typography type="body" token="md">${this.booking.paymentStatus || 'N/A'}</schmancy-typography>
              </div>
            </div>
          </div>

          <!-- Customer information section -->
          <div>
            <schmancy-typography type="title" token="sm" class="mb-3 border-b border-gray-200 pb-2">
              Customer Information
            </schmancy-typography>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <schmancy-typography type="label" token="sm">Name</schmancy-typography>
                <schmancy-typography type="body" token="md">${this.booking.userName || 'Not provided'}</schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Email</schmancy-typography>
                <schmancy-typography type="body" token="md">
                  ${this.booking.customerEmail || this.booking.userEmail || 'Not provided'}
                </schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">Phone</schmancy-typography>
                <schmancy-typography type="body" token="md">
                  ${this.booking.customerPhone || this.booking.userPhone || 'Not provided'}
                </schmancy-typography>
              </div>
              <div>
                <schmancy-typography type="label" token="sm">User ID</schmancy-typography>
                <schmancy-typography type="body" token="sm" class="text-surface-on-variant">
                  ${this.booking.userId}
                </schmancy-typography>
              </div>
            </div>
          </div>

          <!-- Email status section -->
          ${when(this.booking.emailSent !== undefined, () => html`
            <div>
              <schmancy-typography type="title" token="sm" class="mb-3 border-b border-gray-200 pb-2">
                Email Status
              </schmancy-typography>
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <schmancy-icon size="20px" class="${this.booking.emailSent ? 'text-success-default' : 'text-error-default'}">
                    ${this.booking.emailSent ? 'mark_email_read' : 'mail_outline'}
                  </schmancy-icon>
                  <schmancy-typography type="body" token="sm">
                    ${this.booking.emailSent 
                      ? `Email sent at ${dayjs(this.booking.emailSentAt).format('DD/MM/YYYY HH:mm')}`
                      : 'Email not sent'}
                  </schmancy-typography>
                </div>
                ${when(this.booking.emailError, () => html`
                  <schmancy-typography type="body" token="sm" class="text-error-default">
                    Error: ${this.booking.emailError}
                  </schmancy-typography>
                `)}
              </div>
            </div>
          `)}

          <!-- Refund information if applicable -->
          ${when(this.booking.refundId, () => html`
            <div>
              <schmancy-typography type="title" token="sm" class="mb-3 border-b border-gray-200 pb-2">
                Refund Information
              </schmancy-typography>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <schmancy-typography type="label" token="sm">Refund Amount</schmancy-typography>
                  <schmancy-typography type="body" token="md">
                    €${this.booking.refundAmount?.toFixed(2) || '0.00'}
                  </schmancy-typography>
                </div>
                <div>
                  <schmancy-typography type="label" token="sm">Refund Status</schmancy-typography>
                  <schmancy-typography type="body" token="md">${this.booking.refundStatus || 'N/A'}</schmancy-typography>
                </div>
                ${when(this.booking.refundReason, () => html`
                  <div class="col-span-2">
                    <schmancy-typography type="label" token="sm">Refund Reason</schmancy-typography>
                    <schmancy-typography type="body" token="md">${this.booking.refundReason}</schmancy-typography>
                  </div>
                `)}
                ${when(this.booking.refundedAt, () => html`
                  <div>
                    <schmancy-typography type="label" token="sm">Refunded At</schmancy-typography>
                    <schmancy-typography type="body" token="md">
                      ${dayjs(this.booking.refundedAt).format('DD/MM/YYYY HH:mm')}
                    </schmancy-typography>
                  </div>
                `)}
              </div>
            </div>
          `)}

          <!-- Action buttons -->
          <div class="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
            <!-- Resend Email Button -->
            ${when(
              this.booking.status === 'confirmed' && !this.resendingEmail,
              () => html`
                <schmancy-button
                  variant="outlined"
                  @click=${() => {
                    this.resendingEmail = true
                    
                    // Build the email request from booking data
                    const court = this.courts.get(this.booking.courtId)
                    const emailRequest = {
                      bookingId: this.booking.id,
                      customerEmail: this.booking.customerEmail || this.booking.userEmail || '',
                      customerName: this.booking.userName || 'Customer',
                      customerPhone: this.booking.customerPhone || this.booking.userPhone || '',
                      venueInfo: {
                        name: this.venue?.name || 'Funkhaus Sports',
                        address: typeof this.venue?.address === 'string' 
                          ? this.venue.address 
                          : (this.venue?.address?.street || ''),
                        city: typeof this.venue?.address === 'object' ? this.venue?.address?.city : '',
                        postalCode: typeof this.venue?.address === 'object' ? this.venue?.address?.postalCode : '',
                        country: typeof this.venue?.address === 'object' ? this.venue?.address?.country : ''
                      },
                      bookingDetails: {
                        date: dayjs(this.booking.date).format('dddd, D MMMM YYYY'),
                        startTime: this.booking.startTime || '',
                        endTime: this.booking.endTime || '',
                        price: this.booking.price?.toFixed(2) || '0.00',
                        court: court?.name || 'Court',
                        venue: this.venue?.name || 'Funkhaus Sports',
                        userTimezone: 'Europe/Berlin'
                      },
                      invoiceNumber: this.booking.invoiceNumber
                    }
                    
                    from(resendBookingEmail(emailRequest)).pipe(
                      tap(result => {
                        if (result.success) {
                          $notify.success('Confirmation email sent successfully')
                        } else {
                          $notify.error(result.error || 'Failed to send email')
                        }
                      }),
                      catchError(err => {
                        console.error('Error resending email:', err)
                        $notify.error('Failed to send email. Please try again.')
                        return EMPTY
                      }),
                      finalize(() => {
                        this.resendingEmail = false
                      }),
                      takeUntil(this.disconnecting)
                    ).subscribe()
                  }}
                >
                  <schmancy-icon>send</schmancy-icon>
                  Resend Email
                </schmancy-button>
              `,
              () => when(this.resendingEmail, () => html`
                <schmancy-button variant="outlined" disabled>
                  <schmancy-spinner size="16px"></schmancy-spinner>
                  Sending...
                </schmancy-button>
              `)
            )}

            <!-- Process Refund Button -->
            ${when(
              this.booking.status === 'confirmed' && 
              this.booking.paymentStatus === 'paid' && 
              !this.booking.refundStatus,
              () => html`
                <schmancy-button
                  variant="filled"
                  color="error"
                  @click=${() => {
                    const refundDialog = document.createElement('refund-dialog')
                    refundDialog.booking = this.booking
                    
                    $dialog.component(refundDialog, {
                      title: 'Process Refund'
                    })
                  }}
                >
                  <schmancy-icon>payments</schmancy-icon>
                  Process Refund
                </schmancy-button>
              `
            )}
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
