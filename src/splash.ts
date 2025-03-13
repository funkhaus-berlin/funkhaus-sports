import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { fromEvent, timer, zip } from 'rxjs'
import { switchMap, tap } from 'rxjs/operators'
import img from '/logo.png?inline' // replace with your actual logo path

@customElement('samwa-splash-screen')
export default class SamwaSplashScreen extends $LitElement() {
	@state() showLogo: boolean = true
	@state() showMainContent: boolean = false
	@state() logoExpanding: boolean = false
	@state() logoExpanded: boolean = false
	connectedCallback() {
		super.connectedCallback()

		// Logo display for 1 second, then expand for 2 seconds, then show main content
		timer(0)
			.pipe(
				tap(() => {
					this.showLogo = true
				}),
				switchMap(() =>
					timer(0).pipe(
						tap(() => {
							this.logoExpanding = true
						}),
					),
				),
				switchMap(() =>
					zip(
						fromEvent(this, 'ready').pipe(
							tap(() => {
								console.log('Ready event received')
							}),
						),
						timer(300).pipe(
							tap(() => {
								this.logoExpanded = true
							}),
						),
					).pipe(
						tap(() => {
							this.showLogo = false
						}),
					),
				),
				switchMap(() =>
					timer(0).pipe(
						tap(() => {
							this.showMainContent = true
						}),
					),
				),
			)
			.subscribe(() => this.requestUpdate())
	}

	// ...
	render() {
		return html`
			<!-- Logo Display -->
			<div
				class="fixed inset-0 flex items-center justify-center bg-white z-50"
				style=${styleMap({
					opacity: this.showLogo ? '1' : '0',
					transition: 'opacity 0.3s ease-out',
				})}
				.hidden=${this.showMainContent}
			>
				<div
					class="relative mx-auto flex flex-col items-center justify-center"
					style=${styleMap({
						width: this.logoExpanding ? '400px' : '160px',
						height: this.logoExpanding ? '400px' : '160px',
						transition: 'width 0.3s ea	se-in-out, height 0.3s ease-in-out',
					})}
				>
					<img
						class=${this.classMap({
							'object-contain w-1/3 h-1/3': true,
							'animate-pulse': this.logoExpanded,
						})}
						src="${img}"
						alt="Logo"
					/>
				</div>
			</div>

			<!-- Main Content Display -->
			<div
				class="w-full"
				style=${styleMap({
					opacity: this.showMainContent ? '1' : '0',
					transition: 'opacity 0.2s ease-in-out',
					pointerEvents: this.showMainContent ? 'auto' : 'none',
				})}
			>
				<slot></slot>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'samwa-splash-screen': SamwaSplashScreen
	}
}
