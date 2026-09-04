import {
  createDeck,
  shuffle,
  compareTressette,
  sumTressettePoints,
  detectAccusi,
  resetCardIds,
  publicCard,
  SUIT_NAMES,
} from './cards.js';

export const TRESSETTE_SIGNALS = ['busso', 'volo', 'striscio'];

const SIGNAL_LABELS = {
  busso: 'Busso',
  volo: 'Volo',
  striscio: 'Striscio',
};

/**
 * Tressette
 * - 4 giocatori: squadre 0+2 vs 1+3, 10 carte, niente pesca (regolamento ufficiale)
 * - 2 giocatori: 10 carte a testa, pesca dal mazzo dopo ogni presa con esibizione
 *   della carta pescata all'avversario; stessa gerarchia/punteggio; vittoria a 21
 */
export class TressetteGame {
  constructor(playerNames = null, options = {}) {
    const count = options.playerCount === 2 ? 2 : 4;
    this.playerCount = count;
    this.playerNames =
      playerNames ||
      (count === 2 ? ['Giocatore 1', 'Giocatore 2'] : ['Sud', 'Est', 'Nord', 'Ovest']);
    this.targetScore = options.targetScore || 21;
    this.enableAccusi = options.enableAccusi !== false;
    this.reset();
  }

  reset() {
    resetCardIds();
    this.deck = [];
    this.hands = Array.from({ length: this.playerCount }, () => []);
    this.trick = [];
    this.captured = Array.from({ length: this.playerCount }, () => []);
    this.currentPlayer = 0;
    this.leadSuit = null;
    this.scores = [0, 0];
    this.handPoints = [0, 0];
    this.accusoPoints = [0, 0];
    this.accusoLog = [];
    this.phase = 'idle';
    this.message = '';
    this.handOver = false;
    this.gameOver = false;
    this.winner = null;
    this.trickWinner = null;
    this.dealer = this.playerCount - 1;
    this.tricksPlayed = 0;
    this.pendingSignal = null;
    this.revealedDraws = [];
    this._postDrawStarter = null;
    this._lastTrickWinner = null;
  }

  getTeam(player) {
    return player % 2;
  }

  nextSeat(seat) {
    return (seat + 1) % this.playerCount;
  }

  teamLabel(team) {
    if (this.playerCount === 2) {
      return this.playerNames[team] || (team === 0 ? 'A' : 'B');
    }
    return team === 0 ? 'Squadra A' : 'Squadra B';
  }

  startGame() {
    const dealer = this.dealer ?? this.playerCount - 1;
    const target = this.targetScore;
    const accusi = this.enableAccusi;
    const names = [...this.playerNames];
    const count = this.playerCount;
    this.reset();
    this.playerCount = count;
    this.playerNames = names;
    this.dealer = dealer;
    this.targetScore = target;
    this.enableAccusi = accusi;
    this.scores = [0, 0];
    this.startHand();
  }

  startHand() {
    resetCardIds();
    this.deck = shuffle(createDeck());
    this.hands = Array.from({ length: this.playerCount }, () => []);
    this.trick = [];
    this.captured = Array.from({ length: this.playerCount }, () => []);
    this.leadSuit = null;
    this.handOver = false;
    this.gameOver = false;
    this.winner = null;
    this.trickWinner = null;
    this.phase = 'playing';
    this.handPoints = [0, 0];
    this.accusoPoints = [0, 0];
    this.accusoLog = [];
    this.tricksPlayed = 0;
    this.pendingSignal = null;
    this.revealedDraws = [];
    this._postDrawStarter = null;
    this._lastTrickWinner = null;

    const cardsEach = 10;
    let seat = this.nextSeat(this.dealer);
    for (let i = 0; i < cardsEach * this.playerCount; i++) {
      this.hands[seat].push(this.deck.pop());
      seat = this.nextSeat(seat);
    }
    // A 4: mazzo vuoto. A 2: restano 20 carte per la pesca.

    if (this.enableAccusi) {
      this.applyAccusi();
    }

    if (this.scores[0] >= this.targetScore || this.scores[1] >= this.targetScore) {
      this.handOver = true;
      this.phase = 'handOver';
      this.gameOver = true;
      this.winner = this.scores[0] >= this.targetScore ? 0 : 1;
      this.message = `${this.teamLabel(this.winner)} vince ${this.scores[0]}-${this.scores[1]} (accusi)`;
      return;
    }

    this.currentPlayer = this.nextSeat(this.dealer);
    const accusoMsg =
      this.accusoLog.length > 0 ? ` · Accusi: ${this.accusoLog.join('; ')}` : '';
    this.message = `Tocca a ${this.playerNames[this.currentPlayer]}${accusoMsg}`;
  }

