import { $notify, area, SchmancyInputChangeEvent } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { sendPasswordResetEmail } from 'firebase/auth'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { auth, actionCodeSettings } from 'src/firebase/firebase'
import FunkhausSportsSignin from './signin'

@customElement('funkhaus-sports-password-reset')
export default class FunkhausSportsPasswordReset extends $LitElement() {
  @state() email = ''
  @state() busy = false
  @state() resetSent = false
  @state() formError = ''

  resetPassword() {
    // Clear any previous errors
    this.formError = ''

    // Validate email
    if (!this.email) {
      this.formError = 'Please enter your email address'
      return
    }

    // Send password reset email with custom action code settings
    this.busy = true
    sendPasswordResetEmail(auth, this.email, actionCodeSettings)
      .then(() => {
        this.busy = false
        this.resetSent = true
        $notify.success('Password reset email sent successfully')
      })
      .catch(error => {
        this.busy = false
        
        // Handle specific Firebase error codes
        if (error.code === 'auth/user-not-found') {
          this.formError = 'No account found with this email address'
        } else if (error.code === 'auth/invalid-email') {
          this.formError = 'Please enter a valid email address'
        } else {
          this.formError = 'Error sending reset email. Please try again later.'
        }
        
        console.error('Password reset error:', error)
      })
  }

  backToLogin() {
    area.push({
      component: FunkhausSportsSignin,
      area: 'root',
      historyStrategy: 'replace'
    })
  }

  protected render() {
    return html`
      <style>
        :host {
          display: block;
          --brand-primary: #2563eb;
          --brand-hover: #3b82f6;
        }
        .reset-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          background: linear-gradient(135deg, #f9fafb 0%, #e5e7eb 100%);
        }
        .reset-form {
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
          padding: 2rem;
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          transition: all 0.3s ease;
        }
        .form-header {
          margin-bottom: 2rem;
        }
        .form-footer {
          margin-top: 1.5rem;
          font-size: 0.875rem;
        }
        .error-message {
          color: #dc2626;
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }
        .success-message {
          background-color: #ecfdf5;
          color: #065f46;
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1.5rem;
        }
        @media (max-width: 640px) {
          .reset-form {
            padding: 1.5rem;
            border-radius: 8px;
            max-width: 90%;
          }
        }
      </style>

      <div class="reset-container">
        <div class="reset-form">
          <schmancy-grid justify="center" class="form-header" gap="sm">
            <schmancy-typography type="headline" align="center">
              <schmancy-animated-text duration="2000">Reset Password</schmancy-animated-text>
            </schmancy-typography>
            <schmancy-typography type="body" align="center" token="md">
              ${this.resetSent 
                ? 'Check your email for reset instructions' 
                : 'Enter your email to receive a password reset link'}
            </schmancy-typography>
          </schmancy-grid>

          ${this.resetSent 
            ? html`
              <div class="success-message">
                We've sent a password reset link to <strong>${this.email}</strong>. 
                Please check your inbox and follow the instructions to reset your password.
              </div>
              <schmancy-button
                @click=${this.backToLogin}
                variant="filled"
                style="width: 100%; margin-top: 1rem;"
              >
                Back to Sign In
              </schmancy-button>
            ` 
            : html`
              <div class="error-message" ?hidden=${!this.formError}>${this.formError}</div>

              <schmancy-form
                @submit=${(e: SubmitEvent) => {
                  e.preventDefault()
                  this.resetPassword()
                }}
              >
                <schmancy-grid gap="md">
                  <schmancy-input
                    name="email"
                    .value=${this.email}
                    @change=${(e: SchmancyInputChangeEvent) => {
                      this.email = e.detail.value
                    }}
                    required
                    placeholder="Email address"
                    type="email"
                    autocomplete="email"
                    icon="mail"
                  ></schmancy-input>

                  <schmancy-button
                    .disabled=${this.busy}
                    type="submit"
                    variant="filled"
                    style="width: 100%; margin-top: 0.5rem;"
                  >
                    ${this.busy ? 'Sending...' : 'Send Reset Link'}
                  </schmancy-button>
                </schmancy-grid>
              </schmancy-form>

              <div class="form-footer">
                <schmancy-grid justify="center" gap="sm" alignItems="center">
                  <schmancy-typography align="center" type="label" token="sm">
                    Remember your password?
                  </schmancy-typography>
                  <schmancy-button
                    @click=${this.backToLogin}
                    variant="text"
                    style="color: var(--brand-primary)"
                  >
                    Back to Sign In
                  </schmancy-button>
                </schmancy-grid>
              </div>
            `}
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'funkhaus-sports-password-reset': FunkhausSportsPasswordReset
  }
}
