// src/admin/venues/scanner/scanner-view.ts
import { fullHeight } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { select } from '@mhmo91/schmancy'
import { venueContext } from '../../venues/venue-context'
import './scanner'

/**
 * Scanner view integration for the admin panel
 * This component serves as a wrapper to embed the booking scanner in the admin area
 */
@customElement('scanner-view')
export class ScannerView extends $LitElement() {
  @select(venueContext)
  venue: any

  @state()
  currentVenueId = ''

  connectedCallback() {
    super.connectedCallback()
    // Get venue ID from context
    if (this.venue?.id) {
      this.currentVenueId = this.venue.id
    }
  }

  render() {
    return html`
      <div ${fullHeight()} class="relative inset-0">
      ${this.currentVenueId ? 
        html`
        <div
          class="absolute top-0 inset-x-0 bg-white/30 backdrop-blur-md shadow-md text-surface-on p-2 mb-4"
        >
          <schmancy-typography type="headline" token="sm">
          Scanner for venue: ${this.venue?.name || this.currentVenueId}
          </schmancy-typography>
        </div>
        ` : ''
      }
      <booking-scanner venueId="${this.currentVenueId}"></booking-scanner>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'scanner-view': ScannerView
  }
}
