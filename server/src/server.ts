import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { z } from 'zod';
import { createUser, getUserById, getUserByPhone, listMessages, listUsers, storeMessage } from './db.js';
import { authMiddleware, createSession } from './auth.js';
import type { AuthenticatedRequest } from './types.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: true, credentials: true },
});

// Socket authentication via initial event
io.on('connection', (socket) => {
  let userId: string | null = null;

  socket.on('auth', (payload: { userId: string }) => {
    userId = payload?.userId || null;
    if (!userId) return;
    socket.join(`user:${userId}`);
  });

  socket.on('call:offer', (data: { toUserId: string; sdp: any }) => {
    if (!userId) return;
    io.to(`user:${data.toUserId}`).emit('call:offer', { fromUserId: userId, sdp: data.sdp });
  });

  socket.on('call:answer', (data: { toUserId: string; sdp: any }) => {
    if (!userId) return;
    io.to(`user:${data.toUserId}`).emit('call:answer', { fromUserId: userId, sdp: data.sdp });
  });

  socket.on('call:ice', (data: { toUserId: string; candidate: any }) => {
    if (!userId) return;
    io.to(`user:${data.toUserId}`).emit('call:ice', { fromUserId: userId, candidate: data.candidate });
  });
});

// Registration
const registerBody = z.object({
  phone: z.string().min(5),
  displayName: z.string().min(1).max(50),
  publicKey: z.string().min(32), // base64
});
app.post('/api/register', (req, res) => {
  const parse = registerBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'invalid body' });
  const { phone, displayName, publicKey } = parse.data;
  const existing = getUserByPhone(phone);
  if (existing) {
    // Treat as login
    const session = createSession(existing.id);
    return res.json({ user: existing, token: session.token });
  }
  const user = createUser(phone, displayName, publicKey);
  const session = createSession(user.id);
  return res.json({ user, token: session.token });
});

// Login (simple by phone for demo)
const loginBody = z.object({ phone: z.string().min(5) });
app.post('/api/login', (req, res) => {
  const parse = loginBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'invalid body' });
  const user = getUserByPhone(parse.data.phone);
  if (!user) return res.status(404).json({ error: 'user not found' });
  const session = createSession(user.id);
  res.json({ user, token: session.token });
});

// Me
app.get('/api/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

// Users directory and keys
app.get('/api/users', authMiddleware, (_req, res) => {
  res.json({ users: listUsers() });
});
app.get('/api/users/:id/key', authMiddleware, (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json({ publicKey: user.publicKey });
});

// Messages
const postMessageBody = z.object({
  recipientId: z.string(),
  ciphertext: z.string(),
  nonce: z.string(),
});
app.get('/api/messages/:peerId', authMiddleware, (req: AuthenticatedRequest, res) => {
  const peerId = req.params.peerId;
  const messages = listMessages(req.userId!, peerId);
  res.json({ messages });
});
app.post('/api/messages', authMiddleware, (req: AuthenticatedRequest, res) => {
  const parse = postMessageBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'invalid body' });
  const { recipientId, ciphertext, nonce } = parse.data;
  const stored = storeMessage({ senderId: req.userId!, recipientId, ciphertext, nonce });
  io.to(`user:${recipientId}`).emit('message:new', stored);
  res.json({ message: stored });
});

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`server listening on http://localhost:${PORT}`);
});

