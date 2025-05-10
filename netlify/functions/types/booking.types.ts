export interface Booking {
	id: string
	userId: string
	userName: string
	courtId: string
	venueId: string
	startTime: string
	endTime: string
	price: number
	date: string
	paymentStatus?: string
	courtPreference?: 'indoor' | 'outdoor'
	status?: string
	paymentIntentId?: string
	customerEmail?: string
	customerPhone: string
	customerAddress: {
		street: string
		city: string
		postalCode: string
		country: string
	}
	createdAt?: any
	updatedAt?: any
	emailSent?: boolean
	emailSentAt?: any
	invoiceNumber?: string
	invoiceGeneratedAt?: any
}
