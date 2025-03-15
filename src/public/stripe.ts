import { SchmancyTheme } from '@mhmo91/schmancy'
import { Appearance, Stripe, StripeElements, loadStripe } from '@stripe/stripe-js'
import { BehaviorSubject, from, map, switchMap, tap } from 'rxjs'

export const PUBLISHABLE_KEY = import.meta.env.DEV
	? 'pk_test_51QlYjPKb7GiQmYfukrVvsIDIC1khW2HQgv4Lh9AFn02ZoyCU9rauPkFOWkK4sYum7BUN2XI14yrkH23ivvqNiTqW00wynnT76j'
	: 'pk_live_51Om1siKOjLfImK4i9mR0y7bBT9o0dWqGOLjNpSJgkewp0Jz4Hfgpiyv4f2IlcZlLky1dKH3YkYub6FSEkpgAATUD00FsCFDsmV'

// Export the promise directly.
export const stripePromise: Promise<Stripe | null> = loadStripe(PUBLISHABLE_KEY, { locale: 'auto' })

export const $stripeElements = new BehaviorSubject<StripeElements | undefined>(undefined)
export const $stripe = new BehaviorSubject<number>(100)

export function createPaymentIntent(body: any) {
	return from(
		fetch(import.meta.env.VITE_NETLIFY_BASE_URL.concat('/api/stripe-intent'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		}),
	).pipe(
		tap(res => console.log(res)),
		switchMap(res => res.json()),
		map((body: { orderID: string; clientSecret: string }) => body),
	)
}

export function appearance(): Appearance {
	return {
		theme: 'stripe',
		rules: {
			'.Tab': {
				padding: '4px 8px',
			},
		},
		variables: {
			spacingUnit: '4px',
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
			colorText: getComputedStyle(document.body).getPropertyValue(SchmancyTheme.sys.color.primary.default.slice(4, -1)),
		},
		labels: 'above',
	}
}

// Export the promise as the default export.
export default stripePromise
