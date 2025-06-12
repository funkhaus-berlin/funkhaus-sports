/**
 * Core booking-related type definitions
 * Frontend is the source of truth for these types
 */


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
	emailError?: string // Error message if email failed
	emailFailedAt?: string // When email last failed
	emailRetryCount?: number // Number of retry attempts
	emailPermanentlyFailed?: boolean // True after max retries reached
	emailPermanentlyFailedAt?: string // When marked as permanently failed
	lastRetryAt?: string // Last retry attempt timestamp
	courtPreference?: 'indoor' | 'outdoor'
	invoiceNumber?: string
	invoiceGeneratedAt?: string
	notes?: string // Added for optional booking notes
	recurringBookingId?: string // For recurring bookings
	cancellationReason?: string // Track why bookings are cancelled
	// Refund related fields
	refundId?: string // Stripe refund ID
	refundStatus?: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'requires_action'
	refundAmount?: number // Amount refunded
	refundedAt?: string // When refund was processed
	refundReason?: string // Reason for refund
	refundedBy?: string // Admin user ID who initiated refund
	refundedByEmail?: string // Admin email for tracking
	refundCreatedAt?: string // When refund was created/initiated
	refundFailedAt?: string // When refund failed
	refundFailureReason?: string // Why refund failed
	refundCanceledAt?: string // When refund was canceled
	refundRequiresAction?: boolean // If customer action is required
}


