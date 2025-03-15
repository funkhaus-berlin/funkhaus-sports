import { SchmancyTheme, color } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'

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
	 * Array of step items to display
	 */
	@property({ type: Array })
	steps: Step[] = []

	/**
	 * Current active step (1-based index)
	 */
	@property({ type: Number })
	currentStep: number = 1

	/**
	 * Previous step value for animations
	 */
	@state()
	private previousStep: number = 1

	/**
	 * Event fired when a step is clicked
	 */
	@property({ type: Boolean })
	clickable: boolean = false

	/**
	 * Check if the step change animation is in progress
	 */
	@state()
	private animating: boolean = false

	/**
	 * Lifecycle method to detect step changes and trigger animations
	 */
	updated(changedProperties: Map<string, any>) {
		if (changedProperties.has('currentStep') && this.previousStep !== this.currentStep) {
			this.animateStepChange(this.previousStep, this.currentStep)
			this.previousStep = this.currentStep
		}
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
			'px-1': true, // Add horizontal padding
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
	 */
	private handleStepClick(stepNumber: number) {
		// Only allow clicking on completed steps (and current step)
		const isActive = this.currentStep >= stepNumber

		if (this.clickable && !this.animating && isActive) {
			// Update current step when clicked
			this.currentStep = stepNumber

			// Dispatch event to notify parent components
			this.dispatchEvent(
				new CustomEvent('step-click', {
					detail: { step: stepNumber },
					bubbles: true,
					composed: true,
				}),
			)
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
				${this.steps.map((step, index) => {
					// For all but the last step, create a combined step+connector group
					if (index < this.steps.length - 1) {
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
