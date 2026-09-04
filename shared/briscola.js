import {
  createDeck,
  shuffle,
  compareBriscola,
  sumBriscolaPoints,
  resetCardIds,
  publicCard,
} from './cards.js';

/**
 * Briscola a 2 o 4 giocatori (squadre 0+2 vs 1+3).
 * Server-authoritative friendly: messaggi generici, niente riferimenti a CPU.
 */
export class BriscolaGame {
  constructor(playerCount = 2, playerNames = null) {
    this.playerCount = playerCount === 4 ? 4 : 2;
    this.playerNames = playerNames || defaultNames(this.playerCount);
    this.reset();
  }

  reset() {
    resetCardIds();
    this.deck = [];
    this.hands = Array.from({ length: this.playerCount }, () => []);
    this.trump = null;
    this.trumpCard = null;
    this.trick = [];
    this.leadSuit = null;
    this.captured = Array.from({ length: this.playerCount }, () => []);
    this.currentPlayer = 0;
    this.dealer = this.playerCount - 1;
    this.scores = [0, 0];
    this.handPoints = [0, 0];
    this.phase = 'idle';
    this.message = '';
    this.handOver = false;
    this.gameOver = false;
    this.winner = null;
    this.trickWinner = null;
    this.drawQueue = [];
  }

  teamOf(player) {
    return player % 2;
  }

  nextSeat(seat) {
    return (seat + 1) % this.playerCount;
  }

  startGame() {
    const dealer = this.dealer ?? this.playerCount - 1;
    this.reset();
    this.dealer = dealer;
    this.startHand();
  }

