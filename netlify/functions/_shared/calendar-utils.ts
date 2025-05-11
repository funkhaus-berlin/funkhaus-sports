// /netlify/functions/_shared/calendar-utils.ts
import moment from 'moment'

export interface CalendarEvent {
  id: string
  title: string
  description: string
  location: string
  startTime: Date | string
  endTime: Date | string
  // Add formatted date strings for Google Calendar and other services
  googleStartDate?: string
  googleEndDate?: string
  startDate?: string
  endDate?: string
}

/**
 * Generate a simple ICS file following exactly the same format as the frontend implementation
 * This ensures compatibility with all calendar systems
 */
export function generateICSFile(event: CalendarEvent): string {
  try {
    // Log incoming event data for debugging
    console.log('Creating calendar event with data:', {
      id: event.id,
      title: event.title, 
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location
    })
    
    // Convert dates to moment objects for consistent formatting
    const startDate = moment(event.startTime)
    const endDate = moment(event.endTime)
    
    // Format dates exactly like the frontend implementation
    const start = startDate.utc().format('YYYYMMDDTHHmmss')
    const end = endDate.utc().format('YYYYMMDDTHHmmss')
    const now = moment().utc().format('YYYYMMDDTHHmmss')
    
    // Create UID in same format as frontend
    const uid = `booking-${event.id || Math.random().toString(36).substring(2, 11)}@funkhaus-sports.com`
    
    // Clean up location string to ensure it's properly formatted
    // Remove any [object Object] references that might be in the string
    const cleanLocation = (typeof event.location === 'string') 
      ? event.location.replace(/\[object Object\]/g, '').replace(/undefined/g, '').replace(/,\s*,/g, ',').replace(/,\s*$/g, '')
      : 'Funkhaus Sports Berlin'
    
    console.log('Cleaned location for calendar:', cleanLocation)
    
    // Create calendar content in exact same format as frontend
    // The key is to use \r\n for line breaks - critical for Apple Calendar compatibility
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Funkhaus Berlin Sports//Court Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}Z`,
      `DTSTART:${start}Z`,
      `DTEND:${end}Z`,
      `SUMMARY:${event.title}`,
      `LOCATION:${cleanLocation}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n')
    
    // Log the generated ICS content for debugging
    console.log('Generated ICS file content :', icsContent)
    
    return icsContent
  } catch (error) {
    console.error('Error generating ICS file:', error)
    
    // If anything fails, provide a simple fallback
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Funkhaus Berlin Sports//Court Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:fallback-${Date.now()}@funkhaus-sports.com`,
      `DTSTAMP:${moment().utc().format('YYYYMMDDTHHmmss')}Z`,
      `DTSTART:${moment().utc().format('YYYYMMDDTHHmmss')}Z`,
      `DTEND:${moment().add(1, 'hour').utc().format('YYYYMMDDTHHmmss')}Z`,
      'SUMMARY:Court Booking',
      'LOCATION:Funkhaus Berlin Sports Center',
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n')
  }
}

