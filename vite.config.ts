import legacy from '@vitejs/plugin-legacy'
import { resolve } from 'path'
import { defineConfig } from 'vite'
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