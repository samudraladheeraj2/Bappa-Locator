/**
 * Secure cryptographic utility for hashing 4-digit PINs using SHA-256.
 * Ensures PINs are never stored or transmitted in plain text.
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = 'bappalocator_secure_salt_2026_hyd';
  const msgBuffer = new TextEncoder().encode(pin + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
