// netlify/functions/_shared/google-wallet-service.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { GoogleAuth } from 'google-auth-library';
import { WALLET_CONFIG } from './wallet-pass-config';
import * as jwt from 'jsonwebtoken';

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

/**
 * Google Wallet service class
 * 
 * Handles authentication and interaction with the Google Wallet API
 * using Firebase Admin SDK for authentication
 */
export class GoogleWalletService {
  private auth: GoogleAuth;
  private baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1';
  private issuerId: string;
  private classPrefix: string;

  constructor() {
    // Get issuer ID from environment variables
    this.issuerId = process.env.GOOGLE_WALLET_ISSUER_ID || '';
    this.classPrefix = `${this.issuerId}.${WALLET_CONFIG.google.classId}`;
    
    // Initialize auth client using Firebase Admin credentials
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }

  /**
   * Create or update a pass class (template)
   * This would typically be done during application setup
   * or when updating the pass design
   * 
   * @param classData The class data to create or update
   * @returns The created or updated class
   */
  async createOrUpdateClass(classData: any): Promise<any> {
    try {
      // Get an authenticated client
      const client = await this.auth.getClient();
      const url = `${this.baseUrl}/eventTicketClass/${classData.id}`;
      
      try {
        // First try to get the class
        const getResponse = await client.request({ url, method: 'GET' });
        
        // If it exists, update it
        return await client.request({
          url,
          method: 'PUT',
          data: classData
        });
      } catch (error) {
        // If it doesn't exist (404), create it
        if (error.response && error.response.status === 404) {
          return await client.request({
            url: `${this.baseUrl}/eventTicketClass`,
            method: 'POST',
            data: classData
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('Error creating or updating Google Wallet class:', error);
      throw error;
    }
  }

  /**
   * Create a Google Wallet pass object for a specific booking
   * 
   * @param objectData The object data to create
   * @returns The created object
   */
  async createPassObject(objectData: any): Promise<any> {
    try {
      // Get an authenticated client
      const client = await this.auth.getClient();
      const url = `${this.baseUrl}/eventTicketObject`;
      
      // Create the pass object
      return await client.request({
        url,
        method: 'POST',
        data: objectData
      });
    } catch (error) {
      console.error('Error creating Google Wallet pass object:', error);
      throw error;
    }
  }

  /**
   * Generate a signed JWT for a Google Wallet pass
   * This JWT is used in the "Save to Google Wallet" URL
   * 
   * @param classId The class ID
   * @param objectId The object ID
   * @returns A signed JWT string
   */
  async generatePassJwt(classId: string, objectId: string): Promise<string> {
    try {
      // Get an authenticated client using Firebase credentials
      const client = await this.auth.getClient();
      // Get the client email from credentials
      const clientEmail = await this.auth.getCredentials()
        .then(creds => creds.client_email);
      
      // Get private key from client if available (for JWT signing)
      let privateKey;
      if ('key' in client && client.key) {
        privateKey = client.key;
      } else {
        // Fallback to environment variable if client key is not available
        privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '';
      }
      
      // Create the JWT payload
      const payload = {
        iss: clientEmail,
        aud: 'google',
        typ: 'savetoandroidpay',
        iat: Math.floor(Date.now() / 1000),
        payload: {
          // Specify eventTicket objects
          eventTicketObjects: [{
            id: objectId,
            classId: classId,
          }]
        }
      };

      // Sign with the private key using the JWT library
      const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
      return token;
    } catch (error) {
      console.error('Error generating Google Wallet JWT:', error);
      throw error;
    }
  }

  /**
   * Create a complete Google Wallet pass and return the save URL
   * 
   * @param passData The pass data from formatGoogleWalletObject
   * @returns A URL that can be used to save the pass to Google Wallet
   */
  async createPass(passData: any): Promise<string> {
    try {
      // Extract class and object data
      const { eventTicketClass, eventTicketObject } = passData;
      
      // Create or update the class (template)
      await this.createOrUpdateClass(eventTicketClass);
      
      // Create the object (specific pass instance)
      await this.createPassObject(eventTicketObject);
      
      // Generate JWT for the save link
      const jwt = await this.generatePassJwt(
        eventTicketObject.classId,
        eventTicketObject.id
      );
      
      // Return the Google Wallet save link
      return `https://pay.google.com/gp/v/save/${jwt}`;
    } catch (error) {
      console.error('Error creating Google Wallet pass:', error);
      throw error;
    }
  }
}