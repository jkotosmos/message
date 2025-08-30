import { randomBytes } from 'node:crypto';
import { getSessionByToken, getUserById, upsertSession } from './db.js';
export function issueToken(userId) {
    // Simple opaque token; rotate by re-login
    return randomBytes(24).toString('base64url');
}
export function createSession(userId) {
    const token = issueToken(userId);
    return upsertSession(userId, token);
}
export function authMiddleware(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth)
        return res.status(401).json({ error: 'missing authorization' });
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const session = getSessionByToken(token);
    if (!session)
        return res.status(401).json({ error: 'invalid token' });
    const user = getUserById(session.userId);
    if (!user)
        return res.status(401).json({ error: 'user not found' });
    req.user = user;
    req.userId = user.id;
    next();
}
//# sourceMappingURL=auth.js.map