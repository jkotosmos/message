import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { SessionRecord, StoredMessage, UserRecord } from './types.js';

const db = new Database(process.env.DB_PATH || 'data.sqlite');
db.pragma('journal_mode = WAL');

db.exec(`
  create table if not exists users (
    id text primary key,
    phone text not null unique,
    displayName text not null,
    publicKey text not null,
    createdAt integer not null
  );
  create table if not exists sessions (
    id text primary key,
    userId text not null,
    token text not null unique,
    createdAt integer not null,
    foreign key(userId) references users(id)
  );
  create table if not exists messages (
    id text primary key,
    senderId text not null,
    recipientId text not null,
    ciphertext text not null,
    nonce text not null,
    createdAt integer not null,
    foreign key(senderId) references users(id),
    foreign key(recipientId) references users(id)
  );
`);

export function createUser(phone: string, displayName: string, publicKey: string): UserRecord {
  const user: UserRecord = {
    id: randomUUID(),
    phone,
    displayName,
    publicKey,
    createdAt: Date.now(),
  };
  const stmt = db.prepare(
    'insert into users (id, phone, displayName, publicKey, createdAt) values (@id,@phone,@displayName,@publicKey,@createdAt)'
  );
  stmt.run(user);
  return user;
}

export function getUserByPhone(phone: string): UserRecord | undefined {
  const row = db.prepare('select * from users where phone = ?').get(phone);
  return row as UserRecord | undefined;
}

export function getUserById(id: string): UserRecord | undefined {
  const row = db.prepare('select * from users where id = ?').get(id);
  return row as UserRecord | undefined;
}

export function listUsers(): UserRecord[] {
  const rows = db.prepare('select * from users order by createdAt desc').all();
  return rows as UserRecord[];
}

export function upsertSession(userId: string, token: string): SessionRecord {
  const session: SessionRecord = {
    id: randomUUID(),
    userId,
    token,
    createdAt: Date.now(),
  };
  db.prepare('insert into sessions (id,userId,token,createdAt) values (@id,@userId,@token,@createdAt)').run(session);
  return session;
}

export function getSessionByToken(token: string): SessionRecord | undefined {
  const row = db.prepare('select * from sessions where token = ?').get(token);
  return row as SessionRecord | undefined;
}

export function storeMessage(message: Omit<StoredMessage, 'id' | 'createdAt'>): StoredMessage {
  const record: StoredMessage = { id: randomUUID(), createdAt: Date.now(), ...message };
  db.prepare(
    'insert into messages (id,senderId,recipientId,ciphertext,nonce,createdAt) values (@id,@senderId,@recipientId,@ciphertext,@nonce,@createdAt)'
  ).run(record);
  return record;
}

export function listMessages(userA: string, userB: string): StoredMessage[] {
  const rows = db
    .prepare(
      `select * from messages where (senderId = @a and recipientId = @b) or (senderId = @b and recipientId = @a) order by createdAt asc`
    )
    .all({ a: userA, b: userB });
  return rows as StoredMessage[];
}

