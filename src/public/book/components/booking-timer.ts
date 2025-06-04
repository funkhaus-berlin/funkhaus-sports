import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { EMPTY, fromEvent, interval, merge } from 'rxjs'
import { catchError, filter, takeUntil, tap, throttleTime } from 'rxjs/operators'

/**
 * Countdown timer for booking reservations
 * - Development: 10 seconds (for testing)
 * - Production: 5 minutes
 */
@customElement('booking-timer')
export class BookingTimer extends $LitElement() {
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
	@state() private extensionApplied = false
	private readonly EXTENSION_TIME = 60 // 60 seconds extension
	private readonly INTERACTION_EVENTS = ['click', 'keydown', 'touchstart', 'mousemove']
	
	connectedCallback() {
		super.connectedCallback()
		
		// Log timer configuration
		console.log(`BookingTimer: Using ${this.seconds} seconds (${this.seconds < 60 ? 'development' : 'production'} mode)`)
		
		// Track last user activity time
		let lastActivityTime = Date.now()
		
		// Create user interaction observable
		merge(
			...this.INTERACTION_EVENTS.map(eventType => 
				fromEvent(window, eventType)
			)
		).pipe(
			throttleTime(500), // Throttle events to twice per second
			tap(() => {
				lastActivityTime = Date.now()
			}),
			takeUntil(this.disconnecting)
		).subscribe()
		
		// Timer countdown
		interval(1000).pipe(
			tap(() => {
				// Decrement timer
				this.seconds = Math.max(0, this.seconds - 1)
				
				// Check for timer extension
				const criticalThreshold = Math.min(60, Math.floor(this.getTimerDuration() * 0.2))
				const isCritical = this.seconds <= criticalThreshold
				const timeSinceLastActivity = Date.now() - lastActivityTime
				const isUserActive = timeSinceLastActivity < 5000 // Active in last 5 seconds
				
				// Extend timer if conditions are met
				if (isCritical && isUserActive && !this.extensionApplied && this.seconds > 0) {
					this.seconds = Math.min(this.seconds + this.EXTENSION_TIME, criticalThreshold + this.EXTENSION_TIME)
					this.extensionApplied = true
					
					console.log('Timer extended due to user activity')
					
					// Dispatch extension event
					this.dispatchEvent(new CustomEvent('timer-extended', {
						bubbles: true,
						composed: true,
						detail: { extensionSeconds: this.EXTENSION_TIME }
					}))
				}
				
				// Check for timer expiration
				if (this.seconds === 0) {
					this.dispatchEvent(new CustomEvent('timer-expired', {
						bubbles: true,
						composed: true
					}))
				}
			}),
			filter(() => this.seconds === 0),
			catchError(err => {
				console.error('Timer error:', err)
				return EMPTY
			}),
			takeUntil(this.disconnecting)
		).subscribe()
	}
	
	// No need for manual cleanup - RxJS handles it with takeUntil(this.disconnecting)
	
	render() {
		const minutes = Math.floor(this.seconds / 60)
		const secs = this.seconds % 60
		const time = `${minutes}:${secs.toString().padStart(2, '0')}`
		// Critical when less than 20% of original time or 60 seconds (whichever is smaller)
		const criticalThreshold = Math.min(60, Math.floor(this.getTimerDuration() * 0.2))
		const isCritical = this.seconds <= criticalThreshold
		
		const isDev = this.getTimerDuration() === BookingTimer.TIMER_DURATION.development
		
		return html`
			<schmancy-surface 
				type="container" 
        rounded="all"
				class="mb-4 ${isCritical ? 'bg-error-default text-error-on' : 'bg-warning-container text-warning-on'}"
			>
				<div class="flex items-center gap-2 p-3 text-sm">
					<schmancy-icon>${isCritical ? 'timer_off' : 'timer'}</schmancy-icon>
					<span>Booking reserved for</span>
					<span class="font-mono font-semibold">${time}</span>
					${isDev ? html`<span class="text-[10px] opacity-70">(DEV)</span>` : ''}
					${this.extensionApplied ? html`
						<schmancy-icon class="text-success-default animate-pulse ml-auto" title="Timer extended due to activity">schedule</schmancy-icon>
					` : ''}
				</div>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-timer': BookingTimer
	}
}
