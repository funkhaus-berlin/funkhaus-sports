// netlify/functions/_shared/db-service.ts

import { db } from "./firebase-admin";




// Set TS compiler to ignore 'any' types in this file 
// @ts-ignore

/**
 * Simple DB access for serverless functions
 */
export const DBService = {
  // Get booking by ID
  async getBooking(id) {
    try {
      const doc = await db.collection('bookings').doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error(`Error getting booking ${id}:`, error);
      return null;
    }
  },

  // Get court by ID
  async getCourt(id) {
    try {
      const doc = await db.collection('courts').doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error(`Error getting court ${id}:`, error);
      return null;
    }
  },

  // Get venue by ID
  async getVenue(id) {
    try {
      const doc = await db.collection('venues').doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error(`Error getting venue ${id}:`, error);
      return null;
    }
  },

  // Get booking with related data
  async getBookingWithRelated(bookingId) {
    try {
      // Get booking
      // @ts-ignore
      const booking = await this.getBooking(bookingId);
      if (!booking) return { booking: null, court: null, venue: null };

      // Get court
      let court = null;
      // @ts-ignore
      if (booking.courtId) {
        // @ts-ignore
        court = await this.getCourt(booking.courtId);
      }

      // Get venue
      let venue = null;
      // @ts-ignore
      if (court && court.venueId) {
        // @ts-ignore
        venue = await this.getVenue(court.venueId);
      // @ts-ignore
      } else if (booking.venueId) {
        // @ts-ignore
        venue = await this.getVenue(booking.venueId);
      }

      return { booking, court, venue };
    } catch (error) {
      console.error('Error in getBookingWithRelated:', error);
      return { booking: null, court: null, venue: null };
    }
  }
};

// Export db for direct access
export { db };
