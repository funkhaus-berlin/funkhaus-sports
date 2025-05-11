// /netlify/functions/_shared/calendar-utils.ts
import moment from 'moment'
import ical, { ICalEventStatus, ICalAlarmType } from 'ical-generator'
import { v4 as uuidv4 } from 'uuid'
import { CalendarEvent } from '../../../src/types/api/email'

/**
 * Generate an ICS file using ical-generator library
 * 
 * @param event Calendar event data following the CalendarEvent interface
 * @returns ICS file content as a string
 */
export function generateICSFile(event: CalendarEvent & { id?: string }): string {
  try {
    // Manual ICS generation for maximum compatibility
    const startTime = moment(event.startTime)
    const endTime = moment(event.endTime)
    
    // Format times in the correct format: YYYYMMDDTHHMMSSZ
    const formatTimeUTC = (time: moment.Moment) => {
      return time.utc().format('YYYYMMDDTHHmmss') + 'Z'
    }
    
    const startDateUTC = formatTimeUTC(startTime)
    const endDateUTC = formatTimeUTC(endTime)
    const currentDateUTC = formatTimeUTC(moment())
    
    // Clean up location and description strings for the ICS file
    const cleanLocation = (typeof event.location === 'string') 
      ? event.location
          .replace(/\[object Object\]/g, '')
          .replace(/undefined/g, '')
          .replace(/,\s*,/g, ',')
          .replace(/,\s*$/g, '')
          .replace(/[\\,;]/g, '') // Remove characters that could break the ICS format
      : 'Funkhaus Sports Berlin'
    
    const cleanDescription = event.description
      ? event.description
          .replace(/\n/g, '\\n')
          .replace(/[\\,;]/g, '')
      : 'Court booking at Funkhaus Sports'
    
    const cleanSummary = event.title
      ? event.title.replace(/[\\,;]/g, '')
      : 'Court Booking'
    
    // Create unique identifier for this event
    const eventId = `booking-${event.id || event.uid || uuidv4().substring(0, 8)}@funkhaus-sports.com`
    
    // Build the ICS file as a basic string with proper line endings
    // This is the most compatible format for various calendar applications
    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Funkhaus//Sports Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${eventId}`,
      `DTSTAMP:${currentDateUTC}`,
      `DTSTART:${startDateUTC}`,
      `DTEND:${endDateUTC}`,
      `SUMMARY:${cleanSummary}`,
      `DESCRIPTION:${cleanDescription}`,
      `LOCATION:${cleanLocation}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'TRANSP:OPAQUE',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'TRIGGER:-PT1H',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ]
    
    // Join lines with CRLF as required by the iCalendar spec
    return icsLines.join('\r\n')
  } catch (error) {
    console.error('Error generating ICS file:', error)
    
    // Create a basic fallback calendar manually
    const now = moment()
    const later = moment().add(1, 'hour')
    
    // Format times in UTC
    const formatTimeUTC = (time: moment.Moment) => {
      return time.utc().format('YYYYMMDDTHHmmss') + 'Z'
    }
    
    const startDateUTC = formatTimeUTC(now)
    const endDateUTC = formatTimeUTC(later)
    const currentDateUTC = formatTimeUTC(now)
    
    // Create a simple fallback event ID
    const fallbackId = `fallback-${uuidv4().substring(0, 8)}@funkhaus-sports.com`
    
    // Build the ICS file as a basic string with proper line endings
    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Funkhaus//Sports Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${fallbackId}`,
      `DTSTAMP:${currentDateUTC}`,
      `DTSTART:${startDateUTC}`,
      `DTEND:${endDateUTC}`,
      'SUMMARY:Court Booking',
      'DESCRIPTION:Your court booking at Funkhaus Sports.',
      'LOCATION:Funkhaus Berlin Sports Center',
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'TRANSP:OPAQUE',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'TRIGGER:-PT1H',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ]
    
    // Join lines with CRLF as required by the iCalendar spec
    return icsLines.join('\r\n')
  }
}

/**
 * Create a calendar event from booking data
 * Returns an object that follows the CalendarEvent interface from the frontend
 * 
 * @returns CalendarEvent object following the interface
 */
