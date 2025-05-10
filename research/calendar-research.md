# Calendar Research

## Apple Calendar Compatibility

Apple Calendar follows strict RFC 5545 compliance for iCalendar format. Key requirements include:

- DTSTAMP, DTSTART, and DTEND must be properly formatted in UTC time with Z suffix (20220101T120000Z format)
- Each event requires a unique UID that remains consistent (typically using a UUID or domain-specific ID)
- METHOD must be set to REQUEST for invitations, PUBLISH for notifications
- Content-Type should be 'text/calendar; method=REQUEST; charset=UTF-8'
- MIME boundary must be properly set for multipart emails
- Proper line folding for lines over 75 characters (continuation line begins with space)
- Special characters must be properly escaped (commas, semicolons, etc.)

## Visual Calendar Previews

Industry leaders like Airbnb, Booking.com and Google implement calendar previews using:

- Schema.org Event markup for structured data
- Apple Mail uses .ics attachments with x-apple-data-detectors
- Gmail supports structured event data with EventSchema
- Outlook uses special preview headers
- Use of table-based layout for consistent rendering across email clients
- Date displayed prominently with month/day separation
- Clear visual hierarchy with time, title, and location
- Icons to represent calendar elements (clock for time, pin for location)
- High contrast color scheme for readability

## Add to Calendar Buttons

- Google: https://calendar.google.com/calendar/render?action=TEMPLATE&text=[title]&dates=[start]/[end]&details=[description]&location=[location]
- Outlook: https://outlook.office.com/calendar/0/deeplink/compose?subject=[title]&body=[description]&startdt=[start]&enddt=[end]&location=[location]
- Apple: Uses .ics attachment with webcal:// protocol or direct .ics download
- Yahoo: https://calendar.yahoo.com/?v=60&title=[title]&st=[start]&et=[end]&desc=[description]&in_loc=[location]

## MIME Content Types

- Primary: text/calendar; method=REQUEST; charset=UTF-8
- For attachments: application/ics
- Alternative for Apple compatibility: text/calendar; charset=utf-8
- Content-Disposition: attachment; filename="invite.ics"

## Best Practices

1. Always include both HTML and plain text versions
2. Use multipart/alternative MIME type
3. Include .ics as attachment for maximum compatibility
4. Include alternate calendar service links
5. Test with real devices and email clients
6. Use standardized date/time formats (UTC with Z suffix)
7. Implement proper line folding in ICS files
8. Escape special characters in ICS content
9. Use unique, consistent UIDs for events
10. Make sure visual elements degrade gracefully in clients that don't support HTML

## Common Issues with Apple Calendar

1. Incorrect date/time format (must include Z for UTC)
2. Missing or incorrectly formatted UID
3. Improper line folding
4. Unescaped special characters
5. Incorrect MIME type or content-disposition
6. Missing METHOD parameter in Content-Type header
7. Inconsistent line endings (must use CRLF - \r\n)
8. Improperly escaped or formatted DESCRIPTION and SUMMARY fields
