// src/admin/admin.ts
import '@mhmo91/schmancy'
import { area, fullHeight, schmancyNavDrawer, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { from, fromEvent, takeUntil, tap } from 'rxjs'
import { auth } from 'src/firebase/firebase'
import { User, userContext } from 'src/user.context'
import FunkhausSportsSignin from './signin'
import Users from './users/users'
import './venues/scanner/scanner-view'
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
		
		
		// Set up auth state listener
		from(auth.authStateReady())
			.pipe(takeUntil(this.disconnecting))
			.subscribe({
				next: () => {
					this.checkUserAuth()
				},
			})

		// Also set up a listener for auth state changes
		auth.onAuthStateChanged(user => {
			if (!user) {
				this.redirectToLogin()
			} else {
				userContext.set(JSON.parse(JSON.stringify(user)))
				// Initialize with venues as default
				if (!area.current.get('admin')) {
					this.navigateToVenues()
				}
			}
		})

		// Handle fullscreen events
		this.setupFullscreenListeners()

		// Combined route listener for both fullscreen state and active tab
		area
			.on('admin')
			.pipe(
				takeUntil(this.disconnecting),
				tap(route => {
					// Handle fullscreen state based on component type
					const componentName = route.component.toLowerCase()

					// Set fullscreen mode for specific views
					this.fullScreen = componentName === 'venue-detail-view'
					this.activeTab = componentName
          this.requestUpdate()
				}),
			)
			.subscribe()	}

	private checkUserAuth(): void {
		const user = auth.currentUser
		console.log('Current user:', user)

		if (!user) {
			this.redirectToLogin()
		} else {
			// User is logged in
			userContext.set(JSON.parse(JSON.stringify(user)))

			// Initialize with venues as default if no area is set
			if (!area.current.get('admin')) {
				this.navigateToVenues()
			}
		}
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
		// Listen for fullscreen events from child components
		fromEvent<CustomEvent<boolean>>(this, 'fullscreen')
			.pipe(takeUntil(this.disconnecting))
			.subscribe(event => {
				this.fullScreen = event.detail
				this.requestUpdate()
			})
	}


	protected render() {
		const contentDrawerClasses = {
			'rounded-lg': this.fullScreen === false,
		}

		return html`
			<schmancy-nav-drawer .fullscreen=${this.fullScreen}>
				<schmancy-nav-drawer-navbar .hidden=${!!this.fullScreen} width="180px">
					<schmancy-list>
						<schmancy-list-item
							.selected=${this.activeTab == 'venues-management'}
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

						<schmancy-list-item
							.selected=${this.activeTab == 'funkhaus-users'}
							@click=${() => {
								this.activeTab = 'users';
								schmancyNavDrawer.close();
								area.push({
									area: 'admin',
									component: Users,
								});
							}}
							rounded
							variant="container"
						>
							<schmancy-flex gap="md">
								<schmancy-icon>people</schmancy-icon>
								Users
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
