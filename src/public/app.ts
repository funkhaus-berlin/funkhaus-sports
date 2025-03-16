import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import './book/book'
import { AppConfiguration, AppConfigurationContext } from './context'
// Theme configuration for styling consistency
export const appTheme: {
	color: string
	scheme: 'dark' | 'light'
} = {
	color: '#000000',
	scheme: 'light',
}

@customElement('generic-booking-app')
export default class GenericBookingApp extends $LitElement(
	css`
		:host {
			display: block;
			position: relative;
			inset: 0;
		}
	`,
) {
	@property({ type: Boolean }) hideLogo = false

	@select(AppConfigurationContext)
	appConfig!: AppConfiguration

	@query('#color') color!: HTMLElement
	@state() busy = false
	@state() activeTab: string = 'booking'

	protected render(): unknown {
		return html`
			${when(this.busy, () => html`<schmancy-busy></schmancy-busy>`)}
			<schmancy-area name="booking">
				<court-booking-system>
					<slot slot="stripe-element" name="stripe-element"></slot>
				</court-booking-system>
			</schmancy-area>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'generic-booking-app': GenericBookingApp
	}
}
