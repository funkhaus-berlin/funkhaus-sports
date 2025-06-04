import { Handler } from '@netlify/functions'
import { corsHeaders } from './_shared/cors'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { db } from './_shared/firebase-admin'


/**
 * Scheduled function to cleanup abandoned bookings
 * This should be called periodically (e.g., every minute) by a cron job
 * 
 * Frontend timer: 5 minutes base + 1 minute extension if user is active
 * We use 7 minutes here to be extra safe and avoid deleting active bookings
 * 
 * Netlify scheduled functions: https://docs.netlify.com/functions/scheduled-functions/
 */
const cleanupAbandonedBookings = async () => {
	try {
		// Calculate cutoff time (7 minutes ago - to account for timer extension)
		// Frontend has 5 minute timer + 60 second extension = 6 minutes max
		// We add 1 extra minute for safety = 7 minutes total
		const cutoffTime = new Date()
		cutoffTime.setMinutes(cutoffTime.getMinutes() - 7)
		const cutoffTimeString = cutoffTime.toISOString()
		
		// Query for abandoned holding bookings based on lastActive
		const bookingsRef = db.collection('bookings')
		const query = bookingsRef
			.where('status', '==', 'holding')
			.where('lastActive', '<', cutoffTimeString)
			.where('paymentStatus', '==', 'pending')
			.limit(100) // Process more in scheduled job
			
		const snapshot = await query.get()
		console.log(`[Scheduled Cleanup] Found ${snapshot.size} abandoned holding bookings to clean up (older than 7 minutes)`)
		
		if (snapshot.empty) {
			return { 
				cleaned: 0, 
				message: 'No abandoned bookings found' 
			}
		}
		
		// Batch update for efficiency
		const batch = db.batch()
		const cleanedBookings: string[] = []
		let cancelledCount = 0
		
		snapshot.forEach((doc: QueryDocumentSnapshot) => {
			const booking = doc.data()
			const lastActiveDate = new Date(booking.lastActive || booking.createdAt)
			const ageInMinutes = (Date.now() - lastActiveDate.getTime()) / (1000 * 60)
			
			// Only cancel if truly abandoned (older than 7 minutes)
			if (ageInMinutes > 7) {
				const bookingRef = bookingsRef.doc(doc.id)
				
				// Update booking to cancelled
				batch.update(bookingRef, {
					status: 'cancelled',
					paymentStatus: 'abandoned',
					updatedAt: new Date().toISOString(),
					cancellationReason: 'auto_cleanup_abandoned_booking',
					cleanedAt: new Date().toISOString(),
					cancelledAfterMinutes: Math.round(ageInMinutes)
				})
				
				cleanedBookings.push(doc.id)
				console.log(`[Scheduled Cleanup] Marking abandoned booking ${doc.id} as cancelled (${Math.round(ageInMinutes)} minutes old)`)
				
				// Log cleanup action
				const logRef = db.collection('cleanupLogs').doc()
				batch.set(logRef, {
					bookingId: doc.id,
					action: 'cancelled_abandoned_booking',
					lastActive: booking.lastActive,
					createdAt: booking.createdAt,
					cleanedAt: new Date().toISOString(),
					ageInMinutes: Math.round(ageInMinutes),
					userId: booking.userId,
					courtId: booking.courtId,
					date: booking.date,
					startTime: booking.startTime,
					endTime: booking.endTime
				})
				
				cancelledCount++
			} else {
				console.log(`[Scheduled Cleanup] Skipping booking ${doc.id} - only ${Math.round(ageInMinutes)} minutes old`)
			}
		})
		
		// Commit all updates
		if (cancelledCount > 0) {
			await batch.commit()
			console.log(`[Scheduled Cleanup] Successfully cancelled ${cancelledCount} abandoned bookings`)
		}
		
		return {
			cleaned: cancelledCount,
			bookingIds: cleanedBookings,
			message: cancelledCount > 0 
				? `Successfully cleaned ${cancelledCount} abandoned bookings` 
				: 'No bookings were old enough to cancel'
		}
		
	} catch (error) {
		console.error('[Scheduled Cleanup] Error cleaning up abandoned bookings:', error)
		throw error
	}
}

/**
 * Also cleanup very old bookings that might have been missed
 * This catches any edge cases where lastActive wasn't properly updated
 */
const cleanupOldHoldingBookings = async () => {
	try {
		// Calculate cutoff time (30 minutes ago) for bookings created long ago
		const cutoffTime = new Date()
		cutoffTime.setMinutes(cutoffTime.getMinutes() - 30)
		const cutoffTimeString = cutoffTime.toISOString()
		
		// Query for old holding bookings based on createdAt
		const bookingsRef = db.collection('bookings')
		const query = bookingsRef
			.where('status', '==', 'holding')
			.where('createdAt', '<', cutoffTimeString)
			.limit(50)
			
		const snapshot = await query.get()
		
		if (snapshot.empty) {
			return { cleaned: 0 }
		}
		
		const batch = db.batch()
		
		snapshot.forEach(doc => {
			const bookingRef = bookingsRef.doc(doc.id)
			batch.update(bookingRef, {
				status: 'cancelled',
				paymentStatus: 'abandoned',
				updatedAt: new Date().toISOString(),
				cancellationReason: 'auto_cleanup_old_holding_booking'
			})
		})
		
		await batch.commit()
		console.log(`[Scheduled Cleanup] Cleaned ${snapshot.size} old holding bookings`)
		
		return { cleaned: snapshot.size }
		
	} catch (error) {
		console.error('[Scheduled Cleanup] Error cleaning old holding bookings:', error)
		return { cleaned: 0, error: error instanceof Error ? error.message : 'Unknown error' }
	}
}

const handler: Handler = async (_event, _context) => {
	// This can be triggered by:
	// 1. Netlify scheduled function (cron)
	// 2. Manual HTTP call for testing
	// 3. External cron service
	
	console.log('[Scheduled Cleanup] Starting abandoned bookings cleanup')
	
	try {
		// Run both cleanup tasks
		const [abandonedResult, oldResult] = await Promise.all([
			cleanupAbandonedBookings(),
			cleanupOldHoldingBookings()
		])
		
		const totalCleaned = (abandonedResult.cleaned || 0) + (oldResult.cleaned || 0)
		
		return {
			statusCode: 200,
			headers: corsHeaders,
			body: JSON.stringify({
				success: true,
				totalCleaned,
				abandoned: abandonedResult,
				old: oldResult,
				timestamp: new Date().toISOString()
			})
		}
	} catch (error) {
		console.error('[Scheduled Cleanup] Handler error:', error)
		
		return {
			statusCode: 500,
			headers: corsHeaders,
			body: JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: new Date().toISOString()
			})
		}
	}
}

// For Netlify scheduled functions
export { handler }

// Export for testing
export { cleanupAbandonedBookings, cleanupOldHoldingBookings }
