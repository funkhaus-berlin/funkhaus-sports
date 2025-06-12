# Funkhaus Sports - Claude Instructions

This file provides comprehensive instructions for Claude when working with the Funkhaus Sports booking application codebase.

## CRITICAL INSTRUCTIONS

**🚨 MOST IMPORTANT - ALWAYS IN YOUR FRONT HEAD 🚨**
1. **NEVER ASSUME APIs - ALWAYS DOUBLE CHECK DOCUMENTATION/INTERFACES**: 
   - **ALWAYS** check for working examples in the codebase FIRST
   - **ALWAYS** verify the actual implementation before using ANY API
   - **ALWAYS** check library or module documentation if no examples found
   - **NEVER** use an API without verifying its exact implementation
   - **NEVER** assume how an API works based on its name or your memory
   - This rule is PARAMOUNT and must be your FIRST consideration for EVERY code change

2. **Never Assume Interfaces**: 
   - **ALWAYS** double check models, types, and interface definitions
   - **ALWAYS** reference the exact types used in the codebase
   - **NEVER** rely on memory or assumptions about type structures
   - **NEVER use `any` type** - always use proper types or create appropriate interfaces

3. **Component-Based Architecture**: 
   - Components must fully encapsulate their logic
   - Each component should be responsible for its own state and behavior
   - Minimize dependencies between components
   - Create separate files for related components (e.g., 'booking-details-sheet.ts')
   - Import components where needed with standard import statements

4. **UI Structure**: 
   - Don't break UI into separate functions
   - Use a single Render function containing all UI
   - Avoid if conditions within templates
   - Use Lit directives for conditional rendering (when, choose, etc.)

5. **Event Handling**: 
   - Functions should be inline with element callbacks
   - Use @change or @click with arrow functions for event handlers
   - Example: `@click=${() => this.handleClick()}`

6. **Functional Programming**: 
   - Strictly use functional programming techniques
   - Pipe logic in one easy-to-read direction
   - Use RxJS for reactive data flows and transformations
   - Chain operations with pipe() to create clear data processing flows

7. **Schmancy UI Components**:
   - Component documentation is located at: `node_modules/@mhmo91/schmancy/ai`
   - Always check documentation before using Schmancy components
   - Follow established patterns for component usage throughout the codebase
   - NEVER assume how Schmancy components work! Always check existing usage in the codebase or look for documentation in node_modules/@mhmo91/schmancy/ai folder that contains all .md docs for the Schmancy components

8. **STYLING - NO CUSTOM CSS**:
   - USE ONLY TAILWIND CSS UTILITY CLASSES
   - NO custom CSS except for minimal :host { display: block; }
   - ALL styling must be done with Tailwind classes
   - NO @keyframes, NO custom CSS animations - use Tailwind's animation utilities
   - NO CSS-in-JS, NO styled components, NO CSS modules
   - If you need complex styling, compose multiple Tailwind classes

9. **RxJS Best Practices - CRITICAL**:
   - **Minimal Functions**: Components should have only 2-3 functions maximum:
     - `connectedCallback()` - Setup RxJS pipelines
     - One action handler (e.g., `handleUpdate()`, `handleSave()`) - Process user actions
     - `render()` - All UI logic must be here
   - **RxJS Pipeline Pattern**:
     ```typescript
     of(initialData).pipe(
       tap(() => { /* side effects like loading state */ }),
       switchMap(data => /* async operations */),
       map(result => /* transformations */),
       tap(() => { /* update state */ }),
       catchError(err => { /* handle errors */ return EMPTY }),
       finalize(() => { /* cleanup like loading = false */ }),
       takeUntil(this.disconnecting)
     ).subscribe()
     ```
   - **State Updates**: Always update state within `tap()` operators in the pipeline
   - **Error Handling**: Use `catchError()` returning `EMPTY` for non-fatal errors
   - **Cleanup**: Always use `takeUntil(this.disconnecting)` for automatic unsubscription
   - **No Scattered Logic**: Never create separate helper functions for UI formatting or calculations - use inline expressions or IIFEs in render()
   - **Event Handling in Pipelines**: Use `fromEvent()` for reactive event handling
   - **Avoid Imperative Code**: Replace try/catch blocks with RxJS error operators

