// netlify/functions/_shared/email-config.ts

/**
 * Email configuration for the application.
 * These values should be set in your environment variables.
 */
export const emailConfig = {
	// SMTP server settings
	host: process.env.EMAIL_HOST || 'smtp.gmail.com',
	port: parseInt(process.env.EMAIL_PORT || '587'),
	secure: process.env.EMAIL_SECURE === 'true',

	// Authentication
	auth: {
		user: process.env.EMAIL_USER || '',
		pass: process.env.EMAIL_PASS || '',
	},

	// Sender information
	from: process.env.EMAIL_FROM || 'booking@funkhaus-berlin.net',
	fromName: process.env.EMAIL_FROM_NAME || 'Funkhaus Sports',

	// Support contact information
	supportEmail: process.env.SUPPORT_EMAIL || 'support@funkhaus-sports.com',
	supportPhone: process.env.SUPPORT_PHONE || '',

	// Company information for invoices and emails
	companyInfo: {
		name: 'Funkhaus Sports GmbH',
		address: 'Nalepastrasse 18',
		city: 'Berlin',
		postalCode: '12459',
		country: 'Germany',
		vatNumber: 'DE187992171',
		website: 'funkhaus-berlin.net',
	},

	// Email template settings
	template: {
		// Logo URL for email templates
		logoUrl: process.env.EMAIL_LOGO_URL || 'https://funkhaus-berlin.net/logo.png',
		// Primary color for email templates
		primaryColor: process.env.EMAIL_PRIMARY_COLOR || '#5e808e',
		// Secondary color for email templates
		secondaryColor: process.env.EMAIL_SECONDARY_COLOR || '#333333',
	},
}
