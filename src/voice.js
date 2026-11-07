// Voice chat: a full mesh of PeerJS media calls between everyone in the room. Each remote
// voice is spatialised at that player's head, so you hear people from where they stand.
export class Voice {
  constructor(audio) { this.audio = audio; this.stream = null; this.calls = new Map(); this.peer = null; this.starting = false; this.myId = null; }

  async start() {
    if (this.stream || this.starting) return;
    this.starting = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) { this.stream = null; }
    this.starting = false;
  }

  // Called whenever a Peer object is (re)created by the network layer.
  bindPeer(peer, myId) {
    this.peer = peer; this.myId = myId;
    for (const c of this.calls.values()) this.drop(c);
    this.calls.clear();
    peer.on('call', (call) => {
      if (!this.stream) { call.close(); return; }
      call.answer(this.stream);
      this.hook(call);
    });
  }

  hook(call) {
    const entry = { call, out: null };
    this.calls.set(call.peer, entry);
    call.on('stream', (remote) => { entry.out = this.audio.attachStream(remote); });
    const drop = () => { if (this.calls.get(call.peer) === entry) { this.drop(entry); this.calls.delete(call.peer); } };
    call.on('close', drop); call.on('error', drop);
  }

  drop(entry) { try { entry.call.close(); } catch (e) { /* ignore */ } if (entry.out) entry.out.dispose(); }

  // ids: every other peer in the room; positions: Map id -> Vector3 head position.
  update(ids, positions) {
    if (!this.peer || !this.stream || !this.myId) return;
    for (const id of ids) {
      if (id === this.myId || this.calls.has(id)) continue;
      if (this.myId > id) this.hook(this.peer.call(id, this.stream));   // one side initiates
    }
    for (const [id, entry] of this.calls) {
      if (!ids.includes(id)) { this.drop(entry); this.calls.delete(id); continue; }
      const p = positions.get(id);
      if (p && entry.out) entry.out.setPos(p);
    }
  }

  stop() {
    for (const c of this.calls.values()) this.drop(c);
    this.calls.clear();
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
  }
}
