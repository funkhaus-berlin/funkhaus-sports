import { customElement } from 'lit/decorators.js'
import { $LitElement } from '@mhmo91/lit-mixins/src'
import { html } from 'lit'

@customElement('app-landing')
export default class AppLanding extends $LitElement() {
	render() {
		return html`
			<div class="flex flex-col items-center justify-center h-full mt-3">
				<h1 class="text-6xl font-bold">Welcome to Schmancy</h1>
				<p class="text-2xl"></p>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'app-landing': AppLanding
	}
}
