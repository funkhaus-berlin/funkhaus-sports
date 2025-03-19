// netlify/functions/send-booking-email.ts
import { Handler } from '@netlify/functions'
import dayjs from 'dayjs'
import admin from 'firebase-admin'

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
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
		const data = JSON.parse(event.body || '{}')

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
async function sendEmail(data: any, pdfBuffer: Buffer): Promise<boolean> {
	try {
		// Convert buffer to base64 for attachment
		const pdfBase64 = pdfBuffer.toString('base64')
		const html = await emailHtml({
			booking: data.bookingDetails,
			customer: {
				name: data.customerName,
				email: data.customerEmail,
				phone: data.customerPhone,
			},
			venue: data.venueInfo,
		})
		// Send email with Resend
		const response = await resend.emails.send({
			from: `${emailConfig.fromName} <${emailConfig.from}>`,
			to: data.customerEmail,
			subject: `Your Court Booking Confirmation - ${data.bookingDetails.court}`,
			html: html!,
			attachments: [
				{
					filename: `Booking-${data.bookingId}.pdf`,
					content: pdfBase64,
				},
			],
		})

		console.log('Email sent successfully with Resend:', response)
		return true
	} catch (error) {
		console.error('Error sending email with Resend:', error)
		return false
	}
}

/**
 * Generate PDF with booking details
 */
async function generateBookingPDF(data: any): Promise<Buffer> {
	// Create a new PDF document
	const pdfDoc = await PDFDocument.create()
	const page = pdfDoc.addPage([595.28, 841.89]) // A4 size

	// Load fonts
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
	const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

	// Set default font size
	const fontSize = 12

	// Start Y position (top of page)
	let y = 800
	const lineHeight = 20
	const leftMargin = 50

	// Add header
	page.drawText('Booking Confirmation', {
		x: leftMargin,
		y,
		size: 24,
		font: boldFont,
	})

	y -= lineHeight * 2

	// Draw court info section
	page.drawText('Court Details', {
		x: leftMargin,
		y,
		size: 16,
		font: boldFont,
	})

	y -= lineHeight

	// Court name and type
	page.drawText(`Court: ${data.bookingDetails.court} (${data.bookingDetails.courtType})`, {
		x: leftMargin,
		y,
		size: fontSize,
		font: font,
	})

	y -= lineHeight

	// Venue
	page.drawText(`Venue: ${data.bookingDetails.venue}`, {
		x: leftMargin,
		y,
		size: fontSize,
		font: font,
	})

	if (data.venueInfo?.address) {
		y -= lineHeight
		page.drawText(`Address: ${data.venueInfo.address.street}, ${data.venueInfo.address.city}`, {
			x: leftMargin,
			y,
			size: fontSize,
			font: font,
		})

		y -= lineHeight
		page.drawText(`${data.venueInfo.address.postalCode}, ${data.venueInfo.address.country}`, {
			x: leftMargin + 65,
			y,
			size: fontSize,
			font: font,
		})
	}

	y -= lineHeight * 2

	// Draw booking details section
	page.drawText('Booking Details', {
		x: leftMargin,
		y,
		size: 16,
		font: boldFont,
	})

	y -= lineHeight

	// Date and time
	page.drawText(`Date: ${data.bookingDetails.date}`, {
		x: leftMargin,
		y,
		size: fontSize,
		font: font,
	})

	y -= lineHeight

	page.drawText(`Time: ${data.bookingDetails.startTime} - ${data.bookingDetails.endTime}`, {
		x: leftMargin,
		y,
		size: fontSize,
		font: font,
	})

	y -= lineHeight

	page.drawText(`Duration: ${data.bookingDetails.duration}`, {
		x: leftMargin,
		y,
		size: fontSize,
		font: font,
	})

	y -= lineHeight * 2

	// Customer info
	page.drawText('Customer Information', {
		x: leftMargin,
		y,
		size: 16,
		font: boldFont,
	})

	y -= lineHeight

	page.drawText(`Name: ${data.customerName}`, {
		x: leftMargin,
		y,
		size: fontSize,
		font: font,
	})

	y -= lineHeight

	page.drawText(`Email: ${data.customerEmail}`, {
		x: leftMargin,
		y,
		size: fontSize,
		font: font,
	})

	y -= lineHeight

	if (data.customerPhone) {
		page.drawText(`Phone: ${data.customerPhone}`, {
			x: leftMargin,
			y,
			size: fontSize,
			font: font,
		})
		y -= lineHeight
	}

	// Payment info
	y -= lineHeight

	page.drawText('Payment Information', {
		x: leftMargin,
		y,
		size: 16,
		font: boldFont,
	})

	y -= lineHeight

	page.drawText(`Status: ${data.paymentInfo.paymentStatus}`, {
		x: leftMargin,
		y,
		size: fontSize,
		font: font,
	})

	y -= lineHeight

	page.drawText(`Booking ID: ${data.bookingId}`, {
		x: leftMargin,
		y,
		size: fontSize,
		font: font,
	})

	y -= lineHeight

	// Price details
	page.drawText(`Price Details:`, {
		x: leftMargin,
		y,
		size: fontSize,
		font: boldFont,
	})

	y -= lineHeight

	page.drawText(`Net Amount: €${data.bookingDetails.vatInfo.netAmount}`, {
		x: leftMargin + 20,
		y,
		size: fontSize,
		font: font,
	})

	y -= lineHeight

	page.drawText(`VAT (${data.bookingDetails.vatInfo.vatRate}): €${data.bookingDetails.vatInfo.vatAmount}`, {
		x: leftMargin + 20,
		y,
		size: fontSize,
		font: font,
	})

	y -= lineHeight

	page.drawText(`Total: €${data.bookingDetails.price}`, {
		x: leftMargin + 20,
		y,
		size: fontSize,
		font: boldFont,
	})

	// Generate QR code
	try {
		const qrCodeData = await QRCode.toDataURL(
			JSON.stringify({
				bookingId: data.bookingId,
				court: data.bookingDetails.court,
				date: data.bookingDetails.date,
				time: data.bookingDetails.startTime,
			}),
		)

		// Extract base64 data (remove data URL prefix)
		const qrCodeBase64 = qrCodeData.replace('data:image/png;base64,', '')
		const qrCodeImage = await pdfDoc.embedPng(Buffer.from(qrCodeBase64, 'base64'))

		// Position the QR code at top right of the page
		const qrWidth = 100
		const qrHeight = 100
		page.drawImage(qrCodeImage, {
			x: 445,
			y: 730,
			width: qrWidth,
			height: qrHeight,
		})

		// Add QR code label
		page.drawText('Booking QR Code', {
			x: 450,
			y: 720,
			size: 10,
			font: font,
		})
	} catch (err) {
		console.error('Error generating QR code:', err)
	}

	// Add footer
	const footerY = 50
	page.drawText('Thank you for booking with Funkhaus Sports!', {
		x: leftMargin,
		y: footerY,
		size: fontSize,
		font: boldFont,
	})

	page.drawText(`Generated on ${dayjs().format('MMM D, YYYY')}`, {
		x: leftMargin,
		y: footerY - lineHeight,
		size: 10,
		font: font,
		color: rgb(0.5, 0.5, 0.5),
	})

	// Serialize the PDF document to bytes
	const pdfBytes = await pdfDoc.save()
	return Buffer.from(pdfBytes)
}

export { handler }
