import {
	$notify,
	HISTORY_STRATEGY,
	SchmancyInputChangeEvent,
	SchmancySheetPosition,
	SchmancyTheme,
	area,
	color,
	sheet,
} from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { StripeElements } from '@stripe/stripe-js'
import dayjs from 'dayjs'
import { signInAnonymously } from 'firebase/auth'
import { css, html } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import moment from 'moment'
import { Subject, catchError, from, map, retry, startWith, switchMap, timer } from 'rxjs'
import { auth } from 'src/firebase/firebase'
import { FunkhausTermsAndConditions } from './book/terms-and-conditions'
import { BookingFormData } from './interface'
import stripe, { $stripe, $stripeElements, createPaymentIntent } from './stripe'

// Type for booking item data
export interface BookingItem {
	id: string
	title: string
	price: number
	available: boolean
	maxQuantity?: number
}

// Interface for booking event data
export interface BookingEvent {
	id: string
	title: string
	subtitle?: string
	date: {
		start: number // Unix timestamp
		end: number // Unix timestamp
	}
	items: Record<string, BookingItem>
}

export const $bookingForm = new Subject<BookingFormData>()

@customElement('generic-booking-form')
export default class GenericBookingForm extends $LitElement(css`
	:host {
		display: block;
		position: relative;
		inset-block-start: 0;
		inset-inline-start: 0;
		inset-block-end: 0;
		inset-inline-end: 0;
		overflow: hidden;
	}
`) {
	@property({ type: Object }) bookingEvent: BookingEvent = {
		id: '1',
		title: 'Event Title',
		subtitle: 'Event Subtitle',
		date: {
			start: 1620000000,
			end: 1620000000,
		},
		items: {
			'1': {
				id: '1',
				title: 'Item 1',
				price: 100,
				available: true,
			},
		},
	}
	@property({ type: String }) eventID!: string
	@property({ type: String }) clientSecret!: string

	@state() formData = new BookingFormData()
	@state() quantity: number = 1

	@state() freeBooking: boolean = false
	@state() loading: boolean = false
	@state() processing: boolean = false
	@property({ type: Boolean }) validationPaymentResponse!: boolean

	@query('#timer') timer!: HTMLDivElement
	@state() validate = false

	async connectedCallback() {
		super.connectedCallback()

		$stripe.next(this.total)
		$stripeElements.subscribe(() => {
			if ($stripeElements.value) {
				this.loading = false
			} else {
				this.loading = true
			}
		})

		// Check payment status if returning from payment flow
		// this.checkPaymentStatus()
	}

	// Calculate the total price
	get total() {
		return this.selectedItem.price * this.quantity
	}

	// Get the selected booking item
	get selectedItem(): BookingItem {
		// Find first available item or default to first item
		const items = this.bookingEvent.items

		// Sort items by price (lowest first)
		const sortedItems = Object.keys(items)
			.sort((a, b) => items[a].price - items[b].price)
			.map(key => ({ ...items[key] }))

		// Find first available item
		const availableItem = sortedItems.find(item => item.available)

		return availableItem || sortedItems[0]
	}

	// Increase booking quantity
	increaseQuantity() {
		const maxQuantity = this.selectedItem.maxQuantity || 10
		if (this.quantity >= maxQuantity || this.loading) return

		this.quantity = this.quantity + 1
		$stripe.next(this.total)
	}

	// Render the form
	protected render(): unknown {
		if (!this.bookingEvent) return html`<div>Loading booking details...</div>`

		return html`
			<schmancy-form
				class="flex flex-wrap"
				.hidden=${this.validationPaymentResponse}
				@submit=${(e: SubmitEvent) => {
					if (this.formData.email !== this.formData.repeatEmail) {
						return
					}
					this.processPaymentBooking(e)
				}}
			>
				<schmancy-grid class="pt-2 sm:pt-3 md:pt-5 pb-8" gap="md">
					<!-- Booking Info Box -->
					<schmancy-scroll class="inset-x-2 sm:inset-x-3 md:inset-x-5 pb-8" hide>
						<schmancy-chips wrap="nowrap">
							${repeat(
								Array.from({ length: 14 }, (_, i) => {
									const date = dayjs().add(i, 'days')
									const day = date.format('ddd DD MMM')
									return day
								}),
								a => a,
								(a, i) => html`
									<schmancy-chip
										.value=${a}
										.selected=${i === 0}
										label=${a}
										@click=${() => {
											// Update selected date
											const date = dayjs().add(i, 'days')
										}}
									>
										${a}
									</schmancy-chip>
								`,
							)}
						</schmancy-chips>
					</schmancy-scroll>
				</schmancy-grid>
				<schmancy-grid class="px-2 py-4 md:px-6 lg:px-8 xl:px-12" gap="sm" justify="stretch">
					<schmancy-surface rounded="all" class="w-full" type="container">
						<schmancy-grid gap="sm" class="w-full px-2 py-2" align="center" content="center" cols="1fr auto">
							<schmancy-typography align="left" class="col-span-1" type="headline">
								${this.bookingEvent.title}
							</schmancy-typography>

							<!-- Quantity Controls -->
							<schmancy-grid align="center" cols="1fr">
								<schmancy-flex justify="end" align="center" gap="sm">
									<schmancy-icon-button
										size="sm"
										.disabled=${this.quantity <= 1 || this.loading}
										@click=${() => {
											if (this.quantity <= 1 || this.loading) return
											this.quantity = this.quantity - 1
											$stripe.next(this.total)
										}}
										variant="filled"
									>
										remove
									</schmancy-icon-button>

									<schmancy-typography class="px-1" align="center" type="headline" token="lg">
										${this.quantity}
									</schmancy-typography>

									<schmancy-icon-button
										size="sm"
										.disabled=${this.loading || this.quantity >= (this.selectedItem.maxQuantity || 5)}
										@click=${this.increaseQuantity}
										variant="filled"
									>
										add
									</schmancy-icon-button>
								</schmancy-flex>
							</schmancy-grid>

							<!-- Date/Time -->
							<schmancy-flex class="relative" align="center" gap="sm">
								<schmancy-typography class="z-10 hidden min-[400px]:block" weight="bold" type="title" token="sm">
									Date:
								</schmancy-typography>

								<schmancy-typography class="z-10" type="title" token="sm">
									${moment.unix(this.bookingEvent.date.start).format('DD MMM HH:mm')} -
									${moment.unix(this.bookingEvent.date.end).format('HH:mm')}
								</schmancy-typography>
							</schmancy-flex>

							<!-- Price -->
							<schmancy-flex justify="center" gap="sm">
								<schmancy-typography type="title" token="sm"> Price: </schmancy-typography>
								<schmancy-flex align="center">
									<schmancy-typography .hidden=${this.freeBooking} transform="uppercase" type="title" token="md">
										&euro;${this.selectedItem.price.toFixed(2)}
									</schmancy-typography>
									<schmancy-typography .hidden=${!this.freeBooking} transform="uppercase" type="title" token="md">
										Free
									</schmancy-typography>
								</schmancy-flex>
							</schmancy-flex>
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
							@change=${(e: SchmancyInputChangeEvent) => {
								this.formData.name = e.detail.value
								$bookingForm.next(this.formData)
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'tel'}
							.value=${this.formData.phoneNumber}
							required
							type="text"
							class="w-full"
							placeholder="Phone Number"
							@change=${(e: SchmancyInputChangeEvent) => {
								this.formData.phoneNumber = e.detail.value
								$bookingForm.next(this.formData)
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
							@change=${(e: SchmancyInputChangeEvent) => {
								this.formData.address = e.detail.value
								$bookingForm.next(this.formData)
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'postal-code'}
							.value=${this.formData.postalCode}
							required
							type="text"
							placeholder="Postal Code"
							@change=${(e: SchmancyInputChangeEvent) => {
								this.formData.postalCode = e.detail.value
								$bookingForm.next(this.formData)
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'address-level2'}
							.value=${this.formData.city}
							required
							type="text"
							placeholder="City"
							@change=${(e: SchmancyInputChangeEvent) => {
								this.formData.city = e.detail.value
								$bookingForm.next(this.formData)
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'country-name'}
							.value=${this.formData.country}
							required
							type="text"
							placeholder="Country"
							@change=${(e: SchmancyInputChangeEvent) => {
								this.formData.country = e.detail.value
								$bookingForm.next(this.formData)
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
							@change=${(e: SchmancyInputChangeEvent) => {
								this.formData.email = e.detail.value
								$bookingForm.next(this.formData)
							}}
						></schmancy-input>

						<schmancy-input
							.autocomplete=${'email'}
							.value=${this.formData.repeatEmail}
							required
							type="email"
							placeholder="Confirm Email"
							@change=${(e: SchmancyInputChangeEvent) => {
								this.formData.repeatEmail = e.detail.value
								$bookingForm.next(this.formData)
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
								<schmancy-typography
									${color({
										color: SchmancyTheme.sys.color.error.default,
									})}
									class="col-span-2"
									type="label"
									token="sm"
								>
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
					<schmancy-grid
						.rcols=${{
							sm: '1fr',
							md: '1fr 1fr',
						}}
						.hidden=${this.loading}
						align="start"
						justify="end"
					>
						<span></span>

						<schmancy-grid class="mb-2" gap="sm" justify="end">
							<schmancy-grid cols="1fr" justify="end">
								<schmancy-typography type="label" class="col-span-1" align="left">
									<span>
										By clicking ${this.freeBooking ? 'Book for free' : 'Pay'} you agree to
										<a
											class="text-sky-700 underline"
											href="javascript:void(0)"
											@click=${() => {
												sheet.open({
													component: new FunkhausTermsAndConditions(),
													position: SchmancySheetPosition.Bottom,
												})
											}}
											>our terms and conditions</a
										>
									</span>
								</schmancy-typography>

								<schmancy-typography .hidden=${this.freeBooking} class="mb-0" type="label">
									Price includes applicable taxes
								</schmancy-typography>
							</schmancy-grid>

							<schmancy-button class="h-[3rem] pb-2" type="submit" variant="filled">
								<schmancy-typography .hidden=${this.freeBooking} class="px-4" type="title" token="lg">
									Pay &euro;${this.total.toFixed(2)}
								</schmancy-typography>

								<schmancy-typography .hidden=${!this.freeBooking} class="px-4" type="title" token="lg">
									Book for free
								</schmancy-typography>
							</schmancy-button>
						</schmancy-grid>
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

	// Process a paid booking
	async processPaymentBooking(e: Event) {
		e.preventDefault()

		const elements = $stripeElements.value as StripeElements

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
		const itemId = this.selectedItem.id

		// Process payment with anonymous auth
		from(signInAnonymously(auth))
			.pipe(
				map(userCredential => {
					const user = userCredential.user
					return user
				}),
			)
			.pipe(
				map(user => user.uid),
				switchMap(uid =>
					createPaymentIntent({
						amount: this.total,
						email: this.formData.email,
						name: this.formData.name,
						items: {
							[itemId]: this.quantity,
						},
						eventID: this.eventID,
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

	// Check payment status for returning from Stripe
	checkPaymentStatus() {
		const clientSecret = new URLSearchParams(window.location.search).get('payment_intent_client_secret')

		if (!clientSecret) {
			this.onValidationChange(false)
			timer(1000).subscribe(() => {
				$notify.success('Your booking session is active for 8 minutes', {
					duration: 2000,
				})
			})
			return
		}

		if (!stripe) {
			this.onValidationChange(true)
			return
		}

		this.onValidationChange(true)

		// Check payment status
		const check = new Subject<number>()
		check
			.pipe(
				startWith(0),
				switchMap(() => from(stripe.retrievePaymentIntent(clientSecret))),
			)
			.subscribe({
				next: ({ paymentIntent }) => {
					switch (paymentIntent?.status) {
						case 'succeeded':
							localStorage.setItem('payment_id', paymentIntent.id)
							area.push({
								component: 'booking-success',
								area: 'main',
								historyStrategy: HISTORY_STRATEGY.replace,
							})
							break
						case 'processing':
							this.onValidationChange(true)
							check.next(0)
							break
						case 'requires_payment_method':
							$notify.error('Payment failed, please try again.')
							this.onValidationChange(false)
							break
					}
				},
			})
	}

	// Update validation state
	onValidationChange(value: boolean) {
		this.validationPaymentResponse = value
		this.processing = value
		this.dispatchEvent(new CustomEvent('validation-change', { detail: value }))
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'generic-booking-form': GenericBookingForm
	}
}
