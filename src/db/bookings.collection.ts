import { FirestoreService } from 'src/firebase/firestore.service'
import { Booking } from 'src/public/book/context'

export const BookingsDB = new FirestoreService<Booking>('bookings')
