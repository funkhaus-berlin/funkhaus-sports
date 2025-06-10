// src/admin/venues/bookings/components/booking-day-view.ts
import { select, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs, { Dayjs } from 'dayjs'
import calendar from 'dayjs/plugin/calendar'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import relativeTime from 'dayjs/plugin/relativeTime'
import { html, TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { combineLatest, map, Subscription, takeUntil, timer } from 'rxjs'
import { Court } from 'src/types/booking/court.types'
import { Venue } from 'src/types/booking/venue.types'
import { Booking, BookingStatus } from 'src/types/booking/booking.types'
import { courtsContext } from '../../courts/context'
import { venueContext } from '../../venue-context'
import { bookingFilterContext, BookingsContext } from '../bookings.context'
import { BookingDetails } from './booking-details'

// Initialize dayjs plugins
dayjs.extend(relativeTime)
dayjs.extend(localizedFormat)
dayjs.extend(calendar)

/**
 * A component that provides a day view of bookings across all courts for a venue
 * @element booking-day-view
 */
@customElement('booking-day-view')
export class BookingDayView extends $LitElement() {
  /**
   * All bookings from the context
   */
  @select(BookingsContext)
  bookings!: Map<string, Booking>

  /**
   * All courts from the context
   */
  @select(courtsContext)
  allCourts!: Map<string, Court>
  
  /**
   * Current venue from context
   */
  @select(venueContext)
  venue!: Partial<Venue>
  
  /**
   * Courts filtered for the current venue
   */
  @state() 
  courts: Map<string, Court> = new Map()

  /**
   * Current date being viewed
   */
  @state() 
  currentDate: Dayjs = dayjs()
  
  /**
   * Booking filter from context
   */
  @select(bookingFilterContext)
  bookingFilter!: { dateFrom?: string; dateTo?: string; status?: string; search?: string }
  
  /**
   * Bookings for the current day
   */
  @state() 
  dayBookings: Booking[] = []
  
  /**
   * Whether the current date being viewed is today
   */
  @state() 
  isToday = false
  
  /**
   * Bookings organized by court
   */
  @state() 
  courtBookings: Map<string, Booking[]> = new Map()
  
  /**
   * Subscriptions for cleanup
   */
  private subscriptions: Subscription[] = []

  /**
   * Component initialization
   */
  connectedCallback(): void {
    super.connectedCallback()
    this.initializeWithVenueAndCourts()
    this.initializeDateFromFilter()
    this.checkIfToday()
    this.subscribeToBookingChanges()
  }
  
  /**
   * Cleanup subscriptions on disconnect
   */
  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.subscriptions.forEach(sub => sub.unsubscribe())
  }

  /**
   * Initialize with current venue and courts
   */
  private initializeWithVenueAndCourts(): void {
    // Subscribe to courts and venue context changes
    combineLatest([courtsContext.$, venueContext.$]).pipe(
      map(([courts, venue]) => {
        const venueId = venue?.id
        
        if (!venueId) {
          this.courts = new Map()
          return
        }
        
        // Filter courts for current venue
        this.courts = new Map(
          Array.from(courts.values())
            .filter(court => court.venueId === venueId)
            .map(court => [court.id, court])
        )
        
        // Don't update filter context during initialization
        // Let the parent component manage the filter
      }),
      takeUntil(this.disconnecting)
    ).subscribe()
  }
  
  /**
   * Initialize date from filter context
   */
  private initializeDateFromFilter(): void {
    // Subscribe to filter changes to sync date
    bookingFilterContext.$.pipe(
      map(() => {
        const filter = bookingFilterContext.value
        if (filter?.dateFrom) {
          // Only update if the date is different to avoid loops
          const filterDate = dayjs(filter.dateFrom).startOf('day')
          if (!filterDate.isSame(this.currentDate, 'day')) {
            this.currentDate = filterDate
            this.checkIfToday()
          }
        }
      }),
      takeUntil(this.disconnecting)
    ).subscribe()
  }

  /**
   * Update the filter context with current date
   */
  private updateFilterDate(): void {
    const dateFilter = {
      dateFrom: this.currentDate.startOf('day').toISOString(),
      dateTo: this.currentDate.endOf('day').toISOString()
    }
    
    // Update booking filter context
    const currentFilter = bookingFilterContext.value || {}
    bookingFilterContext.set({
      ...currentFilter,
      ...dateFilter
    })
  }

  /**
   * Subscribe to booking changes from context
   */
  private subscribeToBookingChanges(): void {
    // Subscribe to bookings context changes
    const bookingSub = BookingsContext.$.pipe(
      map(() => {
        this.organizeBookingsByDate()
        return BookingsContext.value
      }),
      takeUntil(this.disconnecting)
    ).subscribe()
    
    this.subscriptions.push(bookingSub)
    
    // Update isToday every minute
    const timerSub = timer(0, 60000).pipe(
      takeUntil(this.disconnecting)
    ).subscribe(() => {
      this.checkIfToday()
    })
    
    this.subscriptions.push(timerSub)
  }
  
  /**
   * Check if current view date is today
   */
  private checkIfToday(): void {
    this.isToday = this.currentDate.isSame(dayjs(), 'day')
  }
  

  /**
   * Organize bookings for the current date grouped by court
   */
  private organizeBookingsByDate(): void {
    // The bookings should now be pre-filtered by the filter context
    // We just need to organize them by court
    this.dayBookings = Array.from(this.bookings.values())
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
    
    // Group bookings by court
    this.courtBookings = new Map()
    
    // Initialize all courts with empty arrays
    this.courts.forEach((_, courtId) => {
      this.courtBookings.set(courtId, [])
    })
    
    // Add bookings to their respective courts
    this.dayBookings.forEach(booking => {
      if (this.courtBookings.has(booking.courtId)) {
        const courtBookingList = this.courtBookings.get(booking.courtId) || []
        courtBookingList.push(booking)
        this.courtBookings.set(booking.courtId, courtBookingList)
      }
    })
    
    // Check if viewing today
    this.checkIfToday()
  }



  /**
   * Render the component
   */
  render(): TemplateResult {
    return html`
      <div class="flex flex-col h-full w-full">
        <!-- Header with date and navigation -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <schmancy-button variant="outlined" @click=${() => {
            this.currentDate = this.currentDate.subtract(1, 'day')
            this.updateFilterDate()
          }}>
            <schmancy-icon>chevron_left</schmancy-icon>
            Previous
          </schmancy-button>
          
          <div class="flex flex-col items-center">
            <schmancy-typography type="headline" token="md">${this.currentDate.format('dddd, MMMM D, YYYY')}</schmancy-typography>
            ${this.isToday 
              ? html`<span class="text-sm text-primary-500 font-medium">(Today)</span>` 
              : html`<schmancy-button variant="text" @click=${() => {
                  this.currentDate = dayjs()
                  this.updateFilterDate()
                }} size="sm">Today</schmancy-button>`
            }
          </div>
          
          <schmancy-button variant="outlined" @click=${() => {
            this.currentDate = this.currentDate.add(1, 'day')
            this.updateFilterDate()
          }}>
            Next
            <schmancy-icon>chevron_right</schmancy-icon>
          </schmancy-button>
        </div>
        
        <!-- Court columns with bookings -->
        <div class="flex-1 overflow-auto">
          ${!(this.courts && this.courts.size > 0) 
            ? html`
              <div class="flex flex-col items-center justify-center h-full p-8 text-center">
                <schmancy-icon class="text-6xl text-gray-300 mb-4">sports_tennis</schmancy-icon>
                <schmancy-typography type="title" token="md">No courts available</schmancy-typography>
                <schmancy-typography type="body" token="md" class="mt-2 text-gray-600">
                  Please add courts to view the booking calendar.
                </schmancy-typography>
              </div>
            `
            : html`
              <!-- Court headers and booking lists -->
              <div class="flex border-b border-gray-200">
                ${Array.from(this.courts.entries())
                  .sort(([, a], [, b]) => {
                    // Natural sort that handles numbers properly
                    return a.name.localeCompare(b.name, undefined, { 
                      numeric: true, 
                      sensitivity: 'base' 
                    })
                  })
                  .map(([courtId, court]) => {
                  const bookings = this.courtBookings.get(courtId) || []
                  
                  return html`
                    <div class="flex-1 p-2 min-w-[200px] border-r border-gray-200">
                      <!-- Court header -->
                      <div class="px-3 py-2 mb-3 bg-gray-50 rounded-md text-center">
                        <div class="font-medium">${court.name}</div>
                        <div class="text-xs text-gray-500">${court.courtType || 'Court'}</div>
                        <div class="text-sm mt-1">
                          ${bookings.length 
                            ? html`${bookings.length} booking${bookings.length > 1 ? 's' : ''}`
                            : html`<span class="text-gray-500">No bookings</span>`
                          }
                        </div>
                      </div>
                      
                      <!-- Bookings list -->
                      <div class="space-y-2">
                        ${bookings.length === 0 
                          ? html`<div class="text-center py-6">
                              <div class="text-gray-400 text-sm">No bookings for this court today</div>
                            </div>`
                          : bookings.map(booking => {
                            return html`
                              <div 
                                class="rounded  bg-secondary-container/90 p-2 cursor-pointer  hover:scale-110 transition-all duration-100"
                                @click=${() => {
                                  sheet.open({
                                    component:new BookingDetails(booking)
                                  })
                                }}
                              >
                                <div class="flex justify-between items-center text-xs font-medium mb-1">
                                  <div>${dayjs(booking.startTime).local().format('HH:mm')} - ${dayjs(booking.endTime).local().format('HH:mm')}</div>
                                  <div class="border border-gray-200 rounded px-2 py-0.5 text-xs">
                                    ${booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                                  </div>
                                </div>
                                
                                <div class="font-medium text-sm">${booking.userName}</div>
                                
                                <div class="text-xs opacity-75 mt-1">
                                  ${booking.customerEmail || booking.userEmail || ''}
                                </div>
                                
                                <div class="text-xs opacity-75 mt-1">
                                  ${booking.notes ? booking.notes.substring(0, 25) + (booking.notes.length > 25 ? '...' : '') : 'No notes'}
                                </div>
                              </div>
                            `
                          })
                        }
                      </div>
                    </div>
                  `
                })}
              </div>
            `
          }
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'booking-day-view': BookingDayView
  }
}
