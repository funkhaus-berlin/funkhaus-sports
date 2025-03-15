// court-booking-payment').ts
import { $notify, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { StripeElements } from '@stripe/stripe-js'
import dayjs from 'dayjs'
import { signInAnonymously } from 'firebase/auth'
import { css, html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { catchError, from, map, retry, Subject, switchMap } from 'rxjs'
import { BookingFormData } from 'src/db/interface'
import { auth } from 'src/firebase/firebase'
import stripePromise, { $stripe, $stripeElements, createPaymentIntent } from 'src/public/stripe'
import { Booking, bookingContext } from '../context'
import { Court } from '../types'
@customElement('court-booking-payment')
export class CourtSelectionStep extends $LitElement() {
	static styles = css`
		.court-grid {
			display: grid;
			gap: 8px;
		}
	`

	@select(bookingContext) booking!: Booking

	@state() loading = true
	@state() processing = false
	// Stripe related states
	@state() formData = new BookingFormData()
	@state() validationPaymentResponse: boolean = false
	@state() error: string | null = null
	@state() success: boolean = false

	@state() validate: boolean = false

	protected firstUpdated(_changedProperties: PropertyValues): void {
		// Initialize Stripe
		$stripe.next(this.booking.price || 0)
		$stripeElements.subscribe(() => {
			if ($stripeElements.value) {
				this.loading = false
			} else {
				this.loading = true
			}
		})

		this.checkPaymentStatus()
	}

	@property({ type: Array }) courts: Court[] = []
	@property({ type: Object }) selectedCourt?: Court
	@property({ attribute: false }) onCourtSelected?: (court: Court) => void
	// Check payment status for returning from Stripe
	async checkPaymentStatus() {
		const clientSecret = new URLSearchParams(window.location.search).get('payment_intent_client_secret')

		if (!clientSecret) {
			return
		}

		const stripe = await stripePromise

		if (!stripe) {
			return
		}

		this.processing = true

		// Check payment status
		const check = new Subject<number>()
		check.pipe(switchMap(() => from(stripe.retrievePaymentIntent(clientSecret)))).subscribe({
			next: ({ paymentIntent }) => {
				switch (paymentIntent?.status) {
					case 'succeeded':
						// Create the booking after successful payment
						// this.createBookingAfterPayment(paymentIntent.id)
						break
					case 'processing':
						this.processing = true
						// Check again after a short delay
						setTimeout(() => check.next(0), 1000)
						break
					case 'requires_payment_method':
						$notify.error('Payment failed, please try again.')
						this.processing = false
						break
					default:
						this.processing = false
				}
			},
			error: () => {
				this.processing = false
			},
		})
	}

	// Create booking record after successful payment
	// private async createBookingAfterPayment(paymentId: string) {
	// 	try {
	// 		const startTime = dayjs(this.booking.startTime)
	// 		const endTime = dayjs(this.booking.endTime)

	// 		// Format times for backend (HH:00)
	// 		const formattedStartTime = startTime.format('HH:00')
	// 		const formattedEndTime = endTime.format('HH:00')

	// 		// Create booking request object
	// 		const bookingRequest = {
	// 			id: '',
	// 			userId: this.authService.getCurrentUserId(),
	// 			userName: this.auth.currentUser?.displayName || this.formData.name || 'User',
	// 			courtId: this.booking.courtId,
	// 			date: this.date,
	// 			startTime: formattedStartTime,
	// 			endTime: formattedEndTime,
	// 			price: this.booking.price || 0,
	// 			paymentId: paymentId, // Include payment reference
	// 			paymentStatus: 'paid',
	// 			status: 'confirmed',
	// 		}

	// 		// Create booking via API
	// 		this.bookingService.createBooking(bookingRequest).subscribe({
	// 			next: _booking => {
	// 				// Show success
	// 				this.success = true
	// 				this.processing = false

	// 				// Dispatch event for parent components
	// 				this.dispatchEvent(
	// 					new CustomEvent('booking-confirmed', {
	// 						detail: {
	// 							...this.booking,
	// 							paymentId,
	// 							paymentStatus: 'paid',
	// 						},
	// 						bubbles: true,
	// 						composed: true,
	// 					}),
	// 				)

	// 				// Reset after delay
	// 				setTimeout(() => {
	// 					this.step = 1
	// 					bookingContext.clear()
	// 					this.success = false
	// 				}, 3000)
	// 			},
	// 			error: error => {
	// 				console.error('Error creating booking:', error)
	// 				this.error = 'Payment successful, but booking record could not be created. Please contact support.'
	// 				this.processing = false
	// 			},
	// 		})
	// 	} catch (err) {
	// 		console.error('Error creating booking:', err)
	// 		this.error = 'Payment successful, but booking record could not be created. Please contact support.'
	// 		this.processing = false
	// 	}
	// }

	// Process payment and create booking
	async processPaymentBooking(e: Event) {
		e.preventDefault()

		const elements = $stripeElements.value as StripeElements
		const stripe = await stripePromise
		if (!stripe || !elements) {
			$notify.error('Payment processing failed. Please try again.')
			return
		}

		// Validate payment form
		this.processing = true
		const { error } = await elements?.submit()

		if (error) {
			this.processing = false

			if (error.type === 'card_error' || error.type === 'validation_error') {
				$notify.error(error.message || 'Card validation failed')
			} else {
				$notify.error('Something went wrong, please try again.')
			}
			return
		}

		this.processing = true

		// Process payment with anonymous auth if user isn't already authenticated
		from(auth.currentUser ? Promise.resolve({ user: { uid: auth.currentUser.uid } }) : signInAnonymously(auth))
			.pipe(
				map(userCredential => userCredential.user.uid),
				switchMap(uid =>
					createPaymentIntent({
						amount: this.booking.price * 100,
						email: this.formData.email,
						name: this.formData.name,
						items: {
							[this.booking.courtId!]: 1, // Book one court
						},
						eventID: this.booking.id || 'court-booking',
						uid: uid,
						phone: this.formData.phoneNumber,
						address: this.formData.address,
						postalCode: this.formData.postalCode,
						city: this.formData.city,
						country: this.formData.country,
					}).pipe(
						retry(3),
						switchMap((res: any) =>
							from(
								stripe.confirmPayment({
									clientSecret: res.clientSecret,
									elements,
									confirmParams: {
										payment_method_data: {
											billing_details: {
												name: this.formData.name,
												phone: this.formData.phoneNumber,
												address: {
													country: this.formData.country,
													state: this.formData.city,
													city: this.formData.city,
													line1: this.formData.address,
													postal_code: this.formData.postalCode,
												},
											},
										},
										return_url: location.href,
										receipt_email: this.formData.email,
									},
								}),
							).pipe(
								catchError(e => {
									throw e
								}),
								map(res => {
									if (res.error) {
										throw res.error
									}
									return res
								}),
							),
						),
					),
				),
			)
			.subscribe({
				next: () => {
					this.processing = false
				},
				error: error => {
					if (error.type === 'card_error' || error.type === 'validation_error') {
						$notify.error('Payment failed: ' + (error.message || 'Card declined'))
					} else if (error.code === 'resource_missing') {
						$notify.error('Payment not processed. Please try again.')
					} else {
						$notify.error('Something went wrong with the payment. Please try again.')
					}
					this.processing = false
				},
			})
	}

	render() {
		if (this.success) {
			return html`
				<schmancy-grid class="p-4" gap="md" align="center" justify="center">
					<schmancy-typography type="headline">Booking Confirmed!</schmancy-typography>
					<schmancy-typography type="body">
						Your booking has been confirmed for ${this.booking.date} at ${dayjs(this.booking.startTime).format('HH:mm')}
						- ${dayjs(this.booking.endTime).format('HH:mm')}
					</schmancy-typography>
					<schmancy-typography type="body">
						Court: ${this.selectedCourt ? this.selectedCourt.name || `#${this.selectedCourt.id}` : 'Assigned court'}
					</schmancy-typography>
				</schmancy-grid>
			`
		}

		const duration = dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minutes') / 60
		const total = this.booking.price * duration

		return html`
			<schmancy-form
				class="p-4"
				.hidden=${this.validationPaymentResponse}
				@submit=${(e: Event) => {
					if (this.formData.email !== this.formData.repeatEmail) {
						return
					}
					this.processPaymentBooking(e)
				}}
			>
				<schmancy-grid class="w-full" gap="md">
					<!-- Booking Summary -->
					<schmancy-surface rounded="all" class="w-full p-4" type="container">
						<schmancy-grid gap="sm" align="center">
							<schmancy-typography type="headline"> Booking Summary </schmancy-typography>

							<schmancy-grid cols="1fr auto" gap="sm">
								<schmancy-typography type="body">Date:</schmancy-typography>
								<schmancy-typography type="body" weight="bold">${this.booking.date}</schmancy-typography>

								<schmancy-typography type="body">Time:</schmancy-typography>
								<schmancy-typography type="body" weight="bold">
									${dayjs(this.booking.startTime).format('HH:mm')} - ${dayjs(this.booking.endTime).format('HH:mm')}
								</schmancy-typography>

								<schmancy-typography type="body">Duration:</schmancy-typography>
								<schmancy-typography type="body" weight="bold">${duration} minutes</schmancy-typography>

								<schmancy-typography type="body">Court:</schmancy-typography>
								<schmancy-typography type="body" weight="bold">
									${this.selectedCourt
										? this.selectedCourt.name || `#${this.selectedCourt.id}`
										: 'Best available court (assigned automatically)'}
								</schmancy-typography>

								<schmancy-typography type="body">Total Price:</schmancy-typography>
								<schmancy-typography type="headline" token="lg">&euro;${total.toFixed(2)}</schmancy-typography>
							</schmancy-grid>
						</schmancy-grid>
					</schmancy-surface>

					<!-- Personal Info -->
					<schmancy-grid content="stretch" cols="1fr 1fr" gap="sm">
						<schmancy-input
							.autocomplete=${'given-name'}
							.value=${this.formData.name}
							required
							type="text"
							class="w-full"
							placeholder="Full Name"
							@change=${(e: any) => {
								this.formData.name = e.detail.value
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'tel'}
							.value=${this.formData.phoneNumber}
							required
							type="text"
							class="w-full"
							placeholder="Phone Number"
							@change=${(e: any) => {
								this.formData.phoneNumber = e.detail.value
							}}
						></schmancy-input>
					</schmancy-grid>

					<!-- Address Info -->
					<schmancy-grid cols="1fr 1fr" gap="sm">
						<schmancy-input
							.autocomplete=${'street-address'}
							.value=${this.formData.address}
							required
							type="text"
							placeholder="Street Address"
							@change=${(e: any) => {
								this.formData.address = e.detail.value
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'postal-code'}
							.value=${this.formData.postalCode}
							required
							type="text"
							placeholder="Postal Code"
							@change=${(e: any) => {
								this.formData.postalCode = e.detail.value
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'address-level2'}
							.value=${this.formData.city}
							required
							type="text"
							placeholder="City"
							@change=${(e: any) => {
								this.formData.city = e.detail.value
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'country-name'}
							.value=${this.formData.country}
							required
							type="text"
							placeholder="Country"
							@change=${(e: any) => {
								this.formData.country = e.detail.value
							}}
						></schmancy-input>
					</schmancy-grid>

					<!-- Email Fields -->
					<schmancy-grid cols="1fr 1fr" gap="sm">
						<schmancy-input
							.autocomplete=${'email'}
							.value=${this.formData.email}
							required
							type="email"
							placeholder="Email Address"
							@change=${(e: any) => {
								this.formData.email = e.detail.value
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'email'}
							.value=${this.formData.repeatEmail}
							required
							type="email"
							placeholder="Confirm Email"
							@change=${(e: any) => {
								this.formData.repeatEmail = e.detail.value
							}}
							@blur=${() => {
								if (this.formData.email !== this.formData.repeatEmail) {
									this.validate = true
								}
							}}
						></schmancy-input>

						${when(
							this.validate && this.formData.email !== this.formData.repeatEmail,
							() => html`
								<schmancy-typography class="col-span-2 text-red-500" type="label" token="sm">
									Email addresses do not match
								</schmancy-typography>
							`,
						)}
					</schmancy-grid>

					<!-- Payment Element -->
					<schmancy-grid>
						<section class="relative block">
							<slot name="stripe-element"></slot>
						</section>
					</schmancy-grid>

					<!-- Terms & Submit Button -->
					<schmancy-grid justify="end" gap="md">
						<schmancy-typography type="label" align="left">
							<span> By clicking Pay you agree to our terms and conditions </span>
						</schmancy-typography>

						<schmancy-button class="h-[3rem]" type="submit" variant="filled" .disabled=${this.processing}>
							<schmancy-typography class="px-4" type="title" token="lg">
								Pay &euro;${total.toFixed(2)}
							</schmancy-typography>
						</schmancy-button>
					</schmancy-grid>
				</schmancy-grid>
			</schmancy-form>

			${when(
				this.processing,
				() => html`
					<schmancy-busy class="z-50">
						<schmancy-flex flow="row" gap="sm" align="center">
							<schmancy-spinner class="h-[48px] w-[48px]" size="48px"></schmancy-spinner>
						</schmancy-flex>
					</schmancy-busy>
				`,
			)}
		`
	}
}
