# Reusable Stripe Payment Component

A fully encapsulated, reusable Stripe payment component that uses the teleportation pattern to avoid shadow DOM limitations. This component can be used in any project without modifying the HTML structure.

## Features

- **Teleportation Pattern**: Mounts Stripe elements outside shadow DOM while keeping logic encapsulated
- **Fully Reactive**: Built with RxJS for functional, reactive programming
- **TypeScript Support**: Full type safety with Stripe types
- **Event-Driven**: Communicates via custom events
- **Self-Contained**: No need to modify index.html or add boilerplate
- **Configurable**: Supports all Stripe appearance options
- **Error Handling**: Built-in error management and recovery

## Installation

```typescript
import './schmancy/stripe-payment'
```

## Basic Usage

```typescript
<schmancy-stripe-payment
  .config=${{
    publishableKey: 'pk_test_...',
    appearance: { theme: 'stripe' }
  }}
  .paymentIntent=${{
    amount: 5000, // in cents
    currency: 'usd',
    customer: {
      email: 'customer@example.com',
      name: 'John Doe'
    }
  }}
  .clientSecret=${clientSecret}
  @success=${handleSuccess}
  @error=${handleError}
>
  <div slot="stripe-container"></div>
</schmancy-stripe-payment>
```

## API

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `config` | `StripePaymentConfig` | Stripe configuration including publishable key and appearance |
| `paymentIntent` | `PaymentIntentConfig` | Payment details (amount, currency, customer info) |
| `clientSecret` | `string` | Client secret from payment intent (from your backend) |
| `returnUrl` | `string` | URL to return to after payment (default: current origin) |
| `autoMount` | `boolean` | Auto-mount payment element when ready (default: true) |

### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `ready` | `{ stripe, elements }` | Fired when Stripe is initialized |
| `change` | `{ complete, empty, error }` | Fired when payment element state changes |
| `error` | `{ error }` | Fired on any error |
| `processing` | `{ processing }` | Fired when processing state changes |
| `success` | `{ paymentIntent }` | Fired on successful payment |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `confirmPayment(options?)` | `Observable<Result>` | Confirm the payment |
| `createPaymentMethod()` | `Observable<Result>` | Create payment method without confirming |
| `updatePaymentElement(options)` | `void` | Update payment element options |
| `clear()` | `void` | Clear the payment form |
| `focus()` | `void` | Focus the payment element |
| `reset()` | `void` | Reset the entire component |

## Advanced Example

```typescript
@customElement('checkout-form')
export class CheckoutForm extends LitElement {
  @state() amount = 100 // $100
  @state() clientSecret = ''
  
  private stripeConfig = {
    publishableKey: import.meta.env.VITE_STRIPE_KEY,
    appearance: {
      theme: 'night',
      variables: {
        colorPrimary: '#0570de',
        borderRadius: '8px'
      }
    },
    fonts: [
      { cssSrc: 'https://fonts.googleapis.com/css2?family=Inter' }
    ]
  }
  
  async firstUpdated() {
    // Create payment intent on your backend
    const response = await fetch('/api/payment-intent', {
      method: 'POST',
      body: JSON.stringify({ amount: this.amount * 100 })
    })
    const { clientSecret } = await response.json()
    this.clientSecret = clientSecret
  }
  
  async handleSubmit() {
    const stripe = this.shadowRoot.querySelector('schmancy-stripe-payment')
    const result = await stripe.confirmPayment().toPromise()
    
    if (result.error) {
      // Handle error
    } else {
      // Payment successful!
    }
  }
  
  render() {
    return html`
      <schmancy-stripe-payment
        .config=${this.stripeConfig}
        .paymentIntent=${{
          amount: this.amount * 100,
          currency: 'usd'
        }}
        .clientSecret=${this.clientSecret}
        @success=${e => console.log('Success!', e.detail)}
      >
        <div slot="stripe-container" class="payment-form"></div>
      </schmancy-stripe-payment>
      
      <button @click=${this.handleSubmit}>Pay $${this.amount}</button>
    `
  }
}
```

## How It Works

1. **Teleportation**: The component creates a DOM element outside the shadow DOM and teleports it to the slotted container
2. **Reactive Streams**: Uses RxJS to manage Stripe initialization, state changes, and payment processing
3. **Event Communication**: Dispatches custom events for all state changes and results
4. **Cleanup**: Automatically cleans up resources when disconnected

## Benefits Over Traditional Integration

- **No index.html modifications needed**: Works within your component tree
- **Encapsulated logic**: All Stripe logic contained in one component
- **Reusable**: Drop into any project with minimal setup
- **Type-safe**: Full TypeScript support
- **Reactive**: Built on RxJS for clean async handling
- **Testable**: Easy to mock and test

## Migration from Existing Stripe Integration

If you have an existing Stripe integration with a `#stripe-element` div in your HTML:

1. Remove the hardcoded div from index.html
2. Import the new component
3. Replace mount logic with the component
4. Handle events instead of promises directly

Before:
```html
<!-- index.html -->
<div id="stripe-element"></div>
```

```typescript
// Old way
const element = stripe.elements().create('payment')
element.mount('#stripe-element')
```

After:
```typescript
// New way
<schmancy-stripe-payment
  .config=${config}
  .clientSecret=${secret}
  @success=${handleSuccess}
/>
```

## Browser Support

- Modern browsers with Web Components support
- Shadow DOM v1
- ES2015+

## License

Same as project license