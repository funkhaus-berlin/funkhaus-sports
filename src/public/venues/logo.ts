import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import logoLight from '/logo-light.svg?inline'
import logoDark from '/logo.svg?inline'; // Make sure you have this file

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
	}

	render() {
		const style = {
			width: this.width,
		}

		// Use the appropriate logo based on dark property
		const logoSrc = this.dark ? logoLight : logoDark

		return html` <img style="${this.styleMap(style)}" alt="Funkhaus Logo" .src=${logoSrc} /> `
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-logo': Logo
	}
}
