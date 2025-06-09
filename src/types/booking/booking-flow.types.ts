/**
 * Booking flow type definitions
 * Frontend is the source of truth for these types
 */

// Define booking flow type enumeration
export enum BookingFlowType {
	DATE_COURT_TIME_DURATION = 'date_court_time_duration',
	DATE_TIME_DURATION_COURT = 'date_time_duration_court',
	DATE_TIME_COURT_DURATION = 'date_time_court_duration',
}

// Updated interface for step objects
export type StepLabel = 'Date' | 'Court' | 'Time' | 'Duration' | 'Payment'

export interface BookingFlowStep {
	step: number
	label: StepLabel
	icon: string
}

export type BookingFlowConfig = BookingFlowStep[]

/**
 * Interface for court selection preferences
 * Used to filter courts in the court selection step
 */
export interface CourtPreferences {
	courtTypes?: import('./court.types').CourtTypeEnum[] // Indoor/outdoor preferences
	sportTypes?: import('./court.types').SportTypeEnum[] // Sport preferences
	playerCount?: number // Number of players (2, 4, 6+)
	amenities?: string[] // Required amenities
}