/**
 * Create a calendar event from booking data
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
): CalendarEvent {
  // Log all input parameters for debugging
  console.log('createCalendarEvent input parameters:', {
    bookingId,
    courtName,
    venueName,
    venueAddress,
    startTime,
    endTime,
    date,
    additionalDetails
  });
  let parsedStartTime: Date
  let parsedEndTime: Date
  
  try {
    // Try to properly parse the time and date inputs
    if (startTime && startTime.includes('T') && startTime.includes('Z')) {
      // If it's already in ISO format
      parsedStartTime = new Date(startTime)
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
        parsedDate.hours(hours).minutes(minutes).seconds(0).milliseconds(0)
        parsedStartTime = parsedDate.toDate()
      } else {
        // Fallback: just try to parse the whole string
        parsedStartTime = new Date(`${date}T${startTime}`)
      }
    } else {
      // Fallback to default
      parsedStartTime = new Date('2025-05-10T17:00:00.000Z')
    }
    
    // Same process for end time
    if (endTime && endTime.includes('T') && endTime.includes('Z')) {
      parsedEndTime = new Date(endTime)
    } else if (date && endTime) {
      const parsedDate = moment(date, ['ddd, MMM D, YYYY', 'YYYY-MM-DD', 'M/D/YYYY', 'D MMM YYYY'])
      
      const timeMatch = endTime.match(/(\d+):(\d+)\s*(am|pm|AM|PM)?/)
      if (timeMatch) {
        let hours = parseInt(timeMatch[1])
        const minutes = parseInt(timeMatch[2])
        const ampm = timeMatch[3]?.toLowerCase()
        
        if (ampm === 'pm' && hours < 12) hours += 12
        if (ampm === 'am' && hours === 12) hours = 0
        
        parsedDate.hours(hours).minutes(minutes).seconds(0).milliseconds(0)
        parsedEndTime = parsedDate.toDate()
      } else {
        parsedEndTime = new Date(`${date}T${endTime}`)
      }
    } else {
      parsedEndTime = new Date('2025-05-10T17:30:00.000Z')
    }
    
    // Ensure end time is after start time
    if (parsedEndTime <= parsedStartTime) {
      parsedEndTime = new Date(parsedStartTime.getTime() + 60 * 60 * 1000) // Add 1 hour
    }
    
    console.log('Parsed dates:', { 
      startTime, 
      endTime, 
      parsedStartTime: parsedStartTime.toISOString(), 
      parsedEndTime: parsedEndTime.toISOString() 
    })
  } catch (error) {
    console.error('Error parsing dates, using defaults:', error)
    // Use default dates if parsing fails
    parsedStartTime = new Date('2025-05-10T17:00:00.000Z')
    parsedEndTime = new Date('2025-05-10T17:30:00.000Z')
  }
  
  // Format venue address properly
  let formattedAddress = venueName
  
  // Only add address parts if they seem valid (not undefined or [object Object])
  if (venueAddress && 
     !venueAddress.includes('[object Object]') && 
     !venueAddress.includes('undefined undefined')) {
    formattedAddress = `${venueName}, ${venueAddress}`
  }
  
  console.log('Formatted location for calendar:', formattedAddress)
  
  // Format dates for Google Calendar (YYYYMMDDTHHmmssZ format)
  let googleStartDate, googleEndDate, startDate, endDate
  
  try {
    // Use moment.js to format dates consistently for Google Calendar
    googleStartDate = moment(parsedStartTime).utc().format('YYYYMMDDTHHmmss') + 'Z'
    googleEndDate = moment(parsedEndTime).utc().format('YYYYMMDDTHHmmss') + 'Z'
    
    // Format dates for ISO strings
    startDate = moment(parsedStartTime).toISOString()
    endDate = moment(parsedEndTime).toISOString()
    
    console.log('Successfully formatted calendar dates:', {
      googleStartDate,
      googleEndDate
    })
  } catch (error) {
    console.error('Error formatting dates for calendar:', error)
    // Provide fallback values
    googleStartDate = ''
    googleEndDate = ''
    startDate = ''
    endDate = ''
  }
  
  return {
    id: bookingId,
    title: `Court Booking: ${courtName} - ${venueName}`,
    description: `Your court booking at ${venueName}.
    
Time: ${moment(parsedStartTime).format('h:mm A')} - ${moment(parsedEndTime).format('h:mm A')}
Date: ${moment(parsedStartTime).format('dddd, MMMM D, YYYY')}
${additionalDetails ? `\n${additionalDetails}` : ''}

Booking ID: ${bookingId}`,
    location: formattedAddress,
    startTime: parsedStartTime,
    endTime: parsedEndTime,
    // Add pre-formatted date strings to avoid template processing
    googleStartDate,
    googleEndDate,
    startDate,
    endDate
  }
}
