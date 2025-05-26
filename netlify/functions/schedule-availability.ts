// netlify/functions/schedule-availability.ts
import { Handler } from '@netlify/functions'
import admin from 'firebase-admin'
import { corsHeaders } from './_shared/cors'
import { db } from './_shared/firebase-admin'


/**
 * This function handles scheduled operations:
 * 1. Clean up expired pending bookings
 * 2. Generate availability slots for upcoming months
 * 3. Archive old booking data
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
			case 'generateAvailability':
				await generateMonthlyAvailability(data.year, data.month)
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
			const booking = doc.data()

			// Update booking status
			batch.update(doc.ref, {
				status: 'cancelled',
				paymentStatus: 'expired',
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			})

			// Release time slots
			await releaseTimeSlots(booking)
		}

		await batch.commit()
		console.log(`Successfully cleaned up ${pendingBookingsSnapshot.size} expired bookings`)
	} catch (error) {
		console.error('Error cleaning up pending bookings:', error)
		throw error
	}
}

/**
 * Generate availability slots for a future month
 */
async function generateMonthlyAvailability(year: number, month: number) {
	// Format month to ensure it's two digits
	const monthStr = month.toString().padStart(2, '0')
	const monthDocId = `${year}-${monthStr}`

	try {
		// Check if document already exists
		const availabilityRef = db.collection('availability').doc(monthDocId)
		const availabilityDoc = await availabilityRef.get()

		if (availabilityDoc.exists) {
			console.log(`Availability document for ${monthDocId} already exists, skipping generation`)
			return
		}

		// Get all active courts
		const courtsSnapshot = await db.collection('courts').where('status', '==', 'active').get()

		if (courtsSnapshot.empty) {
			console.log('No active courts found')
			return
		}

		// Calculate days in month
		const daysInMonth = new Date(year, month, 0).getDate()

		// Initialize document structure
		const availabilityData = {
			month: monthDocId,
			courts: {},
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		}

		// For each court, generate initial availability
		courtsSnapshot.forEach(courtDoc => {
			const court = courtDoc.data()
			availabilityData.courts[courtDoc.id] = {}

			// For each day in the month
			for (let day = 1; day <= daysInMonth; day++) {
				const dayStr = day.toString().padStart(2, '0')
				const dateStr = `${year}-${monthStr}-${dayStr}`
				const date = new Date(year, month - 1, day)
				const dayOfWeek = date.getDay() // 0 = Sunday, 6 = Saturday

				// Skip if court is closed on this day of week
				// You can customize this logic based on your court operating hours
				// Example: if (court.closedDays?.includes(dayOfWeek)) continue

				// Generate slots for this day
				availabilityData.courts[courtDoc.id][dateStr] = {
					slots: generateDailySlots(court, dayOfWeek),
				}
			}
		})

		// Save to Firestore
		await availabilityRef.set(availabilityData)
		console.log(`Successfully generated availability for ${monthDocId}`)
	} catch (error) {
		console.error(`Error generating monthly availability: ${error}`)
		throw error
	}
}

/**
 * Generate time slots for a specific day
 */
function generateDailySlots(court: any, dayOfWeek: number) {
	const slots = {}

	// Default operating hours (8 AM to 10 PM)
	// This should be customized based on your venue's operating hours
	const startHour = 8
	const endHour = 22

	// Weekend hours might be different
	const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

	// Generate slots for each hour
	for (let hour = startHour; hour < endHour; hour++) {
		const timeSlot = `${hour.toString().padStart(2, '0')}:00`

		slots[timeSlot] = {
			isAvailable: true,
			bookedBy: null,
			bookingId: null,
		}

		// Add half-hour slots if needed
		const halfHourSlot = `${hour.toString().padStart(2, '0')}:30`

		slots[halfHourSlot] = {
			isAvailable: true,
			bookedBy: null,
			bookingId: null,
		}
	}

	return slots
}

/**
 * Archive old booking data to optimize database size
 */
async function archiveOldBookings(beforeDateStr: string) {
	try {
		const beforeDate = new Date(beforeDateStr)

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

/**
 * Release time slots for a cancelled booking
 */
async function releaseTimeSlots(booking: any) {
	try {
		const { id: bookingId, courtId, date, startTime, endTime } = booking

		if (!courtId || !date || !startTime || !endTime) {
			console.log(`Booking ${bookingId} is missing required fields, skipping time slot release`)
			return
		}

		// Get the month document ID
		const [year, month] = date.split('-')
		const monthDocId = `${year}-${month}`

		// Get start and end hours
		const startHour = new Date(startTime).getHours()
		const endHour = new Date(endTime).getHours()

		// Get availability document
		const availabilityRef = db.collection('availability').doc(monthDocId)

		// Run transaction to ensure atomic updates
		await db.runTransaction(async transaction => {
			const availabilityDoc = await transaction.get(availabilityRef)

			if (!availabilityDoc.exists) {
				console.log(`No availability document found for ${monthDocId}`)
				return
			}

			const availability: any = availabilityDoc.data()

			// Check if court exists in availability
			if (
				!availability.courts ||
				!availability.courts[courtId] ||
				!availability.courts[courtId][date] ||
				!availability.courts[courtId][date].slots
			) {
				console.log(`No slots found for court ${courtId} on ${date}`)
				return
			}

			const slots = availability.courts[courtId][date].slots

			// Release each slot in the range that's associated with this booking
			const updates: {
				[key: string]: any
			} = {}
			for (let hour = startHour; hour < endHour; hour++) {
				const timeSlot = `${hour.toString().padStart(2, '0')}:00`

				if (slots[timeSlot] && slots[timeSlot].bookingId === bookingId) {
					updates[`courts.${courtId}.${date}.slots.${timeSlot}.isAvailable`] = true
					updates[`courts.${courtId}.${date}.slots.${timeSlot}.bookedBy`] = null
					updates[`courts.${courtId}.${date}.slots.${timeSlot}.bookingId`] = null
				}
			}

			// If we have updates, apply them
			if (Object.keys(updates).length > 0) {
				updates.updatedAt = admin.firestore.FieldValue.serverTimestamp()
				transaction.update(availabilityRef, updates)
				console.log(`Released ${Object.keys(updates).length - 1} time slots for booking ${bookingId}`)
			}
		})
	} catch (error) {
		console.error(`Error releasing time slots for booking ${booking.id}:`, error)
		throw error
	}
}

export { handler }
