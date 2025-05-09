import { area } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import './court-detail'
import './courts'

/**
 * Court Routes Component
 * 
 * Handles routing for courts within the venue detail view using Schmancy area
 */
@customElement('court-routes')
export class CourtRoutes extends $LitElement() {
  @state() private venueId: string = ''
  @state() private courtId: string = ''
  @state() private isNew: boolean = false

  connectedCallback(): void {
    super.connectedCallback()
    
    // Extract venueId and courtId from URL path
    const path = window.location.pathname
    const pathSegments = path.split('/')
    
    // Find venueId from URL path
    const venueIdIndex = pathSegments.findIndex(segment => segment === 'venues') + 1
    if (venueIdIndex > 0 && venueIdIndex < pathSegments.length) {
      this.venueId = pathSegments[venueIdIndex]
    }
    
    // Find courtId from URL path if exists
    const courtIdIndex = pathSegments.findIndex(segment => segment === 'courts') + 1
    if (courtIdIndex > 0 && courtIdIndex < pathSegments.length) {
      // Check if this is a "new" court or an existing court ID
      if (pathSegments[courtIdIndex] === 'new') {
        this.isNew = true
      } else {
        this.courtId = pathSegments[courtIdIndex]
      }
    }
    
    // Set up routing based on URL path
    this._setupRouting()
  }
  
  /**
   * Set up routing based on path components
   */
  private _setupRouting(): void {
    const path = window.location.pathname
    
    // Handle different routes
    if (path.includes('/courts/new')) {
      // Creating a new court
      // First clear any existing court in context
      import('./context').then(({ selectedCourtContext }) => {
        // Clear selected court context to ensure a clean state
        selectedCourtContext.set({});
        
        const state = { venueId: this.venueId, isNew: true };
        
        // Use setTimeout to ensure context is cleared before navigation
        setTimeout(() => {
          area.push({
            component: 'court-detail',
            area: 'venue',
            state: state
          });
        }, 100);
      });
    } else if (path.includes('/courts/') && this.courtId) {
      // Editing an existing court
      // Load the courts collection to find this court
      import('./context').then(({ courtsContext, selectedCourtContext }) => {
        // Check if we have the court in the courts map
        const court = Array.from(courtsContext.get().values())
          .find(court => court.id === this.courtId);
        
        if (court) {
          console.log('Found court data in courtsContext:', court);
          
          // First, update the court context to ensure data is consistent
          selectedCourtContext.set(court);
          
          // Create a consistent state object
          const state = { venueId: this.venueId, courtId: this.courtId };
          
          // Use setTimeout to ensure context is updated before navigation
          setTimeout(() => {
            // Push the court-detail component
            area.push({
              component: 'court-detail',
              area: 'venue',
              state: state
            });
          }, 100);
        } else {
          console.log('Court not found in context, loading by ID:', this.courtId);
          // Fallback if court not found in context
          const state = { venueId: this.venueId, courtId: this.courtId };
          
          area.push({
            component: 'court-detail',
            area: 'venue',
            state: state
          });
        }
      });
    } else {
      // Default to listing courts
      area.push({
        component: 'funkhaus-venue-courts',
        area: 'venue',
        state: { venueId: this.venueId }
      });
    }
  }

  render() {
    // We don't use a separate court area - we integrate with the venue area
    return html``
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'court-routes': CourtRoutes
  }
}