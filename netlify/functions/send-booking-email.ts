// netlify/functions/send-booking-email.ts
import { Handler } from '@netlify/functions'
import admin from 'firebase-admin'

import { resolve } from 'path'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { corsHeaders } from './_shared/cors'
import { emailConfig } from './_shared/email-config'
import resend, { emailHtml } from './_shared/resend'

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
	admin.initializeApp({
		credential: admin.credential.cert({
			projectId: process.env.FIREBASE_PROJECT_ID,
			clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
			privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
		}),
	})
}

const db = admin.firestore()

/**
 * Email handler for sending booking confirmations
 */
interface EmailBookingData {
	bookingId: string
	customerEmail: string
	customerName: string
	customerPhone: string
	venueInfo: {
		name: string
		address: string
		city: string
		postalCode: string
		country: string
	}
	bookingDetails: {
		date: string
		startTime: string
		endTime: string
		price: string
		court: string
		venue: string
	}
}
const handler: Handler = async (event, context) => {
	// Handle preflight request for CORS
	if (event.httpMethod === 'OPTIONS') {
		return {
			statusCode: 200,
			headers: corsHeaders,
			body: '',
		}
	}

	// Only allow POST requests
	if (event.httpMethod !== 'POST') {
		return {
			statusCode: 405,
			headers: corsHeaders,
			body: JSON.stringify({ error: 'Method Not Allowed' }),
		}
	}

	try {
		// Parse the request body
		const data: EmailBookingData = JSON.parse(event.body || '{}')

		// Validate required fields
		if (!data.bookingId || !data.customerEmail || !data.bookingDetails) {
			return {
				statusCode: 400,
				headers: corsHeaders,
				body: JSON.stringify({ error: 'Missing required fields' }),
			}
		}

		// Generate PDF
		const pdfBuffer = await generateBookingPDF(data)

		// Send the email
		const emailSent = await sendEmail(data, pdfBuffer)

		if (emailSent) {
			// Update booking record to indicate email was sent
			const bookingRef = db.collection('bookings').doc(data.bookingId)
			await bookingRef.update({
				emailSent: true,
				emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
			})

			return {
				statusCode: 200,
				headers: corsHeaders,
				body: JSON.stringify({
					success: true,
					message: 'Email sent successfully',
				}),
			}
		} else {
			return {
				statusCode: 500,
				headers: corsHeaders,
				body: JSON.stringify({
					error: 'Failed to send email',
				}),
			}
		}
	} catch (error) {
		console.error('Error sending booking email:', error)

		return {
			statusCode: 500,
			headers: corsHeaders,
			body: JSON.stringify({
				error: `Error sending email: ${error.message || 'Unknown error'}`,
			}),
		}
	}
}

/**
 * Send email with booking confirmation using Resend
 */
async function sendEmail(data: EmailBookingData, pdfBuffer: Buffer): Promise<boolean> {
	try {
		// Convert buffer to base64 for attachment
		const pdfBase64 = pdfBuffer.toString('base64')
		
		// Generate ICS calendar file
		console.log('Generating ICS file for booking:', data.bookingId)
		const icsContent = generateICSFile(data)
		const icsBase64 = Buffer.from(icsContent).toString('base64')
		
		console.log('Generating email HTML content')
		const html = await emailHtml({
			booking: data.bookingDetails,
			customer: {
				name: data.customerName,
				email: data.customerEmail,
				phone: data.customerPhone,
			},
			venue: data.venueInfo,
		})
		
		if (!html) {
			throw new Error('Failed to generate email HTML content')
		}
		
		console.log('Sending email to:', data.customerEmail)
		// Send email with Resend
		const response = await resend.emails.send({
			from: `${emailConfig.fromName} <${emailConfig.from}>`,
			to: data.customerEmail,
			subject: `Your Court Booking Confirmation - ${data.bookingDetails.court}`,
			html: html,
			attachments: [
				{
					filename: `Booking-${data.bookingId}.pdf`,
					content: pdfBase64,
				},
				{
					filename: 'booking-event.ics',
					content: icsBase64,
				},
			],
		})

		console.log('Email sent successfully with Resend:', response)
		return true
	} catch (error) {
		console.error('Error sending email with Resend:', error)
		// Log more detailed error information
		if (error instanceof Error) {
			console.error('Error name:', error.name)
			console.error('Error message:', error.message)
			console.error('Error stack:', error.stack)
		}
		
		// Try to identify specific issues
		if (error instanceof RangeError && error.message.includes('Invalid time value')) {
			console.error('Date/time validation failed, likely invalid date in booking details:', {
				date: data.bookingDetails.date,
				startTime: data.bookingDetails.startTime,
				endTime: data.bookingDetails.endTime,
			})
		}
		
		return false
	}
}