## Project Overview

Funkhaus Sports is a sports facility booking application built with:
- **Frontend**: Lit components, TypeScript, Tailwind CSS
- **Backend**: Firebase (Auth, Firestore), Netlify Functions
- **Payment Processing**: Stripe integration
- **Email Notifications**: Resend

The application allows:
- Venue owners to manage their sports facilities (courts, schedules, pricing)
- Users to book courts with online payment
- Check-in functionality via QR code scanning

## Project Structure

- `/src/admin/`: Admin dashboard components for venue management
- `/src/public/`: User-facing components and booking flow
- `/src/firebase/`: Firebase configuration and authentication services
- `/src/db/`: Database collection interfaces
- `/src/scanner/`: QR code scanning for check-in
- `/src/bookingServices/`: Booking-related services
- `/netlify/functions/`: Serverless backend functions
- `/src/types/`: TypeScript type definitions
- `node_modules/@mhmo91/schmancy/ai`: Schmancy UI component documentation

## Development Commands

- `npm run dev`: Start development server with hot reloading
- `npm run build`: Build production-ready assets
- `npm run preview`: Preview production build locally
- `npm run emulators`: Start Firebase emulators
- `npm run dev:emulators`: Run development server with Firebase emulators
- `stripe listen --forward-to http://localhost:8888/api/stripe-webhook`: Forward Stripe webhooks to local server

## Architecture Patterns

### Components

- **Lit Components**: Use decorators (@customElement, @property, @state, @query)
- Components should follow this organization pattern:
  1. Properties and state
  2. Lifecycle methods
  3. Helper methods
  4. Event handlers
  5. Render method

### Reactive Programming

- Uses RxJS extensively for reactive patterns
- Observable streams for Firebase data
- Reactive context providers for state management
- Always use pipe() for transformations and side effects
- Maintain unidirectional data flow

### Routing & Navigation

- Custom area-based routing system via @mhmo91/schmancy
- Navigation handled through area.push() with component references

### Authentication

- Firebase Authentication for user management
- Custom user context for reactive user state

### Data Management

- Firestore collections with typed interfaces
- Collection services for CRUD operations
- Reactive data streams with RxJS

## Code Style Guidelines

- **TypeScript**: Use strict typing with noUnusedLocals and noUnusedParameters
- **Formatting**: 
  - Tabs (width 2)
  - Single quotes
  - No semicolons
  - 120 character line length
- **Naming**: 
  - PascalCase for classes/components
  - camelCase for methods/properties
- **CSS**: Use Tailwind utility classes in templates
- **Error Handling**: Use BookingErrorService with appropriate ErrorCategory

## Lit Component Structure

- Single render() method with all UI
- Use Lit directives for conditional rendering:
  ```typescript
  ${when(this.condition, 
    () => html`<div>Shown when true</div>`, 
    () => html`<div>Shown when false</div>`
  )}
  ```
- Inline event handlers:
  ```typescript
  <button @click=${() => this.handleClick()}>Click Me</button>
  ```
- Avoid breaking UI into separate template functions

### Schmancy UI Components

Schmancy UI is the component library used throughout the application. Documentation can be found at:
`node_modules/@mhmo91/schmancy/ai`

Common components include:
- Layout: `schmancy-grid`, `schmancy-flex`
- Typography: `schmancy-typography`
- Inputs: `schmancy-button`, `schmancy-input`
- Surfaces: `schmancy-surface`, `schmancy-card`
- Feedback: `schmancy-badge`, `schmancy-chip`, `schmancy-progress`
- Dialogs: `schmancy-sheet` (via the `sheet` utility)

Example of dialog usage:
```typescript
// Open a dialog
sheet.open({
  component: detailsSheet,
  fullScreenOnMobile: true
})

// Close a dialog
sheet.dismiss(this.tagName)
```

Below is an example from the codebase showing proper use of conditional rendering with the `when` directive:

