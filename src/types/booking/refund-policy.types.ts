/**
 * Refund policy types for venues
 */

export type RefundCondition = 
  | 'hours_before_booking'
  | 'weather_cancellation'
  | 'venue_closure'
  | 'no_show'
  | 'technical_issue'

export interface RefundRule {
  id: string
  condition: RefundCondition
  threshold?: number // Hours before booking for time-based rules
  refundPercentage: number // 0-100
  automatic: boolean // If true, refund is processed automatically
  requiresApproval: boolean // If true, requires admin approval
  description?: string
}

export interface RefundPolicy {
  id: string
  venueId: string
  name: string
  description?: string
  rules: RefundRule[]
  isActive: boolean
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface RefundEligibility {
  eligible: boolean
  percentage: number
  automatic: boolean
  reason: string
  rule?: RefundRule
  requiresApproval: boolean
}

// Default refund policies that venues can use as templates
export const DEFAULT_REFUND_POLICIES = {
  flexible: {
    name: 'Flexible Policy',
    description: 'Full refund up to 24 hours before booking',
    rules: [
      {
        id: '1',
        condition: 'hours_before_booking' as RefundCondition,
        threshold: 24,
        refundPercentage: 100,
        automatic: true,
        requiresApproval: false,
        description: 'Full refund if cancelled 24+ hours before'
      },
      {
        id: '2',
        condition: 'hours_before_booking' as RefundCondition,
        threshold: 12,
        refundPercentage: 50,
        automatic: true,
        requiresApproval: false,
        description: '50% refund if cancelled 12-24 hours before'
      }
    ]
  },
  moderate: {
    name: 'Moderate Policy',
    description: 'Graduated refunds based on cancellation time',
    rules: [
      {
        id: '1',
        condition: 'hours_before_booking' as RefundCondition,
        threshold: 48,
        refundPercentage: 100,
        automatic: true,
        requiresApproval: false,
        description: 'Full refund if cancelled 48+ hours before'
      },
      {
        id: '2',
        condition: 'hours_before_booking' as RefundCondition,
        threshold: 24,
        refundPercentage: 75,
        automatic: true,
        requiresApproval: false,
        description: '75% refund if cancelled 24-48 hours before'
      },
      {
        id: '3',
        condition: 'hours_before_booking' as RefundCondition,
        threshold: 12,
        refundPercentage: 50,
        automatic: true,
        requiresApproval: false,
        description: '50% refund if cancelled 12-24 hours before'
      }
    ]
  },
  strict: {
    name: 'Strict Policy',
    description: 'Limited refunds, more restrictive',
    rules: [
      {
        id: '1',
        condition: 'hours_before_booking' as RefundCondition,
        threshold: 72,
        refundPercentage: 100,
        automatic: true,
        requiresApproval: false,
        description: 'Full refund if cancelled 72+ hours before'
      },
      {
        id: '2',
        condition: 'hours_before_booking' as RefundCondition,
        threshold: 48,
        refundPercentage: 50,
        automatic: false,
        requiresApproval: true,
        description: '50% refund if cancelled 48-72 hours before (requires approval)'
      }
    ]
  }
}

// Special circumstances that always allow refunds
export const FORCE_MAJEURE_CONDITIONS = [
  'venue_closure',
  'weather_cancellation',
  'technical_issue'
]