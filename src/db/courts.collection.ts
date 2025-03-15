import { FirestoreService } from 'src/firebase/firestore.service'

// Enums for better type safety
export type CourtType = 'indoor' | 'outdoor' | 'covered'

export enum CourtTypeEnum {
	INDOOR = 'indoor',
	OUTDOOR = 'outdoor',
	COVERED = 'covered',
}

export type SportType =
	| 'paddleTennis'
	| 'tennis'
	| 'basketball'
	| 'volleyball'
	| 'badminton'
	| 'soccer'
	| 'pickleball'
	| 'squash'
	| 'racquetball'
	| 'other'

export enum SportTypeEnum {
	PADDLE_TENNIS = 'paddleTennis',
	TENNIS = 'tennis',
	BASKETBALL = 'basketball',
	VOLLEYBALL = 'volleyball',
	BADMINTON = 'badminton',
	SOCCER = 'soccer',
	PICKLEBALL = 'pickleball',
	SQUASH = 'squash',
	RACQUETBALL = 'racquetball',
	OTHER = 'other',
}

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export enum DayOfWeekEnum {
	MONDAY = 'monday',
	TUESDAY = 'tuesday',
	WEDNESDAY = 'wednesday',
	THURSDAY = 'thursday',
	FRIDAY = 'friday',
	SATURDAY = 'saturday',
	SUNDAY = 'sunday',
}

// Structured interfaces for better organization
export interface TimeSlot {
	startTime: string
	endTime: string
}

export interface MaintenanceSchedule {
	day: DayOfWeek
	timeSlots: TimeSlot[]
	recurrence?: 'weekly' | 'biweekly' | 'monthly'
	notes?: string
}

export interface Facility {
	id: string
	name: string
	description?: string
	available: boolean
}

export interface Pricing {
	baseHourlyRate: number
	peakHourRate?: number
	weekendRate?: number
	memberDiscount?: number
	minimumBookingTime?: number // in minutes
}

export interface AvailabilitySchedule {
	day: DayOfWeek
	openingTime: string
	closingTime: string
	isClosed?: boolean
}

export interface Court {
	id: string
	name: string
	venueId: string // Reference to the venue this court belongs to
	sportTypes: SportType[] // Support multi-purpose courts
	courtType: CourtType

	// Dimensions and capacity
	dimensions?: {
		length: number
		width: number
		unit: 'meters' | 'feet'
	}
	capacity?: number

	// Pricing structure
	pricing: Pricing

	// Facilities and features
	facilities: Facility[]

	// Scheduling information
	regularSchedule: AvailabilitySchedule[]
	maintenanceSchedule?: MaintenanceSchedule[]

	// Status information
	status: 'active' | 'maintenance' | 'inactive'

	// Media
	images?: string[] // URLs to images
	virtualTourUrl?: string

	// Metadata
	createdAt: string
	updatedAt: string
	createdBy: string
	lastUpdatedBy: string
}

export interface Venue {
	id: string
	name: string
	address: {
		street: string
		city: string
		state: string
		postalCode: string
		country: string
		coordinates?: {
			latitude: number
			longitude: number
		}
	}
	contactInfo: {
		phone: string
		email: string
		website?: string
	}
	amenities: string[]
	businessHours: AvailabilitySchedule[]
	courts: string[] // Array of court IDs at this venue
}

// Service for managing courts
export const CourtsDB = new FirestoreService<Court>('courts')

// Service for managing venues
export const VenuesDB = new FirestoreService<Venue>('venues')
