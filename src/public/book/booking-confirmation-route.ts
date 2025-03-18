// src/public/book/booking-confirmation-route.ts
import { $notify, area, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { filter, map, takeUntil } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { BookingsDB } from 'src/db/bookings.collection'
import { Court } from 'src/db/courts.collection'
import { VenueLandingPage } from '../venues/venues'

/**
 * Booking confirmation route component
 * Handles the display of booking confirmation and recovery from interrupted sessions
 */
@customElement('booking-confirmation-route')
export class BookingConfirmationRoute extends $LitElement() {
	@property({ type: String }) bookingId: string = ''

	@state() loading: boolean = true
	@state() error: string | null = null
	@state() booking: any = null
	@state() retryCount: number = 0
	@select(courtsContext) courts!: Map<string, Court>

	private maxRetries = 5

	connectedCallback() {
		super.connectedCallback()
		// Extract booking ID from URL if not provided as property
		if (!this.bookingId) {
			const urlParams = new URLSearchParams(window.location.search)
			this.bookingId = urlParams.get('id') || ''
		}

		// Update URL to include the booking ID for bookmarking/sharing
		if (this.bookingId && !window.location.search.includes('id=')) {
			const url = new URL(window.location.href)
			url.searchParams.set('id', this.bookingId)
			window.history.replaceState({ confirmation: true, bookingId: this.bookingId }, '', url.toString())
		}

		if (this.bookingId) {
			BookingsDB.subscribeToCollection([
				{
					key: 'id',
					operator: '==',
					value: this.bookingId,
				},
			])
				.pipe(
					filter(bookings => bookings.size > 0),
					map(bookings => bookings.values().next().value),
					takeUntil(this.disconnecting),
				)
				.subscribe({
					next: booking => {
						console.log('Booking loaded:', booking)
						if (booking) {
							this.booking = booking
							// Check payment status if needed
							if (booking.paymentStatus !== 'paid') {
								// this.checkPaymentStatus()
							} else {
								this.loading = false
							}
						} else {
							this.error = `Unable to load booking details after ${this.maxRetries} attempts. Please contact support.`
						}
					},
					error: err => {
						console.error('Final error loading booking:', err)
						this.error = 'An error occurred while loading your booking details. Please try refreshing the page.'
					},
				})
		} else {
			this.error = 'No booking ID provided. Unable to load confirmation details.'
			this.loading = false
		}
	}

	/**
	 * Check payment status directly with Stripe
	 * Used as a fallback if webhook didn't update payment status
	 */
	private checkPaymentStatus(): void {
		if (!this.booking?.paymentIntentId) return

		// This would typically call a serverless function to check the status
		// For now, we'll just show a notification
		$notify.info('Verifying payment status...')
	}

	/**
	 * Handle booking a new court
	 */
	private handleNewBooking(): void {
		area.push({
			component: VenueLandingPage,
			area: 'root',
		})
	}

	render() {
		if (this.loading) {
			return html`
				<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
					<div class="flex justify-center items-center h-full flex-col gap-4">
						<schmancy-spinner size="48px"></schmancy-spinner>
						<schmancy-typography type="title" token="md">Loading your booking confirmation...</schmancy-typography>
						${this.retryCount > 0
							? html`
									<schmancy-typography type="body" token="sm" class="text-surface-on-variant">
										Retry attempt ${this.retryCount} of ${this.maxRetries}...
									</schmancy-typography>
							  `
							: ''}
					</div>
				</schmancy-surface>
			`
		}

		if (this.error || !this.booking) {
			return html`
				<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
					<div class="flex justify-center items-center h-full flex-col gap-4 p-8">
						<schmancy-icon class="text-error-default" size="48px">error</schmancy-icon>
						<schmancy-typography type="title" token="md">Booking Confirmation Error</schmancy-typography>
						<schmancy-typography type="body" token="md" class="text-center mb-4">
							${this.error || 'Unable to load booking confirmation. Please try again or contact support.'}
						</schmancy-typography>

						<schmancy-button variant="filled" @click=${() => this.handleNewBooking()}> Return to Home </schmancy-button>
					</div>
				</schmancy-surface>
			`
		}

		// Check if payment was successful
		if (this.booking.paymentStatus !== 'paid') {
			return html`
				<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
					<div class="flex justify-center items-center h-full flex-col gap-4 p-8">
						<schmancy-icon class="text-warning-default" size="48px">payment</schmancy-icon>
						<schmancy-typography type="title" token="md">Payment Incomplete</schmancy-typography>
						<schmancy-typography type="body" token="md" class="text-center mb-4">
							Your booking is reserved, but payment has not yet been completed. Please contact support if you believe
							this is in error.
						</schmancy-typography>

						<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-4">
							Booking ID: ${this.booking.id}
						</schmancy-typography>

						<schmancy-button variant="filled" @click=${() => this.handleNewBooking()}>
							Book Another Court
						</schmancy-button>
					</div>
				</schmancy-surface>
			`
		}

		// Successful booking confirmation
		return html`
			<booking-confirmation
				.booking=${this.booking}
				.selectedCourt=${courtsContext.value.get(this.booking.courtId)}
				.customerEmail=${this.booking.customerEmail || ''}
				.customerName=${this.booking.userName || ''}
				.bookingId=${this.booking.id || ''}
				.onNewBooking=${() => this.handleNewBooking()}
			></booking-confirmation>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-confirmation-route': BookingConfirmationRoute
	}
}
