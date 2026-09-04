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
 * Tressette a 4 (squadre 0+2 vs 1+3) — regolamento ufficiale.
 * - 10 carte a testa, niente pesca
 * - Obbligo di rispondere al seme
 * - Gerarchia: 3 > 2 > A > R > C > F > 7 > 6 > 5 > 4
 * - Punti: Asso=1; 3/2/R/C/F=⅓; ultima presa=+1; arrotondamento per difetto
 * - Accusi automatici (Napoletana / Bongioco / Super Bongioco)
 * - Segnali: Busso, Volo, Striscio
 * - Vittoria a 21 (default)
 */
export class TressetteGame {
  constructor(playerNames = null, options = {}) {
    this.playerCount = 4;
    this.playerNames = playerNames || ['Sud', 'Est', 'Nord', 'Ovest'];
    this.targetScore = options.targetScore || 21;
    this.enableAccusi = options.enableAccusi !== false;
    this.reset();
  }

  reset() {
    resetCardIds();
    this.deck = [];
    this.hands = [[], [], [], []];
    this.trick = [];
    this.captured = [[], [], [], []];
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
    this.dealer = 3;
    this.tricksPlayed = 0;
    this.pendingSignal = null;
  }

  getTeam(player) {
    return player % 2;
  }

  nextSeat(seat) {
    return (seat + 1) % 4;
  }

  startGame() {
    const dealer = this.dealer ?? 3;
    const target = this.targetScore;
    const accusi = this.enableAccusi;
    this.reset();
    this.dealer = dealer;
    this.targetScore = target;
    this.enableAccusi = accusi;
    this.scores = [0, 0];
    this.startHand();
  }

  startHand() {
    resetCardIds();
    this.deck = shuffle(createDeck());
    this.hands = [[], [], [], []];
    this.trick = [];
    this.captured = [[], [], [], []];
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

    // Distribuzione antioraria, 10 carte a testa (tutto il mazzo)
    let seat = this.nextSeat(this.dealer);
    for (let i = 0; i < 40; i++) {
      this.hands[seat].push(this.deck.pop());
      seat = this.nextSeat(seat);
    }

    if (this.enableAccusi) {
      this.applyAccusi();
    }

    // Vittoria immediata se gli accusi bastano (raro ma regolamentare)
    if (this.scores[0] >= this.targetScore || this.scores[1] >= this.targetScore) {
      this.handOver = true;
      this.phase = 'handOver';
      this.gameOver = true;
      this.winner = this.scores[0] >= this.targetScore ? 0 : 1;
      this.message =
        this.winner === 0
          ? `Squadra A vince ${this.scores[0]}-${this.scores[1]} (accusi)`
          : `Squadra B vince ${this.scores[0]}-${this.scores[1]} (accusi)`;
      return;
    }

    this.currentPlayer = this.nextSeat(this.dealer);
    const accusoMsg =
      this.accusoLog.length > 0 ? ` · Accusi: ${this.accusoLog.join('; ')}` : '';
    this.message = `Tocca a ${this.playerNames[this.currentPlayer]}${accusoMsg}`;
  }

  applyAccusi() {
    for (let p = 0; p < 4; p++) {
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

    // Segnali solo sul seme giocato (regolamento)
    if (this.trick.length === 0) this.leadSuit = card.suit;
    this.trick.push({ player, card, signal: sig });

    let msg = `${this.playerNames[player]} gioca`;
    if (sig) msg += ` (${SIGNAL_LABELS[sig]})`;

    if (this.trick.length === 4) {
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
    this.currentPlayer = winner;
    this.tricksPlayed += 1;

    if (this.hands.every((h) => h.length === 0)) {
      this.endHand();
      return true;
    }

    this.phase = 'playing';
    this.message = `Tocca a ${this.playerNames[winner]}`;
    return true;
  }

  endHand() {
    // Punti carte (terzi arrotondati per difetto) + 1 ultima presa
    const cardPoints = [0, 0];
    for (let p = 0; p < 4; p++) {
      cardPoints[this.getTeam(p)] += sumTressettePoints(this.captured[p]);
    }
    const lastTeam = this.getTeam(this.currentPlayer);
    cardPoints[lastTeam] += 1;

    this.handPoints = [
      cardPoints[0] + this.accusoPoints[0],
      cardPoints[1] + this.accusoPoints[1],
    ];

    // Accusi già aggiunti a scores all'inizio: aggiungi solo punti mano
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
        this.message =
          this.winner === 0
            ? `Squadra A vince ${this.scores[0]}-${this.scores[1]}`
            : `Squadra B vince ${this.scores[0]}-${this.scores[1]}`;
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

  getState() {
    return {
      gameType: 'tressette',
      playerCount: 4,
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
      nextDrawer: null,
      deckRemaining: 0,
      faceDownCount: 0,
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
