// services/index.ts
export * from '../../../firebase/auth.service'
export * from '../availability.service'
export * from './booking.service'

// services/service-base.ts
import { Observable } from 'rxjs'

/**
 * Base class for service wrappers
 * Provides common utility methods for services
 */
export class ServiceBase {
	/**
	 * Convert promise to Observable
	 */
	protected toObservable<T>(promise: Promise<T>): Observable<T> {
		return new Observable<T>(subscriber => {
			promise
				.then(result => {
					subscriber.next(result)
					subscriber.complete()
				})
				.catch(error => {
					subscriber.error(error)
				})
		})
	}

	/**
	 * Handle common error patterns
	 */
	protected handleError(error: any): Error {
		console.error('Service error:', error)

		// Normalize error format
		if (error.message) {
			return new Error(error.message)
		}

		return new Error('An unknown error occurred')
	}
}
