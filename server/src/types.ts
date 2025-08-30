export type UserRecord = {
  id: string;
  phone: string;
  displayName: string;
  publicKey: string; // base64 X25519
  createdAt: number;
};

export type SessionRecord = {
  id: string;
  userId: string;
  token: string;
  createdAt: number;
};

export type StoredMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  ciphertext: string; // base64
  nonce: string; // base64
  createdAt: number;
};

export type AuthenticatedRequest = import('express').Request & {
  user?: UserRecord;
  userId?: string;
};

