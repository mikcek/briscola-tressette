import { briscolaPoints, tressettePoints, sortTressetteHand } from '/shared/cards.js';

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

/** Gradi tra carte adiacenti nel ventaglio (10 carte → 150°, 3 → 45°, …). */
const FAN_STEP_DEG = 15;
const FAN_PIVOT = '2cm';
const FAN_PIVOT_MINI = '1.2cm';

/**
 * @param {HTMLElement} container
 * @param {HTMLElement[]} cardEls
 * @param {{ facing?: string, small?: boolean }} options
 */
function layoutFan(container, cardEls, options = {}) {
  const facing = options.facing || 'south';
  const small = !!options.small;
  const n = cardEls.length;

  container.classList.add('hand-fan');
  container.classList.toggle('hand-fan-mini', small);
  container.classList.remove('fan-south', 'fan-north', 'fan-east', 'fan-west');
  container.classList.add(`fan-${facing}`);
  container.style.removeProperty('--fan-scale');
  container.style.setProperty('--fan-pivot', small ? FAN_PIVOT_MINI : FAN_PIVOT);
  container.style.setProperty('--fan-count', String(n));

  if (n === 0) return;

  const span = (n - 1) * FAN_STEP_DEG;
  const start = -span / 2;

  cardEls.forEach((el, i) => {
    const angle = start + i * FAN_STEP_DEG;
    el.style.setProperty('--fan-angle', `${angle}deg`);
    el.style.setProperty('--fan-z', String(i + 1));
    container.appendChild(el);
  });

  requestAnimationFrame(() => fitFanToWidth(container, n, span / 2, { facing, small }));
}

/**
 * Mano del giocatore a ventaglio (impugnatura reale).
 * @param {HTMLElement} container
 * @param {object[]} cards
 * @param {{ fan?: boolean, facing?: string } & object} options
 */
export function renderHand(container, cards, options = {}) {
  const useFan =
    options.fan !== false &&
    (options.fan === true || container.classList.contains('player-hand'));

  let list = cards;
  if (options.game === 'tressette') {
    list = sortTressetteHand(cards);
  }

  container.innerHTML = '';
  container.classList.remove(
    'hand-fan',
    'hand-fan-mini',
    'fan-south',
    'fan-north',
    'fan-east',
    'fan-west'
  );
  container.style.removeProperty('--fan-scale');

  if (!useFan || list.length === 0) {
    for (const card of list) {
      container.appendChild(createCardElement(card, options));
    }
    return;
  }

  const els = list.map((card) => createCardElement(card, options));
  layoutFan(container, els, {
    facing: options.facing || 'south',
    small: !!options.small,
  });
}

function fitFanToWidth(container, n, maxAbsAngleDeg, options = {}) {
  if (!container.isConnected || n < 2) return;
  const small = !!options.small;
  const facing = options.facing || 'south';
  const styles = getComputedStyle(document.documentElement);
  const cardW = small
    ? parseFloat(styles.getPropertyValue('--card-mini-w')) || 48
    : parseFloat(styles.getPropertyValue('--card-w')) || 70;
  const cardH = small
    ? parseFloat(styles.getPropertyValue('--card-mini-h')) || 84
    : parseFloat(styles.getPropertyValue('--card-h')) || 122;
  const pivotPx = (small ? 1.2 : 2) * (96 / 2.54);
  const radius = cardH + pivotPx;
  const rad = (maxAbsAngleDeg * Math.PI) / 180;
  const halfW = Math.sin(rad) * radius + Math.cos(rad) * (cardW / 2) + 8;
  const parent = container.parentElement;
  const avail =
    facing === 'east' || facing === 'west'
      ? (parent?.clientHeight || 240) - 8
      : (parent?.clientWidth || container.clientWidth || 320) - 8;
  const scale = Math.min(1, avail / (halfW * 2));
  container.style.setProperty('--fan-scale', String(Number.isFinite(scale) ? scale : 1));
}

/**
 * Mano coperta a ventaglio (compagni / avversari).
 * @param {HTMLElement} container
 * @param {number} count
 * @param {boolean|{ small?: boolean, facing?: 'south'|'north'|'east'|'west' }} options
 */
export function renderFaceDownHand(container, count, options = {}) {
  const opts = typeof options === 'boolean' ? { small: options } : options || {};
  const small = !!opts.small;
  const facing = opts.facing || 'south';
  const useFan = opts.fan !== false;

  container.innerHTML = '';
  container.classList.remove(
    'hand-fan',
    'hand-fan-mini',
    'fan-south',
    'fan-north',
    'fan-east',
    'fan-west'
  );

  const n = Math.max(0, count | 0);
  const els = [];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'card card-back' + (small ? ' mini' : '');
    els.push(el);
  }

  if (!useFan || n === 0) {
    for (const el of els) container.appendChild(el);
    return;
  }

  layoutFan(container, els, { facing, small });
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

/**
 * Tavolo Scopa: carte scoperte selezionabili.
 */
export function renderScopaTable(container, cards, options = {}) {
  if (!container) return;
  const {
    selectedIds = [],
    highlightIds = null,
    onClick = null,
    disabled = false,
  } = options;

  container.innerHTML = '';
  if (!cards?.length) {
    const empty = document.createElement('div');
    empty.className = 'scopa-table-empty';
    empty.textContent = 'Tavolo vuoto';
    container.appendChild(empty);
    return;
  }

  for (const card of cards) {
    const el = createCardElement(card, { game: 'scopa' });
    el.classList.add('scopa-table-card');
    if (selectedIds.includes(card.id)) el.classList.add('selected');
    if (highlightIds && highlightIds.includes(card.id)) el.classList.add('capture-hint');
    if (disabled) el.classList.add('disabled');
    else if (onClick) {
      el.addEventListener('click', () => onClick(card));
    }
    container.appendChild(el);
  }
}
