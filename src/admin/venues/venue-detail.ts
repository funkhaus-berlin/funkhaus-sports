import { area, fullHeight } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { takeUntil } from 'rxjs'
import { Court } from 'src/db/courts.collection'
import { Venue } from 'src/db/venue-collection'
import './components'
import { VenueCourtsPreview } from './components'
import { selectMyCourts } from './courts/context'
import { VenueManagement } from './venues'

@customElement('venue-detail-view')
export class VenueDetailView extends $LitElement(css`
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-in {
		animation: fadeIn 0.3s ease-out forwards;
	}

	.animate-in-delay-1 {
		animation: fadeIn 0.3s ease-out 0.1s forwards;
		opacity: 0;
	}

	.animate-in-delay-2 {
		animation: fadeIn 0.3s ease-out 0.2s forwards;
		opacity: 0;
	}

	.main-content {
		height: calc(100% - 1rem);
		display: grid;
		grid-template-rows: auto 1fr;
		gap: 1rem;
		overflow: hidden;
	}
`) {
	@property({ type: Object }) venue!: Venue
	@state() loading: boolean = true
	@state() error: string | null = null
	@state() courts!: Map<string, Court>
	@state() activeSection: string = 'overview'
	@state() fullScreen = false

	connectedCallback(): void {
		super.connectedCallback()
		this.dispatchEvent(new CustomEvent('fullscreen', { bubbles: true, composed: true, detail: true }))
		selectMyCourts.pipe(takeUntil(this.disconnecting)).subscribe(courts => {
			this.courts = courts
			this.loading = false
			this.requestUpdate()
		})
	}

	handleBackClick() {
		this.dispatchEvent(new CustomEvent('back-to-venues'))
	}

	render() {
		const courtsCount = this.courts?.size || 0
		const contentDrawerClasses = {
			'rounded-lg px-4 sm:px-6 md:px-8': this.fullScreen === false,
		}

		return html`
			<schmancy-nav-drawer .fullscreen=${this.fullScreen}>
				<schmancy-nav-drawer-navbar .hidden=${this.fullScreen} width="200px">
					<schmancy-grid class="h-full" rows="1fr auto">
						<!-- Back Button -->
						<schmancy-list>
							<!-- Courts Item -->
							<schmancy-list-item
								.selected=${this.activeSection === 'courts'}
								@click=${() =>
									area.push({
										component: VenueCourtsPreview,
										area: 'venue-content',
									})}
								rounded
								variant="container"
							>
								<schmancy-flex gap="md">
									<schmancy-icon>sports_tennis</schmancy-icon>
									Courts (${courtsCount})
								</schmancy-flex>
							</schmancy-list-item>

							<!-- Analytics Item -->
							<schmancy-list-item
								.selected=${this.activeSection === 'analytics'}
								@click=${() =>
									area.push({
										component: 'venue-overview',
										area: 'venue-content',
									})}
								rounded
								variant="container"
							>
								<schmancy-flex gap="md">
									<schmancy-icon>insights</schmancy-icon>
									Analytics
								</schmancy-flex>
							</schmancy-list-item>
						</schmancy-list>

						<schmancy-button
							@click=${() => {
								this.dispatchEvent(new CustomEvent('fullscreen', { bubbles: true, composed: true, detail: false }))
								area.push({
									component: VenueManagement,
									area: 'admin',
								})
							}}
							variant="filled tonal"
						>
							<schmancy-icon>arrow_back</schmancy-icon>
							Back
						</schmancy-button>
					</schmancy-grid>
				</schmancy-nav-drawer-navbar>

				<schmancy-nav-drawer-content class=${this.classMap(contentDrawerClasses)}>
					<schmancy-grid ${fullHeight()} rows="auto 1fr" class="pt-4">
						<!-- Top Bar with venue header info -->
						<venue-detail-header .courtsCount=${courtsCount} class="animate-in"></venue-detail-header>

						<!-- Content Area using schmancy-area -->
						<schmancy-area
							name="venue-content"
							class="animate-in-delay-1"
							.default=${VenueCourtsPreview}
						></schmancy-area>
					</schmancy-grid>
				</schmancy-nav-drawer-content>
			</schmancy-nav-drawer>
		`
	}
}
