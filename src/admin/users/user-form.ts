import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { SchmancyInputChangeEvent, sheet, $notify } from '@mhmo91/schmancy'
import { html } from 'lit'
import { customElement, state, query } from 'lit/decorators.js'
import { $usersFilter } from './context'
import { default as upsertUser } from './users.api'
import { when } from 'lit/directives/when.js'
import { User } from 'src/user.context'
import { v4 as uuidv4 } from 'uuid'

@customElement('user-form')
export default class UserForm extends $LitElement() {
	@state() user!: User
	@state() busy: boolean = false
	@state() formErrors: Map<string, string> = new Map()
	@state() passwordVisible: boolean = false
	
	@query('schmancy-form')
	form!: HTMLFormElement
	
	constructor(user: User = new User()) {
		super()
		this.user = user
		// All users are admins with full access
		this.user.admin = true
		this.user.role = 'super_admin'
		this.user.venueAccess = []
	}

	connectedCallback(): void {
		super.connectedCallback()
	}
	
	/**
	 * Validate form fields
	 */
	private validateForm(): boolean {
		this.formErrors.clear()
		
		// Validate email
		if (!this.user.email || !this.user.email.includes('@')) {
			this.formErrors.set('email', 'Please enter a valid email address')
		}
		
		// Validate password for new users
		if (!this.user.uid && (!this.user.password || this.user.password.length < 6)) {
			this.formErrors.set('password', 'Password must be at least 6 characters')
		}
		
		// Validate display name
		if (!this.user.displayName || this.user.displayName.trim().length < 2) {
			this.formErrors.set('displayName', 'Display name must be at least 2 characters')
		}
		
		this.requestUpdate()
		return this.formErrors.size === 0
	}

	/**
	 * Create or update a user
	 * @param user User data to save
	 */
	async createUser(user: User): Promise<void> {
		// Validate form first
		if (!this.validateForm()) {
			$notify.error('Please fix the form errors')
			return
		}
		
		this.busy = true
		try {
      if(!user.uid) {
        // If no UID, this is a new user creation
        user.uid = uuidv4()
      }
			await upsertUser(user)
			$notify.success(user.uid ? 'User updated successfully' : 'User created successfully')
			sheet.dismiss(this.tagName)
			$usersFilter.next({ search: '' })
		} catch (error) {
			console.error('Error creating user:', error)
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
			$notify.error(`Failed to ${user.uid ? 'update' : 'create'} user: ${errorMessage}`)
		} finally {
			this.busy = false
		}
	}

	protected render(): unknown {
		return html`
			${when(this.busy, () => html`<schmancy-busy class="fixed inset-0 z-50"></schmancy-busy>`)}
			
			<schmancy-surface type="container" class="max-w-2xl mx-auto">
				<schmancy-grid gap="lg" class="p-6">
					<!-- Header -->
					<schmancy-grid gap="sm">
						<schmancy-flex align="center" gap="md">
							<schmancy-icon-button @click=${() => sheet.dismiss(this.tagName)}>
								<schmancy-icon>close</schmancy-icon>
							</schmancy-icon-button>
							<schmancy-typography type="display" size="small">
								${this.user.uid ? 'Edit User' : 'Create New User'}
							</schmancy-typography>
						</schmancy-flex>
						<schmancy-typography type="body" class="text-on-surface-variant pl-12">
							${this.user.uid 
								? 'Update user information' 
								: 'Create a new admin user with full system access'}
						</schmancy-typography>
					</schmancy-grid>
					
					<!-- Form Content -->
					<schmancy-form
						@submit=${() => this.createUser(this.user)}
					>
						<schmancy-grid gap="lg">
							<!-- Basic Information -->
							<schmancy-grid gap="md">
								<schmancy-input
									.autocomplete=${'email'}
									.value=${this.user.email}
									required
									type="email"
									label="Email Address"
									helper-text="User will sign in with this email"
									.error=${!!this.formErrors.get('email')}
									@change=${(e: SchmancyInputChangeEvent) => {
										this.user.email = e.detail.value
										this.formErrors.delete('email')
										this.requestUpdate()
									}}
								>
									<schmancy-icon slot="leading">email</schmancy-icon>
								</schmancy-input>
								
								<schmancy-input
									.autocomplete=${'new-password'}
									.value=${this.user.password || ''}
									.required=${!this.user.uid}
									type=${this.passwordVisible ? 'text' : 'password'}
									label="Password"
									helper-text=${this.user.uid ? 'Leave empty to keep current password' : 'Minimum 6 characters'}
									.error=${!!this.formErrors.get('password')}
									@change=${(e: SchmancyInputChangeEvent) => {
										this.user.password = e.detail.value
										this.formErrors.delete('password')
										this.requestUpdate()
									}}
								>
									<schmancy-icon slot="leading">lock</schmancy-icon>
									<schmancy-icon-button 
										slot="trailing" 
										@click=${() => this.passwordVisible = !this.passwordVisible}
									>
										<schmancy-icon>${this.passwordVisible ? 'visibility_off' : 'visibility'}</schmancy-icon>
									</schmancy-icon-button>
								</schmancy-input>
								
								<schmancy-input
									.value=${this.user.displayName}
									required
									type="text"
									label="Full Name"
									helper-text="This name will be displayed throughout the system"
									.error=${!!this.formErrors.get('displayName')}
									@change=${(e: SchmancyInputChangeEvent) => {
										this.user.displayName = e.detail.value
										this.formErrors.delete('displayName')
										this.requestUpdate()
									}}
								>
									<schmancy-icon slot="leading">badge</schmancy-icon>
								</schmancy-input>
								
								<!-- Info about admin access -->
								<schmancy-surface type="primary" rounded="all" class="p-4">
									<schmancy-flex align="center" gap="md">
										<schmancy-icon>verified_user</schmancy-icon>
										<schmancy-typography>
											This user will have full administrative access to all venues and features
										</schmancy-typography>
									</schmancy-flex>
								</schmancy-surface>
							</schmancy-grid>
							
							<!-- Action Buttons -->
							<schmancy-divider></schmancy-divider>
							<schmancy-flex justify="between" align="center">
								<schmancy-button variant="text" @click=${() => sheet.dismiss(this.tagName)}>
									Cancel
								</schmancy-button>
								<schmancy-button variant="filled" type="submit">
									<schmancy-icon slot="leading">${this.user.uid ? 'save' : 'person_add'}</schmancy-icon>
									${this.user.uid ? 'Update User' : 'Create User'}
								</schmancy-button>
							</schmancy-flex>
						</schmancy-grid>
					</schmancy-form>
				</schmancy-grid>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'user-form': UserForm
	}
}