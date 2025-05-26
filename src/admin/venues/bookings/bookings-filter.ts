// src/admin/venues/bookings/bookings-filter.ts
import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { BehaviorSubject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs'
import { Booking } from 'src/types/booking/models'
import { bookingFilterContext, BookingsContext } from './bookings.context'

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
  @select(bookingFilterContext) filter!: { status?: string, search?: string }
  
  @state() statusList = ['all', 'confirmed', 'holding', 'completed', 'cancelled']
  
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
  private handleStatusChange(status: string) {
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
      status: 'all',
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
      pending: 0,
      completed: 0,
      cancelled: 0
    }
    
    // Count bookings by status
    this.bookings.forEach(booking => {
      counts.all++
      
      if (booking.status && counts[booking.status] !== undefined) {
        counts[booking.status]++
      }
    })
    
    return counts
  }
  
  render() {
    const statusCounts = this.getStatusCounts()
    const currentStatus = this.filter?.status || 'all'
    const currentSearch = this.filter?.search || ''
    
    return html`
      <schmancy-surface type="container" rounded="all" class="p-3">
        <div class="filter-container">
          <!-- Status filters -->
          <div class="status-filters">
            ${this.statusList.map(status => html`
              <schmancy-chip
                variant=${currentStatus === status ? 'filled' : 'outlined'}
                @click=${() => this.handleStatusChange(status)}
                ?disabled=${statusCounts[status] === 0 && status !== 'all'}
              >
                ${status.charAt(0).toUpperCase() + status.slice(1)} 
                ${statusCounts[status] > 0 ? html`<span>(${statusCounts[status]})</span>` : ''}
              </schmancy-chip>
            `)}
          </div>
          
          <!-- Search -->
          <div class="search-container">
            <sch-input
              .value=${currentSearch}
              @change=${this.handleSearchInput}
              placeholder="Search bookings..."
              size="md"
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
