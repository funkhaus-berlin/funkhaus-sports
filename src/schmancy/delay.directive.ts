import { directive, Directive, DirectiveParameters, PartInfo } from 'lit/directive.js'
import { fromEvent, timer } from 'rxjs'
import { switchMap } from 'rxjs/operators'

class DelayDirective extends Directive {
	element!: HTMLElement

	constructor(partInfo: PartInfo) {
		super(partInfo)
	}

	render(_delay?: number) {
		return ''
	}

	update(part: any, [delay]: DirectiveParameters<this>) {
		this.element = part.element as HTMLElement

		// Set initial visibility to hidden
		this.element.style.visibility = 'hidden'

		// Delay the visibility change by the specified delay
		timer(delay ?? 0)
			.pipe(
				switchMap(() => {
					this.element.style.visibility = 'visible'
					return fromEvent(this.element, 'transitionend')
				}),
			)
			.subscribe()

		return this.render(delay)
	}
}

export const delay = directive(DelayDirective)
