/** @type {import('tailwindcss').Config} */
module.exports = {
	// The 'content' key tells Tailwind where to scan for class names.
	content: [
		// If you're using JS/TS files
		'./src/**/*.{js,ts,jsx,tsx}',

		// If you have HTML files in your subfolders
		'./**/*.html',
	],
	theme: {
		extend: {
			// your custom theme settings here
		},
	},
	plugins: [],
}
