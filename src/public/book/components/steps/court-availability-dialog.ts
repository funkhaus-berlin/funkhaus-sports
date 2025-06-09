import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import dayjs from 'dayjs'
import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { availabilityContext, AvailabilityData, CourtAvailabilityStatus } from 'src/availability-context'
import { Court } from 'src/types/booking/court.types'
import { Booking, bookingContext } from '../../context'

/**
 * Court Availability Dialog Component
 *
 * Displays a dialog with options for booking a court with limited availability
 * Connects directly to contexts instead of using props for availability data
 */
@customElement('court-availability-dialog')
export class CourtAvailabilityDialog extends $LitElement() {
	// Connect to availability context instead of using props
	@select(availabilityContext, undefined, { required: true })
	availabilityData!: AvailabilityData

	// Connect to booking context
	@select(bookingContext, undefined, { required: true })
	bookingData!: Booking

	@property({ type: Object })
	court!: Court

	@property({ type: Boolean })
	open: boolean = false

	// Computed property to get court availability from context
	private get courtAvailability(): CourtAvailabilityStatus | null {
		if (!this.court?.id) {
			return null
		}

		try {
			// Get the availability directly from the context
			const availabilityData = this.availabilityData

			if (!availabilityData || !availabilityData.timeSlots || availabilityData.timeSlots.length === 0) {
				console.error('No availability data in context')
				return null
			}

			// Extract all available time slots for this court from the context
			const availableTimeSlots: string[] = []

			availabilityData.timeSlots.forEach(slot => {
				if (slot.courtAvailability && slot.courtAvailability[this.court.id] === true) {
					availableTimeSlots.push(slot.time)
				}
			})

			// Create a CourtAvailabilityStatus object
			const status: CourtAvailabilityStatus = {
				courtId: this.court.id,
				courtName: this.court.name,
				available: availableTimeSlots.length > 0,
				availableTimeSlots: availableTimeSlots,
				unavailableTimeSlots: [],
				fullyAvailable: false, // We'll calculate this below
			}

			// Check if the court is fully available for the requested booking
			if (this.bookingData?.startTime && this.bookingData?.endTime) {
				const originalStart = dayjs(this.bookingData.startTime).format('HH:mm')
				const originalEnd = dayjs(this.bookingData.endTime).format('HH:mm')

				const timeline = this.generateTimeSlots()
				const startIdx = timeline.indexOf(originalStart)
				const endIdx = timeline.indexOf(originalEnd)

				if (startIdx !== -1 && endIdx !== -1) {
					let allSlotsAvailable = true

					for (let i = startIdx; i < endIdx; i++) {
						if (!availableTimeSlots.includes(timeline[i])) {
							allSlotsAvailable = false
							break
						}
					}

					status.fullyAvailable = allSlotsAvailable
				}
			}

			return status
		} catch (error) {
			console.error('Error getting court availability:', error)
			return null
		}
	}

	/**
	 * Close the dialog
	 */
	close() {
		this.open = false
		this.dispatchEvent(new CustomEvent('dialog-close'))
	}

	/**
	 * Confirm court selection with chosen time option
	 */
	confirmSelection(
		option: 'partial' | 'alternative' | 'extended' | 'original',
		timeSlot?: { start: string; end: string },
	) {
		this.dispatchEvent(
			new CustomEvent('confirm-selection', {
				detail: {
					court: this.court,
					option,
					timeSlot,
				},
			}),
		)
		this.close()
	}

	/**
	 * Cancel court selection
	 */
	cancelSelection() {
		this.dispatchEvent(new CustomEvent('cancel-selection'))
		this.close()
	}

