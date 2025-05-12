// src/public/book/components/wallet-button.ts
import { $notify } from '@mhmo91/schmancy';
import { $LitElement } from '@mhmo91/schmancy/dist/mixins';
import { html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Booking } from '../context';

@customElement('wallet-button')
export class WalletButton extends $LitElement() {
  @property({ type: Object }) booking!: Booking;
  @property({ type: String }) bookingId: string = '';
  @property({ type: Boolean }) autoGenerate: boolean = false;
  @property({ type: String }) overridePlatform: string = '';

  @state() private addingToWallet: boolean = false;
  @state() private platform: string = this.detectDevicePlatform();

  /**
   * Detect device platform for wallet compatibility
   */
  private detectDevicePlatform(): string {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (/iphone|ipad|ipod/.test(userAgent)) {
      return 'apple';
    } else if (/android/.test(userAgent)) {
      return 'google';
    }
    
    return 'unknown';
  }

  connectedCallback(): void {
    super.connectedCallback();
    
    // Override platform if specified
    if (this.overridePlatform && (this.overridePlatform === 'apple' || this.overridePlatform === 'google')) {
      this.platform = this.overridePlatform;
    }
    
    // Auto-generate wallet pass if requested
    if (this.autoGenerate && this.platform !== 'unknown' && this.booking) {
      // Use a small delay to ensure the component is fully initialized
      setTimeout(() => {
        // Trigger wallet pass generation
        this.addToWallet();
        
        // Notify user
        $notify.info(`Adding booking to ${this.platform === 'apple' ? 'Apple' : 'Google'} Wallet...`);
      }, 500);
    }
  }

  /**
   * Add booking to wallet
   */
  private async addToWallet() {
    if (this.addingToWallet || !this.booking) {
      return;
    }
    
    this.addingToWallet = true;
    
    try {
      // Generate the appropriate wallet pass URL
      const apiUrl = '/api/generate-wallet-pass';
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: this.booking.id || this.bookingId,
          platform: this.platform
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate wallet pass');
      }
      
      if (this.platform === 'apple') {
        // For Apple Wallet, download the .pkpass file
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `booking-${this.booking.id || this.bookingId}.pkpass`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // For Google Wallet, redirect to the pass URL
        const { passUrl } = await response.json();
        window.open(passUrl, '_blank');
      }
      
      $notify.success('Added to wallet successfully');
    } catch (error) {
      console.error('Error adding to wallet:', error);
      $notify.error('Failed to add to wallet');
    } finally {
      this.addingToWallet = false;
    }
  }

  render() {
    // Only show wallet button on supported platforms
    if (this.platform === 'unknown') {
      return html``;
    }

    return html`
      <schmancy-button
        variant="filled"
        @click=${() => this.addToWallet()}
        .disabled=${this.addingToWallet}
      >
        <schmancy-icon>${this.platform === 'apple' ? 'wallet' : 'payments'}</schmancy-icon>
        Add to ${this.platform === 'apple' ? 'Apple Wallet' : 'Google Wallet'}
      </schmancy-button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wallet-button': WalletButton;
  }
}
