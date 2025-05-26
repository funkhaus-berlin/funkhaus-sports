import { Context } from '@netlify/functions'
import { corsHeaders } from './_shared/cors';
import { adminAuth, db } from './_shared/firebase-admin';
import dayjs from 'dayjs';
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

  // Extract Firebase token from headers 
  // const authHeader = _request.headers.get('authorization') || _request.headers.get('Authorization')
  // if (!authHeader || !authHeader.startsWith('Bearer ')) {
  //   return new Response(
  //     JSON.stringify({ message: 'Missing or invalid Authorization header' }),
  //     {
  //       status: 401,
  //       headers: { 'Content-Type': 'application/json', ...corsHeaders },
  //     },
  //   )
  // }
  // const token = authHeader.replace('Bearer ', '').trim()
	try {
		// Verify Firebase token
		// let decodedToken;
		try {
			// decodedToken = await admin.auth().verifyIdToken(token)
			// console.log('decodedToken', decodedToken)
		} catch (verifyError) {
			console.error('Token verification error:', verifyError)
			// Log more details about the error
			if (verifyError instanceof Error) {
				console.error('Error message:', verifyError.message)
				console.error('Error stack:', verifyError.stack)
			}
			return new Response(
				JSON.stringify({ 
					message: 'Firebase ID token verification failed',
					error: verifyError instanceof Error ? verifyError.message : 'Unknown error'
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json', ...corsHeaders },
				},
			)
		}

		// Parse the request body for user details
		const body = await _request.json()
		console.log('Request body:', JSON.stringify(body, null, 2))
		const { email, password, displayName, admin: isAdmin, uid, role, venueAccess } = body

		// Validate required fields
		if (!uid && (!email || !password || !displayName)) {
			return new Response(
				JSON.stringify({
					message: 'Missing required fields: email, password, or displayName',
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json', ...corsHeaders },
				},
			)
		}

		// Validate role if provided
		const validRoles = ['super_admin', 'venue_owner', 'venue_manager', 'staff']
		if (role && !validRoles.includes(role)) {
			return new Response(
				JSON.stringify({
					message: 'Invalid role. Must be one of: super_admin, venue_owner, venue_manager, staff',
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json', ...corsHeaders },
				},
			)
		}

		// Validate venueAccess if provided
		if (venueAccess && Array.isArray(venueAccess)) {
			for (const access of venueAccess) {
				if (!access.venueId || !access.role || !validRoles.includes(access.role)) {
					return new Response(
						JSON.stringify({
							message: 'Invalid venue access format. Each entry must have venueId and valid role',
						}),
						{
							status: 400,
							headers: { 'Content-Type': 'application/json', ...corsHeaders },
						},
					)
				}
			}
		}

		// check if user already exists
		console.log('Checking if user exists with email:', email)
		const userRecord = await adminAuth
			.getUserByEmail(email)
			.catch((error) => {
				console.log('User lookup error (expected if new user):', error.code, error.message)
				return null
			})

		console.log('userRecord found:', userRecord ? 'Yes' : 'No', userRecord?.uid)
		// Create a new user
		let user;
		if (!userRecord) {
			console.log('Creating new user with email:', email)
			try {
				user = await adminAuth.createUser({
					email: email,
					emailVerified: true,
					password: password,
					displayName: displayName,
					disabled: false,
				})
				console.log('User created successfully:', user.uid)
			} catch (error) {
				console.error('Error creating new user:', error)
				if (error instanceof Error) {
					console.error('Error code:', (error as any).code)
					console.error('Error message:', error.message)
					console.error('Full error:', JSON.stringify(error, null, 2))
				}
				throw new Error('User creation failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
			}
		} else {
			console.log('Updating existing user:', userRecord.uid)
			try {
				const updateData: any = {
					email: email,
					emailVerified: true,
					displayName: displayName,
					disabled: false,
				}
				if (password) {
					updateData.password = password
				}
				console.log('Update data:', JSON.stringify(updateData, null, 2))
				
				user = await adminAuth.updateUser(userRecord.uid, updateData)
				console.log('User updated successfully:', user.uid)
			} catch (error) {
				console.error('Error updating user:', error)
				if (error instanceof Error) {
					console.error('Error code:', (error as any).code)
					console.error('Error message:', error.message)
					console.error('Full error:', JSON.stringify(error, null, 2))
				}
				throw new Error('User update failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
			}
		}

		if (!user) throw new Error('User not created')

		// Set custom user claims
		// For backward compatibility, set admin: true for super_admin role
		const claims: any = {}
		
		// Set admin claim based on role or explicit admin value
		if (role === 'super_admin' || isAdmin === true) {
			claims.admin = true
		} else if (typeof isAdmin === 'boolean') {
			claims.admin = isAdmin
		} else {
			claims.admin = false
		}
		
		// Add role to claims if provided
		if (role) {
			claims.role = role
		}
		
		console.log('Setting custom claims:', claims)
		try {
			await adminAuth.setCustomUserClaims(user.uid, claims)
			console.log('Custom claims set successfully')
		} catch (error) {
			console.error('Error setting custom claims:', error)
			throw new Error('Failed to set custom claims: ' + (error instanceof Error ? error.message : 'Unknown error'))
		}

		// Prepare user data for Firestore
		const userData: any = {
			email: body.email,
			displayName: body.displayName,
			uid: user.uid,
			admin: claims.admin,
		}
		
		// Add role if provided
		if (role) {
			userData.role = role
		}
		
		// Add venueAccess if provided
		if (venueAccess && Array.isArray(venueAccess)) {
			userData.venueAccess = venueAccess
		}
		
		// Include password in update only if provided (for updates)
		if (password) {
			userData.password = password
		}
		
		// Add timestamps
		if (uid) {
			userData.updatedAt = dayjs().toISOString()
		} else {
			userData.createdAt = dayjs().toISOString()
		}
		
		// Save user details to Firestore
		console.log('Saving user data to Firestore:', JSON.stringify(userData, null, 2))
		try {
			await db
				.collection('users')
				.doc(user.uid)
				.set(userData, { merge: true })
			console.log('User data saved to Firestore successfully')
		} catch (error) {
			console.error('Error saving to Firestore:', error)
			if (error instanceof Error) {
				console.error('Firestore error message:', error.message)
				console.error('Firestore error stack:', error.stack)
			}
			throw new Error('Failed to save user data to Firestore: ' + (error instanceof Error ? error.message : 'Unknown error'))
		}

		return new Response(JSON.stringify({ 
			message: uid ? 'User updated successfully' : 'User created successfully',
			uid: user.uid,
			email: user.email,
			success: true
		}), {
			status: 200,
			headers: { 'Content-Type': 'application/json', ...corsHeaders },
		})
	} catch (error) {
		console.error('Error in create-user function:', error)
		const errorMessage = error instanceof Error ? error.message : 'Error creating user'
		return new Response(JSON.stringify({ 
			message: errorMessage,
			success: false 
		}), {
			status: 500,
			headers: { 'Content-Type': 'application/json', ...corsHeaders },
		})
	}
}
