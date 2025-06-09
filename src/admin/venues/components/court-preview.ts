import { select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { takeUntil } from 'rxjs'
import { Court } from 'src/types/booking/court.types'
import { Venue } from 'src/types/booking/venue.types'
import { selectMyCourts } from '../courts/context'
import { venueContext } from '../venue-context'
import { formatEnum } from './venue-form'

@customElement('venue-courts-preview')
export class VenueCourtsPreview extends $LitElement() {
	@select(venueContext) venue!: Venue
	@state() courts!: Map<string, Court>

	connectedCallback(): void {
		super.connectedCallback()
		selectMyCourts.pipe(takeUntil(this.disconnecting)).subscribe({
			next: courts => {
				this.courts = courts
				this.requestUpdate()
			},
		})
	}

	// Get icon for sport type
	getSportIcon(sport: string): string {
		const sportIcons: Record<string, string> = {
			tennis: 'sports_tennis',
			basketball: 'sports_basketball',
			soccer: 'sports_soccer',
			volleyball: 'sports_volleyball',
			baseball: 'sports_baseball',
			pickleball: 'sports_tennis', // Using tennis icon for pickleball
			badminton: 'sports_tennis', // Using tennis icon for badminton
			tabletennis: 'sports_tennis', // Using tennis icon for table tennis
			handball: 'sports_handball',
			cricket: 'sports_cricket',
			gymnastics: 'sports_gymnastics',
			golf: 'sports_golf',
			rugby: 'sports_rugby',
			hockey: 'sports_hockey',
			swimming: 'pool',
		}

		return sportIcons[sport.toLowerCase()] || 'sports_score'
	}

	getStatusClass(status: string): string {
		switch (status) {
			case 'active':
				return 'bg-green-100 text-green-600'
			case 'maintenance':
				return 'bg-yellow-100 text-yellow-600'
			case 'inactive':
				return 'bg-red-100 text-red-600'
			default:
				return ''
		}
	}

	getStatusIcon(status: string): string {
		switch (status) {
			case 'active':
				return 'check_circle'
			case 'maintenance':
				return 'construction'
			case 'inactive':
				return 'cancel'
			default:
				return ''
		}
	}

	render() {
		return html`
			<schmancy-surface type="container" rounded="all">
				${when(
					this.courts.size === 0,
					() => html`
						<div class="text-center py-10">
							<schmancy-icon class="text-6xl text-gray-400"> sports_tennis </schmancy-icon>
							<schmancy-typography type="headline" token="sm" class="mt-2 mb-1"> No Courts Added </schmancy-typography>
							<schmancy-typography type="body" token="md" class="mb-4 text-gray-500">
								Add courts to start managing this venue's facilities
							</schmancy-typography>
						</div>
					`,
					() => html`
						<schmancy-grid gap="md" cols="repeat(auto-fill, minmax(300px, 1fr))">
							${repeat(
								Array.from(this.courts.values()),
								court => court.id,
								court => html`
									<schmancy-surface type="containerLow" rounded="all">
										<schmancy-grid gap="sm" class="px-3 py-2">
											<div class="flex justify-between items-start mb-2">
												<schmancy-typography type="title" token="sm">
													${court.name}
													<span
														class="inline-flex items-center py-1 px-2 rounded-full text-xs ml-2 ${this.getStatusClass(
															court.status || 'inactive',
														)}"
													>
														<schmancy-icon size="14px" class="mr-1">
															${this.getStatusIcon(court.status || 'inactive')}
														</schmancy-icon>
														${formatEnum(court.status || 'inactive')}
													</span>
												</schmancy-typography>
											</div>

											<schmancy-chip .label=${formatEnum(court.courtType || 'standard')} readOnly> </schmancy-chip>

											<div class="mb-2">
												<div class="text-gray-500 text-xs mb-1">Sports</div>
												<div class="flex flex-wrap">
													${court.sportTypes?.map(
														sport => html`
															<div class="inline-flex items-center bg-gray-100 px-2 py-1 rounded text-xs mr-1 mb-1">
																<schmancy-icon size="14px" class="mr-1">${this.getSportIcon(sport)}</schmancy-icon>
																${formatEnum(sport)}
															</div>
														`,
													)}
												</div>
											</div>

											<div>
												<div class="text-gray-500 text-xs mb-1">Rate</div>
												<div class="font-mono font-medium text-lg">
													€${(court.pricing?.baseHourlyRate || 0).toFixed(2)}
												</div>
												${court.pricing?.peakHourRate
													? html`
															<div class="text-xs">
																Peak Hours: <span class="font-medium">€${court.pricing.peakHourRate.toFixed(2)}</span>
															</div>
													  `
													: ''}
											</div>
										</schmancy-grid>
									</schmancy-surface>
								`,
							)}
						</schmancy-grid>
					`,
				)}
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'venue-courts-preview': VenueCourtsPreview
	}
}
