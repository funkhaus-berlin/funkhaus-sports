// src/admin/admin.ts
import { ActiveRoute, area, fullHeight, schmancyNavDrawer, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { filter, from, fromEvent, map, takeUntil, tap } from 'rxjs'
import { auth } from 'src/firebase/firebase'
import { User, userContext } from 'src/user.context'

import FunkhausSportsSignin from './signin'
import { VenueManagement } from './venues/venues'

@customElement('funkhaus-sports-admin')
export default class FunkhausAdmin extends $LitElement() {
	@state() activeTab: string = 'venues'
	@state() fullScreen = false
	@state() activeRoute: string = 'venues'

	@select(userContext, user => user)
	user!: User

	connectedCallback(): void {
		super.connectedCallback()
		from(auth.authStateReady())
			.pipe(takeUntil(this.disconnecting))
			.subscribe({
				next: () => {
					const user = auth.currentUser
					console.log('User', user)
					if (!user) {
						this.redirectToLogin()
					} else {
						userContext.set(JSON.parse(JSON.stringify(user)))
						// Initialize with venues as default
						if (!area.current.get('admin')) {
							this.navigateToVenues()
						}
					}
				},
			})

		// Handle fullscreen events
		this.setupFullscreenListeners()

		// Handle route changes
		this.setupRouteListeners()
	}

	private redirectToLogin(): void {
		area.push({
			component: FunkhausSportsSignin,
			area: 'root',
			historyStrategy: 'replace',
		})
	}

	// Helper methods to navigate
	private navigateToVenues(): void {
		area.push({
			component: VenueManagement,
			area: 'admin',
		})
		this.activeTab = 'venues'
	}

	private setupFullscreenListeners(): void {
		// Listen for fullscreen events
		fromEvent<CustomEvent<boolean>>(this, 'fullscreen')
			.pipe(takeUntil(this.disconnecting))
			.subscribe(event => {
				this.fullScreen = event.detail
				this.requestUpdate()
			})

		// Exit fullscreen automatically when user navigates away
		area.$current
			.pipe(
				takeUntil(this.disconnecting),
				filter(r => r.has('admin')),
				tap(r => {
					console.log('Route', r.get('admin'))
					if (r.get('admin')?.component.toLowerCase() === 'venue-management') {
						this.fullScreen = false
					} else if (r.get('admin')?.component.toLowerCase() === 'venue-detail-view') {
						this.fullScreen = true
					}
				}),
			)
			.subscribe()
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
		const contentDrawerClasses = {
			'rounded-lg px-4 sm:px-6 md:px-8': this.fullScreen === false,
		}

		return html`
			<schmancy-nav-drawer .fullscreen=${this.fullScreen}>
				<schmancy-nav-drawer-navbar .hidden=${!!this.fullScreen} width="180px">
					<schmancy-list>
						<schmancy-list-item
							.selected=${this.activeTab === 'venues-management'}
							@click=${() => {
								this.navigateToVenues()
								schmancyNavDrawer.close()
							}}
							rounded
							variant="container"
						>
							<schmancy-flex gap="md">
								<schmancy-icon>location_on</schmancy-icon>
								Venues
							</schmancy-flex>
						</schmancy-list-item>

						<schmancy-divider></schmancy-divider>

						<schmancy-list-item
							@click=${() => {
								// Sign out user
								auth.signOut().then(() => {
									this.redirectToLogin()
								})
							}}
							rounded
							variant="container"
						>
							<schmancy-flex gap="md">
								<schmancy-icon>logout</schmancy-icon>
								Logout
							</schmancy-flex>
						</schmancy-list-item>
					</schmancy-list>
				</schmancy-nav-drawer-navbar>

				<schmancy-nav-drawer-content class=${this.classMap(contentDrawerClasses)}>
					<schmancy-grid ${fullHeight()} rows="${this.fullScreen ? '1fr' : 'auto 1fr'}">
						<schmancy-area name="admin" .default=${VenueManagement}></schmancy-area>
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
