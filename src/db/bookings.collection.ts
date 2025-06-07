import { FirestoreService } from 'src/firebase/firestore.service'
import type { Booking } from '../types/booking/booking.types'

export const BookingsDB = new FirestoreService<Booking>('bookings')
