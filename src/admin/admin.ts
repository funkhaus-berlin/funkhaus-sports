// src/admin/admin.ts
import { ActiveRoute, area, fullHeight, schmancyNavDrawer, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { filter, from, fromEvent, map, takeUntil, tap } from 'rxjs'
import { auth } from 'src/firebase/firebase'
import { User, userContext } from 'src/user.context'
import '@mhmo91/schmancy'
import FunkhausSportsSignin from './signin'
import { VenueManagement } from './venues/venues'
import './venues/scanner/scanner-view'

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
		auth.onAuthStateChanged((user) => {
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

		// Handle route changes
		this.setupRouteListeners()
	}

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
	
	private navigateToScanner(): void {
		area.push({
			component: document.createElement('scanner-view'),
			area: 'admin',
			params: { view: 'scanner' } 
		})
		this.activeTab = 'scanner'
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
				// Get activeTab from component name or params.view
				if (r.params?.view) {
					this.activeTab = r.params.view
				} else {
					this.activeTab = r.component.toLowerCase()
				}
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
						
						<schmancy-list-item
							.selected=${this.activeTab === 'scanner'}
							@click=${() => {
								this.navigateToScanner()
								schmancyNavDrawer.close()
							}}
							rounded
							variant="container"
						>
							<schmancy-flex gap="md">
								<schmancy-icon>qr_code_scanner</schmancy-icon>
								Scanner
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
