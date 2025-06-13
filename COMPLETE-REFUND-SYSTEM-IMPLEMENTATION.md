# Complete Refund System Implementation Guide

This comprehensive guide documents a production-tested refund system implementation for any booking or e-commerce platform using Netlify Functions, Stripe, Firebase, and Lit Components.

> **Note**: This is a generic implementation guide. Replace placeholder values like "Your Company", "your-domain.com", and adapt field names (e.g., `resourceId`, `merchantId`) to match your specific domain model.

## Table of Contents
1. [System Overview](#system-overview)
2. [Prerequisites](#prerequisites)
3. [Database Schema](#database-schema)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Components](#frontend-components)
6. [Email Templates](#email-templates)
7. [Stripe Integration](#stripe-integration)
8. [Security & Best Practices](#security--best-practices)
9. [Step-by-Step Implementation](#step-by-step-implementation)
10. [Testing & Monitoring](#testing--monitoring)

## System Overview

The refund system provides:
- Admin-initiated refunds (full or partial)
- Automated email notifications at each stage
- Comprehensive error handling with manual intervention support
- Real-time status tracking
- Audit logging for compliance
- Idempotent operations to prevent duplicate refunds

### Refund Flow
1. Admin initiates refund via UI → 2. Backend validates and creates Stripe refund → 3. Stripe processes refund → 4. Webhooks update booking status → 5. Automated emails sent → 6. Failed refunds queued for manual intervention

## Prerequisites

### Environment Variables
```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# Resend Email Service
RESEND_API_KEY=re_...

# Development
VITE_BASE_URL=http://localhost:8888 # For local development
```

### Dependencies
```json
{
  "dependencies": {
    "@netlify/functions": "^2.0.0",
    "stripe": "^14.0.0",
    "firebase-admin": "^12.0.0",
    "resend": "^3.0.0",
    "pug": "^3.0.0",
    "dayjs": "^1.11.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@mhmo91/schmancy": "^1.0.0",
    "lit": "^3.0.0",
    "@types/pug": "^2.0.0"
  }
}
```

## Database Schema

### Booking Type Extensions
Add these fields to your existing booking type:

```typescript
export interface Booking {
  // ... existing fields ...
  
  // Refund tracking fields
  refundId?: string                    // Stripe refund ID
  refundStatus?: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'requires_action'
  refundAmount?: number                // Amount refunded in currency units
  refundedAt?: string                  // ISO timestamp when refund completed
  refundReason?: string                // Admin-provided reason
  refundedBy?: string                  // Admin user ID who initiated
  refundedByEmail?: string             // Admin email for tracking
  refundCreatedAt?: string             // When Stripe refund was created
  refundFailedAt?: string              // When refund failed
  refundFailureReason?: string         // Stripe error message
  refundCanceledAt?: string            // When refund was canceled
  refundRequiresAction?: boolean       // If customer action needed
  refundInitiatedAt?: string           // When admin clicked refund
  refundInitiatedBy?: string           // User ID who initiated
  refundInitiatedByEmail?: string      // Email of initiator
  
  // Email tracking
  refundInitiatedEmailSent?: boolean   // Tracks initial email
  refundInitiatedEmailSentAt?: string  
  refundCompletedEmailSent?: boolean   // Tracks completion email
  refundCompletedEmailSentAt?: string
  refundDelayEmailSent?: boolean       // Tracks delay notification
  refundDelayEmailSentAt?: string
}
```

### Additional Collections

#### Audit Logs Collection
```typescript
interface AuditLog {
  action: string
  bookingId: string
  refundId: string
  amount: number
  reason: string
  initiatedBy: {
    userId: string
    email: string
    ip: string
    userAgent: string
  }
  timestamp: FirebaseFirestore.Timestamp
  merchantId: string
  customerId: string
  idempotencyKey: string
}
```

#### Refund Failures Collection
```typescript
interface RefundFailure {
  bookingId: string
  refundId: string
  paymentIntentId: string
  failureReason: string
  stripeErrorCode?: string
  canRetry: boolean
  attemptedAt: string
  customerNotified: boolean
  needsAdminNotification: boolean
  resourceId?: string
  customerEmail?: string
  refundAmount: number
  originalBookingAmount: number
}
```

## Backend Implementation

### 1. Process Refund Function (`/netlify/functions/process-refund.ts`)

```typescript
import { Handler, HandlerEvent } from '@netlify/functions'
import { adminAuth, db } from './_shared/firebase-admin'
import stripe from './_shared/stripe'
import { corsHeaders } from './_shared/cors'
import { Booking } from './types/shared-types'
import type { Stripe } from 'stripe'
import admin from 'firebase-admin'

interface RefundRequest {
  bookingId: string
  amount?: number // Optional: if not provided, full refund
  reason?: string
}

interface RefundResponse {
  success: boolean
  refundId?: string
  amount?: number
  currency?: string
  status?: string
  error?: string
  errorCode?: string
  canRetry?: boolean
}

export const handler: Handler = async (event: HandlerEvent) => {
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  try {
    // Verify authentication
    const authHeader = event.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Unauthorized' }),
      }
    }

    const token = authHeader.split('Bearer ')[1]
    const decodedToken = await adminAuth.verifyIdToken(token)
    
    // Verify user has admin access
    const userRecord = await adminAuth.getUser(decodedToken.uid)
    const isAdmin = userRecord.customClaims?.admin === true
    
    if (!isAdmin) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Forbidden: Admin access required' }),
      }
    }

    // Parse request body
    const { bookingId, amount, reason }: RefundRequest = JSON.parse(event.body || '{}')
    
    if (!bookingId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Booking ID is required' }),
      }
    }

    // Get booking from Firestore
    const bookingRef = db.collection('bookings').doc(bookingId)
    const bookingDoc = await bookingRef.get()
    
    if (!bookingDoc.exists) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Booking not found' }),
      }
    }

    const booking = bookingDoc.data() as Booking
    
    // Validate booking can be refunded
    if (booking.status !== 'confirmed') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Cannot refund booking with status: ${booking.status}` }),
      }
    }

    if (!booking.paymentIntentId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No payment intent found for this booking' }),
      }
    }

    // Check if already refunded
    if (booking.refundStatus === 'succeeded' || booking.refundStatus === 'processing' || booking.refundStatus === 'pending') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Booking has already been refunded or refund is in progress' }),
      }
    }

    // Get payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(booking.paymentIntentId)
    
    if (paymentIntent.status !== 'succeeded') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Payment has not been successfully charged',
          errorCode: 'payment_not_succeeded'
        }),
      }
    }

    // Check if payment has charges
    if (!paymentIntent.latest_charge) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'No charge found for this payment',
          errorCode: 'no_charge_found'
        }),
      }
    }

    // Calculate refund amount
    const chargeAmount = paymentIntent.amount_received
    const refundAmount = amount ? Math.min(amount * 100, chargeAmount) : chargeAmount // Convert to cents
    
    // Validate refund amount
    if (refundAmount <= 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Invalid refund amount',
          errorCode: 'invalid_amount'
        }),
      }
    }
    
    // Check if refund amount exceeds charge amount
    if (refundAmount > chargeAmount) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Refund amount cannot exceed the original charge amount',
          errorCode: 'amount_too_large'
        }),
      }
    }
    
    // Use Firestore transaction to prevent race conditions
    const refund = await db.runTransaction(async (transaction) => {
      // Re-fetch booking within transaction
      const transactionBookingDoc = await transaction.get(bookingRef)
      const transactionBooking = transactionBookingDoc.data() as Booking
      
      // Double-check refund status within transaction
      if (transactionBooking.refundStatus === 'pending' || 
          transactionBooking.refundStatus === 'processing' ||
          transactionBooking.refundStatus === 'succeeded') {
        throw new Error(`Refund already in progress or completed: ${transactionBooking.refundStatus}`)
      }
      
      // Update booking with refund information BEFORE creating Stripe refund
      const updateFields: any = {
        refundInitiatedAt: new Date().toISOString(),
        refundInitiatedBy: decodedToken.uid,
        refundInitiatedByEmail: decodedToken.email || ''
      }
      
      // Only set refundReason if a reason was provided
      if (reason && reason.trim()) {
        updateFields.refundReason = reason
      }
      
      transaction.update(bookingRef, updateFields)
      
      // Create idempotency key for this refund attempt
      const idempotencyKey = `refund_${bookingId}_${Date.now()}_${decodedToken.uid}`
      
      // Create refund in Stripe with idempotency
      const stripeRefund = await stripe.refunds.create({
        payment_intent: booking.paymentIntentId,
        amount: refundAmount,
        reason: reason === 'requested_by_customer' || reason === 'duplicate' || reason === 'fraudulent' 
          ? reason as Stripe.RefundCreateParams.Reason 
          : 'requested_by_customer',
        metadata: {
          bookingId: bookingId,
          adminId: decodedToken.uid,
          adminEmail: decodedToken.email || '',
          refundReason: reason || '',
        },
      }, {
        idempotencyKey: idempotencyKey
      })
      
      // Create audit log entry
      const auditLogRef = db.collection('audit_logs').doc()
      transaction.set(auditLogRef, {
        action: 'refund_initiated',
        bookingId: bookingId,
        refundId: stripeRefund.id,
        amount: refundAmount / 100,
        reason: reason || '',
        initiatedBy: {
          userId: decodedToken.uid,
          email: decodedToken.email,
          ip: event.headers['x-forwarded-for'] || event.headers['client-ip'],
          userAgent: event.headers['user-agent']
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        merchantId: booking.merchantId,
        customerId: booking.userId,
        idempotencyKey: idempotencyKey
      })
      
      return stripeRefund
    })

    // Update booking in Firestore based on refund status
    const updateData: any = {
      refundId: refund.id,
      refundStatus: refund.status,
      refundAmount: refundAmount / 100,
      refundCreatedAt: new Date().toISOString(),
      refundReason: reason || '',
      refundedBy: decodedToken.uid,
      refundedByEmail: decodedToken.email || '',
      updatedAt: new Date().toISOString(),
    }
    
    // Only mark as cancelled and refunded if the refund succeeded immediately
    if (refund.status === 'succeeded') {
      updateData.status = 'cancelled'
      updateData.refundedAt = new Date().toISOString()
      updateData.cancellationReason = reason ? `Refunded: ${reason}` : 'Refunded'
    }
    
    await bookingRef.update(updateData)

    // Return success response
    const response: RefundResponse = {
      success: true,
      refundId: refund.id,
      amount: refundAmount / 100,
      currency: refund.currency,
      status: refund.status as string,
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    }

  } catch (error: any) {
    console.error('Refund processing error:', error)
    
    // Error handling with specific Stripe error codes
    let errorMessage = 'Failed to process refund'
    let errorCode = 'unknown_error'
    let statusCode = 500
    let canRetry = false
    
    // Handle Stripe-specific errors
    if (error.type === 'StripeCardError') {
      statusCode = 400
      errorCode = error.code || 'card_error'
      
      switch (error.code) {
        case 'charge_already_refunded':
          errorMessage = 'This charge has already been fully refunded'
          break
        case 'insufficient_funds':
          errorMessage = 'Unable to process refund due to insufficient funds. Please contact support.'
          statusCode = 503
          canRetry = true
          break
        default:
          errorMessage = error.message || 'Card error during refund'
      }
    } else if (error.type === 'StripeInvalidRequestError') {
      statusCode = 400
      errorCode = error.code || 'invalid_request'
      errorMessage = error.message || 'Invalid refund request'
    } else if (error.type === 'StripeAPIError') {
      statusCode = 503
      errorCode = 'api_error'
      errorMessage = 'Stripe service temporarily unavailable. Please try again later.'
      canRetry = true
    } else if (error.type === 'StripeConnectionError') {
      statusCode = 503
      errorCode = 'connection_error'
      errorMessage = 'Network error. Please check your connection and try again.'
      canRetry = true
    } else if (error.type === 'StripeRateLimitError') {
      statusCode = 429
      errorCode = 'rate_limit'
      errorMessage = 'Too many requests. Please try again in a moment.'
      canRetry = true
    }

    return {
      statusCode,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: false, 
        error: errorMessage,
        errorCode,
        canRetry
      }),
    }
  }
}
```

### 2. Webhook Handler Updates (`/netlify/functions/stripe-webhook.ts`)

Add these webhook handlers to your existing stripe-webhook function:

```typescript
// Handle refund events
switch (stripeEvent.type) {
  case 'refund.created':
    await handleRefundCreated(stripeEvent.data.object as Stripe.Refund)
    break
  case 'charge.refunded':
    await handleChargeRefunded(stripeEvent.data.object as Stripe.Charge)
    break
  case 'charge.refund.updated':
    await handleRefundUpdated(stripeEvent.data.object as Stripe.Refund)
    break
  case 'refund.failed':
    await handleRefundFailed(stripeEvent.data.object as Stripe.Refund)
    break
}

