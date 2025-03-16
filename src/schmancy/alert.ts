// dialog.ts
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { css, html, nothing } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import { fromEvent, map, NEVER, of, race, timer } from 'rxjs'
import { switchMap, takeUntil, tap } from 'rxjs/operators'
import { delay } from './delay.directive'
export enum StorageType {
	Session = 'session',
	Local = 'local',
}
@customElement('schmancy-alert')
export class SchmancyDialog extends $LitElement(css`
	#confirm {
		position: fixed;
		inset: 0;
		z-index: 100000;
		overflow: hidden;
	}
`) {
	@property({ type: Number }) timeout?: number
	@query('slot[name="backdrop"]') backdropSlot!: HTMLSlotElement
	@query('#confirm') confirmSlot!: HTMLSlotElement

	@property({ type: Object }) when!: {
		min: number
		key: string
		storage: StorageType
	}

	connectedCallback(): void {
		super.connectedCallback()
		if (!this.when) {
			throw new Error('The "when" property is required')
		}
	}

	firstUpdated() {
		race(
			fromEvent(this, 'click'),
			this.timeout ? timer(this.timeout) : NEVER,
			of(this.when).pipe(
				map(() => {
					if (this.count >= this.when.min) {
						return true
					}
					return false
				}),
				switchMap(yes => (yes ? of(true) : NEVER)),
			),
		)
			.pipe(
				takeUntil(this.disconnecting),
				tap({
					next: () => {
						// Store the confirmation in the session storage
						if (this.count < this.when.min) {
							if (this.when.storage === 'session') {
								sessionStorage.setItem(this.when.key, (this.count + 1).toString())
							} else {
								localStorage.setItem(this.when.key, (this.count + 1).toString())
							}
						}
					},
				}),
			)
			.subscribe({
				next: () => {
					this.confirmSlot.remove()
				},
			})
	}
	get count() {
		if (this.when.storage === 'session') {
			return parseInt(sessionStorage.getItem(this.when.key) ?? '0')
		}
		return parseInt(localStorage.getItem(this.when.key) ?? '0')
	}

	get ifFinito() {
		let finito = false
		if (this.when.storage === 'session') {
			sessionStorage.getItem(this.when.key) === '0' ? (finito = true) : (finito = false)
		} else {
			localStorage.getItem(this.when.key) === '0' ? (finito = true) : (finito = false)
		}
		return finito
	}

	render() {
		return html`
			<slot ${this.ifFinito ? nothing : delay(300)}></slot>

			<div id="confirm">
				<slot name="backdrop">
					<div
						class="absolute inset-0 z-0 border rounded-lg shadow-lg bg-slate-500/20 backdrop-blur-md bg-opacity-50 border-white/30"
					></div>
				</slot>
				<slot name="confirm"></slot>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'schmancy-alert': SchmancyDialog
	}
}
