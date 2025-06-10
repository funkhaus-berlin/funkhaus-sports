// netlify/functions/_shared/stripe.ts
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
	apiVersion: '2025-05-28.basil', // Use a specific API version for consistency
})

export default stripe
