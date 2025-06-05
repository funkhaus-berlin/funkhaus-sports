# Stripe Elements Integration Guide - Project Agnostic

A comprehensive guide for integrating Stripe Elements into any web application. This guide covers the essential steps needed to accept payments using Stripe's secure, pre-built UI components.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Overview](#overview)
3. [Step 1: Basic HTML Setup](#step-1-basic-html-setup)
4. [Step 2: Environment Configuration](#step-2-environment-configuration)
5. [Step 3: Backend API Setup](#step-3-backend-api-setup)
6. [Step 4: Frontend Integration](#step-4-frontend-integration)
7. [Step 5: Payment Processing Flow](#step-5-payment-processing-flow)
8. [Step 6: Webhook Configuration](#step-6-webhook-configuration)
9. [Step 7: Error Handling](#step-7-error-handling)
10. [Testing](#testing)
11. [Security Best Practices](#security-best-practices)

## Prerequisites

- Stripe account with API keys (test and live)
- Basic knowledge of JavaScript/TypeScript
- A backend server (Node.js, Python, PHP, etc.)
- HTTPS-enabled domain for production

## Overview

Stripe Elements provides pre-built UI components that securely collect sensitive payment information. The integration follows this flow:

1. Your frontend requests a PaymentIntent from your backend
2. Your backend creates a PaymentIntent via Stripe API
3. Frontend uses the client secret to render Stripe Elements
4. Customer enters payment details directly into Stripe's secure iframe
5. Frontend confirms the payment with Stripe
6. Stripe sends webhook to your backend to confirm payment status

## Step 1: Basic HTML Setup

### 1.1 Include Stripe.js

Add the Stripe script to your HTML. This MUST be loaded from Stripe's servers for PCI compliance:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Payment Page</title>
    
    <!-- REQUIRED: Load Stripe.js from Stripe's servers -->
    <script src="https://js.stripe.com/v3/"></script>
</head>
<body>
    <div id="payment-form">
        <!-- Stripe Elements will be mounted here -->
        <div id="payment-element"></div>
        <button id="submit-button">Pay Now</button>
        <div id="error-message"></div>
    </div>
    
    <script src="your-payment-script.js"></script>
</body>
</html>
```

**Important**: Never download or bundle Stripe.js. Always load it from `https://js.stripe.com/v3/`

## Step 2: Environment Configuration

### 2.1 Environment Variables

Store your Stripe keys securely:

```bash
# .env file (never commit this to version control)
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 2.2 Backend Configuration

Initialize Stripe in your backend with the secret key:

```javascript
// Node.js example
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
```

```python
# Python example
import stripe
stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
```

## Step 3: Backend API Setup

### 3.1 Create Payment Intent Endpoint

Create an endpoint that generates a PaymentIntent:

```javascript
// POST /api/create-payment-intent
app.post('/api/create-payment-intent', async (req, res) => {
    try {
        const { amount, currency = 'usd' } = req.body;
        
        // Validate amount
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }
        
        // Create PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: currency,
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                // Add any relevant metadata for your application
                order_id: req.body.order_id,
                customer_email: req.body.email,
            }
        });
        
        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
        });
    } catch (error) {
        console.error('Payment intent error:', error);
        res.status(500).json({ error: 'Failed to create payment intent' });
    }
});
```

### 3.2 CORS Configuration (if needed)

If your frontend and backend are on different domains:

```javascript
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
```

## Step 4: Frontend Integration

### 4.1 Initialize Stripe

```javascript
// Initialize Stripe with your publishable key
const stripe = Stripe('pk_test_...');

// Initialize variables
let elements;
let paymentElement;
```

### 4.2 Create Payment Intent and Setup Elements

```javascript
async function initializePayment() {
    try {
        // 1. Create payment intent on your server
        const response = await fetch('/api/create-payment-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: 50.00, // $50.00
                currency: 'usd',
                order_id: '12345',
                email: 'customer@example.com'
            })
        });
        
        const { clientSecret } = await response.json();
        
        // 2. Create Elements instance
        const appearance = {
            theme: 'stripe',
            variables: {
                colorPrimary: '#0570de',
                colorBackground: '#ffffff',
                colorSurface: '#ffffff',
                colorText: '#30313d',
                colorDanger: '#df1b41',
                fontFamily: 'system-ui, sans-serif',
                borderRadius: '4px',
            }
        };
        
        elements = stripe.elements({ 
            clientSecret,
            appearance 
        });
        
        // 3. Create and mount Payment Element
        const paymentElementOptions = {
            layout: 'tabs'
        };
        
        paymentElement = elements.create('payment', paymentElementOptions);
        paymentElement.mount('#payment-element');
        
        // 4. Listen for errors
        paymentElement.on('change', function(event) {
            const errorElement = document.getElementById('error-message');
            if (event.error) {
                errorElement.textContent = event.error.message;
            } else {
                errorElement.textContent = '';
            }
        });
        
    } catch (error) {
        console.error('Error:', error);
        showError('Failed to initialize payment');
    }
}

