import { $LitElement } from '@mhmo91/lit-mixins/src'
import { $newSchmancyTheme, $notify, $schmancyTheme, area, fullHeight } from '@mhmo91/schmancy'
import { html } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { fromEvent, take } from 'rxjs'
// import ZolaApp from './app/app'
import { auth } from '@db/firebase'
import Admin from './admin/admin'
import { $user } from './context'
import Login from './public/login/login'
import '@lit-labs/virtualizer'
import { User } from '@db/users.collection'
import { UsersDB } from '@db/users.collection'
import AppLanding from './landing/landing'
@customElement('app-index')
export class AppIndex extends $LitElement() {
	@state() rehydrated = false
	@query('schmancy-surface') surface!: HTMLElement

	async connectedCallback() {
		super.connectedCallback()

		this.rehydrated = true

		if (!navigator.onLine) {
			$notify.error('No internet connection')
			fromEvent(window, 'online')
				.pipe(take(1))
				.subscribe(() => {
					// this.init()
				})
		} else {
			// this.init()
		}
	}

	init() {
		auth.onAuthStateChanged(user => {
			console.log('user', user)
			if (!user) {
				area.push({
					component: Login,
					area: 'root',
				})
				this.rehydrated = true
			} else {
				user &&
					UsersDB.get(user?.uid as string).subscribe({
						next: u => {
							$user.next(Object.assign(user, u))
							this.rehydrated = true
						},
					})
				$user.next(Object.assign(user, new User()))

				area.push({
					component: Admin,
					area: 'root',
				})
			}
		})
	}

	render() {
		return html`
			<schmancy-theme-button> </schmancy-theme-button>
			<schmancy-surface ${fullHeight()} type="container">
				${when(
					this.rehydrated,
					() => html` <schmancy-area class="h-full w-full" name="root" .default=${AppLanding}></schmancy-area> `,
					() => html` <schmancy-busy></schmancy-busy> `,
				)}
				<schmancy-notification-outlet></schmancy-notification-outlet>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'app-index': AppIndex
	}
}
