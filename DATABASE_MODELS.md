# Database Models and Relationships Documentation

This document provides a comprehensive overview of the database models, their properties, and relationships in the Funkhaus Sports booking application.

## Overview

The Funkhaus Sports application uses Firebase Firestore as its database with the following main collections:

- **bookings** - Court booking records
- **courts** - Sports court/facility information  
- **venues** - Sports venue information
- **users** - System users (admin, staff, etc.)

## Entity Relationship Diagram

```
┌─────────────┐
│   Venues    │
└──────┬──────┘
       │ 1
       │
       ├────────────┐
       │            │ *
┌──────▼──────┐ ┌──▼──────────┐
│   Courts    │ │   Users     │
└──────┬──────┘ └──────┬──────┘
       │ 1             │ 1
       │               │
       │ *             │ *
    ┌──▼───────────────▼──┐
    │     Bookings        │
    └─────────────────────┘
```

## Database Models

### 1. Booking Model (`bookings` collection)

Represents a court reservation made by a user.

#### Core Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique booking identifier |
| `userId` | string | User who made the booking (FK → User) |
| `userName` | string | Name of the booking user |
| `userEmail` | string? | User's email address |
| `userPhone` | string? | User's phone number |
| `courtId` | string | Reference to court (FK → Court) |
| `venueId` | string | Reference to venue (FK → Venue) |
| `startTime` | string | Booking start time (ISO format) |
| `endTime` | string | Booking end time (ISO format) |
| `price` | number | Total booking price |
| `date` | string | Booking date |
| `status` | BookingStatus | Current booking status |
| `paymentIntentId` | string? | Stripe payment intent ID |
| `customerAddress` | Address? | Customer address details |
| `createdAt` | string? | Creation timestamp |
| `updatedAt` | string? | Last update timestamp |
| `lastActive` | string? | Last user activity (for holding status) |
| `isGuestBooking` | boolean? | Whether user was logged in |

#### Booking Statuses
- `holding` - Temporary hold while payment is being processed
- `confirmed` - Payment successful, booking is active
- `completed` - User has checked in / session finished
- `cancelled` - Booking has been cancelled

#### Email Tracking Properties
| Property | Type | Description |
|----------|------|-------------|
| `emailSent` | boolean? | Whether confirmation email was sent |
| `emailSentAt` | string? | Timestamp of email sent |
| `emailError` | string? | Error message if email failed |
| `emailFailedAt` | string? | Timestamp of email failure |
| `emailRetryCount` | number? | Number of retry attempts |
| `emailPermanentlyFailed` | boolean? | Whether email permanently failed |

#### Refund Properties
| Property | Type | Description |
|----------|------|-------------|
| `refundId` | string? | Stripe refund ID |
| `refundStatus` | RefundStatus? | Current refund status |
| `refundAmount` | number? | Amount refunded |
| `refundedAt` | string? | Refund timestamp |
| `refundReason` | string? | Reason for refund |
| `refundedBy` | string? | Admin user ID who processed refund |
| `refundedByEmail` | string? | Email of admin who processed refund |

RefundStatus: `'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'requires_action'`

### 2. Court Model (`courts` collection)

Represents a bookable sports court or facility within a venue.

#### Core Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique court identifier |
| `venueId` | string | Parent venue (FK → Venue) |
| `name` | string | Court name |
| `number` | string? | Court number |
| `courtType` | CourtType | Type of court |
| `sportTypes` | SportTypeEnum[] | Supported sports |
| `surfaceType` | SurfaceTypeEnum? | Court surface material |
| `dimensions` | Dimensions? | Court dimensions |
| `pricing` | Pricing | Pricing configuration |
| `status` | CourtStatus | Current court status |
| `amenities` | string[]? | Available amenities |
| `images` | string[]? | Court images |
| `createdAt` | string | Creation timestamp |
| `updatedAt` | string | Last update timestamp |
| `mapCoordinates` | CourtMapCoordinates? | Map positioning |

#### Court Types
- `indoor` - Indoor court
- `outdoor` - Outdoor court
- `covered` - Covered outdoor court
- `hybrid` - Can be configured as indoor/outdoor

#### Sport Types
- `volleyball`
- `pickleball`
- `padel`

#### Surface Types
- `hardCourt`, `clay`, `grass`, `carpet`, `wood`, `synthetic`, `concrete`, `turf`, `rubber`

#### Pricing Structure
```typescript
{
  baseHourlyRate: number;
  peakHourRate?: number;
  weekendRate?: number;
  memberDiscount?: number;
  specialRates?: Map<string, SpecialRate>;
}
```

#### Court Status
- `active` - Available for booking
- `maintenance` - Under maintenance
- `inactive` - Not available

### 3. Venue Model (`venues` collection)

Represents a sports facility that contains multiple courts.

#### Core Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique venue identifier |
| `name` | string | Venue name |
| `description` | string? | Venue description |
| `venueType` | VenueTypeEnum | Type of venue |
| `address` | VenueAddress | Full address with coordinates |
| `contactEmail` | string? | Contact email |
| `contactPhone` | string? | Contact phone |
| `website` | string? | Venue website |
| `facilities` | FacilityEnum[] | Available facilities |
| `operatingHours` | OperatingHours | Weekly schedule |
| `maxCourtCapacity` | number? | Maximum number of courts |
| `settings` | VenueSettings? | Booking configuration |
| `status` | VenueStatus | Current venue status |
| `createdAt` | string | Creation timestamp |
| `updatedAt` | string | Last update timestamp |
| `createdBy` | string? | User who created venue |
| `images` | string[]? | Venue images |
| `theme` | Theme? | UI theme configuration |
| `latitude` | number? | Latitude coordinate |
| `longitude` | number? | Longitude coordinate |

