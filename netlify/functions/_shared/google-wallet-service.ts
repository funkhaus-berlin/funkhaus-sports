// netlify/functions/_shared/google-wallet-service.ts

import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import { WALLET_CONFIG } from './wallet-pass-config';

/**
 * Google Wallet service class
 * 
 * Direct implementation without relying on Google Auth library
 * Uses JWT and Axios for API calls
 */
export class GoogleWalletService {
  private baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1';
  private issuerId: string;
  private classPrefix: string;
  private projectId: string;
  private clientEmail: string;
  private privateKey: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    // Get service account details from environment variables
    this.projectId = process.env.FIREBASE_PROJECT_ID || '';
    this.clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
    this.privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    
    // Get issuer ID from environment variables (necessary for Google Wallet)
    this.issuerId = process.env.GOOGLE_WALLET_ISSUER_ID || ''; 
    this.classPrefix = `${this.issuerId}.${WALLET_CONFIG.google.classId}`;
    
    // Log credential info for debugging (without exposing private key)
    console.log('GoogleWalletService initialized with:');
    console.log('- Project ID:', this.projectId ? 'Found' : 'Missing');
    console.log('- Client Email:', this.clientEmail ? 'Found' : 'Missing');
    console.log('- Private Key:', this.privateKey ? 'Found (length: ' + (this.privateKey?.length || 0) + ')' : 'Missing');
    console.log('- First 10 chars of private key:', this.privateKey?.substring(0, 10) || 'N/A');
    console.log('- Issuer ID:', this.issuerId ? 'Found' : 'Missing');
    
    // Validate credentials
    this.validateCredentials();
  }

  /**
   * Validate that all required credentials are present
   * @throws Error if any required credential is missing
   */
  private validateCredentials(): void {
    const missingCredentials: string[] = [];
    
    if (!this.projectId) missingCredentials.push('FIREBASE_PROJECT_ID');
    if (!this.clientEmail) missingCredentials.push('FIREBASE_CLIENT_EMAIL');
    if (!this.privateKey) missingCredentials.push('FIREBASE_PRIVATE_KEY');
    if (!this.issuerId) missingCredentials.push('GOOGLE_WALLET_ISSUER_ID');
    
    if (missingCredentials.length > 0) {
      throw new Error(`Missing required credentials: ${missingCredentials.join(', ')}`);
    }
    
    // Validate private key format
    if (!this.privateKey.includes('BEGIN PRIVATE KEY') || !this.privateKey.includes('END PRIVATE KEY')) {
      throw new Error('Invalid private key format. Must include BEGIN and END markers.');
    }
  }
  
  /**
   * Get an access token for Google API requests
   * Creates a JWT and exchanges it for an access token
   * Caches the token until it expires
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && now < this.tokenExpiry - 60) {
      return this.accessToken as string;
    }
    
    try {
      console.log('Generating new access token...');
      
      // Create a JWT to request an access token
      const tokenJwt = jwt.sign(
        {
          iss: this.clientEmail,
          scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
          aud: 'https://oauth2.googleapis.com/token',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        },
        this.privateKey,
        { algorithm: 'RS256' }
      );
      
      // Exchange JWT for access token
      const response = await axios.post(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: tokenJwt,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      
      this.accessToken = response.data.access_token;
      this.tokenExpiry = Math.floor(Date.now() / 1000) + response.data.expires_in;
      
      console.log('Access token generated successfully');
      return this.accessToken as string;
    } catch (error) {
      console.error('Error getting access token:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
      throw new Error(`Failed to get access token: ${error.message}`);
    }
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
      // Get access token
      const token = await this.getAccessToken();
      const url = `${this.baseUrl}/eventTicketClass/${classData.id}`;
      
      try {
        // First try to get the class
        console.log('Checking if class exists:', classData.id);
        const getResponse = await axios.get(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        // If it exists, update it
        console.log('Class exists, updating it');
        const updateResponse = await axios.put(
          url,
          classData,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        return updateResponse.data;
      } catch (error) {
        // If it doesn't exist (404), create it
        if (error.response && error.response.status === 404) {
          console.log('Class does not exist, creating it');
          const createResponse = await axios.post(
            `${this.baseUrl}/eventTicketClass`,
            classData,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          return createResponse.data;
        }
        
        // Check for API not enabled error
        if (error.response && error.response.status === 403 && 
            (error.response.data?.error?.message?.includes('API has not been used') || 
             error.response.data?.error?.message?.includes('is disabled'))) {
          const projectId = this.projectId;
          const errorMsg = `Google Wallet API is not enabled for project ${projectId}. `
            + `Please enable it at: https://console.developers.google.com/apis/api/walletobjects.googleapis.com/overview?project=${projectId}`;
          console.error(errorMsg);
          throw new Error(errorMsg);
        }
        
        throw error;
      }
    } catch (error) {
      console.error('Error creating or updating Google Wallet class:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
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
      // Get access token
      const token = await this.getAccessToken();
      const url = `${this.baseUrl}/eventTicketObject`;
      
      // Create the pass object
      console.log('Creating pass object:', objectData.id);
      const response = await axios.post(
        url,
        objectData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error creating Google Wallet pass object:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
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
      // Create the JWT payload for Google Wallet
      const payload = {
        iss: this.clientEmail,
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
      console.log('Signing JWT for classId:', classId, 'objectId:', objectId);
      const token = jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });
      
      // Log success but not the actual token
      console.log('JWT generated successfully');
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
      // Validate credentials first
      this.validateCredentials();
      
      // Extract class and object data
      const { eventTicketClass, eventTicketObject } = passData;
      
      console.log('Creating Google Wallet pass:');
      console.log('- Class ID:', eventTicketClass.id);
      console.log('- Object ID:', eventTicketObject.id);
      
      try {
        // Create or update the class (template)
        console.log('Creating/updating ticket class...');
        await this.createOrUpdateClass(eventTicketClass);
        
        // Create the object (specific pass instance)
        console.log('Creating ticket object...');
        await this.createPassObject(eventTicketObject);
        
        // Generate JWT for the save link
        console.log('Generating JWT...');
        const jwt = await this.generatePassJwt(
          eventTicketObject.classId,
          eventTicketObject.id
        );
        
        // Return the Google Wallet save link
        const saveUrl = `https://pay.google.com/gp/v/save/${jwt}`;
        console.log('Generated Google Wallet save URL successfully');
        return saveUrl;
      } catch (apiError) {
        console.error('API error during pass creation:', apiError);
        throw new Error(`Google Wallet API error: ${apiError.message || 'Unknown API error'}`);
      }
    } catch (error) {
      console.error('Error creating Google Wallet pass:', error);
      throw error;
    }
  }
}