export function createCalendarEvent(
  bookingId: string,
  courtName: string,
  venueName: string,
  venueAddress: string,
  startTime: string,
  endTime: string,
  date: string,
  additionalDetails: string = ''
): CalendarEvent & { 
  dayName: string;
  dayShort: string;
  day: number;
  month: string;
  monthShort: string;
  year: number;
  formattedDate: string;
} {
  
  // Parse date and time inputs
  let parsedStartTime: moment.Moment
  let parsedEndTime: moment.Moment
  
  try {
    // Try to properly parse the time and date inputs
    if (startTime && startTime.includes('T') && startTime.includes('Z')) {
      // If it's already in ISO format
      parsedStartTime = moment(startTime)
    } else if (date && startTime) {
      // If we have separate date and time
      // First try to interpret the date
      const parsedDate = moment(date, ['ddd, MMM D, YYYY', 'YYYY-MM-DD', 'M/D/YYYY', 'D MMM YYYY'])
      
      // Then extract hours and minutes from the time string
      const timeMatch = startTime.match(/(\d+):(\d+)\s*(am|pm|AM|PM)?/)
      if (timeMatch) {
        let hours = parseInt(timeMatch[1])
        const minutes = parseInt(timeMatch[2])
        const ampm = timeMatch[3]?.toLowerCase()
        
        // Handle AM/PM if present
        if (ampm === 'pm' && hours < 12) hours += 12
        if (ampm === 'am' && hours === 12) hours = 0
        
        // Set the time components
        parsedStartTime = parsedDate.clone().hours(hours).minutes(minutes).seconds(0).milliseconds(0)
      } else {
        // Fallback: just try to parse the whole string
        parsedStartTime = moment(`${date} ${startTime}`)
      }
    } else {
      // Fallback to default
      parsedStartTime = moment('2025-05-10T17:00:00.000Z')
    }
    
    // Same process for end time
    if (endTime && endTime.includes('T') && endTime.includes('Z')) {
      parsedEndTime = moment(endTime)
    } else if (date && endTime) {
      const parsedDate = moment(date, ['ddd, MMM D, YYYY', 'YYYY-MM-DD', 'M/D/YYYY', 'D MMM YYYY'])
      
      const timeMatch = endTime.match(/(\d+):(\d+)\s*(am|pm|AM|PM)?/)
      if (timeMatch) {
        let hours = parseInt(timeMatch[1])
        const minutes = parseInt(timeMatch[2])
        const ampm = timeMatch[3]?.toLowerCase()
        
        if (ampm === 'pm' && hours < 12) hours += 12
        if (ampm === 'am' && hours === 12) hours = 0
        
        parsedEndTime = parsedDate.clone().hours(hours).minutes(minutes).seconds(0).milliseconds(0)
      } else {
        parsedEndTime = moment(`${date} ${endTime}`)
      }
    } else {
      parsedEndTime = moment('2025-05-10T17:30:00.000Z')
    }
    
    // Ensure end time is after start time
    if (parsedEndTime.isSameOrBefore(parsedStartTime)) {
      parsedEndTime = moment(parsedStartTime).add(1, 'hour') // Add 1 hour
    }

  } catch (error) {
    console.error('Error parsing dates, using defaults:', error)
    // Use default dates if parsing fails
    parsedStartTime = moment('2025-05-10T17:00:00.000Z')
    parsedEndTime = moment('2025-05-10T17:30:00.000Z')
  }
  
  // Format venue address properly
  let formattedAddress = venueName
  
  // Only add address parts if they seem valid
  if (venueAddress && 
     !venueAddress.includes('[object Object]') && 
     !venueAddress.includes('undefined undefined')) {
    formattedAddress = `${venueName}, ${venueAddress}`
  }
  
  // Make sure address doesn't have trailing commas
  formattedAddress = formattedAddress
    .replace(/,\s*,/g, ',')
    .replace(/,\s*$/g, '')
    .trim()
  
  // Format dates for various calendar systems
  const googleStartDate = parsedStartTime.utc().format('YYYYMMDDTHHmmss') + 'Z'
  const googleEndDate = parsedEndTime.utc().format('YYYYMMDDTHHmmss') + 'Z'
  
  // Format for Apple Calendar deep link (used for webcal:// protocol)
  const appleStartDate = parsedStartTime.utc().format('YYYYMMDDTHHmmss')
  const appleEndDate = parsedEndTime.utc().format('YYYYMMDDTHHmmss')
  
  // Create formatted event description with highlighted day name
  const eventDescription = `Your court booking at ${venueName}.
    
Time: ${parsedStartTime.format('h:mm A')} - ${parsedEndTime.format('h:mm A')}
Date: ${parsedStartTime.format('dddd, MMMM D, YYYY')}
Day: ${parsedStartTime.format('dddd')}
${additionalDetails ? `\n${additionalDetails}` : ''}

Booking ID: ${bookingId}`
  
  // Format dates for the email template display
  const startDate = parsedStartTime.format('YYYY-MM-DD')
  const endDate = parsedEndTime.format('YYYY-MM-DD')
  
  // Extract date components for the template using moment for proper formatting
  const day = parsedStartTime.date()
  const month = parsedStartTime.format('MMMM') // Full month name
  const monthShort = parsedStartTime.format('MMM').toUpperCase() // Short month name in uppercase
  const year = parsedStartTime.year()
  
  // Get full and abbreviated day names using moment
  const dayName = parsedStartTime.format('dddd') // Full day name (e.g., "Sunday")
  const dayShort = parsedStartTime.format('ddd').toUpperCase() // Short day name in uppercase (e.g., "SUN")
  const formattedDate = `${day} ${month} ${year}`
  
  // Create and return a CalendarEvent object that follows the interface
  const calendarEvent: CalendarEvent & { 
    dayName: string;
    dayShort: string;
    day: number;
    month: string;
    monthShort: string;
    year: number;
    formattedDate: string;
  } = {
    title: `Court Booking: ${courtName} - ${venueName}`,
    description: eventDescription,
    location: formattedAddress,
    startTime: parsedStartTime.toISOString(),  // Use ISO string to match interface
    endTime: parsedEndTime.toISOString(),      // Use ISO string to match interface
    startDate,  // Add formatted date for email template
    endDate,    // Add formatted date for email template
    googleStartDate,
    googleEndDate,
    uid: bookingId,
    // Add date components for template
    dayName,
    dayShort,
    day,
    month,
    monthShort,
    year,
    formattedDate,
    // Apple Calendar format
    appleStartDate,
    appleEndDate,
    // Add formatted time strings for display in email template
    displayStartTime: parsedStartTime.format('h:mm A'),
    displayEndTime: parsedEndTime.format('h:mm A'),
    displayTimeRange: `${parsedStartTime.format('h:mm A')} - ${parsedEndTime.format('h:mm A')}`
  }
  
  return calendarEvent
}