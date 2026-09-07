import { BriscolaGame } from '/shared/briscola.js';
import { TressetteGame } from '/shared/tressette.js';
import { ScopaGame } from '/shared/scopa.js';
import { chooseBriscolaMove, chooseTressetteMove, chooseScopaMove } from './ai.js';
import { scopaCaptureValue, isSettebello } from '/shared/cards.js';
import {
  renderHand,
  renderFaceDownHand,
  renderTrick,
  renderScopaTable,
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
    this.gameType = null; // briscola | tressette2 | tressette4 | scopa2 | scopa4
    this.aiTimer = null;
    this.trickTimer = null;
    this.drawTimer = null;
    this._showingResult = false;
    this.selectedSignal = null;
    this.scopaCardId = null;
    this.scopaTableIds = [];
    this.scopaCaptures = [];
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

  get isScopa() {
    return this.gameType === 'scopa2' || this.gameType === 'scopa4';
  }

  clearScopaSelection() {
    this.scopaCardId = null;
    this.scopaTableIds = [];
    this.scopaCaptures = [];
  }

  start(type) {
    this.clearTimers();
    this.gameType = type === 'tressette' ? 'tressette4' : type;
    this._showingResult = false;
    this.selectedSignal = null;
    this.clearScopaSelection();
    showScreen('game-screen');

    const briscolaTable = document.getElementById('table-briscola');
    const tressette2 = document.getElementById('table-tressette-2');
    const tressette4 = document.getElementById('table-tressette');
    const table4 = document.getElementById('table-briscola-4');
    const scopa2 = document.getElementById('table-scopa-2');
    const scopa4 = document.getElementById('table-scopa-4');

    table4?.classList.add('hidden');
    briscolaTable.classList.add('hidden');
    tressette2?.classList.add('hidden');
    tressette4.classList.add('hidden');
    scopa2?.classList.add('hidden');
    scopa4?.classList.add('hidden');

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
    } else if (this.gameType === 'tressette4') {
      document.getElementById('game-title').textContent = 'Tressette 2 vs 2';
      tressette4.classList.remove('hidden');
      this.currentGame = new TressetteGame(['Tu', 'Avv. Est', 'Partner', 'Avv. Ovest'], {
        playerCount: 4,
      });
      updateScoreboard([0, 0], ['Noi', 'Loro'], 'Prima a 21 punti');
    } else if (this.gameType === 'scopa2') {
      document.getElementById('game-title').textContent = 'Scopa 1 vs 1';
      scopa2.classList.remove('hidden');
      this.currentGame = new ScopaGame(['Tu', 'CPU'], { playerCount: 2, targetScore: 21 });
      updateScoreboard([0, 0], ['Tu', 'CPU'], 'Prima a 21');
      this.bindScopaConfirm('sc2-confirm');
    } else {
      document.getElementById('game-title').textContent = 'Scopa 2 vs 2';
      scopa4.classList.remove('hidden');
      this.currentGame = new ScopaGame(['Tu', 'Avv. Est', 'Partner', 'Avv. Ovest'], {
        playerCount: 4,
        targetScore: 21,
      });
      updateScoreboard([0, 0], ['Noi', 'Loro'], 'Prima a 21');
      this.bindScopaConfirm('sc4-confirm');
    }

    document.getElementById('btn-new-hand').classList.remove('hidden');
    this.currentGame.startGame();
    this.render();
    this.advanceFlow();
  }

  bindScopaConfirm(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => this.confirmScopaCapture());
  }
  newHand() {
    if (!this.currentGame) return;
    this.clearTimers();
    this._showingResult = false;
    this.clearScopaSelection();
    if (this.currentGame.gameOver) this.currentGame.startGame();
    else this.currentGame.startHand();
    this.render();
    this.advanceFlow();
  }

  render() {
    if (this.gameType === 'briscola') this.renderBriscola();
    else if (this.gameType === 'tressette2') this.renderTressette2();
    else if (this.gameType === 'tressette4') this.renderTressette4();
    else if (this.gameType === 'scopa2') this.renderScopa2();
    else if (this.gameType === 'scopa4') this.renderScopa4();
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

  renderScopa2() {
    const state = this.currentGame.getViewFor(0);
    updateScoreboard(
      state.scores,
      ['Tu', 'CPU'],
      `Scope ${state.teamScopes[0]}-${state.teamScopes[1]} · Mazzo ${state.deckRemaining} · a ${state.targetScore}`
    );
    setMessage('game-message-sc2', state.message);
    document.getElementById('sc2-opp-name').textContent = state.playerNames[1];
    document.getElementById('sc2-opp-count').textContent = state.handCounts[1];
    document.getElementById('sc2-deck-count').textContent =
      state.deckRemaining > 0 ? `Mazzo: ${state.deckRemaining}` : 'Mazzo esaurito';

    renderFaceDownHand(document.getElementById('sc2-opp-hand'), state.handCounts[1], {
      facing: 'north',
    });
    this.renderScopaPlayArea(state, {
      tableId: 'sc2-table',
      handId: 'sc2-player-hand',
      hintId: 'sc2-hint',
      confirmId: 'sc2-confirm',
      logId: 'sc2-log',
    });
  }

  renderScopa4() {
    const state = this.currentGame.getViewFor(0);
    updateScoreboard(
      state.scores,
      ['Noi', 'Loro'],
      `Scope ${state.teamScopes[0]}-${state.teamScopes[1]} · a ${state.targetScore}`
    );
    setMessage('game-message-sc4', state.message);
    highlightSeat(state.currentPlayer);
    document.getElementById('sc4-deck-count').textContent =
      state.deckRemaining > 0 ? `Mazzo: ${state.deckRemaining}` : 'Mazzo esaurito';

    const handEls = {
      0: document.getElementById('sc4-hand-south'),
      1: document.getElementById('sc4-hand-east'),
      2: document.getElementById('sc4-hand-north'),
      3: document.getElementById('sc4-hand-west'),
    };
    const facingBySeat = { 1: 'east', 2: 'north', 3: 'west' };
    for (let p = 1; p < 4; p++) {
      renderFaceDownHand(handEls[p], state.handCounts[p], {
        small: true,
        facing: facingBySeat[p],
      });
    }
    this.renderScopaPlayArea(state, {
      tableId: 'sc4-table',
      handId: 'sc4-hand-south',
      hintId: 'sc4-hint',
      confirmId: 'sc4-confirm',
      logId: 'sc4-log',
    });
  }

  renderScopaPlayArea(state, ids) {
    const selecting = this.scopaCardId != null && this.scopaCaptures.length > 1;
    const highlight = selecting
      ? [...new Set(this.scopaCaptures.flat())]
      : null;

    renderScopaTable(document.getElementById(ids.tableId), state.table, {
      selectedIds: this.scopaTableIds,
      highlightIds: highlight,
      disabled: !state.canPlay,
      onClick: (card) => this.onScopaTableClick(card),
    });

    renderHand(document.getElementById(ids.handId), state.hands[0], {
      game: 'scopa',
      disabled: !state.canPlay,
      onClick: (card) => this.onScopaHandClick(card, state),
    });
    markPlayable(`#${ids.handId}`, state.playableCardIds);
    if (this.scopaCardId != null) {
      document
        .querySelector(`#${ids.handId} .card[data-card-id="${this.scopaCardId}"]`)
        ?.classList.add('selected');
    }

    const hint = document.getElementById(ids.hintId);
    const confirm = document.getElementById(ids.confirmId);
    if (selecting) {
      hint.textContent = 'Seleziona le carte del tavolo da prendere, poi conferma';
      const ok = this.scopaSelectionMatches();
      confirm.classList.toggle('hidden', !ok);
    } else {
      hint.textContent = state.canPlay
        ? 'Clicca una carta: presa automatica se univoca, altrimenti scegli sul tavolo'
        : '';
      confirm.classList.add('hidden');
    }

    const log = document.getElementById(ids.logId);
    if (log) {
      const parts = [];
      if (state.buongiocoLog?.length) parts.push(state.buongiocoLog.join(' · '));
      if (state.lastCapture?.scopa) parts.push('Ultima: SCOPA!');
      log.textContent = parts.join(' · ');
    }

    if (state.handOver && !this._showingResult) this.showHandResult(state);
  }

  scopaSelectionMatches() {
    if (this.scopaCardId == null) return false;
    const key = [...this.scopaTableIds].sort((a, b) => a - b).join(',');
    return this.scopaCaptures.some(
      (cap) => [...cap].sort((a, b) => a - b).join(',') === key
    );
  }

  onScopaHandClick(card, state) {
    if (!state.canPlay) return;
    const captures = state.legalCapturesByCard?.[card.id] || [];
    if (captures.length === 0) {
      this.clearScopaSelection();
      this.currentGame.playCard(0, card.id, { tableCardIds: [] });
      this.render();
      this.advanceFlow();
      return;
    }
    if (captures.length === 1) {
      this.clearScopaSelection();
      this.playScopaCapture(card.id, captures[0], state.table);
      return;
    }
    this.scopaCardId = card.id;
    this.scopaCaptures = captures;
    this.scopaTableIds = [];
    this.render();
  }

  onScopaTableClick(card) {
    if (this.scopaCardId == null || this.scopaCaptures.length <= 1) return;
    const i = this.scopaTableIds.indexOf(card.id);
    if (i >= 0) this.scopaTableIds.splice(i, 1);
    else this.scopaTableIds.push(card.id);
    this.render();
  }

  confirmScopaCapture() {
    if (!this.scopaSelectionMatches()) return;
    const state = this.currentGame.getViewFor(0);
    this.playScopaCapture(this.scopaCardId, this.scopaTableIds, state.table);
  }

  playScopaCapture(cardId, tableCardIds, table) {
    const handCard = this.currentGame.hands[0].find((c) => c.id === cardId);
    let jollyValue = null;
    if (handCard && isSettebello(handCard)) {
      jollyValue = table
        .filter((c) => tableCardIds.includes(c.id))
        .reduce((s, c) => s + scopaCaptureValue(c), 0);
    }
    this.clearScopaSelection();
    this.currentGame.playCard(0, cardId, { tableCardIds, jollyValue });
    this.render();
    this.advanceFlow();
  }

  onPlayerPlay(card) {
    if (this.isScopa) return;
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
    if (this.isScopa) {
      const move = chooseScopaMove(hand, this.currentGame.table);
      if (!move) return;
      this.currentGame.playCard(player, move.cardId, {
        tableCardIds: move.tableCardIds,
        jollyValue: move.jollyValue,
      });
      this.render();
      this.advanceFlow();
      return;
    }
    let move;
    if (this.gameType === 'briscola') {
      move = chooseBriscolaMove(hand, state.trick, state.trump, {
        isFirst: state.trick.length === 0,
        seat: player,
        playerCount: state.playerCount || 2,
      });
    } else {
      move = chooseTressetteMove(hand, state.trick, state.leadSuit, {
        seat: player,
        playerCount: state.playerCount || 4,
      });
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
    } else if (this.isScopa && state.handBreakdown) {
      const b = state.handBreakdown;
      detail =
        state.message +
        `\nCarte ${b.cardCounts[0]}-${b.cardCounts[1]} · Denari ${b.denariCounts[0]}-${b.denariCounts[1]}` +
        `\nPrimiera ${b.primieraScores[0]}-${b.primieraScores[1]}`;
      if (state.gameOver) {
        title = state.winner === 0 ? 'Vittoria!' : 'Sconfitta';
      }
    } else if (state.gameOver) {
      title = state.winner === 0 ? 'Vittoria!' : state.winner === -1 ? 'Patta' : 'Sconfitta';
    }

    showOverlay(title, detail, () => {
      this._showingResult = false;
      this.clearScopaSelection();
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
