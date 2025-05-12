// netlify/functions/generate-wallet-pass.ts
import { Handler } from '@netlify/functions';
// @ts-ignore - Using JS module in TS file
import { DBService } from './_shared/db-service.js';
import { 
  prepareWalletPassData, 
  formatAppleWalletFields, 
  formatGoogleWalletObject 
} from './_shared/wallet-pass-utils';
import { WALLET_CONFIG } from './_shared/wallet-pass-config';
import { GoogleWalletService } from './_shared/google-wallet-service';

// Note: For Apple Wallet, we still need to implement with the passkit-generator library

/**
 * Handler to generate wallet passes for bookings or redirect to booking confirmation
 * 
 * This handler serves two purposes:
 * 1. For direct API calls (POST): Generate and return the wallet pass
 * 2. For email links (GET): Redirect to booking confirmation page with auto-generation parameters
 */
export const handler: Handler = async (event) => {
  // Allow both GET (for email links) and POST (for direct calls from the frontend)
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }
  
  // Parse parameters from either the query string (GET) or the request body (POST)
  let bookingId: string | undefined;
  let platform: string | undefined;
  
  if (event.httpMethod === 'GET') {
    // Extract from query parameters for GET requests (email links)
    const params = event.queryStringParameters || {};
    bookingId = params.bookingId;
    platform = params.platform;
    
    // For GET requests, redirect to booking confirmation with auto-generation parameters
    if (bookingId && (platform === 'apple' || platform === 'google')) {
      const redirectUrl = `/booking-confirmation?id=${encodeURIComponent(bookingId)}&wallet=${encodeURIComponent(platform)}&autoGenerate=true`;
      return {
        statusCode: 302,
        headers: {
          Location: redirectUrl,
        },
        body: ''
      };
    }
  } else {
    // Extract from body for POST requests (frontend component)
    const body = JSON.parse(event.body || '{}');
    bookingId = body.bookingId;
    platform = body.platform;
  }

  try {
    // Validate parameters
    if (!bookingId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing bookingId parameter' }),
      };
    }

    if (platform !== 'apple' && platform !== 'google') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid platform parameter. Must be "apple" or "google"' }),
      };
    }

    // Get booking data with related court and venue using our improved DB service
    const { booking, court, venue } = await DBService.getBookingWithRelated(bookingId);

    if (!booking) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Booking not found' }),
      };
    }

    // Prepare wallet pass data with booking information
    const walletData = prepareWalletPassData(booking, court, venue);

    // Route to the appropriate handler
    if (platform === 'apple') {
      return generateApplePass(walletData);
    } else {
      return generateGooglePass(walletData);
    }
  } catch (error) {
    console.error('Error generating wallet pass:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate wallet pass' }),
    };
  }
};

/**
 * Generate an Apple Wallet pass
 * 
 * Note: This is a stub implementation.
 * The real implementation would use the passkit-generator library
 * and actual Apple Wallet certificates.
 */
async function generateApplePass(walletData: any) {
  try {
    // Format the wallet pass data for Apple Wallet
    const passData = formatAppleWalletFields(walletData);
    
    console.log('Generating Apple Wallet pass for booking:', walletData.bookingId);
    
    // In production, you would:
    // 1. Use passkit-generator library to create the .pkpass file
    // 2. Add all pass fields from passData
    // 3. Include PNG images (logo, icon, strip) using the WALLET_CONFIG.assets
    // 4. Generate and sign the pass
    
    // For now, return a stub response that would be replaced in production
    const sampleBuffer = Buffer.from(`Apple Wallet pass for ${walletData.bookingId}`);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename=booking-${walletData.bookingId}.pkpass`,
      },
      body: sampleBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('Error generating Apple Wallet pass:', error);
    throw error;
  }
}

/**
 * Generate a Google Wallet pass using Firebase service account authentication
 * 
 * Production implementation that creates a real Google Wallet pass
 * with the appropriate class and object using the Google Pay API
 */
async function generateGooglePass(walletData: any) {
  try {
    // Format the wallet pass data for Google Wallet
    const passData = formatGoogleWalletObject(walletData);
    
    console.log('Generating Google Wallet pass for booking:', walletData.bookingId);
    
    // Create an instance of the Google Wallet service
    const googleWalletService = new GoogleWalletService();
    
    // Create the pass and get the save URL
    const passUrl = await googleWalletService.createPass(passData);
    
    // Return the save URL to the client
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        passUrl,
      }),
    };
  } catch (error) {
    console.error('Error generating Google Wallet pass:', error);
    
    // Return a more detailed error message
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Failed to generate Google Wallet pass',
        details: error.message,
      }),
    };
  }
}
