import {
  createDeck,
  shuffle,
  resetCardIds,
  publicCard,
  isSettebello,
  scopaCaptureValue,
  computePrimiera,
  detectBuongioco,
  getScopaLegalCaptures,
} from './cards.js';

/**
 * Scopa (regolamento_scopa_completo.md) — 2 o 4 giocatori, vittoria a 21.
 * Varianti: Settebello jolly, Buongioco, Re Bello, Asso Bello.
 */
export class ScopaGame {
  constructor(playerNames = null, options = {}) {
    const count = options.playerCount === 4 ? 4 : 2;
    this.playerCount = count;
    this.playerNames =
      playerNames ||
      (count === 2 ? ['Giocatore 1', 'Giocatore 2'] : ['Sud', 'Est', 'Nord', 'Ovest']);
    this.targetScore = options.targetScore || 21;
    this.reset();
  }

  reset() {
    resetCardIds();
    this.deck = [];
    this.hands = Array.from({ length: this.playerCount }, () => []);
    this.table = [];
    this.captured = Array.from({ length: this.playerCount }, () => []);
    this.scopes = Array.from({ length: this.playerCount }, () => 0);
    this.teamScopes = [0, 0];
    this.scores = [0, 0];
    this.handBreakdown = null;
    this.buongiocoLog = [];
    this.buongiocoPoints = [0, 0];
    this.currentPlayer = 0;
    this.dealer = this.playerCount - 1;
    this.lastCaptureSeat = null;
    this.phase = 'idle';
    this.message = '';
    this.handOver = false;
    this.gameOver = false;
    this.winner = null;
    this.lastCapture = null;
    this.pendingDealRound = 0;
  }

  getTeam(player) {
    return player % 2;
  }

  nextSeat(seat) {
    return (seat + 1) % this.playerCount;
  }

  firstHand() {
    return this.nextSeat(this.dealer);
  }

  teamLabel(team) {
    if (this.playerCount === 2) {
      return this.playerNames[team] || (team === 0 ? 'A' : 'B');
    }
    return team === 0 ? 'Squadra A' : 'Squadra B';
  }

  startGame() {
    const dealer = this.dealer ?? this.playerCount - 1;
    const names = [...this.playerNames];
    const count = this.playerCount;
    const target = this.targetScore;
    this.reset();
    this.playerCount = count;
    this.playerNames = names;
    this.dealer = dealer;
    this.targetScore = target;
    this.scores = [0, 0];
    this.startHand();
  }

  startHand() {
    resetCardIds();
    this.hands = Array.from({ length: this.playerCount }, () => []);
    this.table = [];
    this.captured = Array.from({ length: this.playerCount }, () => []);
    this.scopes = Array.from({ length: this.playerCount }, () => 0);
    this.teamScopes = [0, 0];
    this.handBreakdown = null;
    this.buongiocoLog = [];
    this.buongiocoPoints = [0, 0];
    this.lastCaptureSeat = null;
    this.lastCapture = null;
    this.handOver = false;
    this.gameOver = false;
    this.winner = null;
    this.phase = 'playing';
    this.pendingDealRound = 0;

    this.dealInitial();
    this.applyBuongioco();
    if (this.handOver) return;

    this.currentPlayer = this.firstHand();
    const bg =
      this.buongiocoLog.length > 0 ? ` · ${this.buongiocoLog.join('; ')}` : '';
    this.message = `Tocca a ${this.playerNames[this.currentPlayer]}${bg}`;
  }

  dealInitial() {
    let attempts = 0;
    while (attempts < 30) {
      attempts += 1;
      this.deck = shuffle(createDeck());
      this.hands = Array.from({ length: this.playerCount }, () => []);
      this.table = [];

      let seat = this.firstHand();
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < this.playerCount; i++) {
          this.hands[seat].push(this.deck.pop());
          seat = this.nextSeat(seat);
        }
      }
      for (let i = 0; i < 4; i++) {
        this.table.push(this.deck.pop());
      }

