// Types for our booking system
export interface TimeSlot {
	label: string
	value: number
	available: boolean
}

export interface Duration {
	label: string
	value: number
	price: number
}
