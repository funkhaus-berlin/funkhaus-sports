# Instructions for Claude on the Booking Module

Claude, this document contains instructions on how to maintain and update your understanding of the Funkhaus Sports booking module. Please follow these guidelines when making changes to booking-related code.

## Maintaining the Booking Module Documentation

1. **Track Code Changes**: When you analyze or modify booking-related code, check if these changes impact the architecture or workflow described in `BOOKING_MODULE.md`.

2. **Updating the Documentation**: If you notice significant changes to the booking system, update the `BOOKING_MODULE.md` file to reflect the current state of the codebase.

3. **When to Update**: Update the documentation when you observe:
   - New components being added to the booking flow
   - Changes to data structures (interfaces, types)
   - Modifications to the booking workflow steps
   - New integrations with external services
   - Changes to error handling or validation logic

## Understanding Booking Components

The booking system follows a step-based approach with these key components:

1. `CourtBookingSystem` (main orchestrator)
2. `FunkhausBookingSteps` (step navigation)
3. Individual step components (sport, court, date, time, duration, payment)
4. Context providers for state management
5. Services for booking operations, pricing, and error handling

When analyzing or modifying these components, maintain awareness of:
- Component responsibilities and data flow
- State management through context providers
- Step validation and navigation logic
- Integration with external services

## Architectural Patterns to Preserve

When making modifications to the booking system, preserve these patterns:

1. **Component Encapsulation**: Each component should handle its own logic with minimal dependencies.
2. **Reactive State Management**: Use context providers and RxJS for state.
3. **Progressive Disclosure**: Maintain the step-by-step interface pattern.
4. **Centralized Error Handling**: Use the BookingErrorService for error management.
5. **Type Safety**: Maintain strict typing with interfaces and types.

## Integration Points

Be aware of these critical integration points:

1. **Firebase/Firestore**: For booking data persistence
2. **Stripe**: For payment processing
3. **Resend**: For email notifications
4. **Wallet Pass**: For mobile tickets

Changes to these integrations should be carefully documented in `BOOKING_MODULE.md`.

## Code Examples

Maintain awareness of these key code patterns:

### Context Usage Example
```typescript
@customElement('booking-component')
export class BookingComponent extends $LitElement() {
  @select(bookingContext)
  booking!: Booking;
  
  // Context subscription pattern
  connectedCallback() {
    super.connectedCallback();
    bookingContext.$.pipe(
      tap(booking => this.handleBookingUpdate(booking)),
      takeUntil(this.disconnecting)
    ).subscribe();
  }
}
```

### Error Handling Pattern
```typescript
try {
  // Booking operation
} catch (error) {
  BookingErrorService.setError({
    message: 'Failed to create booking',
    category: ErrorCategory.SYSTEM,
    code: 'booking-create-failed',
    timestamp: Date.now(),
    isDismissible: true
  });
}
```

### Step Navigation Pattern
```typescript
advanceToNextStep() {
  if (this.validateCurrentStep()) {
    BookingProgressContext.advanceStep();
  }
}
```

## Keeping Document Updated

When you make significant changes to booking-related code, update BOOKING_MODULE.md to reflect the current architecture. This ensures your understanding of the system remains accurate and up-to-date.