import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { unsafeSVG } from 'lit/directives/unsafe-svg.js'
import { CourtTypeEnum } from 'src/db/courts.collection'

// Import SVGs as raw strings
import padelSVG from '/public/svg/padel-court.svg?raw'
import pickleballSVG from '/public/svg/pickleball-court.svg?raw'
import volleyballSVG from '/public/svg/volleyball-court.svg?raw'

const COURT_TYPES = ['padel', 'pickleball', 'volleyball'] as const
type CourtType = (typeof COURT_TYPES)[number]

const PLAYER_COUNTS: Record<CourtType, number[]> = {
  padel: [2, 4],
  pickleball: [2, 4],
  volleyball: [4, 6, 8, 12],
}

interface CourtClickDetail {
  id: string
  type: CourtType
  name: string
}

@customElement('sport-court-card')
export class SportCourtCard extends $LitElement(css`
  :host {
    display: block;
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
  @property({ type: String }) id = ''
  @property({ type: String }) name = ''
  @property({ type: String }) type: CourtType = 'volleyball'
  @property({ type: String }) courtType: CourtTypeEnum | string = ''
  @property({ type: Boolean }) showPlayerCount = true
  @property({ type: Boolean, reflect: true }) selected = false
  @property({ type: Boolean, reflect: true }) disabled = false
  @property({ type: Boolean }) compact = false

  private static svgCache: Record<CourtType, string> = {
    padel: padelSVG,
    pickleball: pickleballSVG,
    volleyball: volleyballSVG,
  }

  private getCourtSVG(type: CourtType): string {
    const svgContent = SportCourtCard.svgCache[type] || SportCourtCard.svgCache.pickleball
    return svgContent.replace('<svg', '<svg aria-hidden="true" focusable="false"')
  }

  private handleClick(e: Event) {
    if (this.disabled) {
      e.preventDefault()
      return
    }

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

  private getAvailabilityBadge() {
    const status = this.getAttribute('data-availability') || 'unknown'
    
    const statusConfig = {
      full: { 
        bgColor: 'bg-emerald-100',
        textColor: 'text-emerald-600',
        dotColor: 'bg-emerald-500',
        label: 'Available',
        pulse: true
      },
      partial: { 
        bgColor: 'bg-amber-100',
        textColor: 'text-amber-600',
        dotColor: 'bg-amber-500',
        label: 'Limited',
        pulse: false
      },
      none: { 
        bgColor: 'bg-rose-100',
        textColor: 'text-rose-600',
        dotColor: 'bg-rose-500',
        label: 'Unavailable',
        pulse: false
      },
      unknown: { 
        bgColor: 'bg-slate-100',
        textColor: 'text-slate-500',
        dotColor: 'bg-slate-400',
        label: 'Unknown',
        pulse: false
      },
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown

    return html`
      <div class="flex items-center ${config.bgColor} px-1.5 py-0.5 rounded-full">
        <!-- Status dot -->
        <div class="relative mr-1 flex items-center">
          <div class="${config.dotColor} h-2 w-2 rounded-full ${config.pulse ? 'animate-pulse' : ''}"></div>
        </div>
        <!-- Label -->
        <span class="text-xs font-medium ${config.textColor}" style="font-size: ${this.compact ? '9px' : '10px'}">
          ${config.label}
        </span>
      </div>
    `
  }

  private formatCourtType(type: string): string {
    if (!type) return ''
    return type.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
  }

  private getPlayerCountText(): string {
    const counts = PLAYER_COUNTS[this.type] || []
    if (counts.length === 0) return ''
    const maxPlayers = Math.max(...counts)
    return `${maxPlayers} players`
  }

  private getCourtTypeIcon(): string {
    return this.type === 'padel' || this.type === 'pickleball' 
      ? 'sports_tennis' 
      : 'sports_volleyball'
  }

  render() {
    const courtName = this.name || `${this.type.charAt(0).toUpperCase() + this.type.slice(1)} Court`
    const ariaLabel = `${courtName}${this.selected ? ', selected' : ''}${this.disabled ? ', unavailable' : ''}`

    return html`
      <div
        @click=${this.handleClick}
        role="button"
        tabindex="${this.disabled ? -1 : 0}"
        aria-pressed="${this.selected}"
        aria-disabled="${this.disabled}"
        aria-label="${ariaLabel}"
        class="
          rounded-xl transition-all duration-200 overflow-hidden
          ${this.selected ? 'bg-primary-default shadow-md' : 'bg-surface-high border border-gray-200'}
          ${!this.disabled ? 'hover:shadow-lg cursor-pointer' : 'opacity-50 cursor-not-allowed'}
          ${this.compact ? 'h-24' : 'h-full'}
        "
      >
        <!-- Header -->
        <div 
          class="${this.compact ? 'px-1.5 py-1' : 'px-2 py-1.5'} flex justify-between items-center"
        >
          <div class="font-medium ${this.compact ? 'text-xs' : 'text-sm'} overflow-hidden text-ellipsis whitespace-nowrap
            ${this.selected ? 'text-primary-on' : 'text-surface-on'}">
            ${courtName}
          </div>
          ${this.getAttribute('data-availability') ? html`
            <div class="ml-1">
              ${this.getAvailabilityBadge()}
            </div>
          ` : ''}
        </div>

        <!-- Court Visualization -->
        <div class="flex mx-auto max-w-[160px] items-center justify-center overflow-hidden relative p-1" 
          style="height: ${this.compact ? '50px' : '80px'}">
          <div class="svg-wrapper w-min h-full">
            ${unsafeSVG(this.getCourtSVG(this.type))}
          </div>
        </div>

        <!-- Info Section -->
        <div 
          class="flex items-center justify-between ${this.compact ? 'px-1.5 py-0.5' : 'px-2 py-1'} 
            border-t ${this.selected ? 'border-primary-200' : 'border-gray-200'}"
        >
          <div class="${this.compact ? 'text-[10px]' : 'text-xs'} ${this.selected ? 'text-primary-on' : 'text-surface-on'}">
            ${this.courtType ? `${this.formatCourtType(this.courtType)}` : ''}
            ${this.courtType && this.showPlayerCount ? ' • ' : ''}
            ${this.showPlayerCount ? this.getPlayerCountText() : ''}
          </div>

          <div class="${this.compact ? 'w-4 h-4' : 'w-5 h-5'} rounded-full flex items-center justify-center
            ${this.selected ? 'bg-primary-on/20' : 'bg-surface-on/10'}">
            <schmancy-icon 
              size="${this.compact ? '12px' : '14px'}"
              class="${this.selected ? 'text-primary-on' : 'text-surface-on'}"
            >
              ${this.getCourtTypeIcon()}
            </schmancy-icon>
          </div>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sport-court-card': SportCourtCard
  }
}
