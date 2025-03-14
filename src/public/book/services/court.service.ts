// services/court.service.ts
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { FirebaseServiceQuery, FirestoreService } from 'src/firebase/firestore.service'

export interface FirebaseCourt {
	id?: string
	name: string
	type: string
	hourlyRate: number
	facilities: string[]
	maintenanceHours: {
		day: string
		startTime: string
		endTime: string
	}[]
	isActive: boolean
	createdAt?: string
	updatedAt?: string
}

export interface Court {
	id: string
	name: string
	available: boolean
	hourlyRate: number
}

/**
 * Court service using Firestore
 */
export class CourtService {
	private service: FirestoreService<FirebaseCourt>

	constructor() {
		this.service = new FirestoreService<FirebaseCourt>('courts')
	}

	/**
	 * Get all active courts
	 */
	getActiveCourts(): Observable<Map<string, Court>> {
		const query: FirebaseServiceQuery[] = [
			{
				key: 'isActive',
				value: true,
				operator: '==',
			},
		]

		return this.service.getCollection(query).pipe(
			map(courts => {
				const uiCourts = new Map<string, Court>()

				courts.forEach((court, id) => {
					uiCourts.set(id, {
						id,
						name: court.name,
						available: true,
						hourlyRate: court.hourlyRate,
					})
				})

				return uiCourts
			}),
		)
	}

	/**
	 * Get court by ID
	 */
	getCourt(courtId: string): Observable<Court | undefined> {
		return this.service.get(courtId).pipe(
			map(court => {
				if (!court) return undefined

				return {
					id: courtId,
					name: court.name,
					available: court.isActive,
					hourlyRate: court.hourlyRate,
				}
			}),
		)
	}

	/**
	 * Create a new court
	 */
	createCourt(court: Omit<FirebaseCourt, 'id' | 'createdAt' | 'updatedAt'>): Observable<FirebaseCourt> {
		return this.service.upsert(court)
	}

	/**
	 * Update an existing court
	 */
	updateCourt(id: string, updates: Partial<FirebaseCourt>): Observable<FirebaseCourt> {
		return this.service.upsert(updates, id)
	}

	/**
	 * Delete a court
	 */
	deleteCourt(id: string): Observable<void> {
		return this.service.delete(id)
	}

	/**
	 * Get all courts (for admin)
	 */
	getAllCourts(): Observable<Map<string, FirebaseCourt>> {
		return this.service.getCollection()
	}

	/**
	 * Set court active status
	 */
	setCourtActiveStatus(id: string, isActive: boolean): Observable<FirebaseCourt> {
		return this.service.upsert({ isActive }, id)
	}
}
