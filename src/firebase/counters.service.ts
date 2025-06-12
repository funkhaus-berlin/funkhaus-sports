// src/firebase/counters.service.ts
import { doc, increment, runTransaction } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Counters service for generating sequential numbers
 * Uses Firestore transactions to ensure atomicity and avoid race conditions
 */
export class CountersService {
  private collectionName = 'counters'

  /**
   * Get the next value for a counter and increment it atomically
   * 
   * @param counterName The name of the counter to increment
   * @param initialValue The initial value if counter doesn't exist (default: 1000)
   * @returns Promise with the next counter value
   */
  async getNextCounterValue(counterName: string, initialValue: number = 1): Promise<number> {
    const counterRef = doc(db, this.collectionName, counterName)
    
    try {
      // Use a transaction to ensure atomicity
      const nextValue = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef)
        
        // If counter doesn't exist, initialize it
        if (!counterDoc.exists()) {
          transaction.set(counterRef, { 
            value: initialValue,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
          return initialValue
        }
        
        // Otherwise, increment the counter
        const currentValue = counterDoc.data().value || 0
        const nextVal = currentValue + 1
        
        transaction.update(counterRef, { 
          value: nextVal,
          updatedAt: new Date().toISOString()
        })
        
        return nextVal
      })
      
      return nextValue
    } catch (error) {
      console.error('Error getting next counter value:', error)
      // Fallback to a random number if transaction fails
      return Math.floor(100000 + Math.random() * 900000)
    }
  }

  /**
   * Format an invoice number
   * 
   * @param value The counter value
   * @returns Formatted invoice number
   */
  formatInvoiceNumber(value: number): string {
    return value.toString()
  }
}

// Export a singleton instance
export const countersService = new CountersService()