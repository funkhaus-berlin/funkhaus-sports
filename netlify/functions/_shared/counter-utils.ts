// netlify/functions/_shared/counter-utils.ts
import admin from 'firebase-admin'

/**
 * Utility for generating sequential invoice numbers using Firestore
 */
export class CounterUtils {
  /**
   * Get the next value for a counter and increment it
   * 
   * @param db Firestore instance
   * @param counterName Name of the counter (e.g., 'invoices')
   * @param initialValue Initial value if counter doesn't exist
   * @returns Promise with the next value
   */
  static async getNextCounterValue(
    db: FirebaseFirestore.Firestore,
    counterName: string,
    initialValue: number = 1000
  ): Promise<number> {
    const counterRef = db.collection('counters').doc(counterName)
    
    try {
      // Use a transaction to ensure atomicity
      const nextValue = await db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef)
        
        // If counter doesn't exist, initialize it
        if (!counterDoc.exists) {
          transaction.set(counterRef, { 
            value: initialValue,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          })
          return initialValue
        }
        
        // Otherwise, increment the counter
        const currentValue = counterDoc.data()?.value || 0
        const nextVal = currentValue + 1
        
        transaction.update(counterRef, { 
          value: nextVal,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        })
        
        return nextVal
      })
      
      return nextValue
    } catch (error) {
      console.error('Error getting next counter value:', error)
      // Fallback to using timestamp as a pseudo-sequential number
      return Math.floor(Date.now() / 1000)
    }
  }

  /**
   * Format an invoice number with prefix and padding
   * 
   * @param value The counter value
   * @param prefix The prefix to use (default: 'FBB')
   * @param padLength The length to pad to (default: 6)
   * @returns Formatted invoice number
   */
  static formatInvoiceNumber(value: number, padLength: number = 6): string {
    return `${value.toString().padStart(padLength, '0')}`
  }
}