```typescript
// From scanner.ts
<div class="overscroll-none overflow-hidden splash ${this.showSplash ? 'show' : ''} ${this.splashColor}">
  ${this.validBooking
    ? html`
        <schmancy-grid justify="center" align="center" gap="sm">
          <schmancy-typography type="display">
            ${this.checkedIn ? 'Already Checked In' : 'Valid Booking'}
          </schmancy-typography>
          <schmancy-typography type="headline">
            ${this.bookingInfo?.userName}
          </schmancy-typography>
        </schmancy-grid>
      `
    : html`
        <schmancy-grid justify="center" align="center" gap="md">
          <schmancy-typography type="display">Invalid Booking</schmancy-typography>
          ${when(
            this.reason,
            () => html`<schmancy-typography type="headline">Reason: ${this.reason}</schmancy-typography>`,
          )}
        </schmancy-grid>
      `}
</div>
```

Example of proper inline event handlers from the codebase:

```typescript
// From admin.ts
<schmancy-list-item
  .selected=${this.activeTab === 'venues-management'}
  @click=${() => {
      this.navigateToVenues()
      schmancyNavDrawer.close()
  }}
  rounded
  variant="container"
>
  <schmancy-flex gap="md">
    <schmancy-icon>location_on</schmancy-icon>
    Venues
  </schmancy-flex>
</schmancy-list-item>
```

## RxJS Pattern Examples

```typescript
// Good pattern - unidirectional data flow with pipe
someObservable$
  .pipe(
    filter(value => value !== null),
    map(value => transformValue(value)),
    switchMap(value => anotherObservable(value)),
    takeUntil(this.disconnecting)
  )
  .subscribe({
    next: result => this.handleResult(result),
    error: err => this.handleError(err)
  })
```

### Reactive Selection Pattern

When implementing selection mechanisms (e.g., selecting items from a list or map), follow this reactive pattern:

1. **Decouple Selection Trigger from Logic**:
   - Selection handlers should only update the state/context with the selected ID
   - All selection logic should be handled via reactive subscriptions

```typescript
// Bad - mixing concerns
private handleItemSelect(item: Item): void {
  // Don't do complex logic here
  if (!this.canSelect(item)) return
  this.processSelection(item)
  this.updateUI(item)
  this.transitionToNext()
}

// Good - separation of concerns
private handleItemSelect(item: Item): void {
  // Only update state
  if (!this.canSelect(item.id)) {
    notify.error('Cannot select this item')
    return
  }
  selectionContext.set({ selectedId: item.id }, true)
}

// Handle logic reactively
private subscribeToSelection(): void {
  selectionContext.$.pipe(
    takeUntil(this.disconnecting),
    map(state => state.selectedId),
    distinctUntilChanged(),
    filter(id => !!id),
    switchMap(id => 
      // Fetch full data if needed
      itemsContext.$.pipe(
        filter(items => items.size > 0),
        map(items => ({ id, item: items.get(id) })),
        take(1)
      )
    ),
    filter(({ item }) => !!item),
    tap(({ item }) => {
      // All selection logic here
      this.processFilters(item)
      this.checkAvailability(item)
      this.updateUI(item)
      this.transitionToNext()
    })
  ).subscribe()
}
```

2. **Benefits of This Pattern**:
   - Multiple UI components can trigger selection without duplicating logic
   - Selection logic is centralized and testable
   - Easy to add new selection triggers (e.g., keyboard shortcuts, different UI views)
   - Reactive flow ensures consistency across the application

3. **Implementation Steps**:
   - Create simple event handlers that only update state
   - Use RxJS subscriptions with `distinctUntilChanged()` to react to changes
   - Place all business logic in the subscription pipeline
   - Use `switchMap` to fetch additional data if needed
   - Keep side effects in `tap()` operators

Below is an example from the codebase showing how QR scanning is implemented:

