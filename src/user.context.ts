import { createContext } from '@mhmo91/schmancy';

export type UserRole = 'super_admin' | 'venue_owner' | 'venue_manager' | 'staff';

export interface VenueAccess {
  venueId: string;
  role: UserRole;
}

/**
 * Base user properties interface
 */
export interface IUserBase {
  email: string;
  displayName: string;
  uid: string;
  role: UserRole;
  venueAccess: VenueAccess[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * User interface with required password for new user creation
 */
export interface IUserCreate extends IUserBase {
  password: string;
}

/**
 * User interface with optional password for user updates
 */
export interface IUserUpdate extends IUserBase {
  password?: string;
}

/**
 * User class implementation
 */
export class User implements IUserUpdate {
  email: string = '';
  password?: string = '';
  displayName: string = '';
  uid: string = '';
  role: UserRole = 'staff';
  venueAccess: VenueAccess[] = [];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * User context for application-wide state
 */
export const userContext = createContext<User>(new User(), 'local', 'user');