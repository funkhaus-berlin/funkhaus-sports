# BookingDetailsSheet Component

This file documents the BookingDetailsSheet component for the Funkhaus Sports booking system. This component displays booking details when a QR code is scanned successfully.

## Usage

The component is designed to be used with the Schmancy sheet system. It should be created and displayed as follows:

```typescript
// Create and configure the component
const detailsSheet = document.createElement('booking-details-sheet') as HTMLElement & { booking?: Booking }
detailsSheet.booking = bookingObject

// Open the sheet
sheet.open({
  component: detailsSheet,
  fullScreenOnMobile: true
})
```

## Properties

| Property | Type | Description |
|----------|------|-------------|
| booking | Booking | The booking data to display |
| processing | boolean | Whether an operation is in progress |

## Methods

### Public Methods

- `markAsCompleted()`: Mark booking as completed (checked in)
- `markAsNoShow()`: Mark booking as no-show
- `getStatusVariant(status: BookingStatus)`: Get appropriate chip variant for status display

### Private Methods

- `updateBookingStatus(status: BookingStatus)`: Update booking status with proper RxJS handling

## Events

The component doesn't emit custom events but interacts with:

- `sheet.dismiss()`: Called when closing the sheet

## Styling

The component uses Tailwind CSS classes and Schmancy UI components for styling. Key classes:

- Container layouts: `p-4`, `mb-4`, `flex`, `grid`
- Colors: `bg-primary-container`, `bg-surface-variant`
- Spacing: `gap-3`, `mt-6`, `pt-4`
- Borders: `border-t`, `border-outline-variant`

## Example

```html
<booking-details-sheet></booking-details-sheet>
```

## Relationships

- Used by: `BookingScanner` component
- Depends on: `BookingsDB`, Schmancy UI components

## Implementation Notes

1. The component follows the functional programming paradigm with RxJS
2. Uses a single render method with conditional rendering
3. Handles both success and error states
4. No separate template functions - all UI in render()
5. Proper cleanup of subscriptions