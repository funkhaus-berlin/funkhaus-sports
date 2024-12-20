import { auth } from '@db/firebase'
import { $LitElement } from '@mhmo91/lit-mixins/src'
import { area, fullHeight } from '@mhmo91/schmancy'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { filter } from 'rxjs'
import Login from 'src/public/login/login'
import Users from './users/users'

@customElement(`momo-admin`)
export default class Admin extends $LitElement() {
	@state() activeTab: string = 'events'

	connectedCallback(): void {
		super.connectedCallback()

		area.$current.pipe(filter(r => r.area === 'admin')).subscribe(r => {
			this.activeTab = r.component.replace(/-/g, '').toLowerCase()
		})
	}
	render() {
		return html`
			<schmancy-surface ${fullHeight()} type="container">
				<schmancy-nav-drawer minWidth="1080">
					<schmancy-nav-drawer-navbar width="180px">
						<schmancy-list .hidden=${false}>
							<schmancy-list-item
								.selected=${this.activeTab === 'momousers'}
								@click=${() => {
									area.push({
										component: Users,
										area: 'admin',
									})
								}}
								rounded
								variant="container"
							>
								Users
							</schmancy-list-item>

							<schmancy-button
								class="fixed bottom-4 w-full"
								variant="filled"
								@click=${() => {
									auth.signOut()
									area.push({
										component: Login,
										area: 'root',
									})
								}}
							>
								Logout
							</schmancy-button>
						</schmancy-list>
					</schmancy-nav-drawer-navbar>
					<schmancy-nav-drawer-content class="rounded-lg px-4 sm:px-6 md:px-8">
						<schmancy-nav-drawer-appbar .hidden=${auth.currentUser?.email === 'scan@funkhaus-berlin.net'} class="py-2">
							<!-- <schmancy-typography type="display">Schmancy Demo</schmancy-typography> -->
						</schmancy-nav-drawer-appbar>
						<schmancy-area name="admin" .default=${Users}></schmancy-area>
					</schmancy-nav-drawer-content>
				</schmancy-nav-drawer>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'momo-admin': Admin
	}
}
