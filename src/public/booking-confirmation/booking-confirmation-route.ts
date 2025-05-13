// src/public/book/booking-confirmation-route.ts
import { $notify, area, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { catchError, filter, map, of, retry, takeUntil } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { BookingsDB } from 'src/db/bookings.collection'
import { Court } from 'src/db/courts.collection'
import { VenueLandingPage } from '../venues/venues'
import './booking-confirmation'

// Constants for retries
const MAX_RETRIES = 3
const RETRY_DELAY = 2000 // 2 seconds

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
	@state() autoGenerateWallet: boolean = false
	@state() walletPlatform: string = ''
	@select(courtsContext) courts!: Map<string, Court>

	private maxRetries = MAX_RETRIES

	connectedCallback() {
		super.connectedCallback()
		// Extract booking ID and wallet parameters from URL if not provided as property
		const urlParams = new URLSearchParams(window.location.search)
		
		// Get booking ID
		if (!this.bookingId) {
			this.bookingId = urlParams.get('id') || ''
		}
		
		// Check for wallet parameters
		const wallet = urlParams.get('wallet')
		if (wallet && (wallet === 'apple' || wallet === 'google')) {
			this.walletPlatform = wallet
		}
		
		// Check if we should auto-generate wallet pass
		if (urlParams.get('autoGenerate') === 'true') {
			this.autoGenerateWallet = true
		}

		// Update URL to include the booking ID for bookmarking/sharing
		// But strip wallet parameters to prevent repeated auto-generation
		if (this.bookingId) {
			const url = new URL(window.location.href)
			url.searchParams.set('id', this.bookingId)
			if (this.walletPlatform && !this.autoGenerateWallet) {
				url.searchParams.set('wallet', this.walletPlatform)
			} else {
				// Remove auto-generate parameter to prevent repeated generation
				url.searchParams.delete('wallet')
				url.searchParams.delete('autoGenerate')
			}
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
					// Retry a few times to handle transient errors
					retry({
						count: this.maxRetries,
						delay: (_, retryCount) => {
							this.retryCount = retryCount;
							console.log(`Retry ${retryCount} for booking ${this.bookingId}`);
							return of(RETRY_DELAY);
						}
					}),
					filter(bookings => bookings.size > 0),
					map(bookings => bookings.values().next().value),
					catchError(error => {
						console.error('Error loading booking:', error);
						this.error = `Error loading booking: ${error.message}`;
						this.loading = false;
						return of(null);
					}),
					takeUntil(this.disconnecting),
				)
				.subscribe({
					next: booking => {
						console.log('Booking loaded:', booking)
						if (booking) {
							this.booking = booking
							
							// Check payment status and update UI accordingly
							if (booking.paymentStatus !== 'paid') {
								// If payment is failed or cancelled, show an error
								if (booking.paymentStatus === 'failed' || booking.paymentStatus === 'cancelled') {
									$notify.error('Payment was not successful. Please try booking again.');
								}
							}
							
							// Always stop loading once we have booking data
							this.loading = false;
						} else if (this.retryCount >= this.maxRetries) {
							this.error = `Unable to load booking details after ${this.maxRetries} attempts. Please contact support.`
							this.loading = false;
						}
					},
					error: err => {
						console.error('Final error loading booking:', err)
						this.loading = false;
						this.error = 'An error occurred while loading your booking details. Please try refreshing the page.'
					},
				})
		} else {
			this.error = 'No booking ID provided. Unable to load confirmation details.'
			this.loading = false
		}
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
						<schmancy-spinner class="size-24" size="48px"></schmancy-spinner>
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

		if (this.error) {
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
							${this.booking.paymentStatus === 'failed' || this.booking.paymentStatus === 'cancelled'
								? 'Your payment was not successful. Please try booking again.'
								: 'Your booking is reserved, but payment has not yet been completed. Please contact support if you believe this is in error.'}
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
