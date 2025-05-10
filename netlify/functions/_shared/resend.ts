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
	const html = compileFunction(data)
	return html
}
