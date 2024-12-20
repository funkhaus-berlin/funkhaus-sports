import { FirestoreService } from './firestore.service'
export interface Error {
	type: string
	payload: any
}

export const ErrorsDB = new FirestoreService<Error>('errors')
