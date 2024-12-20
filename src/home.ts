import { $LitElement } from '@mhmo91/lit-mixins/src'
import { fullHeight } from '@mhmo91/schmancy'
import { html } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('app-home')
export default class Home extends $LitElement() {
	render() {
		return html`
			<section class="flex flex-col justify-center items-center gap-4" ${fullHeight()}>
				<schmancy-typography align="center" type="headline" token="lg">
					Lit + Tailwind + Rxjs + Schmancy UI
				</schmancy-typography>
				<schmancy-typography type="body" token="lg">
					<schmancy-animated-text> This is a simple home page </schmancy-animated-text>
				</schmancy-typography>
			</section>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'app-home': Home
	}
}
