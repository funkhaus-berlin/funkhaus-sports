// src/db/venue-collection.ts
import { FirestoreService } from '../firebase/firestore.service'
import { Venue } from '../types/booking/venue.types'

// Create Firestore service for venues
export const VenuesDB = new FirestoreService<Venue>('venues')
