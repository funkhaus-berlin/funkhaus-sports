# Wallet Pass Integration for Funkhaus Sports

This document outlines a plan to integrate digital wallet passes (Apple Wallet and Google Wallet) with the Funkhaus Sports booking confirmation system.

## Overview

Wallet passes will allow users to:
- Add their booking to their mobile device wallet
- Get quick access to booking information (date, time, court, etc.)
- Present the QR code for check-in
- Receive notifications for booking reminders

## Technical Implementation

### Libraries

Based on our research, the following libraries are recommended:

1. **Apple Wallet (iOS)**:
   - [passkit-generator](https://www.npmjs.com/package/passkit-generator) - Most actively maintained library for Node.js
   - [@walletpass/pass-js](https://www.npmjs.com/package/@walletpass/pass-js) - Alternative with push notification support

2. **Google Wallet (Android)**:
   - [google-wallet](https://www.npmjs.com/package/google-wallet) - Node.js wrapper for Google Wallet API
   - Google's official API via [googleapis](https://www.npmjs.com/package/googleapis)

### Server-Side Implementation (Netlify Functions)

We'll create new Netlify functions to generate wallet passes:

1. **`generate-wallet-pass.ts`**: 
   - Endpoint: `/api/generate-wallet-pass`
   - Parameters: 
     - `bookingId`: Booking ID to generate pass for
     - `platform`: "apple" or "google"
   - Returns: Pass file or URL to add pass

2. **Certificate Requirements**:
   - For Apple Wallet: Developer certificate, private key, and pass type identifier
   - For Google Wallet: Service account credentials

### Integration Points

1. **Booking Confirmation Screen**:
   - Add "Add to Wallet" buttons (conditional on device type)
   - Implement platform detection to show the appropriate button

2. **Confirmation Email**:
   - Include wallet pass as attachment or link in email
   - Update email template to include wallet pass instructions

## Pass Design

### Apple Wallet Pass

```
+----------------------------------+
|                                  |
|            VENUE LOGO            |
|                                  |
+----------------------------------+
|                                  |
|  Court Booking                   |
|                                  |
+----------------------------------+
|                |                 |
|  DATE          |  TIME           |
|  May 15, 2025  |  14:00 - 15:00  |
|                |                 |
+----------------------------------+
|                                  |
|  COURT NAME                      |
|  Court 3                         |
|                                  |
+----------------------------------+
|                                  |
|           QR CODE                |
|                                  |
+----------------------------------+
|                                  |
|  BOOKING ID                      |
|  ABC123XYZ                       |
|                                  |
+----------------------------------+
```

### Google Wallet Pass

The Google Wallet pass will contain similar information but formatted according to Google's design guidelines.

## Data Structure

Each pass will contain:

```json
{
  "bookingId": "ABC123XYZ",
  "venueName": "City Sports Club",
  "courtName": "Court 3",
  "date": "2025-05-15",
  "startTime": "14:00",
  "endTime": "15:00",
  "userName": "John Doe",
  "userEmail": "john@example.com",
  "qrCode": "data:image/png;base64,..." // QR code image data
}
```

## Implementation Timeline

1. **Phase 1: Apple Wallet Integration**
   - Set up Apple Developer account and certificates
   - Implement passkit-generator in Netlify function
   - Add "Add to Apple Wallet" button on confirmation page
   - Test on iOS devices

2. **Phase 2: Google Wallet Integration**
   - Set up Google Service Account for Wallet API
   - Implement Google Wallet API integration
   - Add "Add to Google Wallet" button on confirmation page
   - Test on Android devices

3. **Phase 3: Email Integration**
   - Update email templates to include wallet pass links
   - Test email delivery with wallet passes

## Technical Requirements

### Apple Wallet Requirements

1. **Certificates and Keys**:
   - Apple Developer Program membership
   - Pass Type ID certificate
   - Apple WWDR certificate
   - Private key for signing passes

2. **Pass Structure**:
   - `pass.json`: Main pass data
   - `manifest.json`: SHA1 hashes of all files
   - `signature`: PKCS #7 signature of the manifest
   - Images: background, icon, logo (various sizes)

### Google Wallet Requirements

1. **Authentication**:
   - Google Cloud project
   - Service account with Google Wallet API enabled
   - JSON key file for authentication

2. **Pass Structure**:
   - Event ticket class with proper fields
   - Object creation with booking details
   - JWT token for pass signing

## Code Examples

### Apple Wallet Pass Generation (Node.js)

```typescript
// netlify/functions/generate-apple-pass.ts
import { PKPass } from 'passkit-generator';
import { BookingsDB } from '../../src/db/bookings.collection';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

export async function handler(event) {
  const { bookingId } = JSON.parse(event.body);
  
  // Get booking data
  const booking = await BookingsDB.getById(bookingId);
  if (!booking) {
    return { 
      statusCode: 404, 
      body: JSON.stringify({ error: 'Booking not found' }) 
    };
  }
  
  // Generate QR code
  const qrCodeData = await QRCode.toDataURL(bookingId);
  
  // Create pass
  const pass = new PKPass({
    model: './templates/pass.json',
    certificates: {
      wwdr: fs.readFileSync('./certificates/wwdr.pem'),
      signerCert: fs.readFileSync('./certificates/signerCert.pem'),
      signerKey: fs.readFileSync('./certificates/signerKey.pem'),
      signerKeyPassphrase: 'your-passphrase'
    }
  });
  
  // Set pass data
  pass.primaryFields.push({
    key: 'event',
    label: 'EVENT',
    value: 'Court Booking'
  });
  
  pass.secondaryFields.push(
    {
      key: 'date',
      label: 'DATE',
      value: booking.date
    },
    {
      key: 'time',
      label: 'TIME',
      value: `${booking.startTime} - ${booking.endTime}`
    }
  );
  
  pass.auxiliaryFields.push({
    key: 'court',
    label: 'COURT',
    value: booking.courtName
  });
  
  // Add barcode
  pass.barcodes = [{
    message: bookingId,
    format: 'PKBarcodeFormatQR',
    messageEncoding: 'iso-8859-1'
  }];
  
  // Generate pass file
  const passBuffer = await pass.generate();
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename=booking-${bookingId}.pkpass`
    },
    body: passBuffer.toString('base64'),
    isBase64Encoded: true
  };
}
```

### Google Wallet Pass Generation (Node.js)

```typescript
// netlify/functions/generate-google-pass.ts
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { BookingsDB } from '../../src/db/bookings.collection';

