import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { of, from } from 'rxjs'
import { tap, switchMap, catchError, finalize } from 'rxjs/operators'
import './stripe-payment'
import type { SchmancyStripePayment } from './stripe-payment'

/**
 * Example showing how to integrate the Stripe component into the existing booking flow
 * This demonstrates how it works with the existing payment service and booking context
 */
@customElement('stripe-integration-example')
export class StripeIntegrationExample extends $LitElement() {
  @property({ type: Object })
  bookingData = {
    amount: 100, // €100
    courtId: 'court-123',
    date: '2024-01-15',
    startTime: '14:00',
    duration: 60,
    venueId: 'venue-456',
    userName: 'John Doe',
    userEmail: 'john@example.com',
    userPhone: '+1234567890'
  }

  @state()
  private clientSecret = ''

  @state()
  private loading = false

  @state()
  private paymentComplete = false

  private stripePayment?: SchmancyStripePayment

  // Configuration matching the existing codebase
  private stripeConfig = {
    publishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
    appearance: {
      theme: 'stripe' as const,
      variables: {
        colorPrimary: '#0570de',
        colorBackground: '#ffffff',
        colorSurface: '#ffffff',
        colorText: '#30313d',
        colorDanger: '#df1b41',
        fontFamily: 'GT-Eesti, system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: '8px'
      }
    },
    fonts: [
      { cssSrc: '/GT-Eesti/GT-Eesti-Pro-Text-Regular.woff' }
    ]
  }

  connectedCallback() {
    super.connectedCallback()
    
    // Create payment intent when component connects
    of(this.bookingData).pipe(
      tap(() => this.loading = true),
      switchMap(data => 
        from(fetch('/api/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: data.amount * 100, // Convert to cents
            currency: 'eur',
            metadata: {
              courtId: data.courtId,
              date: data.date,
              startTime: data.startTime,
              duration: data.duration.toString(),
              venueId: data.venueId
            },
            customer: {
              name: data.userName,
              email: data.userEmail,
              phone: data.userPhone
            }
          })
        }))
      ),
      switchMap(response => from(response.json())),
      tap(data => {
        this.clientSecret = data.clientSecret
      }),
      catchError(err => {
        console.error('Failed to create payment intent:', err)
        return of(null)
      }),
      finalize(() => this.loading = false)
    ).subscribe()
  }

  render() {
    return html`
      <div class="max-w-xl mx-auto p-6">
        ${when(this.paymentComplete,
          () => html`
            <schmancy-surface class="p-8 rounded-lg">
              <schmancy-grid gap="lg" align="center" justify="center">
                <schmancy-icon size="xxl" filled class="text-green-500">check_circle</schmancy-icon>
                <schmancy-typography type="headline">Payment Successful!</schmancy-typography>
                <schmancy-typography type="body" class="text-center">
                  Your booking for ${this.bookingData.date} at ${this.bookingData.startTime} has been confirmed.
                </schmancy-typography>
                <schmancy-button
                  variant="primary"
                  @click=${() => window.location.href = '/booking-confirmation'}
                >
                  View Booking Details
                </schmancy-button>
              </schmancy-grid>
            </schmancy-surface>
          `,
          () => html`
            <schmancy-surface class="p-8 rounded-lg">
              <schmancy-grid gap="lg">
                <schmancy-typography type="headline">Complete Your Booking</schmancy-typography>
                
                <div class="border-t pt-4">
                  <schmancy-grid gap="sm">
                    <div class="flex justify-between">
                      <schmancy-typography type="body">Court Booking</schmancy-typography>
                      <schmancy-typography type="body">€${this.bookingData.amount}</schmancy-typography>
                    </div>
                    <div class="flex justify-between">
                      <schmancy-typography type="caption" class="text-gray-600">
                        ${this.bookingData.date} at ${this.bookingData.startTime}
                      </schmancy-typography>
                      <schmancy-typography type="caption" class="text-gray-600">
                        ${this.bookingData.duration} minutes
                      </schmancy-typography>
                    </div>
                  </schmancy-grid>
                </div>

                ${when(this.loading,
                  () => html`
                    <div class="flex justify-center py-8">
                      <schmancy-progress mode="circular"></schmancy-progress>
                    </div>
                  `,
                  () => html`
                    <schmancy-stripe-payment
                      .config=${this.stripeConfig}
                      .paymentIntent=${{
                        amount: this.bookingData.amount * 100,
                        currency: 'eur',
                        customer: {
                          email: this.bookingData.userEmail,
                          name: this.bookingData.userName,
                          phone: this.bookingData.userPhone
                        },
                        metadata: {
                          courtId: this.bookingData.courtId,
                          venueId: this.bookingData.venueId
                        }
                      }}
                      .clientSecret=${this.clientSecret}
                      @success=${(e: CustomEvent) => {
                        console.log('Payment successful!', e.detail)
                        this.paymentComplete = true
                      }}
                      @error=${(e: CustomEvent) => {
                        console.error('Payment error:', e.detail.error)
                      }}
                      @ready=${() => {
                        this.stripePayment = this.shadowRoot?.querySelector('schmancy-stripe-payment') as SchmancyStripePayment
                      }}
                    >
                      <div slot="stripe-container" class="bg-gray-50 rounded-lg p-4"></div>
                    </schmancy-stripe-payment>

                    <schmancy-button
                      variant="primary"
                      size="lg"
                      class="w-full"
                      @click=${() => {
                        if (this.stripePayment) {
                          this.stripePayment.confirmPayment({ redirect: 'if_required' })
                            .subscribe({
                              next: (result) => {
                                if (result.error) {
                                  console.error('Payment failed:', result.error)
                                }
                              }
                            })
                        }
                      }}
                    >
                      Pay €${this.bookingData.amount}
                    </schmancy-button>
                  `
                )}
              </schmancy-grid>
            </schmancy-surface>
          `
        )}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'stripe-integration-example': StripeIntegrationExample
  }
}

/**
 * Integration Notes:
 * 
 * 1. The component works with existing payment flow:
 *    - Uses the same /api/create-payment-intent endpoint
 *    - Passes booking metadata in the same format
 *    - Handles customer information identically
 * 
 * 2. No changes needed to index.html:
 *    - Component handles its own mounting
 *    - Uses teleportation pattern for Stripe elements
 * 
 * 3. Easy integration into existing booking steps:
 *    - Import: import '../../../schmancy/stripe-payment'
 *    - Use: <schmancy-stripe-payment ...props>
 *    - Handle events: @success, @error, @change
 * 
 * 4. Maintains existing functionality:
 *    - Payment confirmation with redirect: 'if_required'
 *    - Error handling and display
 *    - Loading states
 *    - Success callbacks
 */