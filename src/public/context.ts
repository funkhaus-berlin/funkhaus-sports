import { createContext } from '@mhmo91/schmancy'

export class AppConfiguration {
	hideLogo: boolean
	constructor() {
		this.hideLogo = false
	}
}
export const AppConfigurationContext = createContext<AppConfiguration>(
	new AppConfiguration(),
	'local',
	'app-configurations',
)
