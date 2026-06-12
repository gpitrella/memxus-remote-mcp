/**
 * AES-256-GCM encryption primitives for memory content encryption.
 * SYNC: RemoteMCP-AIMemory/src/lib/encryption.ts
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PREFIX = 'mxe1:';

let _masterKey: Buffer | null = null;

export function loadMasterKey(): Buffer {
  if (_masterKey) return _masterKey;

  const hex = process.env.MASTER_ENCRYPTION_KEY?.trim();
  if (!hex) {
    throw Object.assign(
      new Error('MASTER_ENCRYPTION_KEY is not configured'),
      { code: 'ENCRYPTION_NOT_CONFIGURED' }
    );
  }
  if (hex.length !== KEY_LENGTH * 2 || !/^[0-9a-f]+$/i.test(hex)) {
    throw Object.assign(
      new Error('MASTER_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)'),
      { code: 'ENCRYPTION_KEY_INVALID' }
    );
  }

  _masterKey = Buffer.from(hex, 'hex');
  return _masterKey;
}

export function isEncryptionEnabled(): boolean {
  return process.env.ENABLE_ENCRYPTION === 'true';
}

export function isMetadataEncryptionEnabled(): boolean {
  if (!isEncryptionEnabled()) return false;
  return process.env.ENABLE_ENCRYPT_METADATA !== 'false';
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptString(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const payload = Buffer.concat([iv, encrypted, tag]);
  return PREFIX + payload.toString('base64');
}

export function decryptString(key: Buffer, ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) {
    throw Object.assign(
      new Error('Invalid ciphertext: missing prefix'),
      { code: 'DECRYPT_INVALID_FORMAT' }
    );
  }

  const payload = Buffer.from(ciphertext.slice(PREFIX.length), 'base64');

  if (payload.length < IV_LENGTH + TAG_LENGTH) {
    throw Object.assign(
      new Error('Invalid ciphertext: payload too short'),
      { code: 'DECRYPT_INVALID_FORMAT' }
    );
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(payload.length - TAG_LENGTH);
  const encrypted = payload.subarray(IV_LENGTH, payload.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function generateDek(): Buffer {
  return randomBytes(KEY_LENGTH);
}

export function wrapDek(dek: Buffer, wrapperKey: Buffer): string {
  return encryptString(wrapperKey, dek.toString('base64'));
}

export function unwrapDek(wrappedDek: string, wrapperKey: Buffer): Buffer {
  const base64 = decryptString(wrapperKey, wrappedDek);
  const key = Buffer.from(base64, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw Object.assign(
      new Error('Unwrapped DEK has invalid length'),
      { code: 'DEK_INVALID_LENGTH' }
    );
  }
  return key;
}

/** Reset cached master key (for testing only). */
export function _resetMasterKeyCache(): void {
  _masterKey = null;
}
