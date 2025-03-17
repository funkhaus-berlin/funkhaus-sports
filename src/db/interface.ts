/**
 * Class representing booking form data
 */
export class BookingFormData {
	email: string
	name: string
	phoneNumber: string
	address: string
	postalCode: string
	city: string
	country: string

	constructor() {
		this.email = ''
		this.name = ''
		this.phoneNumber = ''
		this.address = ''
		this.postalCode = ''
		this.city = ''
		this.country = ''
	}

	/**
	 * Validates all form data
	 */
	validateData(): boolean {
		return (
			this.name.trim() !== '' &&
			this.phoneNumber.trim() !== '' &&
			this.address.trim() !== '' &&
			this.postalCode.trim() !== '' &&
			this.city.trim() !== '' &&
			this.country.trim() !== ''
		)
	}
}

/**
 * Interface for payment intent request
 */
export interface PaymentIntentRequest {
	amount: number
	email: string
	name: string
	phone: string
	address: string
	city: string
	postalCode: string
	country: string
	items: {
		[key: string]: number
	}
	eventID: string
	uid: string
}

/**
 * Interface for payment intent response
 */
export interface PaymentIntentResponse {
	orderID: string
	clientSecret: string
}

/**
 * Interface for booking success data
 */
export interface BookingSuccessData {
	bookingId: string
	customerEmail: string
	customerName: string
	eventTitle: string
	eventDate: string
	ticketCount: number
	ticketIds: string[]
}
