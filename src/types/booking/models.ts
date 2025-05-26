/**
 * Core booking-related type definitions
 * Frontend is the source of truth for these types
 */

/**
 * Firebase Firestore Timestamp interface
 * Used for date/time fields stored in Firestore
 */
export interface FirestoreTimestamp {
	seconds: number
	nanoseconds: number
	toDate: () => Date
	toMillis: () => number
	valueOf: () => string
}

/**
 * Booking status types
 * - holding: Temporary hold while user completes payment (prevents double-booking)
 * - confirmed: Payment successful, booking is active
 * - completed: User checked in / court session finished
 * - cancelled: Booking cancelled (payment failed, timeout, or user cancelled)
 */
export type BookingStatus =
	| 'holding'
	| 'confirmed'
	| 'completed'
	| 'cancelled'

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
	userEmail?: string // Added email direct access
	userPhone?: string // Changed from customerPhone for consistency
	courtId: string
	venueId: string
	startTime: string
	endTime: string
	price: number
	date: string
	paymentStatus?: string
	status: BookingStatus
	paymentIntentId?: string
	customerEmail?: string // Keeping for backward compatibility
	customerPhone?: string // Made optional for consistency
	customerAddress?: Address // Made optional for consistency
	createdAt?: string
	updatedAt?: string
	lastActive?: string // ISO string - tracks last user activity for holding status
	emailSent?: boolean
	emailSentAt?: string
	courtPreference?: 'indoor' | 'outdoor'
	invoiceNumber?: string
	invoiceGeneratedAt?: string
	notes?: string // Added for optional booking notes
	recurringBookingId?: string // For recurring bookings
	cancellationReason?: string // Track why bookings are cancelled
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