export async function handler(event) {
  const { bookingId } = JSON.parse(event.body);
  
  // Get booking data
  const booking = await BookingsDB.getById(bookingId);
  if (!booking) {
    return { 
      statusCode: 404, 
      body: JSON.stringify({ error: 'Booking not found' }) 
    };
  }
  
  // Set up Google auth
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
  });
  
  const walletObjects = google.walletobjects({
    version: 'v1',
    auth
  });
  
  // Create event ticket class if not exists
  const classId = `${process.env.GOOGLE_WALLET_ISSUER_ID}.funkhaus_sports_booking`;
  
  try {
    // Create or update class
    await walletObjects.eventticketclass.insert({
      requestBody: {
        id: classId,
        issuerName: 'Funkhaus Sports',
        eventName: {
          defaultValue: {
            language: 'en-US',
            value: 'Court Booking'
          }
        },
        // More class configuration...
      }
    });
    
    // Create ticket object
    const objectId = `${classId}.${bookingId}`;
    await walletObjects.eventticketobject.insert({
      requestBody: {
        id: objectId,
        classId: classId,
        state: 'ACTIVE',
        barcode: {
          type: 'QR_CODE',
          value: bookingId
        },
        // More object configuration...
      }
    });
    
    // Generate JWT for pass link
    const claims = {
      iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      aud: 'google',
      origins: [process.env.APP_ORIGIN],
      typ: 'savetowallet',
      payload: {
        eventTicketObjects: [{ id: objectId }]
      }
    };
    
    const token = await auth.sign(claims);
    const passLink = `https://pay.google.com/gp/v/save/${token}`;
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        passLink 
      })
    };
  } catch (error) {
    console.error('Error creating Google Wallet pass:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create wallet pass' })
    };
  }
}
```

### Front-end Integration

```typescript
// src/public/book/components/booking-success.ts
import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { $LitElement } from '@mhmo91/schmancy/dist/mixins';
import { Booking } from 'src/types/booking/models';

