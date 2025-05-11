/**
 * Payment API interface definitions
 */

/**
 * Request for creating a payment intent
 */
export interface CreatePaymentIntentRequest {
  amount: number
  email: string
  name: string
  phone: string
  address: string
  city: string
  postalCode: string
  country: string
  items: {
    [key: string]: number
  }
  uid: string
  bookingId?: string
  venueId?: string
  courtId?: string
  startTime?: string
  endTime?: string
  date?: string
}

/**
 * Response from creating a payment intent
 */
export interface CreatePaymentIntentResponse {
  success: boolean
  clientSecret?: string
  paymentIntentId?: string
  error?: string
}

/**
 * Request for checking payment status
 */
export interface PaymentStatusRequest {
  paymentIntentId: string
  bookingId?: string
}

/**
 * Response from checking payment status
 */
export interface PaymentStatusResponse {
  success: boolean
  status: 'succeeded' | 'processing' | 'requires_payment_method' | 'requires_confirmation' | 'canceled' | 'requires_action'
  bookingId?: string
  error?: string
}

/**
 * Webhook event data from Stripe
 */
export interface StripeWebhookEvent {
  id: string
  type: string
  data: {
    object: {
      id: string
      status: string
      metadata?: {
        bookingId?: string
        [key: string]: any
      }
      [key: string]: any
    }
  }
}