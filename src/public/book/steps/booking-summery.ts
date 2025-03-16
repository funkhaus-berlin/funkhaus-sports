import dayjs from 'dayjs'
import { html } from 'lit'
import { CourtPreferences } from 'src/bookingServices/court-assignment.service'
import { Court } from 'src/db/courts.collection'
import { Booking } from '../context'

export default (booking: Booking, selectedCourt: Court, duration: number, courtPreference: CourtPreferences) => {
	// Calculate the duration of the booking

	return html`<!-- Booking Summary -->
		<div class="bg-surface-container p-4 rounded-lg mb-4">
			<schmancy-typography type="title" token="sm" class="mb-2">Booking Summary</schmancy-typography>
			<schmancy-grid cols="1fr 1fr" gap="sm">
				<div>
					<schmancy-typography type="label" token="sm">Date:</schmancy-typography>
					<schmancy-typography type="body" weight="bold">
						${dayjs(booking.date).format('ddd, MMM D, YYYY')}
					</schmancy-typography>
				</div>
				<div>
					<schmancy-typography type="label" token="sm">Time:</schmancy-typography>
					<schmancy-typography type="body" weight="bold">
						${dayjs(booking.startTime).format('h:mm A')} - ${dayjs(booking.endTime).format('h:mm A')}
					</schmancy-typography>
				</div>
				<div>
					<schmancy-typography type="label" token="sm">Duration:</schmancy-typography>
					<schmancy-typography type="body" weight="bold">
						${duration / 60} hour${duration / 60 !== 1 ? 's' : ''}
					</schmancy-typography>
				</div>
				<div>
					<schmancy-typography type="label" token="sm">Court:</schmancy-typography>
					<schmancy-typography type="body" weight="bold">
						${selectedCourt ? selectedCourt.name : 'Auto-assigned'}
					</schmancy-typography>
				</div>

				<!-- Display court preferences summary -->
				${courtPreference.preferIndoor ||
				courtPreference.preferOutdoor ||
				(courtPreference.preferredCourtTypes && courtPreference.preferredCourtTypes.length > 0)
					? html`
							<div class="col-span-2">
								<schmancy-typography type="label" token="sm">Preferences:</schmancy-typography>
								<schmancy-flex gap="sm" wrap="wrap" class="mt-1">
									${courtPreference.preferIndoor
										? html`
												<div class="bg-primary-container text-primary-on-container px-2 py-1 rounded-full text-xs">
													Indoor
												</div>
										  `
										: ''}
									${courtPreference.preferOutdoor
										? html`
												<div class="bg-primary-container text-primary-on-container px-2 py-1 rounded-full text-xs">
													Outdoor
												</div>
										  `
										: ''}
									${(courtPreference.preferredCourtTypes || []).map(
										type => html`
											<div class="bg-primary-container text-primary-on-container px-2 py-1 rounded-full text-xs">
												${type.charAt(0).toUpperCase() + type.slice(1)}
											</div>
										`,
									)}
								</schmancy-flex>
							</div>
					  `
					: ''}

				<div class="col-span-2">
					<schmancy-typography type="label" token="sm">Total:</schmancy-typography>
					<schmancy-typography type="display" token="sm" class="text-primary-default">
						€${booking.price.toFixed(2)}
					</schmancy-typography>
				</div>
			</schmancy-grid>
		</div>`
}
