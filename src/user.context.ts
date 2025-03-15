import { createContext } from '@mhmo91/schmancy'

export class User {
	email: string | null
	name: string
	emailVerified: boolean
	organizationID?: string | null
	apps: Record<string, { roles: string[] }> = {}
	id: string
	photoURL?: string | null
	onboarded?: boolean

	createdAt?: any
	updatedAt?: any
	constructor() {
		this.name = ''
		this.email = ''
		this.id = ''
		this.organizationID = null
		this.photoURL = null
		this.onboarded = false
		this.emailVerified = false
	}
}

export const userContext = createContext<User>(new User(), 'local', 'user')
