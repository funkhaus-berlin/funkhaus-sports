# Funkhaus Sports Architecture

This document outlines the architectural patterns and design principles used in the Funkhaus Sports application. It serves as a comprehensive guide to understanding the project structure and implementation standards.

## Core Architecture Principles

Funkhaus Sports follows a strict component-based architecture built around these core principles:

1. **Reactive Programming** - Using RxJS for all asynchronous operations
2. **Component Encapsulation** - Each component is responsible for its own state and logic
3. **Unidirectional Data Flow** - State flows down, events flow up
4. **Type Safety** - Comprehensive TypeScript typing throughout the application
5. **Functional Programming** - Pure functions and immutable data structures
6. **Declarative UI** - Using Lit for declarative UI components

## Technology Stack

The application is built with the following technologies:

- **Frontend Framework**: Lit (Web Components)
- **State Management**: Schmancy context system + RxJS
- **Styling**: Tailwind CSS
- **Database**: Firebase Firestore
- **Authentication**: Firebase Authentication
- **APIs**: Netlify Functions (serverless)
- **Payment Processing**: Stripe
- **Email Service**: Resend

## Component Architecture

### Lit Component Structure

Components follow a strict organization pattern:

```typescript
@customElement('component-name')
export class ComponentName extends $LitElement() {
  // 1. Properties and state
  @property({ type: String }) externalProp = '';
  @state() internalState = '';
  @select(someContext) contextData!: ContextType;

  // 2. Lifecycle methods
  connectedCallback() {
    super.connectedCallback();
    // Setup subscriptions
    someContext.$.pipe(
      tap(data => this.handleDataChange(data)),
      takeUntil(this.disconnecting)
    ).subscribe();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Cleanup
  }

  // 3. Helper methods
  private processData(data: SomeType): ProcessedType {
    return /* pure transformation */;
  }

  // 4. Event handlers
  private handleClick() {
    // Handle event
  }

  // 5. Render method
  render() {
    return html`
      <div>
        <h1>${this.title}</h1>
        ${when(this.condition, 
          () => html`<div>Conditional content</div>`, 
          () => html`<div>Alternative content</div>`
        )}
        <button @click=${() => this.handleClick()}>Click me</button>
      </div>
    `;
  }
}
```

### Key Patterns:

1. **Single Render Function**: All UI is contained in one render method
2. **Inline Event Handlers**: Functions are inline with element callbacks
3. **Conditional Rendering**: Uses Lit directives (when, choose, etc.)
4. **Style Encapsulation**: Styles using Tailwind classes

## State Management

Funkhaus Sports uses a reactive context-based state management system:

### Context Creation

```typescript
export const userContext = createContext<User>(
  new User(), // Default value
  'local',    // Storage type (local, session, none)
  'user'      // Storage key
);
```

### Context Selection

```typescript
@select(userContext) 
user!: User;
```

### Context Updates

```typescript
// Full replacement
userContext.set(newUser);

// Partial update
userContext.set({ name: 'New Name' }, true);
```

### Observable Streams

```typescript
userContext.$.pipe(
  filter(user => !!user.id),
  map(user => user.displayName),
  takeUntil(this.disconnecting)
).subscribe(name => {
  this.userName = name;
});
```

## RxJS Patterns

The application consistently follows these RxJS patterns:

### Pipe-Based Transformations

```typescript
someObservable$.pipe(
  filter(value => value !== null),
  map(value => transformValue(value)),
  switchMap(value => anotherObservable(value)),
  takeUntil(this.disconnecting)
).subscribe({
  next: result => this.handleResult(result),
  error: err => this.handleError(err)
});
```

### Subscription Management

```typescript
// Pattern for clean subscription management in components
connectedCallback() {
  super.connectedCallback();
  
  this.subscription = observable$.pipe(
    // operators
    takeUntil(this.disconnecting) // Ensures auto-cleanup
  ).subscribe();
}
```

### Data Fetching

```typescript
// Reactive data fetching pattern
BookingsDB.subscribeToCollection([
  { key: 'date', operator: '==', value: '2023-05-01' },
  { key: 'status', operator: 'in', value: ['confirmed', 'pending'] }
]).pipe(
  takeUntil(this.disconnecting),
  tap(bookings => {
    // Process data
  })
).subscribe();
```

## UI Component Library

The application uses the Schmancy UI component library for consistent UI elements:

### Core Components

- **Layout**: `schmancy-grid`, `schmancy-flex`
- **Typography**: `schmancy-typography`
- **Inputs**: `schmancy-button`, `schmancy-input`, `schmancy-autocomplete`
- **Feedback**: `schmancy-spinner`, `schmancy-notification`
- **Dialog**: `schmancy-sheet` via the `sheet` utility

### Dialog Implementation

```typescript
// Opening a dialog
sheet.open({
  component: detailsSheet,
  fullScreenOnMobile: true
});

// Closing a dialog
sheet.dismiss(this.tagName);
```

## CSS & Styling

The application uses Tailwind CSS for utility-first styling:

### Usage Patterns

```html
<div class="flex flex-col items-center p-4 gap-2 md:flex-row">
  <div class="w-full md:w-1/2 bg-white shadow rounded-lg">
    <h2 class="text-xl font-semibold text-gray-800">Title</h2>
  </div>
</div>
```

### Dynamic Classes

```html
<div class="${this.isActive ? 'bg-primary-500' : 'bg-gray-300'} transition-all duration-300">
  Content
</div>
```

## Firebase Integration

### Authentication

