import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'

@customElement('page-header-banner')
export class PageHeaderBanner extends $LitElement(css`
  
  :host{
    display:block;
    flex:1;
  }
  `) {
	// Required properties
	@property({ type: String }) title = ''
	@property({ type: String }) description = ''
	@property({ type: String }) imageSrc = ''

	// Optional properties with defaults
	@property({ type: Boolean }) gradientOverlay = true
	@property({ type: String }) gradientColor = 'rgba(0,0,0,0.7)'
	@property({ type: String }) maxWidth = '3xl'

	render() {
		const blurClass = false ? 'backdrop-blur-xs' : ''
		const maxWidthClass = `max-w-${this.maxWidth}`

		// Create gradient overlay style if enabled
		const gradientStyle = this.gradientOverlay
			? `background: linear-gradient(to bottom, transparent 0%, ${this.gradientColor} 100%);`
			: ''

		return html`
			<div class="w-full bg-surface-container text-surface-on relative inset-0 h-full">
				<img class="absolute inset-0 h-full w-lvw object-cover" src="${this.imageSrc}" alt="${this.title}" />

				${this.gradientOverlay ? html`<div class="absolute inset-0 w-full h-full" style="${gradientStyle}"></div>` : ''}

				<section
					class="text-white absolute inset-0 ${blurClass} flex flex-col items-start justify-end px-5 md:px-8 lg:px-[5%] pb-8 mt-[16px] sm:mt-0 pt-unset h-full"
				>
					<schmancy-typography type="display" > ${this.title} </schmancy-typography>
					<schmancy-typography type="body" maxLines="1"  class="${maxWidthClass}">
						${this.description}
					</schmancy-typography>
				
				</section>
     
          	<slot></slot>

			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'page-header-banner': PageHeaderBanner
	}
}
