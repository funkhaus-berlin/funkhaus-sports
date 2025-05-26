import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { SchmancyInputChangeEvent, SchmancySelectChangeEvent, sheet, select, $notify } from '@mhmo91/schmancy'
import { html, TemplateResult } from 'lit'
import { customElement, state, query } from 'lit/decorators.js'
import { $usersFilter } from './context'
import { default as upsertUser } from './users.api'
import { when } from 'lit/directives/when.js'
import { repeat } from 'lit/directives/repeat.js'
import { User, UserRole } from 'src/user.context'
import { venuesContext } from '../venues/venue-context'
import { Venue } from 'src/db/venue-collection'
import { v4 as uuidv4 } from 'uuid'

@customElement('user-form')
export default class UserForm extends $LitElement() {
	@state() user!: User
	@state() busy: boolean = false
	@state() selectedVenueId: string = ''
	@state() selectedVenueRole: UserRole = 'staff'
	@state() venueAccessList: {venueId: string, role: UserRole, venueName: string}[] = []
	@state() activeSection: 'basic' | 'role' | 'venues' = 'basic'
	@state() formErrors: Map<string, string> = new Map()
	@state() passwordVisible: boolean = false
	
	@select(venuesContext)
	venues!: Map<string, Venue>
	
	@query('schmancy-form')
	form!: HTMLFormElement
	
	constructor(user: User = new User()) {
		super()
		this.user = user
		// Initialize venue access if not set
		if (!this.user.venueAccess) {
			this.user.venueAccess = []
		}
	}

	connectedCallback(): void {
		super.connectedCallback()
		
		// Initialize venue access list for display
		if (this.user.venueAccess) {
			this.updateVenueAccessList()
		}
		
		// Set initial section based on whether user exists
		if (this.user.uid) {
			this.activeSection = 'role'
		}
	}
	
	/**
	 * Update the list of venue access entries with venue names for display
	 */
	private updateVenueAccessList(): void {
		if (!this.user.venueAccess) {
			this.venueAccessList = [];
			return;
		}
		
		// Create a combined list with venue names for display
		this.venueAccessList = this.user.venueAccess.map(access => {
			const venue = this.venues?.get(access.venueId);
			return {
				venueId: access.venueId,
				role: access.role,
				venueName: venue ? venue.name : `Venue (${access.venueId.substring(0, 6)}...)`
			};
		});
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
		
		// Validate role
		if (!this.user.role) {
			this.formErrors.set('role', 'Please select a role')
		}
		
		// If not super admin, must have at least one venue access
		if (this.user.role !== 'super_admin' && (!this.user.venueAccess || this.user.venueAccess.length === 0)) {
			this.formErrors.set('venues', 'Non-admin users must have access to at least one venue')
		}
		
		this.requestUpdate()
		return this.formErrors.size === 0
	}
	
	/**
	 * Add or update venue access for the user
	 */
	private addVenueAccess(): void {
		if (!this.selectedVenueId) {
			$notify.error('Please select a venue')
			return
		}
		
		// Ensure venueAccess is initialized
		if (!this.user.venueAccess) {
			this.user.venueAccess = []
		}
		
		// Check if this venue already exists in the access list
		const existingIndex = this.user.venueAccess.findIndex(
			access => access.venueId === this.selectedVenueId
		)
		
		if (existingIndex >= 0) {
			// Update existing access
			this.user.venueAccess[existingIndex].role = this.selectedVenueRole
			$notify.success('Venue access updated')
		} else {
			// Add new access
			this.user.venueAccess.push({
				venueId: this.selectedVenueId,
				role: this.selectedVenueRole
			})
			$notify.success('Venue access added')
		}
		
		// Update display list
		this.updateVenueAccessList()
		
		// Reset selection
		this.selectedVenueId = ''
		this.requestUpdate()
	}
	
	/**
	 * Remove venue access for a specific venue
	 * @param venueId ID of the venue to remove access for
	 */
	private removeVenueAccess(venueId: string): void {
		if (!this.user.venueAccess) {
			return
		}
		
		this.user.venueAccess = this.user.venueAccess.filter(
			access => access.venueId !== venueId
		)
		this.updateVenueAccessList()
		$notify.info('Venue access removed')
		this.requestUpdate()
	}

