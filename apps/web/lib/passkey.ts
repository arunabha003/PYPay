'use client';

// Dynamic import types to avoid SSR issues
type RegistrationResponseJSON = any;
type AuthenticationResponseJSON = any;

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3002';

interface PasskeyUser {
  id: string;
  passkeyCredentialId: string;
  smartAccountAddress: string;
  owner: string;
}

/**
 * Generate WebAuthn registration options from server
 */
async function getRegistrationOptions(username: string) {
  // In production, this would call your backend
  // For MVP, we generate client-side
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  
  // Convert to base64url as required by @simplewebauthn/browser
  const toBase64url = (buffer: Uint8Array) => {
    return btoa(String.fromCharCode(...buffer))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };
  
  return {
    challenge: toBase64url(challenge),
    rp: {
      name: 'TapKit',
      id: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
    },
    user: {
      id: toBase64url(crypto.getRandomValues(new Uint8Array(32))),
      name: username,
      displayName: username,
    },
    pubKeyCredParams: [
      { type: 'public-key' as const, alg: -7 }, // ES256
      { type: 'public-key' as const, alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      userVerification: 'required' as const,
      residentKey: 'preferred' as const,
    },
    timeout: 60000,
    attestation: 'none' as const,
  };
}

/**
 * Register a new passkey
 */
export async function registerPasskey(username: string): Promise<PasskeyUser> {
  try {
    // Dynamic import for client-side only
    const { startRegistration } = await import('@simplewebauthn/browser');
    
    const options = await getRegistrationOptions(username);
    
    // Start WebAuthn registration
    const credential = await startRegistration(options);
    
    // In production, send credential to backend for verification and storage
    // For MVP, we store locally
    // Use the base64url user.id as the userId
    const userId = options.user.id;
    
    const user: PasskeyUser = {
      id: userId,
      passkeyCredentialId: credential.id,
      smartAccountAddress: '', // Will be set after account creation
      owner: '', // Will be derived from passkey
    };
    
    // Store in localStorage for MVP
    localStorage.setItem('passkeyUser', JSON.stringify(user));
    localStorage.setItem(`passkey_${credential.id}`, JSON.stringify(credential));
    
    return user;
  } catch (error) {
    console.error('Passkey registration failed:', error);
    throw new Error('Failed to register passkey');
  }
}

/**
 * Generate WebAuthn authentication options
 */
async function getAuthenticationOptions() {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  
  // Convert to base64url as required by @simplewebauthn/browser
  const toBase64url = (buffer: Uint8Array) => {
    return btoa(String.fromCharCode(...buffer))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };
  
  return {
    challenge: toBase64url(challenge),
    rpId: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
    userVerification: 'required' as const,
    timeout: 60000,
  };
}

/**
 * Authenticate with passkey
 */
export async function authenticatePasskey(): Promise<PasskeyUser> {
  try {
    // Dynamic import for client-side only
    const { startAuthentication } = await import('@simplewebauthn/browser');
    
    const options = await getAuthenticationOptions();
    
    // Start WebAuthn authentication
    const assertion = await startAuthentication(options);
    
    // In production, verify assertion on backend
    // For MVP, check localStorage
    const credentialData = localStorage.getItem(`passkey_${assertion.id}`);
    if (!credentialData) {
      throw new Error('Passkey not found');
    }
    
    const user = localStorage.getItem('passkeyUser');
    if (!user) {
      throw new Error('User not found');
    }
    
    return JSON.parse(user) as PasskeyUser;
  } catch (error) {
    console.error('Passkey authentication failed:', error);
    throw new Error('Failed to authenticate with passkey');
  }
}

/**
 * Check if user has registered passkey
 */
export function hasPasskey(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('passkeyUser') !== null;
}

/**
 * Get current passkey user
 */
export function getPasskeyUser(): PasskeyUser | null {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('passkeyUser');
  return user ? JSON.parse(user) : null;
}

/**
 * Clear passkey session
 */
export function clearPasskeySession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('passkeyUser');
  sessionStorage.removeItem('sessionKey');
}

