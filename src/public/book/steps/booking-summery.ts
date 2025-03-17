import dayjs from 'dayjs'
import { html } from 'lit'
import { Court } from 'src/db/courts.collection'
import { Booking } from '../context'

export default (booking: Booking, selectedCourt: Court, duration: number) => {
	// Calculate the duration of the booking

	return html`<!-- Booking Summary -->
		<div class="bg-surface-container p-2 rounded-lg mb-2">
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
			</schmancy-grid>
		</div>`
}
