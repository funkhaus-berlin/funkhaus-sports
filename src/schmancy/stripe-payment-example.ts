import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import './stripe-payment'
import type { SchmancyStripePayment } from './stripe-payment'

/**
 * Example showing how to use the reusable Stripe payment component
 * without needing to modify index.html or add DOCTYPE boilerplate
 * 
 * The component uses teleportation pattern to mount Stripe elements
 * anywhere in the DOM while keeping the logic encapsulated
 */
@customElement('stripe-payment-example')
export class StripePaymentExample extends $LitElement(css`
  :host {
    display: block;
    max-width: 600px;
    margin: 2rem auto;
    padding: 2rem;
  }

  .payment-form {
    background: var(--schmancy-sys-color-surface);
    border-radius: 12px;
    padding: 2rem;
    box-shadow: var(--schmancy-sys-elevation-2);
  }

  .stripe-container {
    margin: 1.5rem 0;
    padding: 1rem;
    background: var(--schmancy-sys-color-surface-lowest);
    border-radius: 8px;
    min-height: 200px;
  }
`) {
  @state()
  private amount = 50 // €50

  @state()
  private clientSecret = '' // Would come from your backend

  @state()
  private paymentComplete = false

  private stripePayment?: SchmancyStripePayment

  // Configuration for Stripe
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
        fontFamily: 'system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: '8px'
      }
    }
  }

  firstUpdated() {
    // Get reference to the Stripe component
    this.stripePayment = this.shadowRoot?.querySelector('schmancy-stripe-payment') as SchmancyStripePayment
    
    // In a real app, you would create payment intent from your backend
    this.createPaymentIntent()
  }

  private async createPaymentIntent() {
    // This is just an example - in production, call your backend API
    try {
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: this.amount * 100, // Convert to cents
          currency: 'eur',
          metadata: {
            orderId: 'example-123',
            customerId: 'cust-456'
          }
        })
      })
      
      const data = await response.json()
      this.clientSecret = data.clientSecret
    } catch (error) {
      console.error('Failed to create payment intent:', error)
    }
  }

  private handlePaymentSuccess(event: CustomEvent) {
    console.log('Payment successful!', event.detail)
    this.paymentComplete = true
  }

  private handlePaymentError(event: CustomEvent) {
    console.error('Payment error:', event.detail.error)
  }

  private async handlePayment() {
    if (!this.stripePayment) return

    // The component handles all the complexity
    const result = await this.stripePayment.confirmPayment({
      redirect: 'if_required'
    }).toPromise()

    if (result?.error) {
      console.error('Payment failed:', result.error)
    }
  }

  render() {
    if (this.paymentComplete) {
      return html`
        <schmancy-surface class="payment-form">
          <schmancy-grid gap="lg" align="center" justify="center">
            <schmancy-icon size="xxl" filled>check_circle</schmancy-icon>
            <schmancy-typography type="headline">Payment Successful!</schmancy-typography>
            <schmancy-typography type="body">
              Thank you for your payment of €${this.amount}
            </schmancy-typography>
          </schmancy-grid>
        </schmancy-surface>
      `
    }

    return html`
      <schmancy-surface class="payment-form">
        <schmancy-grid gap="lg">
          <schmancy-typography type="headline">Complete Payment</schmancy-typography>
          
          <schmancy-typography type="body">
            Amount to pay: <strong>€${this.amount}</strong>
          </schmancy-typography>

          <!-- The reusable Stripe component -->
          <schmancy-stripe-payment
            .config=${this.stripeConfig}
            .paymentIntent=${{
              amount: this.amount * 100,
              currency: 'eur',
              customer: {
                email: 'customer@example.com',
                name: 'John Doe'
              }
            }}
            .clientSecret=${this.clientSecret}
            @success=${this.handlePaymentSuccess}
            @error=${this.handlePaymentError}
          >
            <!-- You can provide your own container or use the default -->
            <div slot="stripe-container" class="stripe-container"></div>
          </schmancy-stripe-payment>

          <schmancy-button
            variant="primary"
            size="lg"
            @click=${this.handlePayment}
          >
            Pay €${this.amount}
          </schmancy-button>
        </schmancy-grid>
      </schmancy-surface>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'stripe-payment-example': StripePaymentExample
  }
}

/**
 * Usage in any Lit component or HTML:
 * 
 * 1. Import the component:
 *    import './stripe-payment'
 * 
 * 2. Use in your template:
 *    <schmancy-stripe-payment
 *      .config=${{
 *        publishableKey: 'pk_test_...',
 *        appearance: { theme: 'stripe' }
 *      }}
 *      .paymentIntent=${{
 *        amount: 5000,
 *        currency: 'usd'
 *      }}
 *      .clientSecret=${clientSecret}
 *      @success=${handleSuccess}
 *      @error=${handleError}
 *    >
 *      <div slot="stripe-container"></div>
 *    </schmancy-stripe-payment>
 * 
 * 3. The component handles:
 *    - Loading Stripe SDK
 *    - Creating and mounting payment elements
 *    - Payment confirmation
 *    - Error handling
 *    - Loading states
 *    - Teleporting elements to avoid shadow DOM issues
 * 
 * No need to modify index.html or add any boilerplate!
 */