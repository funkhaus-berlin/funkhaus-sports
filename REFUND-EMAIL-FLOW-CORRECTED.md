# Corrected Refund Email Flow

## Understanding Stripe Webhook Events

### Key Events:
1. **`refund.created`** - Fires when a refund is initiated
   - For instant refunds (most cards): status = 'succeeded'
   - For delayed refunds: status = 'pending'

2. **`charge.refunded`** - Fires when a charge is refunded
   - For instant refunds: Fires immediately after refund.created
   - For delayed refunds: Fires when refund completes

3. **`charge.refund.updated`** - Fires when refund status changes
   - Only updates booking status, no emails sent

## Email Logic

### In `handleRefundCreated`:
```
if (refund.status === 'pending' || refund.status === 'requires_action') {
  // Send "Refund Initiated" email
} else if (refund.status === 'succeeded') {
  // Send "Refund Completed" email (instant refund)
}
```

### In `handleChargeRefunded`:
```
if (!booking.refundCompletedEmailSent) {
  // Send "Refund Completed" email (for delayed refunds that weren't instant)
}
```

## Scenarios

### Instant Refund (Most Card Payments):
1. Admin initiates refund
2. `refund.created` fires with status='succeeded'
   → Sends "Refund Completed" email
3. `charge.refunded` fires
   → Skips email (already sent)

### Delayed Refund (Some Payment Methods):
1. Admin initiates refund
2. `refund.created` fires with status='pending'
   → Sends "Refund Initiated" email
3. Later, `charge.refund.updated` fires when status changes
   → Updates status only, no email
4. `charge.refunded` fires when refund completes
   → Sends "Refund Completed" email

## Benefits
- Customers get appropriate emails based on refund timing
- No duplicate emails
- Clear status communication
- Handles both instant and delayed refunds correctly