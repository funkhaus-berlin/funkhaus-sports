import { schedule } from '@netlify/functions'
import { cleanupAbandonedBookings, cleanupOldHoldingBookings } from './cleanup-abandoned-bookings'

/**
 * Scheduled function that runs every 5 minutes to clean up abandoned bookings
 * 
 * This is a Netlify scheduled function that will automatically run
 * at the specified cron schedule
 */
const handler = schedule('*/5 * * * *', async () => {
	console.log('[Scheduled Task] Running abandoned bookings cleanup')
	
	try {
		// Run both cleanup tasks
		const [abandonedResult, oldResult] = await Promise.all([
			cleanupAbandonedBookings(),
			cleanupOldHoldingBookings()
		])
		
		const totalCleaned = (abandonedResult.cleaned || 0) + (oldResult.cleaned || 0)
		
		console.log(`[Scheduled Task] Cleanup completed. Total cleaned: ${totalCleaned}`)
		
		return {
			statusCode: 200
		}
	} catch (error) {
		console.error('[Scheduled Task] Cleanup failed:', error)
		return {
			statusCode: 500
		}
	}
})

export { handler }