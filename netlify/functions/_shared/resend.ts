// netlify/functions/_shared/resend.ts
import { Resend } from 'resend'
import { resolve } from 'path'
import pug from 'pug'


// Initialize Resend with API key from environment variable or fallback to the provided key
const apiKey = process.env.RESEND_API_KEY || 're_cvd4NJYz_87XmqZA8phCDJqYpRjAxhY1J'
const resend = new Resend(apiKey)

export default resend
export const emailHtml = async data => {
	// Add timestamp parameter to bust the cache
	console.log('Compiling email template with timestamp:', new Date().toISOString())
	
	// Log calendar event data for debugging
	console.log('Calendar event data for email:', JSON.stringify({
		dayName: data.calendarEvent?.dayName,
		dayShort: data.calendarEvent?.dayShort,
		day: data.calendarEvent?.day,
		month: data.calendarEvent?.month,
		monthShort: data.calendarEvent?.monthShort,
		year: data.calendarEvent?.year,
	}, null, 2))
	
	// Compile email template with cache: false to force re-reading the template file
	const compileFunction = pug.compileFile(resolve(__dirname, './_shared/ticket.pug'), {
		cache: false,
		debug: true // Enable debug mode
	})
	
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
		console.log('Created fallback calendarEvent:', templateData.calendarEvent)
	}
	
	// Render template
	console.log('Rendering email template with calendarEvent.dayName:', templateData.calendarEvent.dayName)
	const html = compileFunction(templateData)
	
	// Log a portion of the output HTML to check for day name
	const dayNameIndex = html.indexOf('date-day-name')
	if (dayNameIndex > -1) {
		console.log('Day name section found in HTML at index:', dayNameIndex)
		console.log('HTML snippet around day name:', html.substring(dayNameIndex - 50, dayNameIndex + 150))
	} else {
		console.warn('WARNING: date-day-name not found in output HTML')
	}
	
	return html
}
