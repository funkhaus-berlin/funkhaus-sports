import { $notify } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { from, of } from 'rxjs'
import { catchError, map, tap } from 'rxjs/operators'
import { db } from 'src/firebase/firebase'
import { collection, query, where, getDocs, or } from 'firebase/firestore'
import { Booking } from 'src/types/booking/booking.types'

interface BookingIssue {
	booking: Booking
	issueType: 'email_failed' | 'qr_generation_failed' | 'wallet_pass_failed' | 'other'
	issueDescription: string
	retryCount: number
	lastFailedAt: string
	permanentlyFailed?: boolean
	canRetry: boolean
}

/**
 * Display post-payment booking issues in a Schmancy boat component
 * Shows bookings that have issues after successful payment (email, QR code, wallet passes, etc.)
 */
@customElement('booking-issues-alert')
export class BookingIssuesAlert extends $LitElement() {
	@property({ type: String }) venueId?: string
	
	@state() issues: BookingIssue[] = []
	@state() loading = true
	@state() retrying = new Set<string>()

	connectedCallback() {
		super.connectedCallback()
		this.loadBookingIssues()
	}

	private loadBookingIssues() {
		this.loading = true
		
		// Query for bookings with various post-payment issues
		const issuesQuery = query(
			collection(db, 'bookings'),
			where('status', '==', 'confirmed'),
			where('paymentStatus', '==', 'paid'),
			where('startTime', '>', new Date().toISOString()),
			or(
				where('emailSent', '==', false),
				where('emailPermanentlyFailed', '==', true),
				where('qrCodeFailed', '==', true),
				where('walletPassFailed', '==', true)
			)
		)

		from(getDocs(issuesQuery)).pipe(
			map(snapshot => {
				const issues: BookingIssue[] = []
				snapshot.forEach(doc => {
					const booking = { id: doc.id, ...doc.data() } as Booking
					
					// Filter by venue if specified
					if (this.venueId && booking.venueId !== this.venueId) {
						return
					}
					
					// Check for various types of issues
					if (!booking.emailSent || booking.emailPermanentlyFailed) {
						issues.push({
							booking,
							issueType: 'email_failed',
							issueDescription: booking.emailError || 'Failed to send confirmation email',
							retryCount: booking.emailRetryCount || 0,
							lastFailedAt: booking.emailFailedAt || booking.updatedAt || new Date().toISOString(),
							permanentlyFailed: booking.emailPermanentlyFailed,
							canRetry: !booking.emailPermanentlyFailed
						})
					}
					
					// Future: Add other issue types here
					// if (booking.qrCodeFailed) { ... }
					// if (booking.walletPassFailed) { ... }
				})
				
				// Sort by most recent failure first
				return issues.sort((a, b) => 
					new Date(b.lastFailedAt).getTime() - new Date(a.lastFailedAt).getTime()
				)
			}),
			tap(issues => {
				this.issues = issues
				this.loading = false
			}),
			catchError(error => {
				console.error('Error loading booking issues:', error)
				this.loading = false
				return of([])
			})
		).subscribe()
	}

	private async retryIssue(issue: BookingIssue) {
		const bookingId = issue.booking.id
		if (!bookingId || this.retrying.has(bookingId) || !issue.canRetry) return
		
		this.retrying = new Set([...this.retrying, bookingId])
		this.requestUpdate()
		
		try {
			// Handle different issue types
			switch (issue.issueType) {
				case 'email_failed':
					await this.retryEmail(bookingId)
					break
				// Future: Add handlers for other issue types
				// case 'qr_generation_failed':
				//   await this.retryQrGeneration(bookingId)
				//   break
				default:
					$notify.error('Retry not implemented for this issue type')
			}
		} finally {
			this.retrying.delete(bookingId)
			this.requestUpdate()
		}
	}

