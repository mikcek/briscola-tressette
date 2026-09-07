/** Carte italiane — mazzo da 40 (condiviso server/client) */

export const SUITS = ['coppe', 'denari', 'bastoni', 'spade'];

export const SUIT_SYMBOLS = {
  coppe: '♥',
  denari: '♦',
  bastoni: '♣',
  spade: '♠',
};

export const SUIT_COLORS = {
  coppe: 'red',
  denari: 'red',
  bastoni: 'black',
  spade: 'black',
};

export const SUIT_NAMES = {
  coppe: 'Coppe',
  denari: 'Denari',
  bastoni: 'Bastoni',
  spade: 'Spade',
};

export const RANKS = ['asso', '2', '3', '4', '5', '6', '7', 'fante', 'cavallo', 're'];

export const RANK_LABELS = {
  asso: 'A',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  fante: 'F',
  cavallo: 'C',
  re: 'R',
};

export const BRISCOLA_POINTS = {
  asso: 11,
  '3': 10,
  re: 4,
  cavallo: 3,
  fante: 2,
};

export const BRISCOLA_RANK_ORDER = ['2', '4', '5', '6', '7', 'fante', 'cavallo', 're', '3', 'asso'];

export const TRESSETTE_RANK_ORDER = ['4', '5', '6', '7', 'fante', 'cavallo', 're', 'asso', '2', '3'];

/** Ordine visualizzazione mano Tressette: semi poi rango (dal più forte). */
export const TRESSETTE_HAND_SUIT_ORDER = ['denari', 'spade', 'bastoni', 'coppe'];
export const TRESSETTE_HAND_RANK_ORDER = [
  '3',
  '2',
  'asso',
  're',
  'cavallo',
  'fante',
  '7',
  '6',
  '5',
  '4',
];

/** Valore in terzi: Asso=3/3, Tre/Due/Re/Cavallo/Fante=1/3, resto=0 */
export const TRESSETTE_THIRDS = {
  asso: 3,
  '3': 1,
  '2': 1,
  re: 1,
  cavallo: 1,
  fante: 1,
};

/** Compat UI: punti decimali (⅓ per figure/carichi, 1 per asso) */
export const TRESSETTE_POINTS = {
  asso: 1,
  '3': 1 / 3,
  '2': 1 / 3,
  re: 1 / 3,
  cavallo: 1 / 3,
  fante: 1 / 3,
};

let cardIdCounter = 0;

export function cardImagePath(suit, rank) {
  return `./cards/${suit}_${rank}.png`;
}

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: ++cardIdCounter,
        suit,
        rank,
        label: RANK_LABELS[rank],
        symbol: SUIT_SYMBOLS[suit],
        color: SUIT_COLORS[suit],
        image: cardImagePath(suit, rank),
      });
    }
  }
  return deck;
}

