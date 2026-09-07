import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';
import { chooseBriscolaMove, chooseTressetteMove, chooseScopaMove } from '../shared/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const TRICK_REVEAL_MS = 1600;
const DRAW_REVEAL_MS = 1800;
const CPU_THINK_MS = 750;

const app = express();
const rooms = new RoomManager();

app.use(express.json());
app.use('/shared', express.static(path.join(ROOT, 'shared')));
app.use('/cards', express.static(path.join(ROOT, 'cards')));
app.use(express.static(path.join(ROOT, 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.rooms.size });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/** playerId -> ws */
const sockets = new Map();

wss.on('connection', (ws) => {
  ws.playerId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return send(ws, { type: 'error', message: 'Messaggio non valido' });
    }
    try {
      handleMessage(ws, msg);
    } catch (err) {
      send(ws, { type: 'error', message: err.message || 'Errore' });
    }
  });

  ws.on('close', () => {
    if (!ws.playerId) return;
    sockets.delete(ws.playerId);
    const room = rooms.setDisconnected(ws.playerId);
    if (room) broadcastRoom(room);
  });
});

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'hello':
      return onHello(ws, msg);
    case 'createRoom':
      return onCreate(ws, msg);
    case 'joinRoom':
      return onJoin(ws, msg);
    case 'reconnect':
      return onReconnect(ws, msg);
    case 'leaveRoom':
      return onLeave(ws);
    case 'fillCpu':
      return onFillCpu(ws);
    case 'startGame':
      return onStart(ws);
    case 'playCard':
      return onPlay(ws, msg);
    case 'setSignal':
      return onSignal(ws, msg);
    case 'draw':
      return onDraw(ws);
    case 'rematch':
      return onRematch(ws);
    case 'ping':
      return send(ws, { type: 'pong' });
    default:
      throw new Error('Comando sconosciuto');
  }
}

function bindSocket(ws, playerId) {
  ws.playerId = playerId;
  const prev = sockets.get(playerId);
  if (prev && prev !== ws) {
    try {
      prev.close();
    } catch {
      /* ignore */
    }
  }
  sockets.set(playerId, ws);
}

function onHello(ws, msg) {
  const playerId = String(msg.playerId || randomId());
  bindSocket(ws, playerId);
  send(ws, { type: 'welcome', playerId });
}

function onCreate(ws, msg) {
  ensurePlayer(ws);
  const room = rooms.createRoom({
    gameType: msg.gameType || 'briscola',
    playerCount: Number(msg.playerCount) || 2,
    nickname: msg.nickname,
    playerId: ws.playerId,
  });
  send(ws, { type: 'roomUpdated', room: rooms.lobbyView(room), you: seatOf(room, ws.playerId) });
  broadcastRoom(room);
}

function onJoin(ws, msg) {
  ensurePlayer(ws);
  const room = rooms.joinRoom({
    code: msg.code,
    nickname: msg.nickname,
    playerId: ws.playerId,
    seatIndex: msg.seatIndex,
  });
  send(ws, { type: 'roomUpdated', room: rooms.lobbyView(room), you: seatOf(room, ws.playerId) });
  broadcastRoom(room);
  if (room.phase === 'playing' || room.phase === 'finished') {
    pushGameState(room);
  }
}

function onReconnect(ws, msg) {
  ensurePlayer(ws);
  const room = rooms.reconnect({ code: msg.code, playerId: ws.playerId });
  if (!room) throw new Error('Impossibile riconnettersi');
  send(ws, { type: 'roomUpdated', room: rooms.lobbyView(room), you: seatOf(room, ws.playerId) });
  broadcastRoom(room);
  if (room.game) {
    pushGameState(room);
    afterState(room);
  }
}

function onLeave(ws) {
  ensurePlayer(ws);
  const room = rooms.leaveSeat(ws.playerId);
  send(ws, { type: 'left' });
  if (room) broadcastRoom(room);
}

function onFillCpu(ws) {
  ensurePlayer(ws);
  const room = rooms.fillCpu(ws.playerId);
  broadcastRoom(room);
}

function onStart(ws) {
  ensurePlayer(ws);
  const room = rooms.startGame(ws.playerId);
  broadcastRoom(room);
  pushGameState(room);
  afterState(room);
}

function onPlay(ws, msg) {
  ensurePlayer(ws);
  const cardId = Number(msg.cardId);
  let extra = msg.signal || null;
  if (msg.tableCardIds || msg.jollyValue != null) {
    extra = {
      tableCardIds: Array.isArray(msg.tableCardIds) ? msg.tableCardIds.map(Number) : [],
      jollyValue: msg.jollyValue != null ? Number(msg.jollyValue) : null,
    };
  }
  const room = rooms.playCard(ws.playerId, cardId, extra);
  pushGameState(room);
  afterState(room);
}

function onSignal(ws, msg) {
  ensurePlayer(ws);
  const room = rooms.setSignal(ws.playerId, msg.signal || null);
  pushGameState(room);
}

