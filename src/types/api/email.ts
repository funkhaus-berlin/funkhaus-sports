/**
 * Email API interface definitions
 */
import { Address } from '../booking/models'

/**
 * Common address type that can be a string or structured object
 * Used in email templates
 */
export type AddressType = string | {
  street: string
  city?: string
  postalCode?: string
  country?: string
}

/**
 * Venue information included in email
 */
export interface VenueInfo {
  name: string
  address: AddressType
  city?: string
  postalCode?: string
  country?: string
}

/**
 * Booking details included in email
 */
export interface EmailBookingDetails {
  date: string
  startTime: string
  endTime: string
  price: string
  court: string
  venue: string
}

/**
 * Customer information included in email
 */
export interface EmailCustomerInfo {
  name: string
  email: string
  phone: string
}

/**
 * Calendar event data for email templates
 */
export interface CalendarEvent {
  title: string
  description: string
  location: string
  startTime: string
  endTime: string
  startDate?: string
  googleStartDate?: string
  googleEndDate?: string
  uid?: string
  displayStartTime?: string
  displayEndTime?: string
  displayTimeRange?: string
}

/**
 * Request structure for booking email API
 */
export interface BookingEmailRequest {
  bookingId: string
  customerEmail: string
  customerName: string
  customerPhone: string
  venueInfo: VenueInfo
  bookingDetails: EmailBookingDetails
  invoiceNumber?: string // Invoice number (optional, should be generated during payment processing)
}

/**
 * Response structure for booking email API
 */
export interface BookingEmailResponse {
  success: boolean
  message?: string
  error?: string
}

/**
 * Request structure for checking email status
 */
export interface CheckEmailStatusRequest {
  bookingId: string
}

/**
 * Response structure for checking email status
 */
export interface CheckEmailStatusResponse {
  success: boolean
  emailSent: boolean
  emailSentAt: string
  error?: string
}