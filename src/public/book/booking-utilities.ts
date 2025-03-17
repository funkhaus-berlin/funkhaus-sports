// src/public/book/BookingUtilities.ts

import dayjs from 'dayjs';
import qrcode from 'qrcode-generator';
import { Court } from 'src/db/courts.collection';
import { Booking } from './context';

/**
 * Provides utility functions for booking data display, export, and sharing
 */
export class BookingUtilities {
  /**
   * Generate downloadable calendar file (ICS)
   * 
   * @param booking The booking data
   * @param courtName Optional court name
   * @returns Data URI for downloading calendar file
   */
  generateCalendarFile(booking: Booking, courtName?: string): string {
    const startDate = dayjs(booking.startTime);
    const endDate = dayjs(booking.endTime);
    const eventTitle = `Court Booking: ${courtName || 'Tennis Court'}`;
    const location = 'Funkhaus Berlin Sports Center';
    const start = startDate.format('YYYYMMDDTHHmmss');
    const end = endDate.format('YYYYMMDDTHHmmss');
    const now = dayjs().format('YYYYMMDDTHHmmss');
    const uid = `booking-${booking.id || Math.random().toString(36).substring(2, 11)}@funkhaus-sports.com`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Funkhaus Berlin Sports//Court Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}Z`,
      `DTSTART:${start}Z`,
      `DTEND:${end}Z`,
      `SUMMARY:${eventTitle}`,
      `LOCATION:${location}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsContent);
  }

  /**
   * Generate a QR code with the booking details
   * 
   * @param booking The booking data
   * @param court Optional court information
   * @returns Data URL of the QR code
   */
  generateQRCodeDataUrl(booking: Booking, court?: Court): string {
    const bookingInfo = JSON.stringify({
      id: booking.id,
      date: booking.date,
      time: dayjs(booking.startTime).format('HH:mm'),
      court: court?.name || 'Court',
    });
    
    // Create QR code (type 0 is the default)
    const qr = qrcode(0, 'M');
    qr.addData(bookingInfo);
    qr.make();

    // Return the QR code as a data URL
    return qr.createDataURL(5); // 5 is the cell size in pixels
  }
  
  /**
   * Share booking details using Web Share API or fallback to clipboard
   * 
   * @param booking The booking data
   * @param courtName Optional court name
   */
  shareBooking(booking: Booking, courtName?: string): void {
    const startTime = dayjs(booking.startTime);
    const text = `I've booked a ${courtName || 'court'} at Funkhaus Berlin Sports on ${startTime.format('MMMM D')} at ${startTime.format(
      'h:mm A',
    )}. Join me!`;

    if (navigator.share) {
      navigator
        .share({
          title: 'My Court Booking',
          text: text,
          url: window.location.href,
        })
        .catch(error => console.log('Error sharing', error));
    } else {
      // Fallback to clipboard
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Booking details copied to clipboard!');
    }
  }
  
  /**
   * Format a date string for display
   * 
   * @param dateStr ISO date string
   * @returns Formatted date string (e.g., "Mon, Jan 15")
   */
  formatDate(dateStr: string): string {
    return dayjs(dateStr).format('ddd, MMM D');
  }
  
  /**
   * Format time range for display
   * 
   * @param startTime Start time ISO string
   * @param endTime End time ISO string
   * @returns Formatted time range (e.g., "2:30 PM - 4:00 PM")
   */
  formatTimeRange(startTime: string, endTime: string): string {
    return `${dayjs(startTime).format('h:mm A')} - ${dayjs(endTime).format('h:mm A')}`;
  }
  
  /**
   * Calculate and format booking duration
   * 
   * @param startTime Start time ISO string
   * @param endTime End time ISO string
   * @returns Formatted duration string (e.g., "1 hour 30 minutes")
   */
  formatDuration(startTime: string, endTime: string): string {
    const start = dayjs(startTime);
    const end = dayjs(endTime);
    const durationMinutes = end.diff(start, 'minute');
    
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    
    let durationText = '';
    
    if (hours > 0) {
      durationText += `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    
    if (minutes > 0) {
      if (hours > 0) durationText += ' ';
      durationText += `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    
    return durationText;
  }
  
  /**
   * Generate a download filename for QR code based on booking details
   * 
   * @param booking The booking data
   * @param court Optional court information
   * @param venue Optional venue information
   * @returns Sanitized filename
   */
  generateQRFilename(booking: Booking, court?: { name?: string }, venue?: { name?: string }): string {
    const formattedDate = dayjs(booking.startTime).format('dddd-MMM-DD-HH-mm');
    const venueName = (venue?.name || 'venue').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const courtName = (court?.name || 'court').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    
    return `booking-${venueName}-${courtName}-${formattedDate}.png`;
  }
}