#### Venue Types
- `sportsFacility`
- `fitnessCentre`
- `recreationalComplex`
- `stadium`
- `trainingCentre`
- `countryClub`
- `communityCenter`
- `school`
- `university`
- `privateClub`

#### Facilities
- `parking`, `wifi`, `toilets`, `cafe`, `lockers`, `showers`, `changingRooms`
- `proShop`, `equipmentRental`, `firstAid`, `waterFountain`, `vendingMachines`
- `spectatorSeating`, `airConditioning`, `heating`, `lighting`, `soundSystem`
- `wheelchairAccess`, `courtMaintenance`

#### Venue Settings
```typescript
{
  minBookingTime: number;        // minutes
  maxBookingTime: number;        // minutes
  bookingTimeStep: number;       // minutes
  advanceBookingLimit: number;   // days
  cancellationPolicy: {
    allowCancellation: boolean;
    cancellationDeadline: number; // hours before booking
    refundPercentage: number;     // 0-100
  };
  bookingFlow?: BookingFlowType;
}
```

#### Operating Hours
Weekly schedule with each day having:
```typescript
{
  open: string;   // "09:00"
  close: string;  // "22:00"
} | null // null means closed
```

### 4. User Model (`users` collection)

Represents system users including admins, venue managers, and staff.

#### Core Properties

| Property | Type | Description |
|----------|------|-------------|
| `uid` | string | Unique user identifier (Firebase Auth UID) |
| `email` | string | User email address |
| `displayName` | string | User display name |
| `password` | string? | Only used for creation/updates |
| `role` | UserRole | User's system role |
| `venueAccess` | VenueAccess[] | Venue permissions |
| `createdAt` | string? | Creation timestamp |
| `updatedAt` | string? | Last update timestamp |

#### User Roles
- `super_admin` - System administrator
- `venue_owner` - Venue owner
- `venue_manager` - Venue manager
- `staff` - Venue staff

#### Venue Access
```typescript
{
  venueId: string;  // FK → Venue
  role: UserRole;   // Role for this specific venue
}
```

## Relationships

### Primary Relationships

1. **Venue → Courts** (One-to-Many)
   - One venue contains multiple courts
   - Court.venueId references Venue.id

2. **Court → Bookings** (One-to-Many)
   - One court can have multiple bookings
   - Booking.courtId references Court.id

3. **Venue → Bookings** (One-to-Many)
   - One venue has multiple bookings across all courts
   - Booking.venueId references Venue.id

4. **User → Bookings** (One-to-Many)
   - One user can make multiple bookings
   - Booking.userId references User.uid

5. **User ↔ Venues** (Many-to-Many)
   - Users can have access to multiple venues
   - Implemented through User.venueAccess array

### Foreign Key References

| Collection | Field | References | Type |
|------------|-------|------------|------|
| bookings | venueId | venues.id | Many-to-One |
| bookings | courtId | courts.id | Many-to-One |
| bookings | userId | users.uid | Many-to-One |
| courts | venueId | venues.id | Many-to-One |
| users | venueAccess[].venueId | venues.id | Many-to-Many |

## Supporting Types

### Address Type
```typescript
{
  street: string;
  city: string;
  postalCode: string;
  country: string;
  state?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}
```

### Time Slot Type
```typescript
{
  startTime: string;  // "09:00"
  endTime: string;    // "10:00"
  price?: number;
  isAvailable: boolean;
  isBlocked?: boolean;
  isPeakHour?: boolean;
  courtId?: string;
}
```

### Calendar Event Type
```typescript
{
  summary: string;
  description: string;
  location: string;
  startTime: string;  // ISO format
  endTime: string;    // ISO format
  organizer: {
    name: string;
    email: string;
  };
}
```

## Database Access Patterns

All collections are accessed through typed Firestore services that provide reactive Observable streams:

- `BookingsDB`: FirestoreService<Booking>
- `CourtsDB`: FirestoreService<Court>
  - Special method: `getByVenue(venueId: string)`
- `VenuesDB`: FirestoreService<Venue>
- `UsersDB`: FirestoreService<IUserUpdate>

These services follow RxJS patterns for reactive data management throughout the application.

## Query Patterns

### Common Queries

1. **Get all courts for a venue**:
   ```typescript
   CourtsDB.getByVenue(venueId)
   ```

2. **Get bookings for a specific date and court**:
   ```typescript
   BookingsDB.list({
     where: [
       ['courtId', '==', courtId],
       ['date', '==', date],
       ['status', '!=', 'cancelled']
     ]
   })
   ```

3. **Get user's bookings**:
   ```typescript
   BookingsDB.list({
     where: [['userId', '==', userId]],
     orderBy: [['startTime', 'desc']]
   })
   ```

4. **Get venues with user access**:
   ```typescript
   // Filter venues based on user.venueAccess array
   ```

## Data Validation Rules

### Booking Validation
- Start time must be before end time
- Booking cannot overlap with existing confirmed bookings
- Price must be greater than 0
- Status transitions follow defined workflow

### Court Validation
- Must belong to an active venue
- Pricing rates must be positive numbers
- At least one sport type must be selected

### Venue Validation
- Operating hours must have valid time format
- Booking settings must have logical constraints
- Coordinates must be valid lat/lng values

### User Validation
- Email must be unique
- Must have at least one role
- Venue access must reference existing venues