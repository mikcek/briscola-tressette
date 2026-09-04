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
    const type = gameType === 'tressette' ? 'tressette' : 'briscola';
    const seatsNeeded = Number(playerCount) === 4 ? 4 : 2;

    const room = {
      code: this.generateCode(),
      gameType: type,
      playerCount: seatsNeeded,
      hostId: playerId,
      phase: 'lobby',
      seats: Array.from({ length: seatsNeeded }, (_, i) => ({
        seatIndex: i,
        playerId: null,
        nickname: null,
        connected: false,
        isCpu: false,
      })),
      game: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      trickTimer: null,
      drawTimer: null,
      cpuTimer: null,
    };

    room.seats[0] = {
      seatIndex: 0,
      playerId,
      nickname: sanitizeName(nickname),
      connected: true,
      isCpu: false,
    };
    this.rooms.set(room.code, room);
    this.byPlayer.set(playerId, room.code);
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
    if (seat.isCpu) throw new Error('Posto occupato dalla CPU');

    seat.playerId = playerId;
    seat.nickname = sanitizeName(nickname);
    seat.connected = true;
    seat.isCpu = false;
    this.byPlayer.set(playerId, room.code);
    room.updatedAt = Date.now();
    return room;
  }

  fillCpu(playerId) {
    const room = this.findRoomByPlayer(playerId);
    if (!room) throw new Error('Stanza non trovata');
    if (room.hostId !== playerId) throw new Error('Solo l\'host può riempire con CPU');
    if (room.phase !== 'lobby') throw new Error('La partita è già iniziata');

    for (const seat of room.seats) {
      if (seat.playerId) continue;
      seat.isCpu = true;
      seat.playerId = `cpu_${room.code}_${seat.seatIndex}`;
      seat.nickname = `CPU ${seat.seatIndex + 1}`;
      seat.connected = true;
    }
    room.updatedAt = Date.now();
    return room;
  }

  reconnect({ code, playerId }) {
    const room = this.getRoom(code);
    if (!room) return null;
    const seat = room.seats.find((s) => s.playerId === playerId && !s.isCpu);
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
    if (seat && !seat.isCpu) seat.connected = false;
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
      seat.isCpu = false;
    } else if (seat) {
      seat.connected = false;
    }

    this.byPlayer.delete(playerId);

    if (room.hostId === playerId && room.phase === 'lobby') {
      const nextHost = room.seats.find((s) => s.playerId && !s.isCpu);
      room.hostId = nextHost ? nextHost.playerId : null;
    }

    const humansLeft = room.seats.some((s) => s.playerId && !s.isCpu);
    if (!humansLeft) {
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
      throw new Error('Riempi i posti liberi (giocatori o CPU)');
    }

    const names = room.seats.map((s) => s.nickname || `P${s.seatIndex + 1}`);
    if (room.gameType === 'tressette') {
      room.game = new TressetteGame(names, { playerCount: room.playerCount });
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

  playCard(playerId, cardId, signal = null) {
    const { room, seat } = this.requirePlayingSeat(playerId);
    if (seat.isCpu) throw new Error('Posto CPU');
    const ok =
      room.gameType === 'tressette'
        ? room.game.playCard(seat.seatIndex, cardId, signal)
        : room.game.playCard(seat.seatIndex, cardId);
    if (!ok) throw new Error('Mossa non valida');
    room.updatedAt = Date.now();
    return room;
  }

  playCpuCard(room, seatIndex, cardId, signal = null) {
    if (!room?.game) return false;
    const ok =
      room.gameType === 'tressette'
        ? room.game.playCard(seatIndex, cardId, signal)
        : room.game.playCard(seatIndex, cardId);
    if (ok) room.updatedAt = Date.now();
    return ok;
  }

  setSignal(playerId, signal) {
    const { room, seat } = this.requirePlayingSeat(playerId);
    if (room.gameType !== 'tressette') throw new Error('Segnali solo nel Tressette');
    if (typeof room.game.setPendingSignal !== 'function') {
      throw new Error('Segnali non supportati');
    }
    if (room.game.currentPlayer !== seat.seatIndex) {
      throw new Error('Non è il tuo turno');
    }
    room.game.setPendingSignal(signal);
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

  acknowledgeDraws(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room?.game) return null;
    if (room.game.phase !== 'showingDraw') return room;
    room.game.acknowledgeDraws();
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
        playerId: s.isCpu ? null : s.playerId,
        isCpu: !!s.isCpu,
      })),
    };
  }

  deleteRoom(code) {
    const room = this.getRoom(code);
    if (!room) return;
    if (room.trickTimer) clearTimeout(room.trickTimer);
    if (room.drawTimer) clearTimeout(room.drawTimer);
    if (room.cpuTimer) clearTimeout(room.cpuTimer);
    for (const seat of room.seats) {
      if (seat.playerId && !seat.isCpu) this.byPlayer.delete(seat.playerId);
    }
    this.rooms.delete(room.code);
  }

  cleanup() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      const humans = room.seats.filter((s) => s.playerId && !s.isCpu);
      const empty = humans.every((s) => !s.connected);
      const stale = now - room.updatedAt > (empty || humans.length === 0 ? EMPTY_TTL_MS : ROOM_TTL_MS);
      if (stale) this.deleteRoom(room.code);
    }
  }
}

function sanitizeName(name) {
  const n = String(name || 'Giocatore').trim().slice(0, 16);
  return n || 'Giocatore';
}
