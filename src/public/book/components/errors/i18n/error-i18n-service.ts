// src/public/book/i18n/error-i18n.service.ts

import { BehaviorSubject } from 'rxjs';
import { ErrorMessageKey, ErrorTranslations, defaultErrorMessages, deErrorMessages, esErrorMessages } from './error-messages';

/**
 * Service to handle internationalized error messages
 */
export class ErrorI18nService {
  // Available languages
  private static languages: Record<string, ErrorTranslations> = {
    'en': defaultErrorMessages,
    'de': deErrorMessages,
    'es': esErrorMessages,
  };
  
  // Current language
  private static currentLanguage = new BehaviorSubject<string>('en');
  
  // Set the current language for error messages
  static setLanguage(languageCode: string): void {
    if (this.languages[languageCode]) {
      this.currentLanguage.next(languageCode);
    } else {
      console.warn(`Language ${languageCode} not available for error messages. Using default.`);
      this.currentLanguage.next('en');
    }
  }
  
  // Get the current language
  static getLanguage(): string {
    return this.currentLanguage.getValue();
  }
  
  // Get a translated error message by key
  static getMessage(key: ErrorMessageKey, fallback?: string): string {
    const language = this.currentLanguage.getValue();
    const translations = this.languages[language] || defaultErrorMessages;
    
    return translations[key] || fallback || defaultErrorMessages[key] || key;
  }
  
  // Add or update translations for a language
  static addTranslations(languageCode: string, translations: ErrorTranslations): void {
    this.languages[languageCode] = {
      ...(this.languages[languageCode] || {}),
      ...translations
    };
  }
  
  // Get all available language codes
  static getAvailableLanguages(): string[] {
    return Object.keys(this.languages);
  }
  
  // Format a message with parameters
  static formatMessage(key: ErrorMessageKey, params: Record<string, string | number> = {}): string {
    const message = this.getMessage(key);
    
    return message.replace(/\{(\w+)\}/g, (match, param) => {
      return (params[param] !== undefined) ? String(params[param]) : match;
    });
  }

  // Subscribe to language changes
  static onLanguageChange(callback: (language: string) => void): { unsubscribe: () => void } {
    return this.currentLanguage.subscribe(callback);
  }
}

// Re-export ErrorMessageKey for convenience
export { ErrorMessageKey } from './error-messages';
