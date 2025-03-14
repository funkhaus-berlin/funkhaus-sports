import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { StripeElements, StripePaymentElement } from '@stripe/stripe-js'
import { css, html } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { distinctUntilChanged, take, tap } from 'rxjs'
import './book/book'
import { AppConfiguration, AppConfigurationContext } from './context'
import './generic-booking-form'
import stripePromise, { $stripe, $stripeElements, appearance } from './stripe'
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

	@state() clientSecret: string | undefined
	elements: StripeElements | undefined
	paymentElement: StripePaymentElement | undefined

	async connectedCallback() {
		super.connectedCallback()
		console.count()

		// Create and append the payment element slot
		const slot = document.createElement('slot')
		slot.name = 'stripe-element'
		slot.slot = 'stripe-element'
		this.append(slot)
		const stripe = await stripePromise
		// Initialize Stripe elements when payment amount is available
		$stripe.pipe(distinctUntilChanged(), take(1)).subscribe(amount => {
			this.elements = stripe?.elements({
				fonts: [
					{
						src: 'url(https://ticket.funkhaus-berlin.net/assets/GT-Eesti-Pro-Display-Regular-Czpp09nv.woff)',
						family: 'GT-Eesti-Display-Regular',
						style: 'normal',
					},
				],
				mode: 'payment',
				appearance: appearance(),
				currency: 'eur',
				amount: amount * 100,
			})

			const paymentElementOptions = {
				layout: 'tabs',
				billingDetails: {},
				fields: {
					billingDetails: {
						address: 'never',
					},
				},
			}
			// @ts-ignore
			this.paymentElement = this.elements?.create('payment', {
				...paymentElementOptions,
			}) as StripePaymentElement
			this.paymentElement.mount('#stripe-element')
			this.paymentElement.on('ready', () => {
				$stripeElements.next(this.elements)
			})
		})

		// Update payment amount when it changes
		$stripe
			.pipe(
				distinctUntilChanged(),
				tap({
					next: amount => {
						const elements = $stripeElements.value
						if (elements) {
							elements.update({
								amount: amount * 100,
							})
						}
					},
				}),
			)
			.subscribe()
	}

	protected render(): unknown {
		return html`
			${when(this.busy, () => html`<schmancy-busy></schmancy-busy>`)}
			<court-booking-system>
				<slot slot="stripe-element" name="stripe-element"></slot>
			</court-booking-system>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'generic-booking-app': GenericBookingApp
	}
}