export function shuffle(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function briscolaPoints(card) {
  return BRISCOLA_POINTS[card.rank] ?? 0;
}

export function tressettePoints(card) {
  return TRESSETTE_POINTS[card.rank] ?? 0;
}

export function tressetteThirds(card) {
  return TRESSETTE_THIRDS[card.rank] ?? 0;
}

export function briscolaRankIndex(card) {
  return BRISCOLA_RANK_ORDER.indexOf(card.rank);
}

export function tressetteRankIndex(card) {
  return TRESSETTE_RANK_ORDER.indexOf(card.rank);
}

/** Ordina la mano per seme (denari→spade→bastoni→coppe) e rango 3→2→A→R→C→F→7→6→5→4. */
export function sortTressetteHand(cards) {
  return [...cards].sort((a, b) => {
    const suitDiff =
      TRESSETTE_HAND_SUIT_ORDER.indexOf(a.suit) - TRESSETTE_HAND_SUIT_ORDER.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return (
      TRESSETTE_HAND_RANK_ORDER.indexOf(a.rank) - TRESSETTE_HAND_RANK_ORDER.indexOf(b.rank)
    );
  });
}

export function compareBriscola(a, b, trumpSuit) {
  const aTrump = a.suit === trumpSuit;
  const bTrump = b.suit === trumpSuit;

  if (aTrump && !bTrump) return 1;
  if (!aTrump && bTrump) return -1;
  if (aTrump && bTrump) return briscolaRankIndex(a) - briscolaRankIndex(b);
  if (a.suit !== b.suit) return 0;
  return briscolaRankIndex(a) - briscolaRankIndex(b);
}

export function compareTressette(a, b, leadSuit) {
  const aFollows = a.suit === leadSuit;
  const bFollows = b.suit === leadSuit;
  if (aFollows && !bFollows) return 1;
  if (!aFollows && bFollows) return -1;
  if (!aFollows && !bFollows) return 0;
  return tressetteRankIndex(a) - tressetteRankIndex(b);
}

export function sumBriscolaPoints(cards) {
  return cards.reduce((sum, c) => sum + briscolaPoints(c), 0);
}

/** Punti carte Tressette: somma terzi poi arrotonda per difetto. */
export function sumTressettePoints(cards) {
  const thirds = cards.reduce((sum, c) => sum + tressetteThirds(c), 0);
  return Math.floor(thirds / 3);
}

/**
 * Rileva accusi in una mano (regolamento ufficiale).
 * Restituisce { points, labels[] }.
 */
export function detectAccusi(hand) {
  const labels = [];
  let points = 0;

  for (const suit of SUITS) {
    const ranks = new Set(hand.filter((c) => c.suit === suit).map((c) => c.rank));
    if (ranks.has('asso') && ranks.has('2') && ranks.has('3')) {
      labels.push(`Napoletana di ${SUIT_NAMES[suit]}`);
      points += 3;
    }
  }

  for (const rank of ['asso', '2', '3']) {
    const count = hand.filter((c) => c.rank === rank).length;
    const name = rank === 'asso' ? 'Assi' : rank === '2' ? 'Due' : 'Tre';
    if (count === 4) {
      labels.push(`Super Bongioco (${name})`);
      points += 4;
    } else if (count === 3) {
      labels.push(`Bongioco (${name})`);
      points += 3;
    }
  }

  return { points, labels };
}

export function resetCardIds() {
  cardIdCounter = 0;
}

export function publicCard(card) {
  if (!card) return null;
  return {
    id: card.id,
    suit: card.suit,
    rank: card.rank,
    label: card.label,
    symbol: card.symbol,
    color: card.color,
    image: card.image,
  };
}

/* ——— Scopa ——— */

const SCOPA_RANK_VALUE = {
  asso: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  fante: 8,
  cavallo: 9,
  re: 10,
};

const PRIMIERA_VALUE = {
  '7': 21,
  '6': 18,
  asso: 16,
  '5': 15,
  '4': 14,
  '3': 13,
  '2': 12,
  fante: 10,
  cavallo: 10,
  re: 10,
};

export function isSettebello(card) {
  return card?.suit === 'denari' && card?.rank === '7';
}

/** Valore numerico per le prese (1–10). */
export function scopaCaptureValue(card) {
  return SCOPA_RANK_VALUE[card?.rank] ?? 0;
}

export function primieraValue(card) {
  return PRIMIERA_VALUE[card?.rank] ?? 0;
}

/**
 * Primiera: somma del miglior valore per ogni seme.
 * Restituisce { score, complete } — complete=false se manca un seme.
 */
export function computePrimiera(cards) {
  const best = { coppe: 0, denari: 0, bastoni: 0, spade: 0 };
  for (const c of cards) {
    const v = primieraValue(c);
    if (v > best[c.suit]) best[c.suit] = v;
  }
  const complete = SUITS.every((s) => best[s] > 0);
  const score = complete ? SUITS.reduce((sum, s) => sum + best[s], 0) : 0;
  return { score, complete, bySuit: best };
}

/**
 * Buongioco sulla mano di 3 carte.
 * @returns {{ points: 0|2|3|7, label: string|null }}
 */
export function detectBuongioco(hand) {
  if (!hand || hand.length !== 3) return { points: 0, label: null };

  const values = hand.map(scopaCaptureValue);
  const sum = values.reduce((a, b) => a + b, 0);
  const ranks = hand.map((c) => c.rank);
  const uniq = new Set(ranks).size;

  if (uniq === 1) {
    return { points: 7, label: 'Buongioco (3 uguali)' };
  }
  if (sum < 9 && uniq === 2) {
    return { points: 3, label: 'Buongioco (2 uguali, somma < 9)' };
  }
  if (sum < 9 && uniq === 3) {
    return { points: 2, label: 'Buongioco (3 diverse, somma < 9)' };
  }
  return { points: 0, label: null };
}

/**
 * Tutti i sottoinsiemi non vuoti di `table` la cui somma valori = target.
 * Restituisce array di array di carte (riferimenti).
 */
export function findSumSubsets(table, target) {
  const results = [];
  const n = table.length;
  const limit = 1 << n;
  for (let mask = 1; mask < limit; mask++) {
    let sum = 0;
    const subset = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += scopaCaptureValue(table[i]);
        subset.push(table[i]);
        if (sum > target) break;
      }
    }
    if (sum === target) results.push(subset);
  }
  return results;
}

/**
 * Prese legali per una carta giocata sul tavolo.
 * Obbligo di presa singola se esiste carta di uguale valore.
 * Per Settebello (jolly): se jollyValue è dato usa quel valore; altrimenti unisce tutte le prese per valori 1–10.
 * @returns {{ captures: object[][], isJolly: boolean }}
 */
export function getScopaLegalCaptures(table, card, jollyValue = null) {
  if (!card) return { captures: [], isJolly: false };
  const jolly = isSettebello(card);

  if (jolly && jollyValue == null) {
    const seen = new Map();
    for (let v = 1; v <= 10; v++) {
      const { captures } = getScopaLegalCaptures(table, card, v);
      for (const cap of captures) {
        const key = cap
          .map((c) => c.id)
          .sort((a, b) => a - b)
          .join(',');
        if (!seen.has(key)) seen.set(key, cap);
      }
    }
    return { captures: [...seen.values()], isJolly: true };
  }

  const value = jolly ? Number(jollyValue) : scopaCaptureValue(card);
  if (!value || value < 1 || value > 10) return { captures: [], isJolly: jolly };

  const singles = table.filter((c) => scopaCaptureValue(c) === value);
  if (singles.length > 0) {
    return {
      captures: singles.map((c) => [c]),
      isJolly: jolly,
    };
  }

  return {
    captures: findSumSubsets(table, value),
    isJolly: jolly,
  };
}
