import { randomBytes } from 'crypto';
import { BriscolaGame } from '../shared/briscola.js';
import { TressetteGame } from '../shared/tressette.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 60 * 60 * 1000;
const EMPTY_TTL_MS = 10 * 60 * 1000;

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.byPlayer = new Map(); // playerId -> roomCode
  }

  generateCode() {
    let code = '';
    const bytes = randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    }
    if (this.rooms.has(code)) return this.generateCode();
    return code;
  }

  createRoom({ gameType, playerCount, nickname, playerId }) {
    const code = this.generateCode();
    const seatsNeeded =
      gameType === 'tressette' ? 4 : playerCount === 4 ? 4 : 2;

    const room = {
      code,
      gameType: gameType === 'tressette' ? 'tressette' : 'briscola',
      playerCount: seatsNeeded,
      hostId: playerId,
      phase: 'lobby',
      seats: Array.from({ length: seatsNeeded }, (_, i) => ({
        seatIndex: i,
        playerId: null,
        nickname: null,
        connected: false,
      })),
      game: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      trickTimer: null,
    };

    // Host prende il posto 0
    room.seats[0] = {
      seatIndex: 0,
      playerId,
      nickname: sanitizeName(nickname),
      connected: true,
    };
    this.rooms.set(code, room);
    this.byPlayer.set(playerId, code);
    return room;
  }

  getRoom(code) {
    if (!code) return null;
    return this.rooms.get(String(code).toUpperCase()) || null;
  }

  findRoomByPlayer(playerId) {
    const code = this.byPlayer.get(playerId);
    return code ? this.getRoom(code) : null;
  }

  joinRoom({ code, nickname, playerId, seatIndex }) {
    const room = this.getRoom(code);
    if (!room) throw new Error('Stanza non trovata');
    if (room.phase !== 'lobby') throw new Error('La partita è già iniziata');

    // Rientro stesso player
    const existing = room.seats.find((s) => s.playerId === playerId);
    if (existing) {
      existing.connected = true;
      existing.nickname = sanitizeName(nickname) || existing.nickname;
      this.byPlayer.set(playerId, room.code);
      room.updatedAt = Date.now();
      return room;
    }

    let seat =
      typeof seatIndex === 'number'
        ? room.seats[seatIndex]
        : room.seats.find((s) => !s.playerId);

    if (!seat || seat.playerId) throw new Error('Posto non disponibile');

    seat.playerId = playerId;
    seat.nickname = sanitizeName(nickname);
    seat.connected = true;
    this.byPlayer.set(playerId, room.code);
    room.updatedAt = Date.now();
    return room;
  }

  reconnect({ code, playerId }) {
    const room = this.getRoom(code);
    if (!room) return null;
    const seat = room.seats.find((s) => s.playerId === playerId);
    if (!seat) return null;
    seat.connected = true;
    this.byPlayer.set(playerId, room.code);
    room.updatedAt = Date.now();
    return room;
  }

  setDisconnected(playerId) {
    const room = this.findRoomByPlayer(playerId);
    if (!room) return null;
    const seat = room.seats.find((s) => s.playerId === playerId);
    if (seat) seat.connected = false;
    room.updatedAt = Date.now();
    return room;
  }

  leaveSeat(playerId) {
    const room = this.findRoomByPlayer(playerId);
    if (!room) return null;

    const seat = room.seats.find((s) => s.playerId === playerId);
    if (seat && room.phase === 'lobby') {
      seat.playerId = null;
      seat.nickname = null;
      seat.connected = false;
    } else if (seat) {
      seat.connected = false;
    }

    this.byPlayer.delete(playerId);

    if (room.hostId === playerId && room.phase === 'lobby') {
      const nextHost = room.seats.find((s) => s.playerId);
      room.hostId = nextHost ? nextHost.playerId : null;
    }

    if (room.seats.every((s) => !s.playerId)) {
      this.deleteRoom(room.code);
      return null;
    }

    room.updatedAt = Date.now();
    return room;
  }

  startGame(playerId) {
    const room = this.findRoomByPlayer(playerId);
    if (!room) throw new Error('Stanza non trovata');
    if (room.hostId !== playerId) throw new Error('Solo l\'host può avviare');
    if (room.phase !== 'lobby') throw new Error('Già avviata');
    if (room.seats.some((s) => !s.playerId)) {
      throw new Error('Aspetta che tutti i posti siano occupati');
    }

    const names = room.seats.map((s) => s.nickname || `P${s.seatIndex + 1}`);
    if (room.gameType === 'tressette') {
      room.game = new TressetteGame(names);
    } else {
      room.game = new BriscolaGame(room.playerCount, names);
    }
    room.game.startGame();
    room.phase = 'playing';
    room.updatedAt = Date.now();
    return room;
  }

  rematch(playerId) {
    const room = this.findRoomByPlayer(playerId);
    if (!room) throw new Error('Stanza non trovata');
    if (room.hostId !== playerId) throw new Error('Solo l\'host può rifare');
    if (!room.game) throw new Error('Nessuna partita');

    const names = room.seats.map((s) => s.nickname || `P${s.seatIndex + 1}`);
    room.game.playerNames = names;
    if (room.game.gameOver || room.game.handOver) {
      if (room.gameType === 'tressette' && !room.game.gameOver) {
        room.game.startHand();
      } else {
        room.game.startGame();
      }
    } else {
      room.game.startGame();
    }
    room.phase = 'playing';
    room.updatedAt = Date.now();
    return room;
  }

  playCard(playerId, cardId) {
    const { room, seat } = this.requirePlayingSeat(playerId);
    if (!room.game.playCard(seat.seatIndex, cardId)) {
      throw new Error('Mossa non valida');
    }
    room.updatedAt = Date.now();
    return room;
  }

  draw(playerId) {
    const { room, seat } = this.requirePlayingSeat(playerId);
    if (!room.game.canDraw(seat.seatIndex)) throw new Error('Non puoi pescare ora');
    room.game.draw(seat.seatIndex);
    room.updatedAt = Date.now();
    return room;
  }

  collectTrick(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room?.game) return null;
    if (room.game.phase !== 'showingTrick') return room;
    room.game.collectTrick();
    if (room.game.handOver) room.phase = 'finished';
    room.updatedAt = Date.now();
    return room;
  }

  requirePlayingSeat(playerId) {
    const room = this.findRoomByPlayer(playerId);
    if (!room || !room.game) throw new Error('Nessuna partita attiva');
    const seat = room.seats.find((s) => s.playerId === playerId);
    if (!seat) throw new Error('Non sei in questa stanza');
    return { room, seat };
  }

  lobbyView(room) {
    return {
      code: room.code,
      gameType: room.gameType,
      playerCount: room.playerCount,
      hostId: room.hostId,
      phase: room.phase,
      seats: room.seats.map((s) => ({
        seatIndex: s.seatIndex,
        nickname: s.nickname,
        occupied: !!s.playerId,
        connected: s.connected,
        playerId: s.playerId,
      })),
    };
  }

  deleteRoom(code) {
    const room = this.getRoom(code);
    if (!room) return;
    if (room.trickTimer) clearTimeout(room.trickTimer);
    for (const seat of room.seats) {
      if (seat.playerId) this.byPlayer.delete(seat.playerId);
    }
    this.rooms.delete(room.code);
  }

  cleanup() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      const empty = room.seats.every((s) => !s.connected);
      const stale = now - room.updatedAt > (empty ? EMPTY_TTL_MS : ROOM_TTL_MS);
      if (stale) this.deleteRoom(room.code);
    }
  }
}

function sanitizeName(name) {
  const n = String(name || 'Giocatore').trim().slice(0, 16);
  return n || 'Giocatore';
}
