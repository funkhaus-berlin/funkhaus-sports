import { $LitElement } from '@mhmo91/lit-mixins/src'
import { $notify, area, fullHeight } from '@mhmo91/schmancy'
import { html } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { fromEvent, switchMap, take, takeUntil, tap } from 'rxjs'
// import '@lit-labs/virtualizer' // uncomment this line to use lit-virtualizer
import { default as AppLanding, default as Home } from './home'
@customElement('app-index')
export class AppIndex extends $LitElement() {
	@state() activeRoute: string = 'home'
	@query('schmancy-surface') surface!: HTMLElement
	async connectedCallback() {
		super.connectedCallback()
		// Example of rxjs usage to notify user when they are offline
		fromEvent(window, 'offline')
			.pipe(
				tap(() => {
					$notify.error('You are offline')
				}),
				switchMap(() => {
					return fromEvent(window, 'online').pipe(
						take(1),
						tap(() => {
							$notify.success('You are online')
						}),
					)
				}),
				takeUntil(this.disconnecting), // available from BaseElement
			)
			.subscribe()

		// Example of using area to determine active route
		area.$current.subscribe(current => {
			this.activeRoute = current.get('root')?.component ?? 'home'
			console.log('activeRoute', this.activeRoute)
		})
	}

	render() {
		return html`
			<!-- Showcase of M3 dynamic theme -->
			<schmancy-theme-button class="absolute left-4 bottom-4"> </schmancy-theme-button>
			<schmancy-surface ${fullHeight()} type="container">
				<schmancy-nav-drawer minWidth="1080">
					<schmancy-nav-drawer-navbar width="180px">
						<schmancy-list .hidden=${false}>
							<schmancy-list-item
								.selected=${this.activeRoute === 'APP-HOME'}
								@click=${() => {
									area.push({
										component: Home,
										area: 'root',
									})
								}}
								rounded
								variant="container"
							>
								Home
							</schmancy-list-item>
						</schmancy-list>
					</schmancy-nav-drawer-navbar>
					<schmancy-nav-drawer-content>
						<schmancy-area class="h-full w-full" name="root" .default=${AppLanding}></schmancy-area>
					</schmancy-nav-drawer-content>
				</schmancy-nav-drawer>
			</schmancy-surface>

			<schmancy-notification-outlet></schmancy-notification-outlet>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'app-index': AppIndex
	}
}
