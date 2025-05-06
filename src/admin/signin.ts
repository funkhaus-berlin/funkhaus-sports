import { $notify, area, SchmancyInputChangeEvent } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { auth } from 'src/firebase/firebase'
import { userContext } from 'src/user.context'
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
	@state() formError = ''

	login() {
		// Clear any previous errors
		this.formError = ''

		// Validate inputs
		if (!this.credentials.email || !this.credentials.password) {
			this.formError = 'Please enter both email and password'
			return
		}

		// login with email and password
		this.busy = true
		signInWithEmailAndPassword(auth, this.credentials.email, this.credentials.password)
			.then(auth => {
				this.busy = false
				console.log('logged in')
				userContext.set(auth.user)
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
			})
			.catch(error => {
				this.busy = false
				this.showForgotPass = true
				
				// Handle specific Firebase error codes
				if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
					this.formError = 'Invalid email or password. Please try again.'
				} else if (error.code === 'auth/too-many-requests') {
					this.formError = 'Too many failed login attempts. Please try again later.'
				} else {
					this.formError = 'Error signing in. Please try again.'
				}
				
				$notify.error(this.formError)
				console.error(error)
			})
	}

	navigateToResetPage() {
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
			<style>
				:host {
					display: block;
					--brand-primary: #2563eb;
					--brand-hover: #3b82f6;
				}
				.login-container {
					min-height: 100vh;
					display: flex;
					flex-direction: column;
					justify-content: center;
					background: linear-gradient(135deg, #f9fafb 0%, #e5e7eb 100%);
				}
				.login-form {
					background: white;
					border-radius: 12px;
					box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
					padding: 2rem;
					width: 100%;
					max-width: 420px;
					margin: 0 auto;
					transition: all 0.3s ease;
				}
				.form-header {
					margin-bottom: 2rem;
				}
				.form-footer {
					margin-top: 1.5rem;
					font-size: 0.875rem;
				}
				.error-message {
					color: #dc2626;
					font-size: 0.875rem;
					margin-bottom: 1rem;
				}
				@media (max-width: 640px) {
					.login-form {
						padding: 1.5rem;
						border-radius: 8px;
						max-width: 90%;
					}
				}
			</style>

			<div class="login-container">
				<div class="login-form">
					<schmancy-grid justify="center" class="form-header" gap="sm">
						<schmancy-typography type="headline" align="center">
							<schmancy-animated-text duration="2000">Funkhaus Sports</schmancy-animated-text>
						</schmancy-typography>
						<schmancy-typography type="body" align="center" token="md"> Sign in to your account </schmancy-typography>
					</schmancy-grid>

					<div class="error-message" ?hidden=${!this.formError}>${this.formError}</div>

					<schmancy-form
						@submit=${(e: SubmitEvent) => {
							e.preventDefault()
							this.login()
						}}
					>
						<schmancy-grid gap="md">
							<schmancy-input
								name="email"
								.value=${this.credentials.email}
								@change=${(e: SchmancyInputChangeEvent) => {
									this.credentials.email = e.detail.value
								}}
								required
								placeholder="Email address"
								type="email"
								autocomplete="email"
								icon="mail"
							></schmancy-input>

							<schmancy-input
								name="password"
								.value=${this.credentials.password}
								@change=${(e: SchmancyInputChangeEvent) => {
									this.credentials.password = e.detail.value
								}}
								required
								placeholder="Password"
								type="password"
								autocomplete="current-password"
								icon="lock"
							></schmancy-input>

							<schmancy-button
								.disabled=${this.busy}
								type="submit"
								variant="filled"
								style="width: 100%; margin-top: 0.5rem;"
							>
								${this.busy ? 'Signing in...' : 'Sign in'}
							</schmancy-button>
						</schmancy-grid>
					</schmancy-form>

					<div class="form-footer" ?hidden=${!this.showForgotPass}>
						<schmancy-grid justify="center" gap="sm" alignItems="center">
							<schmancy-typography align="center" type="label" token="sm"> Forgot your password? </schmancy-typography>
							<schmancy-button
								@click=${this.navigateToResetPage}
								variant="text"
								style="color: var(--brand-primary)"
								.disabled=${this.busy}
							>
								Reset it
							</schmancy-button>
						</schmancy-grid>
					</div>
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