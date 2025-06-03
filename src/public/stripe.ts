import { SchmancyTheme } from '@mhmo91/schmancy'
import { Appearance, Stripe, StripeElements, loadStripe } from '@stripe/stripe-js'
import { BehaviorSubject, from, map, switchMap } from 'rxjs'
export const PUBLISHABLE_KEY = import.meta.env.DEV
	? 'pk_test_51R2BaDDCyjpKeQTnOtoBfOdXM8ZoXzo6Ou8r9SyJLvEZUkWqiJLz50PXkfhhvzPfxFVcysLd0RNJz5CMJV3Jf4uU00JAAIVSYk'
	: 'pk_live_51R16ZWDQXLBYFaMOA0DRbauF9ioFKYRave0553RRa4ZkJvhAYGOQ1i6ifgdIylfcqkLaiQTRQbcQTpr5dTlKGnrZ00s8j3s8VG'

// Export the promise directly.
export const stripePromise: Promise<Stripe | null> = loadStripe(PUBLISHABLE_KEY, { locale: 'auto' })

export const $stripeElements = new BehaviorSubject<StripeElements | undefined>(undefined)
export const $stripe = new BehaviorSubject<number>(100)
export function createPaymentIntent(body: any) {
	return from(
		fetch(
			((import.meta.env.DEV ? import.meta.env.VITE_BASE_URL : '')) + '/api/create-payment-intent',

			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			},
		),
	).pipe(
		switchMap(res => {
			if (!res.ok) {
				console.error('Payment intent creation failed:', res.status, res.statusText)
				// Return the error response as JSON if possible, otherwise create an error object
				return res.json().catch(() => ({
					error: `Payment failed with status: ${res.status} ${res.statusText}`,
				}))
			}
			return res.json()
		}),
		map(responseBody => {
			if (responseBody.error) {
				throw new Error(responseBody.error)
			}
			return responseBody as { orderID: string; clientSecret: string; paymentIntentId: string }
		}),
	)
}

export function appearance(): Appearance {
	return {
		theme: 'stripe',
		rules: {
			'.Tab': {
				padding: '3px 6px',
			},
			'.Label': {
				display: 'none',
			},
		},
		variables: {
			spacingUnit: '3px',
			fontFamily: 'GT-Eesti-Display-Regular',
			fontSizeSm: '12px',
			colorPrimary: getComputedStyle(document.body).getPropertyValue(
				SchmancyTheme.sys.color.primary.default.slice(4, -1),
			),
			colorBackground: getComputedStyle(document.body).getPropertyValue(
				SchmancyTheme.sys.color.surface.highest.slice(4, -1),
			),
			borderRadius: '8px',
			blockLogoColor: getComputedStyle(document.body).getPropertyValue(
				SchmancyTheme.sys.color.primary.default.slice(4, -1),
			),
			colorText: getComputedStyle(document.body).getPropertyValue(SchmancyTheme.sys.color.surface.on.slice(4, -1)),
		},
		labels: 'above',
	}
}

// Export the promise as the default export.
export default stripePromise
