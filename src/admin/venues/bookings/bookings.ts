import { $notify, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { EMPTY, combineLatest, of } from 'rxjs'
import { catchError, debounceTime, distinctUntilChanged, filter, finalize, map, startWith, switchMap, take, takeUntil, tap } from 'rxjs/operators'
import { BookingsDB } from 'src/db/bookings.collection'
import { Booking } from 'src/types/booking/booking.types'
import { Court } from 'src/types/booking/court.types'
import { Venue } from 'src/types/booking/venue.types'
import { courtsContext } from '../courts/context'
import { venueContext } from '../venue-context'
import './bookings-filter'
import { AllBookingsContext, BookingsContext, bookingFilterContext } from './bookings.context'
import './components/booking-day-view'
import './components/booking-issues-alert'

dayjs.extend(isBetween)

/**
 * Main booking management component
 * Handles data fetching and rendering for bookings
 */
@customElement('booking-list')
export class VenuBookingsList extends $LitElement() {
	@select(venueContext)
	venue!: Venue

	@select(courtsContext)
	courts!: Map<string, Court>

	@select(bookingFilterContext)
	bookingFilter!: { status?: string; search?: string }

	@select(BookingsContext)
	bookings!: Map<string, Booking>

	@state() loading = true
	@state() error: string | null = null

	connectedCallback() {
		super.connectedCallback()
		this.initializeBookingPipeline()
	}

	private initializeBookingPipeline() {
		combineLatest([venueContext.$, courtsContext.$]).pipe(
			filter(() => venueContext.ready && courtsContext.ready),
			take(1),
			tap(() => {
				this.loading = true
				this.error = null
			}),
			switchMap(() => {
				if (!this.venue?.id || this.courts.size === 0) {
					this.error = !this.venue?.id ? 'No venue selected' : 'No courts available'
					this.loading = false
					return EMPTY
				}

				return bookingFilterContext.$.pipe(
					startWith(bookingFilterContext.value),
					distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
					debounceTime(300),
					switchMap(filter => 
						this.fetchFilteredBookings(filter).pipe(
							catchError(err => {
								console.error('Error fetching filtered bookings:', err)
								this.loading = false
								return of(new Map<string, Booking>())
							})
						)
					),
					tap(() => {
						this.loading = false
					})
				)
			}),
			tap(filteredBookings => {
				BookingsContext.replace(filteredBookings)
			}),
			catchError(err => {
				console.error('Error fetching bookings:', err)
				this.error = 'Failed to load bookings'
				this.loading = false
				$notify.error('Failed to load bookings')
				return EMPTY
			}),
			finalize(() => {
				this.loading = false
			}),
			takeUntil(this.disconnecting)
		).subscribe()
	}

	private fetchFilteredBookings(filter: { status?: string; search?: string; dateFrom?: string; dateTo?: string }) {
		const dateFrom = filter.dateFrom ? dayjs(filter.dateFrom).format('YYYY-MM-DD') : dayjs().startOf('day').format('YYYY-MM-DD')
		const dateTo = filter.dateTo ? dayjs(filter.dateTo).format('YYYY-MM-DD') : dayjs().endOf('day').format('YYYY-MM-DD')

		const venueCourts = Array.from(this.courts.values())
			.filter(court => court.venueId === this.venue.id)
			.map(court => court.id)

		if (venueCourts.length === 0) {
			return of(new Map<string, Booking>())
		}

		return BookingsDB.subscribeToCollection([
			{ key: 'venueId', operator: '==', value: this.venue.id },
			{ key: 'courtId', operator: 'in', value: venueCourts },
			{ key: 'date', operator: '>=', value: dateFrom },
			{ key: 'date', operator: '<=', value: dateTo }
		]).pipe(
			map(bookings => {
				AllBookingsContext.replace(bookings)
				return this.applyAdditionalFilters(bookings, filter)
			})
		)
	}

	private applyAdditionalFilters(bookings: Map<string, Booking>, filter: { status?: string; search?: string }): Map<string, Booking> {
		if ((!filter.status || filter.status === 'all') && !filter.search) {
			return bookings
		}

		return new Map(
			Array.from(bookings.entries()).filter(([id, booking]) => {
				const statusMatch = !filter.status || filter.status === 'all' || (() => {
					switch (filter.status) {
						case 'confirmed':
							return booking.status === 'confirmed' || booking.status === 'completed'
						case 'holding':
						case 'cancelled':
							return booking.status === filter.status
						default:
							return booking.status === filter.status
					}
				})()

				if (!statusMatch) return false

				if (filter.search) {
					const searchTerm = filter.search.toLowerCase()
					const searchableText = [
						booking.userName,
						booking.userEmail,
						booking.userPhone,
						booking.customerEmail,
						booking.customerPhone,
						id
					].filter(Boolean).join(' ').toLowerCase()

					return searchableText.includes(searchTerm)
				}

				return true
			})
		)
	}

	render() {
		return html`
			<schmancy-grid rows="auto auto 1fr" ${fullHeight()}>
				${this.error ? html`
					<div class="col-span-full flex items-center justify-center p-8">
						<schmancy-surface type="container" rounded="all" class="p-8 max-w-md">
							<schmancy-typography type="headline" token="sm" class="mb-4 text-error-default">
								${this.error}
							</schmancy-typography>
							<schmancy-button @click=${() => this.initializeBookingPipeline()}>Retry</schmancy-button>
						</schmancy-surface>
					</div>
				` : html`
					<bookings-filter></bookings-filter>
					<div class="relative">
						${this.loading && !this.bookings.size ? html`
							<div class="absolute inset-0 flex items-center justify-center bg-surface-container/50 z-10">
								<schmancy-circular-progress  size="md"></schmancy-circular-progress>
							</div>
						` : ''}
						<booking-day-view></booking-day-view>
					</div>
				`}
			</schmancy-grid>
					<booking-issues-alert .venueId=${this.venue?.id}></booking-issues-alert>

		`
	}
}


declare global {
	interface HTMLElementTagNameMap {
		'booking-list': VenuBookingsList
	}
}
