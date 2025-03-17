export class TicketOrderForm {
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
}