	private async retryEmail(bookingId: string) {
		try {
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
				this.issues = this.issues.filter(i => i.booking.id !== bookingId)
				$notify.success('Email sent successfully')
			} else {
				$notify.error(result.error || 'Failed to send email')
				// Reload to get updated retry count
				this.loadBookingIssues()
			}
		} catch (error) {
			console.error('Error retrying email:', error)
			$notify.error('Failed to retry email')
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

	private getIssueIcon(issueType: BookingIssue['issueType']): string {
		switch (issueType) {
			case 'email_failed':
				return 'mail_outline'
			case 'qr_generation_failed':
				return 'qr_code'
			case 'wallet_pass_failed':
				return 'account_balance_wallet'
			default:
				return 'warning'
		}
	}

	private getIssueTitle(issueType: BookingIssue['issueType']): string {
		switch (issueType) {
			case 'email_failed':
				return 'Email Delivery'
			case 'qr_generation_failed':
				return 'QR Code Generation'
			case 'wallet_pass_failed':
				return 'Wallet Pass'
			default:
				return 'Booking Issue'
		}
	}

	render() {
		if (!this.issues.length && !this.loading) {
			return html``
		}

		return html`
			<schmancy-boat variant="error" class="mb-4">
				<div slot="title" class="flex items-center justify-between">
					<schmancy-typography type="title" token="md">
						Post-Payment Booking Issues
					</schmancy-typography>
					${when(this.loading,
						() => html`<schmancy-circular-progress size="sm"></schmancy-circular-progress>`
					)}
				</div>
				
				${when(this.loading,
					() => html`
						<div class="py-4 text-center">
							<schmancy-typography type="body" token="sm">
								Loading booking issues...
							</schmancy-typography>
						</div>
					`,
					() => html`
						${when(this.issues.length > 0,
							() => html`
								<schmancy-list class="mt-2">
									${repeat(this.issues, 
										issue => `${issue.booking.id}-${issue.issueType}`,
										issue => html`
											<schmancy-list-item class="py-3">
												<div class="flex flex-col gap-2">
													<div class="flex items-start justify-between gap-2">
														<div class="flex-1">
															<div class="flex items-center gap-2 mb-1">
																<schmancy-icon size="20px" class="text-error-default">
																	${this.getIssueIcon(issue.issueType)}
																</schmancy-icon>
																<schmancy-typography type="body" token="sm" class="font-medium text-error-default">
																	${this.getIssueTitle(issue.issueType)}
																</schmancy-typography>
															</div>
															<schmancy-typography type="body" token="md" class="font-medium">
																${issue.booking.userName}
															</schmancy-typography>
															<schmancy-typography type="body" token="sm" class="text-surface-onVariant">
																${issue.booking.customerEmail}
															</schmancy-typography>
														</div>
														<schmancy-chip 
															variant="${issue.permanentlyFailed ? 'error' : 'warning'}"
															size="sm"
														>
															${issue.permanentlyFailed 
																? 'Failed' 
																: `Retry ${issue.retryCount}/3`
															}
														</schmancy-chip>
													</div>
													
													<div class="flex items-center gap-4 text-sm">
														<schmancy-typography type="label" token="sm" class="flex items-center gap-1">
															<schmancy-icon size="16px">event</schmancy-icon>
															${this.formatDate(issue.booking.startTime)}
														</schmancy-typography>
														<schmancy-typography type="label" token="sm" class="flex items-center gap-1">
															<schmancy-icon size="16px">sports_tennis</schmancy-icon>
															Court ${issue.booking.courtId?.substring(0, 8)}...
														</schmancy-typography>
													</div>
													
													<div class="flex items-center justify-between gap-2">
														<schmancy-typography type="body" token="sm" class="text-error-default">
															${issue.issueDescription}
														</schmancy-typography>
														
														${when(issue.canRetry && !issue.permanentlyFailed,
															() => html`
																<schmancy-button
																	size="sm"
																	variant="filled tonal"
																	@click=${() => this.retryIssue(issue)}
																	?disabled=${this.retrying.has(issue.booking.id!)}
																>
																	${this.retrying.has(issue.booking.id!)
																		? html`<schmancy-circular-progress size="sm"></schmancy-circular-progress>`
																		: 'Retry Now'
																	}
																</schmancy-button>
															`
														)}
													</div>
													
													<schmancy-typography type="label" token="sm" class="text-surface-onVariant">
														Last attempt: ${this.formatDate(issue.lastFailedAt)}
													</schmancy-typography>
												</div>
											</schmancy-list-item>
										`
									)}
								</schmancy-list>
								
								<div class="mt-3 pt-3 border-t border-surface-high">
									<schmancy-typography type="body" token="sm" class="text-surface-onVariant">
										Issues are automatically retried periodically. 
										After 3 failed attempts, manual intervention is required.
									</schmancy-typography>
								</div>
							`,
							() => html`
								<schmancy-typography type="body" token="md" class="py-4 text-center text-surface-onVariant">
									All bookings are processing successfully
								</schmancy-typography>
							`
						)}
					`
				)}
			</schmancy-boat>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'booking-issues-alert': BookingIssuesAlert
	}
}