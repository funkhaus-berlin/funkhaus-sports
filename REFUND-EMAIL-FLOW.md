# Refund Email Flow Implementation

## Overview
The refund process now sends two distinct emails at different stages:

1. **Refund Initiated Email** - Sent when `refund.created` webhook is triggered
2. **Refund Completed Email** - Sent when `charge.refunded` webhook is triggered

## Webhook Flow

### 1. refund.created
- Triggers when a refund is initiated (from process-refund.ts or Stripe dashboard)
- Sends initial notification email via `sendRefundInitiatedEmail()`
- Uses template: `_shared/refund-initiated.pug`
- Tracks with flag: `refundInitiatedEmailSent`

### 2. charge.refund.updated
- Triggers when refund status changes (pending → succeeded)
- Only updates booking status, does NOT send emails
- This prevents duplicate emails

### 3. charge.refunded
- Triggers when refund is completed
- Sends completion confirmation email via `sendRefundCompletionEmail()`
- Uses template: `_shared/refund-completed.pug`
- Tracks with flag: `refundCompletedEmailSent`

## Email Templates

### refund-initiated.pug
- Subject: "Funkhaus Sports - Refund Initiated - [Date]"
- Content: Informs customer that refund has been initiated and is being processed
- Mentions 5-10 business days processing time

### refund-completed.pug
- Subject: "Funkhaus Sports - Refund Completed - [Date]"
- Content: Confirms refund is complete and funds should be available
- Includes refund reference ID

## Database Fields
- `refundInitiatedEmailSent`: Boolean flag for initial email
- `refundInitiatedEmailSentAt`: Timestamp of initial email
- `refundCompletedEmailSent`: Boolean flag for completion email
- `refundCompletedEmailSentAt`: Timestamp of completion email

## Key Changes Made
1. Renamed `sendRefundEmail` to `sendRefundInitiatedEmail` for clarity
2. Created new `sendRefundCompletionEmail` function
3. Removed email sending from `handleRefundUpdated` (charge.refund.updated)
4. Created separate Pug templates for each email type
5. Updated email subjects to be more specific about refund status