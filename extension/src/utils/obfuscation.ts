/* ------------------------------------------------------------------ */
/*  Simple reversible obfuscation for stored API keys                 */
/* ------------------------------------------------------------------ */
/*  This is NOT real encryption — it only prevents casual inspection  */
/*  of keys stored in chrome.storage.local.                          */
/* ------------------------------------------------------------------ */

const SALT = 'browser-agent';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

const SALT_BYTES = textEncoder.encode(SALT);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * XOR a string against a repeating salt and base64-encode the result.
 * Works safely with unicode input by operating on UTF-8 bytes.
 */
export function obfuscate(value: string): string {
  const valueBytes = textEncoder.encode(value);
  const obfuscated = new Uint8Array(valueBytes.length);
  for (let i = 0; i < valueBytes.length; i++) {
    obfuscated[i] = valueBytes[i] ^ SALT_BYTES[i % SALT_BYTES.length];
  }
  return bytesToBase64(obfuscated);
}

/**
 * Reverse obfuscate. Returns the raw input if it cannot be decoded.
 */
export function deobfuscate(value: string): string {
  try {
    const valueBytes = base64ToBytes(value);
    const resultBytes = new Uint8Array(valueBytes.length);
    for (let i = 0; i < valueBytes.length; i++) {
      resultBytes[i] = valueBytes[i] ^ SALT_BYTES[i % SALT_BYTES.length];
    }
    return textDecoder.decode(resultBytes);
  } catch {
    return value;
  }
}
