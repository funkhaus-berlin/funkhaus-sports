# Sequential Booking Flow Test Plan

## Test Scenarios

### 1. Initial State
- **Expected**: Only the first step (Date) should be visible
- **Test**: Open the booking page and verify that only the Date step is shown and expanded

### 2. Date Selection
- **Expected**: After selecting a date, the Court step should become visible
- **Test**: Select a date and verify that Court step appears and becomes active while Date step remains visible in compact form

### 3. Court Selection
- **Expected**: After selecting a court, the Time step should become visible 
- **Test**: Select a court and verify that Time step appears and becomes active while Date and Court steps remain visible in compact form

### 4. Time Selection
- **Expected**: After selecting a time, the Duration step should become visible
- **Test**: Select a time and verify that Duration step appears and becomes active while previous steps remain visible in compact form

### 5. Duration Selection
- **Expected**: After selecting a duration, the Payment step should become visible
- **Test**: Select a duration and verify that Payment step appears and becomes active while previous steps remain visible in compact form

### 6. Navigation Backward
- **Expected**: Clicking on a previous step should make it active but not collapse any expanded steps
- **Test**: After reaching the Payment step, click on the Court step and verify all steps remain visible but Court becomes the active step

### 7. Change in Selection
- **Expected**: If a selection in a previous step changes and invalidates later steps, the invalid selections should be cleared
- **Test**: 
  1. Complete the flow to Payment step
  2. Click back to Date and select a different date
  3. Verify that any invalid court/time/duration selections are cleared

### 8. URL Navigation
- **Expected**: If a user navigates to a specific step via URL, all previous steps should be expanded
- **Test**: Use URL with ?step=4 parameter and verify that steps 1-4 are all visible with step 4 being active

## Regression Testing

### 1. Availability Checks
- **Expected**: Court availabilities should still be properly calculated based on date/time
- **Test**: Verify that unavailable courts are properly marked as disabled

### 2. Time Selection
- **Expected**: Time selection should still be properly constrained by court availability
- **Test**: Verify that unavailable time slots are properly disabled

### 3. Flow Ordering
- **Expected**: Different venues with different booking flow orders should still work properly
- **Test**: Test with venues configured for different flow orders

## Edge Cases

### 1. Error Handling
- **Expected**: If an error occurs during a step, the UI should not break
- **Test**: Simulate network errors during court/time loading and verify proper error handling

### 2. Page Refresh
- **Expected**: The booking state should be properly restored after page refresh
- **Test**: Complete a few steps, refresh the page, and verify the state is restored correctly