/**
 * Booking progress related type definitions
 */
import { BookingError, BookingErrorField } from './errors'

/**
 * Steps in the booking process
 */
export enum BookingStep {
  Date = 1,
  Time = 2,
  Duration = 3,
  Court = 4,
  Payment = 5,
}

/**
 * Step information for display and tracking
 */
export interface BookingStepInfo {
  step: BookingStep
  label: string
  icon: string
}

/**
 * Booking progress state
 */
export interface BookingProgressState {
  currentStep: number
  maxStepReached: number
  expandedSteps: number[]
  steps: BookingStepInfo[]
  currentError: BookingError | null
  fieldErrors: Record<string, string>
}

/**
 * Form validation result
 */
export interface FormValidationResult {
  isValid: boolean
  errors?: BookingErrorField[]
}