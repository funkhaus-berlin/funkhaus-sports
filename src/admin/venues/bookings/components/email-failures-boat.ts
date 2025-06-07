import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { from, of } from 'rxjs'
import { catchError, map, tap } from 'rxjs/operators'
import { db } from 'src/firebase/firebase'
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore'
import { Booking } from 'src/types/booking/models'

interface EmailFailure {
	booking: Booking
	retryCount: number
	lastError: string
	lastFailedAt: string
	permanentlyFailed?: boolean
}

/**
 * Display email failures in a Schmancy boat component
 * Shows bookings that failed to send confirmation emails
 */
@customElement('email-failures-boat')
export class EmailFailuresBoat extends $LitElement() {
	@property({ type: String }) venueId?: string
	
	@state() failures: EmailFailure[] = []
	@state() loading = true
	@state() retrying = new Set<string>()

	connectedCallback() {
		super.connectedCallback()
		this.loadEmailFailures()
	}

	private loadEmailFailures() {
		this.loading = true
		
		// Query for failed emails
		const failuresQuery = query(
			collection(db, 'bookings'),
			where('status', '==', 'confirmed'),
			where('paymentStatus', '==', 'paid'),
			where('emailSent', '==', false),
			where('startTime', '>', new Date().toISOString())
		)

		from(getDocs(failuresQuery)).pipe(
			map(snapshot => {
				const failures: EmailFailure[] = []
				snapshot.forEach(doc => {
					const booking = { id: doc.id, ...doc.data() } as Booking
					
					// Filter by venue if specified
					if (this.venueId && booking.venueId !== this.venueId) {
						return
					}
					
					failures.push({
						booking,
						retryCount: booking.emailRetryCount || 0,
						lastError: booking.emailError || 'Unknown error',
						lastFailedAt: booking.emailFailedAt || booking.updatedAt,
						permanentlyFailed: booking.emailPermanentlyFailed
					})
				})
				
				// Sort by most recent failure first
				return failures.sort((a, b) => 
					new Date(b.lastFailedAt).getTime() - new Date(a.lastFailedAt).getTime()
				)
			}),
			tap(failures => {
				this.failures = failures
				this.loading = false
			}),
			catchError(error => {
				console.error('Error loading email failures:', error)
				this.loading = false
				return of([])
			})
		).subscribe()
	}

	private async retryEmail(failure: EmailFailure) {
		const bookingId = failure.booking.id
		if (!bookingId || this.retrying.has(bookingId)) return
		
		this.retrying = new Set([...this.retrying, bookingId])
		this.requestUpdate()
		
		try {
			// Call the resend-booking-email function
			const response = await fetch('/.netlify/functions/resend-booking-email', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ bookingId })
			})
			
			const result = await response.json()
			
			if (result.success) {
				// Update local state
				this.failures = this.failures.filter(f => f.booking.id !== bookingId)
				$notify.success('Email sent successfully')
			} else {
				$notify.error(result.error || 'Failed to send email')
				// Reload to get updated retry count
				this.loadEmailFailures()
			}
		} catch (error) {
			console.error('Error retrying email:', error)
			$notify.error('Failed to retry email')
		} finally {
			this.retrying.delete(bookingId)
			this.requestUpdate()
		}
	}

	private formatDate(dateStr: string) {
		return new Date(dateStr).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		})
	}

	render() {
		if (!this.failures.length && !this.loading) {
			return html``
		}

		return html`
			<schmancy-boat variant="error" class="mb-4">
				<div slot="title" class="flex items-center justify-between">
					<schmancy-typography type="title" token="md">
						Email Delivery Issues
					</schmancy-typography>
					${when(this.loading,
						() => html`<schmancy-circular-progress size="sm"></schmancy-circular-progress>`
					)}
				</div>
				
				${when(this.loading,
					() => html`
						<div class="py-4 text-center">
							<schmancy-typography type="body" token="sm">
								Loading email failures...
							</schmancy-typography>
						</div>
					`,
					() => html`
						${when(this.failures.length > 0,
							() => html`
								<schmancy-list class="mt-2">
									${repeat(this.failures, 
										failure => failure.booking.id,
										failure => html`
											<schmancy-list-item class="py-3">
												<div class="flex flex-col gap-2">
													<div class="flex items-start justify-between gap-2">
														<div class="flex-1">
															<schmancy-typography type="body" token="md" class="font-medium">
																${failure.booking.userName}
															</schmancy-typography>
															<schmancy-typography type="body" token="sm" class="text-surface-onVariant">
																${failure.booking.customerEmail}
															</schmancy-typography>
														</div>
														<schmancy-chip 
															variant="${failure.permanentlyFailed ? 'error' : 'warning'}"
															size="sm"
														>
															${failure.permanentlyFailed 
																? 'Failed' 
																: `Retry ${failure.retryCount}/${3}`
															}
														</schmancy-chip>
													</div>
													
													<div class="flex items-center gap-4 text-sm">
														<schmancy-typography type="label" token="sm">
															<schmancy-icon size="16px">event</schmancy-icon>
															${this.formatDate(failure.booking.startTime)}
														</schmancy-typography>
														<schmancy-typography type="label" token="sm">
															<schmancy-icon size="16px">sports_tennis</schmancy-icon>
															Court ${failure.booking.courtId?.substring(0, 8)}...
														</schmancy-typography>
													</div>
													
													<div class="flex items-center justify-between gap-2">
														<schmancy-typography type="body" token="sm" class="text-error-default">
															${failure.lastError}
														</schmancy-typography>
														
														${when(!failure.permanentlyFailed,
															() => html`
																<schmancy-button
																	size="sm"
																	variant="tonal"
																	@click=${() => this.retryEmail(failure)}
																	?disabled=${this.retrying.has(failure.booking.id!)}
																>
																	${this.retrying.has(failure.booking.id!)
																		? html`<schmancy-circular-progress size="sm"></schmancy-circular-progress>`
																		: 'Retry Now'
																	}
																</schmancy-button>
															`
														)}
													</div>
													
													<schmancy-typography type="label" token="sm" class="text-surface-onVariant">
														Last attempt: ${this.formatDate(failure.lastFailedAt)}
													</schmancy-typography>
												</div>
											</schmancy-list-item>
										`
									)}
								</schmancy-list>
								
								<div class="mt-3 pt-3 border-t border-surface-high">
									<schmancy-typography type="body" token="sm" class="text-surface-onVariant">
										Emails are automatically retried every 30 minutes. 
										After 3 failed attempts, manual intervention is required.
									</schmancy-typography>
								</div>
							`,
							() => html`
								<schmancy-typography type="body" token="md" class="py-4 text-center text-surface-onVariant">
									All booking confirmation emails have been sent successfully
								</schmancy-typography>
							`
						)}
					`
				)}
			</schmancy-boat>
		`
	}
}

// Add missing import
import { $notify } from '@mhmo91/schmancy'

declare global {
	interface HTMLElementTagNameMap {
		'email-failures-boat': EmailFailuresBoat
	}
}