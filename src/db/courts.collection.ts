// src/db/courts.collection.ts
import { Observable } from 'rxjs'
import { FirestoreService } from 'src/firebase/firestore.service'
// src/db/courts.collection.ts
export enum CourtTypeEnum {
	indoor = 'indoor',
	outdoor = 'outdoor',
	covered = 'covered',
	hybrid = 'hybrid',
}

export enum SportTypeEnum {
	volleyball = 'volleyball',
	pickleball = 'pickleball',
	padel = 'padel',
}

export enum SurfaceTypeEnum {
	hardCourt = 'hardCourt',
	clay = 'clay',
	grass = 'grass',
	carpet = 'carpet',
	wood = 'wood',
	synthetic = 'synthetic',
	concrete = 'concrete',
	turf = 'turf',
	rubber = 'rubber',
}

export interface Pricing {
	baseHourlyRate: number
	peakHourRate?: number
	weekendRate?: number
	memberDiscount?: number // percentage
	specialRates?: {
		[key: string]: {
			name: string
			description?: string
			rate: number
			applyDays?: string[] // e.g., ['monday', 'tuesday']
			startTime?: string // e.g., '18:00'
			endTime?: string // e.g., '22:00'
		}
	}
}

export interface Maintenance {
	lastMaintenanceDate?: string
	nextMaintenanceDate?: string
	maintenanceNotes?: string
	maintenanceHistory?: {
		date: string
		description: string
		cost?: number
		performedBy?: string
	}[]
}

export interface Dimensions {
	length: number // in meters
	width: number // in meters
	unit: 'meters' | 'feet'
}

export interface Court {
	id: string
	venueId: string
	name: string
	number?: string // Court number (e.g., "Court 1")
	description?: string
	courtType: keyof typeof CourtTypeEnum
	sportTypes: (keyof typeof SportTypeEnum)[]
	surfaceType?: keyof typeof SurfaceTypeEnum
	dimensions?: Dimensions
	pricing: Pricing
	maintenance?: Maintenance
	status: 'active' | 'maintenance' | 'inactive'
	amenities?: string[] // e.g., ["lighting", "scoreboard", "seating"]
	images?: string[]
	createdAt: string
	updatedAt: string
	layout?: {
		type: 'rectangle' | 'circle' | 'custom'
		dimensions: Dimensions // in meters
		orientation?: 'landscape' | 'portrait'
		customShape?: string // SVG path data or similar
	}
}

// CourtsDB implementation would remain the same as your current code
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
