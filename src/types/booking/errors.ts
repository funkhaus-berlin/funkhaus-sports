/**
 * Error-related type definitions for the booking system
 */

/**
 * Categories of booking errors
 */
export enum ErrorCategory {
  VALIDATION = 'validation',
  PAYMENT = 'payment',
  NETWORK = 'network',
  AVAILABILITY = 'availability',
  SYSTEM = 'system',
}

/**
 * Field-specific error information
 */
export interface BookingErrorField {
  field: string
  message: string
}

/**
 * Standardized booking error structure
 */
export interface BookingError {
  message: string
  category: ErrorCategory
  code?: string
  timestamp: number
  fieldErrors?: BookingErrorField[]
  isDismissible?: boolean
}

/**
 * Validation error response from API
 */
export interface ValidationErrorResponse {
  error: string
  fields: BookingErrorField[]
}

/**
 * Payment error response from API
 */
export interface PaymentErrorResponse {
  error: string
  code: string
  message: string
}

/**
 * System error response from API
 */
export interface SystemErrorResponse {
  error: string
  message: string
}

/**
 * Helper type for all possible error responses
 */
export type ErrorResponse = ValidationErrorResponse | PaymentErrorResponse | SystemErrorResponse