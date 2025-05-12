import { $notify, area, SchmancyInputChangeEvent } from '@mhmo91/schmancy'
import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'
import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { auth } from 'src/firebase/firebase'
import FunkhausSportsSignin from './signin'

@customElement('funkhaus-sports-password-reset-action')
export default class FunkhausSportsPasswordResetAction extends $LitElement() {
  @state() actionCode = ''
  @state() email = ''
  @state() newPassword = ''
  @state() confirmPassword = ''
  @state() busy = false
  @state() error = ''
  @state() stage: 'verifying' | 'resetting' | 'success' = 'verifying'

  constructor() {
    super()

    // Extract the action code from the URL
    const urlParams = new URLSearchParams(window.location.search)
    this.actionCode = urlParams.get('oobCode') || ''

    if (!this.actionCode) {
      this.error = 'Invalid or expired password reset link'
      this.stage = 'success' // Just to display the back to login button
      return
    }

    // Verify the action code and get the associated email
    this.busy = true
    verifyPasswordResetCode(auth, this.actionCode)
      .then((email) => {
        this.email = email
        this.busy = false
        this.stage = 'resetting'
      })
      .catch((error) => {
        this.busy = false
        this.error = 'Invalid or expired password reset link'
        this.stage = 'success' // Just to display the back to login button
        console.error('Error verifying reset code:', error)
      })
  }

  resetPassword() {
    // Validate passwords
    if (!this.newPassword) {
      this.error = 'Please enter a new password'
      return
    }
    
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Passwords do not match'
      return
    }
    
    if (this.newPassword.length < 6) {
      this.error = 'Password must be at least 6 characters'
      return
    }

    // Reset the password
    this.busy = true
    confirmPasswordReset(auth, this.actionCode, this.newPassword)
      .then(() => {
        this.busy = false
        this.stage = 'success'
        $notify.success('Password has been reset successfully')
      })
      .catch((error) => {
        this.busy = false
        if (error.code === 'auth/expired-action-code' || error.code === 'auth/invalid-action-code') {
          this.error = 'Invalid or expired password reset link'
          this.stage = 'success' // Just to display the back to login button
        } else if (error.code === 'auth/weak-password') {
          this.error = 'Password is too weak. Please choose a stronger password.'
        } else {
          this.error = 'Failed to reset password. Please try again.'
        }
        console.error('Error confirming password reset:', error)
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
          ${this.stage === 'verifying' 
            ? html`
              <schmancy-grid justify="center" class="form-header" gap="sm">
                <schmancy-typography type="headline" align="center">
                  <schmancy-animated-text duration="2000">Verifying Reset Link</schmancy-animated-text>
                </schmancy-typography>
                <schmancy-typography type="body" align="center" token="md">
                  Please wait while we verify your password reset link...
                </schmancy-typography>
              </schmancy-grid>
              <div class="text-center">
                <div class="inline-block w-8 h-8 border-4 border-t-primary-default border-r-outlineVariant border-b-outlineVariant border-l-outlineVariant rounded-full animate-spin mb-3 mx-auto"></div>
              </div>
            ` 
            : this.stage === 'resetting' 
            ? html`
              <schmancy-grid justify="center" class="form-header" gap="sm">
                <schmancy-typography type="headline" align="center">
                  <schmancy-animated-text duration="2000">Reset Password</schmancy-animated-text>
                </schmancy-typography>
                <schmancy-typography type="body" align="center" token="md">
                  Please enter your new password for ${this.email}
                </schmancy-typography>
              </schmancy-grid>

              <div class="error-message" ?hidden=${!this.error}>${this.error}</div>

              <schmancy-form
                @submit=${(e: SubmitEvent) => {
                  e.preventDefault()
                  this.resetPassword()
                }}
              >
                <schmancy-grid gap="md">
                  <schmancy-input
                    name="password"
                    .value=${this.newPassword}
                    @change=${(e: SchmancyInputChangeEvent) => {
                      this.newPassword = e.detail.value
                      this.error = ''
                    }}
                    required
                    placeholder="New password"
                    type="password"
                    autocomplete="new-password"
                    icon="lock"
                  ></schmancy-input>

                  <schmancy-input
                    name="confirmPassword"
                    .value=${this.confirmPassword}
                    @change=${(e: SchmancyInputChangeEvent) => {
                      this.confirmPassword = e.detail.value
                      this.error = ''
                    }}
                    required
                    placeholder="Confirm new password"
                    type="password"
                    autocomplete="new-password"
                    icon="lock"
                  ></schmancy-input>

                  <schmancy-button
                    .disabled=${this.busy}
                    type="submit"
                    variant="filled"
                    style="width: 100%; margin-top: 0.5rem;"
                  >
                    ${this.busy ? 'Resetting Password...' : 'Reset Password'}
                  </schmancy-button>
                </schmancy-grid>
              </schmancy-form>
            ` 
            : html`
              <schmancy-grid justify="center" class="form-header" gap="sm">
                <schmancy-typography type="headline" align="center">
                  <schmancy-animated-text duration="2000">
                    ${this.error ? 'Reset Link Invalid' : 'Password Reset Complete'}
                  </schmancy-animated-text>
                </schmancy-typography>
                <schmancy-typography type="body" align="center" token="md">
                  ${this.error 
                    ? this.error 
                    : 'Your password has been successfully reset. You can now sign in with your new password.'}
                </schmancy-typography>
              </schmancy-grid>

              ${!this.error ? html`
                <div class="success-message">
                  Password reset complete. You can now sign in with your new password.
                </div>
              ` : ''}

              <schmancy-button
                @click=${this.backToLogin}
                variant="filled"
                style="width: 100%; margin-top: 1rem;"
              >
                Return to Sign In
              </schmancy-button>
            `}
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'funkhaus-sports-password-reset-action': FunkhausSportsPasswordResetAction
  }
}
