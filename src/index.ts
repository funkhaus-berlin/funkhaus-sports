import '@mhmo91/schmancy'
import { $notify, area, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, query } from 'lit/decorators.js'
import { fromEvent, take, takeUntil, tap, zip } from 'rxjs'
import FunkhausAdmin from './admin/admin'
import { courtsContext } from './admin/venues/courts/context'
import { venuesContext } from './admin/venues/venue-context'
import { CourtsDB } from './db/courts.collection'
import { VenuesDB } from './db/venue-collection'
import { VenueLandingPage } from './public/venues/venues'
import './schmancy'
import GenericBookingApp from './public/app'
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
		zip(
			CourtsDB.subscribeToCollection().pipe(
				takeUntil(this.disconnecting),
				tap({
					next: courtsMap => {
						console.log('Courts updated', courtsMap)
						courtsContext.replace(courtsMap)
						courtsContext.ready = true
					},
				}),
			),
			VenuesDB.subscribeToCollection().pipe(
				takeUntil(this.disconnecting),
				tap({
					next: venues => {
						console.log('Venues updated', venues)
						venuesContext.replace(venues)
						venuesContext.ready = true
					},
				}),
			),
		).subscribe({
			next: () => {
				this.dispatchEvent(
					new CustomEvent('ready', {
						bubbles: true,
						composed: true,
					}),
				)
			},
		})
	}

	render() {
		return html`
			<schmancy-theme color="#008080" root>
				<schmancy-surface ${fullHeight()} type="container">
					<schmancy-scroll ${fullHeight()}>
						<schmancy-area name="root" .default=${VenueLandingPage}>
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
