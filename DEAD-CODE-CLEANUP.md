# Dead Code Cleanup - Funkhaus Sports Booking Flow

This document tracks dead code and redundancy issues found in the booking flow. Each item can be addressed individually.

## Status Legend
- 🔴 Not Started
- 🟡 In Progress
- 🟢 Completed

## Dead Code Issues

### 1. Unused Error Handling Methods 🟢
**File:** `src/public/book/context.ts` (lines 61-97)
**Issue:** BookingProgress class has 7 unused error handling methods
- `setError()`
- `clearError()`
- `setFieldError()`
- `clearFieldError()`
- `clearAllFieldErrors()`
- `hasFieldError()`
- `getFieldError()`
**Action:** Remove these methods entirely
**COMPLETED:** Removed all 7 unused error handling methods

### 2. Unused State Variables 🟢
**File:** `src/public/book/book.ts` (lines 32-33)
**Issue:** Unused state declarations
```typescript
@state() selectedCourt?: Court = undefined
@state() loadingCourts: boolean = false
```
**Action:** Remove these declarations
**COMPLETED:** Removed both unused state variables and updated template

### 3. Unused Variable Declaration ❌ FALSE POSITIVE
**File:** `src/public/book/book.ts` (line 100-101)
**Issue:** `hasCheckedContext` variable declared but never used
**Action:** Remove this variable
**UPDATE:** This variable IS actually used in lines 106 and 111 to prevent redirect loops

### 4. Empty Implementation Comment 🟢
**File:** `src/public/book/book.ts` (line 66)
**Issue:** Empty comment `// Initialize Stripe` with no implementation
**Action:** Remove comment or implement Stripe initialization if needed
**COMPLETED:** Removed empty comment

### 5. Unused Utility Methods ❌ FALSE POSITIVE
**File:** `src/public/book/booking-utils.ts`
**Issue:** Three methods never called anywhere
- `generateQRCodeDataUrl()` (lines 156-171)
- `generateQRFilename()` (lines 179-185)
- `shareBooking()` (lines 192-216)
**Action:** Remove these methods
**UPDATE:** These methods ARE used in booking-confirmation.ts

### 6. Non-functional Sort Method 🟢
**File:** `src/public/book/components/steps/court-select.ts` (lines 713-715)
**Issue:** `sortCourtsByAvailability()` doesn't actually sort
```typescript
private sortCourtsByAvailability(courts: Court[]): Court[] {
  return [...courts];
}
```
**Action:** Either implement proper sorting or remove the method
**COMPLETED:** Removed unused method

### 7. Unused Map Reference ❌ FALSE POSITIVE
**File:** `src/public/book/components/steps/court-select.ts` (line 224)
**Issue:** `courtRefs` Map created but never meaningfully used
**Action:** Remove the Map and related code
**UPDATE:** This Map IS used for animations and scroll functionality

### 8. Unused Scroll Methods ❌ FALSE POSITIVE
**File:** `src/public/book/components/steps/court-select.ts` (lines 1156-1218)
**Issue:** Scroll-related methods and refs that don't serve a purpose
**Action:** Remove these methods
**UPDATE:** These methods ARE used for scrolling to selected court and highlighting

### 9. Wrong Error Message Key 🟢
**File:** `src/public/book/form-validator.ts` (line 130)
**Issue:** Phone validation uses email error message key
```typescript
ErrorMessageKey.VALIDATION_INVALID_EMAIL, // Should be phone-specific
```
**Action:** Create and use proper phone validation error key
**COMPLETED:** Added `VALIDATION_INVALID_PHONE` key and updated form validator

### 10. Unused Method Result 🔴
**File:** `src/public/book/payment-status-handler.ts` (lines 134-157)
**Issue:** `updateBookingStatus()` updates context but result never used
**Action:** Review if the method is needed or can be simplified

### 11. Unused Interface ❌ FALSE POSITIVE
**File:** `src/types/booking/booking-flow.types.ts` (lines 27-33)
**Issue:** `CourtPreferences` interface defined but never used
**Action:** Remove the interface
**UPDATE:** This interface IS used in court-select.ts for filtering courts

### 12. Unused Optional Fields ❌ FALSE POSITIVE
**File:** `src/types/booking/booking.types.ts` (lines 64-68)
**Issue:** Optional fields never populated
- `invoiceNumber?: string`
- `invoiceGeneratedAt?: string`
- `notes?: string`
- `recurringBookingId?: string`
**Action:** Remove unused fields or implement their usage
**UPDATE:** These fields ARE used:
- `invoiceNumber` - Used in stripe webhook for generating invoice numbers
- `notes` - Used in booking-details UI
- `recurringBookingId` - May be for future feature

### 13. Debug Flag in Production 🟢
**File:** `src/availability-context.ts` (line 604)
**Issue:** Debug flag left in code
```typescript
const DEBUG = false // Set to true for detailed logging
```
**Action:** Remove debug flag and related logging
**COMPLETED:** Removed DEBUG flag and all associated console.log statements

### 14. Extra Template Syntax 🔴
**File:** `src/public/book/components/steps/payment-step.ts` (line 871)
**Issue:** Extra closing syntax in template
**Action:** Clean up template syntax

### 15. Commented Out Code 🔴
**File:** `src/public/book/components/booking-summery.ts`
**Issue:** Various commented out code sections
**Action:** Remove commented code

### 16. Empty/Unused Methods 🔴
**File:** `src/public/book/components/booking-summery.ts` (lines 50-52)
**Issue:** Empty methods that were likely placeholders
**Action:** Remove empty methods

## General Issues

### 17. Duplicate Type Exports 🔴
**Issue:** Types exported from multiple locations creating confusion
**Action:** Consolidate type exports to single source of truth

### 18. Console.log Statements 🔴
**Issue:** Development logging left in production code across multiple files
**Action:** Remove all console.log statements

### 19. Redundant Null Checks 🔴
**Issue:** Multiple redundant null/undefined checks for same values
**Action:** Simplify null checking logic

### 20. TODO Comments 🔴
**Issue:** Several TODO comments without implementation
**Action:** Either implement TODOs or remove them

## Priority Order

1. **High Priority** (Breaking/Misleading):
   - Wrong error message key (#9)
   - Non-functional sort method (#6)
   - Debug flags (#13)

2. **Medium Priority** (Unused Code):
   - Unused error handling methods (#1)
   - Unused state variables (#2)
   - Unused utility methods (#5)
   - Unused interfaces/types (#11, #12)

3. **Low Priority** (Cleanup):
   - Empty comments (#4)
   - Commented code (#15)
   - Console.logs (#18)
   - TODO comments (#20)

## How to Use This Document

1. Pick an issue marked with 🔴
2. Change status to 🟡 when starting work
3. Make the necessary changes
4. Test to ensure nothing breaks
5. Change status to 🟢 when completed
6. Commit changes with message referencing the issue number

Example commit message: "Remove unused error handling methods from booking context (#1)"