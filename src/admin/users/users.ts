import { $notify, color, fullHeight, SchmancySheetPosition, SchmancyTheme, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html, TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { switchMap, takeUntil } from 'rxjs'
import { User } from 'src/user.context'
import { $usersFilter } from './context'
import UserForm from './user-form'
import { UsersDB } from './users.collection'

@customElement('funkhaus-users')
export default class Users extends $LitElement(css``) {
	@state() busy: boolean = false
	@state() users: Map<string, User> = new Map()

	connectedCallback(): void {
		super.connectedCallback()
		$usersFilter
			.pipe(
				switchMap(() => UsersDB.query([])),
				takeUntil(this.disconnecting),
			)
			.subscribe(users => {
				this.users = users
				this.requestUpdate()
			})
	}

	render() {
		const cols = '1fr 1.5fr auto'
		return html`
			<schmancy-grid gap="md" rows="auto 1fr" ${fullHeight()} class="p-2">
				<!-- Header with title -->
				<schmancy-nav-drawer-appbar>
					<schmancy-typography align="left" type="headline">Users</schmancy-typography>
					<schmancy-icon-button
						variant="outlined"
						@click=${() => {
							sheet.open({
								component: new UserForm(),
								position: SchmancySheetPosition.Side,
							})
						}}
					>
						add
					</schmancy-icon-button>
				</schmancy-nav-drawer-appbar>

				<schmancy-surface type="container" rounded="all" elevation="2">
					<schmancy-grid cols="1fr" gap="md">
						<!-- Header -->
						<schmancy-surface rounded="top" elevation="1" type="containerHighest" class="sticky top-0 z-10">
							<schmancy-grid class="px-3 py-3" .cols=${cols} gap="md" align="center">
								<schmancy-typography weight="bold">Name</schmancy-typography>
								<schmancy-typography weight="bold">Email</schmancy-typography>
								<schmancy-typography weight="bold">Actions</schmancy-typography>
							</schmancy-grid>
						</schmancy-surface>

						<!-- User List -->
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
										<schmancy-icon>group_off</schmancy-icon>
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
										<section
											class="overflow-hidden w-full bg-surface-container hover:bg-surface-high border-b-1 border-outlineVariant transition-colors"
										>
											<schmancy-grid class="py-3 px-2" .cols=${cols} gap="md" align="center">
												<schmancy-flex align="center" gap="sm">
													<schmancy-icon class="text-surface-on-variant">person</schmancy-icon>
													<schmancy-typography weight="medium">${user.displayName}</schmancy-typography>
												</schmancy-flex>
												<schmancy-typography>${user.email}</schmancy-typography>
												<schmancy-flex gap="sm" justify="end">
													<schmancy-icon-button
														@click=${() => {
															sheet.open({
																component: new UserForm(user),
																position: SchmancySheetPosition.Side,
															})
														}}
													>
														<schmancy-icon>edit</schmancy-icon>
													</schmancy-icon-button>
													<schmancy-icon-button
														@click=${() => {
															this.busy = true
															const yes = confirm('Are you sure you want to delete this user?')
															if (yes) {
																UsersDB.delete(user.uid).subscribe({
																	next: () => {
																		this.busy = false
																		$notify.success('User deleted successfully')
																		$usersFilter.next({ search: '' })
																	},
																	error: error => {
																		this.busy = false
																		$notify.error('Error deleting user')
																		console.error('Error deleting user:', error)
																	},
																})
															} else {
																this.busy = false
															}
														}}
													>
														<schmancy-icon>delete</schmancy-icon>
													</schmancy-icon-button>
												</schmancy-flex>
											</schmancy-grid>
										</section>
									`
								}}
							>
							</lit-virtualizer>
						</section>
					</schmancy-grid>
				</schmancy-surface>
			</schmancy-grid>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-users': Users
	}
}
