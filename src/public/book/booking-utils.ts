// src/public/book/booking-utils.ts

import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import qrcode from 'qrcode-generator'
import { Court } from 'src/db/courts.collection'
import { Booking } from './context'

// Set up dayjs plugins
dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Centralized utility class for booking-related functions
 * Consolidates formatting and utility methods from multiple files
 */
export class BookingUtils {
	/**
	 * Format date for display
	 * @param dateStr - Date string in any format dayjs can parse
	 * @param format - Optional format string (defaults to readable format)
	 */
	static formatDate(dateStr: string, format: string = 'ddd, MMM D, YYYY'): string {
		if (!dateStr) return 'TBD'

		try {
			return dayjs(dateStr).format(format)
		} catch (e) {
			console.error('Error formatting date:', e)
			return 'Invalid date'
		}
	}

	/**
	 * Format time from ISO string or any date string in 24-hour format
	 * @param timeStr - Time string in any format dayjs can parse
	 * @param format - Optional format string (defaults to 24-hour format)
	 */
	static formatTime(timeStr: string, format: string = 'HH:mm'): string {
		if (!timeStr) return 'TBD'

		try {
			return dayjs(timeStr).format(format)
		} catch (e) {
			console.error('Error formatting time:', e)
			return 'Invalid time'
		}
	}

	/**
	 * Format time range between two times
	 * @param startTime - Start time string
	 * @param endTime - End time string
	 */
	static formatTimeRange(startTime: string, endTime: string): string {
		return `${this.formatTime(startTime)} - ${this.formatTime(endTime)}`
	}

	/**
	 * Calculate and format duration between start and end times
	 * @param startTime - Start time string
	 * @param endTime - End time string
	 */
	static formatDuration(startTime: string, endTime: string): string {
		if (!startTime || !endTime) {
			return 'TBD'
		}

		try {
			const start = dayjs(startTime)
			const end = dayjs(endTime)
			const durationMinutes = end.diff(start, 'minute')

			if (isNaN(durationMinutes) || durationMinutes < 0) {
				return 'Invalid duration'
			}

			const hours = Math.floor(durationMinutes / 60)
			const minutes = durationMinutes % 60

			let durationText = ''

			if (hours > 0) {
				durationText += `${hours} hour${hours !== 1 ? 's' : ''}`
			}

			if (minutes > 0) {
				if (hours > 0) durationText += ' '
				durationText += `${minutes} minute${minutes !== 1 ? 's' : ''}`
			}

			return durationText || '0 minutes'
		} catch (e) {
			console.error('Error calculating duration:', e)
			return 'Invalid duration'
		}
	}

	/**
	 * Format price with currency symbol
	 * @param price - Price value
	 * @param currency - Currency symbol (defaults to Euro)
	 */
	static formatPrice(price: number | undefined, currency: string = '€'): string {
		return `${currency}${(price || 0).toFixed(2)}`
	}

	/**
	 * Generate a downloadable calendar file (ICS) for a booking
	 * @param booking - The booking data
	 * @param courtName - Optional court name for the event title
	 */
	static generateCalendarFile(booking: Booking, courtName?: string): string {
		const startDate = dayjs(booking.startTime)
		const endDate = dayjs(booking.endTime)
		const eventTitle = `Court Booking: ${courtName || 'Tennis Court'}`
		const location = 'Funkhaus Berlin Sports Center'
		const start = startDate.format('YYYYMMDDTHHmmss')
		const end = endDate.format('YYYYMMDDTHHmmss')
		const now = dayjs().format('YYYYMMDDTHHmmss')
		const uid = `booking-${booking.id || Math.random().toString(36).substring(2, 11)}@funkhaus-sports.com`

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
		].join('\r\n')

		return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsContent)
	}

	/**
	 * Generate a QR code with the booking details
	 * @param booking - The booking data
	 * @param court - Optional court information
	 */
	static generateQRCodeDataUrl(booking: Booking, court?: Court): string {
		const bookingInfo = JSON.stringify({
			id: booking.id,
			date: booking.date,
			time: dayjs(booking.startTime).format('HH:mm'),
			court: court?.name || 'Court',
		})

		// Create QR code (type 0 is the default)
		const qr = qrcode(0, 'M')
		qr.addData(bookingInfo)
		qr.make()

		// Return the QR code as a data URL
		return qr.createDataURL(5) // 5 is the cell size in pixels
	}

	/**
	 * Generate a filename for QR code download
	 * @param booking - The booking data
	 * @param court - Optional court information
	 * @param venue - Optional venue information
	 */
	static generateQRFilename(booking: Booking, court?: { name?: string }, venue?: { name?: string }): string {
		const formattedDate = dayjs(booking.startTime).format('dddd-MMM-DD-HH-mm')
		const venueName = (venue?.name || 'venue').replace(/[^a-z0-9]/gi, '-').toLowerCase()
		const courtName = (court?.name || 'court').replace(/[^a-z0-9]/gi, '-').toLowerCase()

		return `booking-${venueName}-${courtName}-${formattedDate}.png`
	}

	/**
	 * Share booking details using Web Share API or fallback to clipboard
	 * @param booking - The booking data
	 * @param courtName - Optional court name
	 */
	static shareBooking(booking: Booking, courtName?: string): void {
		const startTime = dayjs(booking.startTime)
		const text = `I've booked Court ${courtName || 'court'} at Funkhaus Berlin Sports on ${startTime.format(
			'MMMM D',
		)} at ${startTime.format('HH:mm')}. Join me!`

		if (navigator.share) {
			navigator
				.share({
					title: 'My Court Booking',
					text: text,
					url: window.location.href,
				})
				.catch(error => console.log('Error sharing', error))
		} else {
			// Fallback to clipboard
			const textArea = document.createElement('textarea')
			textArea.value = text
			document.body.appendChild(textArea)
			textArea.select()
			document.execCommand('copy')
			document.body.removeChild(textArea)
			alert('Booking details copied to clipboard!')
		}
	}
}
