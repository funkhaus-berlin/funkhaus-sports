// netlify/functions/send-booking-email.ts
import { Handler } from '@netlify/functions'
import admin from 'firebase-admin'

import { resolve } from 'path'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { createCalendarEvent, generateICSFile } from './_shared/calendar-utils'
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
import {
  BookingEmailRequest as EmailBookingData
} from './types/shared-types'
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
				emailSentAt: new Date().toISOString(),
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
		
		// Build the venue address string based on the venue interface (Address type)
		let venueAddress = data.bookingDetails.venue
		
		// Check if venue info is available
		if (data.venueInfo) {
			try {
				const addressParts: string[] = []
				
				// Handle address which could be a string or an object
				if (data.venueInfo.address) {
					if (typeof data.venueInfo.address === 'string') {
						// If it's a simple string
						addressParts.push(data.venueInfo.address)
					} else if (typeof data.venueInfo.address === 'object' && data.venueInfo.address.street) {
						// If it's an object with a street property
						addressParts.push(data.venueInfo.address.street)
					}
				}
				
				// Format city and postal code
				const cityPostal: string[] = []
				
				// Check direct properties first
				if (data.venueInfo.postalCode) {
					cityPostal.push(data.venueInfo.postalCode)
				} else if (typeof data.venueInfo.address === 'object' && data.venueInfo.address.postalCode) {
					cityPostal.push(data.venueInfo.address.postalCode)
				}
				
				if (data.venueInfo.city) {
					cityPostal.push(data.venueInfo.city)
				} else if (typeof data.venueInfo.address === 'object' && data.venueInfo.address.city) {
					cityPostal.push(data.venueInfo.address.city)
				}
				
				if (cityPostal.length > 0) {
					addressParts.push(cityPostal.join(' '))
				}
				
				// Add country if available (check both direct and nested properties)
				let country = data.venueInfo.country
				if (!country && typeof data.venueInfo.address === 'object' && data.venueInfo.address.country) {
					country = data.venueInfo.address.country
				}
				
				if (country) {
					addressParts.push(country)
				}
				
				// Only update venueAddress if we have valid parts
				if (addressParts.length > 0) {
					venueAddress = addressParts.join(', ')
				}
			} catch (error) {
				console.error('Error formatting venue address:', error)
				// Keep the default venue address from booking details
			}
		}
		
		// Create calendar event data
		const calendarEvent = createCalendarEvent(
			data.bookingId,
			data.bookingDetails.court,
			data.bookingDetails.venue,
			venueAddress,
			data.bookingDetails.startTime,
			data.bookingDetails.endTime,
			data.bookingDetails.date,
			`Court: ${data.bookingDetails.court}\nPrice: €${data.bookingDetails.price}`
		)
		
		// Generate ICS file for calendar data only
		generateICSFile(calendarEvent)
		
		// Set up images for email clients using absolute URLs to ensure proper rendering
		const baseUrl = 'https://funkhaus-sports.netlify.app'
		
		// Use complete URLs with netlify cache-busting query parameter to prevent routing issues
		const emailImages = {
			googleCalendar: `${baseUrl}/icons/google-calendar-2020.png?v=1`,
			outlookCalendar: `${baseUrl}/icons/outlook-calendar.png?v=1`,
			appleCalendar: `${baseUrl}/icons/apple-calendar.png?v=1`,
			calendarIcon: `${baseUrl}/icons/calendar.png?v=1`,
			logo: `${baseUrl}/logo-light.png`
		}
		
		// Check if there's an invoice number stored in the booking or use the one provided
		// NOTE: We should never generate invoice numbers here, only use existing ones
		let invoiceNumber: string | undefined = undefined
		
		// First check if an invoice number was provided in the email data
		if (data.invoiceNumber) {
			invoiceNumber = data.invoiceNumber
			console.log(`Using provided invoice number ${invoiceNumber} for booking ${data.bookingId}`)
		} else {
			// Otherwise look it up from the database
			try {
				const bookingRef = db.collection('bookings').doc(data.bookingId)
				const bookingDoc = await bookingRef.get()
				
				if (bookingDoc.exists && bookingDoc.data()?.invoiceNumber) {
					invoiceNumber = bookingDoc.data()?.invoiceNumber
					console.log(`Using database invoice number ${invoiceNumber} for booking ${data.bookingId}`)
				} else {
					// No invoice number exists - use a placeholder for display but don't save it
					invoiceNumber = `${data.bookingId.substring(0, 6)}`
					console.warn(`No invoice number found for booking ${data.bookingId}. Using placeholder.`)
				}
			} catch (error) {
				console.error('Error retrieving invoice number from booking:', error)
				// Fall back to placeholder for display only
				invoiceNumber = `${data.bookingId.substring(0, 6)}`
			}
		}
		
		// Create wallet URLs (move logic outside the template)
		const apiUrl = 'https://funkhaus-sports.netlify.app/api/generate-wallet-pass'
		const appleWalletUrl = `${apiUrl}?platform=apple&bookingId=${data.bookingId}`
		const googleWalletUrl = `${apiUrl}?platform=google&bookingId=${data.bookingId}`
		
		// Format time display for the template
		let timeDisplay = '';
		
		// First try to use calendar event's display time
		if (calendarEvent && calendarEvent.displayTimeRange) {
			timeDisplay = calendarEvent.displayTimeRange;
		} else {
			// Otherwise format booking times
			let startTime = data.bookingDetails.startTime;
			let endTime = data.bookingDetails.endTime;
			
			// Process start time
			if (startTime) {
				if (startTime.includes('T')) {
					// Handle ISO format
					startTime = new Date(startTime).toLocaleTimeString('en-GB', {
						hour: '2-digit',
						minute: '2-digit',
						hour12: false
					});
				} else {
					// Handle string format with AM/PM
					const startMatch = /(\d+):(\d+)\s*(am|pm|AM|PM)?/.exec(startTime);
					if (startMatch) {
						let hours = parseInt(startMatch[1]);
						const mins = parseInt(startMatch[2]);
						const ampm = startMatch[3]?.toLowerCase();
						
						if (ampm === 'pm' && hours < 12) hours += 12;
						if (ampm === 'am' && hours === 12) hours = 0;
						
						startTime = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
					}
				}
			}
			
			// Process end time
			if (endTime) {
				if (endTime.includes('T')) {
					// Handle ISO format
					endTime = new Date(endTime).toLocaleTimeString('en-GB', {
						hour: '2-digit',
						minute: '2-digit',
						hour12: false
					});
				} else {
					// Handle string format with AM/PM
					const endMatch = /(\d+):(\d+)\s*(am|pm|AM|PM)?/.exec(endTime);
					if (endMatch) {
						let hours = parseInt(endMatch[1]);
						const mins = parseInt(endMatch[2]);
						const ampm = endMatch[3]?.toLowerCase();
						
						if (ampm === 'pm' && hours < 12) hours += 12;
						if (ampm === 'am' && hours === 12) hours = 0;
						
						endTime = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
					}
				}
			}
			
			// Format the time display
			timeDisplay = `${startTime || ''} - ${endTime || ''}`;
		}
		
		// Generate HTML for email
		const html = await emailHtml({
			booking: data.bookingDetails,
			customer: {
				name: data.customerName,
				email: data.customerEmail,
				phone: data.customerPhone,
			},
			venue: data.venueInfo,
			bookingId: data.bookingId,
			invoiceNumber: invoiceNumber || '', // Add invoice number to template data with fallback
			calendarEvent: calendarEvent, // Pass calendar event data to template
			images: emailImages, // Pass image URLs to template
			timeDisplay, // Pass pre-formatted time display
			appleWalletUrl, // Pass Apple Wallet URL
			googleWalletUrl, // Pass Google Wallet URL
			appleWalletIcon: `${baseUrl}/icons/wallet/apple-wallet-button.png`, // Official Apple button hosted locally
			googleWalletIcon: `${baseUrl}/icons/wallet/google-wallet-button.png` // Official Google button hosted locally
		})
		
		if (!html) {
			throw new Error('Failed to generate email HTML content')
		}
		
		// Format date and time in English style with 24-hour time
		const bookingDate = new Date(data.bookingDetails.date)
		const formattedDate = bookingDate.toLocaleDateString('en-GB', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		})
		
		// Extract time from booking details for email subject and format as 24-hour time
		let startTime = data.bookingDetails.startTime
		
		// Convert to 24-hour format regardless of input format
		try {
		    if (startTime && startTime.includes('T')) {
		        // If it's an ISO string, format as 24-hour time
		        startTime = new Date(startTime).toLocaleTimeString('en-GB', {
		            hour: '2-digit',
		            minute: '2-digit',
		            hour12: false
		        });
		    } else if (startTime) {
		        // Handle non-ISO time strings (like "4:30 PM")
		        const amPmMatch = /(\d+):(\d+)\s*(am|pm|AM|PM)?/.exec(startTime);
		        if (amPmMatch) {
		            let hours = parseInt(amPmMatch[1]);
		            const minutes = parseInt(amPmMatch[2]);
		            const ampm = amPmMatch[3]?.toLowerCase();
		            
		            // Convert to 24-hour format
		            if (ampm === 'pm' && hours < 12) hours += 12;
		            if (ampm === 'am' && hours === 12) hours = 0;
		            
		            // Format with leading zeros
		            startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
		        }
		    }
		} catch (error) {
		    console.error('Error formatting time for email subject:', error);
		    // If there's an error, use the original time string
		}

		// Send email with Resend
		const response = await resend.emails.send({
			from: `${emailConfig.fromName} <${emailConfig.from}>`,
			to: data.customerEmail,
			subject: `Funkhaus Sports - Court Booking Confirmation - ${formattedDate} at ${startTime}`,
			html: html,
			attachments: [
				{
					filename: `${invoiceNumber || 'Booking'}.pdf`,
					content: pdfBase64,
				}
			],
		})

		return true
	} catch (error) {
		console.error('Error sending email with Resend:', error)
		
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
	
	// Look up invoice number but NEVER create a new one here
	// Invoices should be created ONLY in the payment confirmation webhook
	let invoiceNumber: string | undefined = undefined
	
	try {
		// Check if this booking already has an invoice number
		const bookingRef = db.collection('bookings').doc(data.bookingId)
		const bookingDoc = await bookingRef.get()
		
		if (bookingDoc.exists) {
			// If the booking has an invoice number, use it
			if (bookingDoc.data()?.invoiceNumber) {
				invoiceNumber = bookingDoc.data()?.invoiceNumber
				console.log(`Using existing invoice number ${invoiceNumber} for booking ${data.bookingId}`)
			} else {
				// No invoice number exists yet - this would be unusual and indicates a problem
				// in the payment process. Log this situation but don't create a new invoice number.
				console.warn(`Booking ${data.bookingId} does not have an invoice number. This is unexpected at the email stage.`)
				// Use booking ID as fallback for display purposes only, but don't save it
				invoiceNumber = `${data.bookingId.substring(0, 6)}`
			}
		} else {
			console.warn(`Booking ${data.bookingId} not found in database, using fallback invoice number`)
			// Use booking ID as fallback for display purposes only
			invoiceNumber = `${data.bookingId.substring(0, 6)}`
		}
	} catch (error) {
		console.error('Error retrieving invoice number:', error)
		// Fall back to using booking ID if there's an error, but only for display
		invoiceNumber = `${data.bookingId.substring(0, 6)}`
	}

	// Header - Invoice title
	let y = 90
	doc.font('Bold').fontSize(24).fillColor('#333333').text('INVOICE', 50, 65)
	doc.fillColor('#000000')

	// invoice number - using sequential counter
	doc
		.font('Bold')
		.fontSize(12)
		.text('Invoice Number:', 50, (y += 4))
	doc.font('Regular').text(invoiceNumber || 'N/A', 150, y)

	// invoice date
	doc.font('Bold').text('Date of Issue:', 50, (y += 15))
	doc.font('Regular').text(
		new Date().toLocaleDateString('en-GB', {
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
	
	// Format duration with 24-hour time
	let startTime = data.bookingDetails.startTime;
	let endTime = data.bookingDetails.endTime;
	
	// Convert times to 24-hour format
	if (startTime && startTime.includes('T')) {
	    startTime = new Date(startTime).toLocaleTimeString('en-GB', {
	        hour: '2-digit',
	        minute: '2-digit',
	        hour12: false
	    });
	} else if (startTime) {
	    // Handle non-ISO time strings (like "4:30 PM")
	    const amPmMatch = /(\d+):(\d+)\s*(am|pm|AM|PM)?/.exec(startTime);
	    if (amPmMatch) {
	        let hours = parseInt(amPmMatch[1]);
	        const minutes = parseInt(amPmMatch[2]);
	        const ampm = amPmMatch[3]?.toLowerCase();
	        
	        // Convert to 24-hour format
	        if (ampm === 'pm' && hours < 12) hours += 12;
	        if (ampm === 'am' && hours === 12) hours = 0;
	        
	        // Format with leading zeros
	        startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
	    }
	}
	
	if (endTime && endTime.includes('T')) {
	    endTime = new Date(endTime).toLocaleTimeString('en-GB', {
	        hour: '2-digit',
	        minute: '2-digit',
	        hour12: false
	    });
	} else if (endTime) {
	    // Handle non-ISO time strings
	    const amPmMatch = /(\d+):(\d+)\s*(am|pm|AM|PM)?/.exec(endTime);
	    if (amPmMatch) {
	        let hours = parseInt(amPmMatch[1]);
	        const minutes = parseInt(amPmMatch[2]);
	        const ampm = amPmMatch[3]?.toLowerCase();
	        
	        // Convert to 24-hour format
	        if (ampm === 'pm' && hours < 12) hours += 12;
	        if (ampm === 'am' && hours === 12) hours = 0;
	        
	        // Format with leading zeros
	        endTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
	    }
	}
	
	const duration = `${startTime} - ${endTime}`;

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
