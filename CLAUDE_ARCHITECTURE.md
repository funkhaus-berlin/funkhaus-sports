# Instructions for Claude on Project Architecture

Claude, this document provides instructions on how to understand and maintain the Funkhaus Sports project architecture. Follow these guidelines when analyzing or modifying code to ensure you maintain the established patterns and principles.

## Core Architecture Principles

Always preserve these architecture principles when working with the codebase:

1. **Component-Based Architecture**: Each component should be fully encapsulated with its own logic and state management.

2. **Reactive Programming**: All asynchronous operations should use RxJS with proper subscription management.

3. **Unidirectional Data Flow**: State changes should follow a clear, predictable path.

4. **Type Safety**: Maintain strong typing throughout the application.

5. **Single Render Pattern**: Components should have one render method containing all UI.

## Understanding Component Structure

When analyzing components, recognize this standard organization:

```typescript
@customElement('component-name')
export class ComponentName extends $LitElement() {
  // 1. Properties and state
  @property() externalProp = '';
  @state() internalState = '';
  @select(someContext) contextData!: ContextType;

  // 2. Lifecycle methods
  connectedCallback() { /* ... */ }
  disconnectedCallback() { /* ... */ }

  // 3. Helper methods
  private helperMethod() { /* ... */ }

  // 4. Event handlers
  private handleEvent() { /* ... */ }

  // 5. Render method
  render() { /* single render function with all UI */ }
}
```

## RxJS Patterns to Maintain

When working with RxJS, preserve these patterns:

1. **Subscription Management**: Always use `takeUntil(this.disconnecting)` for component subscriptions.

2. **Pipe Operations**: Chain operations with pipe() for clear data transformation flows.

3. **Error Handling**: Include catchError operators and handle errors appropriately.

4. **Combining Streams**: Use combineLatest or merge when working with multiple data sources.

5. **Side Effects**: Use tap for side effects without modifying the stream.

## Context System Usage

The application uses Schmancy's context system for state management:

```typescript
// Context creation
export const userContext = createContext<User>(
  new User(),  // Default value
  'local',     // Storage type (local, session, none)
  'user'       // Storage key
);

// Context selection in components
@select(userContext) user!: User;

// Context updates
userContext.set(newUser);                    // Complete replacement
userContext.set({ name: 'New Name' }, true); // Partial update
```

When working with contexts:
- Use the appropriate storage type (local, session, none)
- Subscribe to context changes with the $ observable
- Ensure partial updates are handled correctly
- Verify types match between context definitions and usage

## Schmancy UI Components

The UI is built with Schmancy components. Key patterns include:

1. **Layout Components**:
   ```html
   <schmancy-grid justify="center" align="center" gap="md">
     <schmancy-typography type="headline">Content</schmancy-typography>
   </schmancy-grid>
   ```

2. **Dialog Management**:
   ```typescript
   sheet.open({
     component: detailsSheet,
     fullScreenOnMobile: true
   });
   ```

3. **Inline Event Handlers**:
   ```html
   <schmancy-button @click=${() => this.handleClick()}>Click</schmancy-button>
   ```

4. **Conditional Rendering**:
   ```html
   ${when(this.condition, 
     () => html`<div>Shown when true</div>`, 
     () => html`<div>Shown when false</div>`
   )}
   ```

## Firebase Integration Patterns

When working with Firebase:

1. **Collection Services**: Use the typed collection services for database operations.

2. **Reactive Queries**: Return observables from collection methods.

3. **Transaction Usage**: Use transactions for operations that require atomicity.

4. **Authentication**: Access user state through the userContext.

## Tailwind CSS Patterns

When working with styles:

1. **Utility Classes**: Use Tailwind utility classes directly in templates.
   ```html
   <div class="flex flex-col p-4 bg-white rounded-lg shadow">
   ```

2. **Responsive Design**: Use responsive breakpoints.
   ```html
   <div class="w-full md:w-1/2 lg:w-1/3">
   ```

3. **Dynamic Classes**: Conditionally apply classes.
   ```html
   <div class="${this.isActive ? 'bg-primary-500' : 'bg-gray-300'}">
   ```

## Error Handling

Error handling follows a centralized pattern:

```typescript
// Setting errors
BookingErrorService.setError({
  message: 'Error message',
  category: ErrorCategory.SYSTEM,
  code: 'error-code',
  timestamp: Date.now()
});

// Displaying errors
<booking-error-display
  .error=${currentError}
  @dismiss=${() => clearError()}
></booking-error-display>
```

## Keeping Documentation Updated

When you modify code that impacts the architecture:

1. **Component Changes**: Update ARCHITECTURE.md if you modify component patterns.
2. **State Management**: Document any changes to context usage or state flow.
3. **RxJS Patterns**: Note any new or modified reactive patterns.
4. **UI Components**: Update documentation for new UI component usage.

When analyzing new code, look for:
- Adherence to the established patterns
- Proper subscription management
- Correct context usage
- Appropriate error handling
- Consistent style and structure

These guidelines should help you maintain consistency with the project's architecture when working with the codebase.