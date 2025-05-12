// netlify/functions/_shared/wallet-pass-utils.ts
import dayjs from 'dayjs';
import { Court } from '../../../src/db/courts.collection';
import { Booking } from '../../../src/types/booking/models';
import { Venue } from '../../../src/db/venue-collection';
import { WALLET_CONFIG, FIELD_LABELS, formatVenueAddress } from './wallet-pass-config';

/**
 * Wallet pass configuration interface
 */
export interface WalletPassData {
  // Basic booking info
  bookingId: string;
  venueName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  userName: string;
  userEmail: string;
  
  // Venue details
  venueAddress?: string;
  venueCity?: string;
  venuePostalCode?: string;
  venueCountry?: string;
  
  // Pass appearance
  logoText?: string;
  description?: string;
}

/**
 * Prepare wallet pass data from booking information
 * 
 * @param booking The booking data
 * @param court Optional court data if available
 * @param venue Optional venue data if available
 * @returns Formatted data for wallet pass generation
 */
export function prepareWalletPassData(
  booking: Booking,
  court?: Court | null,
  venue?: Venue | null
): WalletPassData {
  // Format date and times
  const date = dayjs(booking.date).format('YYYY-MM-DD');
  const startTime = dayjs(booking.startTime).format('HH:mm');
  const endTime = dayjs(booking.endTime).format('HH:mm');
  
  // Format court name (use court.name if available, otherwise fallback)
  const courtName = court?.name || `Court ${booking.courtId?.substring(0, 4) || 'Unknown'}`;
  
  // Format venue name
  const venueName = venue?.name || WALLET_CONFIG.organization.name;
  
  // Format address information
  let venueAddress = '';
  let venueCity = '';
  let venuePostalCode = '';
  let venueCountry = '';
  
  if (venue?.address) {
    if (typeof venue.address === 'object') {
      venueAddress = venue.address.street || '';
      venueCity = venue.address.city || '';
      venuePostalCode = venue.address.postalCode || '';
      venueCountry = venue.address.country || '';
    } else if (typeof venue.address === 'string') {
      // If address is a single string, use it as the address
      venueAddress = venue.address;
    }
  }
  
  // Format user info - use fallbacks to ensure we have some data
  const userName = booking.userName  || 'Guest';
  const userEmail = booking.userEmail || booking.customerEmail || '';
  
  // Pass appearance
  const description = `${courtName} at ${venueName}`;
  const logoText = WALLET_CONFIG.organization.name;
  
  return {
    bookingId: booking.id,
    venueName,
    courtName,
    date,
    startTime,
    endTime,
    userName,
    userEmail,
    venueAddress,
    venueCity,
    venuePostalCode,
    venueCountry,
    description,
    logoText
  };
}

/**
 * Format the wallet pass data for Apple Wallet
 * 
 * This function organizes the data into Apple Wallet's field structure
 * with the appropriate labels and values
 * 
 * @param data The wallet pass data
 * @returns Formatted data for Apple Wallet fields
 */
export function formatAppleWalletFields(data: WalletPassData) {
  // Format date for display
  const displayDate = dayjs(data.date).format('ddd, MMMM D, YYYY');
  
  // Format address for display
  const formattedAddress = [
    data.venueName,
    data.venueAddress,
    `${data.venuePostalCode} ${data.venueCity}`.trim(),
    data.venueCountry
  ].filter(Boolean).join('\n');
  
  return {
    formatVersion: 1,
    passTypeIdentifier: WALLET_CONFIG.apple.passTypeId,
    teamIdentifier: WALLET_CONFIG.apple.teamId,
    organizationName: WALLET_CONFIG.organization.name,
    description: data.description || 'Court Booking',
    serialNumber: data.bookingId,
    backgroundColor: WALLET_CONFIG.colors.background,
    foregroundColor: WALLET_CONFIG.colors.foreground,
    labelColor: WALLET_CONFIG.colors.label,
    logoText: data.logoText,
    
    // Images
    logoImage: 'logo.png',
    stripImage: 'strip.png',
    iconImage: 'icon.png',
    
    // Pass structure
    eventTicket: {
      headerFields: [
        {
          key: 'venue',
          label: FIELD_LABELS.venue,
          value: data.venueName
        }
      ],
      primaryFields: [
        {
          key: 'court',
          label: FIELD_LABELS.court,
          value: data.courtName
        }
      ],
      secondaryFields: [
        {
          key: 'date',
          label: FIELD_LABELS.date,
          value: displayDate
        },
        {
          key: 'time',
          label: FIELD_LABELS.time,
          value: `${data.startTime} - ${data.endTime}`
        }
      ],
      auxiliaryFields: [
        {
          key: 'name',
          label: FIELD_LABELS.name,
          value: data.userName
        }
      ],
      backFields: [
        {
          key: 'bookingId',
          label: FIELD_LABELS.bookingId,
          value: data.bookingId
        },
        {
          key: 'email',
          label: FIELD_LABELS.email,
          value: data.userEmail
        },
        {
          key: 'venueAddress',
          label: FIELD_LABELS.venueAddress,
          value: formattedAddress
        }
      ]
    },
    
    // Barcode for check-in
    barcodes: [
      {
        message: data.bookingId,
        format: 'PKBarcodeFormatQR',
        messageEncoding: WALLET_CONFIG.barcode.messageEncoding,
        altText: WALLET_CONFIG.barcode.alternateText
      }
    ]
  };
}

