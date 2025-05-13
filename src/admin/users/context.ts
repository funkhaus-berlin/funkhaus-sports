import { BehaviorSubject } from 'rxjs'

type UsersFilter = {
	search: string | undefined
}

export const $usersFilter = new BehaviorSubject<UsersFilter>(
	localStorage.getItem('usersFilter')
		? JSON.parse(localStorage.getItem('usersFilter')!)
		: {
				search: '',
		  },
)
