import { FirestoreService } from "src/firebase/firestore.service";
import { IUserUpdate } from "src/user.context";

/**
 * Database service for user operations
 * Using IUserUpdate interface for better type safety with optional fields 
 */
export const UsersDB = new FirestoreService<IUserUpdate>('users');
