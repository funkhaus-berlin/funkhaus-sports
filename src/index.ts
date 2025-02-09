import { area, fullHeight } from '@mhmo91/schmancy'
import { html } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
// import '@lit-labs/virtualizer' // uncomment this line to use lit-virtualizer
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { default as AppLanding, default as Home } from './home'
@customElement('app-index')
export class AppIndex extends $LitElement() {
	@state() activeRoute: string = 'home'
	@query('schmancy-surface') surface!: HTMLElement
	async connectedCallback() {
		super.connectedCallback()
		// Example of using area to determine active route
		area.$current.subscribe(current => {
			this.activeRoute = current.get('root')?.component ?? 'home'
		})
	}

	render() {
		return html`
			<schmancy-theme root>
				<!-- Showcase of M3 dynamic theme -->
				<schmancy-surface ${fullHeight()} type="container">
					<schmancy-nav-drawer breakpoint="1080">
						<schmancy-nav-drawer-navbar width="180px">
							<schmancy-list>
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
			</schmancy-theme>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'app-index': AppIndex
	}
}
