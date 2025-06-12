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
      // This ensures the webhook will have access to the refund reason
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
        venueId: booking.venueId,
        customerId: booking.userId,
        idempotencyKey: idempotencyKey
      })
      
      return stripeRefund
    })

    // Update booking in Firestore based on refund status
    const updateData: any = {
      refundId: refund.id,
      refundStatus: refund.status, // Use actual refund status from Stripe
      refundAmount: refundAmount / 100, // Convert back to currency units
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
      // Don't mark email as sent here - let the webhook handle it
    } else if (refund.status === 'pending') {
      // Keep original status, refund is still processing
      console.log(`Refund ${refund.id} is pending, booking status will update when refund completes`)
    }
    
    await bookingRef.update(updateData)

    // Don't send emails from process-refund - let webhooks handle all email sending
    console.log('Refund initiated, emails will be sent via webhooks')

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
    
    let errorMessage = 'Failed to process refund'
    let errorCode = 'unknown_error'
    let statusCode = 500
    
    // Handle Stripe-specific errors
    if (error.type === 'StripeCardError') {
      // Card errors are the most common errors during refunds
      statusCode = 400
      errorCode = error.code || 'card_error'
      
      switch (error.code) {
        case 'charge_already_refunded':
          errorMessage = 'This charge has already been fully refunded'
          break
        case 'insufficient_funds':
          // This happens when merchant account has insufficient funds for refund
          errorMessage = 'Unable to process refund due to insufficient funds. Please contact support.'
          statusCode = 503 // Service unavailable
          break
        default:
          errorMessage = error.message || 'Card error during refund'
      }
    } else if (error.type === 'StripeInvalidRequestError') {
      statusCode = 400
      errorCode = error.code || 'invalid_request'
      
      switch (error.code) {
        case 'charge_already_refunded':
          errorMessage = 'This payment has already been refunded'
          break
        case 'payment_intent_unexpected_state':
          errorMessage = 'Payment is in an invalid state for refund'
          break
        case 'amount_too_large':
          errorMessage = 'Refund amount exceeds the original charge'
          break
        case 'charge_disputed':
          errorMessage = 'Cannot refund a payment that is currently disputed'
          break
        default:
          errorMessage = error.message || 'Invalid refund request'
      }
    } else if (error.type === 'StripeAPIError') {
      // API errors, including rate limiting
      statusCode = 503
      errorCode = 'api_error'
      errorMessage = 'Stripe service temporarily unavailable. Please try again later.'
    } else if (error.type === 'StripeConnectionError') {
      // Network communication errors
      statusCode = 503
      errorCode = 'connection_error'
      errorMessage = 'Network error. Please check your connection and try again.'
    } else if (error.type === 'StripeAuthenticationError') {
      // Authentication with Stripe API failed
      statusCode = 500
      errorCode = 'authentication_error'
      errorMessage = 'Authentication failed. Please contact support.'
      
      // Log critical error
      console.error('Stripe authentication error - check API keys')
    } else if (error.type === 'StripePermissionError') {
      // Access to a resource is not allowed
      statusCode = 403
      errorCode = 'permission_error'
      errorMessage = 'Permission denied for this operation'
    } else if (error.type === 'StripeRateLimitError') {
      // Too many requests hit the API too quickly
      statusCode = 429
      errorCode = 'rate_limit'
      errorMessage = 'Too many requests. Please try again in a moment.'
    } else if (error.type === 'StripeIdempotencyError') {
      // Idempotency error - different request with same idempotency key
      statusCode = 400
      errorCode = 'idempotency_error'
      errorMessage = 'Duplicate request detected. Please try with a new request.'
    } else if (error instanceof Error) {
      // Generic JavaScript error
      errorMessage = error.message
    }
    
    // Log detailed error for debugging
    console.error('Refund error details:', {
      type: error.type,
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
    })

    return {
      statusCode,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: false, 
        error: errorMessage,
        errorCode,
        // Include retry hint for transient errors
        canRetry: statusCode === 503 || statusCode === 429 || errorCode === 'connection_error'
      }),
    }
  }
}

// Email sending is now handled by webhooks only
// The refund.created webhook will send the initial refund notification
// The charge.refunded webhook will send the completion confirmation