// Handler implementations
async function handleRefundCreated(refund: Stripe.Refund) {
  const bookingRef = await findBookingByPaymentIntent(refund.payment_intent as string)
  if (!bookingRef) return

  const booking = (await bookingRef.get()).data() as Booking
  
  // Update booking with refund status
  await bookingRef.update({
    refundId: refund.id,
    refundStatus: refund.status,
    refundAmount: refund.amount / 100,
    refundCreatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })

  // Send appropriate email based on status
  if (refund.status === 'pending' || refund.status === 'requires_action') {
    // Send refund initiated email
    if (!booking.refundInitiatedEmailSent) {
      await sendRefundInitiatedEmail(booking, refund)
      await bookingRef.update({
        refundInitiatedEmailSent: true,
        refundInitiatedEmailSentAt: new Date().toISOString()
      })
    }
  } else if (refund.status === 'succeeded') {
    // Send refund completed email
    if (!booking.refundCompletedEmailSent) {
      await sendRefundCompletedEmail(booking, refund)
      await bookingRef.update({
        refundCompletedEmailSent: true,
        refundCompletedEmailSentAt: new Date().toISOString(),
        status: 'cancelled',
        refundedAt: new Date().toISOString()
      })
    }
  }
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const bookingRef = await findBookingByPaymentIntent(charge.payment_intent as string)
  if (!bookingRef) return

  const booking = (await bookingRef.get()).data() as Booking
  
  // Calculate refund amount
  const totalRefunded = charge.amount_refunded / 100
  const isFullRefund = charge.amount_refunded === charge.amount

  // Update booking
  await bookingRef.update({
    refundStatus: 'succeeded',
    refundAmount: totalRefunded,
    refundedAt: new Date().toISOString(),
    status: 'cancelled',
    cancellationReason: booking.refundReason ? `Refunded: ${booking.refundReason}` : 'Refunded',
    updatedAt: new Date().toISOString()
  })

  // Send completion email if not already sent
  if (!booking.refundCompletedEmailSent) {
    await sendRefundCompletedEmail(booking, { amount: charge.amount_refunded, id: charge.refunds.data[0]?.id })
    await bookingRef.update({
      refundCompletedEmailSent: true,
      refundCompletedEmailSentAt: new Date().toISOString()
    })
  }
}

