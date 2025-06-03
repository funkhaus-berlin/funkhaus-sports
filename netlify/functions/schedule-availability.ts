// netlify/functions/schedule-availability.ts
import { Handler } from '@netlify/functions'
import admin from 'firebase-admin'
import { corsHeaders } from './_shared/cors'
import { db } from './_shared/firebase-admin'


/**
 * This function handles scheduled operations:
 * 1. Clean up expired pending bookings
 * 2. Archive old booking data
 */
const handler: Handler = async (event, _context) => {
	// Check API key for security
	const apiKey = event.headers['x-api-key']
	if (apiKey !== process.env.SCHEDULER_API_KEY) {
		return {
			statusCode: 401,
			headers: corsHeaders,
			body: JSON.stringify({ error: 'Unauthorized' }),
		}
	}

	try {
		const data = JSON.parse(event.body || '{}')
		const { action } = data

		switch (action) {
			case 'cleanupPendingBookings':
				await cleanupPendingBookings()
				break
			case 'archiveOldBookings':
				await archiveOldBookings(data.beforeDate)
				break
			default:
				return {
					statusCode: 400,
					headers: corsHeaders,
					body: JSON.stringify({ error: 'Invalid action' }),
				}
		}

		return {
			statusCode: 200,
			headers: corsHeaders,
			body: JSON.stringify({ success: true, action }),
		}
	} catch (error) {
		console.error(`Error in scheduler function: ${error.message}`)
		return {
			statusCode: 500,
			headers: corsHeaders,
			body: JSON.stringify({ error: error.message }),
		}
	}
}

/**
 * Clean up bookings that have been pending for too long (15 minutes)
 */
async function cleanupPendingBookings() {
	const cutoffTime = new Date()
	cutoffTime.setMinutes(cutoffTime.getMinutes() - 15)

	try {
		// Get pending bookings older than cutoff time
		const pendingBookingsSnapshot = await db
			.collection('bookings')
			.where('paymentStatus', '==', 'pending')
			.where('createdAt', '<', admin.firestore.Timestamp.fromDate(cutoffTime))
			.get()

		if (pendingBookingsSnapshot.empty) {
			console.log('No expired pending bookings to clean up')
			return
		}

		console.log(`Found ${pendingBookingsSnapshot.size} expired pending bookings to clean up`)

		// Process each expired booking
		const batch = db.batch()
		for (const doc of pendingBookingsSnapshot.docs) {
			// Update booking status
			batch.update(doc.ref, {
				status: 'cancelled',
				paymentStatus: 'expired',
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			})
		}

		await batch.commit()
		console.log(`Successfully cleaned up ${pendingBookingsSnapshot.size} expired bookings`)
	} catch (error) {
		console.error('Error cleaning up pending bookings:', error)
		throw error
	}
}

/**
 * Archive old booking data to optimize database size
 */
async function archiveOldBookings(beforeDateStr: string) {
	try {

		// Get old bookings
		const oldBookingsSnapshot = await db
			.collection('bookings')
			.where('date', '<', beforeDateStr)
			.limit(100) // Process in batches
			.get()

		if (oldBookingsSnapshot.empty) {
			console.log('No old bookings to archive')
			return
		}

		console.log(`Found ${oldBookingsSnapshot.size} old bookings to archive`)

		// Archive bookings in a batch
		const batch = db.batch()

		for (const doc of oldBookingsSnapshot.docs) {
			const booking = doc.data()

			// Copy to archives
			const archiveRef = db.collection('bookingArchives').doc(doc.id)
			batch.set(archiveRef, {
				...booking,
				archivedAt: admin.firestore.FieldValue.serverTimestamp(),
			})

			// Delete from active collection
			batch.delete(doc.ref)
		}

		await batch.commit()
		console.log(`Successfully archived ${oldBookingsSnapshot.size} old bookings`)

		// If there are more, recursively process the next batch
		if (oldBookingsSnapshot.size === 100) {
			await archiveOldBookings(beforeDateStr)
		}
	} catch (error) {
		console.error('Error archiving old bookings:', error)
		throw error
	}
}

export { handler }