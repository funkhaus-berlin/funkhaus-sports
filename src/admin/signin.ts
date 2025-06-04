import { $notify, area, SchmancyInputChangeEvent } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { of } from 'rxjs'
import { catchError, tap } from 'rxjs/operators'
import { auth as firebaseAuth } from 'src/firebase/firebase'
import 'src/public/shared/logo'
import { User, userContext, UserRole } from 'src/user.context'
import FunkhausAdmin from './admin'
import { VenueManagement } from './venues/venues'

@customElement('funkhaus-sports-signin')
export default class FunkhausSportsSignin extends $LitElement() {
	@state() credentials = {
		email: '',
		password: '',
	}

	@state() busy = false
	@state() showForgotPass = false
	@state() passwordVisible = false

	private async handleSignIn() {
		// Validate inputs
		if (!this.credentials.email || !this.credentials.password) {
			$notify.error('Please enter both email and password')
			return
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(this.credentials.email)) {
			$notify.error('Please enter a valid email address')
			return
		}

		this.busy = true
		this.requestUpdate()
		of(this.credentials).pipe(
			tap(() => console.log('Attempting sign in...')),
			tap(async (creds) => {
				const authResult = await signInWithEmailAndPassword(firebaseAuth, creds.email, creds.password)
				console.log('Sign in successful')
				
				// Create a new User instance with the necessary properties
				const user = new User()
				user.email = authResult.user.email || ''
				user.displayName = authResult.user.displayName || ''
				user.uid = authResult.user.uid
				user.role = 'super_admin' as UserRole
				user.venueAccess = []
				userContext.set(user)
				
				// Navigate to admin area
				area.push({
					component: FunkhausAdmin,
					area: 'root',
					historyStrategy: 'replace',
				})
				area.push({
					component: VenueManagement,
					area: 'admin',
				})
			}),
			catchError((error) => {
				this.showForgotPass = true
				
				// Handle specific Firebase error codes
				let errorMessage = 'Unable to sign in. Please try again.'
				if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
					errorMessage = 'Invalid email or password'
				} else if (error.code === 'auth/too-many-requests') {
					errorMessage = 'Too many failed attempts. Please try again later.'
				} else if (error.code === 'auth/network-request-failed') {
					errorMessage = 'Network error. Please check your connection.'
				}
				
				$notify.error(errorMessage)
				console.error('Sign in error:', error)
				return of(null)
			}),
		
		).subscribe()
	}

	

 render() {
		return html`
			<div class="min-h-screen bg-gradient-to-br from-surface-default to-surface-container flex items-center justify-center p-4">
				<div class="w-full max-w-sm">
					<!-- Logo -->
					<schmancy-flex justify="center" class="mb-8">
						<funkhaus-logo reverse width="180px"></funkhaus-logo>
					</schmancy-flex>
					
					<!-- Minimal Sign In Form -->
					<schmancy-surface type="container" rounded="all" class="p-6 shadow-lg">
						<schmancy-grid gap="md">
							<!-- Form -->
							<schmancy-form @submit=${(e:Event) => {
                e.preventDefault()
                e.stopPropagation()
                this.busy = true
                this.handleSignIn()}}>
								<schmancy-grid gap="md">
									<schmancy-input
										name="email"
										.value=${this.credentials.email}
										@change=${(e: SchmancyInputChangeEvent) => {
											this.credentials.email = e.detail.value
                      this.requestUpdate()
										}}
										required
										label="Email"
										type="email"
										autocomplete="email"
										placeholder="your@email.com"
										.disabled=${this.busy}
									></schmancy-input>

									<schmancy-input
										name="password"
										.value=${this.credentials.password}
										@change=${(e: SchmancyInputChangeEvent) => {
											this.credentials.password = e.detail.value
                      this.requestUpdate()

										}}
										required
										label="Password"
										type=${this.passwordVisible ? 'text' : 'password'}
										autocomplete="current-password"
										placeholder="Enter password"
										.disabled=${this.busy}
									>
										<schmancy-icon-button 
											slot="trailing"
											@click=${() => this.passwordVisible = !this.passwordVisible}
											.disabled=${this.busy}
										>
											<schmancy-icon>${this.passwordVisible ? 'visibility_off' : 'visibility'}</schmancy-icon>
										</schmancy-icon-button>
									</schmancy-input>

									<schmancy-button
										.disabled=${this.busy || !this.credentials.email || !this.credentials.password}
										type="submit"
										variant="filled"
                    width="full"
										class="w-full mt-2"
									>
										${this.busy ? 'Signing in...' : 'Sign In'}
									</schmancy-button>
								</schmancy-grid>
							</schmancy-form>
						
						</schmancy-grid>
					</schmancy-surface>
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-sports-signin': FunkhausSportsSignin
	}
}
