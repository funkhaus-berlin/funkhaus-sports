// src/public/book/TentativeCourtAssignment.ts

import { firstValueFrom, catchError, of } from 'rxjs';
import { Court } from 'src/db/courts.collection';
import { CourtAssignmentService, CourtAssignmentStrategy, CourtPreferences } from 'src/bookingServices/court-assignment.service';

/**
 * Handles tentative court assignment before duration selection
 * This allows showing accurate pricing specific to the court that will be assigned
 */
export class TentativeCourtAssignment {
  constructor(private courtAssignmentService: CourtAssignmentService) {}

  /**
   * Find the best matching court based on preferences without committing to booking it
   * 
   * @param date Booking date
   * @param startTimeMinutes Start time in minutes from midnight
   * @param availableCourts Available courts
   * @param preferences User preferences
   * @returns The best matching court or null if none available
   */
  async findBestMatchingCourt(
    date: string,
    startTimeMinutes: number,
    availableCourts: Court[],
    preferences: CourtPreferences
  ): Promise<Court | null> {
    try {
      // Use a small duration (30 minutes) just to check availability
      // We're not actually booking for this duration, just finding available courts
      const tentativeDuration = 30;
      
      // Check for available courts with minimal duration
      const result = await firstValueFrom(
        this.courtAssignmentService
          .checkAndAssignCourt(
            date,
            startTimeMinutes,
            tentativeDuration,
            availableCourts,
            CourtAssignmentStrategy.PREFERENCE_BASED,
            preferences
          )
          .pipe(
            catchError(error => {
              console.error('Error finding best matching court:', error);
              return of({
                selectedCourt: null,
                alternativeCourts: [],
                message: 'Error finding available courts: ' + error.message,
              });
            })
          )
      );
      
      return result.selectedCourt;
    } catch (error) {
      console.error('Error in tentative court assignment:', error);
      return null;
    }
  }
}
