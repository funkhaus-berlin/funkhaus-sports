import { createContext } from '@mhmo91/schmancy'
import { combineLatest, map, Observable } from 'rxjs'
import { Court } from 'src/types/booking/court.types'
import { venueContext } from '../venue-context'

export const courtsContext = createContext<Map<string, Court>>(new Map(), 'indexeddb', 'courts')
export const selectedCourtContext = createContext<Partial<Court>>({}, 'local', 'selectedCourt')

// Create an Observable for filtering courts by venue
export const selectMyCourts: Observable<Map<string, Court>> = combineLatest([courtsContext.$, venueContext.$]).pipe(
  map(([courts, venue]) => {
    // Use venue from context
    const venueId = venue?.id;
    
    if (!venueId) {
      return new Map<string, Court>();
    }

    return Array.from(courts.values())
      .filter(court => court.venueId === venueId)
      .reduce((acc, court) => {
        acc.set(court.id, court);
        return acc;
      }, new Map<string, Court>());
  })
);
