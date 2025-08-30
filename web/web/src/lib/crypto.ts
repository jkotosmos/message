import nacl from 'tweetnacl';
import * as util from 'tweetnacl-util';

export type KeyPair = { publicKey: string; secretKey: string };

export function generateKeyPair(): KeyPair {
  const kp = nacl.box.keyPair();
  return {
    publicKey: util.encodeBase64(kp.publicKey),
    secretKey: util.encodeBase64(kp.secretKey),
  };
}

export function computeSharedKey(mySecretBase64: string, theirPublicBase64: string): Uint8Array {
  const sk = util.decodeBase64(mySecretBase64);
  const pk = util.decodeBase64(theirPublicBase64);
  return nacl.box.before(pk, sk);
}

export function encryptWithSharedKey(sharedKey: Uint8Array, plaintext: string) {
  const nonce = nacl.randomBytes(24);
  const message = util.decodeUTF8(plaintext);
  const boxed = nacl.box.after(message, nonce, sharedKey);
  return { ciphertext: util.encodeBase64(boxed), nonce: util.encodeBase64(nonce) };
}

export function decryptWithSharedKey(sharedKey: Uint8Array, ciphertextB64: string, nonceB64: string) {
  const nonce = util.decodeBase64(nonceB64);
  const boxed = util.decodeBase64(ciphertextB64);
  const opened = nacl.box.open.after(boxed, nonce, sharedKey);
  if (!opened) throw new Error('Decryption failed');
  return util.encodeUTF8(opened);
}

export function saveKeysToStorage(keys: KeyPair) {
  localStorage.setItem('keys', JSON.stringify(keys));
}

export function loadKeysFromStorage(): KeyPair | null {
  const raw = localStorage.getItem('keys');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as KeyPair;
  } catch {
    return null;
  }
}

