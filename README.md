# Funkhaus Sports - Sports Facility Booking Platform

A modern, full-featured sports facility booking platform built with Web Components, Firebase, and Stripe.

## 🚀 Features

- **Multi-Venue Support** - Manage multiple sports facilities from a single platform
- **Flexible Booking System** - Customizable booking flows per venue
- **Real-time Availability** - Live court availability updates
- **Secure Payments** - Integrated Stripe payment processing
- **QR Code Check-in** - Scan-to-check-in functionality for staff
- **Email Confirmations** - Automated booking confirmations with PDF invoices
- **Admin Dashboard** - Comprehensive venue and booking management
- **Wallet Passes** - Apple/Google wallet integration (ready for activation)
- **Responsive Design** - Mobile-first, works on all devices

## 🛠 Tech Stack

- **Frontend**: Lit 3.3 (Web Components), Schmancy UI, RxJS, Tailwind CSS
- **Backend**: Netlify Functions (Serverless), Firebase (Auth, Firestore, Storage)
- **Payments**: Stripe
- **Email**: Resend
- **Build**: Vite, TypeScript

## 📋 Prerequisites

- Node.js 18+
- npm 8+
- Firebase CLI (`npm install -g firebase-tools`)
- Stripe CLI (for local development)
- Netlify CLI (`npm install -g netlify-cli`)

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone [repository-url]
   cd funkhaus-sports
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your Firebase, Stripe, and Resend credentials
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Start with Firebase emulators** (recommended)
   ```bash
   npm run dev:emulators
   ```

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run emulators` - Start Firebase emulators
- `npm run dev:emulators` - Development server with emulators
- `npm run lint` - Run linting
- `npm run typecheck` - TypeScript type checking

### Stripe Integration

The Stripe integration (`src/public/stripe.ts`) is configured with automatic environment detection:

#### Configuration
```typescript
// Automatically switches between test and live keys
export const PUBLISHABLE_KEY = import.meta.env.DEV
    ? 'pk_test_...' // Test key for development
    : 'pk_live_...' // Live key for production

// Initialize with automatic locale detection
export const stripePromise = loadStripe(PUBLISHABLE_KEY, { locale: 'auto' })
```

#### Key Features
- **Environment-aware**: Automatically uses test keys in development, live keys in production
- **Reactive streams**: Uses RxJS for handling asynchronous payment operations
- **Theme integration**: Stripe Elements automatically match the app's Schmancy design system
- **Error handling**: Comprehensive error handling for payment failures
- **Dynamic styling**: Reads CSS variables at runtime for consistent theming

#### Payment Flow
1. Frontend calls `createPaymentIntent()` with booking details
2. Backend creates PaymentIntent via Stripe API
3. Frontend uses client secret to render Stripe Elements
4. Customer enters payment details in secure iframe
5. Payment confirmation handled via `stripe.confirmPayment()`
6. Webhook confirms final payment status

### Stripe Webhook Testing

To test Stripe webhooks locally:

```bash
# In terminal 1: Start the development server
npm run dev

# In terminal 2: Forward Stripe webhooks
stripe listen --forward-to http://localhost:8888/api/stripe-webhook
```

### Firebase Emulators

The project includes Firebase emulator configuration for local development:
- Firestore: http://localhost:8080
- Auth: http://localhost:9099
- Storage: http://localhost:9199

## 📁 Project Structure

```
funkhaus-sports/
├── src/
│   ├── admin/         # Admin dashboard components
│   ├── public/        # User-facing booking components
│   ├── firebase/      # Firebase configuration
│   ├── db/           # Database collection interfaces
│   ├── types/        # TypeScript type definitions
│   └── scanner/      # QR code scanner functionality
├── netlify/
│   └── functions/    # Serverless backend functions
├── public/           # Static assets
└── docs/            # Documentation
```

## 🔐 Environment Variables

Create a `.env` file with the following variables:

```env
# Firebase
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id

# Stripe
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-webhook-secret

# Resend
RESEND_API_KEY=your-resend-api-key

# Firebase Admin (for Netlify Functions)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY=your-service-account-private-key
```

## 📱 User Roles

- **Guest/Customer**: Book courts, make payments
- **Staff**: Check-in users via QR scanner
- **Venue Manager**: Manage specific venues
- **Venue Owner**: Full venue control, analytics
- **Super Admin**: System-wide administration

## 🚀 Deployment

### Frontend (Firebase Hosting)
```bash
npm run build
firebase deploy --only hosting
```

### Backend (Netlify Functions)
Functions are automatically deployed via Netlify's Git integration.

## 📖 Documentation

- [End-to-End Documentation](./FUNKHAUS_E2E_DOCUMENTATION.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Booking Module Guide](./BOOKING_MODULE.md)
- [Claude Instructions](./CLAUDE.md)
- [Firebase Auth Email Templates](./README-auth-email.md)

## 🔧 Troubleshooting

### Common Issues

1. **Netlify CLI Issues**
   ```bash
   # Remove Netlify CLI configs
   rm -rf ~/.netlify ~/.config/netlify .netlify
   
   # Reinstall CLI
   npm uninstall -g netlify-cli
   npm install -g netlify-cli
   ```

2. **Update Packages**
   ```bash
   npm update
   ```

3. **Firebase Emulator Issues**
   - Ensure Java is installed for Firestore emulator
   - Check ports 8080, 9099, 9199 are available

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is proprietary software. All rights reserved.

## 🆘 Support

For support, email support@funkhaus-sports.com or open an issue in the repository.
