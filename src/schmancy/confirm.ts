import { SchmancyTheme, color, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit-html'
import { customElement, property } from 'lit/decorators.js'

/**
 * Enhanced confirmation dialog component that follows Schmancy UI patterns
 * Can be used for any action that requires user confirmation
 *
 * @element schmancy-confirm-dialog
 * @fires confirm - When the user confirms the action
 * @fires cancel - When the user cancels the action
 */
@customElement('schmancy-confirm-dialog')
export class SchmancyConfirmDialog extends $LitElement() {
	/**
	 * The message to display in the dialog
	 */
	@property({ type: String })
	message: string = 'Are you sure you want to proceed?'

	/**
	 * The text for the confirm button
	 */
	@property({ type: String })
	confirmText: string = 'Confirm'

	/**
	 * The text for the cancel button
	 */
	@property({ type: String })
	cancelText: string = 'Cancel'

	/**
	 * The variant for the confirm button
	 * - 'filled' (solid background)
	 * - 'outlined' (bordered with transparent background)
	 * - 'text' (no border or background)
	 * - 'filled tonal' (more subtle filled button)
	 * - 'elevated' (with shadow)
	 */
	@property({ type: String })
	confirmVariant: 'filled' | 'outlined' | 'text' | 'filled tonal' | 'elevated' = 'filled'

	/**
	 * The variant for the cancel button
	 */
	@property({ type: String })
	cancelVariant: 'filled' | 'outlined' | 'text' | 'filled tonal' | 'elevated' = 'text'

	/**
	 * The color theme for the confirm button
	 * - 'primary' (default brand color)
	 * - 'secondary' (complementary color)
	 * - 'error' (for destructive actions)
	 * - 'success' (for positive actions)
	 */
	@property({ type: String })
	confirmColor: 'primary' | 'secondary' | 'error' | 'success' = 'primary'

	/**
	 * Whether to show an icon before the message
	 */
	@property({ type: Boolean })
	showIcon: boolean = true

	/**
	 * The icon to show (using Google Material Icons)
	 */
	@property({ type: String })
	icon: string = 'help'

	/**
	 * Description text that appears below the main message
	 */
	@property({ type: String })
	description: string = ''

	/**
	 * Whether the action is destructive (will style appropriately)
	 */
	@property({ type: Boolean })
	destructive: boolean = false

	/**
	 * Handle cancel button click
	 */
	private onCancel() {
		this.dispatchEvent(
			new CustomEvent('cancel', {
				bubbles: true,
				composed: true,
			}),
		)
	}

	/**
	 * Handle confirm button click
	 */
	private onConfirm() {
		this.dispatchEvent(
			new CustomEvent('confirm', {
				bubbles: true,
				composed: true,
			}),
		)
	}

	render() {
		// Set sensible defaults for destructive actions
		if (this.destructive && this.confirmColor === 'primary') {
			this.confirmColor = 'error'
			if (!this.showIcon) {
				this.showIcon = true
				this.icon = 'warning'
			}
		}

		// Get the appropriate color for the icon based on the confirmColor
		const getIconColor = () => {
			switch (this.confirmColor) {
				case 'error':
					return SchmancyTheme.sys.color.error.default
				case 'success':
					return SchmancyTheme.sys.color.success.default
				case 'secondary':
					return SchmancyTheme.sys.color.secondary.default
				default:
					return SchmancyTheme.sys.color.primary.default
			}
		}

		return html`
			<schmancy-surface type="surface" rounded="all" elevation="0" class="p-6 max-w-md">
				<schmancy-grid gap="md" cols="1fr" class="w-full">
					<!-- Header with icon and message -->
					<div class="flex items-start gap-4 mb-2">
						${this.showIcon
							? html`
									<div class="mt-0.5">
										<schmancy-icon size="28px" ${color({ color: getIconColor() })}> ${this.icon} </schmancy-icon>
									</div>
							  `
							: ''}

						<div class="flex-1">
							<schmancy-typography type="title" token="lg"> ${this.message} </schmancy-typography>

							${this.description
								? html`
										<div class="mt-2">
											<schmancy-typography type="body" token="md"> ${this.description} </schmancy-typography>
										</div>
								  `
								: ''}
						</div>
					</div>

					<!-- Action buttons -->
					<sch-flex justify="end" gap="4" class="mt-6">
						<schmancy-button variant=${this.cancelVariant} @click=${this.onCancel}>
							${this.cancelText}
						</schmancy-button>

						<schmancy-button variant=${this.confirmVariant} @click=${this.onConfirm}>
							${this.confirmText}
						</schmancy-button>
					</sch-flex>
				</schmancy-grid>
			</schmancy-surface>
		`
	}
}

/**
 * Options for the confirm dialog
 */
export interface ConfirmOptions {
	/** Main question or message */
	message: string

	/** Additional description text */
	description?: string

	/** Text for the confirm button */
	confirmText?: string

	/** Text for the cancel button */
	cancelText?: string

	/** Style variant for confirm button */
	confirmVariant?: 'filled' | 'outlined' | 'text' | 'filled tonal' | 'elevated'

	/** Style variant for cancel button */
	cancelVariant?: 'filled' | 'outlined' | 'text' | 'filled tonal' | 'elevated'

	/** Color theme for confirm button */
	confirmColor?: 'primary' | 'secondary' | 'error' | 'success'

	/** Dialog title shown in the header */
	title?: string

	/** Material icon name to display */
	icon?: string

	/** Whether to show an icon */
	showIcon?: boolean

	/** Whether the action is destructive (will style as error by default) */
	destructive?: boolean

	/** Width of the dialog (default is 'md') */
	width?: 'sm' | 'md' | 'lg'
}

/**
 * Show a confirmation dialog and return a promise that resolves when the user confirms or rejects
 *
 * @example
 * // Basic usage
 * const confirmed = await confirm({ message: 'Delete this item?' });
 * if (confirmed) {
 *   // proceed with action
 * }
 *
 * @example
 * // Advanced usage with customization
 * const result = await confirm({
 *   message: 'Delete your account?',
 *   description: 'This action cannot be undone. All your data will be permanently removed.',
 *   confirmText: 'Delete Account',
 *   cancelText: 'Cancel',
 *   destructive: true,
 *   icon: 'delete_forever'
 * });
 *
 * @param options The dialog configuration options
 * @returns Promise<boolean> - Resolves to true if confirmed, false if canceled
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
	const dialogId = `confirm-dialog-${Date.now()}`
	const dialog = document.createElement('schmancy-confirm-dialog') as SchmancyConfirmDialog

	// Configure dialog properties
	dialog.message = options.message
	if (options.description) dialog.description = options.description
	if (options.confirmText) dialog.confirmText = options.confirmText
	if (options.cancelText) dialog.cancelText = options.cancelText
	if (options.confirmVariant) dialog.confirmVariant = options.confirmVariant
	if (options.cancelVariant) dialog.cancelVariant = options.cancelVariant
	if (options.confirmColor) dialog.confirmColor = options.confirmColor
	if (options.icon) dialog.icon = options.icon
	if (options.showIcon !== undefined) dialog.showIcon = options.showIcon
	if (options.destructive !== undefined) dialog.destructive = options.destructive

	// Determine dialog width
	// const width = options.width === 'sm' ? 400 : options.width === 'lg' ? 600 : 480

	// Open the dialog
	sheet.open({
		component: dialog,
		uid: dialogId,
		title: options.title || (options.destructive ? 'Confirm Deletion' : 'Confirm Action'),
		header: 'visible',
		position: 'side',
	})

	// Return a promise that resolves when the user makes a choice
	return new Promise<boolean>(resolve => {
		const handleConfirm = () => {
			cleanup()
			resolve(true)
		}

		const handleCancel = () => {
			cleanup()
			resolve(false)
		}

		// Clean up event listeners when done
		const cleanup = () => {
			dialog.removeEventListener('confirm', handleConfirm)
			dialog.removeEventListener('cancel', handleCancel)
			sheet.dismiss(dialogId)
		}

		dialog.addEventListener('confirm', handleConfirm)
		dialog.addEventListener('cancel', handleCancel)
	})
}

declare global {
	interface HTMLElementTagNameMap {
		'schmancy-confirm-dialog': SchmancyConfirmDialog
	}
}