```typescript
// From scanner.ts
this.qrScanSubscription = animationFrames()
  .pipe(
    map(() => {
      // Only scan if we have enough video data
      if (!this.videoElement || this.videoElement.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
        return null
      }
      // Create an offscreen canvas for the current frame
      const canvas = document.createElement('canvas')
      canvas.width = this.videoElement.videoWidth
      canvas.height = this.videoElement.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // Attempt to detect a QR code in the image
      const code = jsQR(imageData.data, imageData.width, imageData.height)
      return code ? code.data : null
    }),
    // Only pass on non-null values when we're ready and not busy processing
    filter(qrCode => qrCode !== null && this.isReadyToScan && !this.isBusy),
    // Throttle to avoid firing too often
    throttleTime(1500, undefined, { leading: true, trailing: false }),
  )
  .subscribe(qrCode => {
    // Process the new QR code
    this.onQrCodeScanned(qrCode!)
  })
```

Example of Firebase data fetching with proper error handling:

```typescript
BookingsDB.get(qrCode)
  .pipe(
    timeout(2000), // Ensure we don't wait forever
    finalize(() => {
      if (!this.isReadyToScan) {
        timer(750).subscribe(() => {
          this.showSplash = false
          this.isReadyToScan = true
          this.isBusy = false
          this.requestUpdate()
        })
      }
    }),
    catchError(() => of(null)),
  )
  .subscribe({
    next: booking => {
      // Handle booking data
    },
    error: error => {
      // Handle errors
    }
  })
```

## Key Components & Services

### Booking Flow

1. Sport selection
2. Court selection
3. Date/time selection
4. Duration selection
5. User details
6. Payment via Stripe
7. Confirmation with calendar integration

### Scanner Functionality

- QR code scanning for check-in
- Real-time validation against Firestore
- Status updates (completed, no-show)
- Visual and audio feedback

### Admin Dashboard

- Venue management (add, edit, delete)
- Court configuration
- Booking overview
- Analytics

## Common Tasks & Patterns

1. **Adding new components**:
   - Create new .ts file with @customElement decorator
   - Register in global HTMLElementTagNameMap interface
   - Follow single render function pattern
   - For related components, create separate files and import as needed
   
   ```typescript
   // In src/scanner/booking-details-sheet.ts
   import { sheet } from '@mhmo91/schmancy'
   import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
   import { html } from 'lit'
   import { customElement, property } from 'lit/decorators.js'
   import { BookingsDB } from 'src/db/bookings.collection'
   import { Booking, BookingStatus } from 'src/types/booking/models'
   
   @customElement('booking-details-sheet')
   export class BookingDetailsSheet extends $LitElement() {
     @property({ type: Object }) booking?: Booking
     @property({ type: Boolean }) processing = false
     
     render() {
       // Single render method with all UI
     }
     
     // Helper methods
     getStatusVariant(status: BookingStatus): string {
       // Implementation
     }
     
     // Event handlers
     markAsCompleted() {
       this.updateBookingStatus('completed')
     }
     
     // Private methods
     private updateBookingStatus(status: BookingStatus) {
       // Implementation with RxJS
     }
   }
   
   declare global {
     interface HTMLElementTagNameMap {
       'booking-details-sheet': BookingDetailsSheet
     }
   }
   ```
   
   ```typescript
   // In src/scanner/scanner.ts
   import './booking-details-sheet'  // Import the related component
   
   @customElement('booking-scanner')
   export default class BookingScanner extends $LitElement() {
     // Implementation
     
     // Use imported component
     showBookingDetails(booking: Booking) {
       const detailsSheet = document.createElement('booking-details-sheet') as HTMLElement & { booking?: Booking }
       detailsSheet.booking = booking
       
       sheet.open({
         component: detailsSheet,
         fullScreenOnMobile: true
       })
     }
   }
   
   declare global {
     interface HTMLElementTagNameMap {
       'booking-scanner': BookingScanner
     }
   }
   ```

