// src/admin/venues/bookings/bookings.ts

import { $notify, fullHeight, select } from '@mhmo91/schmancy'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { combineLatest, debounceTime, distinctUntilChanged, filter, map, of, startWith, switchMap, take, takeUntil, tap } from 'rxjs'

// Import our components directly
import './bookings-filter'
import './components/booking-day-view'
import './components/booking-issues-alert'

import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { BookingsDB } from 'src/db/bookings.collection'
import { Court } from 'src/types/booking/court.types'
import { Venue } from 'src/types/booking/venue.types'
import { Booking } from 'src/types/booking/booking.types'
import { courtsContext } from '../courts/context'
import { venueContext } from '../venue-context'
import { AllBookingsContext, bookingFilterContext, BookingsContext } from './bookings.context'

// Extend dayjs with isBetween plugin
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

	@state() loading: boolean = true
	@state() error: string | null = null

	// Date range for bookings - will be updated from filter context
	private dateFrom = dayjs().startOf('day').format('YYYY-MM-DD')
	private dateTo = dayjs().endOf('day').format('YYYY-MM-DD')

	connectedCallback() {
		super.connectedCallback()
		this.fetchBookings()
	}

	/**
	 * Fetch bookings with reactive filtering and venue ID
	 */
	fetchBookings() {
		// Wait for venue and courts to be ready
		combineLatest([venueContext.$, courtsContext.$, BookingsContext.$])
			.pipe(
				filter(() => !!venueContext.ready && !!courtsContext.ready),
				take(1),
				tap(() => {
					if (!this.venue?.id) {
						this.loading = false
						this.error = 'No venue selected'
						this.requestUpdate()
						return
					}

					if (courtsContext.value.size === 0) {
						this.loading = false
						this.error = 'No courts available for this venue'
						this.requestUpdate()
						return
					}
				}),
				switchMap(() => {
					// Combine filter changes with initial fetch
					return bookingFilterContext.$.pipe(
						startWith(bookingFilterContext.value), 
						distinctUntilChanged((prev, curr) => {
							// Only trigger update if filter actually changed
							return JSON.stringify(prev) === JSON.stringify(curr)
						}),
						debounceTime(300)
					)
				}),
				switchMap((filter) => {
					this.loading = true
					this.error = null

					// Update date range from filter context if available
					if (filter.dateFrom) {
						this.dateFrom = dayjs(filter.dateFrom).format('YYYY-MM-DD')
					}
					if (filter.dateTo) {
						this.dateTo = dayjs(filter.dateTo).format('YYYY-MM-DD')
					}

					// Get court IDs to filter by (only those belonging to current venue)
					const venueCourts = Array.from(this.courts.values())
						.filter(court => court.venueId === this.venue.id)
						.map(court => court.id)

					if (venueCourts.length === 0) {
						return of(new Map()) // Return empty map if no courts
					}

					// Include venue ID in query for better performance
					return BookingsDB.subscribeToCollection([
						{ key: 'venueId', operator: '==', value: this.venue.id },
						{
							key: 'courtId',
							operator: 'in',
							value: venueCourts,
						},
						// Add date filters to Firebase query for better performance
						{
							key: 'date',
							operator: '>=',
							value: this.dateFrom,
						},
						{
							key: 'date',
							operator: '<=',
							value: this.dateTo,
						},
					]).pipe(
						map(bookings => {
							console.log(`[BookingsDB] Received ${bookings.size} bookings from Firebase for venue ${this.venue.id}`)
							
							// Count bookings by status before filtering
							const statusCounts: Record<string, number> = { holding: 0, confirmed: 0, cancelled: 0, completed: 0 }
							bookings.forEach(booking => {
								if (booking.status in statusCounts) {
									statusCounts[booking.status as keyof typeof statusCounts]++
								}
							})
							console.log('[BookingsDB] Status counts:', statusCounts)

							// Store all bookings for counting purposes
							AllBookingsContext.replace(bookings)
							
							// Apply any additional filtering needed (status, search)
							const filteredBookings = this.applyAdditionalFilters(bookings, filter)
							console.log(`[BookingsDB] After filtering: ${filteredBookings.size} bookings`)

							return filteredBookings
						}),
					)
				}),
				takeUntil(this.disconnecting),
			)
			.subscribe({
				next: filteredBookings => {
					// Replace the context with the filtered bookings
					BookingsContext.replace(filteredBookings)
					this.loading = false
					this.requestUpdate()
				},
				error: err => {
					console.error('Error fetching bookings:', err)
					this.error = 'Failed to load bookings'
					this.loading = false
					$notify.error('Failed to load bookings')
					this.requestUpdate()
				},
			})
	}

	/**
	 * Apply additional filters that can't be handled by Firestore queries efficiently
	 */
	private applyAdditionalFilters(
		bookings: Map<string, Booking>,
		filter: { status?: string; search?: string },
	): Map<string, Booking> {
		// If no additional filtering required, return as is
		if ((!filter.status || filter.status === 'all') && !filter.search) {
			return bookings
		}

		return new Map(
			Array.from(bookings.entries()).filter(([id, booking]) => {
				// Status filter
				if (filter.status && filter.status !== 'all') {
					if (filter.status === 'confirmed') {
						// Include both confirmed and completed bookings when filtering for confirmed
						if (booking.status !== 'confirmed' && booking.status !== 'completed') {
							return false
						}
					} else if (filter.status === 'holding') {
						// Show holding bookings
						if (booking.status !== 'holding') {
							return false
						}
					} else if (filter.status === 'cancelled') {
						// Show cancelled bookings
						if (booking.status !== 'cancelled') {
							return false
						}
					} else if (booking.status !== filter.status) {
						return false
					}
				}

				// Search filter (case insensitive)
				if (filter.search) {
					const searchTerm = filter.search.toLowerCase()
					const searchableFields = [
						booking.userName?.toLowerCase() || '',
						booking.userEmail?.toLowerCase() || '',
						booking.userPhone?.toLowerCase() || '',
						booking.customerEmail?.toLowerCase() || '',
						booking.customerPhone?.toLowerCase() || '',
						id.toLowerCase(),
					]

					if (!searchableFields.some(field => field.includes(searchTerm))) {
						return false
					}
				}

				return true
			}),
		)
	}

	render() {
		if (this.error) {
			return html`
				<div ${fullHeight()} class="flex items-center justify-center">
					<schmancy-surface type="container" rounded="all" class="p-8 max-w-md">
						<schmancy-typography type="headline" token="sm" class="mb-4 text-error-default">
							${this.error}
						</schmancy-typography>
						<schmancy-button @click=${this.fetchBookings}>Retry</schmancy-button>
					</schmancy-surface>
				</div>
			`
		}

		if (this.loading && !BookingsContext.value.size) {
			return html`
				<div class="loading-indicator">
					<schmancy-progress type="circular" size="md"></schmancy-progress>
				</div>
			`
		}

		return html`
			<schmancy-grid rows="auto auto 1fr" ${fullHeight()}>
 

        				<!-- Simplified Booking Filter -->
				<bookings-filter></bookings-filter>
				
				<!-- Booking Issues Alert -->
				<booking-issues-alert .venueId=${this.venue?.id}></booking-issues-alert>

				<!-- Day View Calendar -->
				<booking-day-view></booking-day-view>
			</schmancy-grid>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-list': VenuBookingsList
	}
}
