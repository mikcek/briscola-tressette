import { BriscolaGame } from './briscola.js';
import { TressetteGame } from './tressette.js';
import { chooseBriscolaMove, chooseTressetteMove } from './ai.js';
import {
  renderHand,
  renderFaceDownHand,
  renderTrick,
  showOverlay,
  updateScoreboard,
  setMessage,
  highlightSeat,
  createCardElement,
} from './ui.js';

const TRICK_REVEAL_MS = 1600;
const CPU_DRAW_MS = 700;

class App {
  constructor() {
    this.currentGame = null;
    this.gameType = null;
    this.aiTimer = null;
    this.trickTimer = null;
    this.drawTimer = null;

    this.bindMenu();
    this.bindControls();
  }

  bindMenu() {
    document.querySelectorAll('.game-select').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.startGame(btn.dataset.game);
      });
    });
  }

  bindControls() {
    document.getElementById('btn-back').addEventListener('click', () => this.showMenu());
    document.getElementById('btn-new-hand').addEventListener('click', () => this.newHand());
  }

  clearTimers() {
    clearTimeout(this.aiTimer);
    clearTimeout(this.trickTimer);
    clearTimeout(this.drawTimer);
  }

  showMenu() {
    this.clearTimers();
    document.getElementById('menu-screen').classList.add('active');
    document.getElementById('game-screen').classList.remove('active');
    this.currentGame = null;
    this.gameType = null;
  }

  startGame(type) {
    this.clearTimers();
    this.gameType = type;
    document.getElementById('menu-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');

    const briscolaTable = document.getElementById('table-briscola');
    const tressetteTable = document.getElementById('table-tressette');

    if (type === 'briscola') {
      document.getElementById('game-title').textContent = 'Briscola';
      briscolaTable.classList.remove('hidden');
      tressetteTable.classList.add('hidden');
      this.currentGame = new BriscolaGame();
      updateScoreboard([0, 0], ['Tu', 'CPU'], 'Vince chi fa 61 su 120');
    } else {
      document.getElementById('game-title').textContent = 'Tressette';
      briscolaTable.classList.add('hidden');
      tressetteTable.classList.remove('hidden');
      this.currentGame = new TressetteGame();
      updateScoreboard([0, 0], ['Noi', 'Loro'], 'Prima a 21 punti');
    }

    this.currentGame.startGame();
    this.render();
    this.advanceFlow();
  }

  newHand() {
    if (!this.currentGame) return;
    this.clearTimers();
    if (this.currentGame.gameOver) {
      this.currentGame.startGame();
    } else {
      this.currentGame.startHand();
    }
    this.render();
    this.advanceFlow();
  }

  render() {
    if (this.gameType === 'briscola') {
      this.renderBriscola();
    } else {
      this.renderTressette();
    }
  }

  renderBriscola() {
    const state = this.currentGame.getState();

    updateScoreboard(
      state.handPoints,
      ['Tu', 'CPU'],
      `Mazzo: ${state.deckRemaining} · Vince chi fa 61`
    );
    setMessage('game-message', state.message);

    this.renderDeck(state);

    renderFaceDownHand(document.getElementById('cpu-hand'), state.hands[1].length);
    document.getElementById('cpu-count').textContent = state.hands[1].length;

    const canPlay = state.phase === 'playing' && state.currentPlayer === 0 && !state.handOver;
    const playable = canPlay ? this.currentGame.getPlayableCards(0) : [];

    renderHand(document.getElementById('player-hand'), state.hands[0], {
      game: 'briscola',
      disabled: !canPlay,
      onClick: (card) => this.onPlayerPlay(0, card),
    });

    document.querySelectorAll('#player-hand .card').forEach((el) => {
      const id = parseInt(el.dataset.cardId, 10);
      if (playable.some((c) => c.id === id)) {
        el.classList.add('playable');
      }
    });

    renderTrick(
      document.getElementById('trick-area'),
      state.trick,
      ['Tu', 'CPU'],
      'briscola'
    );

    if (state.handOver && !this._showingResult) {
      this.showHandResult(state);
    }
  }

  renderDeck(state) {
    const deckArea = document.getElementById('deck-area');
    const deckPile = document.getElementById('deck-pile');
    const trumpEl = document.getElementById('trump-card');
    const deckCount = document.getElementById('deck-count');
    const trumpLabel = document.getElementById('trump-label');

    trumpEl.innerHTML = '';
    deckPile.className = 'deck-pile';
    trumpEl.className = 'trump-slot';
    deckPile.onclick = null;
    trumpEl.onclick = null;

    if (state.deckRemaining === 0) {
      deckArea.classList.add('hidden');
      return;
    }

    deckArea.classList.remove('hidden');

    if (state.trumpCard) {
      const suitNames = {
        coppe: 'Coppe',
        denari: 'Denari',
        bastoni: 'Bastoni',
        spade: 'Spade',
      };
      trumpLabel.textContent = `Briscola: ${suitNames[state.trump] || state.trump}`;
      trumpEl.appendChild(
        createCardElement(state.trumpCard, { game: 'briscola', isTrump: true })
      );
      // Solo briscola rimasta → dritta e pescabile; altrimenti sporge sotto il mazzo
      if (state.faceDownCount === 0) {
        trumpEl.classList.add('alone');
      }
    } else {
      trumpLabel.textContent = 'Mazzo';
    }

    if (state.faceDownCount > 0) {
      deckPile.classList.remove('empty');
      deckCount.textContent =
        state.trumpCard
          ? `${state.faceDownCount} coperte + briscola`
          : `${state.faceDownCount} carte`;
    } else {
      // Solo briscola rimasta: mostra come mazzo cliccabile
      deckPile.classList.add('empty');
      deckCount.textContent = 'Ultima carta (briscola)';
    }

    if (state.canPlayerDraw) {
      if (state.faceDownCount > 0) {
        deckPile.classList.add('drawable');
        deckPile.onclick = () => this.onPlayerDraw();
      } else {
        trumpEl.classList.add('drawable');
        trumpEl.onclick = () => this.onPlayerDraw();
      }
    }
  }

  renderTressette() {
    const state = this.currentGame.getState();

    updateScoreboard(state.scores, ['Noi', 'Loro'], 'Prima a 21 punti');
    setMessage('game-message-ts', state.message);
    highlightSeat(state.currentPlayer);

    const handEls = {
      0: document.getElementById('hand-south'),
      1: document.getElementById('hand-east'),
      2: document.getElementById('hand-north'),
      3: document.getElementById('hand-west'),
    };

    for (let p = 0; p < 4; p++) {
      if (p === 0) {
        const playable =
          state.currentPlayer === 0 && !state.handOver
            ? this.currentGame.getPlayableCards(0)
            : [];

        renderHand(handEls[p], state.hands[p], {
          game: 'tressette',
          disabled: state.currentPlayer !== 0 || state.handOver,
          onClick: (card) => this.onPlayerPlay(0, card),
        });

        handEls[p].querySelectorAll('.card').forEach((el) => {
          const id = parseInt(el.dataset.cardId, 10);
          if (playable.some((c) => c.id === id)) {
            el.classList.add('playable');
          }
        });
      } else {
        renderFaceDownHand(handEls[p], state.hands[p].length, true);
      }
    }

    renderTrick(
      document.getElementById('trick-area-ts'),
      state.trick,
      state.playerNames,
      'tressette'
    );

    if (state.handOver && !this._showingResult) {
      this.showHandResult(state);
    }
  }

  onPlayerPlay(player, card) {
    if (!this.currentGame.canPlay(player, card)) return;

    this.currentGame.playCard(player, card);
    this.render();
    this.advanceFlow();
  }

  onPlayerDraw() {
    if (!this.currentGame.canDraw(0)) return;
    this.currentGame.draw(0);
    this.render();
    this.advanceFlow();
  }

  /** Gestisce pause presa, pesca CPU e turno AI. */
  advanceFlow() {
    if (this.gameType !== 'briscola') {
      this.scheduleAI();
      return;
    }

    const state = this.currentGame.getState();

    if (state.phase === 'showingTrick') {
      clearTimeout(this.trickTimer);
      this.trickTimer = setTimeout(() => {
        this.currentGame.collectTrick();
        this.render();
        this.advanceFlow();
      }, TRICK_REVEAL_MS);
      return;
    }

    if (state.phase === 'drawing') {
      if (state.nextDrawer === 1) {
        clearTimeout(this.drawTimer);
        this.drawTimer = setTimeout(() => {
          this.currentGame.draw(1);
          this.render();
          this.advanceFlow();
        }, CPU_DRAW_MS);
      }
      // nextDrawer === 0: aspetta click sul mazzo
      return;
    }

    if (state.phase === 'playing') {
      this.scheduleAI();
    }
  }

  scheduleAI() {
    clearTimeout(this.aiTimer);

    const state = this.currentGame.getState();
    if (state.handOver || state.gameOver) return;
    if (this.gameType === 'briscola' && state.phase !== 'playing') return;
    if (state.currentPlayer === 0 || state.currentPlayer < 0) return;

    this.aiTimer = setTimeout(() => this.runAI(), 800);
  }

  runAI() {
    const state = this.currentGame.getState();
    if (state.handOver) return;
    if (this.gameType === 'briscola' && state.phase !== 'playing') return;
    if (state.currentPlayer === 0 || state.currentPlayer < 0) return;

    let move = null;
    const player = state.currentPlayer;
    const hand = state.hands[player];

    if (this.gameType === 'briscola') {
      move = chooseBriscolaMove(
        hand,
        state.trick,
        state.trump,
        state.trick.length === 0
      );
    } else {
      move = chooseTressetteMove(hand, state.trick, state.leadSuit);
    }

    if (move) {
      this.currentGame.playCard(player, move);
      this.render();
      this.advanceFlow();
    }
  }

  showHandResult(state) {
    this._showingResult = true;

    let title, detail;
    if (this.gameType === 'briscola') {
      if (state.winner === 0) title = 'Vittoria!';
      else if (state.winner === 1) title = 'Sconfitta';
      else title = 'Patta';
      detail = `Punteggio: Tu ${state.scores[0]} — CPU ${state.scores[1]} (su 120)`;
    } else if (state.gameOver) {
      title = state.winner === 0 ? 'Vittoria!' : 'Sconfitta';
      detail = `Punteggio finale: Noi ${state.scores[0]} - Loro ${state.scores[1]}`;
    } else {
      title = 'Mano terminata';
      detail = state.message;
    }

    showOverlay(title, detail, () => {
      this._showingResult = false;
      if (this.gameType === 'briscola' || state.gameOver) {
        this.currentGame.startGame();
      } else {
        this.currentGame.startHand();
      }
      this.render();
      this.advanceFlow();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});
