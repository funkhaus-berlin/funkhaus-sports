# Scanner Module

This module provides QR code scanning functionality for check-in operations in the Funkhaus Sports booking system.

## Components

### BookingScanner

The main component that handles QR code scanning using the device camera.

#### Usage

```typescript
<booking-scanner venueId="venue-123"></booking-scanner>
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| qrCodeMessage | string | The content of the scanned QR code |
| venueId | string | Optional venue ID to filter bookings |

#### States

| State | Type | Description |
|-------|------|-------------|
| validBooking | boolean | Whether the scanned booking is valid |
| showSplash | boolean | Controls the visibility of the splash screen |
| splashColor | string | Color of the splash screen (green/yellow/red) |
| isReadyToScan | boolean | Scanner ready state |
| isBusy | boolean | Processing state |
| bookingInfo | Booking | The retrieved booking data |
| reason | string | Reason for invalid booking |
| checkedIn | boolean | Whether booking is already checked in |

#### Methods

- `startCameraScan()`: Initializes the camera and starts scanning
- `startQrScan()`: Sets up RxJS pipeline for QR code processing
- `onQrCodeScanned(qrCode: string)`: Processes scanned QR codes
- `showBookingDetails(booking: Booking)`: Opens booking details sheet
- `playSuccessSound()`: Plays audio feedback for successful scans

### BookingDetailsSheet

A component that displays booking details and allows check-in operations.

#### Usage

```typescript
const detailsSheet = document.createElement('booking-details-sheet') as HTMLElement & { booking?: Booking }
detailsSheet.booking = bookingObject
sheet.open({ component: detailsSheet })
```

## Architecture

- **Component Separation**: Components are in separate files with clear responsibilities
- **RxJS for Data Flow**: Uses RxJS observables for reactive processing
- **Functional Style**: Logic flows in a unidirectional manner through RxJS operators
- **Single Render Method**: UI rendering follows the single render method pattern
- **Lit Directives**: Uses directives like `when` for conditional rendering

## Implementation Notes

1. The QR scanning logic uses the `jsQR` library with RxJS for processing
2. Camera frame processing happens in animation frames for performance
3. Error handling uses RxJS patterns (catchError, finalize)
4. Visual feedback is provided through splash screens with color coding
5. Audio feedback is provided through Web Audio API

## Examples

### QR Scanning Pipeline

```typescript
animationFrames()
  .pipe(
    map(() => {
      // Convert frame to QR code data
    }),
    filter(qrCode => qrCode !== null && this.isReadyToScan && !this.isBusy),
    throttleTime(1500, undefined, { leading: true, trailing: false }),
  )
  .subscribe(qrCode => {
    this.onQrCodeScanned(qrCode!)
  })
```

### Booking Retrieval

```typescript
BookingsDB.get(qrCode)
  .pipe(
    timeout(2000),
    finalize(() => {
      // Cleanup logic
    }),
    catchError(() => of(null)),
  )
  .subscribe({
    next: booking => {
      // Process booking data
    },
    error: error => {
      // Handle errors
    }
  })
```

## Related Components

- Uses contexts from `courtsContext` for court information
- Integrates with `BookingsDB` for data retrieval and updates
- Uses `sheet` from Schmancy for dialog displays