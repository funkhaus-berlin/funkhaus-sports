import { resolve } from 'path'
import { defineConfig } from 'vite'
// import { VitePWA } from 'vite-plugin-pwa'
import Sitemap from 'vite-plugin-sitemap'
import webfontDownload from 'vite-plugin-webfont-dl'
// import { basePWAConfig } from './vite.pwa-config'

export default defineConfig({
	resolve: {
		alias: {
			src: resolve(__dirname, './src'),
		},
	},
	build: {
		target: 'esnext',
	},
	plugins: [
		webfontDownload([
			'https://fonts.googleapis.com/css2?family=Josefin+Sans:ital,wght@0,100..700;1,100..700&family=Kanit:wght@400;700&display=swap',
		]),
		Sitemap({
			generateRobotsTxt: true,
			outDir: resolve(__dirname, './public'),
		}),
	],
})
