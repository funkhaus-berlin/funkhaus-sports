// components/bookings/booking-filter.ts

import { SchmancyDateRangeChangeEvent, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html, TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { BehaviorSubject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs'
import { Court } from 'src/db/courts.collection'
import { Booking } from 'src/public/book/context'
import { bookingFilterContext, BookingsContext, DEFAULT_DATE_RANGE, TBookingFilter } from './bookings.context'

@customElement('booking-filter')
export class BookingFilter extends $LitElement() {
	@select(bookingFilterContext)
	bookingFilter!: TBookingFilter

	@select(BookingsContext)
	bookings!: Map<string, Booking>

	@property({ type: Object })
	courts: Map<string, Court> = new Map()

	@property({ type: Array })
	statuses: string[] = ['all', 'confirmed', 'pending', 'cancelled']

	// Search query behavior subject for debouncing
	private searchSubject = new BehaviorSubject<string>('')

	connectedCallback(): void {
		super.connectedCallback()

		// Set up search debounce
		this.searchSubject
			.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.disconnecting))
			.subscribe(searchValue => {
				bookingFilterContext.set({ search: searchValue })
			})
	}

	// Update date range filter
	private updateDateRange(e: SchmancyDateRangeChangeEvent): void {
		let { dateFrom, dateTo } = e.detail
		if (!dateFrom || !dateTo) return

		// If same date, set to full day range
		if (dateFrom === dateTo) {
			dateFrom = dayjs(dateFrom).startOf('day').toISOString()
			dateTo = dayjs(dateTo).endOf('day').toISOString()
		}

		bookingFilterContext.set({
			dateFrom,
			dateTo,
		})
	}

	// Update status filter
	private updateStatus(e: CustomEvent): void {
		bookingFilterContext.set({ status: e.detail.value })
	}

	// Handle search input
	private handleSearchInput(e: CustomEvent): void {
		const searchValue = e.detail.value
		this.searchSubject.next(searchValue)
	}

	render(): TemplateResult {
		return html`
			<schmancy-surface type="container" rounded="all" class="p-3">
				<!-- Top row with primary filters -->
				<schmancy-grid cols="1fr 1fr 1fr" gap="md">
					<!-- Date Range -->
					<schmancy-date-range
						.dateFrom=${{
							label: 'From',
							value: this.bookingFilter.dateFrom ?? DEFAULT_DATE_RANGE.dateFrom,
						}}
						.dateTo=${{
							label: 'To',
							value: this.bookingFilter.dateTo ?? DEFAULT_DATE_RANGE.dateTo,
						}}
						@change=${this.updateDateRange}
					></schmancy-date-range>

					<!-- Status Filter -->
					<schmancy-select
						placeholder="Status"
						.value=${this.bookingFilter.status || 'all'}
						@change=${this.updateStatus}
						size="md"
					>
						${this.statuses.map(
							status => html`
								<schmancy-option value="${status}">
									${status.charAt(0).toUpperCase() + status.slice(1)}
								</schmancy-option>
							`,
						)}
					</schmancy-select>

					<!-- Search -->
					<sch-input
						.value=${this.bookingFilter.search || ''}
						@change=${this.handleSearchInput}
						placeholder="Search bookings..."
						size="md"
					>
						<schmancy-icon slot="prefix">search</schmancy-icon>
					</sch-input>
				</schmancy-grid>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-filter': BookingFilter
	}
}
