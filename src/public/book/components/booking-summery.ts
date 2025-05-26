import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { debounceTime, fromEvent, Subscription, takeUntil } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { Court } from 'src/db/courts.collection'
import { Booking, bookingContext } from '../context'

/**
 * Booking summary component that shows details about the current booking
 * Automatically expands on desktop and collapses on mobile
 */
@customElement('booking-summary')
export class BookingSummary extends $LitElement() {
	@select(bookingContext) booking!: Booking
	@select(courtsContext) courts!: Map<string, Court>

	@property({ type: Object }) selectedCourt?: Court

	@state() private isDesktop = window.innerWidth >= 768
	@state() private summaryExpanded = false

	private resizeSubscription?: Subscription

	connectedCallback(): void {
		super.connectedCallback()
		this.summaryExpanded = this.isDesktop

		this.resizeSubscription = fromEvent(window, 'resize')
			.pipe(
				debounceTime(100), 
				takeUntil(this.disconnecting)
			)
			.subscribe(() => this.handleResize())
	}

	disconnectedCallback(): void {
		super.disconnectedCallback()
		this.resizeSubscription?.unsubscribe()
	}

	private handleResize(): void {
		const wasDesktop = this.isDesktop
		this.isDesktop = window.innerWidth >= 768

		if (!wasDesktop && this.isDesktop) {
			this.summaryExpanded = true
		}
	}

	private toggleSummary(): void {
		this.summaryExpanded = !this.summaryExpanded
		this.announceForScreenReader(`Booking summary ${this.summaryExpanded ? 'expanded' : 'collapsed'}`)
	}

	private announceForScreenReader(message: string): void {
		const announcement = document.createElement('div')
		announcement.setAttribute('aria-live', 'polite')
		announcement.setAttribute('class', 'sr-only')
		announcement.textContent = message
		document.body.appendChild(announcement)

		setTimeout(() => {
			document.body.removeChild(announcement)
		}, 1000)
	}

	private getSelectedCourt(): Court | undefined {
		if (this.selectedCourt) {
			return this.selectedCourt
		}

		if (this.booking?.courtId && courtsContext.ready) {
			return this.courts.get(this.booking.courtId)
		}

		return undefined
	}

	private formatDate(dateStr: string): string {
		if (!dateStr) return 'TBD'

		try {
			const date = new Date(dateStr)
			return date.toLocaleDateString('en-US', { 
				weekday: 'short', 
				month: 'short', 
				day: 'numeric' 
			})
		} catch {
			return 'Invalid date'
		}
	}

	private formatTime(timeStr: string): string {
		if (!timeStr) return 'TBD'

		try {
			const date = new Date(timeStr)
			return date.toLocaleTimeString('en-GB', { 
				hour: '2-digit', 
				minute: '2-digit', 
				hour12: false 
			})
		} catch {
			return 'Invalid time'
		}
	}

	private formatDuration(): string {
		if (!this.booking?.startTime || !this.booking?.endTime) {
			return 'TBD'
		}

		try {
			const startTime = new Date(this.booking.startTime)
			const endTime = new Date(this.booking.endTime)
			const durationMs = endTime.getTime() - startTime.getTime()

			if (isNaN(durationMs) || durationMs < 0) {
				return 'Invalid duration'
			}

			const durationHours = Math.floor(durationMs / (1000 * 60 * 60))
			const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))

			if (durationHours > 0) {
				const hourText = `${durationHours} hour${durationHours > 1 ? 's' : ''}`
				const minuteText = durationMinutes > 0 ? ` ${durationMinutes} min` : ''
				return hourText + minuteText
			}
			
			return `${durationMinutes} minutes`
		} catch {
			return 'Invalid duration'
		}
	}

	private formatPrice(price: number): string {
		if (price === null || price === undefined) {
			return '€0.00'
		}

		return `€${price.toFixed(2)}`
	}

	render() {
		const court = this.getSelectedCourt()

		return html`
			<schmancy-surface type="container" class="p-4">
				<!-- Header with toggle -->
				<div
					class="flex justify-between items-center cursor-pointer select-none"
					@click=${this.toggleSummary}
					@keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.toggleSummary()}
					tabindex="0"
					role="button"
					aria-expanded=${this.summaryExpanded}
					aria-controls="booking-summary-content"
				>
					<schmancy-typography type="title" token="sm">Booking Summary</schmancy-typography>
					<schmancy-icon 
						class="transition-transform duration-300 ${this.summaryExpanded ? 'rotate-180' : ''}"
					>
						expand_more
					</schmancy-icon>
				</div>

				<!-- Expandable content -->
				<div 
					id="booking-summary-content"
					class="overflow-hidden transition-all duration-300 ${this.summaryExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}"
				>
					<schmancy-grid gap="sm" class="mt-3">
						${this.renderDetailRow('Date', this.formatDate(this.booking?.date))}
						${this.renderDetailRow('Time', `${this.formatTime(this.booking?.startTime)} - ${this.formatTime(this.booking?.endTime)}`)}
						${this.renderDetailRow('Duration', this.formatDuration())}
						${this.renderDetailRow('Court', court?.name || 'Auto-assigned')}
						
						<schmancy-divider></schmancy-divider>
						
						<div class="flex justify-between items-center">
							<schmancy-typography type="title" token="sm">Total:</schmancy-typography>
							<schmancy-typography type="display" token="sm" class="text-primary-default">
								${this.formatPrice(this.booking?.price)}
							</schmancy-typography>
						</div>
					</schmancy-grid>
				</div>

				<!-- Collapsed view -->
				${when(
					!this.summaryExpanded,
					() => html`
						<div class="flex justify-between items-center mt-2">
							<schmancy-typography type="body" token="sm" class="text-surface-on-variant">
								${this.formatDate(this.booking?.date)} · ${this.formatTime(this.booking?.startTime)}
							</schmancy-typography>
							<schmancy-typography type="title" token="sm" class="text-primary-default">
								${this.formatPrice(this.booking?.price)}
							</schmancy-typography>
						</div>
					`,
				)}
			</schmancy-surface>
		`
	}

	private renderDetailRow(label: string, value: string) {
		return html`
			<div class="flex justify-between items-center">
				<schmancy-typography type="label" token="sm">${label}:</schmancy-typography>
				<schmancy-typography type="body" token="md" weight="medium">${value}</schmancy-typography>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-summary': BookingSummary
	}
}
