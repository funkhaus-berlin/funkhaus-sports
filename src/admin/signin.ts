import { $notify, area, SchmancyInputChangeEvent } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { auth as firebaseAuth } from 'src/firebase/firebase'
import { userContext, User, UserRole } from 'src/user.context'
import FunkhausAdmin from './admin'
import { VenueManagement } from './venues/venues'
import { of } from 'rxjs'
import { tap, finalize, catchError } from 'rxjs/operators'

@customElement('funkhaus-sports-signin')
export default class FunkhausSportsSignin extends $LitElement() {
	@state() credentials = {
		email: '',
		password: '',
	}

	@state() busy = false
	@state() showForgotPass = false
	@state() formError = ''
	@state() passwordVisible = false

	private async handleSignIn() {
		// Clear any previous errors
		this.formError = ''

		// Validate inputs
		if (!this.credentials.email || !this.credentials.password) {
			this.formError = 'Please enter both email and password'
			return
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(this.credentials.email)) {
			this.formError = 'Please enter a valid email address'
			return
		}

		this.busy = true
		
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
				user.admin = true
				user.venueAccess = []
				userContext.set(user)
				
				// Navigate to admin area
				area.push({
					component: FunkhausAdmin,
					area: 'root',
					historyStrategy: 'replace',
					clearQueryParams: ['admin'],
				})
				area.push({
					component: VenueManagement,
					area: 'admin',
				})
			}),
			catchError((error) => {
				this.showForgotPass = true
				
				// Handle specific Firebase error codes
				if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
					this.formError = 'Invalid email or password'
				} else if (error.code === 'auth/too-many-requests') {
					this.formError = 'Too many failed attempts. Please try again later.'
				} else if (error.code === 'auth/network-request-failed') {
					this.formError = 'Network error. Please check your connection.'
				} else {
					this.formError = 'Unable to sign in. Please try again.'
				}
				
				$notify.error(this.formError)
				console.error('Sign in error:', error)
				return of(null)
			}),
			finalize(() => {
				this.busy = false
			})
		).subscribe()
	}

	private navigateToResetPage() {
		// Dynamic import to avoid circular dependency
		import('./password-reset').then(() => {
			area.push({
				component: document.createElement('funkhaus-sports-password-reset') as any,
				area: 'root',
				historyStrategy: 'replace'
			})
		})
	}

	protected render() {
		return html`
			<div class="min-h-screen bg-gradient-to-br from-surface-default to-surface-container flex items-center justify-center p-4">
				<div class="w-full max-w-md">
					<!-- Logo/Brand Section -->
					<schmancy-flex justify="center" class="mb-8">
						<schmancy-surface type="surface" rounded="all" class="p-6">
							<schmancy-icon size="64px" class="text-primary-default">sports</schmancy-icon>
						</schmancy-surface>
					</schmancy-flex>
					
					<!-- Sign In Card -->
					<schmancy-card class="overflow-hidden">
						<schmancy-grid gap="lg" class="p-8">
							<!-- Header -->
							<schmancy-grid gap="xs" class="text-center">
								<schmancy-typography type="display" token="sm">Welcome Back</schmancy-typography>
								<schmancy-typography type="body" token="md" class="text-surface-on-variant">
									Sign in to Funkhaus Sports Admin
								</schmancy-typography>
							</schmancy-grid>
							
							<!-- Error Message -->
							${this.formError ? html`
								<schmancy-surface type="error" rounded="all" class="p-3">
									<schmancy-flex align="center" gap="sm">
										<schmancy-icon size="20px">error</schmancy-icon>
										<schmancy-typography type="body" token="sm">${this.formError}</schmancy-typography>
									</schmancy-flex>
								</schmancy-surface>
							` : ''}
							
							<!-- Sign In Form -->
							<schmancy-form @submit=${() => this.handleSignIn()}>
								<schmancy-grid gap="md">
									<schmancy-input
										name="email"
										.value=${this.credentials.email}
										@change=${(e: SchmancyInputChangeEvent) => {
											this.credentials.email = e.detail.value
											this.formError = ''
										}}
										required
										label="Email Address"
										type="email"
										autocomplete="email"
										.disabled=${this.busy}
									>
										<schmancy-icon slot="leading">email</schmancy-icon>
									</schmancy-input>

									<schmancy-input
										name="password"
										.value=${this.credentials.password}
										@change=${(e: SchmancyInputChangeEvent) => {
											this.credentials.password = e.detail.value
											this.formError = ''
										}}
										required
										label="Password"
										type=${this.passwordVisible ? 'text' : 'password'}
										autocomplete="current-password"
										.disabled=${this.busy}
									>
										<schmancy-icon slot="leading">lock</schmancy-icon>
										<schmancy-icon-button 
											slot="trailing"
											@click=${() => this.passwordVisible = !this.passwordVisible}
											.disabled=${this.busy}
										>
											<schmancy-icon>${this.passwordVisible ? 'visibility_off' : 'visibility'}</schmancy-icon>
										</schmancy-icon-button>
									</schmancy-input>

									<schmancy-button
										.disabled=${this.busy}
										type="submit"
										variant="filled"
										class="w-full mt-2"
									>
										${this.busy ? html`
											<schmancy-flex align="center" gap="sm">
												<schmancy-progress-circular size="20"></schmancy-progress-circular>
												Signing in...
											</schmancy-flex>
										` : html`
											<schmancy-icon>login</schmancy-icon>
											Sign In
										`}
									</schmancy-button>
								</schmancy-grid>
							</schmancy-form>
							
							<!-- Forgot Password Link -->
							${this.showForgotPass ? html`
								<schmancy-divider></schmancy-divider>
								<schmancy-flex justify="center">
									<schmancy-button
										@click=${() => this.navigateToResetPage()}
										variant="text"
										.disabled=${this.busy}
									>
										<schmancy-icon>help</schmancy-icon>
										Forgot your password?
									</schmancy-button>
								</schmancy-flex>
							` : ''}
						</schmancy-grid>
					</schmancy-card>
					
					<!-- Footer -->
					<schmancy-flex justify="center" class="mt-6">
						<schmancy-typography type="body" token="sm" class="text-surface-on-variant">
							© ${new Date().getFullYear()} Funkhaus Sports
						</schmancy-typography>
					</schmancy-flex>
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
