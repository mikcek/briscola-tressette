import {
  createDeck,
  shuffle,
  compareTressette,
  sumTressettePoints,
  resetCardIds,
  publicCard,
} from './cards.js';

/**
 * Tressette a 4 (squadre 0+2 vs 1+3), regole classiche.
 */
export class TressetteGame {
  constructor(playerNames = null) {
    this.playerCount = 4;
    this.playerNames = playerNames || ['Sud', 'Est', 'Nord', 'Ovest'];
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
    this.phase = 'idle';
    this.message = '';
    this.handOver = false;
    this.gameOver = false;
    this.winner = null;
    this.trickWinner = null;
    this.dealer = 3;
  }

  getTeam(player) {
    return player % 2;
  }

  nextSeat(seat) {
    return (seat + 1) % 4;
  }

  startGame() {
    const dealer = this.dealer ?? 3;
    this.reset();
    this.dealer = dealer;
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

    let seat = this.nextSeat(this.dealer);
    for (let i = 0; i < 40; i++) {
      this.hands[seat].push(this.deck.pop());
      seat = this.nextSeat(seat);
    }

    this.currentPlayer = this.nextSeat(this.dealer);
    this.message = `Tocca a ${this.playerNames[this.currentPlayer]}`;
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

  playCard(player, cardId) {
    if (!this.canPlay(player, cardId)) return false;

    const idx = this.hands[player].findIndex((c) => c.id === cardId);
    const card = this.hands[player][idx];
    this.hands[player].splice(idx, 1);

    if (this.trick.length === 0) this.leadSuit = card.suit;
    this.trick.push({ player, card });

    if (this.trick.length === 4) {
      this.evaluateTrick();
    } else {
      this.currentPlayer = this.nextSeat(player);
      this.message = `Tocca a ${this.playerNames[this.currentPlayer]}`;
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
    this.message = `${this.playerNames[this.trickWinner]} ha preso`;
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

    if (this.hands.every((h) => h.length === 0)) {
      this.endHand();
      return true;
    }

    this.phase = 'playing';
    this.message = `Tocca a ${this.playerNames[winner]}`;
    return true;
  }

  endHand() {
    const teamPoints = [0, 0];
    for (let p = 0; p < 4; p++) {
      teamPoints[this.getTeam(p)] += sumTressettePoints(this.captured[p]);
    }
    teamPoints[this.getTeam(this.currentPlayer)] += 1;

    this.handPoints = teamPoints;
    this.scores[0] += teamPoints[0];
    this.scores[1] += teamPoints[1];
    this.handOver = true;
    this.phase = 'handOver';

    if (this.scores[0] >= 21 || this.scores[1] >= 21) {
      this.gameOver = true;
      this.winner = this.scores[0] >= 21 ? 0 : 1;
      this.message =
        this.winner === 0
          ? `Squadra A vince ${this.scores[0]}-${this.scores[1]}`
          : `Squadra B vince ${this.scores[0]}-${this.scores[1]}`;
    } else {
      this.message = `Mano: A ${teamPoints[0]} — B ${teamPoints[1]} (tot ${this.scores[0]}-${this.scores[1]})`;
    }

    this.dealer = this.nextSeat(this.dealer);
    return { points: teamPoints, total: [...this.scores] };
  }

  getState() {
    return {
      gameType: 'tressette',
      playerCount: 4,
      playerNames: [...this.playerNames],
      hands: this.hands.map((h) => h.map(publicCard)),
      handCounts: this.hands.map((h) => h.length),
      trick: this.trick.map((t) => ({ player: t.player, card: publicCard(t.card) })),
      leadSuit: this.leadSuit,
      scores: [...this.scores],
      handPoints: [...this.handPoints],
      currentPlayer: this.currentPlayer,
      dealer: this.dealer,
      phase: this.phase,
      message: this.message,
      handOver: this.handOver,
      gameOver: this.gameOver,
      winner: this.winner,
      trickWinner: this.trickWinner,
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
    };
  }
}
