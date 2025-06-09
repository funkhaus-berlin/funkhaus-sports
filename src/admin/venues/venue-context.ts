import { createContext } from '@mhmo91/schmancy'
import { Venue } from 'src/types/booking/venue.types'

export const venuesContext = createContext<Map<string, Venue>>(new Map(), 'indexeddb', 'venues')

export const venueContext = createContext<Partial<Venue>>({}, 'local', 'venue')