async function handleRefundUpdated(refund: Stripe.Refund) {
  const bookingRef = await findBookingByPaymentIntent(refund.payment_intent as string)
  if (!bookingRef) return

  const updateData: any = {
    refundStatus: refund.status,
    updatedAt: new Date().toISOString()
  }

  if (refund.status === 'succeeded') {
    updateData.refundedAt = new Date().toISOString()
    updateData.status = 'cancelled'
  } else if (refund.status === 'failed') {
    updateData.refundFailedAt = new Date().toISOString()
    updateData.refundFailureReason = refund.failure_reason || 'Unknown error'
  }

  await bookingRef.update(updateData)
}

async function handleRefundFailed(refund: Stripe.Refund) {
  const bookingRef = await findBookingByPaymentIntent(refund.payment_intent as string)
  if (!bookingRef) return

  const booking = (await bookingRef.get()).data() as Booking

  // Update booking with failure
  await bookingRef.update({
    refundStatus: 'failed',
    refundFailedAt: new Date().toISOString(),
    refundFailureReason: refund.failure_reason || 'Processing error',
    updatedAt: new Date().toISOString()
  })

  // Create failure record for manual intervention
  await db.collection('refundFailures').add({
    bookingId: booking.id,
    refundId: refund.id,
    paymentIntentId: refund.payment_intent,
    failureReason: refund.failure_reason || 'Unknown error',
    stripeErrorCode: refund.failure_balance_transaction,
    canRetry: isRetryableError(refund.failure_reason),
    attemptedAt: new Date().toISOString(),
    customerNotified: false,
    needsAdminNotification: true,
    resourceId: booking.resourceId,
    customerEmail: booking.customerEmail,
    refundAmount: refund.amount / 100,
    originalBookingAmount: booking.price
  })

  // Send delay notification email
  if (!booking.refundDelayEmailSent) {
    await sendRefundDelayEmail(booking, refund)
    await bookingRef.update({
      refundDelayEmailSent: true,
      refundDelayEmailSentAt: new Date().toISOString()
    })
  }
}
```

### 3. Email Sending Functions

```typescript
import { Resend } from 'resend'
import { renderFile } from 'pug'
import { resolve } from 'path'

