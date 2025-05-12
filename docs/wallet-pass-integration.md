# Wallet Pass Integration Guide

This document outlines the process for integrating Apple Wallet and Google Wallet passes into the Funkhaus Sports booking system.

## Overview

The wallet pass integration allows users to add their booking tickets to their mobile device's digital wallet (Apple Wallet on iOS, Google Wallet on Android). The integration involves:

1. Backend serverless functions that generate the passes
2. Frontend components that trigger the pass generation
3. Email templates that include wallet pass links

## Configuration

### Google Wallet Setup

1. **Create a Google Cloud Project**
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or use an existing one
   - Enable the Google Wallet API

2. **Create a Service Account**
   - In the Google Cloud Console, go to IAM & Admin > Service Accounts
   - Create a new service account with the "Wallet Object Issuer" role
   - Generate and download a JSON key file

3. **Register as a Wallet Developer**
   - Go to the [Google Wallet Developer Console](https://pay.google.com/business/console/)
   - Create an issuer account
   - Note your issuer ID (used in the configuration)

4. **Configure Environment Variables**
   - Add the following to your Netlify environment variables or `.env` file:
     ```
     GOOGLE_WALLET_ISSUER_ID=your-issuer-id
     GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account-email
     GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=your-service-account-private-key
     ```

### Apple Wallet Setup

1. **Register as an Apple Developer**
   - Join the [Apple Developer Program](https://developer.apple.com/programs/)
   - Create an App ID with Wallet pass functionality

2. **Create Pass Type ID**
   - In the Apple Developer portal, go to Certificates, Identifiers & Profiles
   - Create a new Pass Type ID (e.g., pass.funkhaus.sports)
   - Generate and download the Pass Type ID certificate

3. **Generate Pass Certificates**
   - Generate a Pass Type ID certificate
   - Generate a WWDR (Apple Worldwide Developer Relations) certificate
   - Convert the certificates to PEM format for use with passkit-generator

4. **Configure Environment Variables**
   - Add the following to your Netlify environment variables:
     ```
     APPLE_TEAM_ID=your-team-id
     APPLE_PASS_TYPE_ID=your-pass-type-id
     APPLE_WALLET_CERT=base64-encoded-certificate
     APPLE_WALLET_KEY=base64-encoded-key
     APPLE_WWDR_CERT=base64-encoded-wwdr-cert
     ```

## Implementation

### Backend Implementation

The implementation consists of the following key components:

1. **Wallet Pass Configuration** (`wallet-pass-config.ts`)
   - Shared configuration for both wallet types
   - Color schemes, asset URLs, and issuer IDs

2. **Wallet Pass Data Formatting** (`wallet-pass-utils.ts`)
   - Format booking data for wallet passes
   - Convert booking data to wallet pass fields

3. **Google Wallet Service** (`google-wallet-service.ts`)
   - Authentication with Google API
   - Creating pass classes and objects
   - Generating save links for passes

4. **API Endpoint** (`generate-wallet-pass.ts`)
   - Serverless function that generates passes
   - Handles both GET and POST requests
   - Routes to the appropriate wallet type

### Frontend Integration

1. **Wallet Button Component** (`wallet-button.ts`)
   - Automatically detects the user's device platform
   - Triggers the pass generation API
   - Handles downloading/opening the pass

2. **Booking Confirmation Integration**
   - Add wallet button to confirmation page
   - Auto-generate passes when requested via URL parameters

### Email Integration

The email template includes wallet buttons that:
1. Use the official wallet button designs
2. Link to the wallet pass API with the appropriate parameters
3. Redirect to the booking confirmation page on click

## Wallet Pass Structure

### Common Fields

Both wallet types include:
- Booking ID (for verification)
- Venue name and address
- Court name
- Date and time of booking
- User name and email
- QR code for check-in

### Platform-Specific Fields

- **Apple Wallet**: Strip image, logo, and structured fields
- **Google Wallet**: Hero image, text modules, and links

## Testing

To test the integration:

1. **Local Development**:
   - Run `npm run dev:emulators`
   - Use the booking confirmation page to test pass generation
   - Test on both iOS and Android devices

2. **Production Testing**:
   - Deploy to a staging environment
   - Test the complete flow from booking to pass generation
   - Verify the pass appears correctly in both wallet apps

## Troubleshooting

Common issues and solutions:

- **Google API errors**: Check service account permissions and keys
- **Apple certificate errors**: Verify certificate format and expiration
- **Pass display issues**: Check pass fields and data formatting
- **QR code scanning problems**: Ensure correct encoding and format

## Future Improvements

Potential enhancements to consider:

1. **Pass Updates**: Implement push notifications for pass updates
2. **Localization**: Add multiple language support for pass fields
3. **Location-based Triggers**: Add geolocation for automatic display
4. **Analytics**: Track pass usage and engagement metrics