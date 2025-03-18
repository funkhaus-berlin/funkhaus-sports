export type StripeIntent = {
	amount: number
	email: string
	phone: string
	name: string
	address: string
	city: string
	postalCode: string
	country: string
	tickets: {
		[key: string]: number
	}
	uid: string
}
