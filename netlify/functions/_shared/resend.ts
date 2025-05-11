// netlify/functions/_shared/resend.ts
import { Resend } from 'resend'
import { resolve } from 'path'
import pug from 'pug'


// Initialize Resend with API key from environment variable or fallback to the provided key
const apiKey = process.env.RESEND_API_KEY || 're_cvd4NJYz_87XmqZA8phCDJqYpRjAxhY1J'
const resend = new Resend(apiKey)

export default resend
export const emailHtml = async data => {
	// Compile email template
	const compileFunction = pug.compileFile(resolve(__dirname, './_shared/ticket.pug'), {})
	
	// Default images in case they're not provided
	const baseUrl = 'https://funkhausevents.netlify.app'
	const defaultImages = {
		googleCalendar: `${baseUrl}/icons/google-calendar.png`,
		outlookCalendar: `${baseUrl}/icons/outlook-calendar.png`,
		appleCalendar: `${baseUrl}/icons/apple-calendar.png`,
		calendarIcon: `${baseUrl}/icons/calendar.png`,
		logo: `${baseUrl}/logo-light.svg`
	}
	
	// Merge provided images with defaults
	const images = { ...defaultImages, ...(data.images || {}) }
	
	// Add images to data
	const templateData = { ...data, images }
	
	// Render template
	const html = compileFunction(templateData)
	return html
}
