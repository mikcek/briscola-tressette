import { briscolaPoints, tressettePoints } from '/shared/cards.js';

export function createCardElement(card, options = {}) {
  const {
    faceDown = false,
    playable = false,
    disabled = false,
    isTrump = false,
    onClick = null,
    playerTag = null,
  } = options;

  const el = document.createElement('div');
  el.className = 'card';
  if (card?.id != null) el.dataset.cardId = card.id;
  if (card?.suit) el.dataset.suit = card.suit;
  if (card?.rank) el.dataset.rank = card.rank;

  if (faceDown || !card) {
    el.classList.add('card-back');
    return el;
  }

  el.classList.add('card-face');
  if (playable) el.classList.add('playable');
  if (disabled) el.classList.add('disabled');
  if (isTrump) el.classList.add('trump');

  el.style.backgroundImage = `url("${card.image}")`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${card.label} di ${card.suit}`);

  const points =
    options.game === 'briscola'
      ? briscolaPoints(card)
      : options.game === 'tressette'
        ? tressettePoints(card)
        : 0;

  if (points > 0) {
    const pts = document.createElement('span');
    pts.className = 'card-points';
    pts.textContent = options.game === 'tressette' && points < 1 ? '⅓' : String(points);
    el.appendChild(pts);
  }

  if (playerTag) {
    el.classList.add('trick-card');
    const tag = document.createElement('span');
    tag.className = 'player-tag';
    tag.textContent = playerTag;
    el.appendChild(tag);
  }

  if (onClick && !disabled) {
    el.addEventListener('click', () => onClick(card));
  }

  return el;
}

export function renderHand(container, cards, options = {}) {
  container.innerHTML = '';
  for (const card of cards) {
    container.appendChild(createCardElement(card, options));
  }
}

export function renderFaceDownHand(container, count, small = false) {
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'card card-back';
    if (small) el.classList.add('mini');
    container.appendChild(el);
  }
}

export function renderTrick(container, trick, playerNames, game) {
  container.innerHTML = '';
  for (const entry of trick) {
    const name = playerNames?.[entry.player] ?? `P${entry.player + 1}`;
    const signalTag = entry.signal
      ? { busso: 'Busso', volo: 'Volo', striscio: 'Striscio' }[entry.signal]
      : null;
    const el = createCardElement(entry.card, {
      game,
      playerTag: signalTag ? `${name} · ${signalTag}` : name,
    });
    container.appendChild(el);
  }
}

export function renderSignalBar(container, { enabled, selected, onSelect }) {
  if (!container) return;
  container.innerHTML = '';
  container.classList.toggle('hidden', !enabled);
  if (!enabled) return;

  const title = document.createElement('span');
  title.className = 'signal-label';
  title.textContent = 'Segnale:';
  container.appendChild(title);

  for (const [id, label] of [
    [null, 'Nessuno'],
    ['busso', 'Busso'],
    ['volo', 'Volo'],
    ['striscio', 'Striscio'],
  ]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'signal-btn' + ((selected || null) === id ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => onSelect?.(id));
    container.appendChild(btn);
  }
}

export function showOverlay(title, detail, onContinue, buttonLabel = 'Continua') {
  const overlay = document.getElementById('hand-result');
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-detail').textContent = detail;
  const btn = document.getElementById('btn-continue');
  btn.textContent = buttonLabel;
  overlay.classList.remove('hidden');

  const handler = () => {
    overlay.classList.add('hidden');
    btn.removeEventListener('click', handler);
    onContinue?.();
  };
  btn.addEventListener('click', handler);
}

export function hideOverlay() {
  document.getElementById('hand-result').classList.add('hidden');
}

export function updateScoreboard(scores, labels, info) {
  document.getElementById('score-a').textContent = scores[0];
  document.getElementById('score-b').textContent = scores[1];
  document.getElementById('label-team-a').textContent = labels[0];
  document.getElementById('label-team-b').textContent = labels[1];
  document.getElementById('score-info').textContent = info || '';
}

export function setMessage(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

export function highlightSeat(seatIndex) {
  document.querySelectorAll('.seat').forEach((s) => s.classList.remove('active'));
  const seat = document.querySelector(`.seat[data-seat="${seatIndex}"]`);
  if (seat) seat.classList.add('active');
}

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}
