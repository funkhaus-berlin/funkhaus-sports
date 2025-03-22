import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('sch-busy')
export default class SchmancyBusyV2 extends $LitElement() {
	protected render(): unknown {
		return html`<div
			class="absolute inset-0 z-50 bg-opacity-70 backdrop-blur-sm duration-300 transition-opacity flex items-center justify-center "
		>
			<schmancy-flex class="px-4" justify="center" flow="row" gap="md" align="center">
				<schmancy-spinner class="h-12 w-12" size="48px"></schmancy-spinner>
			</schmancy-flex>
		</div>`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'sch-busy': SchmancyBusyV2
	}
}
