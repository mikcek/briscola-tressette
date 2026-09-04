const STORAGE_KEY = 'briscola_player';

export function getOrCreatePlayerId() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.playerId) return data.playerId;
    }
  } catch {
    /* ignore */
  }
  const playerId = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  saveSession({ playerId });
  return playerId;
}

export function saveSession(partial) {
  let data = {};
  try {
    data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    data = {};
  }
  Object.assign(data, partial);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export class NetClient {
  constructor() {
    this.ws = null;
    this.playerId = getOrCreatePlayerId();
    this.handlers = new Map();
    this.connected = false;
    this._queue = [];
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    for (const fn of this.handlers.get(type) || []) fn(payload);
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return Promise.resolve();
    }

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.addEventListener('open', () => {
        this.connected = true;
        this.send({ type: 'hello', playerId: this.playerId });
        for (const msg of this._queue) this.ws.send(JSON.stringify(msg));
        this._queue = [];
        this.emit('open');
        resolve();
      });

      this.ws.addEventListener('message', (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'welcome') {
          this.playerId = msg.playerId;
          saveSession({ playerId: this.playerId });
        }
        this.emit(msg.type, msg);
        this.emit('message', msg);
      });

      this.ws.addEventListener('close', () => {
        this.connected = false;
        this.emit('close');
        setTimeout(() => this.connect().catch(() => {}), 1500);
      });

      this.ws.addEventListener('error', () => reject(new Error('Connessione fallita')));
    });
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== 1) {
      this._queue.push(obj);
      return;
    }
    this.ws.send(JSON.stringify(obj));
  }
}
