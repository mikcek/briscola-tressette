import { NetClient, loadSession, saveSession } from './net.js';
import {
  renderHand,
  renderFaceDownHand,
  renderTrick,
  showOverlay,
  hideOverlay,
  updateScoreboard,
  setMessage,
  highlightSeat,
  createCardElement,
  showScreen,
  renderSignalBar,
} from './ui.js';
import { SUIT_NAMES } from '/shared/cards.js';

/** Client multiplayer online. */
export class OnlineApp {
  constructor(rootApp) {
    this.root = rootApp;
    this.net = new NetClient();
    this.room = null;
    this.you = null;
    this.state = null;
    this._showingResult = false;
    this._bound = false;
    this.selectedSignal = null;
  }

  async ensureConnected() {
    await this.net.connect();
    if (!this._bound) {
      this._bound = true;
      this.net.on('roomUpdated', (msg) => this.onRoom(msg));
      this.net.on('stateUpdate', (msg) => this.onState(msg));
      this.net.on('error', (msg) => this.showError(msg.message));
      this.net.on('left', () => {
        this.room = null;
        this.state = null;
        showScreen('home-screen');
      });
    }
  }

  showError(text) {
    const el = document.getElementById('online-error');
    if (el) {
      el.textContent = text || '';
      el.classList.toggle('hidden', !text);
    }
  }

  async openCreate() {
    this.showError('');
    showScreen('online-setup-screen');
    document.getElementById('setup-mode-title').textContent = 'Crea stanza';
    document.getElementById('join-fields').classList.add('hidden');
    document.getElementById('create-fields').classList.remove('hidden');
    document.getElementById('btn-setup-confirm').dataset.mode = 'create';
    const nick = loadSession().nickname || '';
    document.getElementById('input-nickname').value = nick;
  }

  async openJoin(prefillCode = '') {
    this.showError('');
    showScreen('online-setup-screen');
    document.getElementById('setup-mode-title').textContent = 'Entra in stanza';
    document.getElementById('create-fields').classList.add('hidden');
    document.getElementById('join-fields').classList.remove('hidden');
    document.getElementById('btn-setup-confirm').dataset.mode = 'join';
    document.getElementById('input-nickname').value = loadSession().nickname || '';
    document.getElementById('input-room-code').value = prefillCode || '';
  }

  async confirmSetup() {
    await this.ensureConnected();
    const nickname = document.getElementById('input-nickname').value.trim() || 'Giocatore';
    saveSession({ nickname });
    const mode = document.getElementById('btn-setup-confirm').dataset.mode;

    if (mode === 'create') {
      const gameType = document.getElementById('select-game-type').value;
      const playerCount = Number(document.getElementById('select-player-count').value);
      this.net.send({ type: 'createRoom', nickname, gameType, playerCount });
    } else {
      const code = document.getElementById('input-room-code').value.trim().toUpperCase();
      if (code.length < 4) return this.showError('Inserisci il codice stanza');
      this.net.send({ type: 'joinRoom', nickname, code });
    }
  }

  tryRejoinFromUrl() {
    const params = new URLSearchParams(location.search);
    const code = params.get('room');
    if (code) this.openJoin(code);
  }

  onRoom(msg) {
    this.room = msg.room;
    this.you = msg.you;
    saveSession({ roomCode: msg.room?.code, nickname: this.you?.nickname });
    this.renderLobby();
    if (this.room?.phase === 'lobby') showScreen('lobby-screen');
  }

  onState(msg) {
    this.room = msg.room;
    this.you = msg.you;
    this.state = msg.state;
    this.renderGame();
  }

