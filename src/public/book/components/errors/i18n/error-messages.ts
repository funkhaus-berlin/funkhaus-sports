// src/public/book/i18n/error-messages.ts

// Define all error message keys
export enum ErrorMessageKey {
	// System errors
	SYSTEM_GENERAL = 'system.general',
	SYSTEM_TIMEOUT = 'system.timeout',
	SYSTEM_UNAVAILABLE = 'system.unavailable',

	// Payment errors
	PAYMENT_DECLINED = 'payment.declined',
	PAYMENT_INVALID_CARD = 'payment.invalid_card',
	PAYMENT_EXPIRED_CARD = 'payment.expired_card',
	PAYMENT_PROCESSING_ERROR = 'payment.processing_error',

	// Validation errors
	VALIDATION_REQUIRED_FIELDS = 'validation.required_fields',
	VALIDATION_INVALID_EMAIL = 'validation.invalid_email',
	VALIDATION_INVALID_DATE = 'validation.invalid_date',
	VALIDATION_INVALID_TIME = 'validation.invalid_time',

	// Network errors
	NETWORK_CONNECTION = 'network.connection',
	NETWORK_TIMEOUT = 'network.timeout',

	// Availability errors
	AVAILABILITY_COURT_TAKEN = 'availability.court_taken',
	AVAILABILITY_NO_COURTS = 'availability.no_courts',
	AVAILABILITY_TIMESLOT_UNAVAILABLE = 'availability.timeslot_unavailable',

	// Recovery suggestions
	RECOVERY_TRY_AGAIN = 'recovery.try_again',
	RECOVERY_CHECK_CONNECTION = 'recovery.check_connection',
	RECOVERY_DIFFERENT_PAYMENT = 'recovery.different_payment',
	RECOVERY_DIFFERENT_TIME = 'recovery.different_time',
	RECOVERY_DIFFERENT_DATE = 'recovery.different_date',
	RECOVERY_CHECK_INPUTS = 'recovery.check_inputs',
}

// Translation interface
export interface ErrorTranslations {
	[key: string]: string
}

// Default English translations
export const defaultErrorMessages: ErrorTranslations = {
	// System errors
	[ErrorMessageKey.SYSTEM_GENERAL]: 'Something went wrong. Please try again.',
	[ErrorMessageKey.SYSTEM_TIMEOUT]: 'The operation timed out. Please try again.',
	[ErrorMessageKey.SYSTEM_UNAVAILABLE]: 'The service is currently unavailable. Please try again later.',

	// Payment errors
	[ErrorMessageKey.PAYMENT_DECLINED]: 'Your payment was declined. Please try a different payment method.',
	[ErrorMessageKey.PAYMENT_INVALID_CARD]: 'The card information you provided is invalid.',
	[ErrorMessageKey.PAYMENT_EXPIRED_CARD]: 'The card you provided has expired.',
	[ErrorMessageKey.PAYMENT_PROCESSING_ERROR]: 'There was an error processing your payment.',

	// Validation errors
	[ErrorMessageKey.VALIDATION_REQUIRED_FIELDS]: 'Please fill in all required fields.',
	[ErrorMessageKey.VALIDATION_INVALID_EMAIL]: 'Please enter a valid email address.',
	[ErrorMessageKey.VALIDATION_INVALID_DATE]: 'Please select a valid date.',
	[ErrorMessageKey.VALIDATION_INVALID_TIME]: 'Please select a valid time.',

	// Network errors
	[ErrorMessageKey.NETWORK_CONNECTION]: 'Network connection error. Please check your internet connection.',
	[ErrorMessageKey.NETWORK_TIMEOUT]: 'The request timed out. Please check your connection and try again.',

	// Availability errors
	[ErrorMessageKey.AVAILABILITY_COURT_TAKEN]: 'This court has already been booked for the selected time.',
	[ErrorMessageKey.AVAILABILITY_NO_COURTS]: 'No courts are available for the selected time.',
	[ErrorMessageKey.AVAILABILITY_TIMESLOT_UNAVAILABLE]: 'The selected time slot is no longer available.',

	// Recovery suggestions
	[ErrorMessageKey.RECOVERY_TRY_AGAIN]: 'Please try again.',
	[ErrorMessageKey.RECOVERY_CHECK_CONNECTION]: 'Please check your internet connection and try again.',
	[ErrorMessageKey.RECOVERY_DIFFERENT_PAYMENT]: 'Please try using a different payment method.',
	[ErrorMessageKey.RECOVERY_DIFFERENT_TIME]: 'Please try selecting a different time.',
	[ErrorMessageKey.RECOVERY_DIFFERENT_DATE]: 'Please try selecting a different date.',
	[ErrorMessageKey.RECOVERY_CHECK_INPUTS]: 'Please check your inputs and try again.',
}

