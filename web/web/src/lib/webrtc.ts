// Simple WebRTC helper with insertable streams for extra encryption
export type CallHandlers = {
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  signal: {
    sendOffer: (sdp: RTCSessionDescriptionInit) => void;
    sendAnswer: (sdp: RTCSessionDescriptionInit) => void;
    sendIce: (candidate: RTCIceCandidateInit) => void;
  };
  key: CryptoKey; // symmetric key for additional encryption
};

export async function createCallPeer(handlers: CallHandlers) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
  });

  const local = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  handlers.onLocalStream?.(local);

  // Insertable streams for audio
  // @ts-expect-error insertable streams flag
  const supportsInsertable = !!RTCRtpSender.prototype.createEncodedStreams;
  if (supportsInsertable) {
    for (const track of local.getTracks()) {
      const sender = pc.addTrack(track, local);
      // @ts-expect-error createEncodedStreams
      const { readable, writable } = sender.createEncodedStreams();
      encryptTransformStream(readable, writable, handlers.key);
    }
  } else {
    local.getTracks().forEach((t) => pc.addTrack(t, local));
  }

  pc.ontrack = (ev) => {
    const [stream] = ev.streams;
    if (!stream) return;
    handlers.onRemoteStream?.(stream);
    const receiver = ev.receiver;
    // @ts-expect-error createEncodedStreams
    if (receiver.createEncodedStreams) {
      // @ts-expect-error createEncodedStreams
      const { readable, writable } = receiver.createEncodedStreams();
      decryptTransformStream(readable, writable, handlers.key);
    }
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) handlers.signal.sendIce(e.candidate.toJSON());
  };

  async function makeOffer() {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    handlers.signal.sendOffer(offer);
  }

  async function acceptOffer(offer: RTCSessionDescriptionInit) {
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    handlers.signal.sendAnswer(answer);
  }

  async function acceptAnswer(answer: RTCSessionDescriptionInit) {
    await pc.setRemoteDescription(answer);
  }

  async function addIce(candidate: RTCIceCandidateInit) {
    try {
      await pc.addIceCandidate(candidate);
    } catch {}
  }

  return { pc, makeOffer, acceptOffer, acceptAnswer, addIce };
}

async function encryptTransformStream(readable: ReadableStream, writable: WritableStream, key: CryptoKey) {
  const writer = writable.getWriter();
  const reader = readable.getReader();
  async function process() {
    const { value, done } = await reader.read();
    if (done) {
      writer.close();
      return;
    }
    try {
      // value is an EncodedAudioChunk
      const data = new Uint8Array(value.data);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
      const ct = new Uint8Array(ciphertext);
      const out = new Uint8Array(12 + ct.byteLength);
      out.set(iv, 0);
      out.set(ct, 12);
      value.data = out;
    } catch {}
    writer.write(value);
    process();
  }
  process();
}

async function decryptTransformStream(readable: ReadableStream, writable: WritableStream, key: CryptoKey) {
  const writer = writable.getWriter();
  const reader = readable.getReader();
  async function process() {
    const { value, done } = await reader.read();
    if (done) {
      writer.close();
      return;
    }
    try {
      const data = new Uint8Array(value.data);
      if (data.byteLength > 12) {
        const iv = data.subarray(0, 12);
        const ct = data.subarray(12);
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
        value.data = new Uint8Array(plaintext);
      }
    } catch {}
    writer.write(value);
    process();
  }
  process();
}

export async function deriveCallKey(material: ArrayBuffer) {
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