@customElement('booking-success')
export class BookingSuccess extends $LitElement() {
  @property({ type: Object }) booking?: Booking;
  @property({ type: Boolean }) isLoading = false;
  @property({ type: String }) platform = this.detectPlatform();
  
  private detectPlatform(): string {
    const userAgent = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(userAgent)) {
      return 'apple';
    } else if (/Android/.test(userAgent)) {
      return 'google';
    }
    return 'unknown';
  }
  
  private async addToWallet() {
    if (!this.booking) return;
    
    this.isLoading = true;
    
    try {
      if (this.platform === 'apple') {
        const response = await fetch('/api/generate-wallet-pass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            bookingId: this.booking.id,
            platform: 'apple'
          })
        });
        
        // Apple Wallet passes are downloaded as files
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          document.body.appendChild(a);
          a.style.display = 'none';
          a.href = url;
          a.download = `booking-${this.booking.id}.pkpass`;
          a.click();
          window.URL.revokeObjectURL(url);
        }
      } else if (this.platform === 'google') {
        const response = await fetch('/api/generate-wallet-pass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            bookingId: this.booking.id,
            platform: 'google'
          })
        });
        
        // Google Wallet uses links
        if (response.ok) {
          const { passLink } = await response.json();
          window.location.href = passLink;
        }
      }
    } catch (error) {
      console.error('Error adding to wallet:', error);
    } finally {
      this.isLoading = false;
    }
  }
  
  render() {
    if (!this.booking) {
      return html`
        <div class="p-4 text-center">
          <schmancy-progress type="circular" size="md"></schmancy-progress>
        </div>
      `;
    }
    
    return html`
      <div class="p-4">
        <div class="mb-4 p-4 bg-success-container rounded-lg text-center">
          <schmancy-icon class="text-4xl mb-2">check_circle</schmancy-icon>
          <schmancy-typography type="headline" token="lg">
            Booking Confirmed!
          </schmancy-typography>
        </div>
        
        <!-- Booking details -->
        <!-- ... existing booking details ... -->
        
        <!-- Add to Wallet button - only show on supported platforms -->
        ${this.platform !== 'unknown' ? html`
          <div class="mt-6">
            <schmancy-button 
              variant="outlined" 
              class="w-full"
              @click=${() => this.addToWallet()}
              ?disabled=${this.isLoading}
            >
              <schmancy-icon>${this.platform === 'apple' ? 'wallet' : 'payments'}</schmancy-icon>
              Add to ${this.platform === 'apple' ? 'Apple Wallet' : 'Google Wallet'}
            </schmancy-button>
          </div>
        ` : ''}
      </div>
    `;
  }
}
```

## Security Considerations

1. **Certificate Protection**:
   - Store certificates and private keys securely
   - Use environment variables for sensitive data
   - Restrict access to pass generation endpoints

2. **Validation**:
   - Verify user authorization before generating passes
   - Validate booking data before creating passes
   - Implement rate limiting to prevent abuse

## Testing Plan

1. **Unit Tests**:
   - Test pass generation functions
   - Test platform detection
   - Test error handling

2. **Integration Tests**:
   - Test pass generation endpoints
   - Test wallet pass formatting
   - Test QR code scanning from wallet passes

3. **End-to-End Tests**:
   - Test on real iOS and Android devices
   - Test pass installation process
   - Test scanning wallet pass QR codes with scanner

## Conclusion

Implementing digital wallet passes will enhance the user experience of Funkhaus Sports by providing easy access to booking information and streamlining the check-in process. The implementation will require server-side changes to generate the passes and front-end changes to offer them to users.