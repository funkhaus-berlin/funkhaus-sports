import { from, map, switchMap, Observable } from 'rxjs'
import { BookingEmailRequest, BookingEmailResponse, CheckEmailStatusResponse } from '../../../../types/api/email'

const BASE_URL = (import.meta.env.DEV && import.meta.env.VITE_BASE_URL) ?? ''

/**
 * Service for handling email-related API calls
 */
export function resendBookingEmail(bookingData: BookingEmailRequest): Observable<BookingEmailResponse> {
  return from(
    fetch(`${BASE_URL}/api/resend-booking-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bookingData),
    }),
  ).pipe(
    switchMap(res => {
      if (!res.ok) {
        console.error('Email resend failed:', res.status, res.statusText)
        // Return the error response as JSON if possible, otherwise create an error object
        return res.json().catch(() => ({
          error: `Email resend failed with status: ${res.status} ${res.statusText}`,
        }))
      }
      return res.json()
    }),
    map(responseBody => {
      if (responseBody.error) {
        throw new Error(responseBody.error)
      }
      return responseBody as BookingEmailResponse
    }),
  )
}

/**
 * Checks the status of a booking email
 * @param bookingId The ID of the booking to check
 * @returns Observable with the email status response
 */
export function checkEmailStatus(bookingId: string): Observable<CheckEmailStatusResponse> {
  return from(
    fetch(`${BASE_URL}/api/check-email-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ bookingId })
    })
  ).pipe(
    switchMap(res => {
      if (!res.ok) {
        console.error('Email status check failed:', res.status, res.statusText)
        return res.json().catch(() => ({
          error: `Email status check failed with status: ${res.status} ${res.statusText}`,
        }))
      }
      return res.json()
    }),
    map(responseBody => {
      if (responseBody.error) {
        throw new Error(responseBody.error)
      }
      return responseBody as CheckEmailStatusResponse
    })
  )
}