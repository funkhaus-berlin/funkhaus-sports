import dayjs from 'dayjs'
import {
  collection,
  CollectionReference,
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
  setDoc,
  where,
  WhereFilterOp,
  runTransaction,
  Transaction,
  DocumentReference,
} from 'firebase/firestore'
import { parse, stringify } from 'flatted'
import { from, map, Observable, take, lastValueFrom } from 'rxjs'
import { v4 as uuidv4 } from 'uuid'
import { db } from './firebase'

export type firebaseServiceQuery = {
  key: string
  value: any
  operator: WhereFilterOp
}

export type TransactionCallback<T> = (
  transaction: Transaction,
  collectionRef: CollectionReference<DocumentData>,
) => Promise<T>

export class FirestoreService<T extends DocumentData> {
  private collectionName: string
  private db: Firestore

  constructor(collectionName: string, firestoreDB?: Firestore) {
    this.collectionName = collectionName
    this.db = firestoreDB ?? db
  }

  /**
   * Run a transaction with atomic guarantees
   *
   * @param callback Function that takes a transaction object and returns a Promise with the result
   * @returns Observable with the result of the transaction
   */
  public runTransaction<R>(callback: TransactionCallback<R>): Observable<R> {
    const collectionRef = collection(this.db, this.collectionName)

    return from(
      runTransaction(this.db, async transaction => {
        return await callback(transaction, collectionRef)
      }),
    )
  }

  /**
   * Helper function to create a document reference in a transaction
   *
   * @param id Document ID
   * @returns Document reference that can be used in transactions
   */
  public docRef(id: string): DocumentReference<DocumentData> {
    return doc(this.db, this.collectionName, id)
  }

  /**
   * Convert to Promise for easier async/await usage with transactions
   *
   * @param callback Function that takes a transaction object and returns a Promise with the result
   * @returns Promise with the transaction result
   */
  public async transactionAsync<R>(callback: TransactionCallback<R>): Promise<R> {
    return lastValueFrom(this.runTransaction(callback))
  }

  public query(queryFilters: firebaseServiceQuery[]): Observable<Map<string, T>> {
    const collectionRef = collection(this.db, this.collectionName)
    const queryConstraints: QueryConstraint[] = queryFilters.map(qf => where(qf.key, qf.operator, qf.value))
    const queryRef = query(collectionRef, ...queryConstraints)

    return from(getDocs(queryRef)).pipe(
      map(querySnapshot => {
        const resultMap = new Map<string, T>()
        querySnapshot.forEach(docSnap => {
          resultMap.set(docSnap.id, docSnap.data() as T)
        })
        return resultMap
      }),
    )
  }

  public upsert(data: Partial<T> | T, uid: string): Observable<Partial<T> | T> {
    if (!data['createdAt'])
      // @ts-ignore
      data['createdAt'] = dayjs().toISOString()
    if (!data['updatedAt'])
      // @ts-ignore
      data['updatedAt'] = dayjs().toISOString()
    const docRef = doc(this.db, this.collectionName, uid)
    return from(setDoc(docRef, parse(stringify(data)), { merge: true })).pipe(map(() => data))
  }

  public set(uid: string, data: T): Observable<void> {
    const docRef = doc(this.db, this.collectionName, uid)
    return from(setDoc(docRef, data))
  }

  public get(uid: string): Observable<T | undefined> {
    const docRef = doc(this.db, this.collectionName, uid)
    return from(getDoc(docRef)).pipe(
      map(docSnap => (docSnap.exists() ? (docSnap.data() as T) : undefined)),
      take(1),
    )
  }

  public delete(uid: string): Observable<void> {
    const docRef = doc(this.db, this.collectionName, uid)
    return from(deleteDoc(docRef))
  }

  public subscribe(uid: string): Observable<T | undefined> {
    const docRef = doc(this.db, this.collectionName, uid)
    return new Observable<T | undefined>(subscriber => {
      const unsubscribe = onSnapshot(
        docRef,
        docSnap => {
          if (docSnap.exists()) {
            subscriber.next(docSnap.data() as T)
          } else {
            subscriber.next(undefined)
          }
        },
        subscriber.error.bind(subscriber),
      )

      return { unsubscribe }
    })
  }

  /**
   * Subscribes to a document's changes and returns an Observable.
   * Alias of subscribe() with naming consistent with subscribeToCollection.
   */
  public subscribeToDocument(uid: string): Observable<T | undefined> {
    return this.subscribe(uid)
  }

  /**
   * Updates a document with the given data and merges it with existing data.
   * Adds an updatedAt timestamp if not provided.
   */
  public updateDocument(uid: string, data: Partial<T>): Observable<void> {
    // Add an updatedAt timestamp if it's not already provided
    if (!data['updatedAt']) {
      // @ts-ignore
      data['updatedAt'] = dayjs().toISOString()
    }

    const docRef = doc(this.db, this.collectionName, uid)
    return from(setDoc(docRef, data, { merge: true }))
  }

  public subscribeToCollection(
    queryFilters?: { key: string; value: any; operator: WhereFilterOp }[],
  ): Observable<Map<string, T>> {
    // Get a reference to the collection.
    const collectionRef = collection(this.db, this.collectionName)

    // If query filters are provided, apply them.
    const q =
      queryFilters && queryFilters.length > 0
        ? query(collectionRef, ...queryFilters.map(qf => where(qf.key, qf.operator, qf.value)))
        : query(collectionRef)

    // Create an Observable that emits a new Map of document IDs to data
    // every time the collection changes.
    return new Observable<Map<string, T>>(subscriber => {
      const unsubscribe = onSnapshot(
        q,
        querySnapshot => {
          const resultMap = new Map<string, T>()
          querySnapshot.forEach(docSnap => {
            resultMap.set(docSnap.id, docSnap.data() as T)
          })
          subscriber.next(resultMap)
        },
        error => subscriber.error(error),
      )

      // Return the unsubscribe function to clean up the listener when unsubscribed.
      return { unsubscribe }
    })
  }

  /**
   * Check if there exists at least one document that matches the query filters.
   * @param queryFilters An array of filter conditions for the query.
   * @returns Observable<boolean> - True if at least one document matches, false otherwise.
   */
  public exists(
    queryFilters: {
      key: string
      value: any
      operator: WhereFilterOp
    }[],
  ): Observable<boolean> {
    const collectionRef = collection(this.db, this.collectionName)
    const queryConstraints: QueryConstraint[] = queryFilters.map(qf => where(qf.key, qf.operator, qf.value))
    const queryRef = query(collectionRef, ...queryConstraints, limit(1)) // Limit to 1 to check existence only

    return from(getDocs(queryRef)).pipe(
      map(querySnapshot => !querySnapshot.empty), // Returns true if at least one document exists
    )
  }

  public collectionRef(): CollectionReference<DocumentData, DocumentData> {
    return collection(this.db, this.collectionName)
  }

  public ref(uid: string = uuidv4()): any {
    return doc(this.db, this.collectionName, uid)
  }
}
