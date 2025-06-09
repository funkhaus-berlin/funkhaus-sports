import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { BehaviorSubject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs'
import { Court } from 'src/types/booking/court.types'
import { BookingStatus } from 'src/types/booking/booking.types'
import { bookingFilterContext, DEFAULT_DATE_RANGE, TBookingFilter } from '../bookings.context'

@customElement('booking-advanced-filter')
export class BookingAdvancedFilter extends $LitElement() {
  @select(bookingFilterContext)
  bookingFilter!: TBookingFilter

  @property({ type: Object })
  courts: Map<string, Court> = new Map()

  @property({ type: Array })
  statuses: BookingStatus[] = [
    'holding',
    'confirmed',
    'cancelled',
    'completed',
  ]

  @state() showFilters = false
  private searchSubject = new BehaviorSubject<string>('')

  connectedCallback(): void {
    super.connectedCallback()
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.disconnecting))
      .subscribe(searchValue => {
        bookingFilterContext.set({ ...bookingFilterContext.value, search: searchValue })
      })
  }

  private updateStatus(e: CustomEvent): void {
    bookingFilterContext.set({
      ...bookingFilterContext.value,
      status: e.detail.value,
    })
  }

  private handleSearchInput(e: CustomEvent): void {
    const searchValue = e.detail.value
    this.searchSubject.next(searchValue)
  }

  private applyDatePreset(preset: 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'thisMonth'): void {
    let dateFrom, dateTo

    switch (preset) {
      case 'today':
        dateFrom = dayjs().startOf('day').toISOString()
        dateTo = dayjs().endOf('day').toISOString()
        break
      case 'tomorrow':
        dateFrom = dayjs().add(1, 'day').startOf('day').toISOString()
        dateTo = dayjs().add(1, 'day').endOf('day').toISOString()
        break
      case 'thisWeek':
        dateFrom = dayjs().startOf('week').toISOString()
        dateTo = dayjs().endOf('week').toISOString()
        break
      case 'nextWeek':
        dateFrom = dayjs().add(1, 'week').startOf('week').toISOString()
        dateTo = dayjs().add(1, 'week').endOf('week').toISOString()
        break
      case 'thisMonth':
        dateFrom = dayjs().startOf('month').toISOString()
        dateTo = dayjs().endOf('month').toISOString()
        break
    }

    bookingFilterContext.set({
      ...bookingFilterContext.value,
      dateFrom,
      dateTo,
    })
  }

  private clearFilters(): void {
    bookingFilterContext.set({
      dateFrom: DEFAULT_DATE_RANGE.dateFrom,
      dateTo: DEFAULT_DATE_RANGE.dateTo,
      status: undefined,
      courts: [],
      search: '',
    })
  }

  // Determine if a date preset is currently active
  private isDatePresetActive(preset: string): boolean {
    if (!this.bookingFilter?.dateFrom || !this.bookingFilter?.dateTo) return false

    const dateFrom = dayjs(this.bookingFilter.dateFrom)
    const dateTo = dayjs(this.bookingFilter.dateTo)

    switch (preset) {
      case 'today':
        return dateFrom.isSame(dayjs(), 'day') && dateTo.isSame(dayjs(), 'day')
      case 'tomorrow':
        return dateFrom.isSame(dayjs().add(1, 'day'), 'day') && dateTo.isSame(dayjs().add(1, 'day'), 'day')
      case 'thisWeek':
        return dateFrom.isSame(dayjs().startOf('week'), 'day') && dateTo.isSame(dayjs().endOf('week'), 'day')
      case 'nextWeek':
        return (
          dateFrom.isSame(dayjs().add(1, 'week').startOf('week'), 'day') &&
          dateTo.isSame(dayjs().add(1, 'week').endOf('week'), 'day')
        )
      case 'thisMonth':
        return dateFrom.isSame(dayjs().startOf('month'), 'day') && dateTo.isSame(dayjs().endOf('month'), 'day')
      default:
        return false
    }
  }

  private getDateButtonClasses(preset: string): string {
    const baseClasses = "py-1.5 px-3 rounded-full text-xs cursor-pointer border border-outline-variant transition-all duration-200 font-medium"
    const activeClasses = "bg-primary-container text-on-primary-container border-primary-default"
    const inactiveClasses = "bg-transparent text-on-surface hover:bg-surface-container-high"
    
    return `${baseClasses} ${this.isDatePresetActive(preset) ? activeClasses : inactiveClasses}`
  }

  render() {
    return html`
      <div class="relative z-10">
        <div class="py-2 flex items-center gap-2 w-full">
          <!-- Quick date filters - Google Calendar style buttons -->
          <div class="flex gap-1">
            <button
              class=${this.getDateButtonClasses('today')}
              @click=${() => this.applyDatePreset('today')}
            >
              Today
            </button>
            <button
              class=${this.getDateButtonClasses('tomorrow')}
              @click=${() => this.applyDatePreset('tomorrow')}
            >
              Tomorrow
            </button>
            <button
              class=${this.getDateButtonClasses('thisWeek')}
              @click=${() => this.applyDatePreset('thisWeek')}
            >
              This Week
            </button>
            <button
              class=${this.getDateButtonClasses('thisMonth')}
              @click=${() => this.applyDatePreset('thisMonth')}
            >
              This Month
            </button>
          </div>

          <!-- Divider -->
          <schmancy-divider vertical class="h-6"></schmancy-divider>

          <!-- Search input -->
          <sch-input
            .value=${this.bookingFilter?.search || ''}
            @change=${this.handleSearchInput}
            placeholder="Search bookings..."
            size="sm"
            class="w-60 flex-none"
          >
            <schmancy-icon slot="prefix">search</schmancy-icon>
          </sch-input>

          <!-- Status filter chips -->
          <div class="ml-auto">
            <schmancy-chip-group
              .selected=${this.bookingFilter?.status || ''}
              @change=${this.updateStatus}
              size="small"
              appearance="outlined"
            >
              <schmancy-chip value="">All</schmancy-chip>
              <schmancy-chip value="confirmed">Active</schmancy-chip>
              <schmancy-chip value="completed">Done</schmancy-chip>
              <schmancy-chip value="cancelled">Cancelled</schmancy-chip>
            </schmancy-chip-group>
          </div>

          <!-- Reset Button -->
          <schmancy-icon-button 
            size="sm" 
            class="flex-none" 
            @click=${this.clearFilters} 
            title="Reset filters"
          >
            restart_alt
          </schmancy-icon-button>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'booking-advanced-filter': BookingAdvancedFilter
  }
}
