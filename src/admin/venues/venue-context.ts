import { createContext } from '@mhmo91/schmancy'
import { Court } from 'src/types/booking/court.types'
import { Venue } from 'src/types/booking/venue.types'

export const venuesContext = createContext<Map<string, Venue>>(new Map(), 'indexeddb', 'venues')

export const venueContext = createContext<Partial<Venue>>({}, 'local', 'venue')

// Extended venue context to track selected court within the venue
export interface VenueContextState extends Partial<Venue> {
  selectedCourtId?: string
  selectedCourt?: Court
}

export const venueWithCourtContext = createContext<VenueContextState>({}, 'local', 'venue-with-court')

// Helper function to clear selected court
export const clearSelectedCourt = () => {
  const currentVenue = venueWithCourtContext.value
  venueWithCourtContext.set({
    ...currentVenue,
    selectedCourtId: undefined,
    selectedCourt: undefined
  }, true)
}