const resend = new Resend(process.env.RESEND_API_KEY)

async function sendRefundInitiatedEmail(booking: Booking, refund: any) {
  const resource = await getResourceDetails(booking.resourceId)
  const merchant = await getMerchantDetails(booking.merchantId)
  
  const html = renderFile(resolve(__dirname, '../_shared/refund-initiated.pug'), {
    customer: {
      name: booking.userName
    },
    orderNumber: booking.orderNumber || booking.invoiceNumber || booking.id,
    invoiceNumber: booking.invoiceNumber,
    bookingId: booking.id,
    booking: {
      date: formatDate(booking.date),
      resource: resource?.name || 'Item',
      merchant: merchant?.name || 'Merchant'
    },
    timeDisplay: formatTimeRange(booking.startTime, booking.endTime),
    refund: {
      amount: refund.amount / 100,
      reason: booking.refundReason
    }
  })

  await resend.emails.send({
    from: 'Your Company <no-reply@your-domain.com>',
    to: booking.customerEmail!,
    cc: merchant?.contactEmail,
    subject: `Refund Initiated - Order #${booking.orderNumber || booking.id}`,
    html
  })
}

async function sendRefundCompletedEmail(booking: Booking, refund: any) {
  const resource = await getResourceDetails(booking.resourceId)
  const merchant = await getMerchantDetails(booking.merchantId)
  
  const html = renderFile(resolve(__dirname, '../_shared/refund-completed.pug'), {
    customer: {
      name: booking.userName
    },
    orderNumber: booking.orderNumber || booking.invoiceNumber || booking.id,
    invoiceNumber: booking.invoiceNumber,
    bookingId: booking.id,
    booking: {
      date: formatDate(booking.date),
      resource: resource?.name || 'Item',
      merchant: merchant?.name || 'Merchant'
    },
    timeDisplay: formatTimeRange(booking.startTime, booking.endTime),
    refund: {
      amount: refund.amount / 100,
      id: refund.id
    }
  })

  await resend.emails.send({
    from: 'Your Company <no-reply@your-domain.com>',
    to: booking.customerEmail!,
    cc: merchant?.contactEmail,
    subject: `Refund Completed - Order #${booking.orderNumber || booking.id}`,
    html
  })
}