  startHand() {
    resetCardIds();
    this.deck = shuffle(createDeck());
    this.hands = Array.from({ length: this.playerCount }, () => []);
    this.trick = [];
    this.leadSuit = null;
    this.captured = Array.from({ length: this.playerCount }, () => []);
    this.handPoints = [0, 0];
    this.handOver = false;
    this.gameOver = false;
    this.winner = null;
    this.trickWinner = null;
    this.drawQueue = [];
    this.phase = 'playing';

    let seat = this.nextSeat(this.dealer);
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < this.playerCount; i++) {
        this.hands[seat].push(this.deck.pop());
        seat = this.nextSeat(seat);
      }
    }

    this.trumpCard = this.deck.pop();
    this.trump = this.trumpCard.suit;
    this.currentPlayer = this.nextSeat(this.dealer);
    this.message = `Tocca a ${this.playerNames[this.currentPlayer]}`;
  }

  getPlayableCards(player) {
    return this.hands[player];
  }

  canPlay(player, cardId) {
    if (this.phase !== 'playing' || this.handOver || player !== this.currentPlayer) {
      return false;
    }
    return this.hands[player].some((c) => c.id === cardId);
  }

  playCard(player, cardId) {
    if (!this.canPlay(player, cardId)) return false;

    const idx = this.hands[player].findIndex((c) => c.id === cardId);
    const card = this.hands[player][idx];
    this.hands[player].splice(idx, 1);

    if (this.trick.length === 0) {
      this.leadSuit = card.suit;
    }

    this.trick.push({ player, card });

    if (this.trick.length === this.playerCount) {
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
      const cmp = compareBriscola(this.trick[i].card, best.card, this.trump);
      if (cmp > 0) best = this.trick[i];
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

    this.handPoints = this.computeTeamPoints();
    this.trick = [];
    this.leadSuit = null;
    this.trickWinner = null;
    this.currentPlayer = winner;

    const cardsLeft = this.deckRemaining;
    if (cardsLeft > 0) {
      this.drawQueue = [];
      let seat = winner;
      for (let i = 0; i < this.playerCount; i++) {
        this.drawQueue.push(seat);
        seat = this.nextSeat(seat);
      }
      this.phase = 'drawing';
      this.updateDrawMessage();
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

  get nextDrawer() {
    return this.drawQueue.length > 0 ? this.drawQueue[0] : null;
  }

  get deckRemaining() {
    return this.deck.length + (this.trumpCard ? 1 : 0);
  }

  canDraw(player) {
    return (
      this.phase === 'drawing' &&
      this.nextDrawer === player &&
      this.deckRemaining > 0
    );
  }

  draw(player) {
    if (!this.canDraw(player)) return null;

    let card = null;
    if (this.deck.length > 0) {
      card = this.deck.pop();
    } else if (this.trumpCard) {
      card = this.trumpCard;
      this.trumpCard = null;
    }
    if (!card) return null;

    this.hands[player].push(card);
    this.drawQueue.shift();

    if (this.drawQueue.length > 0) {
      this.updateDrawMessage();
      return card;
    }

    if (this.hands.every((h) => h.length === 0)) {
      this.endHand();
      return card;
    }

    this.phase = 'playing';
    this.message = `Tocca a ${this.playerNames[this.currentPlayer]}`;
    return card;
  }

  updateDrawMessage() {
    const who = this.nextDrawer;
    this.message = who == null ? '' : `${this.playerNames[who]} pesca`;
  }

  computeTeamPoints() {
    const points = [0, 0];
    for (let p = 0; p < this.playerCount; p++) {
      points[this.teamOf(p)] += sumBriscolaPoints(this.captured[p]);
    }
    return points;
  }

  endHand() {
    const points = this.computeTeamPoints();
    this.handPoints = points;
    this.scores = [...points];
    this.handOver = true;
    this.phase = 'handOver';
    this.gameOver = true;
    this.drawQueue = [];

    if (points[0] > points[1] && points[0] >= 61) {
      this.winner = 0;
      this.message = `Squadra A vince ${points[0]}-${points[1]}`;
    } else if (points[1] > points[0] && points[1] >= 61) {
      this.winner = 1;
      this.message = `Squadra B vince ${points[0]}-${points[1]}`;
    } else if (points[0] === 60 && points[1] === 60) {
      this.winner = -1;
      this.message = `Patta ${points[0]}-${points[1]}`;
    } else if (points[0] > points[1]) {
      this.winner = 0;
      this.message = `Squadra A vince ${points[0]}-${points[1]}`;
    } else if (points[1] > points[0]) {
      this.winner = 1;
      this.message = `Squadra B vince ${points[0]}-${points[1]}`;
    } else {
      this.winner = -1;
      this.message = `Patta ${points[0]}-${points[1]}`;
    }

    this.dealer = this.nextSeat(this.dealer);
    return { points, total: [...this.scores] };
  }

  /** Stato completo (server). */
  getState() {
    return {
      gameType: 'briscola',
      playerCount: this.playerCount,
      playerNames: [...this.playerNames],
      hands: this.hands.map((h) => h.map(publicCard)),
      handCounts: this.hands.map((h) => h.length),
      trump: this.trump,
      trumpCard: publicCard(this.trumpCard),
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
      nextDrawer: this.nextDrawer,
      deckRemaining: this.deckRemaining,
      faceDownCount: this.deck.length,
    };
  }

  /** Vista filtrata per un posto (nasconde le mani altrui). */
  getViewFor(seatIndex) {
    const full = this.getState();
    return {
      ...full,
      mySeat: seatIndex,
      hands: full.hands.map((h, i) => (i === seatIndex ? h : [])),
      canPlay: this.phase === 'playing' && this.currentPlayer === seatIndex,
      canDraw: this.canDraw(seatIndex),
      playableCardIds:
        this.phase === 'playing' && this.currentPlayer === seatIndex
          ? this.getPlayableCards(seatIndex).map((c) => c.id)
          : [],
    };
  }
}

function defaultNames(n) {
  if (n === 4) return ['Sud', 'Est', 'Nord', 'Ovest'];
  return ['Giocatore 1', 'Giocatore 2'];
}