  applyAccusi() {
    for (let p = 0; p < this.playerCount; p++) {
      const { points, labels } = detectAccusi(this.hands[p]);
      if (points <= 0) continue;
      const team = this.getTeam(p);
      this.accusoPoints[team] += points;
      this.scores[team] += points;
      for (const label of labels) {
        this.accusoLog.push(`${this.playerNames[p]}: ${label}`);
      }
    }
  }

  getPlayableCards(player) {
    if (this.trick.length === 0) return this.hands[player];
    const hasLead = this.hands[player].some((c) => c.suit === this.leadSuit);
    if (hasLead) return this.hands[player].filter((c) => c.suit === this.leadSuit);
    return this.hands[player];
  }

  canPlay(player, cardId) {
    if (this.phase !== 'playing' || this.handOver || player !== this.currentPlayer) {
      return false;
    }
    return this.getPlayableCards(player).some((c) => c.id === cardId);
  }

  setPendingSignal(signal) {
    if (!signal || TRESSETTE_SIGNALS.includes(signal)) {
      this.pendingSignal = signal || null;
      return true;
    }
    return false;
  }

  /**
   * @param {number} player
   * @param {number} cardId
   * @param {string|null} signal busso|volo|striscio
   */
  playCard(player, cardId, signal = null) {
    if (!this.canPlay(player, cardId)) return false;

    const idx = this.hands[player].findIndex((c) => c.id === cardId);
    const card = this.hands[player][idx];
    this.hands[player].splice(idx, 1);

    const sig =
      signal && TRESSETTE_SIGNALS.includes(signal)
        ? signal
        : this.pendingSignal && TRESSETTE_SIGNALS.includes(this.pendingSignal)
          ? this.pendingSignal
          : null;
    this.pendingSignal = null;

    if (this.trick.length === 0) this.leadSuit = card.suit;
    this.trick.push({ player, card, signal: sig });

    let msg = `${this.playerNames[player]} gioca`;
    if (sig) msg += ` (${SIGNAL_LABELS[sig]})`;

    if (this.trick.length === this.playerCount) {
      this.evaluateTrick();
    } else {
      this.currentPlayer = this.nextSeat(player);
      this.message = `${msg} · Tocca a ${this.playerNames[this.currentPlayer]}`;
    }
    return true;
  }

  evaluateTrick() {
    let best = this.trick[0];
    for (let i = 1; i < this.trick.length; i++) {
      if (compareTressette(this.trick[i].card, best.card, this.leadSuit) > 0) {
        best = this.trick[i];
      }
    }
    this.trickWinner = best.player;
    this.phase = 'showingTrick';
    this.currentPlayer = -1;

    const signals = this.trick
      .filter((t) => t.signal)
      .map((t) => `${this.playerNames[t.player]}: ${SIGNAL_LABELS[t.signal]}`)
      .join(', ');
    this.message =
      `${this.playerNames[this.trickWinner]} ha preso` +
      (signals ? ` · ${signals}` : '');
  }

  collectTrick() {
    if (this.phase !== 'showingTrick' || this.trickWinner == null) return false;

    const winner = this.trickWinner;
    for (const entry of this.trick) {
      this.captured[winner].push(entry.card);
    }
    this.trick = [];
    this.leadSuit = null;
    this.trickWinner = null;
    this._lastTrickWinner = winner;
    this.currentPlayer = winner;
    this.tricksPlayed += 1;

    if (this.hands.every((h) => h.length === 0) && this.deck.length === 0) {
      this.endHand();
      return true;
    }

    // 2 giocatori: pesca ed esibizione (vincitore poi perdente)
    if (this.playerCount === 2 && this.deck.length > 0) {
      this.drawAndExhibit(winner);
      return true;
    }

    if (this.hands.every((h) => h.length === 0)) {
      this.endHand();
      return true;
    }

    this.phase = 'playing';
    this.message = `Tocca a ${this.playerNames[winner]}`;
    return true;
  }

  /**
   * Pesca automatica con esibizione: entrambe le carte pescate sono visibili.
   */
  drawAndExhibit(winner) {
    this._postDrawStarter = winner;
    const order = [winner, this.nextSeat(winner)];
    this.revealedDraws = [];
    for (const p of order) {
      if (this.deck.length === 0) break;
      const card = this.deck.pop();
      this.hands[p].push(card);
      this.revealedDraws.push({ player: p, card: publicCard(card) });
    }
    this.phase = 'showingDraw';
    this.currentPlayer = -1;
    this.message = `Pesca ed esibizione · Mazzo: ${this.deck.length}`;
  }