// German translations
export const deErrorMessages: ErrorTranslations = {
	// System errors
	[ErrorMessageKey.SYSTEM_GENERAL]: 'Etwas ist schief gelaufen. Bitte versuchen Sie es erneut.',
	[ErrorMessageKey.SYSTEM_TIMEOUT]:
		'Die Operation wurde wegen Zeitüberschreitung abgebrochen. Bitte versuchen Sie es erneut.',
	[ErrorMessageKey.SYSTEM_UNAVAILABLE]: 'Der Dienst ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.',

	// Payment errors
	[ErrorMessageKey.PAYMENT_DECLINED]: 'Ihre Zahlung wurde abgelehnt. Bitte versuchen Sie eine andere Zahlungsmethode.',
	[ErrorMessageKey.PAYMENT_INVALID_CARD]: 'Die von Ihnen angegebenen Karteninformationen sind ungültig.',
	[ErrorMessageKey.PAYMENT_EXPIRED_CARD]: 'Die von Ihnen angegebene Karte ist abgelaufen.',
	[ErrorMessageKey.PAYMENT_PROCESSING_ERROR]: 'Bei der Verarbeitung Ihrer Zahlung ist ein Fehler aufgetreten.',

	// Validation errors
	[ErrorMessageKey.VALIDATION_REQUIRED_FIELDS]: 'Bitte füllen Sie alle erforderlichen Felder aus.',
	[ErrorMessageKey.VALIDATION_INVALID_EMAIL]: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
	[ErrorMessageKey.VALIDATION_INVALID_DATE]: 'Bitte wählen Sie ein gültiges Datum.',
	[ErrorMessageKey.VALIDATION_INVALID_TIME]: 'Bitte wählen Sie eine gültige Zeit.',

	// Network errors
	[ErrorMessageKey.NETWORK_CONNECTION]: 'Netzwerkverbindungsfehler. Bitte überprüfen Sie Ihre Internetverbindung.',
	[ErrorMessageKey.NETWORK_TIMEOUT]:
		'Die Anfrage hat das Zeitlimit überschritten. Bitte überprüfen Sie Ihre Verbindung und versuchen Sie es erneut.',

	// Availability errors
	[ErrorMessageKey.AVAILABILITY_COURT_TAKEN]: 'Dieser Platz wurde bereits für die ausgewählte Zeit gebucht.',
	[ErrorMessageKey.AVAILABILITY_NO_COURTS]: 'Für die ausgewählte Zeit sind keine Plätze verfügbar.',
	[ErrorMessageKey.AVAILABILITY_TIMESLOT_UNAVAILABLE]: 'Der ausgewählte Zeitslot ist nicht mehr verfügbar.',

	// Recovery suggestions
	[ErrorMessageKey.RECOVERY_TRY_AGAIN]: 'Bitte versuchen Sie es erneut.',
	[ErrorMessageKey.RECOVERY_CHECK_CONNECTION]:
		'Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
	[ErrorMessageKey.RECOVERY_DIFFERENT_PAYMENT]: 'Bitte versuchen Sie eine andere Zahlungsmethode.',
	[ErrorMessageKey.RECOVERY_DIFFERENT_TIME]: 'Bitte versuchen Sie, eine andere Zeit zu wählen.',
	[ErrorMessageKey.RECOVERY_DIFFERENT_DATE]: 'Bitte versuchen Sie, ein anderes Datum zu wählen.',
	[ErrorMessageKey.RECOVERY_CHECK_INPUTS]: 'Bitte überprüfen Sie Ihre Eingaben und versuchen Sie es erneut.',
}

