import { BriscolaGame } from '/shared/briscola.js';
import { TressetteGame } from '/shared/tressette.js';
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
  showScreen,
  renderSignalBar,
} from './ui.js';

const TRICK_REVEAL_MS = 1600;
const DRAW_REVEAL_MS = 1800;
const CPU_DRAW_MS = 700;

/** Modalità locale vs CPU (allenamento). */
export class LocalApp {
  constructor(rootApp) {
    this.root = rootApp;
    this.currentGame = null;
    this.gameType = null; // briscola | tressette2 | tressette4
    this.aiTimer = null;
    this.trickTimer = null;
    this.drawTimer = null;
    this._showingResult = false;
    this.selectedSignal = null;
  }

  clearTimers() {
    clearTimeout(this.aiTimer);
    clearTimeout(this.trickTimer);
    clearTimeout(this.drawTimer);
  }

  stop() {
    this.clearTimers();
    this.currentGame = null;
  }

  get isTressette() {
    return this.gameType === 'tressette2' || this.gameType === 'tressette4';
  }

  start(type) {
    this.clearTimers();
    this.gameType = type === 'tressette' ? 'tressette4' : type;
    this._showingResult = false;
    this.selectedSignal = null;
    showScreen('game-screen');

    const briscolaTable = document.getElementById('table-briscola');
    const tressette2 = document.getElementById('table-tressette-2');
    const tressette4 = document.getElementById('table-tressette');
    const table4 = document.getElementById('table-briscola-4');

    table4?.classList.add('hidden');
    briscolaTable.classList.add('hidden');
    tressette2?.classList.add('hidden');
    tressette4.classList.add('hidden');

    if (this.gameType === 'briscola') {
      document.getElementById('game-title').textContent = 'Briscola (vs CPU)';
      briscolaTable.classList.remove('hidden');
      this.currentGame = new BriscolaGame(2, ['Tu', 'CPU']);
      updateScoreboard([0, 0], ['Tu', 'CPU'], 'Vince chi fa 61 su 120');
    } else if (this.gameType === 'tressette2') {
      document.getElementById('game-title').textContent = 'Tressette 1 vs 1';
      tressette2.classList.remove('hidden');
      this.currentGame = new TressetteGame(['Tu', 'CPU'], { playerCount: 2 });
      updateScoreboard([0, 0], ['Tu', 'CPU'], 'Pesca ed esibizione · a 21');
    } else {
      document.getElementById('game-title').textContent = 'Tressette 2 vs 2';
      tressette4.classList.remove('hidden');
      this.currentGame = new TressetteGame(['Tu', 'Avv. Est', 'Partner', 'Avv. Ovest'], {
        playerCount: 4,
      });
      updateScoreboard([0, 0], ['Noi', 'Loro'], 'Prima a 21 punti');
    }

    document.getElementById('btn-new-hand').classList.remove('hidden');
    this.currentGame.startGame();
    this.render();
    this.advanceFlow();
  }

  newHand() {
    if (!this.currentGame) return;
    this.clearTimers();
    this._showingResult = false;
    if (this.currentGame.gameOver) this.currentGame.startGame();
    else this.currentGame.startHand();
    this.render();
    this.advanceFlow();
  }

  render() {
    if (this.gameType === 'briscola') this.renderBriscola();
    else if (this.gameType === 'tressette2') this.renderTressette2();
    else this.renderTressette4();
  }

  renderBriscola() {
    const state = this.currentGame.getViewFor(0);
    updateScoreboard(state.handPoints, ['Tu', 'CPU'], `Mazzo: ${state.deckRemaining}`);
    setMessage('game-message', state.message);
    this.renderDeck(state);

    renderFaceDownHand(document.getElementById('cpu-hand'), state.handCounts[1], {
      facing: 'north',
    });
    document.getElementById('cpu-count').textContent = state.handCounts[1];
    document.querySelector('#table-briscola .player-name').textContent = 'CPU';

    const canPlay = state.canPlay;
    renderHand(document.getElementById('player-hand'), state.hands[0], {
      game: 'briscola',
      disabled: !canPlay,
      onClick: (card) => this.onPlayerPlay(card),
    });
    markPlayable('#player-hand', state.playableCardIds);

    renderTrick(document.getElementById('trick-area'), state.trick, state.playerNames, 'briscola');

    if (state.handOver && !this._showingResult) this.showHandResult(state);
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
      const names = { coppe: 'Coppe', denari: 'Denari', bastoni: 'Bastoni', spade: 'Spade' };
      trumpLabel.textContent = `Briscola: ${names[state.trump] || state.trump}`;
      trumpEl.appendChild(createCardElement(state.trumpCard, { game: 'briscola', isTrump: true }));
      if (state.faceDownCount === 0) trumpEl.classList.add('alone');
    } else {
      trumpLabel.textContent = 'Mazzo';
    }

