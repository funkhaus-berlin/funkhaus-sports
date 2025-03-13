export class TicketOrderForm {
	email: string
	repeatEmail: string
	name: string
	phoneNumber: string
	address: string
	postalCode: string
	city: string
	country: string

	constructor() {
		this.email = ''
		this.repeatEmail = ''
		this.name = ''
		this.phoneNumber = ''
		this.address = ''
		this.postalCode = ''
		this.city = ''
		this.country = ''
	}

	// Method to validate the email consistency
	validateEmails(): boolean {
		return this.email === this.repeatEmail
	}

	// Optional method to provide additional validation or processing
	validateData(): boolean {
		// Implement additional validations as needed
		return this.validateEmails() // For example, ensure both emails match
	}
}