	/**
	 * Get the next time slot (30 min increment)
	 */
	private getNextTimeSlot(time: string): string {
		const [hours, minutes] = time.split(':').map(Number)
		let newMinutes = minutes + 30
		let newHours = hours

		if (newMinutes >= 60) {
			newMinutes = 0
			newHours = (newHours + 1) % 24
		}

		return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`
	}

	/**
	 * Convert array of time strings to time ranges
	 */
	private getTimeRanges(timeSlots: string[]): Array<{ start: string; end: string }> {
		if (!timeSlots || timeSlots.length === 0) return []

		// Keep original order without sorting
		const sortedSlots = [...timeSlots]
		const ranges: Array<{ start: string; end: string }> = []

		let currentRange: { start: string; end: string } | null = null

		for (let i = 0; i < sortedSlots.length; i++) {
			const currentSlot = sortedSlots[i]

			if (!currentRange) {
				// Start a new range
				currentRange = {
					start: currentSlot,
					end: this.getNextTimeSlot(currentSlot),
				}
			} else {
				// Check if this slot is adjacent to the current range
				if (currentRange.end === currentSlot) {
					// Extend the current range
					currentRange.end = this.getNextTimeSlot(currentSlot)
				} else {
					// Complete the current range and start a new one
					ranges.push(currentRange)
					currentRange = {
						start: currentSlot,
						end: this.getNextTimeSlot(currentSlot),
					}
				}
			}
		}

		// Add the last range if it exists
		if (currentRange) {
			ranges.push(currentRange)
		}

		return ranges
	}

	/**
	 * Calculate duration between two time strings in minutes
	 */
	private calculateSlotDuration(start: string, end: string): number {
		const [startHours, startMinutes] = start.split(':').map(Number)
		const [endHours, endMinutes] = end.split(':').map(Number)

		let totalStartMinutes = startHours * 60 + startMinutes
		let totalEndMinutes = endHours * 60 + endMinutes

		// Handle crossing midnight
		if (totalEndMinutes < totalStartMinutes) {
			totalEndMinutes += 24 * 60
		}

		return totalEndMinutes - totalStartMinutes
	}

	/**
	 * Convert time string to minutes since midnight
	 */
	private timeToMinutes(time: string): number {
		const [hours, minutes] = time.split(':').map(Number)
		return hours * 60 + minutes
	}

	/**
	 * Calculate duration from booking start and end times
	 */
	private calculateBookingDuration(): number {
		if (!this.bookingData.startTime || !this.bookingData.endTime) {
			return 0
		}

		try {
			const start = dayjs(this.bookingData.startTime)
			const end = dayjs(this.bookingData.endTime)
			return end.diff(start, 'minute')
		} catch (e) {
			console.error('Error calculating duration:', e)
			return 0
		}
	}

	/**
	 * Generate a description of how the alternative time slot compares to the original request
	 */
	private compareTimeSlots(origStart: string, origEnd: string, newStart: string, newEnd: string): string {
		const origStartMins = this.timeToMinutes(origStart)
		const origEndMins = this.timeToMinutes(origEnd)
		const newStartMins = this.timeToMinutes(newStart)
		const newEndMins = this.timeToMinutes(newEnd)

		// Calculate time differences
		const startDiff = newStartMins - origStartMins
		const endDiff = newEndMins - origEndMins

		// Format the time difference
		const formatTimeDiff = (diff: number): string => {
			const hours = Math.floor(Math.abs(diff) / 60)
			const mins = Math.abs(diff) % 60
			let result = ''

			if (hours > 0) result += `${hours}h`
			if (mins > 0) result += `${mins}m`

			return diff > 0 ? `${result} later` : `${result} earlier`
		}

		// Generate description
		if (startDiff === 0 && endDiff === 0) {
			return 'Same time as requested'
		} else if (startDiff === 0) {
			return `Ends ${formatTimeDiff(endDiff)}`
		} else if (endDiff === 0) {
			return `Starts ${formatTimeDiff(startDiff)}`
		} else if (startDiff === endDiff) {
			return `Entire booking shifted ${formatTimeDiff(startDiff)}`
		} else {
			return `Starts ${formatTimeDiff(startDiff)}, ends ${formatTimeDiff(endDiff)}`
		}
	}

	/**
	 * Find an extended booking time that preserves as much of the original booking as possible
	 * while ensuring the full requested duration
	 */
	private findExtendedSlot(
		originalStart: string,
		originalEnd: string,
		originalDuration: number,
		availableSlots: string[],
	): { start: string; end: string } | null {
		// Generate a complete timeline of 30-minute slots for the day
		const timeline = this.generateTimeSlots()

		// Find the original booking's position in the timeline
		const startIdx = timeline.indexOf(originalStart)
		const endIdx = timeline.indexOf(originalEnd)

		if (startIdx === -1 || endIdx === -1) {
			console.error('Could not find original booking times in timeline')
			return null
		}

		// Determine how many 30-minute slots the original booking spans
		const originalSlotCount = endIdx - startIdx
		const requiredSlotCount = Math.ceil(originalDuration / 30)

		// If we don't need more slots, nothing to extend
		if (requiredSlotCount <= originalSlotCount) {
			// But we need to check if the original booking slots are all available
			let allAvailable = true
			for (let i = startIdx; i < endIdx; i++) {
				if (!availableSlots.includes(timeline[i])) {
					allAvailable = false
					break
				}
			}

			if (allAvailable) {
				return { start: originalStart, end: originalEnd }
			}
		}

		// APPROACH 1: Try to maintain original start time, extend end
		for (let extensionLength = 1; extensionLength <= 8; extensionLength++) {
			// Check if extending by this many slots works
			const newEndIdx = endIdx + extensionLength

			// Make sure we don't go beyond the timeline
			if (newEndIdx >= timeline.length) continue

			// Check all slots from original start to new end
			let allSlotsAvailable = true
			for (let i = startIdx; i < newEndIdx; i++) {
				if (!availableSlots.includes(timeline[i])) {
					allSlotsAvailable = false
					break
				}
			}

			if (allSlotsAvailable) {
				const newEnd = timeline[newEndIdx]
				const extension = { start: originalStart, end: newEnd }
				const extensionDuration = this.calculateSlotDuration(extension.start, extension.end)

				// Make sure the extension is long enough
				if (extensionDuration >= originalDuration) {
					return extension
				}
			}
		}

		// APPROACH 2: Try to maintain original end time, start earlier
		for (let extensionLength = 1; extensionLength <= 8; extensionLength++) {
			// Check if starting this many slots earlier works
			const newStartIdx = startIdx - extensionLength

			// Make sure we don't go before the beginning of the day
			if (newStartIdx < 0) continue

			// Check all slots from new start to original end
			let allSlotsAvailable = true
			for (let i = newStartIdx; i < endIdx; i++) {
				if (!availableSlots.includes(timeline[i])) {
					allSlotsAvailable = false
					break
				}
			}

			if (allSlotsAvailable) {
				const newStart = timeline[newStartIdx]
				const extension = { start: newStart, end: originalEnd }
				const extensionDuration = this.calculateSlotDuration(extension.start, extension.end)

				// Make sure the extension is long enough
				if (extensionDuration >= originalDuration) {
					return extension
				}
			}
		}

		// APPROACH 3: Try combinations - extend in both directions
		for (let startExt = 1; startExt <= 4; startExt++) {
			for (let endExt = 1; endExt <= 4; endExt++) {
				const newStartIdx = startIdx - startExt
				const newEndIdx = endIdx + endExt

				// Boundary checks
				if (newStartIdx < 0 || newEndIdx >= timeline.length) continue

				// Check all slots from new start to new end
				let allSlotsAvailable = true
				for (let i = newStartIdx; i < newEndIdx; i++) {
					if (!availableSlots.includes(timeline[i])) {
						allSlotsAvailable = false
						break
					}
				}

				if (allSlotsAvailable) {
					const newStart = timeline[newStartIdx]
					const newEnd = timeline[newEndIdx]
					const extension = { start: newStart, end: newEnd }
					const extensionDuration = this.calculateSlotDuration(extension.start, extension.end)

					// Make sure the extension is long enough
					if (extensionDuration >= originalDuration) {
						return extension
					}
				}
			}
		}

		// APPROACH 4: Look for any contiguous block of the right duration
		// that overlaps with the original booking
		for (
			let possibleStartIdx = Math.max(0, startIdx - 4);
			possibleStartIdx < Math.min(timeline.length, endIdx + 4);
			possibleStartIdx++
		) {
			// Check if we have enough contiguous available slots from here
			let availableCount = 0

			for (
				let i = possibleStartIdx;
				i < Math.min(timeline.length, possibleStartIdx + 10) && availableCount < requiredSlotCount;
				i++
			) {
				if (availableSlots.includes(timeline[i])) {
					availableCount++
				} else {
					break // Break sequence of availability
				}
			}

			// If we found enough contiguous slots
			if (availableCount >= requiredSlotCount) {
				const possibleStart = timeline[possibleStartIdx]
				const possibleEnd = timeline[possibleStartIdx + requiredSlotCount]

				// Verify overlaps with original booking somewhat
				const overlapStart = Math.max(possibleStartIdx, startIdx)
				const overlapEnd = Math.min(possibleStartIdx + requiredSlotCount, endIdx)

				if (overlapEnd > overlapStart) {
					// There is some overlap
					return { start: possibleStart, end: possibleEnd }
				}
			}
		}

		// If we've tried everything and found nothing
		return null
	}

	/**
	 * Generate all possible time slots in 30 minute increments
	 * from 8:00 to 22:00
	 */
	private generateTimeSlots(): string[] {
		const slots: string[] = []

		for (let hour = 8; hour < 22; hour++) {
			slots.push(`${hour.toString().padStart(2, '0')}:00`)
			slots.push(`${hour.toString().padStart(2, '0')}:30`)
		}

		return slots
	}

	/**
	 * Find best alternative time options to fulfill user's requested duration
	 * Prioritizes keeping as much of the original request intact as possible
	 */
	private findBestTimeOptions(): {
		extendedSlot: { start: string; end: string } | null
		partialSlot: { start: string; end: string } | null
		alternativeSlot: { start: string; end: string } | null
	} {
		const availability = this.courtAvailability

		if (!availability?.availableTimeSlots || availability.availableTimeSlots.length === 0) {
			return { extendedSlot: null, partialSlot: null, alternativeSlot: null }
		}

		// Keep original order without sorting
		const availableSlots = [...availability.availableTimeSlots]

		// Original booking details
		const originalStart = dayjs(this.bookingData.startTime).format('HH:mm')
		const originalEnd = dayjs(this.bookingData.endTime).format('HH:mm')
		const originalDuration = this.calculateBookingDuration()

		// FIRST: Find partial slot by looking for available slots WITHIN the original time range
		let partialSlot = this.findPartialSlotWithinOriginalRange(originalStart, originalEnd, availableSlots)

		// OPTION 1: Try to extend the original booking to fulfill the duration
		let extendedSlot = this.findExtendedSlot(originalStart, originalEnd, originalDuration, availableSlots)

		// OPTION 2: Find any alternative full-duration slot
		let alternativeSlot = this.findStrictAlternativeSlot(originalDuration, availableSlots)

		return {
			extendedSlot,
			partialSlot,
			alternativeSlot,
		}
	}

	/**
	 * Find a partial slot that represents the available portion within the original time range
	 * This ensures partial slots are always a subset of the original request
	 */
	private findPartialSlotWithinOriginalRange(
		originalStart: string,
		originalEnd: string,
		availableSlots: string[],
	): { start: string; end: string } | null {
		// Generate all 30-minute time slots within the original range
		const timeline = this.generateTimeSlots()
		const startIdx = timeline.indexOf(originalStart)
		const endIdx = timeline.indexOf(originalEnd)

		if (startIdx === -1 || endIdx === -1) {
			return null
		}

		// Find which portions of the original time range are available
		const availablePortions: string[] = []
		for (let i = startIdx; i < endIdx; i++) {
			if (availableSlots.includes(timeline[i])) {
				availablePortions.push(timeline[i])
			}
		}

		// If no available portions, no partial option
		if (availablePortions.length === 0) {
			return null
		}

		// Find continuous segments of availability
		const segments: Array<{ start: string; end: string }> = []
		let currentSegment: { start: string; end: string } | null = null

		for (let i = 0; i < availablePortions.length; i++) {
			const currentTime = availablePortions[i]
			const expectedNextTime = i < availablePortions.length - 1 ? this.getNextTimeSlot(currentTime) : null

			if (!currentSegment) {
				// Start a new segment
				currentSegment = {
					start: currentTime,
					end: this.getNextTimeSlot(currentTime),
				}
			} else if (expectedNextTime && expectedNextTime === availablePortions[i + 1]) {
				// Continue current segment
				currentSegment.end = this.getNextTimeSlot(availablePortions[i])
			} else {
				// End current segment and push to list
				segments.push(currentSegment)
				currentSegment = null
			}
		}

		// Add the last segment if it exists
		if (currentSegment) {
			segments.push(currentSegment)
		}

		// Find the longest continuous segment
		if (segments.length === 0) {
			return null
		}

		// Use the first segment without sorting by duration
		// No sorting to maintain original order

		// Return the longest available segment
		return segments[0]
	}

	/**
	 * Find a strictly alternative slot that matches the requested duration
	 * This is used when we can't extend the original booking
	 */
	private findStrictAlternativeSlot(
		originalDuration: number,
		availableSlots: string[],
	): { start: string; end: string } | null {
		// Need at least originalDuration / 30 consecutive slots (assuming 30-min increments)
		const requiredConsecutiveSlots = Math.ceil(originalDuration / 30)

		// Find consecutive slots that match the original duration
		for (let i = 0; i <= availableSlots.length - requiredConsecutiveSlots; i++) {
			let isConsecutive = true
			let currentSlot = availableSlots[i]

			// Check if we have enough consecutive slots
			for (let j = 1; j < requiredConsecutiveSlots; j++) {
				const expectedNextSlot = this.getNextTimeSlot(currentSlot)
				if (availableSlots[i + j] !== expectedNextSlot) {
					isConsecutive = false
					break
				}
				currentSlot = expectedNextSlot
			}

			// If we found consecutive slots, return the start and end
			if (isConsecutive) {
				const startSlot = availableSlots[i]
				const lastSlot = availableSlots[i + requiredConsecutiveSlots - 1]
				return {
					start: startSlot,
					end: this.getNextTimeSlot(lastSlot),
				}
			}
		}

		return null
	}

	render() {
		if (!this.open || !this.court) return null

		// Get court availability from context
		const availability = this.courtAvailability
		if (!availability) {
			return html`
				<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
					<schmancy-surface type="container" class="max-w-md w-full rounded-lg shadow-xl">
						<div class="flex flex-col items-center justify-center text-center p-6">
							<schmancy-icon size="48px" class="text-error-default mb-2">error_outline</schmancy-icon>
							<schmancy-typography type="title" token="md" class="mb-4">
								Unable to load availability information
							</schmancy-typography>
							<schmancy-button variant="filled" @click=${() => this.cancelSelection()}>Close</schmancy-button>
						</div>
					</schmancy-surface>
				</div>
			`
		}

		// Original booking times
		const originalStart = dayjs(this.bookingData.startTime).format('HH:mm')
		const originalEnd = dayjs(this.bookingData.endTime).format('HH:mm')
		const originalDuration = this.calculateBookingDuration()
		const originalPrice = this.bookingData.price || 0
		const formattedDate = dayjs(this.bookingData.date).format('ddd, MMM D')

		// Find all possible booking options
		const { extendedSlot, partialSlot, alternativeSlot } = this.findBestTimeOptions()

		// Calculate details for partial slot (if available)
		const partialDuration = partialSlot ? this.calculateSlotDuration(partialSlot.start, partialSlot.end) : 0
		const partialPriceRatio = partialDuration / originalDuration
		const partialPrice = Math.round(originalPrice * partialPriceRatio)

		// Calculate details for extended slot (if available)
		const extendedDuration = extendedSlot ? this.calculateSlotDuration(extendedSlot.start, extendedSlot.end) : 0

		// Determine option priorities (which to recommend)
		const hasFullDurationOption = extendedSlot || alternativeSlot

		// Visual styling helpers for options
		const getOptionClass = (option: 'extended' | 'alternative' | 'partial', isRecommended: boolean) => {
			return {
				'border-l-4': true,
				'rounded-md': true,
				'transition-all': true,
				'duration-200': true,
				transform: true,
				'hover:translate-y-[-2px]': true,
				'hover:shadow-md': true,
				'border-primary-default': option === 'extended',
				'border-secondary-default': option === 'alternative',
				'border-tertiary-default': option === 'partial',
				'bg-gradient-to-r': isRecommended,
				'from-primary-container/20': isRecommended && option === 'extended',
				'from-secondary-container/20': isRecommended && option === 'alternative',
				'from-tertiary-container/20': isRecommended && option === 'partial',
				'to-transparent': isRecommended,
			}
		}

		return html`
			<div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
				<schmancy-surface type="container" class="max-w-lg w-full rounded-lg shadow-xl overflow-hidden">
					<!-- Header with court info -->
					<div class="bg-surface-container p-4 border-b border-outlineVariant">
						<div class="flex justify-between items-start">
							<schmancy-typography type="title" token="lg" class="text-primary-default">
								Limited Availability for Court ${this.court.name}
							</schmancy-typography>
						</div>

						<!-- Original booking summary -->
						<div class="flex justify-between mt-2">
							<schmancy-typography type="body" token="md" weight="medium">
								${formattedDate}, ${originalStart}-${originalEnd}
							</schmancy-typography>
							<schmancy-typography type="body" token="md"></schmancy-typography>
						</div>
					</div>

					<!-- Options section with cards -->
					<div class="p-4 max-h-[50vh] overflow-y-auto">
						<div class="space-y-3">
							<!-- OPTION 1: Extended slot with full duration -->
							${extendedSlot
								? html`
										<section class="p-4 border rounded-md shadow-sm ${classMap(getOptionClass('extended', true))}">
											<div class="flex justify-between items-start mb-2">
												<div class="flex items-center gap-2">
													<schmancy-icon size="20px" class="text-primary-default">update</schmancy-icon>
													<schmancy-typography type="title" token="sm">Adjusted Time</schmancy-typography>
												</div>
												<div class="bg-primary-container px-2 py-0.5 rounded-full">
													<schmancy-typography type="label" token="md" class="text-primary-on-container">
														Recommended
													</schmancy-typography>
												</div>
											</div>

											<div class="grid grid-cols-2 gap-4 mb-3">
												<div>
													<div class="flex items-center mt-1">
														<div class="bg-success-container/30 px-2 py-1 rounded-lg flex items-center gap-1">
															<schmancy-typography type="body" token="md" weight="medium">
																${extendedSlot.start}-${extendedSlot.end}
															</schmancy-typography>
														</div>
													</div>
												</div>

												<div>
													<div class="flex items-center gap-1">
														<schmancy-icon size="16px" class="text-success-default">timer</schmancy-icon>
														<schmancy-typography type="body" token="sm"> ${extendedDuration} mins </schmancy-typography>
													</div>
												</div>
											</div>

											<!-- Price and action -->
											<div class="flex justify-between items-center mt-4">
												<div>
													<schmancy-typography type="title" token="md" class="text-primary-default">
														€${originalPrice.toFixed(2)}
													</schmancy-typography>
												</div>
												<schmancy-button
													variant="filled"
													@click=${() => this.confirmSelection('extended', extendedSlot)}
												>
													Book Adjusted Time
												</schmancy-button>
											</div>
										</section>
								  `
								: ''}

							<!-- OPTION 2: Alternative slot with full duration -->
							${alternativeSlot && !extendedSlot
								? html`
										<section
											class="p-4 border rounded-md shadow-sm ${classMap(getOptionClass('alternative', !extendedSlot))}"
										>
											<div class="flex justify-between items-start mb-2">
												<div class="flex items-center gap-2">
													<schmancy-icon size="20px" class="text-secondary-default">today</schmancy-icon>
													<schmancy-typography type="title" token="sm">Alternative Time</schmancy-typography>
												</div>
												${!extendedSlot
													? html`
															<div class="bg-secondary-container px-2 py-0.5 rounded-full">
																<schmancy-typography type="label" token="md" class="text-secondary-on-container">
																	Recommended
																</schmancy-typography>
															</div>
													  `
													: ''}
											</div>

											<div class="grid grid-cols-2 gap-4 mb-3">
												<div>
													<div class="flex items-center mt-1">
														<div class="bg-success-container/30 px-2 py-1 rounded-lg flex items-center gap-1">
															<schmancy-typography type="body" token="md" weight="medium">
																${alternativeSlot.start}-${alternativeSlot.end}
															</schmancy-typography>
														</div>
													</div>
												</div>

												<div>
													<div class="flex items-center gap-1">
														<schmancy-icon size="16px" class="text-success-default">timer</schmancy-icon>
														<schmancy-typography type="body" token="sm"> ${originalDuration} mins </schmancy-typography>
													</div>
												</div>
											</div>

											<!-- Price and action -->
											<div class="flex justify-between items-center mt-4">
												<div>
													<schmancy-typography type="title" token="md" class="text-secondary-default">
														€${originalPrice.toFixed(2)}
													</schmancy-typography>
												</div>
												<schmancy-button
													variant="filled"
													@click=${() => this.confirmSelection('alternative', alternativeSlot)}
												>
													Book Alternative Time
												</schmancy-button>
											</div>
										</section>
								  `
								: ''}

							<!-- OPTION 3: Partial slot with reduced duration -->
							${partialSlot
								? html`
										<section
											class="p-4 border rounded-md shadow-sm ${classMap(
												getOptionClass('partial', !hasFullDurationOption),
											)}"
										>
											<div class="flex justify-between items-start mb-2">
												<div class="flex items-center gap-2">
													<schmancy-icon size="20px" class="text-tertiary-default">content_cut</schmancy-icon>
													<schmancy-typography type="title" token="sm">Partial Booking</schmancy-typography>
												</div>
												${!hasFullDurationOption
													? html`
															<div class="bg-tertiary-container px-2 py-0.5 rounded-full">
																<schmancy-typography type="label" token="md" class="text-tertiary-on-container">
																	Recommended
																</schmancy-typography>
															</div>
													  `
													: ''}
											</div>

											<div class="grid grid-cols-2 gap-4 mb-3">
												<div>
													<div class="flex items-center mt-1">
														<div class="bg-warning-container/30 px-2 py-1 rounded-lg flex items-center gap-1">
															<schmancy-typography type="body" token="md" weight="medium">
																${partialSlot.start}-${partialSlot.end}
															</schmancy-typography>
														</div>
													</div>
												</div>

												<div>
													<div class="flex items-center gap-1">
														<schmancy-icon size="16px" class="text-warning-default">timer</schmancy-icon>
														<schmancy-typography type="body" token="sm">
															${partialDuration} mins (${Math.round((partialDuration / originalDuration) * 100)}%)
														</schmancy-typography>
													</div>
												</div>
											</div>

											<!-- Price and action -->
											<div class="flex justify-between items-center mt-4">
												<div>
													<div class="flex items-center gap-1">
														<schmancy-typography type="title" token="md" class="text-tertiary-default">
															€${(originalPrice * partialPriceRatio).toFixed(2)}
														</schmancy-typography>
													</div>
												</div>
												<schmancy-button
													variant="${hasFullDurationOption ? 'outlined' : 'filled'}"
													@click=${() => this.confirmSelection('partial', partialSlot)}
												>
													Book Partial Time
												</schmancy-button>
											</div>
										</section>
								  `
								: ''}

							<!-- No availability message -->
							${!partialSlot && !alternativeSlot && !extendedSlot
								? html`
										<div class="flex flex-col items-center justify-center py-8 text-center">
											<schmancy-icon size="48px" class="text-error-default mb-3">highlight_off</schmancy-icon>
											<schmancy-typography type="body" token="md" class="text-error-default mb-2">
												No available time slots found
											</schmancy-typography>
										</div>
								  `
								: ''}
						</div>
					</div>

					<!-- Footer actions -->
					<div class="p-4 border-t border-outlineVariant bg-surface-container-low">
						<schmancy-button variant="text" @click=${() => this.cancelSelection()}>
							Choose Another Court
						</schmancy-button>
					</div>
				</schmancy-surface>
			</div>
		`
	}
}