// Call initialization when page loads
document.addEventListener('DOMContentLoaded', initializePayment);
```

### 4.3 Handle Payment Submission

```javascript
document.getElementById('submit-button').addEventListener('click', handleSubmit);

async function handleSubmit(event) {
    event.preventDefault();
    
    const submitButton = document.getElementById('submit-button');
    const errorElement = document.getElementById('error-message');
    
    // Disable button to prevent multiple submissions
    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';
    
    try {
        // Confirm the payment
        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/payment-success`,
            },
            redirect: 'if_required', // Only redirect if necessary (3D Secure, etc.)
        });
        
        if (error) {
            // Show error to customer
            if (error.type === 'card_error' || error.type === 'validation_error') {
                showError(error.message);
            } else {
                showError('An unexpected error occurred.');
            }
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
            // Payment succeeded
            showSuccess();
        }
    } catch (err) {
        showError('Payment failed. Please try again.');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Pay Now';
    }
}

function showError(message) {
    const errorElement = document.getElementById('error-message');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

function showSuccess() {
    // Redirect or show success message
    window.location.href = '/payment-success';
}
```

## Step 5: Payment Processing Flow

### 5.1 Complete Payment Flow

1. **Customer loads payment page** → Frontend initializes
2. **Frontend requests PaymentIntent** → Backend creates via Stripe API
3. **Frontend receives client secret** → Mounts Payment Element
4. **Customer enters card details** → Directly into Stripe's secure iframe
5. **Customer clicks Pay** → Frontend calls `stripe.confirmPayment()`
6. **Stripe processes payment** → Returns result to frontend
7. **Webhook notification** → Stripe notifies backend of payment status
8. **Backend updates order** → Marks as paid/failed based on webhook

### 5.2 Handle Different Payment States

```javascript
// Check payment status on success page
async function checkPaymentStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentIntentId = urlParams.get('payment_intent');
    
    if (!paymentIntentId) return;
    
    const response = await fetch(`/api/payment-status/${paymentIntentId}`);
    const { status } = await response.json();
    
    switch (status) {
        case 'succeeded':
            showMessage('Payment successful!');
            break;
        case 'processing':
            showMessage('Payment is processing...');
            break;
        case 'requires_payment_method':
            showMessage('Payment failed. Please try again.');
            break;
        default:
            showMessage('Something went wrong.');
    }
}
```

## Step 6: Webhook Configuration

### 6.1 Create Webhook Endpoint

```javascript
// POST /api/stripe-webhook
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    
    try {
        // Verify webhook signature
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed');
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // Handle the event
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            await handlePaymentSuccess(paymentIntent);
            break;
            
        case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;
            await handlePaymentFailure(failedPayment);
            break;
            
        default:
            console.log(`Unhandled event type ${event.type}`);
    }
    
    res.json({ received: true });
});

async function handlePaymentSuccess(paymentIntent) {
    // Update your database
    const orderId = paymentIntent.metadata.order_id;
    await updateOrderStatus(orderId, 'paid');
    await sendConfirmationEmail(paymentIntent.metadata.customer_email);
}

async function handlePaymentFailure(paymentIntent) {
    // Handle failed payment
    const orderId = paymentIntent.metadata.order_id;
    await updateOrderStatus(orderId, 'payment_failed');
}
```

### 6.2 Configure Webhook in Stripe Dashboard

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Developers → Webhooks
2. Click "Add endpoint"
3. Enter your endpoint URL: `https://yourdomain.com/api/stripe-webhook`
4. Select events to listen for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
5. Copy the webhook secret and add to your environment variables

## Step 7: Error Handling

### 7.1 Common Error Types

```javascript
function handleStripeError(error) {
    const errorMessages = {
        'card_declined': 'Your card was declined.',
        'expired_card': 'Your card has expired.',
        'incorrect_cvc': 'Your card\'s security code is incorrect.',
        'processing_error': 'An error occurred while processing your card.',
        'incorrect_number': 'The card number is incorrect.',
        'insufficient_funds': 'Your card has insufficient funds.',
    };
    
    return errorMessages[error.code] || 'An error occurred with your payment.';
}
```

### 7.2 Network Error Handling

```javascript
async function makePaymentRequest(data) {
    try {
        const response = await fetch('/api/create-payment-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        
        return await response.json();
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Network error. Please check your connection.');
        }
        throw error;
    }
}
```

## Testing

### Test Card Numbers

Use these test cards in test mode:

| Scenario | Card Number | Details |
|----------|------------|---------|
| Success | 4242 4242 4242 4242 | Any CVC, any future expiry |
| Requires authentication | 4000 0025 0000 3155 | 3D Secure 2 authentication |
| Declined | 4000 0000 0000 9995 | Generic decline |
| Insufficient funds | 4000 0000 0000 9995 | Decline code: insufficient_funds |

### Testing Webhooks Locally

Use Stripe CLI to test webhooks during development:

```bash
# Install Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Windows: scoop install stripe
# Linux: Download from GitHub releases

# Login
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:3000/api/stripe-webhook

# The CLI will display your webhook signing secret
# Use this in your local .env file
```

## Security Best Practices

### 1. **PCI Compliance**
- Always load Stripe.js from `https://js.stripe.com/v3/`
- Never handle raw card details on your server
- Use Stripe Elements or Payment Element for card collection

### 2. **API Key Security**
- Never expose your secret key in client-side code
- Use environment variables for all keys
- Rotate keys regularly
- Use restricted keys in production

### 3. **Amount Validation**
- Always calculate amounts on the server
- Never trust client-side amount values
- Validate currency codes

### 4. **Webhook Security**
- Always verify webhook signatures
- Use webhook endpoints with HTTPS only
- Implement idempotency to handle duplicate events
- Return 200 status quickly to avoid retries

### 5. **Error Messages**
- Don't expose internal error details to users
- Log detailed errors server-side only
- Show user-friendly error messages

### 6. **HTTPS Requirements**
- Production must use HTTPS
- Test mode works with HTTP localhost
- Webhooks require HTTPS endpoints

### 7. **Metadata Best Practices**
- Store application-specific data in metadata
- Don't store sensitive information
- Metadata is visible in Stripe Dashboard

## Common Integration Patterns

### 1. **Save Payment Method for Later**
```javascript
const paymentIntent = await stripe.paymentIntents.create({
    amount: 1000,
    currency: 'usd',
    setup_future_usage: 'off_session', // Save for future use
});
```

### 2. **Handle 3D Secure Authentication**
```javascript
if (paymentIntent.status === 'requires_action') {
    // Stripe automatically handles this with confirmPayment
    // The customer will see 3DS challenge if needed
}
```

### 3. **Subscription Payments**
Use Stripe Checkout or Setup Intents for subscriptions instead of Payment Intents.

### 4. **Refunds**
```javascript
const refund = await stripe.refunds.create({
    payment_intent: 'pi_...',
    amount: 1000, // Partial refund in cents
});
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Stripe is not defined" | Ensure Stripe.js is loaded before your code |
| Elements not appearing | Check if container element exists when mounting |
| Webhook 400 errors | Verify signature with raw request body, not parsed |
| CORS errors | Add proper CORS headers to your API endpoints |
| Payment succeeds but order not updated | Check webhook configuration and logs |

## Next Steps

1. Implement proper error logging
2. Add customer email receipts
3. Set up Stripe Radar for fraud protection
4. Implement strong customer authentication (SCA) for EU customers
5. Add support for additional payment methods (wallets, bank transfers)
6. Set up monitoring and alerts for failed payments

## Resources

- [Stripe Elements Documentation](https://stripe.com/docs/payments/elements)
- [Payment Intents API](https://stripe.com/docs/api/payment_intents)
- [Stripe.js Reference](https://stripe.com/docs/js)
- [Testing Documentation](https://stripe.com/docs/testing)
- [Webhook Events](https://stripe.com/docs/webhooks/stripe-events)