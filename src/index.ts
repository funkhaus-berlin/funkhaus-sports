import '@mhmo91/schmancy'
import { $notify, area, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, query } from 'lit/decorators.js'
import { fromEvent, take, takeUntil } from 'rxjs'
import FunkhausAdmin from './admin/admin'
import { courtsContext } from './admin/courts/context'
import { CourtsDB } from './db/courts.collection'
import GenericBookingApp from './public/app'
import './schmancy'
@customElement('app-index')
export class AppIndex extends $LitElement() {
	@query('schmancy-surface') surface!: HTMLElement

	@select(courtsContext)
	courts!: Map<string, any>

	async connectedCallback() {
		super.connectedCallback()
		if (!navigator.onLine) {
			$notify.error('No internet connection')
			fromEvent(window, 'online')
				.pipe(take(1))
				.subscribe(() => {})
		} else {
		}
		const query = new URLSearchParams(location.search)
		if (query.has('admin')) {
			area.push({
				component: FunkhausAdmin,
				area: 'root',
			})
		}
	}

	firstUpdated() {
		CourtsDB.subscribeToCollection()
			.pipe(takeUntil(this.disconnecting))
			.subscribe({
				next: courtsMap => {
					console.log('Courts updated', courtsMap)
					courtsContext.replace(courtsMap)
					courtsContext.ready = true
				},
			})
	}

	render() {
		return html`
			<schmancy-theme color="#008080" root>
				<schmancy-surface ${fullHeight()} type="container">
					<schmancy-scroll ${fullHeight()}>
						<schmancy-area name="root" .default=${GenericBookingApp}>
							<slot slot="stripe-element" name="stripe-element"></slot>
						</schmancy-area>
					</schmancy-scroll>
				</schmancy-surface>
			</schmancy-theme>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'app-index': AppIndex
	}
}
