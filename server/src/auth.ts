import type { NextFunction, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { getSessionByToken, getUserById, upsertSession } from './db.js';
import type { AuthenticatedRequest, UserRecord } from './types.js';

export function issueToken(userId: string): string {
  // Simple opaque token; rotate by re-login
  return randomBytes(24).toString('base64url');
}

export function createSession(userId: string) {
  const token = issueToken(userId);
  return upsertSession(userId, token);
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'missing authorization' });
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const session = getSessionByToken(token);
  if (!session) return res.status(401).json({ error: 'invalid token' });
  const user = getUserById(session.userId) as UserRecord | undefined;
  if (!user) return res.status(401).json({ error: 'user not found' });
  req.user = user;
  req.userId = user.id;
  next();
}

