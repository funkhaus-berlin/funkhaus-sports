import { User } from 'src/user.context'
import { FirestoreService } from '../firebase/firestore.service'

export const UsersDB = new FirestoreService<User>('users')