```typescript
// Reactive authentication state
authState$.pipe(
  switchMap(user => {
    if (!user) return of(null);
    return getUserProfile(user.uid);
  }),
  tap(profile => {
    userContext.set(profile || new User());
  })
).subscribe();
```

### Firestore

```typescript
// Type-safe collection service
export class BookingsCollection<T extends Booking = Booking> extends FirestoreService<T> {
  constructor() {
    super('bookings');
  }
  
  // Custom methods
  getActiveBookings(): Observable<Map<string, T>> {
    return this.subscribeToCollection([
      { key: 'status', operator: 'in', value: ['confirmed', 'pending'] }
    ]);
  }
}
```

## Reactive Patterns

### Combining Streams

```typescript
combineLatest([
  dateVenueChanges$,
  courtsContext.$,
  venuesContext.$
]).pipe(
  filter(([, allCourts, allVenues]) => !!allCourts && !!allVenues),
  switchMap(([booking, allCourts, allVenues]) => {
    // Process combined data
    return processedData$;
  })
).subscribe(result => {
  // Handle result
});
```

### Side Effects

```typescript
observable$.pipe(
  tap({
    next: () => this.loading = false,
    error: err => this.handleError(err),
    complete: () => this.finalize()
  })
).subscribe();
```

## Error Handling

### Centralized Error Service

```typescript
BookingErrorService.setError({
  message: 'Failed to create booking',
  category: ErrorCategory.SYSTEM,
  code: 'booking-create-failed',
  timestamp: Date.now(),
  isDismissible: true
});
```

### Error Display Component

```typescript
<booking-error-display
  .error=${BookingProgressContext.value.currentError}
  @dismiss=${() => BookingProgressContext.value.clearError()}
></booking-error-display>
```

## Routing System

### Custom Area-Based Routing

```typescript
// Define routes
area.register([
  { path: 'booking', component: 'court-booking-system' },
  { path: 'confirmation/:id', component: 'booking-confirmation' },
  { path: 'venues', component: 'venues-list' }
]);

// Navigate programmatically
area.push('booking');

// Navigate with parameters
area.push('confirmation/:id', { id: 'abc123' });
```

## Type System

### Comprehensive Interfaces

```typescript
export interface Booking {
  id: string;
  userId: string;
  courtId: string;
  venueId: string;
  startTime: string;
  endTime: string;
  price: number;
  date: string;
  status: BookingStatus;
  userName: string;
  userEmail: string;
  userPhone: string;
  stripePaymentIntentId?: string;
  walletPassId?: string;
  createdAt: string;
  updatedAt: string;
}

export type BookingStatus =
  | 'temporary'
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no-show'
  | 'refunded'
  | 'failed'
  | 'processing';
```

### Type Guards

```typescript
function isConfirmedBooking(booking: Booking): booking is Booking & { status: 'confirmed' } {
  return booking.status === 'confirmed';
}
```

## Code Organization

### Feature-Based Structure

The codebase is organized by feature rather than by technical role:

- `src/admin/`: Admin dashboard components
- `src/public/`: User-facing components
- `src/bookingServices/`: Booking-related services
- `src/firebase/`: Firebase configuration and services
- `src/types/`: TypeScript type definitions
- `netlify/functions/`: Serverless backend functions

### Component Dependencies

Components follow a strict dependency hierarchy:

1. **Base Components**: Reusable UI elements (buttons, inputs)
2. **Feature Components**: Domain-specific components (court-select, date-picker)
3. **Container Components**: Orchestrate feature components (booking-system)
4. **Page Components**: Top-level components for routing

## Best Practices

1. **State Management**:
   - Use context for global state
   - Use component state for local state
   - Keep state minimal and derived when possible

2. **Component Design**:
   - Components should be focused on one responsibility
   - Break complex components into smaller ones
   - Use composition over inheritance

3. **RxJS Usage**:
   - Prefer declarative operators
   - Clean up subscriptions with takeUntil
   - Use appropriate operators for the task

4. **Error Handling**:
   - Centralized error management
   - Graceful degradation
   - User-friendly error messages

5. **Performance**:
   - Minimize component re-renders
   - Use memoization for expensive calculations
   - Optimize RxJS streams with shareReplay when appropriate

## Schmancy Store for State Management

The Schmancy store provides a reactive context system for state management with these key features:

### Context Persistence

```typescript
// Persisted to local storage
const userContext = createContext<User>(new User(), 'local', 'user');

// Persisted to session storage
const bookingContext = createContext<Booking>(defaultBooking, 'session', 'booking');

// In-memory only
const uiStateContext = createContext<UIState>(defaultUIState, 'none');
```

### Reactive Selection

```typescript
@select(bookingContext)
booking!: Booking;

// Subscribe to changes
ngOnInit() {
  bookingContext.$.pipe(
    tap(booking => this.processBooking(booking)),
    takeUntil(this.disconnecting)
  ).subscribe();
}
```

### Atomic Updates

```typescript
// Partial updates
bookingContext.set({ courtId: 'court-123' }, true);

// Complete replacement
bookingContext.set(newBooking);

// Clearing
bookingContext.clear();
```

### Derived State

```typescript
const bookingTotal$ = bookingContext.$.pipe(
  map(booking => calculateTotal(booking)),
  distinctUntilChanged()
);
```

## Conclusion

The Funkhaus Sports application demonstrates a comprehensive implementation of modern web development practices, focusing on component-based architecture, reactive programming, and strong typing. The architecture provides a scalable and maintainable foundation for the sports booking platform, with clear separation of concerns and consistent patterns throughout the codebase.