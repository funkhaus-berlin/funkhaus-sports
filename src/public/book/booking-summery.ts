import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { when } from 'lit/directives/when.js'
import { debounceTime, fromEvent, Subscription, takeUntil } from 'rxjs'
import { courtsContext } from 'src/admin/venues/courts/context'
import { Court } from 'src/db/courts.collection'
import { Booking, bookingContext } from './context'

/**
 * Booking summary component that shows details about the current booking
 * Automatically expands on desktop and collapses on mobile
 */
@customElement('booking-summary')
export class BookingSummary extends $LitElement(css`
	/* Animation for expanding/collapsing */
	.summary-content {
		max-height: 0;
		overflow: hidden;
		transition: max-height 0.3s ease-out, opacity 0.2s ease-out, transform 0.2s ease-out;
		opacity: 0;
		transform: translateY(-8px);
	}

	.summary-content.expanded {
		max-height: 300px; /* Adjust based on content needs */
		opacity: 1;
		transform: translateY(0);
	}

	/* Rotate icon animation */
	.toggle-icon {
		transition: transform 0.3s ease;
	}

	.toggle-icon.expanded {
		transform: rotate(180deg);
	}
`) {
	@select(bookingContext) booking!: Booking
	@select(courtsContext) courts!: Map<string, Court>

	@property({ type: Object }) selectedCourt?: Court

	// Responsive state
	@state() isDesktop = window.innerWidth >= 768 // Desktop breakpoint
	@state() summaryExpanded = false

	// Resize subscription for cleanup
	private resizeSubscription?: Subscription

	// Set initial state and add resize listener
	connectedCallback(): void {
		super.connectedCallback()
		// Initialize expanded state based on screen size
		this.summaryExpanded = this.isDesktop

		// Set up responsive resize handling
		this.resizeSubscription = fromEvent(window, 'resize')
			.pipe(debounceTime(100), takeUntil(this.disconnecting))
			.subscribe(() => this.handleResize())
	}

	disconnectedCallback(): void {
		super.disconnectedCallback()

		// Clean up subscription
		if (this.resizeSubscription) {
			this.resizeSubscription.unsubscribe()
		}
	}

	/**
	 * Handle window resize events
	 */
	private handleResize(): void {
		const wasDesktop = this.isDesktop
		this.isDesktop = window.innerWidth >= 768

		// Auto-expand on desktop if we just switched from mobile to desktop
		if (!wasDesktop && this.isDesktop) {
			this.summaryExpanded = true
		}
	}

	/**
	 * Toggle summary expansion
	 */
	private toggleSummary(): void {
		this.summaryExpanded = !this.summaryExpanded
		// Announce to screen readers
		this.announceForScreenReader(`Booking summary ${this.summaryExpanded ? 'expanded' : 'collapsed'}`)
	}

	/**
	 * Announce messages for screen readers
	 */
	private announceForScreenReader(message: string): void {
		const announcement = document.createElement('div')
		announcement.setAttribute('aria-live', 'polite')
		announcement.setAttribute('class', 'sr-only')
		announcement.textContent = message
		document.body.appendChild(announcement)

		// Remove after announcement is processed
		setTimeout(() => {
			document.body.removeChild(announcement)
		}, 1000)
	}

	/**
	 * Find the selected court from the courts map if not provided directly
	 */
	private getSelectedCourt(): Court | undefined {
		// If selectedCourt is directly provided, use it
		if (this.selectedCourt) {
			return this.selectedCourt
		}

		// Otherwise, try to find it from the booking and courts context
		if (this.booking?.courtId && courtsContext.ready) {
			return this.courts.get(this.booking.courtId)
		}

		return undefined
	}

	/**
	 * Format date to user-friendly string
	 */
	private formatDate(dateStr: string): string {
		if (!dateStr) return 'TBD'

		try {
			const date = new Date(dateStr)
			return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
		} catch (e) {
			return 'Invalid date'
		}
	}

	/**
	 * Format time from ISO string
	 */
	private formatTime(timeStr: string): string {
		if (!timeStr) return 'TBD'

		try {
			const date = new Date(timeStr)
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
		} catch (e) {
			return 'Invalid time'
		}
	}

	/**
	 * Calculate and format duration between start and end times
	 */
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

			return durationHours > 0
				? `${durationHours} hour${durationHours > 1 ? 's' : ''}${durationMinutes > 0 ? ` ${durationMinutes} min` : ''}`
				: `${durationMinutes} minutes`
		} catch (e) {
			return 'Invalid duration'
		}
	}

	/**
	 * Format price with currency symbol
	 */
	private formatPrice(price: number): string {
		return `€${(price || 0).toFixed(2)}`
	}

	render() {
		// Get selected court
		const court = this.getSelectedCourt()

		// Determine classes for content area
		const contentClasses = {
			'summary-content': true,
			expanded: this.summaryExpanded,
			'mt-3': true,
			grid: true,
			'gap-2': true,
		}

		// Determine classes for toggle icon
		const iconClasses = {
			'toggle-icon': true,
			expanded: this.summaryExpanded,
		}

		return html`
			<div class="bg-surface-container p-4 rounded-lg shadow-sm">
				<!-- Summary header with toggle -->
				<div
					class="flex justify-between items-center cursor-pointer"
					@click=${this.toggleSummary}
					@keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.toggleSummary()}
					tabindex="0"
					role="button"
					aria-expanded=${this.summaryExpanded}
					aria-controls="booking-summary-content"
				>
					<schmancy-typography type="title" token="sm">Booking Summary</schmancy-typography>
					<schmancy-icon class=${classMap(iconClasses)}>expand_more</schmancy-icon>
				</div>

				<!-- Collapsible content -->
				<div id="booking-summary-content" class=${classMap(contentClasses)}>
					<div class="flex justify-between">
						<schmancy-typography type="label" token="sm">Date:</schmancy-typography>
						<schmancy-typography type="body" weight="bold">${this.formatDate(this.booking?.date)}</schmancy-typography>
					</div>

					<div class="flex justify-between">
						<schmancy-typography type="label" token="sm">Time:</schmancy-typography>
						<schmancy-typography type="body" weight="bold">
							${this.formatTime(this.booking?.startTime)} - ${this.formatTime(this.booking?.endTime)}
						</schmancy-typography>
					</div>

					<div class="flex justify-between">
						<schmancy-typography type="label" token="sm">Duration:</schmancy-typography>
						<schmancy-typography type="body" weight="bold">${this.formatDuration()}</schmancy-typography>
					</div>

					<div class="flex justify-between">
						<schmancy-typography type="label" token="sm">Court:</schmancy-typography>
						<schmancy-typography type="body" weight="bold">
							${court ? court.name : 'Auto-assigned'}
						</schmancy-typography>
					</div>

					<div class="border-t border-outline-variant pt-2 mt-1">
						<div class="flex justify-between items-center">
							<schmancy-typography type="title" token="sm">Total:</schmancy-typography>
							<schmancy-typography type="display" token="sm" class="text-primary-default">
								${this.formatPrice(this.booking?.price)}
							</schmancy-typography>
						</div>
					</div>
				</div>

				<!-- Compact summary when collapsed -->
				${when(
					!this.summaryExpanded,
					() => html`
						<div class="flex justify-between mt-1">
							<schmancy-typography type="body" token="sm" class="text-surface-on-variant">
								${this.formatDate(this.booking?.date)} · ${this.formatTime(this.booking?.startTime)}
							</schmancy-typography>
							<schmancy-typography type="title" token="sm" class="text-primary-default">
								${this.formatPrice(this.booking?.price)}
							</schmancy-typography>
						</div>
					`,
				)}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-summary': BookingSummary
	}
}
