import { color, SchmancyTheme, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { Booking, bookingContext, BookingProgress, BookingProgressContext, BookingStep } from '../../context'

/**
 * Step item interface
 */
export interface Step {
	label: string
	icon: string
}

/**
 * A reusable horizontal steps component with animations
 * Uses Schmancy UI components for a consistent Material 3 experience
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

	@select(BookingProgressContext)
	bookingProgress!: BookingProgress

	@select(bookingContext)
	booking!: Booking

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
	 */
	private animateStepChange(fromStep: number, toStep: number) {
		this.animating = true

		// Get the step elements that need animation
		const stepElements = this.shadowRoot?.querySelectorAll('.step-icon') || []
		const connectors = this.shadowRoot?.querySelectorAll('.connector-line') || []

		// Find the specific elements we want to animate
		const targetStepIcon = stepElements[toStep - 1] as HTMLElement

		if (targetStepIcon) {
			// Create a bounce animation for the new active step
			targetStepIcon.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], {
				duration: 600,
				easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
			})
		}

		// Animate connectors if moving forward
		if (toStep > fromStep) {
			for (let i = fromStep - 1; i < toStep - 1; i++) {
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
	 * Helper method to render a single step
	 */
	private renderStep(step: Step, index: number) {
		const stepNumber = index + 1
		const isActive = this.currentStep >= stepNumber
		const isCurrent = this.currentStep === stepNumber

		// Classes for step container
		const stepClasses = {
			'transition-all': true,
			'duration-300': true,
			'cursor-pointer': this.clickable && isActive, // Only completed and current steps are clickable
			'cursor-not-allowed': this.clickable && !isActive,
			'min-w-max': true, // Ensure minimum width based on content
			'px-0': true, // Add horizontal padding
			'py-2': true, // Add consistent vertical padding for all steps
		}

		// Classes for the icon container
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
			'flex-shrink-0': true, // Prevent icon from shrinking
			transform: true,
			'scale-110': isCurrent, // Slightly enlarge the current step icon
		}

		// Classes for the text
		const textClasses = {
			'transition-all': true,
			'duration-200': true,
			'whitespace-nowrap': true, // Prevent text wrapping
			'ml-0 mr-1': true, // Add left margin
			'overflow-visible': true, // Ensure text doesn't get clipped
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
	 */
	private renderConnector(nextStep: number) {
		const isActive = this.currentStep >= nextStep

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
	 * Improved to reset the state of steps ahead when navigating backward
	 */
	private handleStepClick(stepNumber: number) {
		// Only allow clicking on completed steps (and current step)
		const isActive = this.currentStep >= stepNumber

		if (this.clickable && !this.animating && isActive) {
			// Going backward in the flow
			if (stepNumber < this.currentStep) {
				// Reset booking data based on which step we're navigating to
				const resetData: Partial<Booking> = {}

				// Clear data for steps ahead of the selected step
				switch (stepNumber) {
					case BookingStep.Date:
						// Reset everything when going back to first step
						resetData.date = ''
						resetData.courtId = ''
						resetData.startTime = ''
						resetData.endTime = ''
						resetData.price = 0
						break

					case BookingStep.Court:
						// Keep date, but reset court selection and all following steps
						resetData.courtId = ''
						resetData.startTime = ''
						resetData.endTime = ''
						resetData.price = 0
						break

					case BookingStep.Time:
						// Keep date and court, but reset time selection and following steps
						resetData.startTime = ''
						resetData.endTime = ''
						resetData.price = 0
						break

					case BookingStep.Duration:
						// Keep date, court and start time, but reset duration (end time)
						resetData.endTime = ''
						resetData.price = 0
						break
				}

				// Update the booking context with reset data
				if (Object.keys(resetData).length > 0) {
					bookingContext.set(resetData, true)
				}
			}

			// Update the current step in the progress context
			BookingProgressContext.set({
				currentStep: stepNumber,
			})
		}
	}

	render() {
		return html`
			<schmancy-flex
				justify="between"
				align="center"
				wrap="nowrap"
				class="transition-all duration-500 w-full overflow-x-auto px-2"
			>
				${this.bookingProgress.steps.map((step, index) => {
					// For all but the last step, create a combined step+connector group
					if (index < this.bookingProgress.steps.length - 1) {
						return html`
							<div class="flex items-center flex-shrink-0 min-w-max">${this.renderStep(step, index)}</div>
							<div class="flex-grow min-w-2 max-w-24">${this.renderConnector(index + 2)}</div>
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
