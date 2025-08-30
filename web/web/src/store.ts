import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { io } from 'socket.io-client';
import type { KeyPair } from './lib/crypto';
import { loadKeysFromStorage, saveKeysToStorage } from './lib/crypto';

type User = { id: string; phone: string; displayName: string; publicKey: string };

type State = {
  apiBase: string;
  me: User | null;
  token: string | null;
  users: User[];
  socket: any | null;
  keys: KeyPair | null;
  setApiBase: (url: string) => void;
  registerOrLogin: (phone: string, displayName: string) => Promise<void>;
  loadUsers: () => Promise<void>;
  connectSocket: () => void;
};

export const useAppStore = create<State>()(
  immer((set, get) => ({
    apiBase: import.meta.env.VITE_API_BASE || 'http://localhost:4000',
    me: null,
    token: null,
    users: [],
    socket: null,
    keys: loadKeysFromStorage(),
    setApiBase(url: string) {
      set((s) => {
        s.apiBase = url;
      });
    },
    async registerOrLogin(phone: string, displayName: string) {
      let keys = get().keys;
      if (!keys) {
        const { generateKeyPair } = await import('./lib/crypto');
        keys = generateKeyPair();
        saveKeysToStorage(keys);
        set((s) => void (s.keys = keys));
      }
      const res = await fetch(`${get().apiBase}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, displayName, publicKey: keys.publicKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      set((s) => {
        s.me = data.user;
        s.token = data.token;
      });
    },
    async loadUsers() {
      const { token, apiBase } = get();
      if (!token) return;
      const res = await fetch(`${apiBase}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      set((s) => void (s.users = data.users));
    },
    connectSocket() {
      const { token, me, apiBase } = get();
      if (!token || !me) return;
      if (get().socket) return;
      const socket = io(apiBase, { transports: ['websocket'] });
      socket.on('connect', () => {
        socket.emit('auth', { userId: me.id });
      });
      // avoid immer draft assignment issues by narrowing through unknown
      set((s) => {
        s.socket = socket;
      });
    },
  }))
);

