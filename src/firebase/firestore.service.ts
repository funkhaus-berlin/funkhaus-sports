// services/firebase.service.ts
import {
	collection,
	deleteDoc,
	doc,
	DocumentData,
	Firestore,
	getDoc,
	getDocs,
	limit,
	onSnapshot,
	query,
	QueryConstraint,
	runTransaction,
	setDoc,
	updateDoc,
	where,
	WhereFilterOp,
} from 'firebase/firestore'
import { from, Observable, throwError } from 'rxjs'
import { catchError, map, take } from 'rxjs/operators'
import { db } from './firebase'

export interface FirebaseServiceQuery {
	key: string
	value: any
	operator: WhereFilterOp
}

/**
 * Generic Firestore service for handling database operations
 */
export class FirestoreService<T extends DocumentData> {
	protected collectionName: string
	protected db: Firestore

	constructor(collectionName: string, firestoreDB?: Firestore) {
		this.collectionName = collectionName
		this.db = firestoreDB ?? db
	}

	/**
	 * Get a document by ID
	 */
	get(id: string): Observable<T | undefined> {
		const docRef = doc(this.db, this.collectionName, id)
		return from(getDoc(docRef)).pipe(
			map(docSnap => (docSnap.exists() ? ({ id: docSnap.id, ...docSnap.data() } as any as T) : undefined)),
			catchError(error => {
				console.error(`Error getting document from ${this.collectionName}:`, error)
				return throwError(() => error)
			}),
			take(1),
		)
	}

	/**
	 * Get collection with query
	 */
	getCollection(queries?: FirebaseServiceQuery[]): Observable<Map<string, T>> {
		const collectionRef = collection(this.db, this.collectionName)

		let queryRef = collectionRef
		if (queries && queries.length > 0) {
			const queryConstraints: QueryConstraint[] = queries.map(q => where(q.key, q.operator, q.value))
			queryRef = query(collectionRef, ...queryConstraints) as any
		}

		return from(getDocs(query(queryRef))).pipe(
			map(snapshot => {
				const dataMap = new Map<string, T>()
				snapshot.forEach(docSnap => {
					dataMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as any as T)
				})
				return dataMap
			}),
			catchError(error => {
				console.error(`Error getting collection ${this.collectionName}:`, error)
				return throwError(() => error)
			}),
		)
	}

	/**
	 * Get collection with real-time updates
	 */
	subscribeToCollection(queries?: FirebaseServiceQuery[]): Observable<Map<string, T>> {
		const collectionRef = collection(this.db, this.collectionName)

		let queryRef = collectionRef
		if (queries && queries.length > 0) {
			const queryConstraints: QueryConstraint[] = queries.map(q => where(q.key, q.operator, q.value))
			queryRef = query(collectionRef, ...queryConstraints) as any
		}

		return new Observable<Map<string, T>>(subscriber => {
			const unsubscribe = onSnapshot(
				queryRef,
				snapshot => {
					const dataMap = new Map<string, T>()
					snapshot.forEach(docSnap => {
						dataMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as any as T)
					})
					subscriber.next(dataMap)
				},
				error => {
					console.error(`Error subscribing to ${this.collectionName}:`, error)
					subscriber.error(error)
				},
			)

			// Return the unsubscribe function for cleanup
			return { unsubscribe }
		})
	}

	/**
	 * Subscribe to a single document
	 */
	subscribe(id: string): Observable<T | undefined> {
		const docRef = doc(this.db, this.collectionName, id)

		return new Observable<T | undefined>(subscriber => {
			const unsubscribe = onSnapshot(
				docRef,
				docSnap => {
					if (docSnap.exists()) {
						subscriber.next({ id: docSnap.id, ...docSnap.data() } as any as T)
					} else {
						subscriber.next(undefined)
					}
				},
				error => subscriber.error(error),
			)

			return { unsubscribe }
		})
	}

	/**
	 * Create or update a document
	 */
	upsert(data: Partial<T>, id?: string, merge: boolean = true): Observable<T> {
		const documentId = id || doc(collection(this.db, this.collectionName)).id
		const docRef = doc(this.db, this.collectionName, documentId)

		const timestamp = new Date().toISOString()
		const docData = {
			...data,
			updatedAt: timestamp,
		} as any

		return from(setDoc(docRef, docData, { merge: merge })).pipe(
			map(() => ({ id: documentId, ...docData } as any as T)),
			catchError(error => {
				console.error(`Error upserting document in ${this.collectionName}:`, error)
				return throwError(() => error)
			}),
		)
	}

	/**
	 * Delete a document
	 */
	delete(id: string): Observable<void> {
		const docRef = doc(this.db, this.collectionName, id)
		return from(deleteDoc(docRef)).pipe(
			catchError(error => {
				console.error(`Error deleting document from ${this.collectionName}:`, error)
				return throwError(() => error)
			}),
		)
	}

	/**
	 * Check if documents exist matching query
	 */
	exists(queries: FirebaseServiceQuery[]): Observable<boolean> {
		const collectionRef = collection(this.db, this.collectionName)
		const queryConstraints: QueryConstraint[] = queries.map(q => where(q.key, q.operator, q.value))
		const queryRef = query(collectionRef, ...queryConstraints, limit(1))

		return from(getDocs(queryRef)).pipe(
			map(snapshot => !snapshot.empty),
			catchError(error => {
				console.error(`Error checking existence in ${this.collectionName}:`, error)
				return throwError(() => error)
			}),
		)
	}

	/**
	 * Run a transaction
	 */
	runTransaction<R>(updateFunction: (transaction: any) => Promise<R>): Observable<R> {
		return from(runTransaction(this.db, updateFunction)).pipe(
			catchError(error => {
				console.error('Transaction failed:', error)
				return throwError(() => error)
			}),
		)
	}
}
