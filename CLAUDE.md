# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Development Commands
- `npm run dev`: Start development server with hot reloading
- `npm run build`: Build production-ready assets
- `npm run preview`: Preview production build locally
- `npm run emulators`: Start Firebase emulators
- `npm run dev:emulators`: Run development server with Firebase emulators

## Code Style Guidelines
- **TypeScript**: Use strict typing with noUnusedLocals and noUnusedParameters enabled
- **Lit Components**: Use decorators (@customElement, @property, @state, @query)
- **Formatting**: Tabs (width 2), single quotes, no semicolons, 120 char line length
- **Naming**: PascalCase for classes/components, camelCase for methods/properties
- **Imports**: Group by external libraries first, then internal modules
- **RxJS**: Use for reactive patterns, pipe operators for transformations
- **Error Handling**: Use BookingErrorService with appropriate ErrorCategory
- **Components**: Organize methods by lifecycle, setup, navigation, event handlers
- **CSS**: Use Tailwind utility classes in templates

## Project Structure
- `/src/admin`: Admin dashboard components
- `/src/public`: User-facing components and booking flow
- `/src/firebase`: Firebase configuration and services
- `/src/db`: Database collection interfaces
- `/netlify/functions`: Serverless backend functions