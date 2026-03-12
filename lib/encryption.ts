import crypto from 'crypto';

/**
 * Encrypts a checkout object using RSA public key encryption
 * @param checkoutObject - The object to encrypt
 * @returns The encrypted data as a buffer
 */
export function encrypt(checkoutObject: object): Buffer {
  const publicKey = process.env.MMG_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error('MMG_PUBLIC_KEY environment variable is required');
  }

  const jsonObject = JSON.stringify(checkoutObject, null, 4);
  const jsonBytes = Buffer.from(jsonObject, 'latin1');

  return crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
      mgf1Hash: 'sha256'
    } as crypto.RsaPublicKey,
    jsonBytes
  );
}

/**
 * Converts a buffer to URL-safe base64 string
 * @param token - The buffer to encode
 * @returns URL-safe base64 encoded string
 */
export function toBase64Url(token: Buffer): string {
  return token.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decrypts a base64 URL-safe encoded string using RSA private key
 * @param base64UrlString - The base64 URL-safe encoded string to decrypt
 * @returns The decrypted object
 */
export function decrypt(base64UrlString: string): object {
  const privateKey = process.env.MMG_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('MMG_PRIVATE_KEY environment variable is required');
  }

  // Add padding if necessary
  let paddedString = base64UrlString;
  const paddingNeeded = 4 - (base64UrlString.length % 4);
  if (paddingNeeded < 4) {
    paddedString += '='.repeat(paddingNeeded);
  }

  // Convert from URL-safe base64 to regular base64
  const base64String = paddedString
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const ciphertext = Buffer.from(base64String, 'base64');

  const decryptedData = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
      mgf1Hash: 'sha256'
    } as crypto.RsaPrivateKey,
    ciphertext
  );

  const decryptedString = decryptedData.toString('latin1');

  try {
    return JSON.parse(decryptedString);
  } catch {
    throw new Error('Failed to parse decrypted data as JSON');
  }
}
