import {
  briscolaPoints,
  briscolaRankIndex,
  compareBriscola,
  tressettePoints,
  tressetteRankIndex,
  compareTressette,
} from './cards.js';

export function chooseBriscolaMove(hand, trick, trump, isFirst) {
  if (hand.length === 0) return null;

  if (!isFirst && trick.length === 1) {
    const lead = trick[0].card;
    const leadPoints = briscolaPoints(lead);
    const winning = hand.filter((c) => compareBriscola(c, lead, trump) > 0);

    if (winning.length > 0 && (leadPoints > 0 || winning.some((c) => briscolaPoints(c) === 0))) {
      return winning.reduce((best, c) => {
        const cost = briscolaPoints(c);
        const bestCost = briscolaPoints(best);
        if (cost !== bestCost) return cost < bestCost ? c : best;
        return briscolaRankIndex(c) < briscolaRankIndex(best) ? c : best;
      });
    }

    return hand.reduce((best, c) => {
      const cTrump = c.suit === trump;
      const bTrump = best.suit === trump;
      if (cTrump !== bTrump) return cTrump ? best : c;
      const cp = briscolaPoints(c);
      const bp = briscolaPoints(best);
      if (cp !== bp) return cp < bp ? c : best;
      return briscolaRankIndex(c) < briscolaRankIndex(best) ? c : best;
    });
  }

  return hand.reduce((best, c) => {
    const cTrump = c.suit === trump;
    const bTrump = best.suit === trump;
    if (cTrump !== bTrump) return cTrump ? best : c;
    const cp = briscolaPoints(c);
    const bp = briscolaPoints(best);
    if (cp !== bp) return cp < bp ? c : best;
    return briscolaRankIndex(c) < briscolaRankIndex(best) ? c : best;
  });
}

export function chooseTressetteMove(hand, trick, leadSuit) {
  if (hand.length === 0) return null;

  const playable = leadSuit
    ? hand.some((c) => c.suit === leadSuit)
      ? hand.filter((c) => c.suit === leadSuit)
      : hand
    : hand;

  if (trick.length > 0 && leadSuit) {
    let bestLead = trick.find((t) => t.card.suit === leadSuit)?.card;
    if (bestLead) {
      for (const t of trick) {
        if (t.card.suit === leadSuit && compareTressette(t.card, bestLead, leadSuit) > 0) {
          bestLead = t.card;
        }
      }
    }

    const winning = playable.filter(
      (c) => c.suit === leadSuit && bestLead && compareTressette(c, bestLead, leadSuit) > 0
    );

    if (winning.length > 0) {
      return winning.reduce((best, c) =>
        tressettePoints(c) < tressettePoints(best) ? c : best
      );
    }

    return playable.reduce((best, c) =>
      tressetteRankIndex(c) < tressetteRankIndex(best) ? c : best
    );
  }

  return playable.reduce((best, c) =>
    tressetteRankIndex(c) > tressetteRankIndex(best) ? c : best
  );
}
