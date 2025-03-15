import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
// import { $newSchmancyTheme } from '@mhmo91/schmancy'
import { css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
// import { takeUntil, tap } from 'rxjs'
import logoLight from '/logo-light.svg?inline'
@customElement('funkhaus-logo')
export default class Logo extends $LitElement(css`
	:host {
		display: block;
	}
`) {
	@property({ type: String }) width = '24px'
	connectedCallback(): void {
		super.connectedCallback()
	}

	render() {
		const style = {
			width: this.width,
		}
		return html` <img style="${this.styleMap(style)}" alt="Funkhaus Logo" .src=${logoLight} /> `
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'funkhaus-logo': Logo
	}
}
