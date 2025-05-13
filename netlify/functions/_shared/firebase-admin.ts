import * as admin from 'firebase-admin'

/**
 * Get or initialize the Firebase Admin app instance
 * This ensures we only initialize the app once
 */
export const getFirebaseAdminApp = (): admin.app.App => {
  // Check if Firebase Admin is already initialized
  try {
    return admin.app()
  } catch (error) {
    // Initialize Firebase Admin with credentials
    if (
      !process.env.FIREBASE_PROJECT_ID ||
      !process.env.FIREBASE_PRIVATE_KEY ||
      !process.env.FIREBASE_CLIENT_EMAIL
    ) {
      throw new Error('Missing Firebase Admin credentials in environment variables')
    }

    // Replace escaped newlines with actual newlines in private key
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')

    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
    })
  }
}