// Rooms over PeerJS (WebRTC, free public signalling server). The first player to join a room
// code becomes its host: runs the monsters, relays everyone's state, decides kills. If the
// host leaves, everyone drops back to solo and can rejoin; the next joiner becomes host.
const PREFIX = 'hollow-canopy-';

export class Net {
  constructor(cb) {
    this.cb = cb;              // { onStatus, onWorld(players, monsters), onKill(id, pos), onPeerLeft(id) }
    this.peer = null; this.room = null; this.isHost = false;
    this.conns = new Map();    // host: id -> conn
    this.hostConn = null;      // client
    this.states = new Map();   // host: id -> last state from each client
    this.id = null;
  }

  get connected() { return this.room !== null && (this.isHost || (this.hostConn && this.hostConn.open)); }
  get playerCount() { return this.isHost ? this.conns.size + 1 : this.states.size + 1; }

  join(code) {
    if (typeof Peer === 'undefined') { this.cb.onStatus('Network library failed to load'); return; }
    this.leave();
    code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.room = code;
    this.cb.onStatus('Connecting to room ' + code + '...');
    // Try to become the host first; the id is taken if a host already exists.
    const peer = new Peer(PREFIX + code);
    this.peer = peer;
    peer.on('open', (id) => { this.id = id; this.becomeHost(); });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') { peer.destroy(); this.connectAsClient(code); }
      else if (e.type === 'peer-unavailable') { this.cb.onStatus('Host vanished, retrying...'); setTimeout(() => this.join(code), 1500); }
      else { this.cb.onStatus('Network error: ' + e.type); }
    });
  }

  becomeHost() {
    this.isHost = true;
    this.cb.onStatus('HOSTING room ' + this.room + '  -  1 player');
    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.conns.set(conn.peer, conn);
        this.cb.onStatus('HOSTING room ' + this.room + '  -  ' + this.playerCount + ' players');
      });
      conn.on('data', (d) => { if (d && d.t === 's') this.states.set(conn.peer, d.s); });
      const drop = () => {
        this.conns.delete(conn.peer); this.states.delete(conn.peer);
        this.cb.onPeerLeft(conn.peer);
        this.cb.onStatus('HOSTING room ' + this.room + '  -  ' + this.playerCount + ' players');
      };
      conn.on('close', drop); conn.on('error', drop);
    });
  }

  connectAsClient(code) {
    const peer = new Peer();
    this.peer = peer; this.isHost = false;
    peer.on('open', (id) => {
      this.id = id;
      const conn = peer.connect(PREFIX + code, { reliable: false, serialization: 'json' });
      this.hostConn = conn;
      conn.on('open', () => this.cb.onStatus('IN room ' + code + '  -  connected'));
      conn.on('data', (d) => {
        if (!d) return;
        if (d.t === 'w') { this.states = new Map(Object.entries(d.p)); this.cb.onWorld(d.p, d.m); }
        else if (d.t === 'k') this.cb.onKill(d.id, d.p);
      });
      const drop = () => { if (this.room) { this.cb.onStatus('Lost the host. Rejoin to play together.'); this.leave(); } };
      conn.on('close', drop); conn.on('error', drop);
    });
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') { peer.destroy(); setTimeout(() => this.join(code), 800); }
      else this.cb.onStatus('Network error: ' + e.type);
    });
  }

  leave() {
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
    this.peer = null; this.room = null; this.isHost = false;
    this.conns.clear(); this.states.clear(); this.hostConn = null;
    this.cb.onStatus('SOLO  -  not connected');
  }

  // Client: send my state to the host. Host: just remember it.
  sendState(state) {
    if (!this.room) return;
    if (this.isHost) this.states.set(this.id, state);
    else if (this.hostConn && this.hostConn.open) this.hostConn.send({ t: 's', s: state });
  }

  // Host: push the whole world to every client.
  broadcastWorld(monsters) {
    if (!this.isHost) return;
    const p = {}; for (const [id, s] of this.states) p[id] = s;
    const msg = { t: 'w', p, m: monsters };
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  broadcastKill(id, pos) {
    if (!this.isHost) return;
    const msg = { t: 'k', id, p: [pos.x, pos.y, pos.z] };
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }
}
