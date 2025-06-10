// src/admin/venues/bookings/bookings-filter.ts
import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { BehaviorSubject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs'
import { Booking } from 'src/types/booking/booking.types'
import { AllBookingsContext, bookingFilterContext, BookingsContext } from './bookings.context'

/**
 * Simplified bookings filter component with just status and search
 */
@customElement('bookings-filter')
export class BookingsFilter extends $LitElement(css`
  :host {
    display: block;
    width: 100%;
  }
  
  .filter-container {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    padding: 16px;
    background-color: var(--surface-1);
    border-radius: 8px;
  }
  
  .status-filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  
  .search-container {
    display: flex;
    flex-grow: 1;
    max-width: 400px;
  }

  @media (max-width: 768px) {
    .filter-container {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }
    
    .search-container {
      max-width: 100%;
    }
  }
`) {
  @select(BookingsContext) bookings!: Map<string, Booking>
  @select(AllBookingsContext) allBookings!: Map<string, Booking>
  @select(bookingFilterContext) filter!: { status?: string, search?: string }
  
  @state() statusList = [
    { value: 'all', label: 'All', icon: 'view_list' },
    { value: 'confirmed', label: 'Confirmed', icon: 'check_circle' },
    { value: 'holding', label: 'Holding', icon: 'hourglass_empty' },
    { value: 'cancelled', label: 'Cancelled', icon: 'cancel' }
  ]
  
  // Search query behavior subject for debouncing
  private searchSubject = new BehaviorSubject<string>('')

  connectedCallback(): void {
    super.connectedCallback()

    // Set up search debounce
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.disconnecting))
      .subscribe(searchValue => {
        this.updateFilter({ search: searchValue })
      })
    
    // Force re-render when AllBookingsContext updates to ensure counts are updated
    AllBookingsContext.$
      .pipe(takeUntil(this.disconnecting))
      .subscribe(() => {
        console.log('[BookingsFilter] AllBookingsContext updated, requesting re-render')
        this.requestUpdate()
      })
  }
  
  /**
   * Update the filter context with new values
   */
  private updateFilter(updates: { status?: string, search?: string }) {
    const currentFilter = bookingFilterContext.value || {}
    
    bookingFilterContext.set({
      ...currentFilter,
      ...updates
    })
  }
  
  /**
   * Handle status filter change
   */
  private handleStatusChange(e:CustomEvent<string>) {
    const status = e.detail ?? 'all'
    this.updateFilter({ status })
  }
  
  /**
   * Handle search input
   */
  private handleSearchInput(e: CustomEvent) {
    const value = e.detail.value
    this.searchSubject.next(value)
  }
  
  /**
   * Clear all filters
   */
  private clearFilters() {
    this.updateFilter({
      status: 'all', // Show all bookings by default to include holding
      search: ''
    })
    this.requestUpdate()
  }
  
  /**
   * Calculate booking counts by status
   */
  private getStatusCounts(): Record<string, number> {
    const counts: Record<string, number> = {
      all: 0,
      confirmed: 0,
      holding: 0,
      cancelled: 0
    }
    
    // Count bookings by status from all bookings (unfiltered)
    this.allBookings.forEach(booking => {
      counts.all++
      
      // Treat completed as confirmed
      if (booking.status === 'completed' || booking.status === 'confirmed') {
        counts.confirmed++
      } else if (booking.status === 'holding') {
        counts.holding++
      } else if (booking.status === 'cancelled') {
        counts.cancelled++
      }
    })
    
    return counts
  }
  
  render() {
    const statusCounts = this.getStatusCounts()
    const currentStatus = this.filter?.status || 'all' // Show all by default to include holding
    const currentSearch = this.filter?.search || ''
    
    return html`
           <!-- Simplified Booking Filter -->
				<schmancy-nav-drawer-appbar>


        </schmancy-nav-drawer-appbar>
				
      <schmancy-surface type="container" rounded="all" class="p-3">
        <div class="filter-container">
          <!-- Status filters -->
          <div class="status-filters">
            <schmancy-chips
              label="Status"
              .value=${currentStatus}
              @change=${this.handleStatusChange}
            >
              ${this.statusList.map(status => html`
                <schmancy-chip 
                  .value=${status.value}
                  ?disabled=${statusCounts[status.value] === 0 && status.value !== 'all'}
                >
                  <schmancy-icon slot="prefix" size="20px">${status.icon}</schmancy-icon>
                  ${status.label} 
                  ${statusCounts[status.value] > 0 ? html`<span>(${statusCounts[status.value]})</span>` : ''}
                </schmancy-chip>
              `)}
            </schmancy-chips>
          </div>
          
          <!-- Search -->
          <div class="search-container">
            <sch-input
              .value=${currentSearch}
              @change=${this.handleSearchInput}
              placeholder="Search bookings..."
              size="sm"
            >
              <schmancy-icon slot="prefix">search</schmancy-icon>
              ${currentSearch ? html`
                <schmancy-icon-button
                  slot="suffix"
                  @click=${() => this.updateFilter({ search: '' })}
                >
                  <schmancy-icon>close</schmancy-icon>
                </schmancy-icon-button>
              ` : ''}
            </sch-input>
          </div>
          
          <!-- Reset filters -->
          ${(currentStatus !== 'all' || currentSearch) ? html`
            <schmancy-button
              variant="text"
              @click=${this.clearFilters}
              size="sm"
            >
              Clear filters
            </schmancy-button>
          ` : ''}
        </div>
      </schmancy-surface>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bookings-filter': BookingsFilter
  }
}
