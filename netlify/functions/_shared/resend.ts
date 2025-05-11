// netlify/functions/_shared/resend.ts
import { Resend } from 'resend'
import { resolve } from 'path'
import pug from 'pug'


// Initialize Resend with API key from environment variable or fallback to the provided key
const apiKey = process.env.RESEND_API_KEY || 're_cvd4NJYz_87XmqZA8phCDJqYpRjAxhY1J'
const resend = new Resend(apiKey)

export default resend
export const emailHtml = async data => {
	// Compile email template with cache: false to force re-reading the template file
	const compileFunction = pug.compileFile(resolve(__dirname, './_shared/ticket.pug'), {
		cache: false
	})
	
	// Default images in case they're not provided
	const baseUrl = 'https://funkhaus-sports.netlify.app'
	const defaultImages = {
		googleCalendar: `${baseUrl}/icons/google-calendar.png`,
		outlookCalendar: `${baseUrl}/icons/outlook-calendar.png`,
		appleCalendar: `${baseUrl}/icons/apple-calendar.png`,
		calendarIcon: `${baseUrl}/icons/calendar.png`,
		logo: `${baseUrl}/logo.svg`
	}
	
	// Merge provided images with defaults
	const images = { ...defaultImages, ...(data.images || {}) }
	
	// Add images to data
	const templateData = { ...data, images }
	
	// Add safe debugging check for calendarEvent
	if (!templateData.calendarEvent) {
		console.warn('WARNING: calendarEvent is missing in template data')
		// Create a fallback calendarEvent
		templateData.calendarEvent = {
			dayName: "Sunday",
			dayShort: "SUN",
			day: new Date().getDate(),
			month: "January",
			monthShort: "JAN",
			year: new Date().getFullYear()
		}
	}
	
	// Render template
	const html = compileFunction(templateData)
	return html
}
