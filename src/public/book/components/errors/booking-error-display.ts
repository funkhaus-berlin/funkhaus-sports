// src/public/book/components/booking-error-display.ts

import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { when } from 'lit/directives/when.js'
import { takeUntil } from 'rxjs'
import { BookingError, BookingProgressContext, ErrorCategory } from '../../context'
import { ErrorI18nService } from './i18n/error-i18n-service'

/**
 * Error display component that subscribes to BookingProgressContext and displays errors
 * Can be used globally or scoped to specific steps
 * Supports internationalization through ErrorI18nService
 */
@customElement('booking-error-display')
export class BookingErrorDisplay extends $LitElement(css`
	/* Error animation */
	@keyframes errorShake {
		0%,
		100% {
			transform: translateX(0);
		}
		10%,
		30%,
		50%,
		70%,
		90% {
			transform: translateX(-2px);
		}
		20%,
		40%,
		60%,
		80% {
			transform: translateX(2px);
		}
	}

	.error-enter {
		animation: errorShake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
	}

	/* Error category styles */
	.error-validation {
		border-left: 4px solid var(--schmancy-sys-color-error-default);
	}

	.error-payment {
		border-left: 4px solid #ff9800;
	}

	.error-network {
		border-left: 4px solid #2196f3;
	}

	.error-availability {
		border-left: 4px solid #9c27b0;
	}

	.error-system {
		border-left: 4px solid #f44336;
	}

	/* Field error styles */
	.field-errors {
		padding-left: 0.5rem;
		margin-top: 0.5rem;
	}

	.field-error-item {
		margin-bottom: 0.25rem;
		font-size: 0.875rem;
	}

	/* Recovery suggestion styles */
	.recovery-suggestion {
		margin-top: 0.5rem;
		font-style: italic;
		font-size: 0.875rem;
	}
`) {
	@select(BookingProgressContext)
	bookingProgress!: any

	/**
	 * Whether to show field errors in addition to the main error
	 */
	@property({ type: Boolean })
	showFieldErrors: boolean = false

	/**
	 * Whether to show recovery suggestions when available
	 */
	@property({ type: Boolean })
	showRecoverySuggestion: boolean = true

	/**
	 * Limit errors to specific steps (if empty, shows errors for all steps)
	 */
	@property({ type: Array })
	steps: number[] = []

	/**
	 * Limit errors to specific categories (if empty, shows all categories)
	 */
	@property({ type: Array })
	categories: string[] = []

	/**
	 * Whether the error can be dismissed by the user
	 */
	@property({ type: Boolean })
	dismissible: boolean = true

	/**
	 * Custom styles to apply to the error container
	 */
	@property({ type: String })
	customStyles: string = ''

	/**
	 * Language code to use for error messages (defaults to current language)
	 */
	@property({ type: String })
	language: string = ''

	/**
	 * Reference to the last seen error to detect changes for animation
	 */
	private lastError: BookingError | null = null
	private animating: boolean = false

	firstUpdated() {
		// Subscribe to booking progress context changes
		BookingProgressContext.$.pipe(takeUntil(this.disconnecting)).subscribe(() => {
			// Trigger animation if error changes
			if (this.bookingProgress.currentError?.message !== this.lastError?.message) {
				this.triggerErrorAnimation()
			}

			this.lastError = this.bookingProgress.currentError
			this.requestUpdate()
		})

		// Set language if specified
		if (this.language) {
			ErrorI18nService.setLanguage(this.language)
		}
	}

	/**
	 * Update language when language property changes
	 */
	updated(changedProperties: Map<string, any>) {
		if (changedProperties.has('language') && this.language) {
			ErrorI18nService.setLanguage(this.language)
		}
	}

	/**
	 * Trigger error animation
	 */
	private triggerErrorAnimation() {
		if (this.animating || !this.bookingProgress.currentError) return

		this.animating = true

		// Use requestAnimationFrame for better performance
		requestAnimationFrame(() => {
			const errorElement = this.shadowRoot?.querySelector('.error-container')
			if (errorElement) {
				errorElement.classList.add('error-enter')

				// Remove animation class after completion
				setTimeout(() => {
					errorElement.classList.remove('error-enter')
					this.animating = false
				}, 500)
			} else {
				this.animating = false
			}
		})
	}

	/**
	 * Handle dismissing the error
	 */
	private dismissError() {
		if (!this.dismissible) return

		BookingProgressContext.set({
			currentError: null,
		})
	}

	/**
	 * Get icon based on error category
	 */
	private getErrorIcon(category: ErrorCategory): string {
		switch (category) {
			case ErrorCategory.VALIDATION:
				return 'error_outline'
			case ErrorCategory.PAYMENT:
				return 'payment'
			case ErrorCategory.NETWORK:
				return 'wifi_off'
			case ErrorCategory.AVAILABILITY:
				return 'event_busy'
			case ErrorCategory.SYSTEM:
			default:
				return 'warning'
		}
	}

	/**
	 * Check if the error should be shown based on step and category filters
	 */
	private shouldShowError(): boolean {
		const error = this.bookingProgress.currentError
		if (!error) return false

		// If steps array is not empty, only show errors for specified steps
		if (this.steps.length > 0 && !this.steps.includes(this.bookingProgress.currentStep)) {
			return false
		}

		// If categories array is not empty, only show errors for specified categories
		if (this.categories.length > 0 && !this.categories.includes(error.category)) {
			return false
		}

		return true
	}

	render() {
		// Don't render anything if no error or filtered out
		if (!this.shouldShowError()) {
			return html``
		}

		const error = this.bookingProgress.currentError

		// Determine error container classes
		const containerClasses = {
			'error-container': true,
			'bg-error-container': true,
			'text-error-onContainer': true,
			'rounded-lg': true,
			'p-2': true,
			'mb-4': true,
			flex: true,
			'items-center': true,
			'gap-2': true,
			[`error-${error.category}`]: true,
		}

		// Custom inline styles
		const containerStyles = this.customStyles || ''

		return html`
			<div class=${classMap(containerClasses)} style=${containerStyles}>
				<!-- Error icon -->
				<schmancy-icon class="mt-0.5">${this.getErrorIcon(error.category)}</schmancy-icon>

				<!-- Error content -->
				<div class="flex-1">
					<!-- Main error message -->
					<schmancy-typography type="body" token="md">${error.message}</schmancy-typography>

					<!-- Recovery suggestion (if available and enabled) -->
					${when(
						this.showRecoverySuggestion && error.recoverySuggestion,
						() => html`
							<div class="recovery-suggestion">
								<schmancy-typography type="body" token="sm">${error.recoverySuggestion}</schmancy-typography>
							</div>
						`,
					)}

					<!-- Field errors list -->
					${when(
						this.showFieldErrors && Object.keys(this.bookingProgress.fieldErrors || {}).length > 0,
						() => html`
							<ul class="field-errors">
								${Object.entries(this.bookingProgress.fieldErrors || {}).map(
									([field, message]) => html` <li class="field-error-item"><strong>${field}:</strong> ${message}</li> `,
								)}
							</ul>
						`,
					)}
				</div>

				<!-- Dismiss button (if enabled) -->
				${when(
					this.dismissible,
					() => html` <schmancy-icon-button @click=${this.dismissError} title="Dismiss">close</schmancy-icon-button> `,
				)}
			</div>
		`
	}
}

// Define custom element
declare global {
	interface HTMLElementTagNameMap {
		'booking-error-display': BookingErrorDisplay
	}
}
