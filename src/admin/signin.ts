import { $notify, area, SchmancyInputChangeEvent } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { auth } from 'src/firebase/firebase'
import { CourtManagement } from './courts/courts'
@customElement('funkhaus-sports-signin')
export default class FunkhausSportsSignin extends $LitElement() {
	@state() credentials = {
		email: '',
		password: '',
	}

	@state() busy = false

	@state() showForgotPass = false

	login() {
		// login with email and password
		this.busy = true
		signInWithEmailAndPassword(auth, this.credentials.email, this.credentials.password)
			.then(auth => {
				this.busy = false
				console.log('logged in')
				console.log(auth)
				area.push({
					component: CourtManagement,
					area: 'root',
				})
			})
			.catch(error => {
				this.busy = false
				this.showForgotPass = true
				$notify.error('Invalid credentials, please try again')
				console.error(error)
			})
	}

	resetPassword() {
		// reset password
		this.busy = true
		sendPasswordResetEmail(auth, this.credentials.email)
			.then(() => {
				this.busy = false
				$notify.success('Password reset email sent successfully')
			})
			.catch(error => {
				this.busy = false
				$notify.error('Error sending password reset email')
				console.error(error)
			})
	}

	protected render() {
		return html`
			<schmancy-surface>
				<schmancy-form
					class="pt-0 md:pt-20 my-auto mx-auto max-w-md"
					@submit=${(e: SubmitEvent) => {
						e.preventDefault()
						this.login()
					}}
				>
					<schmancy-grid justify="center" class="mx-auto" gap="md">
						<schmancy-typography align="center" token="lg"> Funkhaus Sports </schmancy-typography>
						<schmancy-input
							name="email"
							.value=${this.credentials.email}
							@change=${(e: SchmancyInputChangeEvent) => {
								this.credentials.email = e.detail.value
							}}
							required
							placeholder="Email"
							type="email"
							autocomplete="on"
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
						></schmancy-input>
						<schmancy-button .disabled=${this.busy} type="submit" variant="filled"> Login </schmancy-button>
					</schmancy-grid>
				</schmancy-form>
				<schmancy-grid .hidden=${!this.showForgotPass} justify="center" class="pt-8 mx-auto">
					<schmancy-typography align="center" type="label" token="sm"> Forget your password? </schmancy-typography>
					<schmancy-button @click=${this.resetPassword} variant="text">
						<schmancy-typography type="label" token="lg"> Reset it </schmancy-typography>
					</schmancy-button>
				</schmancy-grid>
			</schmancy-surface>
		`
	}
}
declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-sports-signin': FunkhausSportsSignin
	}
}
