import {
  SUITS,
  briscolaPoints,
  briscolaRankIndex,
  compareBriscola,
  tressettePoints,
  tressetteRankIndex,
  tressetteThirds,
  compareTressette,
} from './cards.js';

function pickMin(cards, scoreFn) {
  return cards.reduce((best, c) => (scoreFn(c) < scoreFn(best) ? c : best));
}

function pickMax(cards, scoreFn) {
  return cards.reduce((best, c) => (scoreFn(c) > scoreFn(best) ? c : best));
}

function teamOf(seat) {
  return seat % 2;
}

/** Carta attualmente vincente nel trick (Briscola). */
function briscolaTrickWinner(trick, trump) {
  if (!trick.length) return null;
  let best = trick[0];
  for (let i = 1; i < trick.length; i++) {
    if (compareBriscola(trick[i].card, best.card, trump) > 0) best = trick[i];
  }
  return best;
}

function trickPointsBriscola(trick) {
  return trick.reduce((s, t) => s + briscolaPoints(t.card), 0);
}

/**
 * Briscola — euristiche di base (2 e 4 giocatori).
 * @param {object[]} hand
 * @param {{player:number, card:object}[]} trick
 * @param {string} trump
 * @param {boolean|{ seat?: number, playerCount?: number }} isFirstOrOpts
 */
export function chooseBriscolaMove(hand, trick, trump, isFirstOrOpts = true) {
  if (!hand?.length) return null;

  const opts =
    typeof isFirstOrOpts === 'boolean'
      ? { isFirst: isFirstOrOpts, seat: -1, playerCount: trick.length <= 1 ? 2 : 4 }
      : {
          isFirst: isFirstOrOpts.isFirst ?? trick.length === 0,
          seat: isFirstOrOpts.seat ?? -1,
          playerCount: isFirstOrOpts.playerCount ?? 2,
        };

  const seat = opts.seat;
  const playerCount = opts.playerCount;
  const isFirst = opts.isFirst || trick.length === 0;

  if (isFirst) {
    return briscolaLead(hand, trump);
  }

  const winner = briscolaTrickWinner(trick, trump);
  const tablePts = trickPointsBriscola(trick);
  const amLast = trick.length + 1 >= playerCount;
  const partnerWinning =
    seat >= 0 && winner && teamOf(winner.player) === teamOf(seat) && winner.player !== seat;

  const canBeat = hand.filter((c) => compareBriscola(c, winner.card, trump) > 0);

  // Compagno sta vincendo: non sovrasta, scarica basso (salvo ultimi colpi con molti punti)
  if (partnerWinning && !(amLast && tablePts >= 10 && canBeat.length)) {
    return briscolaDump(hand, trump);
  }

  if (canBeat.length) {
    const worthTaking = tablePts >= 2 || amLast || tablePts + maxBriscolaPoints(canBeat) >= 10;
    if (worthTaking || canBeat.some((c) => briscolaPoints(c) === 0 && c.suit !== trump)) {
      // Prendi col vincitore più economico
      return pickMin(canBeat, (c) => {
        const trumpPenalty = c.suit === trump ? 20 : 0;
        const pointCost = briscolaPoints(c) * 3;
        const rank = briscolaRankIndex(c);
        // Preferisci non-briscola basse; risparmia Asso/3 di briscola
        const precious =
          c.suit === trump && (c.rank === 'asso' || c.rank === '3') ? 40 : 0;
        return trumpPenalty + pointCost + rank + precious;
      });
    }
  }

  return briscolaDump(hand, trump);
}

function maxBriscolaPoints(cards) {
  return cards.reduce((m, c) => Math.max(m, briscolaPoints(c)), 0);
}

function briscolaLead(hand, trump) {
  const nonTrump = hand.filter((c) => c.suit !== trump);
  const pool = nonTrump.length ? nonTrump : hand;

  // Evita di uscire con carichi; preferisci lische (0 punti) basse
  const lisca = pool.filter((c) => briscolaPoints(c) === 0);
  if (lisca.length) {
    return pickMin(lisca, (c) => briscolaRankIndex(c) + (c.suit === trump ? 50 : 0));
  }

  // Altrimenti la carta di minor valore (non Asso/3 se possibile)
  const safe = pool.filter((c) => c.rank !== 'asso' && c.rank !== '3');
  const from = safe.length ? safe : pool;
  return pickMin(from, (c) => briscolaPoints(c) * 10 + briscolaRankIndex(c) + (c.suit === trump ? 30 : 0));
}

function briscolaDump(hand, trump) {
  // Scarta: niente punti, niente briscola se possibile
  return pickMin(hand, (c) => {
    const pts = briscolaPoints(c);
    const trumpPenalty = c.suit === trump ? 100 : 0;
    const precious = pts >= 10 ? 50 : pts * 5;
    return trumpPenalty + precious + briscolaRankIndex(c);
  });
}

/** Carta vincente attuale nel trick Tressette (solo seme di uscita). */
function tressetteTrickWinner(trick, leadSuit) {
  if (!trick.length) return null;
  let best = null;
  for (const t of trick) {
    if (t.card.suit !== leadSuit) continue;
    if (!best || compareTressette(t.card, best.card, leadSuit) > 0) best = t;
  }
  return best;
}

function trickThirds(trick) {
  return trick.reduce((s, t) => s + tressetteThirds(t.card), 0);
}

