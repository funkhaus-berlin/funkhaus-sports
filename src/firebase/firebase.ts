// Import the functions you need from the SDKs you need
// import { getAnalytics } from 'firebase/analytics'
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
	apiKey: 'AIzaSyDswOyqjchaoF5I6h_utXUbucc9ZrrTlMQ',
	authDomain: 'funkhaus-sports.firebaseapp.com',
	projectId: 'funkhaus-sports',
	storageBucket: 'funkhaus-sports.firebasestorage.app',
	messagingSenderId: '875370726862',
	appId: '1:875370726862:web:7ce5237979f76c838f179f',
	measurementId: 'G-J2YFQLJJNQ',
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
// const analytics = getAnalytics(app)

export const firestore = getFirestore(app)

export const auth = getAuth(app)
