import { resolve } from 'path'
import { defineConfig } from 'vite'
import Sitemap from 'vite-plugin-sitemap'
import webfontDownload from 'vite-plugin-webfont-dl'

export default defineConfig({
	resolve: {
		alias: {
			src: resolve(__dirname, './src'),
			'@db': resolve(__dirname, './db'),
			'app.settings': resolve(__dirname, './app.settings.ts'),
		},
	},
	build: {
		target: 'esnext',
	},
	plugins: [
		// Turn the app into a PWA with default options
		// VitePWA({
		//   ...basePWAConfig,
		// }),
		webfontDownload([
			'https://fonts.googleapis.com/css2?family=Josefin+Sans:ital,wght@0,100..700;1,100..700&family=Kanit:wght@400;700&display=swap',
		]),
		Sitemap({
			generateRobotsTxt: true,
			outDir: resolve(__dirname, './public'),
			hostname: 'https://mo-template.netlify.app/',
		}),
	],
})
