import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'

/**
 * Countdown timer for booking reservations
 * - Development: 10 seconds (for testing)
 * - Production: 5 minutes
 */
@customElement('booking-timer')
export class BookingTimer extends $LitElement(css`
	:host {
		display: block;
		margin-bottom: 1rem;
	}
	
	.timer {
		background: var(--schmancy-warning-container);
		color: var(--schmancy-warning-on-container);
		padding: 12px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}
	
	.timer.critical {
		background: var(--schmancy-error-container);
		color: var(--schmancy-error-on-container);
	}
	
	.time {
		font-weight: 600;
		font-family: monospace;
	}
`) {
	// Configure timer duration based on environment
	private static readonly TIMER_DURATION = {
		development: 10, // 10 seconds for testing
		production: 5 * 60 // 5 minutes for production
	}
	
	private getTimerDuration(): number {
		// Check if we're in development mode
		const isDevelopment = window.location.hostname === 'localhost' || 
							 window.location.hostname === '127.0.0.1' ||
							 window.location.hostname.includes('.dev') ||
							 window.location.hostname.includes('netlify.app')
		
		return isDevelopment 
			? BookingTimer.TIMER_DURATION.development 
			: BookingTimer.TIMER_DURATION.production
	}
	
	@state() private seconds = this.getTimerDuration()
	private interval?: number
	
	connectedCallback() {
		super.connectedCallback()
		
		// Log timer configuration
		console.log(`BookingTimer: Using ${this.seconds} seconds (${this.seconds < 60 ? 'development' : 'production'} mode)`)
		
		// Start countdown
		this.interval = window.setInterval(() => {
			this.seconds = Math.max(0, this.seconds - 1)
			if (this.seconds === 0) {
				clearInterval(this.interval)
				// Emit timer expired event
				this.dispatchEvent(new CustomEvent('timer-expired', {
					bubbles: true,
					composed: true
				}))
			}
		}, 1000)
	}
	
	disconnectedCallback() {
		super.disconnectedCallback()
		if (this.interval) clearInterval(this.interval)
	}
	
	render() {
		const minutes = Math.floor(this.seconds / 60)
		const secs = this.seconds % 60
		const time = `${minutes}:${secs.toString().padStart(2, '0')}`
		// Critical when less than 20% of original time or 60 seconds (whichever is smaller)
		const criticalThreshold = Math.min(60, Math.floor(this.getTimerDuration() * 0.2))
		const isCritical = this.seconds <= criticalThreshold
		
		const isDev = this.getTimerDuration() === BookingTimer.TIMER_DURATION.development
		
		return html`
			<div class="timer ${isCritical ? 'critical' : ''}">
				<schmancy-icon>${isCritical ? 'timer_off' : 'timer'}</schmancy-icon>
				<span>Booking reserved for</span>
				<span class="time">${time}</span>
				${isDev ? html`<span style="font-size: 10px; opacity: 0.7">(DEV)</span>` : ''}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-timer': BookingTimer
	}
}