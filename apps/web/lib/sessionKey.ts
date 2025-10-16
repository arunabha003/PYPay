'use client';

import { type Hex, type Address } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3002';
const SESSION_KEY_TTL = 30 * 60 * 1000; // 30 minutes

interface SessionKey {
  privateKey: Hex;
  publicKey: Address;
  validUntil: number;
  policyId: number;
}

/**
 * Generate a new ephemeral session key
 */
export function generateSessionKey(policyId: number = 1): SessionKey {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  
  const sessionKey: SessionKey = {
    privateKey,
    publicKey: account.address,
    validUntil: Date.now() + SESSION_KEY_TTL,
    policyId,
  };
  
  // Store in sessionStorage
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('sessionKey', JSON.stringify({
      privateKey,
      publicKey: account.address,
      validUntil: sessionKey.validUntil,
      policyId,
    }));
  }
  
  return sessionKey;
}

/**
 * Get current session key from storage
 */
export function getSessionKey(): SessionKey | null {
  if (typeof window === 'undefined') return null;
  
  const stored = sessionStorage.getItem('sessionKey');
  if (!stored) return null;
  
  const sessionKey = JSON.parse(stored) as SessionKey;
  
  // Check if expired
  if (Date.now() > sessionKey.validUntil) {
    sessionStorage.removeItem('sessionKey');
    return null;
  }
  
  return sessionKey;
}

/**
 * Check if session key is valid
 */
export function hasValidSessionKey(): boolean {
  const sessionKey = getSessionKey();
  return sessionKey !== null && Date.now() < sessionKey.validUntil;
}

/**
 * Request guardian attestation for session key
 */
export async function requestSessionAttestation(
  smartAccount: Address,
  sessionPubKey: Hex,
  validUntil: number,
  policyId: number
): Promise<Hex> {
  const response = await fetch(`${RELAYER_URL}/session/attest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: smartAccount, // Use account as userId for MVP
      smartAccount,
      sessionPubKey,
      validUntil,
      policyId,
    }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to get session attestation');
  }
  
  const { signature } = await response.json();
  return signature as Hex;
}

/**
 * Clear session key
 */
export function clearSessionKey(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('sessionKey');
}

/**
 * Get session key account for signing
 */
export function getSessionKeyAccount() {
  const sessionKey = getSessionKey();
  if (!sessionKey) return null;
  
  return privateKeyToAccount(sessionKey.privateKey);
}

