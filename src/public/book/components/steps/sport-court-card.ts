import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { unsafeSVG } from 'lit/directives/unsafe-svg.js'
import { CourtTypeEnum } from 'src/db/courts.collection'

// Import SVGs as raw strings (assumes proper webpack/vite configuration)
import padelSVG from '/public/svg/padel-court.svg?raw'
import pickleballSVG from '/public/svg/pickleball-court.svg?raw'
import volleyballSVG from '/public/svg/volleyball-court.svg?raw'

/**
 * Define court types with type safety
 */
const COURT_TYPES = ['padel', 'pickleball', 'volleyball'] as const
type CourtType = (typeof COURT_TYPES)[number]

/**
 * Recommended player counts for different court types
 */
const PLAYER_COUNTS: Record<CourtType, number[]> = {
  padel: [2, 4],
  pickleball: [2, 4],
  volleyball: [4, 6, 8, 12],
}

/**
 * Detail for court click events
 */
interface CourtClickDetail {
  id: string
  type: CourtType
  name: string
}

/**
 * Court Card Component
 *
 * Visual representation of a court with SVG visualization, badges for court type
 * and player count, and selection/disabled states.
 */
@customElement('sport-court-card')
export class SportCourtCard extends $LitElement(css`
  :host {
    display: block;
    transition: transform 0.2s ease-in-out;
  }

  :host(:not([disabled]):hover) {
    transform: scale(1.02);
  }

  .svg-wrapper {
    width: 100%;
    height: 100%;
    min-height: fit-content;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: visible;
  }

  .svg-wrapper svg {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
`) {
  // Required properties
  @property({ type: String }) id = ''
  @property({ type: String }) name = ''
  @property({ type: String }) type: CourtType = 'volleyball'
  @property({ type: String }) courtType: CourtTypeEnum | string = ''

  // Optional properties
  @property({ type: Boolean }) showPlayerCount = true
  @property({ type: Boolean, reflect: true }) selected = false
  @property({ type: Boolean, reflect: true }) disabled = false
  @property({ type: Boolean }) compact = false

  // SVG cache for better performance
  private static svgCache: Record<CourtType, string> = {
    padel: padelSVG,
    pickleball: pickleballSVG,
    volleyball: volleyballSVG,
  }

  /**
   * Get the SVG content for the court type
   */
  private getCourtSVG(type: CourtType): string {
    // Use the cached SVG or fall back to pickleball if type not found
    const svgContent = SportCourtCard.svgCache[type] || SportCourtCard.svgCache.pickleball

    // Add accessibility attributes
    return svgContent.replace('<svg', '<svg aria-hidden="true" focusable="false"')
  }

  /**
   * Handle user interactions (mouse or keyboard)
   */
  private handleInteraction(e: MouseEvent | KeyboardEvent) {
    // Prevent interaction when disabled
    if (this.disabled) {
      e.preventDefault()
      return
    }

    // Handle keyboard events
    if (e instanceof KeyboardEvent) {
      const isActivationKey = e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar'
      if (isActivationKey) {
        e.preventDefault() // Prevent scrolling on space
      } else {
        return // Skip if not an activation key
      }
    }

    // Dispatch the court click event
    this.dispatchEvent(
      new CustomEvent<CourtClickDetail>('court-click', {
        detail: {
          id: this.id,
          type: this.type,
          name: this.name,
        },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /**
   * Get the availability status indicator
   */
  private getAvailabilityIndicator() {
    // Get the availability from a parent attribute
    const status = this.getAttribute('data-availability') || 'unknown'

    // Define colors and icons based on availability status
    const indicators = {
      full: {
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-100',
        icon: 'check_circle',
        label: 'Available',
        dotColor: 'bg-emerald-500 animate-pulse',
      },
      partial: {
        color: 'text-amber-600',
        bgColor: 'bg-amber-100',
        icon: 'access_time',
        label: 'Limited',
        dotColor: 'bg-amber-500',
      },
      none: {
        color: 'text-rose-600',
        bgColor: 'bg-rose-100',
        icon: 'block',
        label: 'Unavailable',
        dotColor: 'bg-rose-500',
      },
      unknown: {
        color: 'text-slate-500',
        bgColor: 'bg-slate-100',
        icon: 'help_outline',
        label: 'Unknown',
        dotColor: 'bg-slate-400',
      },
    }

    const indicator = indicators[status as keyof typeof indicators] || indicators.unknown

    // Return availability indicator with responsive sizing based on compact mode
    return html`
      <div class="flex items-center ${indicator.bgColor} px-1.5 py-0.5 rounded-full">
        <!-- Standard online/offline status dot -->
        <div class="relative mr-1 flex items-center">
          <div class="${indicator.dotColor} h-2 w-2 rounded-full"></div>
        </div>
        <!-- Label -->
        <span class="text-xs font-medium ${indicator.color}" style="font-size: ${this.compact ? '9px' : '10px'}">
          ${indicator.label}
        </span>
      </div>
    `
  }

  /**
   * Format court type for display (indoor, outdoor, etc.)
   */
  private formatCourtType(type: string): string {
    if (!type) return ''

    return type
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim()
  }

  /**
   * Get maximum player count text
   */
  private getPlayerCountText(): string {
    const counts = PLAYER_COUNTS[this.type] || []
    if (counts.length === 0) return ''

    // Get the maximum player count
    const maxPlayers = Math.max(...counts)
    return `${maxPlayers} players`
  }

  /**
   * Get the appropriate icon for the court type
   */
  private getCourtTypeIcon(): string {
    return this.type === 'padel' || this.type === 'pickleball' 
      ? 'sports_tennis' 
      : 'sports_volleyball'
  }

  render() {
    // Get display name (fall back to capitalized type if no name provided)
    const courtName = this.name || `${this.type.charAt(0).toUpperCase() + this.type.slice(1)} Court`

    // Create unique IDs for ARIA relationships
    const courtId = `court-${this.id}`
    const statusId = `court-status-${this.id}`
    const nameId = `court-name-${this.id}`

    // Accessibility description
    const ariaLabel = `${courtName}${this.selected ? ', selected' : ''}${this.disabled ? ', unavailable' : ''}`

    // Class values that change based on compact mode
    const cardClasses = this.compact 
      ? 'h-24' // Smaller height for compact mode
      : 'h-full'

    const headerPadding = this.compact 
      ? 'px-1.5 py-1' // Less padding for compact mode
      : 'px-2 py-1.5'
    
    const svgContainerHeight = this.compact 
      ? 'height: 50px' // Smaller SVG for compact mode
      : 'height: 80px'
    
    const infoSectionPadding = this.compact
      ? 'px-1.5 py-0.5' // Less padding for compact mode
      : 'px-2 py-1'
    
    const textSize = this.compact
      ? 'text-[10px]' // Smaller text for compact mode
      : 'text-xs'

    // Standard vertical card layout for both compact and non-compact
    return html`
      <div
        id="${courtId}"
        role="button"
        tabindex="${this.disabled ? '-1' : '0'}"
        aria-pressed="${this.selected}"
        aria-disabled="${this.disabled}"
        aria-label="${ariaLabel}"
        aria-describedby="${this.disabled ? statusId : nameId}"
        class="cursor-pointer bg-white court-card flex flex-col w-full overflow-hidden rounded-xl
          transition-all duration-200 ${cardClasses} relative
          ${!this.disabled ? 'hover:shadow-md hover:bg-gray-50' : ''}
          ${this.disabled ? 'opacity-70 cursor-not-allowed' : ''}
          ${this.selected ? 'ring-2 ring-primary-500 shadow-md' : 'border border-gray-200'}"
        @click=${this.handleInteraction}
        @keydown=${this.handleInteraction}
      >
        <!-- Header with Court Name and Status -->
        <div
          class="${headerPadding}  flex justify-between items-center transition-colors duration-200
            ${this.selected ? 'bg-gradient-to-r from-primary-default to-primary-default/80 text-primary-on' : ''}"
        >
          <div class="font-medium ${this.compact ? 'text-xs' : 'text-sm'} overflow-hidden text-ellipsis whitespace-nowrap" id="${nameId}">
            ${courtName}
          </div>

          <!-- Badge for status in header -->
          <div class="flex items-center ml-1">
            ${this.getAttribute('data-availability')
              ? html`<div class="ml-auto">${this.getAvailabilityIndicator()}</div>`
              : ''}
          </div>
        </div>

        <!-- Court Visualization -->
        <div class="flex mx-auto max-w-[160px] items-center justify-center overflow-hidden relative p-1 bg-white" style="${svgContainerHeight}">
          <div class="svg-wrapper w-min h-full ">${unsafeSVG(this.getCourtSVG(this.type))}</div>
        </div>

        <!-- Info Section -->
        <div
          class="flex items-center justify-between ${infoSectionPadding} ${this.selected
            ? 'bg-primary-50'
            : 'bg-gray-50'} border-t border-gray-200"
        >
          <div class="flex items-center gap-1 flex-wrap">
            <!-- Court Type & Player Count combined -->
            <div class="${textSize} ${this.selected ? 'text-primary-700' : 'text-gray-600'}">
              ${this.courtType ? `${this.formatCourtType(this.courtType)}` : ''}
              ${this.courtType && this.showPlayerCount ? ' • ' : ''}
              ${this.showPlayerCount ? `${this.getPlayerCountText()}` : ''}
            </div>
          </div>

          <!-- Sport Type indicator -->
          <div
            class="w-${this.compact ? '4' : '5'} h-${this.compact ? '4' : '5'} rounded-full flex items-center justify-center
              ${this.selected ? 'bg-primary-100 text-primary-700' : 'bg-white text-gray-500 border border-gray-300'}"
          >
            <schmancy-icon size="${this.compact ? '12px' : '14px'}">
              ${this.getCourtTypeIcon()}
            </schmancy-icon>
          </div>
        </div>
      </div>
    `
  }
}

// Add the element to TypeScript's HTML element map
declare global {
  interface HTMLElementTagNameMap {
    'sport-court-card': SportCourtCard
  }
}
