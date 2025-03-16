import { FirestoreService } from '../firebase/firestore.service'

// Enums for venue properties
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

export interface OperatingHours {
	monday: { open: string; close: string } | null
	tuesday: { open: string; close: string } | null
	wednesday: { open: string; close: string } | null
	thursday: { open: string; close: string } | null
	friday: { open: string; close: string } | null
	saturday: { open: string; close: string } | null
	sunday: { open: string; close: string } | null
}

export enum VenueTypeEnum {
	sportsFacility = 'sportsFacility',
	fitnessCentre = 'fitnessCentre',
	recreationalComplex = 'recreationalComplex',
	stadium = 'stadium',
	multiPurposeArena = 'multiPurposeArena',
	privateClub = 'privateClub',
	school = 'school',
	community = 'community',
}

export enum FacilityEnum {
	parking = 'parking',
	wifi = 'wifi',
	toilets = 'toilets',
	cafe = 'cafe',
	lockers = 'lockers',
	showers = 'showers',
	wheelchairAccess = 'wheelchairAccess',
	shop = 'shop',
	childrenArea = 'childrenArea',
	equipmentRental = 'equipmentRental',
	lighting = 'lighting',
	spectatorSeating = 'spectatorSeating',
	securityService = 'securityService',
	waterStation = 'waterStation',
	firstAid = 'firstAid',
}

export interface VenueSettings {
	// Booking related settings
	minBookingTime: number // in minutes, e.g., 30
	maxBookingTime: number // in minutes, e.g., 240 (4 hours)
	bookingTimeStep: number // in minutes, e.g., 30
	advanceBookingLimit: number // in days, e.g., 14
	cancellationPolicy: {
		allowCancellation: boolean
		refundCutoff: number // hours before booking, e.g., 24
		refundPercentage: number // e.g., 80 (for 80%)
	}
	maintenanceTimes?: {
		day: keyof OperatingHours
		startTime: string
		endTime: string
	}[]
}

export interface Venue {
	id: string
	name: string
	description?: string
	venueType: keyof typeof VenueTypeEnum
	address: Address
	contactEmail?: string
	contactPhone?: string
	website?: string
	facilities: (keyof typeof FacilityEnum)[]
	operatingHours: OperatingHours
	maxCourtCapacity?: number
	settings?: VenueSettings
	status: 'active' | 'maintenance' | 'inactive'
	createdAt: string
	updatedAt: string
	createdBy?: string
	images?: string[]
}

export const defaultOperatingHours: OperatingHours = {
	monday: { open: '09:00', close: '22:00' },
	tuesday: { open: '09:00', close: '22:00' },
	wednesday: { open: '09:00', close: '22:00' },
	thursday: { open: '09:00', close: '22:00' },
	friday: { open: '09:00', close: '22:00' },
	saturday: { open: '09:00', close: '22:00' },
	sunday: { open: '09:00', close: '22:00' },
}

// Sample venue settings that can be used as defaults
export const defaultVenueSettings: VenueSettings = {
	minBookingTime: 30,
	maxBookingTime: 180,
	bookingTimeStep: 30,
	advanceBookingLimit: 14,
	cancellationPolicy: {
		allowCancellation: true,
		refundCutoff: 24,
		refundPercentage: 80,
	},
}

// Create Firestore service for venues
export const VenuesDB = new FirestoreService<Venue>('venues')