	/**
	 * Create or update a user
	 * @param user User data to save
	 */
	async createUser(user: User): Promise<void> {
		// Validate form first
		if (!this.validateForm()) {
			$notify.error('Please fix the form errors')
			// Switch to the section with the first error
			if (this.formErrors.has('email') || this.formErrors.has('password') || this.formErrors.has('displayName')) {
				this.activeSection = 'basic'
			} else if (this.formErrors.has('role')) {
				this.activeSection = 'role'
			} else if (this.formErrors.has('venues')) {
				this.activeSection = 'venues'
			}
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
			<style>
				:host {
					display: block;
					--section-transition: all 0.3s ease;
				}
				
				.section-tabs {
					border-bottom: 1px solid var(--md-sys-color-outline-variant);
					margin-bottom: 24px;
				}
				
				.section-content {
					min-height: 400px;
					transition: var(--section-transition);
				}
				
				.venue-item {
					transition: all 0.2s ease;
				}
				
				.venue-item:hover {
					background-color: var(--md-sys-color-surface-container-highest);
				}
				
				.error-text {
					color: var(--md-sys-color-error);
					font-size: 0.75rem;
					margin-top: 4px;
				}
				
				.password-toggle {
					cursor: pointer;
					user-select: none;
				}
				
				.animate-in {
					animation: fadeIn 0.3s ease-in-out;
				}
				
				@keyframes fadeIn {
					from {
						opacity: 0;
						transform: translateY(10px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
			</style>
			
			${when(this.busy, () => html`<schmancy-busy class="fixed inset-0 z-50"></schmancy-busy>`)}
			
			<schmancy-surface type="container" class="max-w-4xl mx-auto">
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
								? 'Update user information and access permissions' 
								: 'Set up a new user account with appropriate access levels'}
						</schmancy-typography>
					</schmancy-grid>
					
					<!-- Section Tabs -->
					<div class="section-tabs">
						<schmancy-tabs .value=${this.activeSection} @change=${(e: any) => this.activeSection = e.detail.value}>
							<schmancy-tab value="basic">
								<schmancy-flex align="center" gap="sm">
									<schmancy-icon>person</schmancy-icon>
									Basic Info
								</schmancy-flex>
							</schmancy-tab>
							<schmancy-tab value="role">
								<schmancy-flex align="center" gap="sm">
									<schmancy-icon>security</schmancy-icon>
									Role & Permissions
								</schmancy-flex>
							</schmancy-tab>
							<schmancy-tab value="venues">
								<schmancy-flex align="center" gap="sm">
									<schmancy-icon>location_city</schmancy-icon>
									Venue Access
									${this.venueAccessList.length > 0 
										? html`<schmancy-badge>${this.venueAccessList.length}</schmancy-badge>` 
										: ''}
								</schmancy-flex>
							</schmancy-tab>
						</schmancy-tabs>
					</div>
					
					<!-- Form Content -->
					<schmancy-form
						@submit=${() => this.createUser(this.user)}
						class="section-content"
					>
						<schmancy-grid gap="lg">
							<!-- Basic Information Section -->
							${when(this.activeSection === 'basic', () => html`
								<schmancy-grid gap="md" class="animate-in">
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
											class="password-toggle"
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
								</schmancy-grid>
							`)}
							
							<!-- Role & Permissions Section -->
							${when(this.activeSection === 'role', () => html`
								<schmancy-grid gap="lg" class="animate-in">
									<schmancy-surface type="container" rounded="all" class="p-6">
										<schmancy-grid gap="md">
											<schmancy-typography type="title" size="medium">System Role</schmancy-typography>
											
											<schmancy-select
												label="Select Role"
												required
												.value=${this.user.role}
												.error=${!!this.formErrors.get('role')}
												@change=${(e: SchmancySelectChangeEvent) => {
													this.user.role = e.detail.value as UserRole
													this.formErrors.delete('role')
													
													// Auto-set admin flag for super_admin role
													if (e.detail.value === 'super_admin') {
														this.user.admin = true
													} else {
														this.user.admin = false
													}
													this.requestUpdate()
												}}
											>
												<schmancy-icon slot="leading">admin_panel_settings</schmancy-icon>
												<schmancy-option value="super_admin">
													<schmancy-flex align="center" gap="sm">
														<schmancy-icon class="text-error">shield_with_heart</schmancy-icon>
														<span>Super Administrator</span>
													</schmancy-flex>
												</schmancy-option>
												<schmancy-option value="venue_owner">
													<schmancy-flex align="center" gap="sm">
														<schmancy-icon class="text-primary">store</schmancy-icon>
														<span>Venue Owner</span>
													</schmancy-flex>
												</schmancy-option>
												<schmancy-option value="venue_manager">
													<schmancy-flex align="center" gap="sm">
														<schmancy-icon class="text-secondary">manage_accounts</schmancy-icon>
														<span>Venue Manager</span>
													</schmancy-flex>
												</schmancy-option>
												<schmancy-option value="staff">
													<schmancy-flex align="center" gap="sm">
														<schmancy-icon>person</schmancy-icon>
														<span>Staff Member</span>
													</schmancy-flex>
												</schmancy-option>
											</schmancy-select>
											
											${when(this.user.role, () => html`
												<schmancy-surface type="containerLow" rounded="all" class="p-4 mt-2">
													<schmancy-flex gap="md">
														<schmancy-icon class="text-primary mt-1">info</schmancy-icon>
														<schmancy-grid gap="sm" class="flex-1">
															<schmancy-typography type="label" class="text-primary">
																${this.getRoleName(this.user.role)} Permissions
															</schmancy-typography>
															<schmancy-typography type="body" size="small" class="text-on-surface-variant">
																${this.getRolePermissionDescription(this.user.role)}
															</schmancy-typography>
														</schmancy-grid>
													</schmancy-flex>
												</schmancy-surface>
											`)}
										</schmancy-grid>
									</schmancy-surface>
								</schmancy-grid>
							`)}
							
							<!-- Venue Access Section -->
							${when(this.activeSection === 'venues', () => html`
								<schmancy-grid gap="lg" class="animate-in">
									${when(this.user.role === 'super_admin', 
										() => html`
											<schmancy-surface type="primary" rounded="all" class="p-4">
												<schmancy-flex align="center" gap="md">
													<schmancy-icon>verified_user</schmancy-icon>
													<schmancy-typography>
														Super Administrators have automatic access to all venues
													</schmancy-typography>
												</schmancy-flex>
											</schmancy-surface>
										`,
										() => html`
											<schmancy-grid gap="md">
												<schmancy-typography type="title" size="medium">Venue Access Management</schmancy-typography>
												
												${when(this.formErrors.has('venues'), () => html`
													<schmancy-surface type="error" rounded="all" class="p-3">
														<schmancy-flex align="center" gap="sm">
															<schmancy-icon>error</schmancy-icon>
															<schmancy-typography>${this.formErrors.get('venues')}</schmancy-typography>
														</schmancy-flex>
													</schmancy-surface>
												`)}
												
												<!-- Add Venue Access -->
												<schmancy-surface type="container" rounded="all" class="p-4">
													<schmancy-grid gap="md">
														<schmancy-typography type="subtitle">Add Venue Access</schmancy-typography>
														<schmancy-grid cols="2fr 1fr auto" gap="md" align="end">
															<schmancy-select
																label="Select Venue"
																.value=${this.selectedVenueId}
																@change=${(e: SchmancySelectChangeEvent) => {
																	this.selectedVenueId = e.detail.value as string
																}}
															>
																<schmancy-icon slot="leading">location_city</schmancy-icon>
																<schmancy-option value="">Choose a venue...</schmancy-option>
																${Array.from(this.venues.values())
																	.filter(venue => !this.user.venueAccess?.some(access => access.venueId === venue.id))
																	.map(venue => html`
																		<schmancy-option value=${venue.id} label=${venue.name}>
																			${venue.name}
																		</schmancy-option>
																	`)}
															</schmancy-select>
															
															<schmancy-select
																label="Access Level"
																.value=${this.selectedVenueRole}
																@change=${(e: SchmancySelectChangeEvent) => {
																	this.selectedVenueRole = e.detail.value as UserRole
																}}
															>
																<schmancy-icon slot="leading">security</schmancy-icon>
																${this.user.role !== 'venue_owner' ? html`
																	<schmancy-option value="venue_owner">Owner</schmancy-option>
																` : ''}
																<schmancy-option value="venue_manager">Manager</schmancy-option>
																<schmancy-option value="staff">Staff</schmancy-option>
															</schmancy-select>
															
															<schmancy-button
																variant="filled tonal"
																@click=${() => this.addVenueAccess()}
																.disabled=${!this.selectedVenueId}
															>
																<schmancy-icon slot="leading">add</schmancy-icon>
																Add Access
															</schmancy-button>
														</schmancy-grid>
													</schmancy-grid>
												</schmancy-surface>
												
												<!-- Venue Access List -->
												<schmancy-grid gap="md">
													<schmancy-typography type="subtitle">Current Venue Access</schmancy-typography>
													${this.venueAccessList.length === 0 
														? html`
															<schmancy-surface type="containerLow" rounded="all" class="p-8 text-center">
																<schmancy-grid gap="md" justify="center" align="center">
																	<schmancy-icon style="font-size: 48px; opacity: 0.3">location_off</schmancy-icon>
																	<schmancy-typography type="body" class="text-on-surface-variant">
																		No venue access assigned yet
																	</schmancy-typography>
																</schmancy-grid>
															</schmancy-surface>
														`
														: html`
															<schmancy-surface type="container" rounded="all" class="overflow-hidden">
																${repeat(this.venueAccessList, 
																	(access) => access.venueId,
																	(access, index) => html`
																		<schmancy-grid 
																			cols="1fr auto" 
																			class="venue-item px-4 py-3 ${index > 0 ? 'border-t border-outline-variant' : ''}" 
																			align="center"
																		>
																			<schmancy-flex align="center" gap="md">
																				<schmancy-icon class="text-on-surface-variant">location_city</schmancy-icon>
																				<schmancy-grid gap="xs">
																					<schmancy-typography weight="medium">${access.venueName}</schmancy-typography>
																					<schmancy-chip
																						variant=${this.getRoleChipVariant(access.role)}
																						size="small"
																					>
																						${this.getRoleName(access.role)}
																					</schmancy-chip>
																				</schmancy-grid>
																			</schmancy-flex>
																			<schmancy-icon-button
																				@click=${() => this.removeVenueAccess(access.venueId)}
																			>
																				<schmancy-icon>delete</schmancy-icon>
																			</schmancy-icon-button>
																		</schmancy-grid>
																	`
																)}
															</schmancy-surface>
														`
													}
												</schmancy-grid>
											</schmancy-grid>
										`
									)}
								</schmancy-grid>
							`)}
							
							<!-- Action Buttons -->
							<schmancy-divider></schmancy-divider>
							<schmancy-flex justify="between" align="center" class="pt-4">
								<schmancy-button variant="text" @click=${() => sheet.dismiss(this.tagName)}>
									Cancel
								</schmancy-button>
								<schmancy-flex gap="md">
									${when(this.activeSection !== 'basic', () => html`
										<schmancy-button 
											variant="text" 
											@click=${() => {
												const sections = ['basic', 'role', 'venues'] as const
												const currentIndex = sections.indexOf(this.activeSection)
												if (currentIndex > 0) {
													this.activeSection = sections[currentIndex - 1]
												}
											}}
										>
											<schmancy-icon slot="leading">arrow_back</schmancy-icon>
											Previous
										</schmancy-button>
									`)}
									${when(this.activeSection !== 'venues', () => html`
										<schmancy-button 
											variant="filled tonal" 
											@click=${() => {
												const sections = ['basic', 'role', 'venues'] as const
												const currentIndex = sections.indexOf(this.activeSection)
												if (currentIndex < sections.length - 1) {
													this.activeSection = sections[currentIndex + 1]
												}
											}}
										>
											Next
											<schmancy-icon slot="trailing">arrow_forward</schmancy-icon>
										</schmancy-button>
									`)}
									${when(this.activeSection === 'venues', () => html`
										<schmancy-button variant="filled" type="submit">
											<schmancy-icon slot="leading">${this.user.uid ? 'save' : 'person_add'}</schmancy-icon>
											${this.user.uid ? 'Update User' : 'Create User'}
										</schmancy-button>
									`)}
								</schmancy-flex>
							</schmancy-flex>
						</schmancy-grid>
					</schmancy-form>
				</schmancy-grid>
			</schmancy-surface>
		`
	}
	
	/**
	 * Get formatted name for a role
	 */
	private getRoleName(role: UserRole): string {
		const roleNames: Record<UserRole, string> = {
			'super_admin': 'Super Admin',
			'venue_owner': 'Owner',
			'venue_manager': 'Manager',
			'staff': 'Staff'
		}
		return roleNames[role] || role
	}
	
	/**
	 * Get appropriate variant for role chip
	 */
	private getRoleChipVariant(role: UserRole): 'primary' | 'secondary' | 'tertiary' | 'error' | 'surface' {
		const variants: Record<UserRole, 'primary' | 'secondary' | 'tertiary' | 'error' | 'surface'> = {
			'super_admin': 'error',
			'venue_owner': 'primary',
			'venue_manager': 'secondary',
			'staff': 'surface'
		}
		return variants[role] || 'surface'
	}
	
	/**
	 * Get permission descriptions for each role
	 */
	private getRolePermissionDescription(role: UserRole): TemplateResult {
		switch (role) {
			case 'super_admin':
				return html`
					<ul class="list-disc pl-5 space-y-1">
						<li>Full system access and control</li>
						<li>Manage all users and venues</li>
						<li>Access all bookings and reports</li>
						<li>System configuration and settings</li>
					</ul>
				`
			case 'venue_owner':
				return html`
					<ul class="list-disc pl-5 space-y-1">
						<li>Full control over assigned venues</li>
						<li>Manage venue staff and settings</li>
						<li>View analytics and financial reports</li>
						<li>Configure pricing and schedules</li>
					</ul>
				`
			case 'venue_manager':
				return html`
					<ul class="list-disc pl-5 space-y-1">
						<li>Manage day-to-day venue operations</li>
						<li>Process bookings and check-ins</li>
						<li>View venue reports and analytics</li>
						<li>Update court availability</li>
					</ul>
				`
			case 'staff':
				return html`
					<ul class="list-disc pl-5 space-y-1">
						<li>Process customer check-ins</li>
						<li>View booking information</li>
						<li>Basic venue operations</li>
						<li>Limited administrative access</li>
					</ul>
				`
			default:
				return html`<li>Unknown role permissions</li>`
		}
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'user-form': UserForm
	}
}
