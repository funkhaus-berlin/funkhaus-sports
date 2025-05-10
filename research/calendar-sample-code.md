# Sample Code for Calendar Integration

## 1. Proper ICS File Generation

```typescript
/**
 * Generate an RFC 5545 compliant ICS file for Apple Calendar compatibility
 */
function generateICS(
  eventId: string,
  title: string,
  description: string,
  location: string,
  startTimeUTC: Date,
  endTimeUTC: Date
): string {
  // Format dates in UTC format with Z suffix (required by Apple Calendar)
  const formatUTCDate = (date: Date): string => {
    return date.toISOString()
      .replace(/[-:]/g, '')  // Remove dashes and colons
      .replace(/\.\d{3}/, ''); // Remove milliseconds
  };
  
  // Create a unique UID that's consistent for this event
  const uid = `${eventId.replace(/\W/g, '')}@yourdomain.com`;
  
  // Properly escape text for iCalendar format
  const escapeText = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/;/g, '\\;')    // Escape semicolons
      .replace(/,/g, '\\,')    // Escape commas
      .replace(/\n/g, '\\n');  // Convert newlines
  };
  
  // Implement line folding according to RFC 5545
  const foldLine = (line: string): string => {
    if (line.length <= 75) {
      return line;
    }
    
    let result = '';
    for (let i = 0; i < line.length; i += 75) {
      result += (i > 0 ? '\r\n ' : '') + line.substring(i, Math.min(i + 75, line.length));
    }
    return result;
  };
  
  // Build the iCalendar content
  const now = new Date();
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//YourCompany//YourApp//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    foldLine(`UID:${uid}`),
    `DTSTAMP:${formatUTCDate(now)}Z`,
    `DTSTART:${formatUTCDate(startTimeUTC)}Z`,
    `DTEND:${formatUTCDate(endTimeUTC)}Z`,
    foldLine(`SUMMARY:${escapeText(title)}`),
    foldLine(`DESCRIPTION:${escapeText(description)}`),
    foldLine(`LOCATION:${escapeText(location)}`),
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  
  // Join with CRLF as required by RFC 5545
  return icsLines.join('\r\n');
}
```

## 2. HTML Calendar Preview Using Tables (Email-Safe)

```html
<\!-- Email-safe calendar preview that renders well across clients -->
<table cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; margin: 20px 0; background-color: #f8f8f8; border-left: 4px solid #0078D4; border-radius: 4px;">
  <tr>
    <td style="padding: 20px;">
      <\!-- Date Column -->
      <table cellpadding="0" cellspacing="0" border="0" style="float: left; text-align: center; padding-right: 15px; margin-right: 15px; border-right: 1px solid #ddd; min-width: 60px;">
        <tr>
          <td style="text-transform: uppercase; font-size: 14px; font-weight: bold; color: #000; font-family: Arial, sans-serif;">
            MAY
          </td>
        </tr>
        <tr>
          <td style="font-size: 24px; font-weight: bold; line-height: 1; margin: 5px 0; font-family: Arial, sans-serif;">
            10
          </td>
        </tr>
        <tr>
          <td style="font-size: 14px; color: #666; font-family: Arial, sans-serif;">
            2023
          </td>
        </tr>
      </table>

      <\!-- Event Details -->
      <table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif;">
        <tr>
          <td style="font-weight: bold; margin-bottom: 10px; font-size: 16px; font-family: Arial, sans-serif;">
            🎾 Court Booking: Tennis Court 3
          </td>
        </tr>
        <tr>
          <td style="font-weight: bold; margin-bottom: 8px; font-size: 14px; font-family: Arial, sans-serif;">
            ⏰ 3:30 PM - 5:00 PM
          </td>
        </tr>
        <tr>
          <td style="color: #666; font-size: 14px; font-family: Arial, sans-serif;">
            📍 Funkhaus Sports Center
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

## 3. Attaching ICS File with Proper MIME Headers

```typescript
// Example using NodeMailer (similar concept applies to other email libraries)
const mailOptions = {
  from: 'Your Company <bookings@example.com>',
  to: 'customer@example.com',
  subject: 'Your Booking Confirmation',
  html: emailHtml, // Your HTML email content
  attachments: [
    {
      filename: 'event.ics',
      content: generateICS(eventId, title, description, location, startTime, endTime),
      contentType: 'text/calendar; charset=UTF-8; method=REQUEST',
      contentDisposition: 'attachment'
    }
  ],
  alternatives: [
    {
      contentType: 'text/calendar; charset=UTF-8; method=REQUEST',
      content: generateICS(eventId, title, description, location, startTime, endTime)
    }
  ]
};
```

## 4. Add to Calendar Links

```html
<\!-- Add to Calendar Buttons -->
<table cellpadding="0" cellspacing="0" border="0" style="width: 100%; text-align: center; margin: 20px 0;">
  <tr>
    <td>
      <a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=Court%20Booking%3A%20Tennis%20Court%203&dates=20230510T153000Z%2F20230510T170000Z&details=Your%20court%20booking%20at%20Funkhaus%20Sports.%20Booking%20ID%3A%20ABC123&location=Funkhaus%20Sports%20Center&sf=true&output=xml" target="_blank" style="display: inline-block; background-color: #4285F4; color: white; padding: 8px 15px; margin: 5px; text-decoration: none; border-radius: 4px; font-family: Arial, sans-serif;">Google Calendar</a>
      
      <a href="https://outlook.office.com/calendar/0/deeplink/compose?subject=Court%20Booking%3A%20Tennis%20Court%203&body=Your%20court%20booking%20at%20Funkhaus%20Sports.%20Booking%20ID%3A%20ABC123&startdt=20230510T153000Z&enddt=20230510T170000Z&location=Funkhaus%20Sports%20Center" target="_blank" style="display: inline-block; background-color: #0078D4; color: white; padding: 8px 15px; margin: 5px; text-decoration: none; border-radius: 4px; font-family: Arial, sans-serif;">Outlook Calendar</a>
      
      <a href="#" style="display: inline-block; background-color: #000000; color: white; padding: 8px 15px; margin: 5px; text-decoration: none; border-radius: 4px; font-family: Arial, sans-serif;">Apple Calendar (Use Attachment)</a>
    </td>
  </tr>
  <tr>
    <td style="padding-top: 10px; font-family: Arial, sans-serif; font-size: 14px; color: #666;">
      Just open the attached .ics file to add this event to your calendar
    </td>
  </tr>
</table>
```
