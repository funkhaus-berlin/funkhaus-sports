import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Your web app's Firebase configuration
const firebaseConfig = {
	apiKey: 'AIzaSyDswOyqjchaoF5I6h_utXUbucc9ZrrTlMQ',
	authDomain: 'funkhaus-sports.firebaseapp.com',
	projectId: 'funkhaus-sports',
	storageBucket: 'funkhaus-sports.firebasestorage.app',
	messagingSenderId: '875370726862',
	appId: '1:875370726862:web:7ce5237979f76c838f179f',
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

export const db = getFirestore(app)
export const auth = getAuth(app)

// Set authentication settings
auth.useDeviceLanguage()

// Configure the action code settings for password reset
export const actionCodeSettings = {
  // URL you want to redirect back to. The domain (www.example.com) for this
  // URL must be in the authorized domains list in the Firebase Console.
  url: 'https://funkhaus-sports.web.app/reset-password',
  // This must be true.
  handleCodeInApp: false
}