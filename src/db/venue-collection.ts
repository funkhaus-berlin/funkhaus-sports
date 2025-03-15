import { FirestoreService } from '../firebase/firestore.service'

// Enums for venue properties
export enum VenueTypeEnum {
	sportsFacility = 'sportsFacility',
	fitnessCenter = 'fitnessCenter',
	swimmingPool = 'swimmingPool',
	stadium = 'stadium',
	arena = 'arena',
	recreationCenter = 'recreationCenter',
	other = 'other',
}

export enum FacilityEnum {
	parking = 'parking',
	showers = 'showers',
	lockers = 'lockers',
	wheelchairAccess = 'wheelchairAccess',
	cafe = 'cafe',
	shop = 'shop',
	wifi = 'wifi',
	toilets = 'toilets',
	childrenArea = 'childrenArea',
}

// Address model
export interface Address {
	street: string
	city: string
	postalCode: string
	country: string
	coordinates?: {
		lat: number
		lng: number
	}
}

// Operating hours model
export interface OperatingHours {
	monday: { open: string; close: string } | null
	tuesday: { open: string; close: string } | null
	wednesday: { open: string; close: string } | null
	thursday: { open: string; close: string } | null
	friday: { open: string; close: string } | null
	saturday: { open: string; close: string } | null
	sunday: { open: string; close: string } | null
}

// Venue model
export interface Venue {
	id: string
	name: string
	description?: string
	venueType: string
	address: Address
	facilities: string[]
	operatingHours: OperatingHours
	maxCourtCapacity?: number
	contactEmail?: string
	contactPhone?: string
	website?: string
	status: 'active' | 'maintenance' | 'inactive'
	createdAt: string
	updatedAt: string
	createdBy?: string
}

// Create Firestore service for venues
export const VenuesDB = new FirestoreService<Venue>('venues')

// Default operating hours (9:00 AM to 10:00 PM)
export const defaultOperatingHours: OperatingHours = {
	monday: { open: '09:00', close: '22:00' },
	tuesday: { open: '09:00', close: '22:00' },
	wednesday: { open: '09:00', close: '22:00' },
	thursday: { open: '09:00', close: '22:00' },
	friday: { open: '09:00', close: '22:00' },
	saturday: { open: '09:00', close: '22:00' },
	sunday: { open: '09:00', close: '22:00' },
}
