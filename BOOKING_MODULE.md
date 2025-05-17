# Funkhaus Sports Booking Module

This document provides a comprehensive overview of the booking module within the Funkhaus Sports application. It serves as a reference for Claude to understand the booking system architecture, components, and workflows.

## 1. Core Components & Architecture

### Main Components

- **CourtBookingSystem** (`src/public/book/book.ts`)
  - Main orchestrator for the entire booking flow
  - Manages step navigation and validation
  - Handles booking creation and payment initiation
  - Renders the main booking container and step components

- **FunkhausBookingSteps** (`src/public/book/components/steps/steps.ts`)
  - Renders the horizontal step progress indicator
  - Controls step expansion/collapse
  - Manages step validation state

- **Step Components** (`src/public/book/components/steps/`)
  - `sport-court-card.ts`: Sport selection cards
  - `court-select.ts`: Court selection interface
  - `date-select.ts`: Date picker component
  - `start-time-select.ts`: Time slot selection
  - `duration-select.ts`: Duration selection
  - `payment-step.ts`: Payment processing with Stripe

- **Booking Context Providers**
  - `context.ts`: Main booking data context
  - `availability-context.ts`: Court availability data
  - Enables reactive state management across components

### Serverless Functions

- **create-payment-intent.ts**: Creates Stripe payment intents
- **send-booking-email.ts**: Sends confirmation emails with attachments
- **stripe-webhook.ts**: Processes Stripe payment events
- **generate-wallet-pass.ts**: Creates Apple/Google Wallet passes

## 2. Data Flow & State Management

### State Management

The booking system uses a reactive context-based approach with three primary contexts:

1. **bookingContext** (`src/public/book/context.ts`)
   - Stores current booking data (court, time, date, price, etc.)
   - Persisted to session storage
   - Observable with RxJS

2. **BookingProgressContext** (`src/public/book/context.ts`)
   - Tracks current step in the booking flow
   - Manages errors and validation state
   - Controls step visibility/expansion

3. **availabilityContext** (`src/availability-context.ts`)
   - Stores court availability data
   - Maps booking flow steps and sequences
   - Reactive to date/court selection changes

### Booking Flow Process

1. **User Input Flow**:
   - User selects sport → Updates bookingContext
   - User selects court → Updates bookingContext
   - User selects date → Triggers availability check
   - User selects time → Updates price calculation
   - User enters details → Validates form fields
   - User submits payment → Creates booking

2. **Booking Creation Process**:
   - Create temporary booking in Firestore
   - Generate Stripe payment intent
   - Redirect to Stripe checkout
   - Process webhook confirmation
   - Update booking status to confirmed
   - Send confirmation email with calendar invite
   - Generate and send wallet pass

## 3. Key Interfaces & Types

### Core Types

- **Booking** (`src/types/booking/models.ts`)
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
  ```

- **BookingStatus** (`src/types/booking/models.ts`)
  ```typescript
  export type BookingStatus =
    | 'temporary'
    | 'pending'
    | 'confirmed'
    | 'cancelled'
    | 'completed'
    | 'no-show'
    | 'refunded'
    | 'failed'
    | 'processing'
  ```

- **BookingProgress** (`src/types/booking/progress.ts`)
  ```typescript
  export class BookingProgress {
    currentStep: number = 1;
    maxStepReached: number = 1;
    expandedSteps: number[] = [1];
    error?: BookingError;
  }
  ```

- **BookingError** (`src/types/booking/errors.ts`)
  ```typescript
  export interface BookingError {
    message: string;
    category: ErrorCategory;
    code?: string;
    timestamp: number;
    fieldErrors?: BookingErrorField[];
    isDismissible?: boolean;
  }
  ```

## 4. Services & Utilities

- **BookingService** (`src/bookingServices/booking.service.ts`)
  - Creates, updates, and cancels bookings
  - Checks availability before booking
  - Handles transaction-based booking to prevent double-booking

- **DynamicPricingService** (`src/bookingServices/dynamic-pricing-service.ts`)
  - Calculates booking prices based on time, date, and court
  - Supports peak/off-peak pricing
  - Handles special pricing rules

- **PaymentService** (`src/public/book/payment-service.ts`)
  - Initializes Stripe payment flow
  - Creates payment intent via serverless function
  - Handles payment status updates

- **BookingErrorService** (`src/public/book/components/errors/booking-error-service.ts`)
  - Centralized error handling for booking flow
  - Categorizes errors for appropriate display
  - Provides recovery suggestions

- **EmailService** (`src/public/book/components/services/email.service.ts`)
  - Sends booking confirmation emails
  - Generates calendar invitations
  - Attaches wallet passes

## 5. Integration with External Services

### Firebase Integration

- **Firestore**: Stores booking data, court info, and availability
- **Authentication**: User identification for bookings
- **Security Rules**: Enforces access control
- **Transactions**: Prevents double-booking through atomic operations

### Stripe Integration

- **Client-side**: Stripe Elements for secure payment collection
- **Server-side**:
  - Payment intent creation
  - Webhook processing
  - Payment status handling

### Email Service (Resend)

- HTML email templates
- PDF receipt attachments
- Calendar (.ics) integration
- Responsive design

### Wallet Pass Integration

- Apple Wallet pass generation
- Google Wallet pass generation
- Dynamic pass updates
- QR code for check-in

## 6. Error Handling & Validation

### Error Categories

- **Validation**: Form field validation errors
- **Payment**: Stripe payment processing errors
- **Availability**: Court already booked errors
- **Network**: Connection-related errors
- **System**: Unexpected application errors

### Error Recovery

- Field-level validation with immediate feedback
- Automatic retry for transient errors
- Alternative suggestions for availability conflicts
- Clear error messaging with recovery actions

### Form Validation

- Client-side validation with the FormValidator
- Server-side validation in serverless functions
- Real-time validation feedback
- Required field highlighting

## 7. Common Booking Workflows

### Standard Booking Flow

1. Select sport
2. Select court
3. Select date
4. Select time
5. Select duration
6. Enter user details
7. Process payment
8. Receive confirmation

### Admin Booking Management

1. View bookings in admin dashboard
2. Filter by date, court, status
3. Edit booking details
4. Cancel or refund bookings
5. Mark as completed or no-show

### Check-in Process

1. Scan QR code from email or wallet pass
2. Verify booking details
3. Mark booking as checked in
4. Display confirmation to user

## 8. Key Dependencies

- **Lit**: Web component framework
- **RxJS**: Reactive programming library
- **Firebase/Firestore**: Database and authentication
- **Stripe**: Payment processing
- **Resend**: Email service
- **@mhmo91/schmancy**: UI component library

## 9. Keeping This Document Updated

Claude should maintain this document by:

1. When analyzing code that modifies the booking flow:
   - Update relevant sections of this document
   - Add new components, services, or interfaces
   - Revise workflows if the booking process changes

2. When implementing new booking features:
   - Document new types or interfaces
   - Update the component hierarchy if changed
   - Add new external service integrations

3. Note changes to:
   - Core booking data structures
   - State management patterns
   - Integration points with external services
   - Error handling strategies

This document serves as a living reference that should evolve alongside the codebase to maintain an accurate understanding of the booking module architecture.