import { briscolaPoints, tressettePoints } from './cards.js';

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
  el.dataset.cardId = card.id;
  el.dataset.suit = card.suit;
  el.dataset.rank = card.rank;

  if (faceDown) {
    el.classList.add('card-back');
    return el;
  }

  el.classList.add('card-face');
  if (playable) el.classList.add('playable');
  if (disabled) el.classList.add('disabled');
  if (isTrump) el.classList.add('trump');

  // Immagine a tutto campo (niente simboli testo)
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
    const name = playerNames
      ? playerNames[entry.player]
      : entry.player === 0
        ? 'Tu'
        : 'CPU';
    container.appendChild(
      createCardElement(entry.card, { game, playerTag: name })
    );
  }
}

export function showOverlay(title, detail, onContinue) {
  const overlay = document.getElementById('hand-result');
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-detail').textContent = detail;
  overlay.classList.remove('hidden');

  const btn = document.getElementById('btn-continue');
  const handler = () => {
    overlay.classList.add('hidden');
    btn.removeEventListener('click', handler);
    onContinue?.();
  };
  btn.addEventListener('click', handler);
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
