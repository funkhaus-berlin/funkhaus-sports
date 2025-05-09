import '@mhmo91/schmancy'
import { $notify, area, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { html } from 'lit'
import { customElement, query } from 'lit/decorators.js'
import { fromEvent, take, takeUntil, tap, zip } from 'rxjs'
import FunkhausAdmin from './admin/admin'
import { courtsContext } from './admin/venues/courts/context'
import { venuesContext } from './admin/venues/venue-context'
import { CourtsDB } from './db/courts.collection'
import { VenuesDB } from './db/venue-collection'
import './map'
import { BookingConfirmationRoute } from './public/booking-confirmation/booking-confirmation-route'
import './public/shared'
import { VenueLandingPage } from './public/venues/venues'
import './schmancy'

dayjs.extend(utc)
dayjs.extend(timezone)
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
		}

		const query = new URLSearchParams(location.search)
		const path = window.location.pathname

		// Handle password reset from email link
		if (query.has('oobCode') && query.has('mode') && query.get('mode') === 'resetPassword') {
			// Dynamic import to avoid circular dependencies
			import('./admin/password-reset-action').then(() => {
				area.push({
					component: document.createElement('funkhaus-sports-password-reset-action') as any,
					area: 'root',
				})
			})
			return
		}

		// Handle admin login page
		if (path.startsWith('/login') || path.startsWith('/signin') || query.has('signin')) {
			import('./admin/signin').then(() => {
				area.push({
					component: document.createElement('funkhaus-sports-signin') as any,
					area: 'root',
				})
			})
			return
		}

		// Handle admin panel
		if (query.has('admin') || path.startsWith('/admin')) {
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
		// Helper function to determine which component to show based on URL
		const getRouteComponent = () => {
			const url = new URL(window.location.href)
			const path = url.pathname

			// Check for booking confirmation route
			if (path.startsWith('/booking/confirmation')) {
				return BookingConfirmationRoute
			}

			// Check for admin route
			if (path.startsWith('/admin')) {
				return FunkhausAdmin
			}

			// Default to landing page
			return VenueLandingPage
		}
		return html`
			<schmancy-theme color="#008080" root>
				<schmancy-surface ${fullHeight()} type="container">
					<schmancy-scroll ${fullHeight()}>
						<schmancy-area name="root" .default=${getRouteComponent()}>
							<slot slot="stripe-element" name="stripe-element"></slot>
						</schmancy-area>
					</schmancy-scroll>
				</schmancy-surface>
        <sch-notification-container .playSound=${true}></sch-notification-container>
			</schmancy-theme>

		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'app-index': AppIndex
	}
}
