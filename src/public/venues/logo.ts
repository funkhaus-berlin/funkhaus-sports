import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import logoLight from '/logo-light.svg?inline'
import logoDark from '/logo.svg?inline' // Make sure you have this file
import { fromEvent } from 'rxjs'

@customElement('funkhaus-logo')
export default class Logo extends $LitElement(css`
	:host {
		display: block;
	}
`) {
	@property({ type: String }) width = '24px'
	@property({ type: Boolean }) dark = false

	connectedCallback(): void {
		super.connectedCallback()
    //  setup dark mode listener using rxjs
  // media query for dark mode
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    // Listen for changes in the dark mode preference
    fromEvent(darkModeMediaQuery, 'change').subscribe((event: any) => {
      this.dark = event.matches // Update the dark property based on the media query
    }
    )
	}

	render() {
		const style = {
			width: this.width,
		}

		// Use the appropriate logo based on dark property
		const logoSrc = this.dark ? logoDark : logoLight

		return html` <img style="${this.styleMap(style)}" alt="Funkhaus Logo" .src=${logoSrc} /> `
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-logo': Logo
	}
}
