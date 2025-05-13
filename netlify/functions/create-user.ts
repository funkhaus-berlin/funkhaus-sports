import { Context } from '@netlify/functions'
import admin from 'firebase-admin'
import { corsHeaders } from './_shared/cors';
import { db } from './_shared/db-service';

// Initialize Firestore

export default async (_request: Request, _context: Context) => {
	if (_request.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders })
	}

	if (_request.method !== 'POST') {
		return new Response('Method Not Allowed', {
			status: 405,
			headers: corsHeaders,
		})
	}

	// Extract token from request headers
	const token =
		_request.headers.get('authorization') && (_request.headers.get('authorization') as string).split('Bearer ')[1]

	if (!token) {
		return new Response(JSON.stringify({ message: 'No token provided.' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json', ...corsHeaders },
		})
	}

	try {
		// Verify Firebase token
		const decodedToken = await admin.auth().verifyIdToken(token)
		console.log('decodedToken', decodedToken)

		// Parse the request body for email, password, displayName, and admin claim
		const body = await _request.json()
		const { email, password, displayName, admin: isAdmin, uid } = body

		if (!uid && (!email || !password || typeof isAdmin !== 'boolean' || !displayName)) {
			return new Response(
				JSON.stringify({
					message: 'Missing email, password, displayName, or admin claim',
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json', ...corsHeaders },
				},
			)
		}

		// check if user already exists
		const userRecord = await admin
			.auth()
			.getUserByEmail(email)
			.catch(() => null)

		console.log('userRecord', userRecord)
		// Create a new user
		const user = !userRecord
			? await admin
					.auth()
					.createUser({
						email: email,
						emailVerified: true,
						password: password,
						displayName: displayName,
						disabled: false,
						...(userRecord ? userRecord : {}),
					})
					.catch(error => {
						console.log('1 Error creating new user:', error)
						throw new Error('User creation failed')
					})
			: await admin
					.auth()
					.updateUser(
						userRecord.uid,
						Object.assign(
							{
								email: email,
								emailVerified: true,
								displayName: displayName,
								disabled: false,
								password: password,
							},
							password ? { password: password } : {},
							userRecord ? userRecord : {},
						),
					)
					.catch(error => {
						console.log('2 Error creating new user:', error)
						throw new Error('User creation failed')
					})

		if (!user) throw new Error('User not created')

		// Set custom user claims based on admin claim
		await admin.auth().setCustomUserClaims(user.uid, { admin: isAdmin })

		// Save user details to Firestore
		await db
			.collection('users')
			.doc(user.uid)
			.set(
				Object.assign(
					{
						...body,
					},
					uid
						? { updatedAt: admin.firestore.FieldValue.serverTimestamp() }
						: {
								createdAt: admin.firestore.FieldValue.serverTimestamp(),
						  },
				),
				{
					merge: true,
				},
			)

		return new Response(JSON.stringify({ message: 'User created successfully' }), {
			status: 200,
			headers: { 'Content-Type': 'application/json', ...corsHeaders },
		})
	} catch (error) {
		console.log(error)
		return new Response(JSON.stringify({ message: 'Error creating user' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json', ...corsHeaders },
		})
	}
}