2. **Working with Firebase**:
   - Use collection services for data operations
   - Subscribe to observables for reactive updates
   - Unsubscribe in disconnectedCallback
   - Always check exact API usage in existing code
   
   ```typescript
   // Example of Firebase data operations with RxJS - From booking-details-sheet.ts
   private updateBookingStatus(status: BookingStatus) {
     if (!this.booking || this.processing) return
     
     this.processing = true
     
     of(this.booking).pipe(
       tap(() => console.log(`Updating booking ${this.booking?.id} status to ${status}`)),
       finalize(() => this.processing = false),
       tap(booking => BookingsDB.upsert({
         ...booking,
         status: status,
         updatedAt: new Date().toISOString()
       }, booking.id).subscribe({
         next: () => {
           console.log(`Successfully updated booking status to ${status}`)
           sheet.dismiss(this.tagName)
         },
         error: (err) => console.error(`Error updating booking status: ${err}`)
       })),
       catchError(err => {
         console.error('Error in status update flow:', err)
         return of(null)
       })
     ).subscribe()
   }
   ```

3. **Component State Management**:
   - Use @property for externally accessible properties
   - Use @state for internal component state
   - Use @query for DOM element references
   - Use @select for accessing reactive context data
   
   ```typescript
   @property({ type: String }) venueId = ''  // External property
   @state() isReadyToScan = false            // Internal state
   @query('#video') videoElement!: HTMLVideoElement  // DOM reference
   @select(courtsContext) courts!: Map<string, Court>  // Reactive context data
   ```
   
   Example of using @select with reactive context (from booking-details-sheet.ts):
   
   ```typescript
   @select(courtsContext)
   courts!: Map<string, Court>
   
   /**
    * Get court name from court ID using courts context
    */
   private getCourtName(): void {
     if (!this.booking?.courtId) {
       this.courtName = 'Not specified'
       return
     }
     
     // If courts are already loaded
     if (courtsContext.ready && this.courts) {
       const court = this.courts.get(this.booking.courtId)
       this.courtName = court?.name || `Court ${this.booking.courtId.substring(0, 4)}...`
       return
     }
     
     // Otherwise, subscribe to courts changes
     courtsContext.$.pipe(
       take(1),
       tap(() => {
         if (!courtsContext.ready) return
         
         const court = this.courts.get(this.booking?.courtId || '')
         this.courtName = court?.name || `Court ${this.booking?.courtId.substring(0, 4)}...`
       })
     ).subscribe()
   }
   ```

4. **Lifecycle Management**:
   - Initialize in connectedCallback
   - Clean up in disconnectedCallback
   - Use firstUpdated for DOM operations after render
   
   ```typescript
   // Example lifecycle management
   connectedCallback() {
     super.connectedCallback()
     // Setup code...
   }
   
   disconnectedCallback() {
     super.disconnectedCallback()
     // Clean up camera stream
     const stream = this.videoElement?.srcObject as MediaStream
     if (stream) {
       stream.getTracks().forEach(track => track.stop())
     }
     // Unsubscribe from observables
     this.qrScanSubscription?.unsubscribe()
   }
   ```

5. **Deployment**:
   - Frontend deployed to Firebase Hosting
   - Serverless functions deployed to Netlify
   - Stripe webhook endpoints need proper configuration

### Netlify Function Configuration

When adding new Pug templates or static assets to Netlify functions:

1. **Include template files in netlify.toml**: Any `.pug` templates used by functions must be explicitly included in the `included_files` array:
   ```toml
   [functions]
   included_files = [
     "netlify/functions/_shared/ticket.pug",
     "netlify/functions/_shared/refund.pug", 
     "netlify/functions/_shared/refund-delay.pug",
     "netlify/functions/_shared/assets/**",
     "netlify/functions/_shared/data/**"
   ]
   ```

2. **Path resolution**: In Netlify's function environment, use `../` for relative paths:
   ```typescript
   // Correct path for Netlify functions
   const html = renderFile(resolve(__dirname, '../_shared/template.pug'), data)
   ```

## Debugging & Testing

- Use browser console for frontend debugging
- Firebase emulators for backend testing
- Stripe CLI for webhook testing
- Mobile device testing important for scanner functionality

## Security Considerations

- Never expose Firebase credentials in client code
- Use Firebase security rules for data access control
- Validate all user input on both client and server
- Sanitize data displayed to users
