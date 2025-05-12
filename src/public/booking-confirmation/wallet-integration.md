# Wallet Pass Integration

This document describes the wallet pass integration for the booking confirmation component.

## Overview

Adding wallet passes to the booking confirmation allows users to:
- Keep their booking information in their mobile wallet (Apple Wallet or Google Wallet)
- Easily access the QR code for check-in
- Receive notifications about their booking

## Implementation

### UI Component

The "Add to Wallet" button will be integrated into the booking confirmation page. The component will:

1. Detect the user's device type
2. Show the appropriate wallet button (Apple or Google)
3. Handle the wallet pass generation and installation process

### Sample UI Implementation

```typescript
// Add to Wallet button in booking-confirmation.ts
render() {
  // ...existing confirmation UI
  
  return html`
    <div class="booking-confirmation">
      <!-- Booking details here -->

      <!-- Wallet integration -->
      <div class="wallet-section mt-4 mb-6 p-4 bg-tertiary-container rounded-lg">
        <div class="flex items-center mb-2">
          <schmancy-icon class="mr-2">add_card</schmancy-icon>
          <schmancy-typography type="title" token="md">Save to your wallet</schmancy-typography>
        </div>
        
        <schmancy-typography type="body" token="sm" class="mb-4">
          Add this booking to your mobile device's wallet for easy access on the day of your booking.
        </schmancy-typography>
        
        ${this.isAppleDevice() ? html`
          <schmancy-button 
            variant="filled" 
            class="w-full"
            @click=${() => this.addToAppleWallet()}
            ?disabled=${this.walletLoading}
          >
            <div class="flex items-center justify-center">
              <svg class="wallet-icon mr-2" width="20" height="20" viewBox="0 0 24 24">
                <!-- Apple Wallet icon SVG -->
              </svg>
              Add to Apple Wallet
            </div>
          </schmancy-button>
        ` : this.isAndroidDevice() ? html`
          <schmancy-button 
            variant="filled" 
            class="w-full"
            @click=${() => this.addToGoogleWallet()}
            ?disabled=${this.walletLoading}
          >
            <div class="flex items-center justify-center">
              <svg class="wallet-icon mr-2" width="20" height="20" viewBox="0 0 24 24">
                <!-- Google Wallet icon SVG -->
              </svg>
              Add to Google Wallet
            </div>
          </schmancy-button>
        ` : html`
          <div class="text-center text-on-surface-variant">
            <schmancy-typography type="body" token="sm">
              Wallet passes are available on mobile devices only.
            </schmancy-typography>
          </div>
        `}
      </div>
    </div>
  `;
}
```

### Backend Services

Two Netlify functions will be implemented to handle the pass generation:

1. `generate-apple-pass.ts`: Creates Apple Wallet .pkpass files
2. `generate-google-wallet.ts`: Creates Google Wallet passes via Google Pay API

## Wallet Pass Design

### Pass Fields

Both wallet types will include the following information:

- **Header**:
  - Venue name
  - Event type (Court Booking)

- **Primary Info**:
  - Date
  - Time (start and end)
  - Court name/number

- **Secondary Info**:
  - Booking ID
  - QR Code
  - User name

- **Additional Info**:
  - Venue address
  - Venue logo

### Visual Design

The passes will follow the design guidelines for each platform while maintaining brand consistency:

- Use venue colors and logo
- Clear, readable typography
- Properly sized QR code
- Intuitive information hierarchy

## Integration with Email

The booking confirmation email will also include options to add the pass to the user's wallet:

1. For Apple devices: Attach the .pkpass file
2. For all devices: Include a link to a web page where the pass can be added

## Technical Requirements

### Libraries and Dependencies

- `passkit-generator`: For Apple Wallet passes
- `google-wallet`: For Google Wallet passes
- QR code generation libraries

### Certificate Requirements

- Apple Developer Account with Wallet Pass certificate
- Google Cloud project with Google Wallet API enabled

## Implementation Steps

1. Create pass templates for both platforms
2. Implement Netlify functions to generate passes
3. Add device detection to booking confirmation
4. Integrate wallet buttons in the UI
5. Add pass links/attachments to confirmation emails
6. Test on various devices

## Future Enhancements

- Push notifications for booking reminders
- Automatic pass updates if booking details change
- Location-based notifications when near the venue