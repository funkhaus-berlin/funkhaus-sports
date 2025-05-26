import admin from 'firebase-admin'

// Check if Firebase Admin is already initialized
let app: admin.app.App

try {
	// Try to get the default app
	app = admin.app()
	console.log('Firebase Admin already initialized')
} catch (error) {
	// App doesn't exist, initialize it
	console.log('Initializing Firebase Admin...')
	app = admin.initializeApp({
		credential: admin.credential.cert({
			projectId: process.env.FIREBASE_PROJECT_ID,
			clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
			privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
		}),
	})
	console.log('Firebase Admin initialized successfully')
}

const db = app.firestore()
const adminAuth = app.auth()
const adminStorage = app.storage()
const adminAppCheck = app.appCheck()
const adminMessaging = app.messaging()
// Don't initialize Realtime Database - this project uses Firestore
// const adminDatabase = app.database()
const adminInstanceId = app.instanceId()
const adminMachineLearning = app.machineLearning()
const adminRemoteConfig = app.remoteConfig()
const adminSecurityRules = app.securityRules()
const adminProjectManagement = app.projectManagement()
const adminInstallations = app.installations()

export {
	adminAppCheck,
	adminAuth,
	// adminDatabase,
	adminInstallations,
	adminInstanceId,
	adminMachineLearning,
	adminMessaging,
	adminProjectManagement,
	adminRemoteConfig,
	adminSecurityRules,
	adminStorage,
	db,
}

// Export admin as default for backward compatibility
export default admin