function playableTressette(hand, leadSuit) {
  if (!leadSuit) return [...hand];
  const following = hand.filter((c) => c.suit === leadSuit);
  return following.length ? following : [...hand];
}

function suitLength(hand, suit) {
  return hand.filter((c) => c.suit === suit).length;
}

/**
 * Tressette — uscita, risposta e scarto più sensati (2 e 4 giocatori).
 * @param {object[]} hand
 * @param {{player:number, card:object}[]} trick
 * @param {string|null} leadSuit
 * @param {{ seat?: number, playerCount?: number }} [opts]
 */
export function chooseTressetteMove(hand, trick, leadSuit, opts = {}) {
  if (!hand?.length) return null;

  const seat = opts.seat ?? -1;
  const playerCount = opts.playerCount ?? (trick.length >= 2 ? 4 : 2);
  const playable = playableTressette(hand, leadSuit);

  if (trick.length === 0) {
    return tressetteLead(hand);
  }

  const winner = tressetteTrickWinner(trick, leadSuit);
  const tableThirds = trickThirds(trick);
  const amLast = trick.length + 1 >= playerCount;
  const mustFollow = playable.every((c) => c.suit === leadSuit) && leadSuit;
  const partnerWinning =
    seat >= 0 && winner && teamOf(winner.player) === teamOf(seat) && winner.player !== seat;

  // Fuori seme: solo scarto (non puoi prendere)
  if (!mustFollow) {
    return tressetteDump(playable, hand);
  }

  const canBeat = winner
    ? playable.filter((c) => compareTressette(c, winner.card, leadSuit) > 0)
    : [...playable];

  // Compagno in vantaggio: non sovrasta; gioca la più bassa
  if (partnerWinning) {
    if (amLast && tableThirds >= 3 && canBeat.length) {
      // Ultimo e c'è un asso (o tanti terzi): conviene prendere noi
      return pickMin(canBeat, (c) => tressetteRankIndex(c) + tressetteThirds(c) * 2);
    }
    return pickMin(playable, (c) => tressetteRankIndex(c) + tressetteThirds(c) * 3);
  }

  // Avversario (o nessuno) vince: prova a prendere se ha senso
  if (canBeat.length) {
    const worth =
      tableThirds >= 1 || // c'è almeno un terzo/asso
      amLast ||
      canBeat.some((c) => tressetteThirds(c) === 0); // posso passare lisca

    if (worth) {
      // Il più debole che batte ancora (risparmia 3/2)
      return pickMin(canBeat, (c) => {
        const rank = tressetteRankIndex(c);
        const keep3 = c.rank === '3' ? 8 : c.rank === '2' ? 4 : 0;
        return rank + keep3 + tressetteThirds(c);
      });
    }
  }

  // Non conviene / non posso: scarta il più basso del seme
  return pickMin(playable, (c) => tressetteRankIndex(c) + tressetteThirds(c) * 5);
}

function tressetteLead(hand) {
  // Uscita: dal seme più lungo; se hai un carico (3/2/A) in un seme lungo, esci con quello
  const bySuit = SUITS.map((suit) => ({
    suit,
    cards: hand.filter((c) => c.suit === suit),
  })).filter((s) => s.cards.length > 0);

  bySuit.sort((a, b) => b.cards.length - a.cards.length);

  // Preferisci uscire con 3 (o 2/asso) dal seme più lungo che ne ha uno
  for (const group of bySuit) {
    if (group.cards.length < 2) continue;
    const three = group.cards.find((c) => c.rank === '3');
    if (three) return three;
  }
  for (const group of bySuit) {
    if (group.cards.length < 2) continue;
    const two = group.cards.find((c) => c.rank === '2');
    if (two) return two;
    const ace = group.cards.find((c) => c.rank === 'asso');
    if (ace) return ace;
  }

  // Seme lungo: esci con la più bassa (sviluppo), evita singleton di carico
  const long = bySuit[0];
  if (long.cards.length >= 3) {
    return pickMin(long.cards, (c) => tressetteRankIndex(c) + tressetteThirds(c) * 2);
  }

  // Singleton carico: meglio uscire con quello per prendere subito
  const singletonLoad = bySuit
    .filter((g) => g.cards.length === 1)
    .map((g) => g.cards[0])
    .filter((c) => c.rank === '3' || c.rank === '2' || c.rank === 'asso');
  if (singletonLoad.length) {
    return pickMax(singletonLoad, (c) => tressetteRankIndex(c));
  }

  // Default: carta più bassa in mano (non buttare 3 a caso)
  const nonTop = hand.filter((c) => c.rank !== '3' && c.rank !== '2');
  const pool = nonTop.length ? nonTop : hand;
  return pickMin(pool, (c) => {
    const len = suitLength(hand, c.suit);
    // Preferisci scartare da semi corti deboli
    return tressetteRankIndex(c) + tressetteThirds(c) * 4 - len;
  });
}

function tressetteDump(playable, fullHand) {
  // Fuori seme: libera semi corti senza punti; tieni 3/2/assi
  return pickMin(playable, (c) => {
    const len = suitLength(fullHand, c.suit);
    const thirds = tressetteThirds(c);
    const rank = tressetteRankIndex(c);
    const keepHigh = c.rank === '3' ? 30 : c.rank === '2' ? 20 : c.rank === 'asso' ? 15 : 0;
    // Preferisci seme corto (crea vuoto) e carte basse senza punti
    return thirds * 10 + keepHigh + rank - (len === 1 ? 5 : 0) + len * 0.1;
  });
}
