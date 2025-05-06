// src/admin/venues/venues.ts
import { $notify, area, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { takeUntil } from 'rxjs'
import { Venue, VenuesDB } from 'src/db/venue-collection'
import { confirm } from 'src/schmancy'
import './admin-venue-card' // Import admin venue card
import { VenueForm } from './components/venue-form'
import { venueContext, venuesContext } from './venue-context'
import { VenueDetailView } from './venue-detail'
// --- Venue Management Component ---
@customElement('venues-management')
export class VenueManagement extends $LitElement() {
	@select(venuesContext, undefined, {
		required: true,
	})
	venues!: Map<string, Venue>

	@state() loading: boolean = true
	@state() error: string | null = null
	@state() selectedVenue: Venue | null = null
	@state() searchQuery: string = ''
	
	connectedCallback() {
		super.connectedCallback();
		
		// Diagnostic code to verify venue IDs
		setTimeout(() => {
			if (this.venues && this.venues.size > 0) {
				// Check for venues with missing or invalid IDs
				console.log(`Loaded ${this.venues.size} venues from context`);
				
				const venuesWithIssues = Array.from(this.venues.entries())
					.filter(([id, venue]) => {
						// Check if the venue ID matches the map key
						const hasIdMismatch = venue.id !== id;
						// Check if the venue ID is missing or empty
						const hasMissingId = !venue.id || venue.id.trim() === '';
						return hasIdMismatch || hasMissingId;
					});
					
				if (venuesWithIssues.length > 0) {
					console.warn('Found venues with ID issues:', venuesWithIssues);
					
					// Fix venues with ID issues
					venuesWithIssues.forEach(([id, venue]) => {
						// Ensure the venue ID matches the map key
						if (venue.id !== id || !venue.id) {
							console.log(`Fixing ID for venue "${venue.name}": "${venue.id}" → "${id}"`);
							
							// Update the venue object with the correct ID from the map key
							const updatedVenue = {
								...venue,
								id: id,
							};
							
							// Update the venue in the context
							VenuesDB.upsert(updatedVenue, id)
								.subscribe({
									next: () => {
										console.log(`Fixed ID for venue "${venue.name}"`);
									},
									error: (err) => {
										console.error(`Failed to fix ID for venue "${venue.name}":`, err);
									}
								});
						}
					});
				} else {
					console.log('All venues have valid IDs');
				}
			}
		}, 1000);
	}

	render() {
		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all" elevation="1">
				<div ${fullHeight()} class="max-w-6xl mx-auto p-6 h-full grid grid-rows-[auto_auto_1fr] gap-4">
					<!-- Header with title -->
					<div class="flex justify-between items-center mb-2">
						<schmancy-typography type="headline">Venue Management</schmancy-typography>
						<schmancy-button
							variant="filled"
							@click=${() => {
								area.push({
									component: VenueForm,
									area: 'admin',
								})
							}}
						>
							<schmancy-icon>add</schmancy-icon>Add Venue
						</schmancy-button>
					</div>

					<div class="overflow-y-auto">
						<div class="flex flex-col gap-4 p-2">
							${repeat(
								Array.from(this.venues.values()).filter(venue =>
									venue.name.toLowerCase().includes(this.searchQuery.toLowerCase()),
								),
								venue => venue.id,
								venue => this.renderVenueCard(venue),
							)}
						</div>
					</div>
				</div>
			</schmancy-surface>
		`
	}

	// Render a single venue card with action buttons
	renderVenueCard(venue: Venue) {
		return html`
			<div class="relative group">
				<admin-venue-card
					.venue=${venue}
					@click=${() => {
						// Set venue context first and ensure it's fully updated before navigating
						venueContext.set(venue)

						// Use setTimeout to ensure context is updated before navigation
						setTimeout(() => {
							area.push({
								component: new VenueDetailView(venue),
								area: 'admin',
								// Pass venue data in params for better context persistence
								state: { venueId: venue.id },
							})
						}, 50)
					}}
				></admin-venue-card>

				<!-- Floating Action Buttons - visible on hover -->
				<div
					class="absolute top-5 right-5 z-10 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
				>
					<schmancy-button
						variant="filled tonal"
						@click=${(e) => {
							e.stopPropagation(); // Prevent opening venue details
							// Set venue context first and ensure it's fully updated before navigating
							venueContext.set(venue)

							// Use setTimeout to ensure context is updated before navigation
							setTimeout(() => {
								area.push({
									component: new VenueForm(venue),
									area: 'admin',
									// Pass venue data in params for better context persistence
									state: { venueId: venue.id },
								})
							}, 50)
						}}
						title="Edit Venue"
					>
						<schmancy-icon>edit</schmancy-icon>
						Edit
					</schmancy-button>
					
					<schmancy-button
						variant="filled tonal"
						@click=${(e) => {
							e.stopPropagation(); // Prevent opening venue details when clicking delete
							this.confirmDeleteVenue(venue);
						}}
						title="Delete Venue"
						class="text-error-default"
					>
						<schmancy-icon>delete</schmancy-icon>
						Delete
					</schmancy-button>
				</div>
			</div>
		`
	}
	
	// Confirm and delete a venue
	async confirmDeleteVenue(venue: Venue) {
		try {
			// First check if this venue actually has a valid ID
			if (!venue.id || venue.id.trim() === '') {
				console.error('Invalid venue ID detected:', venue);
				$notify.error('Cannot delete venue: Invalid venue ID');
				return;
			}
			
			// Log venue data for debugging
			console.log('Attempting to delete venue:', {
				id: venue.id,
				name: venue.name,
				documentPath: `venues/${venue.id}`
			});
			
			const confirmed = await confirm({
				message: 'Are you sure you want to delete this venue? This action cannot be undone and will delete all associated courts and data.',
				title: 'Delete Venue',
				confirmText: 'Delete',
				confirmColor: 'error',
				showIcon: true,
				icon: 'delete',
			})

			if (confirmed) {
				// Show loading state
				const loadingDialog = document.createElement('schmancy-busy')
				loadingDialog.classList.add('fixed', 'inset-0');
				document.body.appendChild(loadingDialog);
				
				// Double-check that we have a valid document ID
				// The ID should be a string like "12345-abcde-67890" (UUID format),
				// not an object or array or anything else
				const venueId = typeof venue.id === 'string' ? venue.id : String(venue.id);
				
				// Verify this venue exists in our cache before attempting to delete
				if (!this.venues.has(venueId)) {
					console.error('Venue not found in cache:', venueId);
					document.body.removeChild(loadingDialog);
					$notify.error('Cannot delete venue: Venue not found in system');
					return;
				}
				
				// Perform the delete
				VenuesDB.delete(venueId)
					.pipe(takeUntil(this.disconnecting))
					.subscribe({
						next: () => {
							// Remove loading state
							document.body.removeChild(loadingDialog);
							// Notify success
							$notify.success(`Venue "${venue.name}" deleted successfully`)
						},
						error: (err) => {
							// Remove loading state
							document.body.removeChild(loadingDialog);
							// Notify error
							console.error('Error deleting venue:', err)
							$notify.error(`Failed to delete venue: ${err.message || 'Unknown error'}`)
						}
					})
			}
		} catch (err) {
			console.error('Error in delete confirmation:', err)
			$notify.error('An error occurred while trying to delete the venue')
		}
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'venues-management': VenueManagement
	}
}
