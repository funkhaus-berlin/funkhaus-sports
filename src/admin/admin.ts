import { ActiveRoute, area, fullHeight, schmancyNavDrawer, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { filter, from, fromEvent, map, mergeMap, of, takeUntil, tap, zip } from 'rxjs'
import { auth } from 'src/firebase/firebase'
import { User, userContext } from 'src/user.context'

import { UsersDB } from 'src/db/users.collection'
import { CourtManagement } from './courts/courts'
import FunkhausSportsSignin from './signin'

@customElement('funkhaus-sports-admin')
export default class FunkhausAdmin extends $LitElement() {
	@state() activeTab: string = 'users'
	@state() fullScreen = false
	@state() activeRoute: string = 'home'

	@select(userContext, user => user)
	private user!: User

	connectedCallback(): void {
		super.connectedCallback()

		// Handle authentication state
		this.handleAuthState()

		// Handle fullscreen events
		this.setupFullscreenListeners()

		// Handle route changes
		this.setupRouteListeners()
	}

	private handleAuthState(): void {
		from(auth.authStateReady())
			.pipe(
				takeUntil(this.disconnecting),
				mergeMap(() => this.getUserData()),
			)
			.subscribe({
				next: () => {
					if (!this.isUserAuthenticated()) {
						this.redirectToLogin()
					}
				},
			})
	}

	private getUserData() {
		if (!auth.currentUser) {
			return of(undefined)
		}
		return zip(UsersDB.get(auth.currentUser.uid), of(auth.currentUser)).pipe(
			tap({
				next: ([user, userAuth]) => {
					if (!user || !user?.onboarded) {
						this.redirectToLogin()
					} else {
						userContext.set({ ...user, ...userAuth.toJSON() }, false)
						userContext.ready = true
					}
				},
			}),
		)
	}

	private isUserAuthenticated(): boolean {
		return !!this.user && this.user.onboarded !== false
	}

	private redirectToLogin(): void {
		area.push({
			component: FunkhausSportsSignin,
			area: 'root',
			historyStrategy: 'silent',
		})
	}

	private setupFullscreenListeners(): void {
		// Listen for fullscreen events
		fromEvent<CustomEvent<boolean>>(this, 'fullscreen')
			.pipe(takeUntil(this.disconnecting))
			.subscribe(event => {
				this.fullScreen = event.detail
			})

		// Exit fullscreen automatically when user navigates away
		area.$current
			.pipe(
				takeUntil(this.disconnecting),
				filter(r => r.has('admin') && r.get('admin')?.component !== this.tagName),
			)
			.subscribe({
				next: () => {
					this.fullScreen = false
				},
			})
	}

	private setupRouteListeners(): void {
		area.$current
			.pipe(
				filter(r => r.has('admin')),
				map(r => r.get('admin') as ActiveRoute),
				takeUntil(this.disconnecting),
			)
			.subscribe(r => {
				this.activeTab = r.component.toLowerCase()
			})
	}

	protected render() {
		if (!this.isUserAuthenticated()) {
			return nothing
		}

		const contentDrawerClasses = {
			'rounded-lg px-4 sm:px-6 md:px-8': this.fullScreen === false,
		}

		return html`
			<schmancy-nav-drawer .fullscreen=${this.fullScreen}>
				<schmancy-nav-drawer-navbar .hidden=${this.fullScreen} width="180px">
					<schmancy-list>
						<schmancy-list-item
							.selected=${this.activeTab === 'owl-users'}
							@click=${() => {
								area.push({
									component: CourtManagement,
									area: 'admin',
								})
								schmancyNavDrawer.close()
							}}
							rounded
							variant="container"
						>
							Users
						</schmancy-list-item>

						<samwa-logout></samwa-logout>
					</schmancy-list>
				</schmancy-nav-drawer-navbar>

				<schmancy-nav-drawer-content class=${this.classMap(contentDrawerClasses)}>
					<schmancy-grid ${fullHeight()} rows="${this.fullScreen ? '1fr' : 'auto 1fr'}">
						<schmancy-area name="admin" .default=${CourtManagement}></schmancy-area>
					</schmancy-grid>
				</schmancy-nav-drawer-content>
			</schmancy-nav-drawer>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-sports-admin': FunkhausAdmin
	}
}