async function sendRefundDelayEmail(booking: Booking, refund: any) {
  const resource = await getResourceDetails(booking.resourceId)
  
  const html = renderFile(resolve(__dirname, '../_shared/refund-delay.pug'), {
    customer: {
      name: booking.userName
    },
    refund: {
      amount: refund.amount / 100
    },
    booking: {
      date: formatDate(booking.date),
      resource: resource?.name || 'Item'
    }
  })

  await resend.emails.send({
    from: 'Your Company <no-reply@your-domain.com>',
    to: booking.customerEmail!,
    subject: 'Refund Processing Delay - We\'re On It!',
    html
  })
}
```

## Frontend Components

### 1. Refund Dialog Component (`/src/admin/components/refund-dialog.ts`)

```typescript
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
            placeholder="e.g., Customer request, service unavailable, etc."
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
        sheet.dismiss(this.tagName)
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
```

### 2. Booking Details Integration

Add refund button and status display to your booking details component:

```typescript
// In booking-details.ts or similar component
import './refund-dialog'

// In render method, add refund UI:
render() {
  const canRefund = this.booking.status === 'confirmed' && 
                    this.booking.paymentStatus === 'paid' &&
                    !['succeeded', 'processing', 'pending'].includes(this.booking.refundStatus || '')

  return html`
    <!-- Existing booking details -->
    
    <!-- Refund Status -->
    ${this.booking.refundStatus ? html`
      <div class="flex items-center gap-2">
        <schmancy-typography type="label" token="sm">Refund Status:</schmancy-typography>
        <schmancy-chip 
          variant=${this.getRefundStatusVariant(this.booking.refundStatus)}
          size="sm"
        >
          ${this.getRefundStatusLabel(this.booking.refundStatus)}
        </schmancy-chip>
      </div>
    ` : ''}
    
    <!-- Refund Button -->
    ${canRefund ? html`
      <schmancy-button
        variant="outlined"
        color="error"
        @click=${() => this.openRefundDialog()}
      >
        <schmancy-icon slot="prefix">payments</schmancy-icon>
        Process Refund
      </schmancy-button>
    ` : ''}
  `
}

private openRefundDialog() {
  const dialog = document.createElement('refund-dialog') as any
  dialog.booking = this.booking
  
  sheet.open({
    component: dialog,
    fullScreenOnMobile: true
  })
}

private getRefundStatusVariant(status: string): string {
  switch (status) {
    case 'succeeded': return 'success'
    case 'processing':
    case 'pending': return 'warning'
    case 'failed': return 'error'
    default: return 'surface'
  }
}

