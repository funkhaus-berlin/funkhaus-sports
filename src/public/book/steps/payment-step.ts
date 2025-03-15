import { $notify, select, sheet } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { StripeElements } from '@stripe/stripe-js'
import dayjs from 'dayjs'
import { signInAnonymously } from 'firebase/auth'
import { html, PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { when } from 'lit/directives/when.js'
import { catchError, from, map, retry, Subject, switchMap } from 'rxjs'
import { BookingFormData } from 'src/db/interface'
import { auth } from 'src/firebase/firebase'
import stripePromise, { $stripe, $stripeElements, createPaymentIntent } from 'src/public/stripe'
import { Booking, bookingContext } from '../context'
import { FunkhausSportsTermsAndConditions } from '../terms-and-conditions'
import { Court } from '../types'

@customElement('booking-payment-step')
export class BookingPaymentStep extends $LitElement() {
	@select(bookingContext) booking!: Booking

	@state() loading = true
	@state() processing = false
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
		let durationIn = 'minutes'
		let duration = dayjs(this.booking.endTime).diff(dayjs(this.booking.startTime), 'minutes')
		// if duration >= 60 minutes, show duration in hours
		if (duration >= 60) {
			durationIn = duration > 60 ? 'hours' : 'hour'
			duration = duration / 60
		}

		return html`
			<schmancy-form
				class="px-2"
				.hidden=${this.validationPaymentResponse}
				@submit=${(e: Event) => {
					if (this.formData.email !== this.formData.repeatEmail) {
						return
					}
					this.processPaymentBooking(e)
				}}
			>
				<schmancy-grid gap="sm" class="w-full gap-2">
					<!-- Booking Summary -->
					<div class="bg-surface-low p-2 rounded-lg">
						<schmancy-typography type="body" weight="bold" class="mb-2">Booking Summary</schmancy-typography>

						<div class="flex justify-between w-full mb-1">
							<schmancy-typography type="body">Date:</schmancy-typography>
							<schmancy-typography type="body" weight="bold"
								>${dayjs(this.booking.date, 'YYYY-MM-DD').format('ddd, MMM D')}</schmancy-typography
							>
						</div>

						<div class="flex justify-between w-full mb-1">
							<schmancy-typography type="body">Time:</schmancy-typography>
							<schmancy-typography type="body" weight="bold"
								>${dayjs(this.booking.startTime).format('HH:mm')} -
								${dayjs(this.booking.endTime).format('HH:mm')}</schmancy-typography
							>
						</div>

						<div class="flex justify-between w-full mb-1">
							<schmancy-typography type="body">Duration:</schmancy-typography>
							<schmancy-typography type="body" weight="bold">${duration} ${durationIn}</schmancy-typography>
						</div>

						<div class="flex justify-between w-full mb-1">
							<schmancy-typography type="body">Court:</schmancy-typography>
							<schmancy-typography type="body" weight="bold"
								>${this.selectedCourt
									? this.selectedCourt.name || `#${this.selectedCourt.id}`
									: 'Auto-assigned'}</schmancy-typography
							>
						</div>
					</div>

					<!-- Contact Information -->
					<schmancy-grid gap="sm" class="grid-cols-1 sm:grid-cols-2 gap-2">
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
					</schmancy-grid>

					<!-- Payment Details -->
					<div class="mb-4">
						<schmancy-typography type="body" weight="bold" class="mb-2">Payment Details</schmancy-typography>

						<section class="relative block">
							<slot name="stripe-element"></slot>
						</section>
					</div>

					<!-- Terms & Submit Button -->

					<schmancy-grid class="mb-2" gap="sm" justify="end">
						<schmancy-grid cols="1fr" justify="end">
							<schmancy-typography type="label" class="col-span-1" align="left">
								<span>
									By clicking Pay you agree to

									<a
										class="text-sky-700 underline"
										href="javascript:void(0)"
										@click=${() => {
											sheet.open({
												component: new FunkhausSportsTermsAndConditions(),
											})
										}}
										>our terms and conditions</a
									>
								</span>
							</schmancy-typography>
							<schmancy-typography class="mb-0" type="label"> Includes: 7% VAT </schmancy-typography>
						</schmancy-grid>
						<schmancy-button class="h-[3rem] pb-2" type="submit" variant="filled">
							<schmancy-typography class="px-4" type="title" token="lg">
								Pay &euro;${this.booking.price.toFixed(2)}
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
							<schmancy-spinner class="h-12 w-12" size="48px"></schmancy-spinner>
						</schmancy-flex>
					</schmancy-busy>
				`,
			)}
		`
	}
}
