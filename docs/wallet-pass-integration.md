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

2. **Enable the Google Wallet API**
   - In the Google Cloud Console, go to APIs & Services > Library
   - Search for "Google Wallet API"
   - Click on the API and press "Enable"
   - Without this step, all wallet pass generation will fail with a 403 error

3. **Create a Service Account**
   - In the Google Cloud Console, go to IAM & Admin > Service Accounts
   - Create a new service account with the "Wallet Object Issuer" role
   - Generate and download a JSON key file

4. **Register as a Wallet Developer**
   - Go to the [Google Wallet Developer Console](https://pay.google.com/business/console/)
   - Create an issuer account
   - Note your issuer ID (used in the configuration)

5. **Configure Firebase and Google Wallet Environment Variables**
   - Go to the Firebase Console > Project Settings > Service accounts
   - Generate a new private key (this will download a JSON file)
   - Open the downloaded JSON file and extract the necessary values
   - Add the following to your Netlify environment variables (important: add these in Netlify's dashboard, not in netlify.toml):
     ```
     # Required Firebase Admin SDK credentials
     FIREBASE_PROJECT_ID=your-firebase-project-id
     FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project.iam.gserviceaccount.com
     FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n
     
     # Google Wallet issuer ID (from Google Wallet Developer Console)
     GOOGLE_WALLET_ISSUER_ID=your-issuer-id
     ```
   
   **IMPORTANT Notes about Service Account Keys:**
   - The `FIREBASE_PRIVATE_KEY` must include the BEGIN and END markers
   - All newlines in the private key must be represented as `\n` characters
   - In Netlify, you can set environment variables in the dashboard under Site settings > Build & deploy > Environment
   - If using in local development, set these in a `.env` file (don't commit this file!)
   - The service account needs "Firebase Admin SDK Administrator Service Agent" role

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

### Common Issues

#### Google Wallet API Not Enabled
If you see an error like:
```
Google Wallet API has not been used in project [projectId] before or it is disabled.
```

**Solution:**
1. Go to the Google Cloud Console for your project
2. Navigate to APIs & Services > Library
3. Search for "Google Wallet API"
4. Click "Enable" to activate the API
5. Wait ~5 minutes for the change to propagate

#### Missing or Invalid Credentials
If you see authentication errors:
```
Failed to get access token or Invalid private key
```

**Solution:**
1. Check that all environment variables are set correctly
2. Verify the FIREBASE_PRIVATE_KEY includes the full key with BEGIN/END markers
3. Make sure all newlines in the private key are preserved with \n characters
4. Confirm the service account has the correct permissions

#### QR Code Scanning Issues
If scanners can't read the QR code:

**Solution:**
1. Increase the QR code size in the template
2. Ensure proper contrast ratio
3. Test with different scanner apps

#### Wallet App Not Installed
If users can't add passes:

**Solution:**
1. Add instructions/links to install the appropriate wallet app
2. Detect if wallet apps are installed and show guidance
3. Provide alternative (email the ticket) if wallet isn't available

#### Apple certificate errors
Verify certificate format and expiration

#### Pass display issues
Check pass fields and data formatting

## Future Improvements

Potential enhancements to consider:

1. **Pass Updates**: Implement push notifications for pass updates
2. **Localization**: Add multiple language support for pass fields
3. **Location-based Triggers**: Add geolocation for automatic display
4. **Analytics**: Track pass usage and engagement metrics