/**
 * Schedule and availability API interface definitions
 */

/**
 * Time slot representation
 */
export interface TimeSlot {
  startTime: string
  endTime: string
  available: boolean
  price?: number
}

/**
 * Schedule availability request
 */
export interface ScheduleAvailabilityRequest {
  venueId: string
  courtId?: string
  date: string
  duration?: number
}

/**
 * Slot availability information returned by API
 */
export interface SlotAvailability {
  startTime: string
  endTime: string
  available: boolean
  price: number
}

/**
 * Court availability information
 */
export interface CourtAvailability {
  courtId: string
  courtName: string
  slots: SlotAvailability[]
}

/**
 * Schedule availability response
 */
export interface ScheduleAvailabilityResponse {
  success: boolean
  date: string
  courts: CourtAvailability[]
  error?: string
}

/**
 * Booking recovery request
 */
export interface BookingRecoveryRequest {
  bookingId: string
}

/**
 * Booking recovery response
 */
export interface BookingRecoveryResponse {
  success: boolean
  booking?: {
    id: string
    courtId: string
    venueId: string
    date: string
    startTime: string
    endTime: string
    price: number
    status: string
    customerEmail?: string
    customerName?: string
    customerPhone?: string
  }
  error?: string
}