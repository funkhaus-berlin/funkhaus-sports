import { createContext } from '@mhmo91/schmancy'

export type Booking = {
	startTime: string
	endTime: string
	courtID: string
	amount: number
	paymentID: string
	paymentIntent: string
	paymentMethod: string
	paymentStatus: 'pending' | 'succeeded' | 'failed'
}

export const bookingContext = createContext<Booking>({} as Booking, 'session', 'booking')
