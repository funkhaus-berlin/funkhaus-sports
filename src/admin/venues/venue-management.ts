import { fullHeight, select, sheet, TableColumn } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { Venue } from 'src/db/venues.collection'
import { venuesContext } from './context'
import { formatEnum, VenueForm } from './form'

// --- Venue Management Component ---
@customElement('venue-management')
export class VenueManagement extends $LitElement() {
  @select(venuesContext, undefined, {
    required: true,
  })
  venues!: Map<string, Venue>
  
  @state() loading: boolean = true
  @state() error: string | null = null

  // Status configuration
  private statusConfig = {
    active: { label: 'Active', icon: 'check_circle', next: 'maintenance', nextLabel: 'Under Maintenance' },
    maintenance: { label: 'Maintenance', icon: 'construction', next: 'inactive', nextLabel: 'Inactive' },
    inactive: { label: 'Inactive', icon: 'cancel', next: 'active', nextLabel: 'Active' },
  }

  // Table columns definition
  private columns: TableColumn[] = [
    { name: 'Name', key: 'name', align: 'left', sortable: true },
    {
      name: 'Type',
      align: 'left',
      render: (venue: Venue) => formatEnum(venue.venueType || ''),
    },
    {
      name: 'Location',
      align: 'left',
      render: (venue: Venue) => html`${venue.address.city}, ${venue.address.country}`,
    },
    {
      name: 'Facilities',
      align: 'left',
      render: (venue: Venue) => {
        const facilitiesCount = venue.facilities?.length || 0
        return html`
          <div class="flex items-center gap-1">
            <schmancy-icon>fitness_center</schmancy-icon>
            <span>${facilitiesCount} ${facilitiesCount === 1 ? 'facility' : 'facilities'}</span>
          </div>
        `
      }
    },
    {
      name: 'Capacity',
      align: 'left',
      render: (venue: Venue) => venue.maxCourtCapacity ? html`${venue.maxCourtCapacity} courts` : '-',
    },
    {
      name: 'Status',
      align: 'left',
      render: (venue: Venue) => {
        const status = (venue.status as keyof typeof this.statusConfig) || 'inactive'
        const config = this.statusConfig[status]
        return html`
          <schmancy-chip
            @click=${(e: Event) => {
              e.preventDefault()
            }}
            .selected=${status === 'active'}
            .label=${config.label}
            readOnly
          >
            ${config.icon}
          </schmancy-chip>
        `
      },
    },
    {
      name: ' ',
      align: 'right',
      render: (venue: Venue) => html`
        <schmancy-icon-button
          @click=${() => {
            sheet.open({
              component: new VenueForm(venue),
            })
          }}
          title="Edit"
          >edit</schmancy-icon-button
        >
      `,
    },
  ]

  render() {
    return html`
      <schmancy-surface ${fullHeight()} type="container" rounded="all" elevation="1">
        <div ${fullHeight()} class="max-w-4xl mx-auto p-4 h-full grid grid-rows-[auto_1fr] gap-4">
          <schmancy-flex justify="between" align="center" class="pb-4">
            <schmancy-typography type="headline">Venue Management</schmancy-typography>
            <schmancy-button
              variant="filled"
              @click=${() => {
                sheet.open({
                  component: new VenueForm(),
                })
              }}
            >
              <schmancy-icon>add</schmancy-icon>Add Venue
            </schmancy-button>
          </schmancy-flex>

          ${when(
            this.error,
            () => html`<schmancy-alert variant="error">${this.error}</schmancy-alert>`,
            () =>
              when(venuesContext.ready === true, () =>
                when(
                  this.venues.size === 0,
                  () => html`<schmancy-empty-state
                    icon="location_on"
                    title="No Venues Found"
                    description="Add a venue to get started managing your sports facilities."
                  >
                    <schmancy-button
                      variant="filled"
                      @click=${() => {
                        sheet.open({
                          component: new VenueForm(),
                        })
                      }}
                    >
                      Add Your First Venue
                    </schmancy-button>
                  </schmancy-empty-state>`,
                  () => html`<schmancy-table-v2
                    .cols=${this.columns.map(_ => '1fr').join(' ')}
                    .columns=${this.columns}
                    .data=${Array.from(this.venues.values())}
                    sortable
                  ></schmancy-table-v2>`,
                ),
              ),
          )}
        </div>
      </schmancy-surface>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'venue-management': VenueManagement
  }
}
