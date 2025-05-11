/**
 * Core booking-related type definitions
 * Frontend is the source of truth for these types
 */

/**
 * Booking status types
 */
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no-show'
  | 'refunded'
  | 'failed'
  | 'processing'

/**
 * Address interface used across the application
 */
export interface Address {
  street: string
  city: string
  postalCode: string
  country: string
}

/**
 * Customer information interface
 */
export interface Customer {
  name: string
  email: string
  phone: string
  address: Address
}

/**
 * The core Booking entity that represents a court booking
 */
export interface Booking {
  id: string
  userId: string
  userName: string
  courtId: string
  venueId: string
  startTime: string
  endTime: string
  price: number
  date: string
  paymentStatus?: string
  status: BookingStatus
  paymentIntentId?: string
  customerEmail?: string
  customerPhone: string
  customerAddress: Address
  createdAt?: any // Consider using a more specific type like Date or string
  updatedAt?: any // Consider using a more specific type like Date or string
  emailSent?: boolean
  emailSentAt?: any // Consider using a more specific type like Date or string
  courtPreference?: 'indoor' | 'outdoor'
  invoiceNumber?: string
  invoiceGeneratedAt?: any // Consider using a more specific type like Date or string
}

/**
 * Booking calendar details interface
 * For use with calendar integrations
 */
export interface BookingCalendarDetails {
  title: string
  location: string
  description: string
  startTime: string
  endTime: string
  date: string
  googleStartDate?: string
  googleEndDate?: string
}

/**
 * Booking summary for display purposes
 */
export interface BookingSummary {
  bookingId: string
  court: string
  venue: string
  date: string
  startTime: string
  endTime: string
  price: string | number
  status: BookingStatus
}