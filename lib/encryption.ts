import crypto from 'crypto';

/**
 * Encrypts a checkout object using RSA public key encryption
 * @param checkoutObject - The object to encrypt
 * @returns The encrypted data as a buffer
 */
export function encrypt(checkoutObject: object): Buffer {
  // Convert object to JSON string with indentation
  const jsonObject = JSON.stringify(checkoutObject, null, 4);
  console.log(`Checkout Object:\n ${jsonObject}\n`);

  // Convert string to buffer using ISO-8859-1 encoding
  const jsonBytes = Buffer.from(jsonObject, 'latin1');
  
  // Encrypt the data using RSA public key with OAEP padding and SHA256
  console.log("🚀 ~ encrypt ~ process.env.MMG_PUBLIC_KEY :", process.env.MMG_PUBLIC_KEY )
  const ciphertext = crypto.publicEncrypt(
    {
      key: process.env.MMG_PUBLIC_KEY || '',
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
      mgf1Hash: 'sha256'
    } as crypto.RsaPublicKey,
    jsonBytes
  );

  return ciphertext;
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

  // Convert to buffer
  const ciphertext = Buffer.from(base64String, 'base64');

  // Decrypt using RSA private key with OAEP padding
  const decryptedData = crypto.privateDecrypt(
    {
      key: process.env.MMG_PRIVATE_KEY || '',
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
      mgf1Hash: 'sha256'
    } as crypto.RsaPrivateKey,
    ciphertext
  );

  // Convert buffer to string using ISO-8859-1 encoding
  const decryptedString = decryptedData.toString('latin1');
  console.log(`Decrypted String:\n ${decryptedString}\n`);

  // Parse JSON string to object
  return JSON.parse(decryptedString);
}

/**
 * Example usage:
 * 
 * const checkoutObject = {
 *   amount: 100,
 *   currency: 'USD',
 *   description: 'Test payment'
 * };
 * 
 * const encrypted = encrypt(checkoutObject);
 * const base64Token = toBase64Url(encrypted);
 * const decrypted = decrypt(base64Token);
 */ 