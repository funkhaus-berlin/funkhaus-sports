/** @type {import('tailwindcss').Config} */
module.exports = {
	// The 'content' key tells Tailwind where to scan for class names.
	content: [
		// If you're using JS/TS files
		'./frontend/**/*.{js,ts,jsx,tsx}',
		'./shared/**/*.{js,ts,jsx,tsx}',
		'./firebase/**/*.{js,ts,jsx,tsx}',

		// If you have HTML files in your subfolders
		'./frontend/**/*.html',
		'./shared/**/*.html',
		'./firebase/**/*.html',
	],
	theme: {
		extend: {
			// your custom theme settings here
		},
	},
	plugins: [],
}
