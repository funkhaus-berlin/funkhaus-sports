// components/bookings/booking-list.ts

import { $notify, filterMap, fullHeight, select, TableColumn } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import { html, TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { combineLatest, debounceTime, filter, map, startWith, switchMap, take, takeUntil, tap } from 'rxjs'
import { BookingsDB } from 'src/db/bookings.collection'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import { Booking } from 'src/public/book/context'
import { courtsContext } from '../courts/context'
import { venueContext } from '../venue-context'
import './bookings-filter'
import { bookingFilterContext, BookingsContext, DEFAULT_DATE_RANGE } from './bookings.context'
// Extend dayjs with isBetween plugin
dayjs.extend(isBetween)

@customElement('booking-list')
export class VenuBookingsList extends $LitElement() {
	@select(venueContext)
	venue!: Venue

	@select(courtsContext)
	courts!: Map<string, Court>

	@select(bookingFilterContext)
	bookingFilter!: any

	@select(BookingsContext) bookings!: Map<string, Booking>
	@state() filteredBookings: Booking[] = []
	@state() loading: boolean = true
	@state() error: string | null = null

	// Pagination
	@state() currentPage: number = 1
	@state() itemsPerPage: number = 10
	@state() totalPages: number = 1

	connectedCallback(): void {
		super.connectedCallback()
		this.fetchBookings()
	}

	/**
	 * Fetch bookings with reactive filtering
	 */
	fetchBookings(): void {
		// Wait for courts to be ready
		courtsContext.$.pipe(
			filter(() => !!courtsContext.ready),
			take(1),
			tap(() => {
				if (courtsContext.value.size === 0) {
					this.loading = false
					this.requestUpdate()
					return
				}
			}),
			switchMap(() => {
				// Combine filter changes with initial fetch
				return combineLatest([bookingFilterContext.$.pipe(startWith(bookingFilterContext.value), debounceTime(300))])
			}),
			switchMap(([filter]) => {
				this.loading = true

				// Get court IDs to filter by
				const courtIds = (filter.courts ?? [])?.length > 0 ? filter.courts : Array.from(this.courts.keys())

				return BookingsDB.subscribeToCollection([
					{
						key: 'courtId',
						operator: 'in',
						value: courtIds,
					},
				]).pipe(
					map(bookings => {
						console.log('Bookings:', bookings)
						BookingsContext.replace(bookings)
						// Filter bookings by date range
						const filteredByDate = new Map(
							Array.from(bookings).filter(([_, booking]) => {
								const dateFrom = dayjs(filter.dateFrom || DEFAULT_DATE_RANGE.dateFrom)
								const dateTo = dayjs(filter.dateTo || DEFAULT_DATE_RANGE.dateTo)
								const bookingDate = dayjs(booking.date)
								return true || bookingDate.isBetween(dateFrom, dateTo, 'day', '[]')
							}),
						)

						return filteredByDate
					}),
				)
			}),
			takeUntil(this.disconnecting),
		).subscribe({
			next: filteredBookings => {
				this.bookings = filteredBookings
				this.applyFilters()
				this.loading = false
			},
			error: err => {
				console.error('Error fetching bookings:', err)
				this.error = 'Failed to load bookings'
				this.loading = false
				$notify.error('Failed to load bookings')
			},
		})
	}

	/**
	 * Apply additional filters and pagination
	 */
	applyFilters(): void {
		// Apply status and search filters
		const filtered = filterMap<Booking>(this.bookings, [
			{
				key: 'status',
				operator: this.bookingFilter.status === 'all' ? 'in' : '==',
				value: this.bookingFilter.status === 'all' ? ['confirmed', 'pending', 'cancelled'] : this.bookingFilter.status,
			},
		])

		// Apply search filter if present
		let result = filtered
		if (this.bookingFilter.search) {
			const searchTerm = this.bookingFilter.search.toLowerCase()
			result = result.filter(
				booking =>
					booking.userName?.toLowerCase().includes(searchTerm) ||
					booking.customerEmail?.toLowerCase().includes(searchTerm) ||
					booking.customerPhone?.toLowerCase().includes(searchTerm) ||
					booking.id.toLowerCase().includes(searchTerm),
			)
		}

		// Sort bookings by date (newest first)
		result.sort((a, b) => {
			return dayjs(b.date).valueOf() - dayjs(a.date).valueOf()
		})

		// Calculate total pages
		this.totalPages = Math.ceil(result.length / this.itemsPerPage)

		// Apply pagination
		const startIndex = (this.currentPage - 1) * this.itemsPerPage
		const endIndex = startIndex + this.itemsPerPage
		this.filteredBookings = result.slice(startIndex, endIndex)
	}

	/**
	 * Navigate to a specific page
	 */
	goToPage(page: number): void {
		if (page < 1 || page > this.totalPages) return
		this.currentPage = page
		this.applyFilters()
	}

	/**
	 * View booking details
	 */
	// viewBooking(booking: Booking): void {
	// 	// sheet.open({
	// 	// 	component: new BookingDetails(booking),
	// 	// 	position: SchmancySheetPosition.Side,
	// 	// 	header: 'hidden',
	// 	// })
	// }

	/**
	 * Format the booking status with appropriate styling
	 */
	private getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'confirmed':
				return 'bg-success-container text-success-on'
			case 'cancelled':
				return 'bg-error-container text-error-on'
			case 'pending':
				return 'bg-warning-container text-warning-on'
			default:
				return 'bg-surface-container text-surface-on'
		}
	}

	/**
	 * Get court name from court ID
	 */
	private getCourtName(courtId: string): string {
		return this.courts.get(courtId)?.name || 'Unknown Court'
	}

	render(): TemplateResult {
		// Define table columns
		const columns: TableColumn[] = [
			{
				name: 'Customer',
				key: 'userName',
				render: (booking: Booking) => html`${booking.userName || booking.customerEmail || 'Guest'}`,
			},
			{
				name: 'Court',
				key: 'courtId',
				render: (booking: Booking) => html`${this.getCourtName(booking.courtId)}`,
			},
			{
				name: 'Date',
				key: 'date',
				render: (booking: Booking) => html`${dayjs(booking.date).format('MMM D, YYYY')}`,
			},
			{
				name: 'Time',
				key: 'startTime',
				render: (booking: Booking) => html`${dayjs(booking.startTime).format('h:mm A')}`,
			},
			{
				name: 'Status',
				key: 'status',
				render: (booking: Booking) => html`
					<span class="px-2 py-1 rounded-full text-xs ${this.getStatusBadgeClass(booking.status || 'pending')}">
						${booking.status || 'pending'}
					</span>
				`,
			},
			{
				name: 'Price',
				key: 'price',
				render: (booking: Booking) => html`€${booking.price?.toFixed(2) || '0.00'}`,
			},
		]

		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all">
				<schmancy-grid ${fullHeight()} rows="auto auto 1fr auto" class="gap-4 p-4">
					<!-- Header -->
					<schmancy-grid cols="1fr auto" align="start">
						<schmancy-typography type="headline" token="sm">Venue Bookings</schmancy-typography>
						<schmancy-chip readOnly class="pointer-events-none" label=${`${this.bookings.size} Bookings`}
							>${this.bookings.size} Bookings</schmancy-chip
						>
					</schmancy-grid>

					<!-- Filters -->
					<booking-filter .courts=${this.courts} .users=${this.bookings}></booking-filter>

					<!-- Bookings Table -->
					<div class="overflow-y-auto">
						${when(
							this.loading,
							() => html`
								<div class="flex justify-center items-center py-8">
									<schmancy-spinner></schmancy-spinner>
								</div>
							`,
							() => this.renderBookingsTable(),
						)}
					</div>

					<!-- Pagination -->
					<schmancy-flex justify="center" gap="sm" class="pb-2">
						<schmancy-button
							variant="text"
							@click=${() => this.goToPage(this.currentPage - 1)}
							?disabled=${this.currentPage === 1}
						>
							<schmancy-icon>chevron_left</schmancy-icon>
						</schmancy-button>

						<schmancy-typography type="body" class="flex items-center">
							Page ${this.currentPage} of ${this.totalPages || 1}
						</schmancy-typography>

						<schmancy-button
							variant="text"
							@click=${() => this.goToPage(this.currentPage + 1)}
							?disabled=${this.currentPage >= this.totalPages}
						>
							<schmancy-icon>chevron_right</schmancy-icon>
						</schmancy-button>
					</schmancy-flex>
				</schmancy-grid>
			</schmancy-surface>
		`
	}

	/**
	 * Render the bookings table or empty state
	 */
	private renderBookingsTable(): TemplateResult {
		if (this.error) {
			return html`
				<div class="text-center text-error py-8">
					<schmancy-icon>error</schmancy-icon>
					<p>${this.error}</p>
				</div>
			`
		}

		if (this.filteredBookings.length === 0) {
			return html`
				<div class="text-center py-8">
					<schmancy-icon size="3rem" class="text-surface-on-variant opacity-50">calendar_month</schmancy-icon>
					<schmancy-typography type="body" class="mt-2">
						No bookings found for the selected filters.
					</schmancy-typography>
				</div>
			`
		}

		return html`
			<schmancy-table-v2
				.cols=${'minmax(150px, 1fr) minmax(150px, 1fr) 150px 150px 100px 100px'}
				.columns=${[
					{ name: 'Customer', key: 'userName', align: 'left', sortable: true },
					{ name: 'Court', key: 'courtId', align: 'left', sortable: true },
					{ name: 'Date', key: 'date', align: 'center', sortable: true },
					{ name: 'Time', key: 'startTime', align: 'center', sortable: true },
					{ name: 'Status', key: 'status', align: 'center', sortable: true },
					{ name: 'Price', key: 'price', align: 'right', sortable: true },
				] as TableColumn[]}
				.data=${this.filteredBookings}
				keyField="id"
				sortable
			></schmancy-table-v2>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-list': VenuBookingsList
	}
}
