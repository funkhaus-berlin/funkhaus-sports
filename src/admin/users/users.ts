import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { color, SchmancySheetPosition, SchmancyTheme, select, sheet } from '@mhmo91/schmancy'
import { css, html, TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { switchMap, takeUntil } from 'rxjs'
import { $usersFilter } from './context'
import { $notify } from '@mhmo91/schmancy'
import UserForm from './user-form'
import { UsersDB } from './users.collection'
import { User, VenueAccess, UserRole } from 'src/user.context'
import { venuesContext } from '../venues/venue-context'
import { Venue } from 'src/db/venue-collection'

@customElement('funkhaus-users')
export default class Users extends $LitElement(css``) {
	@state() busy: boolean = false

	@state() users: Map<string, User> = new Map()
	
	@select(venuesContext)
	venues!: Map<string, Venue>
	connectedCallback(): void {
		super.connectedCallback()
		$usersFilter
			.pipe(
				switchMap(() => UsersDB.query([])),
				takeUntil(this.disconnecting)
			)
			.subscribe(users => {
				this.users = users
				this.requestUpdate()
			})
	}
	render() {
		const cols = '1fr 1.5fr 1fr 1fr 1fr'
		return html`
			<section class="px-4 relative inset-0">
				<schmancy-grid class="mb-6" cols="auto 1fr auto" gap="md" align="center">
					${when(this.busy, () => html`<schmancy-busy class="fixed inset-0"></schmancy-busy> `)}
					<schmancy-typography type="headline"> Users </schmancy-typography>
					<span></span>
					<schmancy-button
						variant="filled"
						@click=${() => {
							sheet.open({
								component: new UserForm(),
								position: SchmancySheetPosition.Side,
							})
						}}
					>
						Create User
					</schmancy-button>
				</schmancy-grid>
				<schmancy-surface type="containerLow" rounded="all" elevation="2">
					<schmancy-grid cols="1fr" gap="md">
						<schmancy-surface rounded="top" elevation="1" type="containerHighest" class="sticky top-0 z-10 ">
							<schmancy-grid class="px-3 py-3" .cols=${cols} gap="md">
								<schmancy-typography weight="bold">Name</schmancy-typography>
								<schmancy-typography weight="bold">Email</schmancy-typography>
								<schmancy-typography weight="bold">Role</schmancy-typography>
								<schmancy-typography weight="bold">Venue Access</schmancy-typography>
							</schmancy-grid>
						</schmancy-surface>
						<section class="px-0 py-0">
							${when(
								Array.from(this.users.values()).length === 0,
								() => html`
									<schmancy-flex
										class="p-5"
										align="center"
										justify="center"
										gap="sm"
										${color({
											color: SchmancyTheme.sys.color.error.default,
										})}
									>
										<schmancy-icon>search</schmancy-icon>
										<schmancy-typography class="text-center">
											<schmancy-animated-text> No users found </schmancy-animated-text>
										</schmancy-typography>
									</schmancy-flex>
								`,
							)}
							<lit-virtualizer
								class="flex-grow"
								style="display:flex!important;"
								.items=${Array.from(this.users.values()) as Array<User>}
								.renderItem=${(user: User): TemplateResult => {
									return html`
										<section class="overflow-hidden w-full bg-surface-default hover:bg-surface-container">
											<schmancy-grid class="py-3 px-2" .cols=${cols} gap="md">
												<schmancy-typography weight="bold">${user.displayName}</schmancy-typography>
												<schmancy-typography>${user.email}</schmancy-typography>
												<schmancy-typography>${getRoleName(user.role)}</schmancy-typography>
												<schmancy-typography>
													${getVenueAccessText(user.venueAccess, this.venues)}
												</schmancy-typography>
												<schmancy-grid flow="col" gap="sm">
													<schmancy-icon-button
														@click=${() => {
															this.busy = true;
															const yes = confirm('Are you sure you want to delete this user?')
															if (yes) {
																UsersDB.delete(user.uid)
																	.subscribe({
																		next: () => {
																			this.busy = false;
																			$notify.success('User deleted successfully');
																			$usersFilter.next({ search: '' });
																		},
																		error: (error) => {
																			this.busy = false;
																			$notify.error('Error deleting user');
																			console.error('Error deleting user:', error);
																		}
																	});
															} else {
																this.busy = false;
															}
														}}
													>
														delete
													</schmancy-icon-button>
													<!-- edit -->
													<schmancy-icon-button
														@click=${() => {
															sheet.open({
																component: new UserForm(user),
																position: SchmancySheetPosition.Side,
															})
														}}
													>
														edit
													</schmancy-icon-button>
												</schmancy-grid>
											</schmancy-grid>
										</section>
									`
								}}
							>
							</lit-virtualizer>
						</section>
					</schmancy-grid>
				</schmancy-surface>
			</section>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-users': Users
	}
}

/**
 * Get a user-friendly role name
 * @param role User role
 * @returns Formatted display name for the role
 */
function getRoleName(role: UserRole | string): string {
	switch (role) {
		case 'super_admin':
			return 'Super Admin';
		case 'venue_owner':
			return 'Venue Owner';
		case 'venue_manager':
			return 'Venue Manager';
		case 'staff':
			return 'Staff';
		default:
			return role || 'Staff';
	}
}

/**
 * Get a formatted text of venues a user has access to
 * @param venueAccess Array of venue access entries
 * @param venues Map of venue IDs to venue objects
 * @returns Formatted string of venue access
 */
function getVenueAccessText(venueAccess: VenueAccess[] | undefined | null, venues?: Map<string, Venue>): string {
	if (!venueAccess || venueAccess.length === 0) {
		return 'None';
	}

	// Limit to 2 venues in display
	const venueNames = venueAccess.slice(0, 2).map(access => {
		if (!venues) return `Venue (${access.venueId.substring(0, 4)}...)`;
		const venue = venues.get(access.venueId);
		return venue ? venue.name : `Venue (${access.venueId.substring(0, 4)}...)`;
	});

	// Add "and X more" if there are additional venues
	if (venueAccess.length > 2) {
		return `${venueNames.join(', ')} +${venueAccess.length - 2} more`;
	}

	return venueNames.join(', ');
}
