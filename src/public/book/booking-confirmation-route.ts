// src/public/book/booking-confirmation-route.ts
import { $notify, fullHeight } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import {
	BehaviorSubject,
	Observable,
	catchError,
	filter,
	finalize,
	firstValueFrom,
	from,
	map,
	of,
	switchMap,
	takeUntil,
	timer,
} from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { BookingService } from 'src/bookingServices/booking.service'
import { Court } from 'src/db/courts.collection'
import { BookingConfirmation } from './steps/booking-confirmation'
import { VenueLandingPage } from '../venues/venues'
import { area } from '@mhmo91/schmancy'

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
	@state() selectedCourt?: Court = undefined

	private bookingService = new BookingService()
	private maxRetries = 5
	private destroyed$ = new BehaviorSubject<boolean>(false)

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
			this.loadBookingWithRetry()
		} else {
			this.error = 'No booking ID provided. Unable to load confirmation details.'
			this.loading = false
		}
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		this.destroyed$.next(true)
	}

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Handle courts context to find the selected court
		courtsContext.$.pipe(
			filter(courts => courts.size > 0),
			map(courts => {
				if (this.booking?.courtId) {
					return courts.get(this.booking.courtId)
				}
				return undefined
			}),
			takeUntil(this.destroyed$),
		).subscribe(court => {
			if (court) {
				this.selectedCourt = court
			}
		})
	}

	/**
	 * Load booking with retry logic for reliability
	 * Uses exponential backoff for retries
	 */
	private loadBookingWithRetry(): void {
		this.loading = true
		this.error = null

		const getBooking$ = (attempt: number): Observable<any> => {
			return this.bookingService.getBooking(this.bookingId).pipe(
				catchError(error => {
					console.error(`Error loading booking (attempt ${attempt}):`, error)

					if (attempt < this.maxRetries) {
						// Exponential backoff: 1s, 2s, 4s, 8s, 16s
						const delay = Math.pow(2, attempt) * 1000
						console.log(`Retrying in ${delay}ms...`)
						this.retryCount = attempt + 1

						return timer(delay).pipe(switchMap(() => getBooking$(attempt + 1)))
					}

					return of(null)
				}),
			)
		}

		// Start the retry chain
		getBooking$(0)
			.pipe(
				finalize(() => (this.loading = false)),
				takeUntil(this.destroyed$),
			)
			.subscribe({
				next: booking => {
					if (booking) {
						this.booking = booking
						this.findSelectedCourt()

						// Check payment status if needed
						if (booking.paymentStatus !== 'paid') {
							this.checkPaymentStatus()
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
	}

	/**
	 * Find the court associated with this booking
	 */
	private findSelectedCourt(): void {
		if (!this.booking?.courtId) return

		from(courtsContext.$)
			.pipe(
				take(1),
				map(courts => courts.get(this.booking.courtId)),
				takeUntil(this.destroyed$),
			)
			.subscribe(court => {
				if (court) {
					this.selectedCourt = court
				}
			})
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

		// In a real implementation, this would call a secure endpoint:
		/*
    from(fetch(`/api/check-payment-status?paymentIntentId=${this.booking.paymentIntentId}`))
      .pipe(
        switchMap(res => res.json()),
        takeUntil(this.destroyed$)
      )
      .subscribe(result => {
        if (result.status === 'succeeded') {
          // Update local booking status
          this.booking = { ...this.booking, paymentStatus: 'paid' }
          
          // Update in database via service
          this.bookingService.updateBookingPaymentStatus(this.booking.id, 'paid')
            .pipe(take(1))
            .subscribe()
        }
      })
    */
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
			<schmancy-surface ${fullHeight()} type="containerLow" rounded="all" elevation="1">
				<div class="max-w-lg mx-auto pt-4 pb-8 px-4">
					<booking-confirmation
						.booking=${this.booking}
						.selectedCourt=${this.selectedCourt}
						.customerEmail=${this.booking.customerEmail || ''}
						.customerName=${this.booking.userName || ''}
						.bookingId=${this.booking.id || ''}
						.onNewBooking=${() => this.handleNewBooking()}
					></booking-confirmation>
				</div>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-confirmation-route': BookingConfirmationRoute
	}
}