  acknowledgeDraws() {
    if (this.phase !== 'showingDraw') return false;
    this.revealedDraws = [];
    const starter = this._postDrawStarter ?? 0;
    this._postDrawStarter = null;
    this.phase = 'playing';
    this.currentPlayer = starter;
    this.message = `Tocca a ${this.playerNames[this.currentPlayer]}`;
    return true;
  }

  endHand() {
    const cardPoints = [0, 0];
    for (let p = 0; p < this.playerCount; p++) {
      cardPoints[this.getTeam(p)] += sumTressettePoints(this.captured[p]);
    }
    const lastWinner =
      this._lastTrickWinner != null ? this._lastTrickWinner : this.currentPlayer;
    const lastTeam = this.getTeam(Math.max(0, lastWinner));
    cardPoints[lastTeam] += 1;

    this.handPoints = [
      cardPoints[0] + this.accusoPoints[0],
      cardPoints[1] + this.accusoPoints[1],
    ];

    this.scores[0] += cardPoints[0];
    this.scores[1] += cardPoints[1];

    this.handOver = true;
    this.phase = 'handOver';

    if (this.scores[0] >= this.targetScore || this.scores[1] >= this.targetScore) {
      this.gameOver = true;
      if (this.scores[0] === this.scores[1]) {
        this.winner = -1;
        this.message = `Patta ${this.scores[0]}-${this.scores[1]}`;
      } else {
        this.winner = this.scores[0] > this.scores[1] ? 0 : 1;
        this.message = `${this.teamLabel(this.winner)} vince ${this.scores[0]}-${this.scores[1]}`;
      }
    } else {
      const acc =
        this.accusoPoints[0] || this.accusoPoints[1]
          ? ` (accusi A${this.accusoPoints[0]}/B${this.accusoPoints[1]})`
          : '';
      this.message = `Mano: A ${cardPoints[0]} — B ${cardPoints[1]}${acc} · Tot ${this.scores[0]}-${this.scores[1]} (a ${this.targetScore})`;
    }

    this.dealer = this.nextSeat(this.dealer);
    return { points: cardPoints, total: [...this.scores] };
  }

  get deckRemaining() {
    return this.deck.length;
  }

  getState() {
    return {
      gameType: 'tressette',
      playerCount: this.playerCount,
      playerNames: [...this.playerNames],
      hands: this.hands.map((h) => h.map(publicCard)),
      handCounts: this.hands.map((h) => h.length),
      trick: this.trick.map((t) => ({
        player: t.player,
        card: publicCard(t.card),
        signal: t.signal || null,
      })),
      leadSuit: this.leadSuit,
      leadSuitName: this.leadSuit ? SUIT_NAMES[this.leadSuit] : null,
      scores: [...this.scores],
      handPoints: [...this.handPoints],
      accusoPoints: [...this.accusoPoints],
      accusoLog: [...this.accusoLog],
      currentPlayer: this.currentPlayer,
      dealer: this.dealer,
      phase: this.phase,
      message: this.message,
      handOver: this.handOver,
      gameOver: this.gameOver,
      winner: this.winner,
      trickWinner: this.trickWinner,
      tricksPlayed: this.tricksPlayed,
      targetScore: this.targetScore,
      pendingSignal: this.pendingSignal,
      revealedDraws: this.revealedDraws.map((d) => ({
        player: d.player,
        card: d.card,
      })),
      nextDrawer: null,
      deckRemaining: this.deckRemaining,
      faceDownCount: this.deckRemaining,
      trump: null,
      trumpCard: null,
    };
  }

  getViewFor(seatIndex) {
    const full = this.getState();
    return {
      ...full,
      mySeat: seatIndex,
      hands: full.hands.map((h, i) => (i === seatIndex ? h : [])),
      canPlay: this.phase === 'playing' && this.currentPlayer === seatIndex,
      canDraw: false,
      playableCardIds:
        this.phase === 'playing' && this.currentPlayer === seatIndex
          ? this.getPlayableCards(seatIndex).map((c) => c.id)
          : [],
      canSignal: this.phase === 'playing' && this.currentPlayer === seatIndex,
    };
  }
}

export { SIGNAL_LABELS };
