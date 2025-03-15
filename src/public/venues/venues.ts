// src/public/venues/venue-landing.ts
import { area, fullHeight, select } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { when } from 'lit/directives/when.js'
import { venuesContext } from 'src/admin/venues/venue-context'
import { Venue } from 'src/db/venue-collection'
import { CourtBookingSystem } from 'src/public/book/book'
import './venue.card'

// Define golden ratio constant
const GOLDEN_RATIO = 1.618

@customElement('venue-landing-page')
export class VenueLandingPage extends $LitElement() {
	@select(venuesContext)
	venues!: Map<string, Venue>

	@state() loading: boolean = true
	@state() error: string | null = null

	@query('.logo-section') logoSection!: HTMLElement
	@query('.cards-container') cardsContainer!: HTMLElement

	// Animation configurations with golden ratio timing
	private logoAnimation: {
		keyframes: Keyframe[]
		options: AnimationEffectTiming
	} = {
		keyframes: [
			{ opacity: 0, transform: 'translateY(-20px)' },
			{ opacity: 1, transform: 'translateY(0)' },
		],
		options: {
			duration: Math.round(1000 * GOLDEN_RATIO), // ~1618ms
			easing: 'cubic-bezier(0.618, 0, 0.382, 1)', // Golden ratio based easing
			fill: 'forwards',
		},
	}

	private cardAnimation = {
		keyframes: [
			{ opacity: 0, transform: 'translateY(20px)' },
			{ opacity: 1, transform: 'translateY(0)' },
		],
		options: {
			duration: Math.round(500 * GOLDEN_RATIO), // ~809ms
			easing: 'cubic-bezier(0.618, 0, 0.382, 1)', // Golden ratio based easing
			fill: 'forwards',
		},
	}

	// Lifecycle callbacks
	firstUpdated() {
		this.animateLogo()

		// Simulate data loading (remove this in production)
		setTimeout(() => {
			this.loading = false
			this.requestUpdate()

			// Animate venue cards after data is loaded
			requestAnimationFrame(() => {
				this.animateCards()
			})
		}, 1500)
	}

	updated(changedProps: Map<string, any>) {
		// If loading state changes to false, animate cards
		if (changedProps.has('loading') && !this.loading) {
			requestAnimationFrame(() => {
				this.animateCards()
			})
		}
	}

	// Animation methods
	private animateLogo() {
		if (this.logoSection) {
			this.logoSection.animate(this.logoAnimation.keyframes, this.logoAnimation.options)
		}
	}

	private animateCards() {
		if (!this.cardsContainer) return

		const cards = Array.from(this.cardsContainer.querySelectorAll('funkhaus-venue-card'))

		cards.forEach((card, index) => {
			// Make sure card is initially invisible
			card.style.opacity = '0'
			card.style.transform = 'translateY(20px)'

			// Apply golden ratio to animation timing
			const baseDelay = 100
			const options = {
				...this.cardAnimation.options,
				delay: Math.round(index * baseDelay * GOLDEN_RATIO), // Golden ratio applied to stagger
				fill: 'forwards' as FillMode,
			}

			card.animate(this.cardAnimation.keyframes, options as AnimationEffectTiming)

			// Update final state to visible
			card.style.opacity = '1'
			card.style.transform = 'translateY(0)'
		})
	}

	// Handle venue card click to navigate to booking
	private handleVenueClick(venue: Venue) {
		console.log(`Booking for venue: ${venue.name}`)

		// Navigate to the booking component
		area.push({
			component: CourtBookingSystem,
			area: 'main',
			state: { venueId: venue.id },
		})
	}

	render() {
		// Calculate golden ratio based dimensions
		const logoSize = Math.round(24 * GOLDEN_RATIO * 2) // ~78px
		const sectionSpacing = Math.round(16 * GOLDEN_RATIO * 2) // ~52px
		const cardGap = Math.round(6 * GOLDEN_RATIO) // ~10px
		const loadingHeight = Math.round(48 * GOLDEN_RATIO) // ~78px
		const spinnerSize = Math.round(32 * GOLDEN_RATIO) // ~52px

		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all" elevation="0">
				<div class="max-w-sm mx-auto px-6 py-12 ">
					<!-- Logo Section with golden ratio spacing -->
					<div class="logo-section text-center mb-16" style="margin-bottom: ${sectionSpacing}px">
						<object
							type="image/svg+xml"
							data="/logo.svg"
							class="mx-auto mb-6"
							style="width: ${logoSize}px; height: ${logoSize}px;"
						></object>
						<div class="inline-block">
							<schmancy-typography type="display" token="sm" class="mb-4">
								<schmancy-animated-text>Funkhaus Sports</schmancy-animated-text>
							</schmancy-typography>
						</div>
					</div>

					<!-- Content Section with Loading State -->
					${when(
						this.loading,
						() => html`
							<div class="flex justify-center items-center" style="height: ${loadingHeight}px">
								<schmancy-spinner style="width: ${spinnerSize}px; height: ${spinnerSize}px"></schmancy-spinner>
							</div>
						`,
						() => html`
							<div class="cards-container mx-auto" style="max-width: ${Math.round(384 * GOLDEN_RATIO)}px;">
								<div class="grid gap-8" style="gap: ${cardGap * 2}px">
									${repeat(
										Array.from(this.venues.values()),
										venue => venue.id,
										venue => {
											// Calculate aspect ratio based on golden ratio
											const aspectRatio = (1 / GOLDEN_RATIO) * 100

											return html`
												<div
													class="venue-card-wrapper relative w-full max-w-sm mx-auto"
													style="padding-bottom: ${aspectRatio}%; transition: transform 0.3s ease-in-out;"
												>
													<funkhaus-venue-card
														.venue=${venue}
														@click=${() => this.handleVenueClick(venue)}
														class=" absolute inset-0 w-full h-full transform transition-transform duration-300 hover:-translate-y-1"
													>
														<slot slot="stripe-element" name="stripe-element"></slot>
													</funkhaus-venue-card>
												</div>
											`
										},
									)}
								</div>
							</div>
						`,
					)}
				</div>
			</schmancy-surface>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'venue-landing-page': VenueLandingPage
	}
}
