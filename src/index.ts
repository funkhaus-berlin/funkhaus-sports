import { $notify, fullHeight } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, query } from 'lit/decorators.js'
import { fromEvent, take } from 'rxjs'
import FunkhausSportsApp from './public/app'

@customElement('app-index')
export class AppIndex extends $LitElement() {
	@query('schmancy-surface') surface!: HTMLElement

	async connectedCallback() {
		super.connectedCallback()
		if (!navigator.onLine) {
			$notify.error('No internet connection')
			fromEvent(window, 'online')
				.pipe(take(1))
				.subscribe(() => {})
		} else {
		}
		// const query = new URLSearchParams(location.search)
		// if (query.has('admin')) {
		// 	area.push({
		// 		component: FunkhausAdmin,
		// 		area: 'root',
		// 	})
		// }
	}

	render() {
		return html`
			<schmancy-theme color="#008080" root>
				<schmancy-surface ${fullHeight()} type="container">
					<schmancy-scroll ${fullHeight()}>
						<schmancy-area name="root" .default=${FunkhausSportsApp}>
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
