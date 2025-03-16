// src/db/courts.collection.ts
import { Observable } from 'rxjs'
import { FirestoreService } from 'src/firebase/firestore.service'

// Court enums
export enum CourtTypeEnum {
	indoor = 'indoor',
	outdoor = 'outdoor',
	roofed = 'roofed',
	heated = 'heated',
}

export enum SportTypeEnum {
	tennis = 'tennis',
	pickleball = 'pickleball',
	badminton = 'badminton',
	squash = 'squash',
	paddleTennis = 'paddleTennis',
	tableTennis = 'tableTennis',
	basketball = 'basketball',
	volleyball = 'volleyball',
	handball = 'handball',
}

// Court pricing model
export interface Pricing {
	baseHourlyRate: number
	peakHourRate?: number
	weekendRate?: number
	holidayRate?: number
	memberDiscount?: number
}

// Court interface with venue support
export interface Court {
	id: string
	name: string
	venueId: string // Add reference to parent venue
	courtType: string
	sportTypes: string[]
	surface?: string
	indoor?: boolean
	accessible?: boolean
	hasLighting?: boolean
	available?: boolean
	pricing: Pricing
	status: 'active' | 'maintenance' | 'inactive'
	createdAt?: string
	updatedAt?: string
}

// Create a Court firestore service
class CourtsService extends FirestoreService<Court> {
	constructor() {
		super('courts')
	}

	// Get courts by venue
	getByVenue(venueId: string): Observable<Map<string, Court>> {
		return this.getCollection([
			{
				key: 'venueId',
				value: venueId,
				operator: '==',
			},
		])
	}
}

export const CourtsDB = new CourtsService()
