import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { 
  BehaviorSubject, 
  Subject, 
  from, 
  of, 
  EMPTY,
  combineLatest
} from 'rxjs'
import { 
  switchMap, 
  tap, 
  catchError, 
  takeUntil, 
  filter,
  distinctUntilChanged,
  debounceTime,
  finalize,
  map
} from 'rxjs/operators'
import { loadStripe, Stripe, StripeElements, Appearance } from '@stripe/stripe-js'
import { when } from 'lit/directives/when.js'

export interface StripePaymentConfig {
  publishableKey: string
  appearance?: Appearance
  fonts?: Array<{ cssSrc: string }>
  locale?: string
}

export interface PaymentIntentConfig {
  amount: number
  currency: string
  metadata?: Record<string, string>
  customer?: {
    email?: string
    name?: string
    phone?: string
  }
}

/**
 * A reusable Stripe payment component that uses the teleportation pattern.
 * Encapsulates all Stripe functionality and can be used in any project.
 * 
 * @element schmancy-stripe-payment
 * 
 * @fires ready - Fired when Stripe is loaded and elements are created
 * @fires change - Fired when payment element state changes
 * @fires error - Fired when an error occurs
 * @fires processing - Fired when payment processing state changes
 * @fires success - Fired when payment succeeds
 */
@customElement('schmancy-stripe-payment')
export class SchmancyStripePayment extends $LitElement() {
  @property({ type: Object })
  config: StripePaymentConfig = {
    publishableKey: ''
  }

  @property({ type: Object })
  paymentIntent?: PaymentIntentConfig

  @property({ type: String })
  clientSecret?: string

  @property({ type: String })
  returnUrl = window.location.origin

  @property({ type: String })
  elementId = `stripe-payment-${Math.random().toString(36).slice(2, 9)}`

  @property({ type: Boolean })
  autoMount = true

  @state()
  private processing = false

  @state()
  private error?: string

  // Stripe instances
  private stripe$ = new BehaviorSubject<Stripe | null>(null)
  private elements$ = new BehaviorSubject<StripeElements | null>(null)
  private paymentElement: any = null
  
  // Lifecycle subjects
  private destroy$ = new Subject<void>()
  private configChange$ = new Subject<StripePaymentConfig>()
  
  // DOM element for teleportation
  private targetElement: HTMLElement | null = null

  connectedCallback() {
    super.connectedCallback()
    
    // Initialize Stripe when config changes
    this.configChange$.pipe(
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      filter(config => !!config.publishableKey),
      tap(() => this.processing = true),
      switchMap(config => 
        from(loadStripe(config.publishableKey, { locale: config.locale as any })).pipe(
          filter((stripe): stripe is Stripe => stripe !== null),
          tap(stripe => {
            this.stripe$.next(stripe)
            this.createStripeElements(stripe)
          }),
          catchError(err => {
            this.error = err.message || 'Failed to load Stripe'
            this.dispatchEvent(new CustomEvent('error', {
              detail: { error: err },
              bubbles: true,
              composed: true
            }))
            return EMPTY
          })
        )
      ),
      finalize(() => this.processing = false),
      takeUntil(this.destroy$)
    ).subscribe()

    // Auto-mount when both Stripe and target element are ready
    combineLatest([
      this.stripe$.pipe(filter(s => s !== null)),
      this.elements$.pipe(filter(e => e !== null))
    ]).pipe(
      debounceTime(100),
      filter(() => this.autoMount && !!this.targetElement),
      tap(() => this.mountStripePaymentElement()),
      takeUntil(this.destroy$)
    ).subscribe()

    // Emit config on connect
    if (this.config.publishableKey) {
      this.configChange$.next(this.config)
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    
    // Cleanup
    if (this.paymentElement) {
      this.paymentElement.destroy()
      this.paymentElement = null
    }
    
    this.elements$.next(null)
    
    if (this.targetElement && this.targetElement.parentNode === document.body) {
      document.body.removeChild(this.targetElement)
      this.targetElement = null
    }
    
    this.destroy$.next()
    this.destroy$.complete()
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties)
    
    if (changedProperties.has('config') && this.config.publishableKey) {
      this.configChange$.next(this.config)
    }

    if (changedProperties.has('paymentIntent') && this.paymentIntent) {
      const elements = this.elements$.value
      if (elements) {
        elements.update({
          amount: this.paymentIntent.amount,
          currency: this.paymentIntent.currency
        })
      }
    }
  }

