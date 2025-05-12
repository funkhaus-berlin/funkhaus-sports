// // netlify/functions/_shared/wallet-pass-config.ts
// /**
//  * Shared configuration for wallet passes to ensure consistency
//  * across both Apple Wallet and Google Wallet implementations
//  */

// import { Address } from "../../../src/types/booking/models";

// // Base URL for wallet pass assets
// const BASE_URL = 'https://funkhaus-sports.netlify.app';

// export const WALLET_CONFIG = {
//   // Organization information
//   organization: {
//     name: 'Funkhaus Sports',
//     website: 'https://funkhaus-sports.netlify.app',
//   },
  
//   // Color scheme
//   colors: {
//     background: '#1A1A1A',
//     foreground: '#FFFFFF',
//     label: '#999999',
//     header: '#000000',
//     accent: '#4285F4',
//   },
  
//   // Asset URLs
//   assets: {
//     logo: `${BASE_URL}/logo-light.png`,
//     icon: `${BASE_URL}/icons/calendar.png`,
//     strip: `${BASE_URL}/icons/court-header.png`,
//   },
  
//   // Barcode configuration
//   barcode: {
//     format: 'QR_CODE',
//     alternateText: 'Scan for check-in',
//     messageEncoding: 'iso-8859-1',
//   },
  
//   // Service account IDs for Google Wallet
//   google: {
//     issuerId: process.env.GOOGLE_WALLET_ISSUER_ID || 'test_issuer',
//     classId: 'funkhaus_sports_booking',
//   },
  
//   // Apple Wallet certificate IDs
//   apple: {
//     teamId: process.env.APPLE_TEAM_ID || 'test_team',
//     passTypeId: process.env.APPLE_PASS_TYPE_ID || 'pass.funkhaus.sports',
//   },
// };

// // Common field labels used across both wallet platforms
// export const FIELD_LABELS = {
//   venue: 'VENUE',
//   court: 'COURT',
//   date: 'DATE',
//   time: 'TIME',
//   name: 'NAME',
//   bookingId: 'BOOKING ID',
//   email: 'EMAIL',
//   venueAddress: 'VENUE ADDRESS',
// };

// /**
//  * Format address for display in wallet pass
//  */
// export function formatVenueAddress(address:Address): string {
//   if (!address) return '';
  
//   // If address is an object, format it
//   const parts :Array<string>= [];
//   if (address.street) parts.push(address.street);
//   if (address.postalCode || address.city) {
//     parts.push(`${address.postalCode || ''} ${address.city || ''}`.trim());
//   }
//   if (address.country) parts.push(address.country);
  
//   return parts.filter(Boolean).join('\n');
// }
