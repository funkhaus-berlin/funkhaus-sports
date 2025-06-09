import legacy from '@vitejs/plugin-legacy'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import Sitemap from 'vite-plugin-sitemap'
import webfontDownload from 'vite-plugin-webfont-dl'

export default defineConfig({
	resolve: {
		alias: {
			src: resolve(__dirname, './src'),
      "@shared": resolve(__dirname, './shared')
		},
	},
	build: {
		polyfillModulePreload: true,
		target: 'esnext',
		rollupOptions: {
			output: {
				// Separate legacy bundles
				manualChunks: {
					vendor: ['rxjs', '@stripe/stripe-js'],
					polyfills: ['promise-polyfill', 'whatwg-fetch'],
				},
			},
		},
	},
	plugins: [
		legacy({
			targets: [
				'ie >= 11',
				'last 2 Edge versions',
				'last 2 Chrome versions',
				'last 2 Firefox versions',
				'last 2 Safari versions',
				'last 2 iOS versions',
				'last 2 ChromeAndroid versions',
			],
			additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
		}),
		// Turn the app into a PWA - configured for admin routes only
		VitePWA({
			injectRegister: null, // We'll manually inject only on admin pages
			devOptions: {
				enabled: true,
			},
			registerType: 'prompt',
			includeAssets: ['favicon.ico', 'robots.txt', 'sitemap.xml'],
			manifest: {
				name: 'Funkhaus Sports Admin',
				short_name: 'FH Admin',
				description: 'Funkhaus Sports venue management dashboard',
				theme_color: '#000',
				start_url: '/admin',
				scope: '/admin/',
				display: 'standalone',
				icons: [
					{
						src: 'pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png',
					},
					{
						src: 'pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
					},
				],
			},
			workbox: {
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
				skipWaiting: true,
				clientsClaim: true,
				// Only cache admin routes
				navigateFallback: null,
				// Custom service worker with route filtering
				runtimeCaching: [
					{
						// Caching for admin pages
						urlPattern: ({ request, url }) => {
							return url.pathname.startsWith('/admin')
						},
						handler: 'NetworkFirst',
						options: {
							cacheName: 'admin-pages',
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 86400, // 1 day
							},
							cacheableResponse: { statuses: [0, 200] },
						},
					},
					{
						// Caching for images from Firebase Storage
						urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'firebase-storage-images',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 2592000, // 30 days
							},
							cacheableResponse: { statuses: [0, 200] },
						},
					},
					{
						// Caching for static resources
						urlPattern: /\.(?:js|css|png|jpg|jpeg|gif|svg|woff2?)$/,
						handler: 'StaleWhileRevalidate',
						options: {
							cacheName: 'static-resources',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 31536000, // 1 year
							},
							cacheableResponse: { statuses: [0, 200] },
						},
					},
					{
						// Caching for Firestore APIs
						urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'firebase-firestore',
							networkTimeoutSeconds: 10,
						},
					},
					{
						// Caching for Google APIs (includes Firebase Auth, etc.)
						urlPattern: /^https:\/\/www\.googleapis\.com\/.*/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'google-apis',
							networkTimeoutSeconds: 10,
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 300, // 5 minutes
							},
							cacheableResponse: { statuses: [0, 200] },
						},
					},
					{
						// Caching for Firebase Authentication
						urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\/.*/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'firebase-auth',
							networkTimeoutSeconds: 10,
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 300, // 5 minutes
							},
							cacheableResponse: { statuses: [0, 200] },
						},
					},
					{
						// Caching for Secure Token API
						urlPattern: /^https:\/\/securetoken\.googleapis\.com\/.*/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'secure-token',
							networkTimeoutSeconds: 10,
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 300, // 5 minutes
							},
							cacheableResponse: { statuses: [0, 200] },
						},
					},
				],
			},
		}),

		webfontDownload([
			'https://fonts.googleapis.com/css2?family=Josefin+Sans:ital,wght@0,100..700;1,100..700&family=Kanit:wght@400;700&display=swap',
		]),
		Sitemap({
			generateRobotsTxt: true,
			outDir: resolve(__dirname, './public'),
			hostname: 'https://funkhaus-sports.net', // Your site url
		}),
	],
})
