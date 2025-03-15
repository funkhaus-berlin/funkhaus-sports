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
@customElement('venue-landing-page')
export class VenueLandingPage extends $LitElement() {
	@select(venuesContext)
	venues!: Map<string, Venue>

	@state() loading: boolean = true
	@state() error: string | null = null

	@query('.logo-section') logoSection!: HTMLElement
	@query('.venue-cards-container') cardsContainer!: HTMLElement

	// Animation configurations
	private logoAnimation: {
		keyframes: Keyframe[]
		options: AnimationEffectTiming
	} = {
		keyframes: [
			{ opacity: 0, transform: 'translateY(-20px)' },
			{ opacity: 1, transform: 'translateY(0)' },
		],
		options: {
			duration: 1200,
			easing: 'ease-out',
			fill: 'forwards',
		},
	}

	private cardAnimation = {
		keyframes: [
			{ opacity: 0, transform: 'translateY(20px)' },
			{ opacity: 1, transform: 'translateY(0)' },
		],
		options: {
			duration: 800,
			easing: 'ease-out',
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

			const options = {
				...this.cardAnimation.options,
				delay: index * 150, // Increased stagger for more visual appeal
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
		return html`
			<schmancy-surface ${fullHeight()} type="container" rounded="all" elevation="0">
				<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
					<!-- Logo Section -->
					<div class="logo-section text-center mb-16 ">
						<object type="image/svg+xml" data="/logo.svg" class="w-24 h-24 mb-4 mx-auto"></object>
						<div class="inline-block">
							<schmancy-typography type="headline" token="lg" class="mb-2">
								<schmancy-animated-text> Funkhaus Sports </schmancy-animated-text>
							</schmancy-typography>
						</div>
					</div>

					<!-- Content Section with Loading State -->
					${when(
						this.loading,
						() => html`
							<div class="flex justify-center items-center h-64">
								<schmancy-spinner size="48px"></schmancy-spinner>
							</div>
						`,
						() => html`
							<div class=" mx-auto max-w-sm justify-center grid items-center gap-8">
								${repeat(
									Array.from(this.venues.values()),
									venue => venue.id,
									venue => {
										return html`
											<funkhaus-venue-card
												.venue=${venue}
												@click=${() => this.handleVenueClick(venue)}
												style="transition: transform 0.3s ease, opacity 0.3s ease;"
											></funkhaus-venue-card>
										`
									},
								)}
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