function onDraw(ws) {
  ensurePlayer(ws);
  const room = rooms.draw(ws.playerId);
  pushGameState(room);
  afterState(room);
}

function onRematch(ws) {
  ensurePlayer(ws);
  const room = rooms.rematch(ws.playerId);
  room.phase = 'playing';
  broadcastRoom(room);
  pushGameState(room);
  afterState(room);
}

function afterState(room) {
  maybeScheduleTrick(room);
  maybeScheduleDrawReveal(room);
  maybeScheduleCpu(room);
}

function maybeScheduleTrick(room) {
  if (!room.game || room.game.phase !== 'showingTrick') return;
  if (room.trickTimer) clearTimeout(room.trickTimer);
  room.trickTimer = setTimeout(() => {
    rooms.collectTrick(room.code);
    pushGameState(room);
    if (room.phase === 'finished') broadcastRoom(room);
    afterState(room);
  }, TRICK_REVEAL_MS);
}

function maybeScheduleDrawReveal(room) {
  if (!room.game || room.game.phase !== 'showingDraw') return;
  if (room.drawTimer) clearTimeout(room.drawTimer);
  room.drawTimer = setTimeout(() => {
    rooms.acknowledgeDraws(room.code);
    pushGameState(room);
    afterState(room);
  }, DRAW_REVEAL_MS);
}

function maybeScheduleCpu(room) {
  if (!room.game || room.phase === 'finished' || room.game.handOver) return;
  if (room.cpuTimer) clearTimeout(room.cpuTimer);

  const game = room.game;

  // Briscola: CPU pesca
  if (game.phase === 'drawing' && typeof game.canDraw === 'function') {
    const drawer = game.nextDrawer;
    const seat = room.seats[drawer];
    if (seat?.isCpu && game.canDraw(drawer)) {
      room.cpuTimer = setTimeout(() => {
        game.draw(drawer);
        room.updatedAt = Date.now();
        pushGameState(room);
        afterState(room);
      }, CPU_THINK_MS);
    }
    return;
  }

  if (game.phase !== 'playing') return;
  const seat = room.seats[game.currentPlayer];
  if (!seat?.isCpu) return;

  room.cpuTimer = setTimeout(() => {
    runCpuTurn(room);
  }, CPU_THINK_MS);
}

function runCpuTurn(room) {
  const game = room.game;
  if (!game || game.phase !== 'playing') return;
  const player = game.currentPlayer;
  const seat = room.seats[player];
  if (!seat?.isCpu) return;

  const hand = game.hands[player];
  let move = null;
  if (room.gameType === 'tressette') {
    move = chooseTressetteMove(hand, game.trick, game.leadSuit, {
      seat: player,
      playerCount: game.playerCount || room.playerCount || 4,
    });
    if (!move) return;
    rooms.playCpuCard(room, player, move.id);
  } else if (room.gameType === 'scopa') {
    move = chooseScopaMove(hand, game.table);
    if (!move) return;
    rooms.playCpuCard(room, player, move.cardId, {
      tableCardIds: move.tableCardIds,
      jollyValue: move.jollyValue,
    });
  } else {
    move = chooseBriscolaMove(hand, game.trick, game.trump, {
      isFirst: game.trick.length === 0,
      seat: player,
      playerCount: game.playerCount || room.playerCount || 2,
    });
    if (!move) return;
    rooms.playCpuCard(room, player, move.id);
  }
  pushGameState(room);
  afterState(room);
}

function pushGameState(room) {
  for (const seat of room.seats) {
    if (!seat.playerId || seat.isCpu) continue;
    const sock = sockets.get(seat.playerId);
    if (!sock || sock.readyState !== 1) continue;
    const view = room.game.getViewFor(seat.seatIndex);
    send(sock, {
      type: 'stateUpdate',
      room: rooms.lobbyView(room),
      you: {
        seatIndex: seat.seatIndex,
        nickname: seat.nickname,
        isHost: room.hostId === seat.playerId,
      },
      state: view,
    });
  }
}

function broadcastRoom(room) {
  const payload = rooms.lobbyView(room);
  for (const seat of room.seats) {
    if (!seat.playerId || seat.isCpu) continue;
    const sock = sockets.get(seat.playerId);
    if (!sock || sock.readyState !== 1) continue;
    send(sock, {
      type: 'roomUpdated',
      room: payload,
      you: {
        seatIndex: seat.seatIndex,
        nickname: seat.nickname,
        isHost: room.hostId === seat.playerId,
      },
    });
  }
}

function seatOf(room, playerId) {
  const seat = room.seats.find((s) => s.playerId === playerId);
  if (!seat) return null;
  return {
    seatIndex: seat.seatIndex,
    nickname: seat.nickname,
    isHost: room.hostId === playerId,
  };
}

function ensurePlayer(ws) {
  if (!ws.playerId) throw new Error('Invia prima hello');
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function randomId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

setInterval(() => rooms.cleanup(), 60_000);

server.listen(PORT, () => {
  console.log(`Briscola online su http://localhost:${PORT}`);
});
