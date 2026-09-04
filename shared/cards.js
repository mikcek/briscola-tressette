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

export const TRESSETTE_POINTS = {
  asso: 1,
  '2': 1,
  '3': 1,
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

export function briscolaRankIndex(card) {
  return BRISCOLA_RANK_ORDER.indexOf(card.rank);
}

export function tressetteRankIndex(card) {
  return TRESSETTE_RANK_ORDER.indexOf(card.rank);
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

export function sumTressettePoints(cards) {
  const raw = cards.reduce((sum, c) => sum + tressettePoints(c), 0);
  return Math.floor(raw + (raw % 1 >= 0.34 ? 1 : 0));
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
