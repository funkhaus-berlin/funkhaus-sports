import { Handler, HandlerEvent } from '@netlify/functions'
import { adminAuth, db } from './_shared/firebase-admin'
import stripe from './_shared/stripe'
import { corsHeaders } from './_shared/cors'
import { Booking } from './types/shared-types'
import type { Stripe } from 'stripe'
import { renderFile } from 'pug'
import { resolve } from 'path'
import resend from './_shared/resend'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

// Set up dayjs plugins
dayjs.extend(utc)
dayjs.extend(timezone)

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
    if (booking.refundStatus === 'refunded' || booking.refundStatus === 'partially_refunded') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Booking has already been refunded' }),
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
    
    // Create refund in Stripe
    const refund = await stripe.refunds.create({
      payment_intent: booking.paymentIntentId,
      amount: refundAmount,
      reason: reason === 'requested_by_customer' || reason === 'duplicate' || reason === 'fraudulent' 
        ? reason as Stripe.RefundCreateParams.Reason 
        : 'requested_by_customer',
      metadata: {
        bookingId: bookingId,
        adminId: decodedToken.uid,
        adminEmail: decodedToken.email ?? '',
        refundReason: reason || 'Admin initiated refund',
      },
    })

    // Update booking in Firestore based on refund status
    const isPartialRefund = refundAmount < chargeAmount
    const updateData: any = {
      refundId: refund.id,
      refundStatus: refund.status, // Use actual refund status from Stripe
      refundAmount: refundAmount / 100, // Convert back to currency units
      refundCreatedAt: new Date().toISOString(),
      refundReason: reason || 'Admin initiated refund',
      refundedBy: decodedToken.uid,
      refundedByEmail: decodedToken.email ?? '',
      updatedAt: new Date().toISOString(),
    }
    
    // Only mark as cancelled and refunded if the refund succeeded immediately
    if (refund.status === 'succeeded') {
      updateData.status = 'cancelled'
      updateData.refundedAt = new Date().toISOString()
      updateData.cancellationReason = `Refunded: ${reason || 'Admin initiated'}`
    } else if (refund.status === 'pending') {
      // Keep original status, refund is still processing
      console.log(`Refund ${refund.id} is pending, booking status will update when refund completes`)
    }
    
    await bookingRef.update(updateData)

    // Send refund email to customer only if refund succeeded immediately
    if (refund.status === 'succeeded') {
      try {
        await sendRefundEmail(booking, refund, reason)
        console.log('Refund email sent successfully')
      } catch (emailError) {
        console.error('Failed to send refund email:', emailError)
        // Don't fail the refund if email fails - continue with success response
      }
    } else if (refund.status === 'pending') {
      console.log('Refund is pending, email will be sent when refund succeeds via webhook')
    }

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

/**
 * Send refund notification email to customer
 */
async function sendRefundEmail(booking: Booking, refund: any, reason?: string): Promise<void> {
  try {
    // Get court and venue details
    let courtName = 'Court'
    let venueName = 'Funkhaus Sports'
    let venueEmail: string | null = null
    
    if (booking.courtId) {
      const courtDoc = await db.collection('courts').doc(booking.courtId).get()
      if (courtDoc.exists) {
        const courtData = courtDoc.data()
        courtName = courtData?.name || 'Court'
        
        if (courtData?.venueId) {
          const venueDoc = await db.collection('venues').doc(courtData.venueId).get()
          if (venueDoc.exists) {
            const venueData = venueDoc.data()
            venueName = venueData?.name || 'Funkhaus Sports'
            venueEmail = venueData?.email || null
          }
        }
      }
    }
    
    // Format times for display
    const userTimezone = 'Europe/Berlin' // Default timezone
    let startTime = booking.startTime
    let endTime = booking.endTime
    
    // Convert to 24-hour format
    if (startTime && startTime.includes('T')) {
      startTime = dayjs(startTime).tz(userTimezone).format('HH:mm')
    }
    if (endTime && endTime.includes('T')) {
      endTime = dayjs(endTime).tz(userTimezone).format('HH:mm')
    }
    
    const timeDisplay = `${startTime} - ${endTime}`
    
    // Format booking date
    const bookingDate = new Date(booking.date)
    const formattedDate = bookingDate.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    
    // Format refund status for display
    const refundStatusDisplay = refund.status === 'succeeded' ? 'Processing' : 
                               refund.status === 'pending' ? 'Pending' : 
                               'In Progress'
    
    // Render the refund email template
    const html = renderFile(resolve(__dirname, './_shared/refund.pug'), {
      customer: {
        name: booking.userName || 'Customer',
        email: booking.customerEmail || booking.userEmail
      },
      bookingId: booking.id,
      booking: {
        date: formattedDate,
        court: courtName,
        venue: venueName,
        price: booking.price?.toFixed(2) || '0.00'
      },
      timeDisplay,
      refund: {
        amount: (refund.amount / 100).toFixed(2),
        status: refundStatusDisplay,
        id: refund.id,
        reason: reason || 'Admin initiated refund'
      }
    })
    
    // Prepare recipients - customer email + venue CC if available
    const toEmails = [booking.customerEmail || booking.userEmail || '']
    const ccEmails = venueEmail ? [venueEmail] : []
    
    // Send email via Resend
    await resend.emails.send({
      from: 'Funkhaus Sports <ticket@funkhaus-berlin.net>',
      to: toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject: `Funkhaus Sports - Booking Cancelled & Refund Processed - ${formattedDate}`,
      html: html
    })
    
    console.log(`Refund email sent to ${booking.customerEmail || booking.userEmail} with CC to ${venueEmail || 'no venue email'}`)
  } catch (error) {
    console.error('Error sending refund email:', error)
    throw error
  }
}
