import { VitePWAOptions } from 'vite-plugin-pwa'

export const basePWAConfig: Partial<VitePWAOptions> = {
	registerType: 'autoUpdate',
	devOptions: {
		enabled: true,
	},
	manifest: {
		screenshots: [
			{
				src: 'pwa/wide.webp',
				sizes: '1862x1290',
				type: 'image/webp',
				form_factor: 'wide',
				label: 'Homescreen of Zola App',
			},
			{
				src: 'pwa/narrow.webp',
				sizes: '690x1260',
				type: 'image/webp',
				form_factor: 'narrow',
				label: 'Homescreen of Zola App',
			},
		],

		name: 'Mo Template',
		short_name: 'Momo',
		description: 'Description goes here',
		theme_color: '#ffffff',
		icons: [
			{
				src: '/ios/192.png',
				sizes: '192x192',
				type: 'image/png',
			},
			{
				src: '/ios/512.png',
				sizes: '512x512',
				type: 'image/png',
			},
		],
		background_color: '#ffffff',
		display: 'standalone',
	},
	injectRegister: 'script',
	workbox: {
		globPatterns: ['**/*.{js,css,html,ico,png,svg,mp4,jpg,jpeg,webp,woff2,woff,ttf}'],
	},
}
