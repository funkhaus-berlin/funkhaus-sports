# Funkhaus Sports - End-to-End Project Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Overview](#architecture-overview)
4. [Frontend Architecture](#frontend-architecture)
5. [Backend Architecture](#backend-architecture)
6. [Database Schema](#database-schema)
7. [Authentication & Security](#authentication--security)
8. [Payment System](#payment-system)
9. [Email Notifications](#email-notifications)
10. [Wallet Pass Integration](#wallet-pass-integration)
11. [User Flows](#user-flows)
12. [Development Guide](#development-guide)
13. [Deployment & Infrastructure](#deployment--infrastructure)
14. [Security Considerations](#security-considerations)
15. [Future Enhancements](#future-enhancements)

---

## Project Overview

Funkhaus Sports is a comprehensive sports facility booking platform that enables users to book courts at various venues with integrated payment processing, email confirmations, and QR code check-in functionality.

### Key Features
- **Multi-venue Support**: Manage multiple sports facilities
- **Flexible Booking Flow**: Configurable booking steps per venue
- **Real-time Availability**: Live court availability updates
- **Integrated Payments**: Secure Stripe payment processing
- **Email Confirmations**: Automated booking confirmations with invoices
- **QR Code Check-in**: Scan-to-check-in functionality
- **Admin Dashboard**: Comprehensive venue and booking management
- **Wallet Integration**: Apple/Google wallet pass support (ready but not activated)

### User Roles
1. **Guest/Customer**: Book courts, make payments, receive confirmations
2. **Staff**: Check-in users via QR scanner
3. **Venue Manager**: Manage specific venue(s), view bookings
4. **Venue Owner**: Full control over venue(s), analytics access
5. **Super Admin**: System-wide administration

---

## Technology Stack

### Frontend
- **Framework**: Lit 3.3.0 (Web Components)
- **UI Library**: Schmancy UI 0.2.194 (Custom component library)
- **State Management**: RxJS 7.8.2 (Reactive programming)
- **Styling**: Tailwind CSS 4.1.6
- **Build Tool**: Vite 6.3.5
- **Language**: TypeScript 5.8.3 (strict mode)

### Backend
- **Functions**: Netlify Functions (Serverless)
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Storage**: Firebase Storage
- **Hosting**: Firebase Hosting + Netlify

### Third-party Services
- **Payments**: Stripe
- **Email**: Resend
- **Wallet Passes**: Google Wallet API (ready)
- **Maps**: Google Maps (for venue locations)

---

## Architecture Overview

The application follows a modern serverless architecture with clear separation between frontend and backend:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│  Lit Frontend   │────▶│ Netlify Functions│────▶│    Firebase     │
│  (Web Components)│     │   (Serverless)   │     │  (Database)     │
│                 │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                         │
         │                       │                         │
         ▼                       ▼                         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│     Stripe      │     │     Resend       │     │  Google Wallet  │
│   (Payments)    │     │    (Email)       │     │    (Passes)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Key Architectural Patterns

1. **Component-Based Architecture**: Each UI element is a self-contained Web Component
2. **Reactive State Management**: RxJS observables for all async operations
3. **Serverless Backend**: Stateless functions for API endpoints
4. **Event-Driven**: Webhooks for payment processing and status updates
5. **Real-time Updates**: Firestore listeners for live data synchronization

---

## Frontend Architecture

### Component Structure

Each component follows a consistent pattern:

```typescript
@customElement('component-name')
export class ComponentName extends $LitElement() {
  // 1. Properties & State
  @property() externalProp = ''
  @state() internalState = false
  @select(context) contextData!: Type
  
  // 2. Lifecycle
  connectedCallback() { /* setup */ }
  disconnectedCallback() { /* cleanup */ }
  
  // 3. Methods
  private helperMethod() { /* logic */ }
  private handleEvent() { /* handlers */ }
  
  // 4. Single render method
  render() { /* all UI in one method */ }
}
```

### State Management

Uses Schmancy's context system for global state:

```typescript
// Define context
const bookingContext = new Context<Booking>('booking', {
  persistence: 'local' // 'local' | 'session' | 'none'
})

// Use in components
@select(bookingContext) booking!: Booking

// Update context
bookingContext.next(updatedBooking)
```

### Routing

Custom area-based routing:
- `/` - Public booking flow
- `/admin` - Admin dashboard
- `/admin/venues` - Venue management
- `/scanner` - QR code scanner
- `/booking-confirmation` - Post-payment confirmation

### Key Frontend Features

1. **Progressive Enhancement**: Steps appear as data becomes available
2. **Responsive Design**: Mobile-first with adaptive layouts
3. **Optimistic UI**: Immediate feedback with background processing
4. **Accessibility**: ARIA labels, keyboard navigation
5. **Performance**: Code splitting, lazy loading, caching

---

## Backend Architecture

### API Endpoints

All endpoints are serverless Netlify Functions:

#### Public Endpoints
- `POST /api/create-payment-intent` - Initialize Stripe payment
- `POST /api/stripe-webhook` - Handle Stripe webhooks
- `POST /api/send-booking-email` - Send confirmation emails
- `GET /api/payment-status` - Check payment/booking status
- `POST /api/generate-wallet-pass` - Generate wallet passes

#### Protected Endpoints
- `POST /api/create-user` - Create/update users (requires auth)
- `POST /api/schedule-availability` - Maintenance tasks (API key)
- `GET /api/booking-recovery` - Recovery operations (API key)

### Error Handling

Consistent error response format:
```json
{
  "error": "Error message",
  "details": "Additional context",
  "code": "ERROR_CODE"
}
```

### Recovery Mechanisms

1. **Payment Recovery**: Creates bookings from successful payments if original failed
2. **Idempotency**: Prevents duplicate webhook processing
3. **Abandoned Cleanup**: Removes stuck bookings after timeout
4. **Audit Logging**: All critical operations logged

---

## Database Schema

### Collections Structure

#### `bookings`
Primary collection for all booking records:
- Tracks booking lifecycle from creation to completion
- Links users, venues, courts, and payments
- Maintains status history and audit trail

#### `venues`
Sports facility information:
- Operating hours and settings
- Booking flow configuration
- Pricing and policies
- Theme customization

#### `courts`
Individual courts within venues:
- Sport types and amenities
- Pricing tiers
- Availability status
- Visual positioning for maps

#### `users`
User accounts and permissions:
- Role-based access control
- Venue-specific permissions
- Firebase Auth integration

#### `counters`
Sequential number generation:
- Invoice numbers
- Future: booking reference numbers

### Data Relationships

```
User (1) ──creates──> (N) Booking
Booking (N) ──references──> (1) Court
Booking (N) ──references──> (1) Venue  
Court (N) ──belongs to──> (1) Venue
User (N) ──manages──> (N) Venue
```

---

## Authentication & Security

### Authentication Flow

1. **User Registration/Login**:
   - Firebase Auth with email/password
   - Guest checkout available
   - Email verification optional

2. **Session Management**:
   - Firebase ID tokens (1-hour expiry)
   - Automatic token refresh
   - Secure logout with cleanup

3. **Authorization**:
   - Role-based access control (RBAC)
   - Venue-specific permissions
   - Custom claims in Firebase tokens

### Security Measures

#### Implemented
- HTTPS everywhere
- CORS configuration
- Input validation
- SQL injection prevention (NoSQL)
- XSS protection (Lit sanitization)

#### Vulnerabilities to Address
1. **Firestore Rules**: Currently too permissive
2. **Rate Limiting**: Not implemented
3. **MFA**: Not available
4. **API Authentication**: Some endpoints need stronger auth

---

## Payment System

### Payment Flow

1. **Initialization**:
   ```
   User selects booking → Frontend prepares data → 
   Create payment intent (backend) → Return client secret
   ```

2. **Processing**:
   ```
   User enters card → Stripe Elements validation → 
   Confirm payment → 3D Secure if required
   ```

3. **Confirmation**:
   ```
   Stripe webhook → Verify signature → Update booking → 
   Generate invoice → Send email → Update status
   ```

### Key Features

- **PCI Compliance**: Card details never touch our servers
- **3D Secure**: Automatic handling for European cards
- **Recovery**: Multiple fallback mechanisms
- **Idempotency**: Prevents duplicate charges
- **Audit Trail**: Complete payment history

### Stripe Integration

- Fixed API version: `2025-04-30.basil`
- Test/production key switching
- Comprehensive webhook handling
- Metadata for booking recovery

---

## Email Notifications

### Email System Components

1. **Service**: Resend API
2. **Templates**: Pug templates
3. **Attachments**: PDF invoices
4. **Features**: Calendar events, QR codes

### Email Flow

```
Booking confirmed → Generate invoice number → 
Create PDF invoice → Generate QR code → 
Render email template → Send via Resend → 
Update booking status
```

### Email Features

- **Responsive Design**: Mobile-optimized
- **Calendar Integration**: ICS files, deep links
- **Structured Data**: JSON-LD for Gmail
- **Retry Logic**: Manual resend endpoint
- **Status Tracking**: Delivery confirmation

---

## Wallet Pass Integration

### Current Status
Complete implementation ready but commented out pending certificates.

### Architecture

1. **Google Wallet**:
   - JWT authentication
   - Pass class/object structure
   - Save URL generation

2. **Apple Wallet** (Planned):
   - PKPass file generation
   - Pass signing with certificates
   - Direct download

### Integration Points

- Booking confirmation page
- Email confirmation links
- Auto-generation via URL params

---

## User Flows

### Booking Flow

1. **Venue Selection**:
   - Browse venues or direct link
   - View venue details and courts

2. **Booking Configuration**:
   - Select date (calendar view)
   - Choose court (visual/list)
   - Pick time slot
   - Select duration

3. **Payment**:
   - Enter user details
   - Secure card payment
   - 3D Secure if required

4. **Confirmation**:
   - Success page with details
   - QR code for check-in
   - Email with invoice
   - Calendar download

### Admin Flow

1. **Dashboard Access**:
   - Secure login
   - Role-based view

2. **Venue Management**:
   - Add/edit venues
   - Configure courts
   - Set pricing

3. **Booking Management**:
   - View all bookings
   - Filter and search
   - Export data

### Check-in Flow

1. **Scanner Access**:
   - Open scanner page
   - Grant camera permission

2. **QR Scanning**:
   - Scan booking QR
   - Validate booking
   - Update status

---

## Development Guide

### Prerequisites
- Node.js 18+
- npm 8+
- Firebase CLI
- Stripe CLI (for webhooks)

### Setup Instructions

1. **Clone Repository**:
   ```bash
   git clone [repository]
   cd funkhaus-sports
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Environment Variables**:
   Create `.env` file with required keys

4. **Start Development**:
   ```bash
   npm run dev
   ```

5. **With Emulators**:
   ```bash
   npm run dev:emulators
   ```

### Development Commands

- `npm run dev` - Start dev server
- `npm run build` - Production build
- `npm run preview` - Preview build
- `npm run emulators` - Firebase emulators
- `npm run lint` - Code linting
- `npm run typecheck` - TypeScript check

### Code Style

- **Formatting**: Tabs (width 2), single quotes
- **Components**: PascalCase
- **Methods**: camelCase
- **CSS**: Tailwind utilities
- **Comments**: Minimal, self-documenting code

---

## Deployment & Infrastructure

### Hosting Setup

1. **Frontend**: Firebase Hosting
2. **Functions**: Netlify Functions
3. **Database**: Firebase Firestore
4. **Storage**: Firebase Storage

### Deployment Process

1. **Build**:
   ```bash
   npm run build
   ```

2. **Deploy Frontend**:
   ```bash
   firebase deploy --only hosting
   ```

3. **Deploy Functions**:
   Automatic via Netlify Git integration

### Environment Configuration

Required environment variables:
- Firebase configuration
- Stripe keys
- Resend API key
- Netlify function URLs

---

## Security Considerations

### Current Security Measures

✅ **Implemented**:
- HTTPS enforcement
- Input validation
- XSS protection
- CSRF protection (SameSite cookies)
- Secure payment processing

❌ **Needs Implementation**:
- Proper Firestore security rules
- Rate limiting
- API authentication for all endpoints
- Multi-factor authentication
- Security headers (CSP, HSTS)

### Recommended Security Enhancements

1. **Firestore Rules**:
   ```javascript
   // Implement role-based access
   match /bookings/{booking} {
     allow read: if request.auth.uid == resource.data.userId 
       || hasVenueAccess(resource.data.venueId);
     allow create: if request.auth != null;
     allow update: if hasVenueStaffAccess(resource.data.venueId);
   }
   ```

2. **Rate Limiting**:
   - Use Firebase Extensions
   - Implement per-IP limits
   - Protect payment endpoints

3. **Enhanced Authentication**:
   - Add MFA for admin accounts
   - Implement session timeouts
   - Add password complexity rules

---

## Future Enhancements

### Planned Features

1. **Recurring Bookings**: Weekly/monthly court reservations
2. **Membership System**: Discounts and priority booking
3. **Mobile Apps**: Native iOS/Android applications
4. **Analytics Dashboard**: Advanced booking analytics
5. **Multi-language Support**: Internationalization

### Technical Improvements

1. **Performance**:
   - Implement service workers
   - Add offline support
   - Optimize bundle sizes

2. **Scalability**:
   - Add caching layer
   - Implement CDN
   - Database sharding

3. **Monitoring**:
   - Error tracking (Sentry)
   - Performance monitoring
   - User analytics

### Integration Opportunities

1. **Calendar Sync**: Two-way calendar integration
2. **Payment Methods**: PayPal, Apple Pay, Google Pay
3. **Communication**: SMS notifications, WhatsApp
4. **Social Features**: Share bookings, invite friends
5. **Review System**: Court and venue ratings

---

## Conclusion

Funkhaus Sports demonstrates a well-architected, modern web application with:
- Clean separation of concerns
- Robust error handling and recovery
- Scalable serverless architecture
- Comprehensive booking management
- Strong foundation for future growth

The system is production-ready with some security enhancements needed, particularly around database access controls and API rate limiting. The codebase follows consistent patterns and best practices, making it maintainable and extensible.