// Spanish translations
export const esErrorMessages: ErrorTranslations = {
	// System errors
	[ErrorMessageKey.SYSTEM_GENERAL]: 'Algo salió mal. Por favor, inténtelo de nuevo.',
	[ErrorMessageKey.SYSTEM_TIMEOUT]: 'La operación expiró. Por favor, inténtelo de nuevo.',
	[ErrorMessageKey.SYSTEM_UNAVAILABLE]: 'El servicio no está disponible actualmente. Por favor, inténtelo más tarde.',

	// Payment errors
	[ErrorMessageKey.PAYMENT_DECLINED]: 'Su pago fue rechazado. Por favor, intente con otro método de pago.',
	[ErrorMessageKey.PAYMENT_INVALID_CARD]: 'La información de la tarjeta que proporcionó no es válida.',
	[ErrorMessageKey.PAYMENT_EXPIRED_CARD]: 'La tarjeta que proporcionó ha caducado.',
	[ErrorMessageKey.PAYMENT_PROCESSING_ERROR]: 'Hubo un error al procesar su pago.',

	// Validation errors
	[ErrorMessageKey.VALIDATION_REQUIRED_FIELDS]: 'Por favor, complete todos los campos obligatorios.',
	[ErrorMessageKey.VALIDATION_INVALID_EMAIL]: 'Por favor, introduzca una dirección de correo electrónico válida.',
	[ErrorMessageKey.VALIDATION_INVALID_DATE]: 'Por favor, seleccione una fecha válida.',
	[ErrorMessageKey.VALIDATION_INVALID_TIME]: 'Por favor, seleccione una hora válida.',

	// Network errors
	[ErrorMessageKey.NETWORK_CONNECTION]: 'Error de conexión de red. Por favor, compruebe su conexión a Internet.',
	[ErrorMessageKey.NETWORK_TIMEOUT]: 'La solicitud expiró. Por favor, compruebe su conexión e inténtelo de nuevo.',

	// Availability errors
	[ErrorMessageKey.AVAILABILITY_COURT_TAKEN]: 'Esta pista ya ha sido reservada para la hora seleccionada.',
	[ErrorMessageKey.AVAILABILITY_NO_COURTS]: 'No hay pistas disponibles para la hora seleccionada.',
	[ErrorMessageKey.AVAILABILITY_TIMESLOT_UNAVAILABLE]: 'La franja horaria seleccionada ya no está disponible.',

	// Recovery suggestions
	[ErrorMessageKey.RECOVERY_TRY_AGAIN]: 'Por favor, inténtelo de nuevo.',
	[ErrorMessageKey.RECOVERY_CHECK_CONNECTION]: 'Por favor, compruebe su conexión a Internet e inténtelo de nuevo.',
	[ErrorMessageKey.RECOVERY_DIFFERENT_PAYMENT]: 'Por favor, intente utilizar un método de pago diferente.',
	[ErrorMessageKey.RECOVERY_DIFFERENT_TIME]: 'Por favor, intente seleccionar una hora diferente.',
	[ErrorMessageKey.RECOVERY_DIFFERENT_DATE]: 'Por favor, intente seleccionar una fecha diferente.',
	[ErrorMessageKey.RECOVERY_CHECK_INPUTS]: 'Por favor, compruebe sus datos e inténtelo de nuevo.',
}
