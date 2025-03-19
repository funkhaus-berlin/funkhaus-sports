// netlify/functions/_shared/resend.ts
import { Resend } from 'resend'

// Initialize Resend with API key from environment variable or fallback to the provided key
const apiKey = process.env.RESEND_API_KEY || 're_cvd4NJYz_87XmqZA8phCDJqYpRjAxhY1J'
const resend = new Resend(apiKey)

export default resend