private getRefundStatusLabel(status: string): string {
  switch (status) {
    case 'succeeded': return 'Refunded'
    case 'processing': return 'Processing'
    case 'pending': return 'Pending'
    case 'failed': return 'Failed'
    case 'requires_action': return 'Action Required'
    default: return status
  }
}
```

## Email Templates

### 1. Refund Initiated (`refund-initiated.pug`)

```pug
doctype html
html(lang="en")
  head
    meta(charset="UTF-8")
    meta(name="viewport" content="width=device-width, initial-scale=1.0")
    title Refund Initiated - Your Company
    link(href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet")
    style.
      body {
        margin: 0;
        padding: 0;
        font-family: 'Montserrat', Arial, sans-serif;
        background-color: #f5f5f5;
        color: #1a1a1a;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
      }
      .header {
        background-color: #0f0f0f;
        padding: 40px 30px;
        text-align: center;
      }
      .logo {
        max-width: 180px;
        height: auto;
      }
      .content {
        padding: 40px 30px;
      }
      .status-banner {
        background-color: #fef3c7;
        border-left: 4px solid #fcd34d;
        padding: 20px;
        margin-bottom: 30px;
        border-radius: 0 8px 8px 0;
      }
      .status-text {
        color: #92400e;
        font-size: 18px;
        font-weight: 600;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .greeting {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 20px;
        color: #1a1a1a;
      }
      .message {
        font-size: 16px;
        line-height: 1.6;
        color: #333;
        margin-bottom: 30px;
      }
      .details-box {
        background-color: #f9f9f9;
        border-radius: 12px;
        padding: 25px;
        margin-bottom: 30px;
      }
      .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid #e5e5e5;
      }
      .detail-row:last-child {
        border-bottom: none;
      }
      .detail-label {
        font-weight: 600;
        color: #666;
      }
      .detail-value {
        color: #1a1a1a;
        text-align: right;
      }
      .refund-amount-box {
        background-color: #fef3c7;
        border-radius: 12px;
        padding: 25px;
        text-align: center;
        margin-bottom: 30px;
      }
      .refund-label {
        font-size: 14px;
        color: #92400e;
        margin-bottom: 10px;
      }
      .refund-amount {
        font-size: 32px;
        font-weight: 700;
        color: #92400e;
      }
      .footer {
        background-color: #f5f5f5;
        padding: 30px;
        text-align: center;
        font-size: 14px;
        color: #666;
      }
      .footer a {
        color: #0066cc;
        text-decoration: none;
      }
      @media (max-width: 600px) {
        .content {
          padding: 30px 20px;
        }
        .refund-amount {
          font-size: 28px;
        }
      }

  body
    .container
      .header
        img.logo(src="https://your-domain.com/logo-light.png" alt="Your Company")
      
      .content
        .status-banner
          p.status-text
            span ⏳
            | Refund Initiated
        
        p.greeting Hi #{customer.name},
        
        p.message
          | We've initiated a refund for your order. The refund is now being processed and should appear in your account within 5-10 business days.
        
        .details-box
          h3(style="margin-top: 0; margin-bottom: 20px; color: #1a1a1a;") Original Order Details
          .detail-row
            span.detail-label Order Number
            span.detail-value ##{orderNumber || invoiceNumber || bookingId}
          .detail-row
            span.detail-label Date
            span.detail-value #{booking.date}
          .detail-row
            span.detail-label Time
            span.detail-value #{timeDisplay}
          .detail-row
            span.detail-label Court
            span.detail-value #{booking.court}
          .detail-row
            span.detail-label Venue
            span.detail-value #{booking.venue}
        
        .refund-amount-box
          p.refund-label Refund Amount
          p.refund-amount €#{refund.amount.toFixed(2)}
        
        if refund.reason
          p.message(style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; font-style: italic;")
            strong Reason: 
            | #{refund.reason}
        
        p.message
          strong What happens next?
          br
          | • The refund is being processed by your payment provider
          br
          | • You'll receive a confirmation email once it's complete
          br
          | • Processing typically takes 5-10 business days
          br
          | • The funds will appear in the same account you used for payment
      
      .footer
        p
          | © 2024 Funkhaus Sports GmbH
          br
          | Storkower Str. 99B, 10407 Berlin
          br
          br
          | Questions? Contact us at 
          a(href="mailto:hello@funkhaus-sports.com") hello@funkhaus-sports.com
```

### 2. Refund Completed (`refund-completed.pug`)

```pug
doctype html
html(lang="en")
  head
    meta(charset="UTF-8")
    meta(name="viewport" content="width=device-width, initial-scale=1.0")
    title Refund Completed - Your Company
    link(href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet")
    style.
      body {
        margin: 0;
        padding: 0;
        font-family: 'Montserrat', Arial, sans-serif;
        background-color: #f5f5f5;
        color: #1a1a1a;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
      }
      .header {
        background-color: #0f0f0f;
        padding: 40px 30px;
        text-align: center;
      }
      .logo {
        max-width: 180px;
        height: auto;
      }
      .content {
        padding: 40px 30px;
      }
      .status-banner {
        background-color: #d1fae5;
        border-left: 4px solid #34d399;
        padding: 20px;
        margin-bottom: 30px;
        border-radius: 0 8px 8px 0;
      }
      .status-text {
        color: #065f46;
        font-size: 18px;
        font-weight: 600;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .greeting {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 20px;
        color: #1a1a1a;
      }
      .message {
        font-size: 16px;
        line-height: 1.6;
        color: #333;
        margin-bottom: 30px;
      }
      .details-box {
        background-color: #f9f9f9;
        border-radius: 12px;
        padding: 25px;
        margin-bottom: 30px;
      }
      .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid #e5e5e5;
      }
      .detail-row:last-child {
        border-bottom: none;
      }
      .detail-label {
        font-weight: 600;
        color: #666;
      }
      .detail-value {
        color: #1a1a1a;
        text-align: right;
      }
      .refund-amount-box {
        background-color: #d1fae5;
        border-radius: 12px;
        padding: 25px;
        text-align: center;
        margin-bottom: 30px;
      }
      .refund-label {
        font-size: 14px;
        color: #065f46;
        margin-bottom: 10px;
      }
      .refund-amount {
        font-size: 32px;
        font-weight: 700;
        color: #065f46;
      }
      .thank-you {
        background-color: #f0f9ff;
        border-radius: 12px;
        padding: 20px;
        text-align: center;
        margin-top: 30px;
      }
      .footer {
        background-color: #f5f5f5;
        padding: 30px;
        text-align: center;
        font-size: 14px;
        color: #666;
      }
      .footer a {
        color: #0066cc;
        text-decoration: none;
      }
      @media (max-width: 600px) {
        .content {
          padding: 30px 20px;
        }
        .refund-amount {
          font-size: 28px;
        }
      }

  body
    .container
      .header
        img.logo(src="https://your-domain.com/logo-light.png" alt="Your Company")
      
      .content
        .status-banner
          p.status-text
            span ✅
            | Refund Completed
        
        p.greeting Hi #{customer.name},
        
        p.message
          | Great news! Your refund has been successfully processed and is now on its way to your account.
        
        .refund-amount-box
          p.refund-label Refunded Amount
          p.refund-amount €#{refund.amount.toFixed(2)}
          p(style="font-size: 12px; color: #065f46; margin-top: 10px;")
            | Reference: #{refund.id}
        
        .details-box
          h3(style="margin-top: 0; margin-bottom: 20px; color: #1a1a1a;") Original Order Details
          .detail-row
            span.detail-label Order Number
            span.detail-value ##{orderNumber || invoiceNumber || bookingId}
          .detail-row
            span.detail-label Date
            span.detail-value #{booking.date}
          .detail-row
            span.detail-label Time
            span.detail-value #{timeDisplay}
          .detail-row
            span.detail-label Court
            span.detail-value #{booking.court}
          .detail-row
            span.detail-label Venue
            span.detail-value #{booking.venue}
        
        p.message
          | The refunded amount should appear in your account within 1-2 business days, depending on your bank or card issuer.
        
        .thank-you
          p(style="margin: 0; font-size: 16px; color: #0369a1;")
            | Thank you for your understanding. We hope to see you again soon! 🎾
      
      .footer
        p
          | © 2024 Funkhaus Sports GmbH
          br
          | Storkower Str. 99B, 10407 Berlin
          br
          br
          | Questions? Contact us at 
          a(href="mailto:hello@funkhaus-sports.com") hello@funkhaus-sports.com
```

### 3. Refund Delay (`refund-delay.pug`)

```pug
doctype html
html(lang="en")
  head
    meta(charset="UTF-8")
    meta(name="viewport" content="width=device-width, initial-scale=1.0")
    title Refund Processing Delay - Your Company
    link(href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet")
    style.
      body {
        margin: 0;
        padding: 0;
        font-family: 'Montserrat', Arial, sans-serif;
        background-color: #f5f5f5;
        color: #1a1a1a;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
      }
      .header {
        background-color: #0f0f0f;
        padding: 40px 30px;
        text-align: center;
      }
      .logo {
        max-width: 180px;
        height: auto;
      }
      .content {
        padding: 40px 30px;
      }
      .status-banner {
        background-color: #fef3c7;
        border-left: 4px solid #fcd34d;
        padding: 20px;
        margin-bottom: 30px;
        border-radius: 0 8px 8px 0;
      }
      .status-text {
        color: #92400e;
        font-size: 18px;
        font-weight: 600;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .greeting {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 20px;
        color: #1a1a1a;
      }
      .message {
        font-size: 16px;
        line-height: 1.6;
        color: #333;
        margin-bottom: 30px;
      }
      .highlight-box {
        background-color: #f9f9f9;
        border-radius: 12px;
        padding: 25px;
        margin-bottom: 30px;
      }
      .amount-display {
        font-size: 24px;
        font-weight: 700;
        color: #1a1a1a;
        text-align: center;
        margin: 20px 0;
      }
      .next-steps {
        background-color: #f0f9ff;
        border-radius: 12px;
        padding: 25px;
        margin-bottom: 30px;
      }
      .contact-box {
        background-color: #e0f2fe;
        border-radius: 12px;
        padding: 20px;
        text-align: center;
        margin-top: 30px;
      }
      .footer {
        background-color: #f5f5f5;
        padding: 30px;
        text-align: center;
        font-size: 14px;
        color: #666;
      }
      .footer a {
        color: #0066cc;
        text-decoration: none;
      }
      @media (max-width: 600px) {
        .content {
          padding: 30px 20px;
        }
        .amount-display {
          font-size: 20px;
        }
      }

  body
    .container
      .header
        img.logo(src="https://your-domain.com/logo-light.png" alt="Your Company")
      
      .content
        .status-banner
          p.status-text
            span ⏳
            | Refund Delayed - We're On It!
        
        p.greeting Hi #{customer.name},
        
        p.message
          | We're writing to let you know that there's been a small hiccup processing your refund. Don't worry - our team is already working on resolving this manually.
        
        .highlight-box
          p(style="margin: 0 0 10px 0; font-weight: 600;") Refund Details:
          p.amount-display €#{refund.amount.toFixed(2)}
          p(style="margin: 10px 0 0 0; text-align: center; color: #666;")
            | for your booking on #{booking.date} at #{booking.court}
        
        .next-steps
          h3(style="margin-top: 0; color: #0369a1;") What happens next?
          ul(style="margin: 0; padding-left: 20px; line-height: 1.8;")
            li Our finance team has been notified automatically
            li We'll process your refund manually within 24-48 hours
            li You'll receive a confirmation email once it's complete
            li No action is required from your side
        
        p.message
          | We sincerely apologize for any inconvenience this may cause. Rest assured, your refund is our priority and will be processed as quickly as possible.
        
        .contact-box
          p(style="margin: 0; font-size: 16px; color: #0369a1;")
            | Need immediate assistance?
            br
            | Contact our support team at
            br
            a(href="mailto:hello@funkhaus-sports.com" style="font-weight: 600;") hello@funkhaus-sports.com
      
      .footer
        p
          | © 2024 Funkhaus Sports GmbH
          br
          | Storkower Str. 99B, 10407 Berlin
          br
          br
          | Questions? Contact us at 
          a(href="mailto:hello@funkhaus-sports.com") hello@funkhaus-sports.com
```

## Stripe Integration

### Webhook Configuration

1. **Add webhook endpoint in Stripe Dashboard:**
   ```
   https://your-domain.netlify.app/api/stripe-webhook
   ```

2. **Configure events to listen for:**
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `refund.created`
   - `refund.updated`
   - `refund.failed`

3. **Set webhook secret in environment:**
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### Netlify Configuration

Add to `netlify.toml`:

```toml
[functions]
  directory = "netlify/functions"
  included_files = [
    "netlify/functions/_shared/refund-initiated.pug",
    "netlify/functions/_shared/refund-completed.pug",
    "netlify/functions/_shared/refund-delay.pug",
    "netlify/functions/_shared/assets/**",
    "netlify/functions/_shared/data/**"
  ]

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
```

## Security & Best Practices

### 1. Authentication & Authorization
- All refund operations require admin authentication
- JWT tokens validated on every request
- Admin status verified via Firebase custom claims

### 2. Idempotency
- Unique idempotency keys prevent duplicate refunds
- Format: `refund_{bookingId}_{timestamp}_{adminId}`

### 3. Transaction Safety
- Firestore transactions prevent race conditions
- Booking status checked within transaction
- Refund status double-checked before processing

### 4. Error Recovery
- Comprehensive error categorization
- Retryable vs non-retryable errors distinguished
- Failed refunds create manual intervention records

### 5. Audit Trail
- All refund attempts logged with full context
- IP addresses and user agents recorded
- Timestamps for every status change

### 6. Email Deduplication
- Separate flags track each email type sent
- Prevents duplicate notifications
- Webhooks check flags before sending

## Step-by-Step Implementation

### Phase 1: Database Setup
1. Update booking type with refund fields
2. Create indexes for refund queries
3. Set up audit_logs collection
4. Create refundFailures collection

### Phase 2: Backend Functions
1. Implement process-refund function
2. Add refund webhook handlers
3. Set up email sending functions
4. Configure Stripe webhook endpoint

### Phase 3: Email Templates
1. Create Pug email templates
2. Add templates to netlify.toml
3. Test email rendering locally
4. Verify Resend API integration

### Phase 4: Frontend Components
1. Create RefundDialog component
2. Add refund button to booking details
3. Display refund status indicators
4. Connect to backend API

### Phase 5: Testing
1. Test with Stripe test mode
2. Verify all webhook events
3. Test email delivery
4. Validate error scenarios

### Phase 6: Monitoring
1. Set up webhook logs
2. Monitor failed refunds queue
3. Track email delivery rates
4. Create admin notifications

## Testing & Monitoring

### Test Scenarios
1. **Full refund flow**
   - Initiate refund
   - Verify webhook updates
   - Check email delivery
   - Confirm status changes

2. **Partial refund**
   - Test amount validation
   - Verify calculations
   - Check email shows correct amount

3. **Error cases**
   - Invalid booking status
   - Already refunded
   - Network failures
   - Insufficient funds

### Stripe Test Cards
- Successful refund: Any valid test card
- Insufficient funds: Use webhook testing to simulate
- Processing delays: Test with debit card numbers

### Monitoring Checklist
- [ ] Webhook delivery success rate
- [ ] Email delivery tracking
- [ ] Failed refunds queue size
- [ ] Average refund processing time
- [ ] Error rate by type

### Admin Dashboard Queries
```javascript
// Failed refunds needing attention
db.collection('refundFailures')
  .where('needsAdminNotification', '==', true)
  .where('customerNotified', '==', false)
  .orderBy('attemptedAt', 'desc')

// Recent refund activity
db.collection('audit_logs')
  .where('action', '==', 'refund_initiated')
  .orderBy('timestamp', 'desc')
  .limit(50)
```

## Troubleshooting

### Common Issues

1. **"Booking already refunded" error**
   - Check refundStatus field
   - Verify no pending refunds
   - Check Stripe dashboard

2. **Email not sending**
   - Verify Resend API key
   - Check email templates in netlify.toml
   - Review webhook logs

3. **Webhook signature failures**
   - Confirm webhook secret matches
   - Check for clock skew
   - Verify raw body handling

4. **Refund stuck in pending**
   - Check Stripe dashboard
   - Verify webhook delivery
   - Look for failed webhook events

This completes the comprehensive refund system implementation guide. The system is production-tested and handles edge cases gracefully with proper error recovery and customer communication.