  firstUpdated() {
    // Create target element for teleportation
    of(document.getElementById(this.elementId)).pipe(
      tap(existingElement => {
        if (!existingElement) {
          this.targetElement = document.createElement('div')
          this.targetElement.id = this.elementId
          this.targetElement.className = 'w-full min-h-[200px] relative'
          document.body.appendChild(this.targetElement)
        } else {
          this.targetElement = existingElement
        }
      }),
      map(() => this.shadowRoot?.querySelector('slot[name="stripe-container"]') as HTMLSlotElement),
      filter(slot => !!slot),
      tap(slot => {
        const slottedElements = slot.assignedElements()
        if (slottedElements.length > 0 && this.targetElement) {
          slottedElements[0].appendChild(this.targetElement)
        }
      })
    ).subscribe()
  }

  /**
   * Confirm the payment using the current payment element
   */
  confirmPayment(options?: { redirect?: 'always' | 'if_required' }) {
    const stripe = this.stripe$.value
    const elements = this.elements$.value

    if (!stripe || !elements || !this.clientSecret) {
      return of({ error: { message: 'Stripe not initialized or missing client secret' } })
    }

    return of(null).pipe(
      tap(() => {
        this.processing = true
        this.dispatchEvent(new CustomEvent('processing', {
          detail: { processing: true },
          bubbles: true,
          composed: true
        }))
      }),
      switchMap(() => 
        from(stripe.confirmPayment({
          elements,
          clientSecret: this.clientSecret!,
          confirmParams: {
            return_url: this.returnUrl,
            payment_method_data: {
              billing_details: {
                name: this.paymentIntent?.customer?.name,
                email: this.paymentIntent?.customer?.email,
                phone: this.paymentIntent?.customer?.phone
              }
            }
          },
          redirect: options?.redirect || 'if_required'
        } as any))
      ),
      tap((result: any) => {
        if ('error' in result && result.error) {
          this.error = result.error.message
          this.dispatchEvent(new CustomEvent('error', {
            detail: { error: new Error(result.error.message) },
            bubbles: true,
            composed: true
          }))
        } else if ('paymentIntent' in result && result.paymentIntent) {
          this.dispatchEvent(new CustomEvent('success', {
            detail: { paymentIntent: result.paymentIntent },
            bubbles: true,
            composed: true
          }))
        }
      }),
      catchError(err => {
        this.error = err.message || 'Payment failed'
        this.dispatchEvent(new CustomEvent('error', {
          detail: { error: err },
          bubbles: true,
          composed: true
        }))
        return of({ error: err })
      }),
      finalize(() => {
        this.processing = false
        this.dispatchEvent(new CustomEvent('processing', {
          detail: { processing: false },
          bubbles: true,
          composed: true
        }))
      })
    )
  }

  private createStripeElements(stripe: Stripe) {
    if (!this.paymentIntent) return

    of(this.clientSecret).pipe(
      map(secret => {
        if (secret) {
          return stripe.elements({ clientSecret: secret, appearance: this.config.appearance, fonts: this.config.fonts })
        } else {
          return stripe.elements({
            mode: 'payment' as const,
            amount: this.paymentIntent!.amount,
            currency: this.paymentIntent!.currency,
            appearance: this.config.appearance,
            fonts: this.config.fonts
          })
        }
      }),
      tap(elements => {
        this.elements$.next(elements)
        this.dispatchEvent(new CustomEvent('ready', {
          detail: { stripe, elements },
          bubbles: true,
          composed: true
        }))
      })
    ).subscribe()
  }

  private mountStripePaymentElement() {
    const elements = this.elements$.value
    if (!elements || !this.targetElement || this.paymentElement) return

    of(elements.create('payment', {
      layout: 'tabs' as const,
      defaultValues: {
        billingDetails: {
          name: this.paymentIntent?.customer?.name,
          email: this.paymentIntent?.customer?.email,
          phone: this.paymentIntent?.customer?.phone
        }
      }
    })).pipe(
      tap(paymentElement => {
        this.paymentElement = paymentElement
        paymentElement.mount(this.targetElement!)
        
        paymentElement.on('change', (event: any) => {
          this.dispatchEvent(new CustomEvent('change', {
            detail: {
              complete: event.complete,
              empty: event.empty,
              error: event.error
            },
            bubbles: true,
            composed: true
          }))
        })
      })
    ).subscribe()
  }

  render() {
    return html`
      <slot name="stripe-container">
        <div class="w-full min-h-[200px]">
          <!-- Default container if no slot provided -->
        </div>
      </slot>
      ${when(this.processing,
        () => html`
          <div class="absolute inset-0 flex items-center justify-center bg-white/80">
            <schmancy-progress mode="circular"></schmancy-progress>
          </div>
        `
      )}
      ${when(this.error,
        () => html`
          <div class="text-red-500 text-sm mt-2">${this.error}</div>
        `
      )}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'schmancy-stripe-payment': SchmancyStripePayment
  }
}