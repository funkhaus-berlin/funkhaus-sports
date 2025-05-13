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
        <div class="p-4 text-center">
          <schmancy-progress type="circular" size="md"></schmancy-progress>
        </div>
      `
    }

    // Format dates and times
    const startTime = dayjs(this.booking.startTime).format('h:mm A')
    const endTime = dayjs(this.booking.endTime).format('h:mm A')
    const date = dayjs(this.booking.date).format('dddd, MMMM D, YYYY')
    
    return html`
      <div class="p-4">
        <!-- Header -->
        <div class="flex justify-between items-center mb-4">
          <schmancy-typography type="headline" token="lg">Booking Details</schmancy-typography>
          <schmancy-button variant="text" @click=${() => sheet.dismiss(this.tagName)}>
            <schmancy-icon>close</schmancy-icon>
          </schmancy-button>
        </div>
        
        <!-- Customer Info -->
        <div class="mb-6 p-4 bg-primary-container rounded-lg">
          <schmancy-typography type="headline" token="md" class="font-bold text-on-primary-container">
            ${this.booking.userName}
          </schmancy-typography>
          <schmancy-typography type="body" token="md">
            ${this.booking.userEmail || this.booking.customerEmail || 'No email provided'}
          </schmancy-typography>
          <schmancy-typography type="body" token="sm">
            ${this.booking.userPhone || this.booking.customerPhone || 'No phone provided'}
          </schmancy-typography>
        </div>
        
        <!-- Check-in Information -->
        <div class="mb-6 bg-tertiary-container rounded-lg overflow-hidden">
          <div class="p-2 bg-tertiary text-on-tertiary">
            <schmancy-typography type="title" token="md" class="text-center">
              Check-in Information
            </schmancy-typography>
          </div>
          
          <div class="p-4">
            <div class="grid grid-cols-2 gap-4 mb-3">
              <div class="p-2 bg-surface-variant rounded-lg text-center">
                <schmancy-typography type="label" token="sm">Check-in</schmancy-typography>
                <schmancy-typography type="headline" token="sm">${startTime}</schmancy-typography>
              </div>
              
              <div class="p-2 bg-surface-variant rounded-lg text-center">
                <schmancy-typography type="label" token="sm">Check-out</schmancy-typography>
                <schmancy-typography type="headline" token="sm">${endTime}</schmancy-typography>
              </div>
            </div>
            
            <div class="p-2 bg-surface-variant rounded-lg text-center">
              <schmancy-typography type="label" token="sm">Court Assignment</schmancy-typography>
              <schmancy-typography type="headline" token="sm">${this.courtName || (this.booking.courtId ? `Court ${this.booking.courtId.substring(0, 4)}...` : 'Unknown')}</schmancy-typography>
            </div>
            
            <div class="mt-2 text-center">
              <schmancy-typography type="body" token="md">${date}</schmancy-typography>
            </div>
          </div>
        </div>
        
        <!-- Status -->
        <div class="mb-4">
          <schmancy-surface type="container" rounded="all" class="p-4">
            <div class="flex justify-between items-center">
              <schmancy-typography type="title" token="md">Status</schmancy-typography>
              <schmancy-badge
                shape="pill"
                variant="${this.getStatusVariant(this.booking.status)}"
              >
                ${this.booking.status.charAt(0).toUpperCase() + this.booking.status.slice(1)}
              </schmancy-badge>
            </div>
          </schmancy-surface>
        </div>
        
        <!-- Action Button -->
        <div class="pt-4 border-t border-outline-variant">
          ${this.booking.status === 'completed' ? html`
            <div class="flex items-center justify-center mb-3 p-2 bg-success-container text-on-success-container rounded-lg">
              <schmancy-icon class="mr-2">check_circle</schmancy-icon>
              <schmancy-typography type="body" token="md">
                Customer checked in successfully
              </schmancy-typography>
            </div>
          ` : html`
            <div class="mb-3 text-center">
              <schmancy-typography type="body" token="sm" class="text-on-surface-variant">
                ${this.processing ? 'Processing...' : 'Confirm customer check-in'}
              </schmancy-typography>
            </div>
            <schmancy-button 
              variant="filled" 
              class="w-full"
              @click=${this.markAsCompleted}
              ?disabled=${this.processing}
            >
              <schmancy-icon>task_alt</schmancy-icon>
              Check In
            </schmancy-button>
          `}
          
          <!-- Close button -->
          <div class="mt-4 text-center">
            <schmancy-button 
              variant="text" 
              @click=${() => sheet.dismiss(this.tagName)}
            >
              Close
            </schmancy-button>
          </div>
        </div>
      </div>
    `
  }

  /**
   * Get status variant for the chip component
   */
  getStatusVariant(status: BookingStatus): string {
    switch (status) {
      case 'confirmed':
        return 'success'
      case 'completed':
        return 'success'
      case 'cancelled':
        return 'error'
      case 'no-show':
        return 'error'
      case 'pending':
        return 'warning'
      case 'processing':
        return 'info'
      default:
        return 'default'
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