  renderLobby() {
    if (!this.room) return;
    const modeLabel =
      this.room.gameType === 'tressette'
        ? this.room.playerCount === 2
          ? 'Tressette 1 vs 1'
          : 'Tressette a squadre'
        : this.room.playerCount === 4
          ? 'Briscola a 4'
          : 'Briscola 1 vs 1';
    document.getElementById('lobby-code').textContent = this.room.code;
    document.getElementById('lobby-meta').textContent =
      `${modeLabel} · ${this.room.playerCount} posti`;

    const link = `${location.origin}/?room=${this.room.code}`;
    document.getElementById('lobby-link').value = link;

    const qr = document.getElementById('lobby-qr');
    qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(link)}`;
    qr.alt = `QR stanza ${this.room.code}`;

    const seatsEl = document.getElementById('lobby-seats');
    seatsEl.innerHTML = '';
    for (const seat of this.room.seats) {
      const btn = document.createElement('button');
      btn.className =
        'seat-slot' +
        (seat.occupied ? ' filled' : '') +
        (seat.connected === false ? ' away' : '') +
        (seat.isCpu ? ' cpu' : '');
      btn.type = 'button';
      const team =
        this.room.playerCount === 4
          ? ` · Squadra ${seat.seatIndex % 2 === 0 ? 'A' : 'B'}`
          : '';
      btn.innerHTML = `<span class="seat-idx">Posto ${seat.seatIndex + 1}${team}</span><strong>${
        seat.occupied ? (seat.isCpu ? seat.nickname : seat.nickname) : 'Libero'
      }</strong>`;
      if (!seat.occupied) {
        btn.addEventListener('click', () => {
          const nickname = loadSession().nickname || 'Giocatore';
          this.net.send({
            type: 'joinRoom',
            code: this.room.code,
            nickname,
            seatIndex: seat.seatIndex,
          });
        });
      }
      seatsEl.appendChild(btn);
    }

    const startBtn = document.getElementById('btn-start-game');
    const fillBtn = document.getElementById('btn-fill-cpu');
    const isHost = this.you?.isHost;
    const full = this.room.seats.every((s) => s.occupied);
    const hasEmpty = this.room.seats.some((s) => !s.occupied);

    fillBtn?.classList.toggle('hidden', !isHost || !hasEmpty);
    startBtn.classList.toggle('hidden', !isHost);
    startBtn.disabled = !full;
    startBtn.textContent = full ? 'Avvia partita' : 'In attesa dei giocatori…';
  }

  startGame() {
    this.net.send({ type: 'startGame' });
  }

  fillCpu() {
    this.net.send({ type: 'fillCpu' });
  }

  leave() {
    this.net.send({ type: 'leaveRoom' });
    this.room = null;
    this.state = null;
    saveSession({ roomCode: null });
    hideOverlay();
    showScreen('home-screen');
  }

  copyLink() {
    const input = document.getElementById('lobby-link');
    input.select();
    navigator.clipboard?.writeText(input.value).catch(() => {});
  }

  renderGame() {
    if (!this.state || !this.you) return;
    showScreen('game-screen');
    document.getElementById('btn-new-hand').classList.add('hidden');

    const isBriscola = this.state.gameType === 'briscola';
    const is4 = this.state.playerCount === 4;
    const isTs2 = !isBriscola && !is4;

    document.getElementById('table-briscola').classList.toggle('hidden', !(isBriscola && !is4));
    document.getElementById('table-briscola-4').classList.toggle('hidden', !(isBriscola && is4));
    document.getElementById('table-tressette-2')?.classList.toggle('hidden', !isTs2);
    document.getElementById('table-tressette').classList.toggle('hidden', isBriscola || isTs2);

    document.getElementById('game-title').textContent =
      `${isBriscola ? 'Briscola' : isTs2 ? 'Tressette 1 vs 1' : 'Tressette'} · ${this.room.code}`;

    const myTeam = this.you.seatIndex % 2;
    let labels;
    let scores;
    if ((isBriscola && !is4) || isTs2) {
      const me = this.you.seatIndex;
      const opp = 1 - me;
      labels = [this.state.playerNames[me], this.state.playerNames[opp]];
      scores = isBriscola
        ? [this.state.handPoints[me], this.state.handPoints[opp]]
        : [this.state.scores[me], this.state.scores[opp]];
    } else {
      const raw = isBriscola ? this.state.handPoints : this.state.scores;
      if (myTeam === 0) {
        labels = ['Noi (A)', 'Loro (B)'];
        scores = raw;
      } else {
        labels = ['Noi (B)', 'Loro (A)'];
        scores = [raw[1], raw[0]];
      }
    }

    updateScoreboard(scores, labels, this.state.message);

    if (isBriscola && !is4) this.renderBriscola2();
    else if (isBriscola && is4) this.renderFourTable('table-briscola-4', 'briscola');
    else if (isTs2) this.renderTressette2();
    else {
      this.renderFourTable('table-tressette', 'tressette');
      this.renderTressetteExtras('tressette-signals', 'tressette-accusi');
    }

    if ((this.state.handOver || this.state.gameOver) && !this._showingResult) {
      this.showResult();
    }
  }

  renderTressette2() {
    const state = this.state;
    const me = this.you.seatIndex;
    const opp = 1 - me;

    setMessage('game-message-ts2', state.message);

    document.getElementById('ts2-opp-name').textContent = state.playerNames[opp];
    document.getElementById('ts2-opp-count').textContent = state.handCounts[opp];
    document.getElementById('ts2-player-name').textContent = state.playerNames[me];

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

    this.renderDrawReveal('ts2-draw-reveal', state);

    renderFaceDownHand(document.getElementById('ts2-opp-hand'), state.handCounts[opp], {
      facing: 'north',
    });
    renderHand(document.getElementById('ts2-player-hand'), state.hands[me], {
      game: 'tressette',
      disabled: !state.canPlay,
      onClick: (card) => this.playCard(card.id),
    });
    markPlayable('#ts2-player-hand', state.playableCardIds);
    renderTrick(
      document.getElementById('trick-area-ts2'),
      state.trick,
      state.playerNames,
      'tressette'
    );
    this.renderTressetteExtras('tressette2-signals', 'tressette2-accusi');
  }

  renderDrawReveal(elId, state) {
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
      label.textContent = state.playerNames[d.player] || `P${d.player + 1}`;
      wrap.appendChild(label);
      wrap.appendChild(createCardElement(d.card, { game: 'tressette' }));
      el.appendChild(wrap);
    }
  }

  renderTressetteExtras(signalsId = 'tressette-signals', logId = 'tressette-accusi') {
    const state = this.state;
    renderSignalBar(document.getElementById(signalsId), {
      enabled: !!state.canSignal,
      selected: this.selectedSignal,
      onSelect: (sig) => {
        this.selectedSignal = sig;
        this.net.send({ type: 'setSignal', signal: sig });
        this.renderTressetteExtras(signalsId, logId);
      },
    });
    const log = document.getElementById(logId);
    if (log) {
      log.textContent = state.accusoLog?.length
        ? `Accusi: ${state.accusoLog.join(' · ')}`
        : '';
    }
  }

  renderBriscola2() {
    const state = this.state;
    const me = this.you.seatIndex;
    const opp = 1 - me;

    setMessage('game-message', state.message);
    this.renderDeck(state, 'deck-area', 'deck-pile', 'trump-card', 'deck-count', 'trump-label');

    document.querySelector('#table-briscola .opponent-area .player-name').textContent =
      state.playerNames[opp];
    document.getElementById('cpu-count').textContent = state.handCounts[opp];
    renderFaceDownHand(document.getElementById('cpu-hand'), state.handCounts[opp], {
      facing: 'north',
    });

    document.querySelector('#table-briscola .player-area .player-name').textContent =
      state.playerNames[me];

    renderHand(document.getElementById('player-hand'), state.hands[me], {
      game: 'briscola',
      disabled: !state.canPlay,
      onClick: (card) => this.playCard(card.id),
    });
    markPlayable('#player-hand', state.playableCardIds);
    renderTrick(document.getElementById('trick-area'), state.trick, state.playerNames, 'briscola');
  }

  renderFourTable(tableId, game) {
    const state = this.state;
    const me = this.you.seatIndex;
    // Mappa posti assoluti -> posizioni relative (io sempre sud)
    const rel = (abs) => (abs - me + 4) % 4;
    const absFromRel = (r) => (me + r) % 4;

    const map = {
      0: { hand: 'hand-south', nameSel: '.seat-south .seat-name' },
      1: { hand: 'hand-east', nameSel: '.seat-east .seat-name' },
      2: { hand: 'hand-north', nameSel: '.seat-north .seat-name' },
      3: { hand: 'hand-west', nameSel: '.seat-west .seat-name' },
    };

    // Per table-briscola-4 usiamo id dedicati
    const prefix = tableId === 'table-briscola-4' ? 'b4-' : '';
    const handId = (relSeat) => {
      const names = ['south', 'east', 'north', 'west'];
      return prefix ? `${prefix}hand-${names[relSeat]}` : map[relSeat].hand;
    };
    const nameSel = (relSeat) => {
      const names = ['south', 'east', 'north', 'west'];
      return `#${tableId} .seat-${names[relSeat]} .seat-name`;
    };

    const facingRel = ['south', 'east', 'north', 'west'];

    for (let r = 0; r < 4; r++) {
      const abs = absFromRel(r);
      const nameEl = document.querySelector(nameSel(r));
      if (nameEl) {
        nameEl.textContent =
          state.playerNames[abs] + (abs === me ? ' (tu)' : '') + (state.currentPlayer === abs ? ' ●' : '');
      }
      const handEl = document.getElementById(handId(r));
      if (!handEl) continue;
      if (abs === me) {
        renderHand(handEl, state.hands[me], {
          game,
          disabled: !state.canPlay,
          onClick: (card) => this.playCard(card.id),
        });
        markPlayable(`#${handId(r)}`, state.playableCardIds);
      } else {
        renderFaceDownHand(handEl, state.handCounts[abs], {
          small: true,
          facing: facingRel[r],
        });
      }
    }

    const trickId = prefix ? `${prefix}trick-area` : game === 'tressette' ? 'trick-area-ts' : 'trick-area';
    const msgId = prefix ? `${prefix}game-message` : game === 'tressette' ? 'game-message-ts' : 'game-message';
    setMessage(msgId, state.message);
    highlightSeat(rel(state.currentPlayer));
    // highlight uses data-seat absolute in tressette markup — fix for relative:
    document.querySelectorAll(`#${tableId} .seat`).forEach((s) => s.classList.remove('active'));
    const activeRel = rel(state.currentPlayer);
    const names = ['south', 'east', 'north', 'west'];
    document.querySelector(`#${tableId} .seat-${names[activeRel]}`)?.classList.add('active');

    renderTrick(document.getElementById(trickId), state.trick, state.playerNames, game);

    if (game === 'briscola') {
      this.renderDeck(
        state,
        `${prefix}deck-area`,
        `${prefix}deck-pile`,
        `${prefix}trump-card`,
        `${prefix}deck-count`,
        `${prefix}trump-label`
      );
    }
  }

  renderDeck(state, areaId, pileId, trumpId, countId, labelId) {
    const deckArea = document.getElementById(areaId);
    const deckPile = document.getElementById(pileId);
    const trumpEl = document.getElementById(trumpId);
    const deckCount = document.getElementById(countId);
    const trumpLabel = document.getElementById(labelId);
    if (!deckArea) return;

    trumpEl.innerHTML = '';
    deckPile.className = 'deck-pile';
    trumpEl.className = 'trump-slot';
    deckPile.onclick = null;
    trumpEl.onclick = null;

    if (!state.deckRemaining) {
      deckArea.classList.add('hidden');
      return;
    }
    deckArea.classList.remove('hidden');

    if (state.trumpCard) {
      trumpLabel.textContent = `Briscola: ${SUIT_NAMES[state.trump] || state.trump}`;
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
      deckCount.textContent = 'Ultima carta';
    }

    if (state.canDraw) {
      if (state.faceDownCount > 0) {
        deckPile.classList.add('drawable');
        deckPile.onclick = () => this.draw();
      } else {
        trumpEl.classList.add('drawable');
        trumpEl.onclick = () => this.draw();
      }
    }
  }

  playCard(cardId) {
    const payload = { type: 'playCard', cardId };
    if (this.state?.gameType === 'tressette' && this.selectedSignal) {
      payload.signal = this.selectedSignal;
    }
    this.net.send(payload);
    this.selectedSignal = null;
  }

  draw() {
    this.net.send({ type: 'draw' });
  }

  showResult() {
    this._showingResult = true;
    const state = this.state;
    let title = 'Mano terminata';
    if (state.gameOver) {
      if (state.winner === -1) title = 'Patta';
      else {
        const myTeam = this.you.seatIndex % 2;
        title = state.winner === myTeam ? 'Vittoria!' : 'Sconfitta';
      }
    }
    const canRematch = this.you?.isHost;
    showOverlay(
      title,
      state.message,
      () => {
        this._showingResult = false;
        if (canRematch) this.net.send({ type: 'rematch' });
      },
      canRematch ? 'Nuova partita' : 'OK'
    );
  }

  stop() {
    hideOverlay();
    this._showingResult = false;
  }
}

function markPlayable(selector, ids) {
  document.querySelectorAll(`${selector} .card`).forEach((el) => {
    const id = parseInt(el.dataset.cardId, 10);
    if (ids?.includes(id)) el.classList.add('playable');
  });
}
