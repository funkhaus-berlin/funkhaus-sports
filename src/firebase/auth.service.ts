// services/auth.service.ts
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { Observable, from, of, throwError } from 'rxjs'
import { catchError, map, switchMap, tap } from 'rxjs/operators'
import { FirestoreService } from 'src/firebase/firestore.service'

export interface User {
	id: string
	email: string
	displayName: string
	isAdmin: boolean
}

/**
 * Authentication service using Firebase Auth
 */
export class AuthService {
	private auth = getAuth()
	private currentUser: User | null = null
	userService: FirestoreService<any>

	constructor() {
		this.userService = new FirestoreService<any>('users')

		// Listen for auth state changes
		onAuthStateChanged(this.auth, async user => {
			// if (user) {
			// 	const token = await user.getIdTokenResult()
			// 	const isAdmin = token.claims.admin === true

			// 	this.currentUser = {
			// 		id: user.uid,
			// 		email: user.email || '',
			// 		displayName: user.displayName || 'User',
			// 		isAdmin,
			// 	}
			// } else {
			// 	this.currentUser = null
			// }

			if (user) {
				const token = await user!.getIdTokenResult()

				return {
					id: user!.uid,
					email: user!.email || '',
					displayName: user!.displayName || 'User',
					isAdmin: true,
				}
			}
		})
	}

	/**
	 * Login with email and password
	 */
	login(email: string, password: string): Observable<User> {
		return from(signInWithEmailAndPassword(this.auth, email, password)).pipe(
			switchMap(userCredential => {
				const user = userCredential.user
				return from(user.getIdTokenResult())
			}),
			map(idTokenResult => {
				const user = this.auth.currentUser
				if (!user) throw new Error('No user found after login')

				const isAdmin = idTokenResult.claims.admin === true

				const userData: User = {
					id: user.uid,
					email: user.email || '',
					displayName: user.displayName || 'User',
					isAdmin,
				}

				this.currentUser = userData
				return userData
			}),
			catchError(error => {
				console.error('Login error:', error)
				return throwError(() => error)
			}),
		)
	}

	/**
	 * Logout
	 */
	logout(): Observable<void> {
		return from(signOut(this.auth)).pipe(
			tap(() => {
				this.currentUser = null
			}),
			catchError(error => {
				console.error('Logout error:', error)
				return throwError(() => error)
			}),
		)
	}

	/**
	 * Get current authenticated user
	 */
	getCurrentUser(): Observable<User | null> {
		if (this.currentUser) {
			return of(this.currentUser)
		}

		// Wait for auth state to be initialized
		return new Observable<User | null>(subscriber => {
			const unsubscribe = onAuthStateChanged(
				this.auth,
				async user => {
					if (user) {
						try {
							const token = await user.getIdTokenResult()
							const isAdmin = token.claims.admin === true

							const userData: User = {
								id: user.uid,
								email: user.email || '',
								displayName: user.displayName || 'User',
								isAdmin,
							}

							this.currentUser = userData
							subscriber.next(userData)
							subscriber.complete()
						} catch (error) {
							subscriber.error(error)
						}
					} else {
						subscriber.next(null)
						subscriber.complete()
					}
				},
				error => {
					subscriber.error(error)
				},
			)

			// Return cleanup function
			return { unsubscribe }
		})
	}

	/**
	 * Check if current user is admin
	 */
	isCurrentUserAdmin(): Observable<boolean> {
		return this.getCurrentUser().pipe(map(user => user?.isAdmin || false))
	}

	/**
	 * Get current user ID
	 */
	getCurrentUserId(): string {
		return this.currentUser?.id || ''
	}

	/**
	 * Get current user display name
	 */
	getCurrentUserDisplayName(): string {
		return this.currentUser?.displayName || 'Guest'
	}
}
