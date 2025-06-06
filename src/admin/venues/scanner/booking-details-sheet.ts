// src/scanner/booking-details-sheet.ts
import { sheet, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { of } from 'rxjs'
import { catchError, finalize, take, tap } from 'rxjs/operators'
import { BookingsDB } from 'src/db/bookings.collection'
import { Court } from 'src/db/courts.collection'
import { Booking, BookingStatus } from 'src/types/booking/models'
import { courtsContext } from '../courts/context'

/**
 * Booking details sheet for the scanner
 * Displays booking information and allows checking in or marking as no-show
 */
@customElement('booking-details-sheet')
export class BookingDetailsSheet extends $LitElement() {
  @property({ type: Object }) booking?: Booking
  @property({ type: Boolean }) processing = false
  
  @select(courtsContext)
  courts!: Map<string, Court>
  
  @state() courtName: string = ''

  connectedCallback() {
    super.connectedCallback()
    // Get court name if booking is available
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
      this.courtName = court?.name || `Court ${this.booking.courtId.substring(0, 4)}...`
      return
    }
    
    // Otherwise, subscribe to courts changes
    courtsContext.$.pipe(
      take(1),
      tap(() => {
        if (!courtsContext.ready || !this.booking?.courtId) return
        
        const court = this.courts.get(this.booking.courtId)
        this.courtName = court?.name || (this.booking.courtId ? `Court ${this.booking.courtId.substring(0, 4)}...` : 'Unknown')
      })
    ).subscribe()
  }

  render() {
    if (!this.booking) {
      return html`
        <div class="flex items-center justify-center h-64">
          <schmancy-circular-progress size="lg" indeterminate></schmancy-circular-progress>
        </div>
      `
    }

    // Format dates and times
    const startTime = dayjs(this.booking.startTime).format('h:mm A')
    const endTime = dayjs(this.booking.endTime).format('h:mm A')
    const date = dayjs(this.booking.date).format('dddd, MMMM D, YYYY')
    const duration = dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'hour', true)
    const formattedDuration = duration === 1 ? '1 hour' : `${duration} hours`
    const createdAt = this.booking.createdAt ? dayjs(this.booking.createdAt).format('MMM D, YYYY h:mm A') : 'N/A'
    const formattedPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(this.booking.price || 0)
    
    return html`
      <div class="relative">
        <!-- Success Overlay for completed bookings -->
        ${when(this.booking.status === 'completed', () => html`
          <div class="absolute inset-0 bg-success/10 z-0 pointer-events-none"></div>
        `)}
        
        <!-- Header with gradient background -->
        <div class="relative bg-gradient-to-br from-primary to-primary-variant text-on-primary">
          <div class="px-6 pt-6 pb-8">
            <div class="flex justify-between items-start mb-4">
              <div>
                <schmancy-typography type="headline" token="lg" class="font-bold">
                  ${this.booking.status === 'completed' ? 'Checked In' : 'Check-In'}
                </schmancy-typography>
                <schmancy-typography type="body" token="md" class="opacity-90">
                  Booking #${this.booking.id.slice(-8).toUpperCase()}
                </schmancy-typography>
              </div>
              <schmancy-button 
                variant="text" 
                @click=${() => sheet.dismiss(this.tagName)}
                class="text-on-primary"
              >
                <schmancy-icon>close</schmancy-icon>
              </schmancy-button>
            </div>
            
            <!-- Customer Card -->
            <schmancy-surface type="elevated" rounded="all" class="p-4 bg-surface">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center">
                  <schmancy-icon class="text-on-primary-container">person</schmancy-icon>
                </div>
                <div class="flex-1">
                  <schmancy-typography type="headline" token="md" class="text-on-surface font-semibold">
                    ${this.booking.userName}
                  </schmancy-typography>
                  <schmancy-typography type="body" token="sm" class="text-on-surface-variant">
                    ${this.booking.userEmail || this.booking.customerEmail || 'No email'}
                  </schmancy-typography>
                  ${when(this.booking?.userPhone || this.booking?.customerPhone, () => html`
                    <schmancy-typography type="body" token="sm" class="text-on-surface-variant">
                      ${this.booking?.userPhone || this.booking?.customerPhone}
                    </schmancy-typography>
                  `)}
                </div>
              </div>
            </schmancy-surface>
          </div>
        </div>
        
        <div class="px-6 pb-6">
          <!-- Booking Details Grid -->
          <div class="grid gap-4 mt-6">
            <!-- Date Card -->
            <schmancy-surface type="filled" rounded="all" class="p-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-tertiary-container flex items-center justify-center">
                  <schmancy-icon class="text-on-tertiary-container">event</schmancy-icon>
                </div>
                <div>
                  <schmancy-typography type="label" token="md" class="text-on-surface-variant">
                    Date
                  </schmancy-typography>
                  <schmancy-typography type="body" token="lg" class="font-medium">
                    ${date}
                  </schmancy-typography>
                </div>
              </div>
            </schmancy-surface>
            
            <!-- Time Card -->
            <schmancy-surface type="filled" rounded="all" class="p-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-secondary-container flex items-center justify-center">
                  <schmancy-icon class="text-on-secondary-container">schedule</schmancy-icon>
                </div>
                <div class="flex-1">
                  <schmancy-typography type="label" token="md" class="text-on-surface-variant">
                    Time Slot
                  </schmancy-typography>
                  <schmancy-typography type="body" token="lg" class="font-medium">
                    ${startTime} - ${endTime}
                  </schmancy-typography>
                  <schmancy-typography type="body" token="sm" class="text-on-surface-variant">
                    ${formattedDuration}
                  </schmancy-typography>
                </div>
              </div>
            </schmancy-surface>
            
            <!-- Court Card -->
            <schmancy-surface type="filled" rounded="all" class="p-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center">
                  <schmancy-icon class="text-on-primary-container">sports_tennis</schmancy-icon>
                </div>
                <div class="flex-1">
                  <schmancy-typography type="label" token="md" class="text-on-surface-variant">
                    Court Assignment
                  </schmancy-typography>
                  <schmancy-typography type="body" token="lg" class="font-medium">
                    ${this.courtName || 'Pending Assignment'}
                  </schmancy-typography>
                </div>
              </div>
            </schmancy-surface>
          </div>
          
          <!-- Payment & Additional Info Section -->
          <div class="mt-6 space-y-4">
            <!-- Payment Info -->
            <schmancy-surface type="filled" rounded="all" class="p-4">
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <schmancy-icon class="text-primary">payments</schmancy-icon>
                    <schmancy-typography type="title" token="sm">Payment Details</schmancy-typography>
                  </div>
                  <schmancy-typography type="headline" token="md" class="font-bold text-primary">
                    ${formattedPrice}
                  </schmancy-typography>
                </div>
                
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <schmancy-typography type="label" token="sm" class="text-on-surface-variant">
                      Payment Status
                    </schmancy-typography>
                    <schmancy-typography type="body" token="md" class="font-medium">
                      ${this.booking.paymentStatus || 'Paid'}
                    </schmancy-typography>
                  </div>
                  
                  ${when(this.booking.paymentIntentId, () => html`
                    <div>
                      <schmancy-typography type="label" token="sm" class="text-on-surface-variant">
                        Transaction ID
                      </schmancy-typography>
                      <schmancy-typography type="body" token="sm" class="font-mono truncate">
                        ${this.booking!.paymentIntentId?.slice(-12)}
                      </schmancy-typography>
                    </div>
                  `)}
                </div>
              </div>
            </schmancy-surface>
            
            <!-- Booking Info -->
            <schmancy-surface type="filled" rounded="all" class="p-4">
              <div class="space-y-3">
                <div class="flex items-center gap-2 mb-2">
                  <schmancy-icon class="text-secondary">info</schmancy-icon>
                  <schmancy-typography type="title" token="sm">Booking Information</schmancy-typography>
                </div>
                
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <schmancy-typography type="label" token="sm" class="text-on-surface-variant">
                      Created
                    </schmancy-typography>
                    <schmancy-typography type="body" token="sm">
                      ${createdAt}
                    </schmancy-typography>
                  </div>
                  
                  ${when(this.booking.courtPreference, () => html`
                    <div>
                      <schmancy-typography type="label" token="sm" class="text-on-surface-variant">
                        Court Preference
                      </schmancy-typography>
                      <schmancy-typography type="body" token="sm" class="capitalize">
                        ${this.booking!.courtPreference}
                      </schmancy-typography>
                    </div>
                  `)}
                  
                  ${when(this.booking.invoiceNumber, () => html`
                    <div>
                      <schmancy-typography type="label" token="sm" class="text-on-surface-variant">
                        Invoice #
                      </schmancy-typography>
                      <schmancy-typography type="body" token="sm">
                        ${this.booking!.invoiceNumber}
                      </schmancy-typography>
                    </div>
                  `)}
                  
                  ${when(this.booking.emailSent, () => html`
                    <div>
                      <schmancy-typography type="label" token="sm" class="text-on-surface-variant">
                        Confirmation Email
                      </schmancy-typography>
                      <schmancy-typography type="body" token="sm" class="text-success">
                        Sent ✓
                      </schmancy-typography>
                    </div>
                  `)}
                </div>
                
                ${when(this.booking.notes, () => html`
                  <div class="pt-2 border-t border-outline-variant">
                    <schmancy-typography type="label" token="sm" class="text-on-surface-variant">
                      Notes
                    </schmancy-typography>
                    <schmancy-typography type="body" token="sm" class="mt-1">
                      ${this.booking!.notes}
                    </schmancy-typography>
                  </div>
                `)}
              </div>
            </schmancy-surface>
          </div>
          
          <!-- Status Section -->
          <div class="mt-6 p-4 rounded-xl border-2 ${this.booking.status === 'completed' ? 'border-success bg-success/5' : 'border-outline-variant bg-surface-variant/30'}">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <schmancy-icon class="${this.booking.status === 'completed' ? 'text-success' : 'text-on-surface-variant'}">
                  ${this.booking.status === 'completed' ? 'check_circle' : 'info'}
                </schmancy-icon>
                <schmancy-typography type="title" token="md">
                  Status
                </schmancy-typography>
              </div>
              <sch-badge
                color="${this.getStatusVariant(this.booking.status)}"
                shape="pill"
              >
                ${this.booking.status.charAt(0).toUpperCase() + this.booking.status.slice(1).replace('_', ' ')}
              </sch-badge>
            </div>
          </div>
          
          <!-- Action Buttons -->
          <div class="mt-6 space-y-3">
            ${this.booking.status === 'completed' ? html`
              <div class="flex items-center justify-center p-4 bg-success-container text-on-success-container rounded-xl">
                <schmancy-icon class="mr-2">verified</schmancy-icon>
                <schmancy-typography type="title" token="md" class="font-medium">
                  Customer Successfully Checked In
                </schmancy-typography>
              </div>
              <schmancy-button 
                variant="text" 
                class="w-full"
                @click=${() => sheet.dismiss(this.tagName)}
              >
                Done
              </schmancy-button>
            ` : html`
              <schmancy-button 
                variant="filled" 
                class="mx-auto"
                @click=${this.markAsCompleted}
                ?disabled=${this.processing}
              >
                ${when(
                  this.processing,
                  () => html`
                    <schmancy-circular-progress size="sm" indeterminate class="mr-2"></schmancy-circular-progress>
                    Processing...
                  `,
                  () => html`
                    <schmancy-icon>how_to_reg</schmancy-icon>
                    Confirm Check-In
                  `
                )}
              </schmancy-button>
              
            `}
          </div>
        </div>
      </div>
    `
  }

  /**
   * Get status color for the badge component
   */
  getStatusVariant(status: BookingStatus): 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'neutral' {
    switch (status) {
      case 'confirmed':
        return 'success'
      case 'completed':
        return 'success'
      case 'cancelled':
        return 'error'
      case 'holding':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  /**
   * Mark booking as completed
   */
  markAsCompleted() {
    this.updateBookingStatus('completed')
  }

  /**
   * We don't need markAsNoShow anymore since we're only using the check-in button
   */

  /**
   * Update booking status using RxJS
   */
  private updateBookingStatus(status: BookingStatus) {
    if (!this.booking || this.processing) return
    
    this.processing = true
    
    of(this.booking).pipe(
      tap(() => console.log(`Checking in booking ${this.booking?.id}`)),
      finalize(() => this.processing = false),
      tap(booking => BookingsDB.upsert({
        ...booking,
        status: status,
        updatedAt: new Date().toISOString()
      }, booking.id).subscribe({
        next: () => {
          console.log(`Successfully checked in booking`)
          // Update the booking object locally so the UI updates
          if (this.booking) {
            this.booking = {
              ...this.booking,
              status: status
            }
          }
          // Show a success message for a moment before dismissing
          setTimeout(() => {
            sheet.dismiss(this.tagName)
          }, 1000)
        },
        error: (err) => console.error(`Error checking in customer: ${err}`)
      })),
      catchError(err => {
        console.error('Error in check-in process:', err)
        return of(null)
      })
    ).subscribe()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'booking-details-sheet': BookingDetailsSheet
  }
}
