import { $notify, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { distinctUntilChanged, filter, map, shareReplay, startWith, takeUntil, tap } from 'rxjs'
import { courtsContext, selectMyCourts } from 'src/admin/venues/courts/context'
import { Court } from 'src/db/courts.collection'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'

// Import the enhanced availability coordinator
import {
	CourtAvailabilityStatus,
	enhancedAvailabilityCoordinator,
} from 'src/bookingServices/enhanced-availability-coordinator'

import './sport-court-card'

/**
 * Updated Court selection component for the booking flow
 * Shows availability based on selected date, time, and duration
 * Adds confirmation for partially available courts
 */
@customElement('court-select-step')
export class CourtSelectStep extends $LitElement() {
	@select(courtsContext) allCourts!: Map<string, Court>
	@select(bookingContext) booking!: Booking

	@select(BookingProgressContext)
	bookingProgress!: BookingProgress

	@state() selectedVenueCourts: Court[] = []
	@state() loading: boolean = true
	@state() error: string | null = null

	// New state to track court availability statuses
	@state() courtAvailability: Map<string, CourtAvailabilityStatus> = new Map()

	// State for confirmation dialog
	@state() showConfirmationDialog: boolean = false
	@state() pendingCourtSelection: Court | null = null

	// Track the last successful court data fetch for better UX during errors
	private lastSuccessfulData: { courts: Court[] } | null = null

	/**
	 * Determine if compact view should be used based on current step
	 */
	get isCompactView(): boolean {
		return this.bookingProgress.currentStep !== BookingStep.Court
	}

	/**
	 * Set up all reactive subscriptions and initialize component
	 */
	connectedCallback() {
		super.connectedCallback()

		// Subscribe to availability coordinator errors
		enhancedAvailabilityCoordinator.error$
			.pipe(
				takeUntil(this.disconnecting),
				filter(error => !!error),
			)
			.subscribe(error => {
				this.error = error
				this.requestUpdate()
			})

		// Subscribe to availability coordinator loading state
		enhancedAvailabilityCoordinator.loading$.pipe(takeUntil(this.disconnecting)).subscribe(loading => {
			this.loading = loading
			this.requestUpdate()
		})

		// Set up the court data subscription with improved error handling
		bookingContext.$.pipe(
			startWith(bookingContext.value),
			takeUntil(this.disconnecting),
			filter(booking => !!booking.date && !!booking.venueId && !!booking.startTime && !!booking.endTime),
			map(booking => ({
				date: booking.date,
				venueId: booking.venueId,
				startTime: booking.startTime,
				endTime: booking.endTime,
			})),
			distinctUntilChanged(
				(prev, curr) =>
					prev.date === curr.date &&
					prev.venueId === curr.venueId &&
					prev.startTime === curr.startTime &&
					prev.endTime === curr.endTime,
			),
			tap(booking => this.loadCourtsWithAvailability(booking)),
		).subscribe({
			error: err => {
				console.error('Error in booking subscription:', err)
				this.error = 'Failed to load court availability data'
				this.loading = false
				this.requestUpdate()
			},
		})
	}

	/**
	 * Load courts with availability information for selected date, time, and duration
	 */
	private loadCourtsWithAvailability(booking: {
		date: string
		venueId: string
		startTime: string
		endTime: string
	}): void {
		this.loading = true
		this.error = null

		try {
			// Calculate duration in minutes from startTime and endTime
			const startTime = new Date(booking.startTime)
			const endTime = new Date(booking.endTime)
			const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000)

			// Get court availability statuses from the coordinator
			const courtAvailabilities = enhancedAvailabilityCoordinator.getAllCourtsAvailability(
				booking.startTime,
				durationMinutes,
			)

			// Create map of court ID to availability status for efficient lookups
			const availabilityMap = new Map<string, CourtAvailabilityStatus>()
			courtAvailabilities.forEach(status => {
				availabilityMap.set(status.courtId, status)
			})

			// Store the map in state
			this.courtAvailability = availabilityMap

			// Load the court data
			this.loadCourtData(booking.date, booking.venueId).subscribe({
				next: courts => this.handleCourtDataLoaded(courts),
				error: err => this.handleCourtDataError(err),
			})
		} catch (error) {
			console.error('Error loading court availability:', error)
			this.error = 'Failed to check court availability. Please try again.'
			this.loading = false
			this.requestUpdate()
		}
	}

	/**
	 * Handle successful court data loading
	 */
	private handleCourtDataLoaded(courts: Court[]): void {
		this.selectedVenueCourts = courts
		this.lastSuccessfulData = { courts }
		this.loading = false
		this.error = null
		this.requestUpdate()

		// Announce to screen readers that courts have been loaded
		this.announceForScreenReader(`${this.selectedVenueCourts.length} courts loaded`)
	}

	/**
	 * Handle error during court data loading
	 */
	private handleCourtDataError(err: Error): void {
		console.error('Error loading courts:', err)

		// Use last successful data if available to maintain user experience
		if (this.lastSuccessfulData) {
			this.selectedVenueCourts = this.lastSuccessfulData.courts
			this.error = 'Unable to refresh court data. Showing previously loaded courts.'
		} else {
			this.error = 'Failed to load available courts. Please try again.'
		}

		this.loading = false

		// Announce error to screen readers
		this.announceForScreenReader(this.error)
	}

	/**
	 * Announce messages for screen readers
	 */
	private announceForScreenReader(message: string): void {
		// Create a visually hidden element for screen reader announcements
		const announcement = document.createElement('div')
		announcement.setAttribute('aria-live', 'assertive')
		announcement.setAttribute('class', 'sr-only')
		announcement.textContent = message

		document.body.appendChild(announcement)

		// Remove the element after announcement is processed
		setTimeout(() => {
			document.body.removeChild(announcement)
		}, 1000)
	}

	/**
	 * Load court data with availability information using the enhanced service
	 */
	private loadCourtData(date: string, venueId: string) {
		return selectMyCourts.pipe(
			map(courts => Array.from(courts.values())),
			map(courts => {
				// Filter active courts for this venue
				return courts.filter(court => court.status === 'active' && court.venueId === venueId)
			}),
			map(courts => {
				// Sort courts by availability using our availability map
				return courts.sort((a, b) => {
					// Get availability statuses from our map
					const aStatus = this.courtAvailability.get(a.id)
					const bStatus = this.courtAvailability.get(b.id)

					// Sort fully available courts first
					if (aStatus?.fullyAvailable !== bStatus?.fullyAvailable) {
						return aStatus?.fullyAvailable ? -1 : 1
					}

					// Then sort by partial availability
					if (aStatus?.available !== bStatus?.available) {
						return aStatus?.available ? -1 : 1
					}

					// Finally sort by name
					return a.name.localeCompare(b.name)
				})
			}),
			// Share the result to prevent multiple subscription executions
			shareReplay(1),
		)
	}

	/**
	 * Calculate the availability ratio for a court
	 * This shows what percentage of the requested time is available
	 */
	/**
	 * Get court availability status based on our availability map
	 */
	private getCourtAvailabilityStatus(courtId: string): 'full' | 'partial' | 'none' {
		const status = this.courtAvailability.get(courtId)

		if (!status) return 'none'

		if (status.fullyAvailable) return 'full'

		if (status.available) return 'partial'

		return 'none'
	}

	/**
	 * Calculate the availability ratio for a court
	 * This shows what percentage of the requested time is available
	 */
	private getAvailabilityRatio(courtId: string): number {
		const status = this.courtAvailability.get(courtId)
		if (!status) return 0

		if (status.fullyAvailable) return 1 // Fully available = 100%
		if (!status.available) return 0 // Not available = 0%

		// Calculate ratio of available slots to total slots
		const availableSlots = status.availableTimeSlots.length
		const totalRequestedSlots = status.availableTimeSlots.length + status.unavailableTimeSlots.length

		return totalRequestedSlots > 0 ? availableSlots / totalRequestedSlots : 0
	}

	/**
	 * Render availability indicator for partial availability
	 */
	private renderCourtAvailabilityIndicator(courtId: string): unknown {
		const status = this.getCourtAvailabilityStatus(courtId)

		if (status !== 'partial') return null

		// Get the actual available duration info
		const availabilityInfo = this.getPartialAvailabilityInfo(courtId)

		return html`
			<div class="absolute bottom-0 left-0 right-0 z-10">
				<div class="text-center text-xs py-1 bg-slate-50 text-slate-700 border-t border-slate-200">
					${availabilityInfo}
				</div>
			</div>
		`
	}

	/**
	 * Check if a court can be selected based on availability
	 */
	private canSelectCourt(courtId: string): boolean {
		const status = this.courtAvailability.get(courtId)
		// Allow selection if at least partially available
		return status?.available === true
	}

	/**
	 * Get partially available time info for display
	 */
	private getPartialAvailabilityInfo(courtId: string): string {
		const status = this.courtAvailability.get(courtId)
		if (!status || !status.available || status.fullyAvailable) return ''

		// If we have available time slots, show actual available duration
		if (status.availableTimeSlots.length > 0) {
			// Sort time slots to find continuous periods
			const sortedSlots = [...status.availableTimeSlots].sort()

			// Calculate maximum continuous time available
			let maxContinuousMinutes = 30 // Minimum is one slot (30 min)

			// Try to determine the actual continuous duration
			if (sortedSlots.length > 1) {
				// Simple calculation for display purposes - actual time would need more precise calculation
				maxContinuousMinutes = sortedSlots.length * 30
			}

			// Format for display
			if (maxContinuousMinutes >= 60) {
				const hours = Math.floor(maxContinuousMinutes / 60)
				return `${hours}h available`
			} else {
				return `${maxContinuousMinutes}min available`
			}
		}

		// Fallback to slots count
		return `${status.availableTimeSlots.length}/${
			status.availableTimeSlots.length + status.unavailableTimeSlots.length
		} slots`
	}

	/**
	 * Get formatted available time slots for display in confirmation dialog
	 * Formats time slots into a more readable format
	 */
	private getFormattedAvailableTimes(courtId: string): string[] {
		const status = this.courtAvailability.get(courtId)
		if (!status || !status.availableTimeSlots.length) return []

		// Sort time slots
		const sortedSlots = [...status.availableTimeSlots].sort()

		// Convert to more readable format
		return sortedSlots.map(slot => {
			const [hour, minute] = slot.split(':').map(Number)
			// Convert to 12-hour format for readability
			const hour12 = hour % 12 || 12
			const ampm = hour >= 12 ? 'PM' : 'AM'
			return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`
		})
	}

	/**
	 * Get formatted unavailable time slots for display in confirmation dialog
	 */
	private getFormattedUnavailableTimes(courtId: string): string[] {
		const status = this.courtAvailability.get(courtId)
		if (!status || !status.unavailableTimeSlots.length) return []

		// Sort time slots
		const sortedSlots = [...status.unavailableTimeSlots].sort()

		// Convert to more readable format
		return sortedSlots.map(slot => {
			const [hour, minute] = slot.split(':').map(Number)
			// Convert to 12-hour format for readability
			const hour12 = hour % 12 || 12
			const ampm = hour >= 12 ? 'PM' : 'AM'
			return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`
		})
	}

	/**
	 * Map court type to sport-court-card type
	 */
	private getCourtType(court: Court): 'padel' | 'pickleball' | 'volleyball' {
		// Map your court types to the sport-court-card types
		// Adjust this mapping based on your court type naming convention
		const typeMap: Record<string, 'padel' | 'pickleball' | 'volleyball'> = {
			padel: 'padel',
			pickleball: 'pickleball',
			volleyball: 'volleyball',
			// Add more mappings as needed
		}

		return typeMap[court.sportTypes[0]?.toLowerCase()] || 'pickleball'
	}

	/**
	 * Handle court selection - now with confirmation for partially available courts
	 */
	private handleCourtSelect(court: Court): void {
		// Don't allow selecting unavailable courts
		if (!this.canSelectCourt(court.id)) {
			return
		}

		// Check if court is partially available
		const availabilityStatus = this.getCourtAvailabilityStatus(court.id)

		if (availabilityStatus === 'partial') {
			// Show confirmation dialog for partially available courts
			this.pendingCourtSelection = court
			this.showConfirmationDialog = true
			return
		}

		// For fully available courts, proceed directly
		this.confirmCourtSelection(court)
	}

	/**
	 * Confirm court selection after user accepts partial availability
	 */
	private confirmCourtSelection(court: Court): void {
		// Update booking context with selected court
		bookingContext.set({
			...this.booking,
			courtId: court.id,
		})

		// Reset dialog state
		this.pendingCourtSelection = null
		this.showConfirmationDialog = false

		// Advance to Payment step
		BookingProgressContext.set({
			currentStep: BookingStep.Payment,
		})

		// Show success notification
		$notify.success(`Selected ${court.name}`)

		// Fire change event for parent components
		this.dispatchEvent(
			new CustomEvent('next', {
				detail: { court },
			}),
		)
	}

	/**
	 * Cancel court selection from confirmation dialog
	 */
	private cancelCourtSelection(): void {
		this.pendingCourtSelection = null
		this.showConfirmationDialog = false
	}

	private retryLoading(): void {
		// Force a refresh of availability data
		enhancedAvailabilityCoordinator.refreshData()

		// Then reload courts with availability
		if (this.booking?.date && this.booking?.venueId && this.booking?.startTime && this.booking?.endTime) {
			this.loadCourtsWithAvailability({
				date: this.booking.date,
				venueId: this.booking.venueId,
				startTime: this.booking.startTime,
				endTime: this.booking.endTime,
			})
		}
	}

	/**
	 * Format date for display in dialog
	 */
	private formatDate(dateStr: string): string {
		return dayjs(dateStr).format('dddd, MMMM D, YYYY')
	}

	/**
	 * Format time range for display
	 */
	private formatTimeRange(): string {
		if (!this.booking.startTime || !this.booking.endTime) return ''

		return `${dayjs(this.booking.startTime).format('h:mm A')} - ${dayjs(this.booking.endTime).format('h:mm A')}`
	}

	/**
	 * Get container classes based on compact mode
	 */
	private getContainerClasses(): Record<string, boolean> {
		const compact = this.isCompactView
		return {
			'gap-4': !compact,
			'gap-2': compact,
			'py-2': !compact,
			'py-0': compact,
			'transition-all': true,
			'duration-300': true,
		}
	}

	/**
	 * Get court card container classes based on availability
	 */
	private getCourtCardContainerClasses(courtId: string): Record<string, boolean> {
		const availabilityStatus = this.getCourtAvailabilityStatus(courtId)

		return {
			flex: true,
			'justify-center': true,
			'items-center': true,
			'transition-all': true,
			'duration-300': true,
			relative: true, // For availability indicator
			'opacity-50': availabilityStatus === 'none',
			'p-1': availabilityStatus === 'partial', // Add slight padding
			'overflow-visible': true,
		}
	}

	/**
	 * Get court card container style for partially available courts
	 */
	private getCourtCardContainerStyle(courtId: string): string {
		const status = this.getCourtAvailabilityStatus(courtId)

		if (status === 'partial') {
			// Very subtle styling that's professional and understated
			return `
				border: 1px solid #F0F0F0;
				border-radius: 8px;
				background-color: white;
			`
		}

		return ''
	}

	/**
	 * Get styles for the yellow overlay effect - simplified to match screenshot
	 */
	private getYellowOverlayStyle(): string {
		return `
			display: none; /* Hide the overlay to match screenshot */
		`
	}

	/**
	 * Render error state
	 */
	private renderErrorState(): unknown {
		return html`
			<div class="p-6 bg-error-container rounded-lg text-center">
				<schmancy-icon size="32px" class="text-error-default mb-2">error_outline</schmancy-icon>
				<p class="text-error-on-container mb-2">${this.error}</p>
				<button @click=${() => this.retryLoading()} class="px-4 py-2 bg-error-default text-error-on rounded-md mt-2">
					Try Again
				</button>
			</div>
		`
	}

	/**
	 * Render empty state (no courts)
	 */
	private renderEmptyState(): unknown {
		return html`
			<div class="text-center py-6">
				<schmancy-icon size="48px" class="text-surface-on-variant opacity-50"> sports_tennis </schmancy-icon>
				<schmancy-typography type="body" token="md" class="mt-2">
					No courts available at this venue.
				</schmancy-typography>
			</div>
		`
	}

	/**
	 * Render loading state
	 */
	private renderLoadingState(): unknown {
		return html`
			<div class="text-center py-6">
				<div
					class="inline-block w-8 h-8 border-4 border-t-primary-default border-r-outlineVariant border-b-outlineVariant border-l-outlineVariant rounded-full animate-spin"
				></div>
				<schmancy-typography type="body" token="md" class="mt-2"> Loading courts... </schmancy-typography>
			</div>
		`
	}

	/**
	 * Render availability badge on court card based on status
	 */
	private renderAvailabilityBadge(courtId: string): unknown {
		const status = this.getCourtAvailabilityStatus(courtId)

		if (status === 'full') {
			return html`
				<div
					class="absolute top-0 right-0 m-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-sm text-xs border border-emerald-200"
				>
					Available
				</div>
			`
		}

		// Don't show redundant badge for partial availability (handled by the Limited ribbon)
		if (status === 'partial') {
			return null
		}

		return html`
			<div
				class="absolute top-0 right-0 m-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-sm text-xs border border-slate-200 flex items-center"
			>
				<schmancy-icon size="12px" class="mr-1">block</schmancy-icon>
				<span>Unavailable</span>
			</div>
		`
	}

	/**
	 * Render a subtle badge for partially available courts
	 */
	private renderLimitedRibbon(courtId: string): unknown {
		const status = this.getCourtAvailabilityStatus(courtId)

		if (status !== 'partial') return null

		// Simple, professional badge
		return html`
			<div class="absolute top-0 left-0 z-10">
				<div class="bg-amber-50 text-amber-800 text-xs px-2 py-0.5 m-1 rounded-sm border border-amber-200">
					Limited availability
				</div>
			</div>
		`
	}

	/**
	 * Render a pulsing yellow overlay for limited courts
	 */
	private renderYellowGlassOverlay(courtId: string): unknown {
		const status = this.getCourtAvailabilityStatus(courtId)

		if (status !== 'partial') return null

		return html`
			<div style="${this.getYellowOverlayStyle()}" class="yellow-glass-overlay">
				<!-- Add subtle animation effect -->
				<style>
					.yellow-glass-overlay {
						animation: pulse-yellow 3s infinite;
					}
					@keyframes pulse-yellow {
						0% {
							opacity: 0.4;
						}
						50% {
							opacity: 0.7;
						}
						100% {
							opacity: 0.4;
						}
					}
				</style>
			</div>
		`
	}

	/**
	 * Get the simplified time range for partially available courts
	 */
	private getSimplifiedTimeRange(courtId: string): { from: string; to: string; duration: string } {
		const status = this.courtAvailability.get(courtId)
		if (!status || !status.availableTimeSlots.length) {
			return { from: '', to: '', duration: '' }
		}

		// Sort time slots
		const sortedSlots = [...status.availableTimeSlots].sort()

		// Get first and last available time
		const firstTime = sortedSlots[0]
		const lastTime = sortedSlots[sortedSlots.length - 1]

		// Convert to readable format
		const formatTime = (timeStr: string) => {
			const [hour, minute] = timeStr.split(':').map(Number)
			const hour12 = hour % 12 || 12
			const ampm = hour >= 12 ? 'PM' : 'AM'
			return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`
		}

		// Calculate duration
		const durationMinutes = sortedSlots.length * 30
		let duration = ''

		if (durationMinutes >= 60) {
			const hours = Math.floor(durationMinutes / 60)
			const minutes = durationMinutes % 60
			duration = hours + (minutes > 0 ? `.5` : '') + ` hour${hours > 1 ? 's' : ''}`
		} else {
			duration = `${durationMinutes} minutes`
		}

		return {
			from: formatTime(firstTime),
			to: formatTime(lastTime),
			duration,
		}
	}

	/**
	 * Render simplified partial availability confirmation dialog
	 */
	private renderConfirmationDialog(): unknown {
		if (!this.showConfirmationDialog || !this.pendingCourtSelection) return null

		const court = this.pendingCourtSelection
		const timeInfo = this.getSimplifiedTimeRange(court.id)

		return html`
			<div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
				<div class="bg-surface-default rounded-lg p-6 max-w-md w-full shadow-xl text-center">
					<div class="mb-4">
						<schmancy-icon size="48px" class="text-warning-default">warning</schmancy-icon>
						<h3 class="text-xl font-bold text-primary-default mt-2">Limited Availability</h3>
					</div>

					<p class="text-lg mb-6">
						<strong>${court.name}</strong> is only available for
						<strong class="text-success-default">${timeInfo.duration}</strong>
						<br />from ${timeInfo.from} to ${timeInfo.to}
					</p>

					<p class="mb-8 text-surface-on">You requested: <strong>${this.formatTimeRange()}</strong></p>

					<div class="flex justify-center gap-3 mt-4">
						<schmancy-button variant="outlined" @click=${() => this.cancelCourtSelection()}>
							Choose Another Court
						</schmancy-button>
						<schmancy-button variant="filled" @click=${() => this.confirmCourtSelection(court)}>
							Book Available Time
						</schmancy-button>
					</div>
				</div>
			</div>
		`
	}

	/**
	 * Main render method
	 */
	render() {
		// Show loading state
		if (this.loading && !this.lastSuccessfulData) {
			return this.renderLoadingState()
		}

		// Show error message if present
		if (this.error && !this.lastSuccessfulData) {
			return this.renderErrorState()
		}

		// Show empty state if no courts
		if (this.selectedVenueCourts.length === 0) {
			return this.renderEmptyState()
		}

		// Render main content
		return html`
			<div class="mt-3 bg-surface-container-low rounded-lg px-2">
				${this.error
					? html`
							<div class="bg-error-container p-2 rounded-t-lg text-error-on-container text-sm text-center">
								${this.error}
								<button @click=${() => this.retryLoading()} class="ml-2 underline font-medium">Refresh</button>
							</div>
					  `
					: ''}
				${when(
					!this.isCompactView,
					() => html`
						<schmancy-typography type="label" token="lg" class="font-medium text-primary-default">
							Select Court
						</schmancy-typography>
						<div class="text-xs text-surface-on-variant mt-1 mb-2">
							Select a court for your ${this.booking?.startTime ? 'selected time slot' : 'booking'}
						</div>
					`,
				)}
				<div
					class="flex flex-wrap justify-between gap-3 ${classMap(this.getContainerClasses())}"
					role="listbox"
					aria-label="Available Courts"
					aria-multiselectable="false"
				>
					${repeat(
						this.selectedVenueCourts,
						court => court.id,
						court => html`
							<div
								class="${classMap(this.getCourtCardContainerClasses(court.id))}"
								role="option"
								style="${this.getCourtCardContainerStyle(court.id)}"
								aria-selected="${this.booking?.courtId === court.id ? 'true' : 'false'}"
								aria-disabled="${!this.canSelectCourt(court.id) ? 'true' : 'false'}"
							>
								<!-- Yellow glass overlay effect -->
								${this.renderYellowGlassOverlay(court.id)}

								<!-- Availability badge -->
								${this.renderAvailabilityBadge(court.id)}

								<!-- Limited availability ribbon for partial availability -->
								${this.renderLimitedRibbon(court.id)}

								<!-- Visual availability indicator for partial availability -->
								${this.renderCourtAvailabilityIndicator(court.id)}

								<sport-court-card
									id="${court.id}"
									name="${court.name}"
									type="${this.getCourtType(court)}"
									.selected="${this.booking?.courtId === court.id}"
									.disabled="${!this.canSelectCourt(court.id)}"
									.compact="${this.isCompactView}"
									@court-click="${() => this.handleCourtSelect(court)}"
								></sport-court-card>
							</div>
						`,
					)}
				</div>
			</div>

			<!-- Confirmation dialog for partial availability -->
			${this.renderConfirmationDialog()}
		`
	}
}

// Register the element in the global namespace
declare global {
	interface HTMLElementTagNameMap {
		'court-select-step': CourtSelectStep
	}
}
