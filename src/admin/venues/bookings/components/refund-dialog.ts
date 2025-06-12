import { $dialog, $notify, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { getAuth } from 'firebase/auth'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { EMPTY, from } from 'rxjs'
import { catchError, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators'
import { Booking } from '../../../../types/booking/booking.types'

@customElement('refund-dialog')
export class RefundDialog extends $LitElement() {
  @property({ type: Object }) booking!: Booking
  
  @state() refundAmount = 0
  @state() refundReason = ''
  @state() processing = false

  connectedCallback() {
    super.connectedCallback()
    // Initialize refund amount to full amount
    if (this.booking?.price) {
      this.refundAmount = this.booking.price
    }
  }

  render() {
    const fullAmount = this.booking?.price || 0
    
    return html`
      <div class="space-y-6 p-6 min-w-[320px] max-w-md">
        <!-- Header -->
        <div class="text-center">
          <schmancy-typography type="headline" token="sm" class="mb-2">
            Process Refund
          </schmancy-typography>
          <schmancy-typography type="body" token="sm" class="text-surface-on-variant">
            Booking #${this.booking?.id?.slice(0, 8)}...
          </schmancy-typography>
        </div>
        
        <!-- Original Payment Info -->
        <schmancy-surface type="containerLowest" rounded="all" class="p-4">
          <div class="text-center">
            <schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-1">
              Original Payment Amount
            </schmancy-typography>
            <schmancy-typography type="display" token="sm" class="text-primary-default">
              €${fullAmount.toFixed(2)}
            </schmancy-typography>
          </div>
        </schmancy-surface>

        <!-- Refund Form -->
        <div class="space-y-4">
          <schmancy-input
            label="Refund Amount (€)"
            type="number"
            .value=${this.refundAmount.toString()}
            min="0.01"
            max=${fullAmount}
            step="0.01"
            required
            helper="Enter the amount to refund (max: €${fullAmount.toFixed(2)})"
            @input=${(e: any) => {
              this.refundAmount = parseFloat(e.target.value) || 0
            }}
          ></schmancy-input>

          <schmancy-input
            label="Reason for Refund"
            type="text"
            .value=${this.refundReason}
            placeholder="e.g., Customer request, venue closed, etc."
            @input=${(e: any) => {
              this.refundReason = e.target.value || ''
            }}
          ></schmancy-input>
        </div>

        <!-- Warning Message -->
        <schmancy-surface type="container" rounded="all" class="p-3 bg-warning-container">
          <div class="flex items-start gap-2">
            <schmancy-icon class="text-warning-on-container mt-0.5" size="20px">warning</schmancy-icon>
            <schmancy-typography type="body" token="sm" class="text-warning-on-container">
              This action cannot be undone. The refund will be processed immediately.
            </schmancy-typography>
          </div>
        </schmancy-surface>
        
        <!-- Action Buttons -->
        <div class="flex gap-3 justify-end pt-2 border-t border-surface-variant">
          <schmancy-button
            variant="text"
            @click=${() => sheet.dismiss(this.tagName)}
            ?disabled=${this.processing}
          >
            Cancel
          </schmancy-button>
          
          <schmancy-button
            variant="filled"
            color="error"
            @click=${() => this.processRefund()}
            ?disabled=${this.processing || this.refundAmount <= 0 || this.refundAmount > fullAmount}
          >
            ${this.processing ? html`
              <schmancy-spinner size="16px"></schmancy-spinner>
              Processing...
            ` : 'Process Refund'}
          </schmancy-button>
        </div>
      </div>
    `
  }
  
  private processRefund() {
    const fullAmount = this.booking?.price || 0
    
    if (this.refundAmount <= 0 || this.refundAmount > fullAmount) {
      $notify.error('Invalid refund amount')
      return
    }
    
    this.processing = true
    
    from(getAuth().currentUser?.getIdToken() || Promise.reject('Not authenticated')).pipe(
      switchMap(token => 
        fetch(`${import.meta.env.DEV ? import.meta.env.VITE_BASE_URL : ''}/api/process-refund`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            bookingId: this.booking.id,
            amount: this.refundAmount,
            reason: this.refundReason
          })
        })
      ),
      switchMap(response => 
        from(response.json()).pipe(
          map(result => ({ response, result }))
        )
      ),
      tap(({ response, result }) => {
        if (!response.ok) {
          throw new Error(result.error || 'Failed to process refund')
        }
        
        $notify.success(`Refund of €${this.refundAmount.toFixed(2)} processed successfully`)
        
        // Close dialog
        $dialog.dismiss()
      }),
      catchError(error => {
        console.error('Refund processing error:', error)
        $notify.error(error.message || 'Failed to process refund')
        return EMPTY
      }),
      finalize(() => {
        this.processing = false
      }),
      takeUntil(this.disconnecting)
    ).subscribe()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'refund-dialog': RefundDialog
  }
}
