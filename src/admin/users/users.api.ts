import { IUserCreate, IUserUpdate, User } from "src/user.context"
import { auth } from 'src/firebase/firebase'

/**
 * Response interface for user API operations
 */
export interface UserApiResponse {
  uid: string;
  email: string;
  success: boolean;
  message?: string;
}

/**
 * API error interface
 */
export interface UserApiError {
  code: string;
  message: string;
}

/**
 * Upsert (create or update) a user
 * @param body User data for creation or update
 * @returns Promise with user API response
 */
export default async function upsertUser(body: User | IUserCreate | IUserUpdate): Promise<UserApiResponse> {
  // Get the current user's ID token
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User not authenticated');
  }
  
  let token: string;
  try {
    token = await currentUser.getIdToken();
  } catch (error) {
    throw new Error('Failed to get authentication token');
  }
  
  const response = await fetch(
    ((import.meta.env.DEV ? import.meta.env.VITE_BASE_URL : '/')) +
    `api/create-user`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to create user' }));
    throw new Error(errorData.message || 'Failed to create user');
  }

  return response.json();
}

