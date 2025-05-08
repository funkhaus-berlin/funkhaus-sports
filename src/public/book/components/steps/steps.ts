// src/public/book/components/steps/steps.ts

import { color, SchmancyTheme, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { availabilityContext, AvailabilityData, BOOKING_FLOWS } from 'src/availability-context'
import { Booking, bookingContext, BookingProgressContext } from '../../context'

/**
 * Step item interface now matches the BookingFlowStep interface
 */
export interface Step {
	step: number
	label: string
	icon: string
}

/**
 * A reusable horizontal steps component with animations
 * Updated to work with the new flow structure
 */
@customElement('funkhaus-booking-steps')
export class FunkhausBookingSteps extends $LitElement() {
	/**
	 * Previous step value for animations
	 */
	@state()
	private previousStep: number = 1

	/**
	 * Event fired when a step is clicked
	 */
	@property({ type: Boolean })
	clickable: boolean = true

	/**
	 * Check if the step change animation is in progress
	 */
	@state()
	private animating: boolean = false

	@select(BookingProgressContext, undefined, {
		required: true,
	})
	bookingProgress!: any

	@select(bookingContext, undefined, {
		required: true,
	})
	booking!: Booking

	@select(availabilityContext, undefined, {
		required: true,
	})
	availability!: AvailabilityData

	/**
	 * Get the steps in current flow
	 * Simplified to directly use the BOOKING_FLOWS constant
	 */
	private get currentSteps(): Step[] {
		const flowType = this.availability.bookingFlowType
		return BOOKING_FLOWS[flowType] || []
	}

	/**
	 * Current step getter for cleaner access
	 */
	private get currentStep(): number {
		return this.bookingProgress?.currentStep || 1
	}

	connectedCallback() {
		super.connectedCallback()

		// Subscribe to step changes and trigger animations
		BookingProgressContext.$.subscribe(progress => {
			if (progress && this.previousStep !== progress.currentStep) {
				this.animateStepChange(this.previousStep, progress.currentStep)
				this.previousStep = progress.currentStep
			}
		})
	}

	/**
	 * Animate the transition between steps using Web Animations API
	 * Updated to use numeric step values
	 */
	private animateStepChange(fromStep: number, toStep: number) {
		this.animating = true

		// Get the step elements that need animation
		const stepElements = this.shadowRoot?.querySelectorAll('.step-icon') || []
		const connectors = this.shadowRoot?.querySelectorAll('.connector-line') || []

		// Get the indices in the current flow
		const fromIndex = this.getStepIndex(fromStep)
		const toIndex = this.getStepIndex(toStep)

		// Find the specific elements we want to animate
		const targetStepIcon = stepElements[toIndex] as HTMLElement

		if (targetStepIcon) {
			// Create a bounce animation for the new active step
			targetStepIcon.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], {
				duration: 600,
				easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
			})
		}

		// Animate connectors if moving forward
		if (toIndex > fromIndex) {
			for (let i = fromIndex; i < toIndex; i++) {
				if (connectors[i]) {
					connectors[i].animate(
						[
							{ transform: 'scaleX(0)', opacity: 0.5 },
							{ transform: 'scaleX(1)', opacity: 1 },
						],
						{
							duration: 300,
							easing: 'ease-out',
						},
					)
				}
			}
		}

		// Clear animating flag after animations are complete
		setTimeout(() => {
			this.animating = false
		}, 600)
	}

	/**
	 * Get the index of a step in the current flow
	 * Updated to work with numeric step values
	 */
	private getStepIndex(stepNumber: number): number {
		return this.currentSteps.findIndex(s => s.step === stepNumber)
	}

	/**
	 * Check if a step should be considered active based on its position
	 * Updated to work with numeric step values
	 */
	private isStepActive(stepToCheck: number): boolean {
		// Get the indices in the current flow
		const currentStepIndex = this.getStepIndex(this.currentStep)
		const checkStepIndex = this.getStepIndex(stepToCheck)

		// A step is active if its index is less than or equal to the current step's index
		return checkStepIndex <= currentStepIndex
	}

	/**
	 * Helper method to render a single step
	 * Updated to use the new step structure
	 */
	private renderStep(step: Step, index: number) {
		const stepNumber = step.step
		const isActive = this.isStepActive(stepNumber)
		const isCurrent = this.currentStep === stepNumber

		// Other rendering code remains the same
		const stepClasses = {
			'transition-all': true,
			'duration-300': true,
			'cursor-pointer': this.clickable && isActive,
			'cursor-not-allowed': this.clickable && !isActive,
			'min-w-max': true,
			'px-0': true,
			'py-2': true,
		}

		const iconClasses = {
			'step-icon': true,
			'w-10': true,
			'h-10': true,
			flex: true,
			'items-center': true,
			'justify-center': true,
			'rounded-full': true,
			'shadow-sm': true,
			'transition-all': true,
			'duration-300': true,
			'flex-shrink-0': true,
			transform: true,
			'scale-110': isCurrent,
		}

		const textClasses = {
			'transition-all': true,
			'duration-200': true,
			'whitespace-nowrap': true,
			'ml-0 mr-1': true,
			'overflow-visible': true,
		}

		return html`
			<schmancy-flex
				align="center"
				gap="sm"
				class=${classMap(stepClasses)}
				@click=${() => this.handleStepClick(stepNumber)}
			>
				<div
					class=${classMap(iconClasses)}
					${color({
						bgColor: isActive ? SchmancyTheme.sys.color.primary.default : SchmancyTheme.sys.color.surface.dim,
						color: isActive ? SchmancyTheme.sys.color.primary.on : SchmancyTheme.sys.color.surface.on,
					})}
				>
					<schmancy-icon>${step.icon}</schmancy-icon>
				</div>
				${isCurrent
					? html`
							<schmancy-typography token="sm" weight="bold" class=${classMap(textClasses)}>
								${step.label}
							</schmancy-typography>
					  `
					: null}
			</schmancy-flex>
		`
	}

	/**
	 * Helper method to render connector line
	 * Updated for the new step structure
	 */
	private renderConnector(nextStepIndex: number) {
		// Get the next step from the flow
		const nextStep = this.currentSteps[nextStepIndex].step

		// A connector is active if the next step is active
		const isActive = this.isStepActive(nextStep)

		const connectorClasses = {
			'connector-line': true,
			'h-0.5': true,
			'w-full': true,
			'transition-colors': true,
			'duration-500': true,
			'origin-left': true,
		}

		return html`
			<div
				class=${classMap(connectorClasses)}
				${color({
					bgColor: isActive ? SchmancyTheme.sys.color.primary.default : SchmancyTheme.sys.color.surface.dim,
				})}
			></div>
		`
	}

	/**
	 * Handle step click events when clickable is true
	 * Updated to work with expanded steps and sequential flow
	 */
	private handleStepClick(stepNumber: number) {
		// Only allow clicking on completed steps (and current step)
		const isActive = this.isStepActive(stepNumber)
		
		if (this.clickable && !this.animating && isActive) {
			// Get the ordered steps
			const steps = this.currentSteps.map(s => s.step)
			
			// Find the indices of current and target steps
			const currentIndex = steps.indexOf(this.currentStep)
			const targetIndex = steps.indexOf(stepNumber)
			
			// Only if we're going backward in the flow
			if (stepNumber !== this.currentStep && targetIndex < currentIndex) {
				// Reset booking data based on which step we're navigating to
				const resetData: Partial<any> = {}
				
				// Clear data for steps between target and current
				// Implementation depends on specific step values
				if (stepNumber < 2) {
					// Clear everything if going back to date
					resetData.courtId = ''
					resetData.startTime = ''
					resetData.endTime = ''
				} else if (stepNumber < 3) {
					// Clear time and duration
					resetData.startTime = ''
					resetData.endTime = ''
				} else if (stepNumber < 4) {
					// Clear duration only
					resetData.endTime = ''
				}

				// Update the booking context with reset data
				if (Object.keys(resetData).length > 0) {
					bookingContext.set(resetData, true)
				}
				
				// Update the current step in the progress context
				// Don't update expanded steps - we keep all expanded steps visible
				BookingProgressContext.set({
					currentStep: stepNumber,
				})
			}
		}
	}

	render() {
		// Get steps based on current booking flow
		const steps = this.currentSteps

		return html`
			<schmancy-flex
				justify="between"
				align="center"
				wrap="nowrap"
				class="transition-all duration-500 w-full overflow-x-auto px-2"
			>
				${steps.map((step, index) => {
					// For all but the last step, create a combined step+connector group
					if (index < steps.length - 1) {
						return html`
							<div class="flex items-center flex-shrink-0 min-w-max">${this.renderStep(step, index)}</div>
							<div class="flex-grow min-w-2 max-w-24">${this.renderConnector(index + 1)}</div>
						`
					}

					// For the last step, just return the step by itself
					return html` <div class="flex items-center flex-shrink-0 min-w-max">${this.renderStep(step, index)}</div> `
				})}
			</schmancy-flex>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-booking-steps': FunkhausBookingSteps
	}
}
