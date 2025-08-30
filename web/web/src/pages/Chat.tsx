import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { computeSharedKey, decryptWithSharedKey, encryptWithSharedKey } from '../lib/crypto';
import { createCallPeer, deriveCallKey } from '../lib/webrtc';

export default function Chat() {
  const { me, token, users, apiBase, connectSocket, socket, keys } = useAppStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const sharedKey = useRef<Uint8Array | null>(null);
  const [, setInCall] = useState(false);
  const localRef = useRef<HTMLAudioElement | null>(null);
  const remoteRef = useRef<HTMLAudioElement | null>(null);
  const rtcRef = useRef<any>(null);

  useEffect(() => {
    if (!token) return;
    connectSocket();
  }, [token]);

  useEffect(() => {
    if (!socket) return;
    const handler = (m: any) => {
      setMessages((prev) => [...prev, m]);
    };
    socket.on('message:new', handler);
    return () => {
      socket.off('message:new', handler);
    };
  }, [socket]);

  useEffect(() => {
    if (!selected || !token) return;
    fetch(`${apiBase}/api/messages/${selected}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []));
  }, [selected, token]);

  useEffect(() => {
    sharedKey.current = null;
  }, [selected]);

  async function ensureSharedKey(peerId: string) {
    if (sharedKey.current) return sharedKey.current;
    const res = await fetch(`${apiBase}/api/users/${peerId}/key`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!keys) throw new Error('No keys');
    const sk = computeSharedKey(keys.secretKey, data.publicKey);
    sharedKey.current = sk;
    return sk;
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!selected || !me) return;
    const sk = await ensureSharedKey(selected);
    const { ciphertext, nonce } = encryptWithSharedKey(sk, input);
    const res = await fetch(`${apiBase}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recipientId: selected, ciphertext, nonce }),
    });
    const data = await res.json();
    if (res.ok) setMessages((prev) => [...prev, data.message]);
    setInput('');
  }

  async function startCall() {
    if (!selected || !socket) return;
    const sk = await ensureSharedKey(selected);
    const callKey = await deriveCallKey(sk);
    const rtc = await createCallPeer({
      key: callKey,
      onLocalStream: (s) => {
        if (localRef.current) localRef.current.srcObject = s;
      },
      onRemoteStream: (s) => {
        if (remoteRef.current) remoteRef.current.srcObject = s;
      },
      signal: {
        sendOffer: (sdp) => socket.emit('call:offer', { toUserId: selected, sdp }),
        sendAnswer: (sdp) => socket.emit('call:answer', { toUserId: selected, sdp }),
        sendIce: (candidate) => socket.emit('call:ice', { toUserId: selected, candidate }),
      },
    });
    rtcRef.current = rtc;
    setInCall(true);
    await rtc.makeOffer();
  }

  useEffect(() => {
    if (!socket) return;
    socket.on('call:offer', async ({ fromUserId, sdp }: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      if (fromUserId !== selected) return;
      const sk = await ensureSharedKey(fromUserId);
      const callKey = await deriveCallKey(sk);
      const rtc = await createCallPeer({
        key: callKey,
        onLocalStream: (s) => {
          if (localRef.current) localRef.current.srcObject = s;
        },
        onRemoteStream: (s) => {
          if (remoteRef.current) remoteRef.current.srcObject = s;
        },
        signal: {
          sendOffer: () => {},
          sendAnswer: (ans) => socket.emit('call:answer', { toUserId: fromUserId, sdp: ans }),
          sendIce: (cand) => socket.emit('call:ice', { toUserId: fromUserId, candidate: cand }),
        },
      });
      rtcRef.current = rtc;
      setInCall(true);
      await rtc.acceptOffer(sdp);
    });
    socket.on('call:answer', async ({ fromUserId, sdp }: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      if (fromUserId !== selected) return;
      await rtcRef.current?.acceptAnswer(sdp);
    });
    socket.on('call:ice', async ({ fromUserId, candidate }: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      if (fromUserId !== selected) return;
      await rtcRef.current?.addIce(candidate);
    });
    return () => {
      socket.off('call:offer');
      socket.off('call:answer');
      socket.off('call:ice');
    };
  }, [socket, selected]);

  const peer = useMemo(() => users.find((u) => u.id === selected) || null, [users, selected]);

  return (
    <div className="min-h-screen grid md:grid-cols-[320px_1fr] bg-[#05060f] text-white">
      <aside className="border-r border-fuchsia-500/10 p-4">
        <div className="text-xl font-bold mb-4 text-fuchsia-300">Чаты</div>
        <div className="space-y-2">
          {users
            .filter((u: any) => u.id !== me?.id)
            .map((u: any) => (
              <button
                key={u.id}
                onClick={() => setSelected(u.id)}
                className={`w-full text-left px-4 py-3 rounded-xl hover:bg-fuchsia-500/10 transition ${
                  selected === u.id ? 'bg-fuchsia-500/20' : 'bg-white/0'
                }`}
              >
                <div className="font-semibold">{u.displayName}</div>
                <div className="text-xs text-fuchsia-300/70">{u.phone}</div>
              </button>
            ))}
        </div>
      </aside>
      <main className="flex flex-col">
        <header className="p-4 border-b border-fuchsia-500/10 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">{peer ? peer.displayName : 'Выберите чат'}</div>
            {peer && <div className="text-xs text-fuchsia-300/70">e2ee активен</div>}
          </div>
          {peer && (
            <button onClick={startCall} className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-fuchsia-600">
              Звонок
            </button>
          )}
        </header>
        <audio ref={localRef} autoPlay muted className="hidden" />
        <audio ref={remoteRef} autoPlay className="hidden" />
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {messages.map((m) => {
            let text = '...';
            try {
              if (sharedKey.current) {
                text = decryptWithSharedKey(sharedKey.current, m.ciphertext, m.nonce);
              }
            } catch {
              text = '[decrypt error]';
            }
            const mine = m.senderId === me?.id;
            return (
              <div key={m.id} className={`max-w-[70%] rounded-2xl px-4 py-2 ${mine ? 'ml-auto bg-fuchsia-600/40' : 'bg-cyan-600/30'}`}>
                {text}
              </div>
            );
          })}
        </div>
        {peer && (
          <form onSubmit={send} className="p-4 border-t border-fuchsia-500/10 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Сообщение"
              className="flex-1 rounded-xl bg-[#0b0f1a] text-white px-4 py-3 outline-none border border-fuchsia-500/30 focus:border-fuchsia-400"
            />
            <button className="px-5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500">Отправить</button>
          </form>
        )}
      </main>
    </div>
  );
}