/**
 * Generate an ICS file for calendar applications
 */
function generateICSFile(data: EmailBookingData): string {
	try {
		// Ensure date and time values exist and have the expected format
		if (!data.bookingDetails.date || 
			!data.bookingDetails.startTime || 
			!data.bookingDetails.endTime) {
			console.error('Missing required date or time fields in booking data:', data.bookingDetails)
			throw new Error('Missing date or time data')
		}
		
		// Check if raw values exist in the booking details
		const hasRawValues = data.bookingDetails['rawDate'] && 
						   data.bookingDetails['rawStartTime'] && 
						   data.bookingDetails['rawEndTime']
		
		console.log('Date and time values:', {
			date: data.bookingDetails.date,
			startTime: data.bookingDetails.startTime,
			endTime: data.bookingDetails.endTime,
			rawDate: data.bookingDetails['rawDate'],
			rawStartTime: data.bookingDetails['rawStartTime'],
			rawEndTime: data.bookingDetails['rawEndTime'],
			usingRawValues: hasRawValues
		})
		
		// Parse date - prefer raw values if available
		let year: number, month: number, day: number
		
		if (hasRawValues && data.bookingDetails['rawDate']) {
			// Use raw date if available
			const rawDateMatch = data.bookingDetails['rawDate'].match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
			if (rawDateMatch) {
				year = parseInt(rawDateMatch[1], 10)
				month = parseInt(rawDateMatch[2], 10)
				day = parseInt(rawDateMatch[3], 10)
			} else {
				throw new Error(`Invalid raw date format: ${data.bookingDetails['rawDate']}`)
			}
		} else {
			// Fall back to original date parsing logic
			// Check if date is in YYYY-MM-DD format
			const isoDateMatch = data.bookingDetails.date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
			if (isoDateMatch) {
				year = parseInt(isoDateMatch[1], 10)
				month = parseInt(isoDateMatch[2], 10)
				day = parseInt(isoDateMatch[3], 10)
			} else {
				// Try to handle formatted date string (e.g., "Monday, January 1, 2023")
				try {
					// Convert the formatted date back to a Date object
					const parsedDate = new Date(data.bookingDetails.date)
					if (isNaN(parsedDate.getTime())) {
						throw new Error(`Cannot parse date string: ${data.bookingDetails.date}`)
					}
					
					year = parsedDate.getFullYear()
					month = parsedDate.getMonth() + 1 // JavaScript months are 0-indexed
					day = parsedDate.getDate()
				} catch (err) {
					console.error('Date parsing error:', err)
					throw new Error(`Invalid date format: ${data.bookingDetails.date}`)
				}
			}
		}
		
		// Check for valid date components
		if (isNaN(year) || isNaN(month) || isNaN(day) || 
			year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
			throw new Error(`Invalid date values: year=${year}, month=${month}, day=${day}`)
		}
		
		// Parse time values - handle raw values if available, otherwise use formatted times
		let startHour: number, startMinute: number, endHour: number, endMinute: number
		
		// Helper function to parse time values
		const parseTimeValue = (timeStr: string): { hour: number, minute: number } => {
			// Check for HH:MM format
			const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/)
			if (timeMatch) {
				return {
					hour: parseInt(timeMatch[1], 10),
					minute: parseInt(timeMatch[2], 10)
				}
			}
			
			// Try to handle formatted time (e.g., "2:30 PM")
			try {
				// Use a dummy date to parse the time
				const dummyDate = new Date(`1/1/2000 ${timeStr}`)
				if (isNaN(dummyDate.getTime())) {
					throw new Error(`Cannot parse time string: ${timeStr}`)
				}
				
				return {
					hour: dummyDate.getHours(),
					minute: dummyDate.getMinutes()
				}
			} catch (err) {
				console.error('Time parsing error:', err)
				throw new Error(`Invalid time format: ${timeStr}`)
			}
		}
		
		// Use raw time values if available, otherwise parse formatted times
		if (hasRawValues && data.bookingDetails['rawStartTime'] && data.bookingDetails['rawEndTime']) {
			const rawStartTime = parseTimeValue(data.bookingDetails['rawStartTime'])
			const rawEndTime = parseTimeValue(data.bookingDetails['rawEndTime'])
			
			startHour = rawStartTime.hour
			startMinute = rawStartTime.minute
			endHour = rawEndTime.hour
			endMinute = rawEndTime.minute
		} else {
			const startTime = parseTimeValue(data.bookingDetails.startTime)
			const endTime = parseTimeValue(data.bookingDetails.endTime)
			
			startHour = startTime.hour
			startMinute = startTime.minute
			endHour = endTime.hour
			endMinute = endTime.minute
		}
		
		// Check for valid time components
		if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute) ||
			startHour < 0 || startHour > 23 || startMinute < 0 || startMinute > 59 ||
			endHour < 0 || endHour > 23 || endMinute < 0 || endMinute > 59) {
			throw new Error(`Invalid time values: startHour=${startHour}, startMinute=${startMinute}, endHour=${endHour}, endMinute=${endMinute}`)
		}
		
		console.log('Parsed date and time components:', { 
			year, month, day, 
			startHour, startMinute, 
			endHour, endMinute 
		})
		
		// Create JavaScript Date objects
		const startDate = new Date(year, month - 1, day, startHour, startMinute)
		const endDate = new Date(year, month - 1, day, endHour, endMinute)
	
		console.log('Created dates:', { 
			startDate: startDate.toString(), 
			endDate: endDate.toString(),
			startDateValid: !isNaN(startDate.getTime()),
			endDateValid: !isNaN(endDate.getTime())
		})
		
		if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
			throw new Error('Invalid date created: ' + 
				(isNaN(startDate.getTime()) ? `startDate: ${startDate}` : '') + 
				(isNaN(endDate.getTime()) ? `endDate: ${endDate}` : ''))
		}
		
		// Format dates for ICS file (YYYYMMDDTHHMMSSZ format)
		const formatDateForICS = (date: Date): string => {
			return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
		}
		
		const startDateICS = formatDateForICS(startDate)
		const endDateICS = formatDateForICS(endDate)
		const now = formatDateForICS(new Date())
		
		// Create a unique identifier for the event
		const uid = `booking-${data.bookingId}@funkhaus-sports.com`
		
		// Build the location string
		const location = data.venueInfo ? 
			`${data.venueInfo.name}, ${data.venueInfo.address}, ${data.venueInfo.postalCode} ${data.venueInfo.city}, ${data.venueInfo.country}` : 
			data.bookingDetails.venue
		
		// Create the ICS content
		return [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Funkhaus Sports//Court Booking//EN',
			'CALSCALE:GREGORIAN',
			'METHOD:PUBLISH',
			'BEGIN:VEVENT',
			`UID:${uid}`,
			`DTSTAMP:${now}`,
			`DTSTART:${startDateICS}`,
			`DTEND:${endDateICS}`,
			`SUMMARY:${data.bookingDetails.court} - ${data.bookingDetails.venue}`,
			`DESCRIPTION:Your court booking at ${data.bookingDetails.venue}. Booking ID: ${data.bookingId}`,
			`LOCATION:${location}`,
			'STATUS:CONFIRMED',
			'SEQUENCE:0',
			'BEGIN:VALARM',
			'TRIGGER:-PT30M',
			'ACTION:DISPLAY',
			'DESCRIPTION:Reminder: Your court booking starts in 30 minutes',
			'END:VALARM',
			'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n')
	} catch (error) {
		console.error('Error generating ICS file:', error)
		
		// Create a fallback ICS with current date/time as placeholder
		const now = new Date()
		const later = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour later
		
		const formatDateForFallback = (date: Date): string => {
			return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
		}
		
		const nowICS = formatDateForFallback(now)
		const laterICS = formatDateForFallback(later)
		
		// Create a unique identifier for the event
		const uid = `booking-${data.bookingId || 'unknown'}@funkhaus-sports.com`
		
		// Create a simplified ICS content as fallback
		return [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Funkhaus Sports//Court Booking//EN',
			'CALSCALE:GREGORIAN',
			'METHOD:PUBLISH',
			'BEGIN:VEVENT',
			`UID:${uid}`,
			`DTSTAMP:${nowICS}`,
			`DTSTART:${nowICS}`,
			`DTEND:${laterICS}`,
			`SUMMARY:Court Booking - ${data.bookingDetails?.venue || 'Unknown Venue'}`,
			`DESCRIPTION:Your court booking. Booking ID: ${data.bookingId || 'Unknown'}`,
			'STATUS:CONFIRMED',
			'SEQUENCE:0',
			'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n')
	}
}

