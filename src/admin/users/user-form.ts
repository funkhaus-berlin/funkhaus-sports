import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { SchmancyInputChangeEvent, SchmancySelectChangeEvent, sheet, select } from '@mhmo91/schmancy'
import { html, TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { $usersFilter } from './context'
import { default as upsertUser } from './users.api'
import { when } from 'lit/directives/when.js'
import { $notify } from '@mhmo91/schmancy'
import { User, UserRole } from 'src/user.context'
import { venuesContext } from '../venues/venue-context'
import { Venue } from 'src/db/venue-collection'

@customElement('user-form')
export default class UserForm extends $LitElement() {
	@state() user!: User
	@state() busy: boolean = false
	@state() selectedVenueId: string = ''
	@state() selectedVenueRole: UserRole = 'staff'
	@state() venueAccessList: {venueId: string, role: UserRole, venueName: string}[] = []
	
	@select(venuesContext)
	venues!: Map<string, Venue>
	
	constructor(user: User = new User()) {
		super()
		this.user = user
	}

	connectedCallback(): void {
		super.connectedCallback()
		
		// Initialize venue access list for display
		if (this.user.venueAccess) {
			this.updateVenueAccessList()
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
	 * Add or update venue access for the user
	 */
	private addVenueAccess(): void {
		if (!this.selectedVenueId) {
			$notify.error('Please select a venue');
			return;
		}
		
		// Ensure venueAccess is initialized
		if (!this.user.venueAccess) {
			this.user.venueAccess = [];
		}
		
		// Check if this venue already exists in the access list
		const existingIndex = this.user.venueAccess.findIndex(
			access => access.venueId === this.selectedVenueId
		);
		
		if (existingIndex >= 0) {
			// Update existing access
			this.user.venueAccess[existingIndex].role = this.selectedVenueRole;
			$notify.success('Venue access updated');
		} else {
			// Add new access
			this.user.venueAccess.push({
				venueId: this.selectedVenueId,
				role: this.selectedVenueRole
			});
			$notify.success('Venue access added');
		}
		
		// Update display list
		this.updateVenueAccessList();
		
		// Reset selection
		this.selectedVenueId = '';
	}
	
	/**
	 * Remove venue access for a specific venue
	 * @param venueId ID of the venue to remove access for
	 */
	private removeVenueAccess(venueId: string): void {
		if (!this.user.venueAccess) {
			return;
		}
		
		this.user.venueAccess = this.user.venueAccess.filter(
			access => access.venueId !== venueId
		);
		this.updateVenueAccessList();
		$notify.info('Venue access removed');
	}

	/**
	 * Create or update a user
	 * @param user User data to save
	 */
	async createUser(user: User): Promise<void> {
		this.busy = true;
		try {
			const userData = await upsertUser(user);
			sheet.dismiss(this.tagName);
			$usersFilter.next({ search: '' });
			console.log('User created successfully:', userData);
		} catch (error) {
			console.error('Error creating user:', error);
			$notify.error('Error creating user, try again, maybe?');
		} finally {
			this.busy = false;
		}
	}

	protected render(): unknown {
		return html`
			${when(this.busy, () => html`<schmancy-busy class="fixed inset-0"></schmancy-busy>`)}
			<schmancy-form
				@submit=${() => {
					this.createUser(this.user)
				}}
			>
				<schmancy-grid class="min-h-[50vh] min-w-[500px] px-6 py-8" gap="md">
					<schmancy-typography type="headline">User Information</schmancy-typography>
					<schmancy-typography type="body" class="text-on-surface-variant mb-4">
						Create or update user accounts with appropriate access levels.
					</schmancy-typography>
					
					<!-- Email -->
					<schmancy-input
						.autocomplete=${'email'}
						.value=${this.user.email}
						required
						type="email"
						label="Email"
						@change=${(e: SchmancyInputChangeEvent) => {
							this.user.email = e.detail.value
						}}
					></schmancy-input>
					
					<!-- Password -->
					<schmancy-input
						.autocomplete=${'new-password'}
						.value=${this.user.password}
						required=${!this.user.uid}
						type="password"
						label="Password"
						helper-text=${this.user.uid ? 'Leave empty to keep current password' : 'Required for new users'}
						@change=${(e: SchmancyInputChangeEvent) => {
							this.user.password = e.detail.value
						}}
					></schmancy-input>
					
					<!-- Display Name -->
					<schmancy-input
						.value=${this.user.displayName}
						required
						type="text"
						label="Display Name"
						@change=${(e: SchmancyInputChangeEvent) => {
							this.user.displayName = e.detail.value
						}}
					></schmancy-input>
					
					<!-- Global Role -->
					<schmancy-surface type="container" rounded="all" class="p-4">
						<schmancy-typography type="subtitle" class="mb-3">Global Role</schmancy-typography>
						
						<schmancy-select
							label="Select Role"
							required
							class="mb-3"
							.value=${this.user.role}
							@change=${(e: SchmancySelectChangeEvent) => {
								this.user.role = e.detail.value as UserRole;
								
								// Auto-set admin flag for super_admin role
								if (e.detail.value === 'super_admin') {
									this.user.admin = true;
								}
							}}
						>
							<schmancy-option value="super_admin" label="Super Administrator">Super Administrator</schmancy-option>
							<schmancy-option value="venue_owner" label="Venue Owner">Venue Owner</schmancy-option>
							<schmancy-option value="venue_manager" label="Venue Manager">Venue Manager</schmancy-option>
							<schmancy-option value="staff" label="Staff">Staff</schmancy-option>
						</schmancy-select>
						
						<schmancy-surface type="containerLow" rounded="all" class="p-3 text-sm">
							<schmancy-typography type="label" class="mb-2">Role permissions:</schmancy-typography>
							<ul class="list-disc pl-5 space-y-1">
								${this.getRolePermissionDescription(this.user.role)}
							</ul>
						</schmancy-surface>
					</schmancy-surface>
					
					<schmancy-divider></schmancy-divider>
					<schmancy-surface type="container" rounded="all" class="p-4">
						<schmancy-typography type="subtitle" class="mb-2">Venue-Specific Access</schmancy-typography>
						<schmancy-typography type="body" class="mb-4">
							Assign specific roles for individual venues. Users will only have access to venues listed here.
						</schmancy-typography>
						
						<schmancy-surface type="containerLow" rounded="all" class="p-4 mb-4">
							<schmancy-flex align="center" gap="sm" class="mb-2">
								<schmancy-icon class="text-on-surface-variant">info</schmancy-icon>
								<schmancy-typography type="label">Venue access permissions</schmancy-typography>
							</schmancy-flex>
							<schmancy-typography type="body" class="text-on-surface-variant text-sm">
								Users need venue-specific permissions to access venue data and features. Add venues below to grant access.
							</schmancy-typography>
						</schmancy-surface>
						
						<schmancy-grid gap="md">
							<schmancy-grid cols="1fr 1fr auto" gap="md" align="center">
								<!-- Venue selection -->
								<schmancy-select
									label="Venue"
									.value=${this.selectedVenueId}
									@change=${(e: SchmancySelectChangeEvent) => {
										this.selectedVenueId = e.detail.value as string;
									}}
								>
									<schmancy-option value="" label="Select a venue">Select a venue</schmancy-option>
									${Array.from(this.venues.values()).map(venue => 
										html`<schmancy-option value=${venue.id} label=${venue.name}>${venue.name}</schmancy-option>`
									)}
								</schmancy-select>
								
								<!-- Role selection for venue -->
								<schmancy-select
									label="Venue Role"
									.value=${this.selectedVenueRole}
									@change=${(e: SchmancySelectChangeEvent) => {
										this.selectedVenueRole = e.detail.value as UserRole;
									}}
								>
									<schmancy-option value="venue_owner" label="Venue Owner">Venue Owner</schmancy-option>
									<schmancy-option value="venue_manager" label="Venue Manager">Venue Manager</schmancy-option>
									<schmancy-option value="staff" label="Staff">Staff</schmancy-option>
								</schmancy-select>
								
								<!-- Add button - Updated with icon and text -->
								<schmancy-button
									variant="filled"
									@click=${() => this.addVenueAccess()}
								>
									<schmancy-icon>add</schmancy-icon>
									Assign
								</schmancy-button>
							</schmancy-grid>
							
							<!-- Venue access list - Improved UI -->
							${this.venueAccessList.length === 0 ? 
								html`<schmancy-typography class="text-center py-4 text-on-surface-variant">No venues assigned yet</schmancy-typography>` :
								html`
									<schmancy-surface type="container" rounded="all" class="mt-4">
										${this.venueAccessList.map(access => html`
											<schmancy-grid cols="1fr auto" class="px-4 py-3 border-b border-outline-variant" align="center">
												<schmancy-flex direction="column" gap="xs">
													<schmancy-typography weight="bold">${access.venueName}</schmancy-typography>
													<schmancy-flex align="center" gap="xs">
														<schmancy-chip
															variant=${this.getRoleChipVariant(access.role)}
															size="small"
														>
															${this.getRoleName(access.role)}
														</schmancy-chip>
													</schmancy-flex>
												</schmancy-flex>
												<schmancy-button
													variant="text"
													@click=${() => this.removeVenueAccess(access.venueId)}
												>
													<schmancy-icon>delete</schmancy-icon>
												</schmancy-button>
											</schmancy-grid>
										`)}
									</schmancy-surface>
								`
							}
						</schmancy-grid>
					</schmancy-surface>
					
					<schmancy-divider></schmancy-divider>
					
					<!-- Submit button -->
					<schmancy-button variant="filled" type="submit">
						${this.user.uid ? 'Update User' : 'Create User'}
					</schmancy-button>
				</schmancy-grid>
			</schmancy-form>
		`
	}
	
	/**
	 * Get formatted name for a role
	 */
	private getRoleName(role: UserRole): string {
		switch (role) {
			case 'super_admin':
				return 'Super Administrator';
			case 'venue_owner':
				return 'Venue Owner';
			case 'venue_manager':
				return 'Venue Manager';
			case 'staff':
				return 'Staff';
			default:
				return role;
		}
	}
	
	/**
	 * Get appropriate variant for role chip
	 */
	private getRoleChipVariant(role: UserRole): string {
		switch (role) {
			case 'super_admin':
				return 'primary';
			case 'venue_owner':
				return 'success';
			case 'venue_manager':
				return 'info';
			case 'staff':
				return 'default';
			default:
				return 'default';
		}
	}
	
	/**
	 * Get permission descriptions for each role
	 */
	private getRolePermissionDescription(role: UserRole): TemplateResult {
		switch (role) {
			case 'super_admin':
				return html`
					<li>Full access to all venues and system settings</li>
					<li>Can create/edit/delete all users</li>
					<li>Can manage all venues and courts</li>
					<li>Can access all bookings and system data</li>
				`;
			case 'venue_owner':
				return html`
					<li>Can manage venues they own</li>
					<li>Can add/edit courts for their venues</li>
					<li>Can manage staff for their venues</li>
					<li>Can view analytics and reports</li>
				`;
			case 'venue_manager':
				return html`
					<li>Can manage assigned venues</li>
					<li>Can view and update court details</li>
					<li>Can process bookings and check-ins</li>
					<li>Can view venue-specific reports</li>
				`;
			case 'staff':
				return html`
					<li>Basic access to assigned venues</li>
					<li>Can process check-ins via scanner</li>
					<li>Can view active bookings</li>
					<li>Limited to venue-specific operations</li>
				`;
			default:
				return html`<li>Unknown role permissions</li>`;
		}
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'user-form': UserForm
	}
}