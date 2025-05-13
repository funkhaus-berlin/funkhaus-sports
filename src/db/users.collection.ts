import { IUserUpdate, User } from 'src/user.context'
import { FirestoreService } from '../firebase/firestore.service'

/**
 * Database service for user operations
 * Using IUserUpdate because we need optional password field in database operations
 */
export const UsersDB = new FirestoreService<IUserUpdate>('users')