      const kings = this.table.filter((c) => c.rank === 're').length;
      if (kings < 3) return;
    }
  }

  dealRound() {
    if (this.deck.length < this.playerCount * 3) return false;
    let seat = this.firstHand();
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < this.playerCount; i++) {
        if (this.deck.length === 0) return true;
        this.hands[seat].push(this.deck.pop());
        seat = this.nextSeat(seat);
      }
    }
    this.pendingDealRound += 1;
    return true;
  }

  applyBuongioco() {
    const first = this.firstHand();
    const candidates = [];
    for (let p = 0; p < this.playerCount; p++) {
      const bg = detectBuongioco(this.hands[p]);
      if (bg.points > 0) candidates.push({ player: p, ...bg });
    }
    if (candidates.length === 0) return;

    let awarded;
    if (candidates.length === 1) {
      awarded = candidates[0];
    } else {
      // Conflitto: solo il primo di mano
      awarded = candidates.find((c) => c.player === first) || null;
      if (!awarded) {
        this.buongiocoLog.push('Buongioco annullati (conflitto, non primo di mano)');
        return;
      }
      this.buongiocoLog.push(
        `Buongioco in conflitto: vale solo ${this.playerNames[first]}`
      );
    }

    const team = this.getTeam(awarded.player);
    this.buongiocoPoints[team] += awarded.points;
    this.scores[team] += awarded.points;
    this.buongiocoLog.push(
      `${this.playerNames[awarded.player]}: ${awarded.label} (+${awarded.points})`
    );

    if (this.scores[0] >= this.targetScore || this.scores[1] >= this.targetScore) {
      this.finishByScore('buongioco');
    }
  }

  finishByScore(reason) {
    this.handOver = true;
    this.phase = 'handOver';
    if (this.scores[0] === this.scores[1]) {
      this.gameOver = false;
      this.winner = null;
      this.message = `Pareggio ${this.scores[0]}-${this.scores[1]} · si continua`;
      return;
    }
    this.gameOver = true;
    this.winner = this.scores[0] > this.scores[1] ? 0 : 1;
    this.message = `${this.teamLabel(this.winner)} vince ${this.scores[0]}-${this.scores[1]} (${reason})`;
  }

  getLegalCaptures(card, jollyValue = null) {
    return getScopaLegalCaptures(this.table, card, jollyValue);
  }

  canPlay(player, cardId) {
    if (this.phase !== 'playing' || this.handOver || player !== this.currentPlayer) {
      return false;
    }
    return this.hands[player].some((c) => c.id === cardId);
  }

  /**
   * @param {number} player
   * @param {number} cardId
   * @param {{ tableCardIds?: number[], jollyValue?: number|null }} [opts]
   */
  playCard(player, cardId, opts = {}) {
    if (this.phase !== 'playing' || this.handOver || player !== this.currentPlayer) {
      return false;
    }
    const hand = this.hands[player];
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx < 0) return false;

    const card = hand[idx];
    const tableIds = opts.tableCardIds || null;
    const jollyValue = opts.jollyValue ?? null;

    const { captures } = this.getLegalCaptures(
      card,
      isSettebello(card) ? jollyValue : null
    );

    let chosen = null;
    if (captures.length === 0) {
      if (tableIds && tableIds.length) return false;
      hand.splice(idx, 1);
      this.table.push(card);
      this.lastCapture = { player, card: publicCard(card), taken: [], scopa: false, drop: true };
      this.message = `${this.playerNames[player]} posa`;
      this.afterPlay(player);
      return true;
    }

    if (tableIds && tableIds.length) {
      const want = [...tableIds].map(Number).sort((a, b) => a - b).join(',');
      chosen = captures.find(
        (cap) =>
          cap
            .map((c) => c.id)
            .sort((a, b) => a - b)
            .join(',') === want
      );
      if (!chosen) return false;
    } else if (captures.length === 1) {
      chosen = captures[0];
    } else {
      // Più prese possibili: il client deve indicare tableCardIds (e jollyValue se serve)
      return false;
    }

    hand.splice(idx, 1);
    const takenIds = new Set(chosen.map((c) => c.id));
    const taken = this.table.filter((c) => takenIds.has(c.id));
    this.table = this.table.filter((c) => !takenIds.has(c.id));

    this.captured[player].push(card, ...taken);
    this.lastCaptureSeat = player;

    let scopa = false;
    if (this.table.length === 0) {
      scopa = true;
      this.scopes[player] += 1;
      this.teamScopes[this.getTeam(player)] += 1;
    }

    this.lastCapture = {
      player,
      card: publicCard(card),
      taken: taken.map(publicCard),
      scopa,
      drop: false,
    };
    this.message =
      `${this.playerNames[player]} prende` + (scopa ? ' · SCOPA!' : '');

    this.afterPlay(player);
    return true;
  }

  afterPlay(player) {
    if (this.hands.every((h) => h.length === 0)) {
      if (this.deck.length >= this.playerCount * 3) {
        this.dealRound();
        this.currentPlayer = this.firstHand();
        this.message += ` · Nuove carte · Tocca a ${this.playerNames[this.currentPlayer]}`;
        return;
      }
      if (this.deck.length > 0) {
        // Carte residue insufficienti per un giro completo: non dovrebbe succedere con 40 carte
        // Distribuisci quel che resta equamente a partire dal primo di mano
        let seat = this.firstHand();
        while (this.deck.length > 0) {
          this.hands[seat].push(this.deck.pop());
          seat = this.nextSeat(seat);
        }
        this.currentPlayer = this.firstHand();
        return;
      }
      this.endHand();
      return;
    }

    this.currentPlayer = this.nextSeat(player);
    // Salta chi non ha carte (durante ridistribuzione parziale)
    let guard = 0;
    while (this.hands[this.currentPlayer].length === 0 && guard++ < this.playerCount) {
      this.currentPlayer = this.nextSeat(this.currentPlayer);
    }
    this.message =
      (this.lastCapture?.scopa ? 'Scopa! · ' : '') +
      `Tocca a ${this.playerNames[this.currentPlayer]}`;
  }

  endHand() {
    // Residui al tavolo → ultima presa (mai scopa)
    if (this.table.length && this.lastCaptureSeat != null) {
      this.captured[this.lastCaptureSeat].push(...this.table);
      this.table = [];
    }

    const teamCards = [[], []];
    for (let p = 0; p < this.playerCount; p++) {
      teamCards[this.getTeam(p)].push(...this.captured[p]);
    }

    const breakdown = {
      scopes: [...this.teamScopes],
      buongioco: [...this.buongiocoPoints],
      carte: [0, 0],
      denari: [0, 0],
      settebello: [0, 0],
      primiera: [0, 0],
      rebello: [0, 0],
      assobello: [0, 0],
      mazzo: [0, 0],
    };

    // Scope già contate in teamScopes ma non ancora in scores (solo buongioco già aggiunto)
    breakdown.scopes = [...this.teamScopes];

    const countA = teamCards[0].length;
    const countB = teamCards[1].length;
    if (countA > countB && countA >= 21) breakdown.carte[0] = 1;
    else if (countB > countA && countB >= 21) breakdown.carte[1] = 1;

    const denA = teamCards[0].filter((c) => c.suit === 'denari').length;
    const denB = teamCards[1].filter((c) => c.suit === 'denari').length;
    if (denA > denB && denA >= 6) breakdown.denari[0] = 1;
    else if (denB > denA && denB >= 6) breakdown.denari[1] = 1;

    const hasSette = (cards) => cards.some(isSettebello);
    if (hasSette(teamCards[0])) breakdown.settebello[0] = 1;
    else if (hasSette(teamCards[1])) breakdown.settebello[1] = 1;

    const p0 = computePrimiera(teamCards[0]);
    const p1 = computePrimiera(teamCards[1]);
    if (p0.complete && p1.complete) {
      if (p0.score > p1.score) breakdown.primiera[0] = 1;
      else if (p1.score > p0.score) breakdown.primiera[1] = 1;
    } else if (p0.complete && !p1.complete) breakdown.primiera[0] = 1;
    else if (p1.complete && !p0.complete) breakdown.primiera[1] = 1;

    const hasReBello = (cards) => cards.some((c) => c.suit === 'denari' && c.rank === 're');
    const hasAssoBello = (cards) => cards.some((c) => c.suit === 'denari' && c.rank === 'asso');
    if (hasReBello(teamCards[0])) breakdown.rebello[0] = 1;
    else if (hasReBello(teamCards[1])) breakdown.rebello[1] = 1;
    if (hasAssoBello(teamCards[0])) breakdown.assobello[0] = 1;
    else if (hasAssoBello(teamCards[1])) breakdown.assobello[1] = 1;

    for (const key of ['carte', 'denari', 'settebello', 'primiera', 'rebello', 'assobello']) {
      breakdown.mazzo[0] += breakdown[key][0];
      breakdown.mazzo[1] += breakdown[key][1];
    }

    const handPts = [
      breakdown.scopes[0] + breakdown.mazzo[0],
      breakdown.scopes[1] + breakdown.mazzo[1],
    ];
    // Buongioco già in scores: aggiungi solo scope + mazzo
    this.scores[0] += handPts[0];
    this.scores[1] += handPts[1];

    this.handBreakdown = {
      ...breakdown,
      handPts,
      cardCounts: [countA, countB],
      denariCounts: [denA, denB],
      primieraScores: [p0.score, p1.score],
    };

    this.handOver = true;
    this.phase = 'handOver';

    const detail = `Scope ${breakdown.scopes[0]}-${breakdown.scopes[1]} · Mazzo ${breakdown.mazzo[0]}-${breakdown.mazzo[1]} · Tot ${this.scores[0]}-${this.scores[1]}`;

    if (this.scores[0] >= this.targetScore || this.scores[1] >= this.targetScore) {
      if (this.scores[0] === this.scores[1]) {
        this.gameOver = false;
        this.winner = null;
        this.message = `Pareggio a ${this.scores[0]} · si continua · ${detail}`;
      } else {
        this.gameOver = true;
        this.winner = this.scores[0] > this.scores[1] ? 0 : 1;
        this.message = `${this.teamLabel(this.winner)} vince ${this.scores[0]}-${this.scores[1]} · ${detail}`;
      }
    } else {
      this.message = `Mano finita · ${detail} (a ${this.targetScore})`;
    }

    this.dealer = this.nextSeat(this.dealer);
    return this.handBreakdown;
  }

  getState() {
    return {
      gameType: 'scopa',
      playerCount: this.playerCount,
      playerNames: [...this.playerNames],
      hands: this.hands.map((h) => h.map(publicCard)),
      handCounts: this.hands.map((h) => h.length),
      table: this.table.map(publicCard),
      capturedCounts: this.captured.map((c) => c.length),
      scopes: [...this.scopes],
      teamScopes: [...this.teamScopes],
      scores: [...this.scores],
      handBreakdown: this.handBreakdown,
      buongiocoLog: [...this.buongiocoLog],
      buongiocoPoints: [...this.buongiocoPoints],
      currentPlayer: this.currentPlayer,
      dealer: this.dealer,
      phase: this.phase,
      message: this.message,
      handOver: this.handOver,
      gameOver: this.gameOver,
      winner: this.winner,
      lastCapture: this.lastCapture,
      lastCaptureSeat: this.lastCaptureSeat,
      targetScore: this.targetScore,
      deckRemaining: this.deck.length,
      trick: [],
      trump: null,
      trumpCard: null,
      nextDrawer: null,
      faceDownCount: this.deck.length,
      canDraw: false,
      leadSuit: null,
    };
  }

  getViewFor(seatIndex) {
    const full = this.getState();
    const hand = this.hands[seatIndex] || [];
    return {
      ...full,
      mySeat: seatIndex,
      hands: full.hands.map((h, i) => (i === seatIndex ? h : [])),
      canPlay: this.phase === 'playing' && this.currentPlayer === seatIndex,
      playableCardIds:
        this.phase === 'playing' && this.currentPlayer === seatIndex
          ? hand.map((c) => c.id)
          : [],
      legalCapturesByCard: Object.fromEntries(
        hand.map((c) => {
          const { captures } = this.getLegalCaptures(c);
          return [
            c.id,
            captures.map((cap) => cap.map((x) => x.id)),
          ];
        })
      ),
    };
  }
}
