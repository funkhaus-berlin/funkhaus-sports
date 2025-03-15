import { createContext } from '@mhmo91/schmancy'
import { Court } from 'src/db/courts.collection'

export const courtsContext = createContext<Map<string, Court>>(new Map(), 'indexeddb', 'courts')