/**
 * Format the wallet pass data for Google Wallet
 * 
 * @param data The wallet pass data
 * @returns Formatted data for Google Wallet pass API
 */
export function formatGoogleWalletObject(data: WalletPassData) {
  // Format date for display
  const startDateTime = dayjs(`${data.date}T${data.startTime}`).toISOString();
  const endDateTime = dayjs(`${data.date}T${data.endTime}`).toISOString();
  
  // Format address for display
  const formattedAddress = [
    data.venueAddress,
    `${data.venuePostalCode} ${data.venueCity}`.trim(),
    data.venueCountry
  ].filter(Boolean).join(', ');
  
  // Class and object IDs
  const issuerID = WALLET_CONFIG.google.issuerId;
  const classId = `${issuerID}.${WALLET_CONFIG.google.classId}`;
  const objectId = `${classId}.${data.bookingId}`;
  
  return {
    eventTicketClass: {
      id: classId,
      issuerName: WALLET_CONFIG.organization.name,
      eventName: {
        defaultValue: {
          language: 'en-US',
          value: 'Court Booking'
        }
      },
      reviewStatus: 'UNDER_REVIEW',
      venue: {
        name: {
          defaultValue: {
            language: 'en-US',
            value: data.venueName
          }
        },
        address: {
          defaultValue: {
            language: 'en-US',
            value: formattedAddress
          }
        }
      },
      logo: {
        sourceUri: {
          uri: WALLET_CONFIG.assets.logo
        },
        contentDescription: {
          defaultValue: {
            language: 'en-US',
            value: WALLET_CONFIG.organization.name
          }
        }
      }
    },
    eventTicketObject: {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      heroImage: {
        sourceUri: {
          uri: WALLET_CONFIG.assets.strip
        },
        contentDescription: {
          defaultValue: {
            language: 'en-US',
            value: 'Court booking header image'
          }
        }
      },
      textModulesData: [
        {
          header: FIELD_LABELS.court,
          body: data.courtName,
          id: 'court'
        },
        {
          header: FIELD_LABELS.bookingId,
          body: data.bookingId,
          id: 'bookingId'
        },
        {
          header: FIELD_LABELS.name,
          body: data.userName,
          id: 'userName'
        }
      ],
      linksModuleData: {
        uris: [
          {
            uri: WALLET_CONFIG.organization.website,
            description: `${WALLET_CONFIG.organization.name} Website`,
            id: 'website'
          }
        ]
      },
      barcode: {
        type: WALLET_CONFIG.barcode.format,
        value: data.bookingId,
        alternateText: WALLET_CONFIG.barcode.alternateText
      },
      ticketHolderName: data.userName,
      ticketNumber: data.bookingId,
      seatInfo: {
        seat: {
          defaultValue: {
            language: 'en',
            value: data.courtName
          }
        }
      },
      eventName: {
        defaultValue: {
          language: 'en',
          value: 'Court Booking'
        }
      },
      dateTime: {
        start: startDateTime,
        end: endDateTime
      }
    }
  };
}
