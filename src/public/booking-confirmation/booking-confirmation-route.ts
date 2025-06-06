// src/public/book/booking-confirmation-route.ts
import { $notify, area, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { catchError, EMPTY, filter, of, switchMap, takeUntil, tap } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { BookingsDB } from 'src/db/bookings.collection'
import { Court } from 'src/db/courts.collection'
import { Booking } from 'src/types/booking/models'
import { VenuesLandingPage } from '../venues/venues'
import './booking-confirmation'

/**
 * Booking confirmation route component
 * Handles the display of booking confirmation
 */
@customElement('booking-confirmation-route')
export class BookingConfirmationRoute extends $LitElement() {
	@property({ type: String }) bookingId: string = ''

	@state() loading: boolean = true
	@state() error: string | null = null
	@state() booking: Booking | null = null
	@select(courtsContext) courts!: Map<string, Court>

	connectedCallback() {
		super.connectedCallback()
		
		// Extract booking ID from URL if not provided as property
		const urlParams = new URLSearchParams(window.location.search)
		if (!this.bookingId) {
			this.bookingId = urlParams.get('id') || ''
		}

		// Setup booking subscription pipeline with retry logic
		of(this.bookingId).pipe(
			tap(id => {
				if (!id) {
					this.error = 'No booking ID provided. Unable to load confirmation details.'
					this.loading = false
				}
			}),
			filter(id => !!id),
			switchMap(id => 
				BookingsDB.subscribeToCollection([{
					key: 'id',
					operator: '==',
					value: id,
				}]).pipe(
					tap(bookings => {
						if (bookings.size === 0) {
							// Don't immediately show error - webhook might still be processing
							console.log(`Booking ${id} not found yet, webhook might be processing...`)
						} else {
							const booking = bookings.values().next().value as Booking
							this.booking = booking
							this.loading = false
							this.error = null
							
							// Show success notification for confirmed bookings
							if (booking.status === 'confirmed' && booking.paymentStatus === 'paid') {
								// $notify.success('Booking confirmed successfully!')
							}
							
							// Show notification for failed payments
							if (booking.paymentStatus === 'failed' || booking.paymentStatus === 'cancelled') {
								$notify.error('Payment was not successful. Please try booking again.')
							}
						}
					}),
					// Keep the subscription open to wait for booking updates
					filter(bookings => bookings.size > 0),
					catchError(err => {
						console.error('Error loading booking:', err)
						this.error = 'An error occurred while loading your booking details. Please try refreshing the page.'
						this.loading = false
						return EMPTY
					})
				)
			),
			// Add timeout after 30 seconds
			tap(() => {
				setTimeout(() => {
					if (this.loading && !this.booking) {
						this.error = 'Unable to load booking confirmation. The booking may still be processing. Please check your email for confirmation or contact support.'
						this.loading = false
					}
				}, 30000)
			}),
			takeUntil(this.disconnecting)
		).subscribe()
	}


	render() {
		return html`
			${when(this.loading,
				() => html`
					<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
						<div class="flex justify-center items-center h-full">
							<schmancy-spinner class="size-24" size="48px"></schmancy-spinner>
						</div>
					</schmancy-surface>
				`,
				() => when(this.error,
					() => html`
						<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
							<div class="flex justify-center items-center h-full flex-col gap-4 p-8">
								<schmancy-icon class="text-error-default" size="48px">error</schmancy-icon>
								<schmancy-typography type="title" token="md">Booking Confirmation Error</schmancy-typography>
								<schmancy-typography type="body" token="md" class="text-center mb-4">
									${this.error}
								</schmancy-typography>
								<schmancy-button variant="filled" @click=${() => area.push({ component: VenuesLandingPage, area: 'root' })}>
									Return to Home
								</schmancy-button>
							</div>
						</schmancy-surface>
					`,
					() => when(this.booking && (this.booking.paymentStatus === 'failed' || this.booking.paymentStatus === 'cancelled'),
						() => html`
							<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
								<div class="flex justify-center items-center h-full flex-col gap-4 p-8">
									<schmancy-icon class="text-error-default" size="48px">error</schmancy-icon>
									<schmancy-typography type="title" token="md">Payment Failed</schmancy-typography>
									<schmancy-typography type="body" token="md" class="text-center mb-4">
										Your payment was not successful. Please try booking again.
									</schmancy-typography>
									<schmancy-typography type="label" token="sm" class="text-surface-on-variant mb-4">
										Booking ID: ${this.booking?.id}
									</schmancy-typography>
									<schmancy-button variant="filled" @click=${() => area.push({ component: VenuesLandingPage, area: 'root' })}>
										Book Another Court
									</schmancy-button>
								</div>
							</schmancy-surface>
						`,
						() => when(this.booking,
							() => html`
								<booking-confirmation
									.booking=${this.booking!}
									.selectedCourt=${this.courts.get(this.booking!.courtId)}
									.customerEmail=${this.booking!.customerEmail || ''}
									.customerName=${this.booking!.userName || ''}
									.bookingId=${this.booking!.id || ''}
									.onNewBooking=${() => area.push({ component: VenuesLandingPage, area: 'root' })}
								></booking-confirmation>
							`
						)
					)
				)
			)}
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-confirmation-route': BookingConfirmationRoute
	}
}