    if (state.faceDownCount > 0) {
      deckPile.classList.remove('empty');
      deckCount.textContent = state.trumpCard
        ? `${state.faceDownCount} coperte + briscola`
        : `${state.faceDownCount} carte`;
    } else {
      deckPile.classList.add('empty');
      deckCount.textContent = 'Ultima carta (briscola)';
    }

    if (state.canDraw) {
      if (state.faceDownCount > 0) {
        deckPile.classList.add('drawable');
        deckPile.onclick = () => this.onPlayerDraw();
      } else {
        trumpEl.classList.add('drawable');
        trumpEl.onclick = () => this.onPlayerDraw();
      }
    }
  }

  renderTressette2() {
    const state = this.currentGame.getViewFor(0);
    updateScoreboard(
      state.scores,
      ['Tu', 'CPU'],
      `Mazzo: ${state.deckRemaining} · a ${state.targetScore}`
    );
    setMessage('game-message-ts2', state.message);

    document.getElementById('ts2-opp-name').textContent = state.playerNames[1];
    document.getElementById('ts2-opp-count').textContent = state.handCounts[1];
    document.getElementById('ts2-player-name').textContent = state.playerNames[0];

    const deckArea = document.getElementById('ts2-deck-area');
    const deckPile = document.getElementById('ts2-deck-pile');
    const deckCount = document.getElementById('ts2-deck-count');
    if (state.deckRemaining > 0) {
      deckArea.classList.remove('hidden');
      deckPile.classList.remove('empty');
      deckCount.textContent = `${state.deckRemaining} carte`;
    } else {
      deckArea.classList.add('hidden');
    }

    renderDrawReveal('ts2-draw-reveal', state, this.currentGame.playerNames);

    renderFaceDownHand(document.getElementById('ts2-opp-hand'), state.handCounts[1], {
      facing: 'north',
    });
    renderHand(document.getElementById('ts2-player-hand'), state.hands[0], {
      game: 'tressette',
      disabled: !state.canPlay,
      onClick: (card) => this.onPlayerPlay(card),
    });
    markPlayable('#ts2-player-hand', state.playableCardIds);

    renderTrick(
      document.getElementById('trick-area-ts2'),
      state.trick,
      state.playerNames,
      'tressette'
    );

    renderSignalBar(document.getElementById('tressette2-signals'), {
      enabled: !!state.canSignal,
      selected: this.selectedSignal,
      onSelect: (sig) => {
        this.selectedSignal = sig;
        this.currentGame.setPendingSignal(sig);
        this.renderTressette2();
      },
    });

    const log = document.getElementById('tressette2-accusi');
    if (log) {
      log.textContent = state.accusoLog?.length
        ? `Accusi: ${state.accusoLog.join(' · ')}`
        : '';
    }

    if (state.handOver && !this._showingResult) this.showHandResult(state);
  }

  renderTressette4() {
    const state = this.currentGame.getViewFor(0);
    updateScoreboard(
      state.scores,
      ['Noi', 'Loro'],
      `Prima a ${state.targetScore}`
    );
    setMessage('game-message-ts', state.message);
    highlightSeat(state.currentPlayer);

    const handEls = {
      0: document.getElementById('hand-south'),
      1: document.getElementById('hand-east'),
      2: document.getElementById('hand-north'),
      3: document.getElementById('hand-west'),
    };

    const facingBySeat = { 1: 'east', 2: 'north', 3: 'west' };

    for (let p = 0; p < 4; p++) {
      if (p === 0) {
        renderHand(handEls[p], state.hands[0], {
          game: 'tressette',
          disabled: !state.canPlay,
          onClick: (card) => this.onPlayerPlay(card),
        });
        markPlayable('#hand-south', state.playableCardIds);
      } else {
        renderFaceDownHand(handEls[p], state.handCounts[p], {
          small: true,
          facing: facingBySeat[p],
        });
      }
    }

    renderTrick(
      document.getElementById('trick-area-ts'),
      state.trick,
      state.playerNames,
      'tressette'
    );

    renderSignalBar(document.getElementById('tressette-signals'), {
      enabled: !!state.canSignal,
      selected: this.selectedSignal,
      onSelect: (sig) => {
        this.selectedSignal = sig;
        this.currentGame.setPendingSignal(sig);
        this.renderTressette4();
      },
    });

    const log = document.getElementById('tressette-accusi');
    if (log) {
      log.textContent = state.accusoLog?.length
        ? `Accusi: ${state.accusoLog.join(' · ')}`
        : '';
    }

    if (state.handOver && !this._showingResult) this.showHandResult(state);
  }

  onPlayerPlay(card) {
    if (!this.currentGame.canPlay(0, card.id)) return;
    if (this.isTressette) {
      this.currentGame.playCard(0, card.id, this.selectedSignal);
      this.selectedSignal = null;
    } else {
      this.currentGame.playCard(0, card.id);
    }
    this.render();
    this.advanceFlow();
  }

  onPlayerDraw() {
    if (!this.currentGame.canDraw(0)) return;
    this.currentGame.draw(0);
    this.render();
    this.advanceFlow();
  }

  advanceFlow() {
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

    if (state.phase === 'showingDraw') {
      clearTimeout(this.drawTimer);
      this.drawTimer = setTimeout(() => {
        this.currentGame.acknowledgeDraws();
        this.render();
        this.advanceFlow();
      }, DRAW_REVEAL_MS);
      return;
    }

    if (this.gameType === 'briscola' && state.phase === 'drawing') {
      if (state.nextDrawer === 1) {
        clearTimeout(this.drawTimer);
        this.drawTimer = setTimeout(() => {
          this.currentGame.draw(1);
          this.render();
          this.advanceFlow();
        }, CPU_DRAW_MS);
      }
      return;
    }

    if (state.phase === 'playing') this.scheduleAI();
  }

  scheduleAI() {
    clearTimeout(this.aiTimer);
    const state = this.currentGame.getState();
    if (state.handOver || state.phase !== 'playing') return;
    if (state.currentPlayer === 0 || state.currentPlayer < 0) return;
    this.aiTimer = setTimeout(() => this.runAI(), 800);
  }

  runAI() {
    const state = this.currentGame.getState();
    if (state.phase !== 'playing' || state.currentPlayer <= 0) return;
    const player = state.currentPlayer;
    const hand = this.currentGame.hands[player];
    let move;
    if (this.gameType === 'briscola') {
      move = chooseBriscolaMove(hand, state.trick, state.trump, state.trick.length === 0);
    } else {
      move = chooseTressetteMove(hand, state.trick, state.leadSuit);
    }
    if (move) {
      this.currentGame.playCard(player, move.id);
      this.render();
      this.advanceFlow();
    }
  }

  showHandResult(state) {
    this._showingResult = true;
    let title = 'Mano terminata';
    let detail = state.message;
    if (this.gameType === 'briscola') {
      if (state.winner === 0) title = 'Vittoria!';
      else if (state.winner === 1) title = 'Sconfitta';
      else title = 'Patta';
      detail = `Punteggio: ${state.scores[0]} — ${state.scores[1]}`;
    } else if (state.gameOver) {
      title = state.winner === 0 ? 'Vittoria!' : state.winner === -1 ? 'Patta' : 'Sconfitta';
    }

    showOverlay(title, detail, () => {
      this._showingResult = false;
      if (this.gameType === 'briscola' || state.gameOver) this.currentGame.startGame();
      else this.currentGame.startHand();
      this.render();
      this.advanceFlow();
    });
  }
}

function renderDrawReveal(elId, state, names) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (state.phase !== 'showingDraw' || !state.revealedDraws?.length) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = '';
  for (const d of state.revealedDraws) {
    const wrap = document.createElement('div');
    wrap.className = 'draw-reveal-item';
    const label = document.createElement('span');
    label.textContent = names[d.player] || `P${d.player + 1}`;
    wrap.appendChild(label);
    wrap.appendChild(createCardElement(d.card, { game: 'tressette' }));
    el.appendChild(wrap);
  }
}

function markPlayable(selector, ids) {
  document.querySelectorAll(`${selector} .card`).forEach((el) => {
    const id = parseInt(el.dataset.cardId, 10);
    if (ids?.includes(id)) el.classList.add('playable');
  });
}
