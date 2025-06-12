# Funkhaus Sports - Refund System Documentation

## Overview

This document outlines the comprehensive refund handling system for the Funkhaus Sports booking platform. The system follows industry best practices with robust error handling, proper status tracking, and customer-centric communication.

## Architecture

### Core Components

1. **Admin Refund Endpoint** (`/api/process-refund`)
   - Admin-initiated refunds with authorization checks
   - Firestore transactions to prevent race conditions
   - Idempotency keys for Stripe operations
   - Comprehensive audit logging

2. **Webhook Handler** (`/api/stripe-webhook`)
   - Processes Stripe refund events
   - Handles all refund states (pending, succeeded, failed, etc.)
   - Sends appropriate notifications based on status

3. **Email Templates**
   - `refund.pug` - Successful refund confirmation
   - `refund-delay.pug` - Failed/delayed refund notification

## Refund Status Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Created   │────▶│  Pending    │────▶│  Succeeded  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                     │
                           ▼                     ▼
                    ┌─────────────┐       ┌─────────────┐
                    │   Failed    │       │  Cancelled  │
                    └─────────────┘       └─────────────┘
```

### Status Definitions

- **pending**: Refund initiated but not yet processed by payment provider
- **processing**: Refund is being processed (rarely used by Stripe)
- **succeeded**: Refund completed successfully
- **failed**: Refund failed and requires manual intervention
- **canceled**: Refund was canceled before completion
- **requires_action**: Customer action required (for certain payment methods)

## Security Features

### Authentication & Authorization
- JWT token validation for all admin endpoints
- Admin role verification
- IP address and user agent logging
- Comprehensive audit trail

### Race Condition Prevention
```typescript
// Firestore transaction ensures atomic updates
await db.runTransaction(async (transaction) => {
  // Re-fetch and validate within transaction
  // Create idempotency key
  // Process refund
  // Update booking atomically
})
```

### Idempotency
- Unique idempotency keys for each refund attempt
- Format: `refund_{bookingId}_{timestamp}_{userId}`
- Prevents duplicate refunds from multiple admin clicks

## Error Handling

### Retryable Errors
- `insufficient_funds` - Retry when balance available
- `processing_error` - Transient Stripe error
- `api_error` - Stripe API issues
- `rate_limit_error` - Too many requests
- `bank_timeout` - Banking network issues

### Non-Retryable Errors
- Invalid payment intent
- Already refunded
- Disputed charges
- Closed bank accounts

### Failed Refund Handling
1. Log to `refundFailures` collection
2. Send delay notification to customer
3. Create admin alert for manual intervention
4. Track resolution status

## Email Notifications

### Refund Success Email
- **When**: Refund status changes to `succeeded`
- **To**: Customer
- **CC**: Venue email (if configured)
- **Content**: Confirmation, timeline, booking details

### Refund Delay Email
- **When**: Refund fails or requires manual processing
- **To**: Customer
- **Content**: Explanation, expected timeline, support contact

### Email Timing Rules
- Never send confirmation for `pending` refunds
- Wait for `succeeded` status before confirming
- Send delay notification immediately on failure

## Webhook Events

### Handled Events
1. **charge.refunded** - Primary refund event
2. **charge.refund.updated** - Status updates
3. **refund.created** - New refund created
4. **refund.failed** - Refund failure

### Event Processing
```typescript
// Deduplication check
if (await checkEventProcessed(event.id)) {
  return { alreadyProcessed: true }
}

// Process based on type
switch(event.type) {
  case 'refund.created':
    // Update status, don't send email yet
  case 'charge.refund.updated':
    // Handle status transitions
  case 'refund.failed':
    // Log failure, notify customer
}

// Mark as processed
await markEventProcessed(event.id)
```

## Refund Policies

### Policy Types
1. **Flexible** - Full refund up to 24 hours before
2. **Moderate** - Graduated refunds (48h: 100%, 24h: 75%, 12h: 50%)
3. **Strict** - 72 hours required for full refund

### Force Majeure
Always allow refunds for:
- Venue closure
- Weather cancellation
- Technical issues

## Database Schema

### Booking Fields
```typescript
{
  // Refund tracking
  refundId?: string
  refundStatus?: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'requires_action'
  refundAmount?: number
  refundReason?: string
  
  // Timestamps
  refundCreatedAt?: string
  refundedAt?: string  // When succeeded
  refundFailedAt?: string
  refundCanceledAt?: string
  
  // Metadata
  refundedBy?: string  // Admin user ID
  refundedByEmail?: string
  refundFailureReason?: string
  refundRequiresAction?: boolean
}
```

### Audit Log
```typescript
{
  action: 'refund_initiated'
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
  timestamp: Timestamp
  venueId: string
  customerId: string
  idempotencyKey: string
}
```

### Refund Failures Collection
```typescript
{
  bookingId: string
  refundId: string
  amount: number
  failureReason: string
  customerEmail: string
  timestamp: Timestamp
  needsManualIntervention: boolean
  retryable: boolean
  customerNotified: boolean
  adminNotified: boolean
  resolved: boolean
  resolvedAt?: string
  resolvedBy?: string
}
```

## Best Practices

### DO's
- ✅ Always use transactions for critical updates
- ✅ Send emails only after refund succeeds
- ✅ Log all actions with audit trails
- ✅ Use idempotency keys for all Stripe operations
- ✅ Handle all possible webhook events
- ✅ Provide clear customer communication
- ✅ Track failed refunds for manual resolution

### DON'Ts
- ❌ Don't mark booking as cancelled until refund succeeds
- ❌ Don't send success emails for pending refunds
- ❌ Don't retry non-retryable errors
- ❌ Don't expose internal errors to customers
- ❌ Don't process the same webhook twice
- ❌ Don't allow multiple concurrent refund attempts

## Testing

### Test Scenarios
1. **Happy Path**: Successful immediate refund
2. **Pending Refund**: Bank processing delay
3. **Failed Refund**: Insufficient funds
4. **Race Condition**: Multiple admins clicking refund
5. **Webhook Replay**: Same event sent multiple times

### Stripe Test Cards
- Success: `4242 4242 4242 4242`
- Insufficient Funds: `4000 0000 0000 9995`
- Processing Error: `4000 0000 0000 0119`

## Monitoring & Alerts

### Key Metrics
- Refund success rate
- Average processing time
- Failed refund count
- Manual intervention queue size

### Alert Conditions
- Refund failure rate > 5%
- Failed refund unresolved > 24 hours
- Webhook processing errors
- High refund volume (potential abuse)

## Customer Support Playbook

### Common Issues

1. **"Where is my refund?"**
   - Check refund status in booking
   - Verify refund was initiated
   - Provide timeline based on payment method

2. **"Refund failed"**
   - Check `refundFailures` collection
   - Verify bank account status
   - Process manual refund if needed

3. **"Partial refund received"**
   - Check if booking was partially refunded
   - Verify refund amount matches policy
   - Explain venue refund policy

### Manual Refund Process
1. Verify customer identity
2. Check booking eligibility
3. Use admin panel to initiate refund
4. Monitor status in Stripe dashboard
5. Follow up with customer

## Future Enhancements

1. **Self-Service Refunds**
   - Customer-initiated cancellations
   - Automatic policy application
   - Instant refund estimates

2. **Bulk Refund System**
   - Weather cancellations
   - Venue emergencies
   - Batch processing UI

3. **Advanced Analytics**
   - Refund patterns by venue
   - Cancellation trends
   - Policy effectiveness metrics

4. **Multi-Currency Support**
   - Handle different currencies
   - Exchange rate considerations
   - Localized communications