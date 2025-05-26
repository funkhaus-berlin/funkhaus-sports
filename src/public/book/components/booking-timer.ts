import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'

/**
 * Simple 5-minute countdown timer
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
	@state() private seconds = 5 * 60 // 5 minutes
	private interval?: number
	
	connectedCallback() {
		super.connectedCallback()
		// Start countdown
		this.interval = window.setInterval(() => {
			this.seconds = Math.max(0, this.seconds - 1)
			if (this.seconds === 0) {
				clearInterval(this.interval)
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
		const isCritical = this.seconds <= 60
		
		return html`
			<div class="timer ${isCritical ? 'critical' : ''}">
				<schmancy-icon>${isCritical ? 'timer_off' : 'timer'}</schmancy-icon>
				<span>Booking reserved for</span>
				<span class="time">${time}</span>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-timer': BookingTimer
	}
}