/**
 * Generate invoice PDF with booking details
 */
async function generateBookingPDF(data: any): Promise<Buffer> {
	// Create a new PDF document

	// Register custom fonts

	const doc = new PDFDocument({
		size: 'A4',
		margin: 50,
		font: resolve(__dirname, './_shared/assets/JosefinSans-Regular.ttf'),
	})
	doc.registerFont('Regular', resolve(__dirname, './_shared/assets/JosefinSans-Regular.ttf'))
	doc.registerFont('Bold', resolve(__dirname, './_shared/assets/JosefinSans-Bold.ttf'))

	let buffers: Array<Buffer> = []
	doc.on('data', chunk => buffers.push(chunk))

	// Header - Invoice title
	let y = 90
	doc.font('Bold').fontSize(24).fillColor('#333333').text('INVOICE', 50, 65)
	doc.fillColor('#000000')

	// invoice number - using booking ID
	doc
		.font('Bold')
		.fontSize(12)
		.text('Invoice Number:', 50, (y += 4))
	doc.font('Regular').text(`FBB-${data.bookingId.substring(0, 6)}`, 150, y)

	// invoice date
	doc.font('Bold').text('Date of Issue:', 50, (y += 15))
	doc.font('Regular').text(
		new Date().toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		}),
		150,
		y,
	)

	// Service date
	doc.font('Bold').text('Service Date:', 50, (y += 15))
	doc.font('Regular').text(data.bookingDetails.date, 150, y)

	// Try to add QR code
	try {
		// Generate QR code
		const qrCodeData = await QRCode.toDataURL(data.bookingId)
		doc.image(qrCodeData, 450, 50, { width: 80, height: 80 })
		doc.font('Regular').text('Your Ticket', 450, 130)
	} catch (err) {
		console.error('Error generating QR code:', err)
	}

	// Draw a line under the header section
	doc
		.strokeColor('#cccccc')
		.lineWidth(1)
		.moveTo(50, y + 20)
		.lineTo(550, y + 20)
		.stroke()

	y += 40

	// Buyer Information (left side)
	doc.font('Bold').fontSize(14).text('Bill To:', 50, y)
	y += 20
	doc.font('Regular').fontSize(12)
	doc.text(data.customerName, 50, y)
	y += 15

	// Add customer address if available
	if (data.customerAddress) {
		if (data.customerAddress.street) {
			doc.text(data.customerAddress.street, 50, y)
			y += 15
		}

		let locationLine = ''
		if (data.customerAddress.postalCode) locationLine += data.customerAddress.postalCode + ' '
		if (data.customerAddress.city) locationLine += data.customerAddress.city

		if (locationLine) {
			doc.text(locationLine, 50, y)
			y += 15
		}

		if (data.customerAddress.country) {
			doc.text(data.customerAddress.country, 50, y)
			y += 15
		}
	}

	// Add contact information
	doc.text(data.customerEmail || '', 50, y)
	y += 15

	if (data.customerPhone) {
		doc.text(data.customerPhone, 50, y)
		y += 15
	}

	// Seller Information (Right side)
	y = 165 // Reset Y position for right column
	doc.font('Bold').fontSize(14).text('Bill From:', 300, y)
	y += 20
	doc.font('Regular').fontSize(12)
	doc.text('Funkhaus Sports GmbH', 300, y)
	y += 15
	doc.text('Nalepastrasse 18', 300, y)
	y += 15
	doc.text('12459 Berlin, Germany', 300, y)
	y += 15
	doc.text('VAT: DE452192572', 300, y)
	y += 15
	doc.text('funkhaus-sports.com', 300, y)

	// Move to the invoice items section
	y = 300

	// Draw table headers with background
	doc.fillColor('#f5f5f5').rect(50, y, 500, 25).fill()
	doc.fillColor('#000000')

	// Table headers
	doc.font('Bold').fontSize(12)
	doc.text('Description', 60, y + 8)
	doc.text('Duration', 230, y + 8)
	doc.text('Amount', 470, y + 8)

	y += 25

	// Calculate VAT
	const vatRate = 0.07 // 7%
	const totalAmount = parseFloat(data.bookingDetails.price)
	const netAmount = totalAmount / (1 + vatRate)
	const vatAmount = totalAmount - netAmount

	// Format the description
	const description = `${data.bookingDetails.court} - ${data.bookingDetails.venue}`
	const duration = `${data.bookingDetails.startTime} - ${data.bookingDetails.endTime}`

	// Invoice item
	doc.font('Regular').fontSize(12)
	doc.text(description, 60, y + 8, { width: 240 })
	doc.text(duration, 230, y + 8)
	doc.text(`€${netAmount.toFixed(2)}`, 470, y + 8)

	y += 30

	// Draw line before summary
	doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, y).lineTo(550, y).stroke()

	y += 15

	// Summary section
	// Net total
	doc.font('Regular').text('Net Total:', 390, y)
	doc.text(`€${netAmount.toFixed(2)}`, 470, y)

	y += 20

	// VAT
	doc.text(`VAT (${(vatRate * 100).toFixed(0)}%):`, 390, y)
	doc.text(`€${vatAmount.toFixed(2)}`, 470, y)

	y += 5

	// Draw line above total
	doc
		.strokeColor('#000000')
		.lineWidth(1)
		.moveTo(390, y + 10)
		.lineTo(550, y + 10)
		.stroke()

	y += 15

	// Total
	doc.font('Bold').fillColor('#000000').text('TOTAL:', 390, y)
	doc.text(`€${totalAmount.toFixed(2)}`, 470, y)
	doc.fillColor('#000000')

	// Footer
	const footerY = 600

	// Payment Information
	doc.font('Bold').fontSize(12).text('Payment Information:', 50, footerY)
	doc.font('Regular').fontSize(12)
	doc.text('Funkhaus Sports GmbH', 50, footerY + 15)
	doc.text('IBAN: DE22 1009 0000 2999 2310 07', 50, footerY + 30)
	doc.text('BIC: BEVODEBBXXX', 50, footerY + 45)

	// Thank you note
	doc.text('Thank you for your business!', 50, footerY + 75)

	// Draw final line
	doc
		.strokeColor('#cccccc')
		.lineWidth(1)
		.moveTo(50, footerY + 100)
		.lineTo(550, footerY + 100)
		.stroke()

	// Page number and date
	doc.fontSize(10).text(new Date().toISOString().split('T')[0], 50, footerY + 115)
	doc.text('Page 1 of 1', 450, footerY + 115)

	// End the document
	doc.end()

	// Return a promise that resolves with the PDF buffer
	return new Promise<Buffer>(resolve => {
		doc.on('end', () => {
			resolve(Buffer.concat(buffers))
		})
	})
}
export { handler }
