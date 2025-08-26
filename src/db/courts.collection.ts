// src/db/courts.collection.ts
import dayjs from 'dayjs'
import { Observable } from 'rxjs'
import { FirestoreService } from 'src/firebase/firestore.service'
import { Court } from 'src/types/booking/court.types'

// Factory function to create a new Court object
export function createCourt(venueId: string): Court {
	return {
		id: '',
		venueId: venueId,
		name: '',
		courtType: 'indoor',
		sportTypes: [],
		pricing: {
			baseHourlyRate: 0
		},
		status: 'active',
		createdAt: dayjs().toISOString(),
		updatedAt: dayjs().toISOString()
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
		return this.query([
			{
				key: 'venueId',
				value: venueId,
				operator: '==',
			},
		])
	}
}

export const CourtsDB = new CourtsService()
