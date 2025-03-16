import { createCollectionContext, createCompoundSelector } from '@mhmo91/schmancy'
import { Court } from 'src/db/courts.collection'
import { venueContext } from '../venue-context'

export const courtsContext = createCollectionContext<Court>(new Map(), 'courts', 'indexeddb')

export const selectMyCourts = createCompoundSelector([courtsContext.$, venueContext.$], (courts, venue) => {
	return Array.from(courts.values())
		.filter(court => court.venueId === venue.id)
		.reduce((acc, court) => {
			acc.set(court.id, court)
			return acc
		}, new Map<string, Court>())
})
