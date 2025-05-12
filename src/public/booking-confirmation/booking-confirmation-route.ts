// src/public/book/booking-confirmation-route.ts
import { $notify, area, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { catchError, filter, map, of, retry, takeUntil, timeout, timer } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { BookingsDB } from 'src/db/bookings.collection'
import { Court } from 'src/db/courts.collection'
import { VenueLandingPage } from '../venues/venues'
import './booking-confirmation'

// Constants for timeouts and retries
const BOOKING_TIMEOUT = 10000 // 10 seconds
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
	@state() timeoutError: boolean = false
	@select(courtsContext) courts!: Map<string, Court>

	private maxRetries = MAX_RETRIES
	private loadingTimer: number | null = null

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
		
		// Set a timeout to show an error message if loading takes too long
		this.loadingTimer = window.setTimeout(() => {
			if (this.loading && !this.booking) {
				this.timeoutError = true;
				this.requestUpdate();
			}
		}, BOOKING_TIMEOUT);

		if (this.bookingId) {
			BookingsDB.subscribeToCollection([
				{
					key: 'id',
					operator: '==',
					value: this.bookingId,
				},
			])
				.pipe(
					// Add timeout to prevent waiting indefinitely
					timeout(BOOKING_TIMEOUT),
					// Retry a few times to handle transient errors
					retry({
						count: this.maxRetries,
						delay: (error, retryCount) => {
							this.retryCount = retryCount;
							console.log(`Retry ${retryCount} for booking ${this.bookingId}`);
							return timer(RETRY_DELAY);
						}
					}),
					filter(bookings => bookings.size > 0),
					map(bookings => bookings.values().next().value),
					catchError(error => {
						console.error('Error loading booking:', error);
						if (error.name === 'TimeoutError') {
							this.timeoutError = true;
							this.error = `Timeout while loading booking. Please try refreshing the page.`;
						} else {
							this.error = `Error loading booking: ${error.message}`;
						}
						this.loading = false;
						return of(null);
					}),
					takeUntil(this.disconnecting),
				)
				.subscribe({
					next: booking => {
						// Clear the timeout since we got a response
						if (this.loadingTimer) {
							clearTimeout(this.loadingTimer);
							this.loadingTimer = null;
						}
						
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
	
	disconnectedCallback() {
		super.disconnectedCallback();
		// Clean up timeout if component is unmounted
		if (this.loadingTimer) {
			clearTimeout(this.loadingTimer);
			this.loadingTimer = null;
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
						<schmancy-spinner size="48px"></schmancy-spinner>
						<schmancy-typography type="title" token="md">Loading your booking confirmation...</schmancy-typography>
						${this.retryCount > 0
							? html`
									<schmancy-typography type="body" token="sm" class="text-surface-on-variant">
										Retry attempt ${this.retryCount} of ${this.maxRetries}...
									</schmancy-typography>
							  `
							: ''}
							
						${this.timeoutError
							? html`
									<schmancy-typography type="body" token="sm" class="text-warning-default mt-4">
										Taking longer than expected. Please wait or refresh the page.
									</schmancy-typography>
									<schmancy-button variant="outlined" class="mt-2" @click=${() => window.location.reload()}>
										Refresh Page
									</schmancy-button>
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
