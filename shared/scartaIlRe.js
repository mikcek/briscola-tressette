import {
  createDeck,
  shuffle,
  resetCardIds,
  publicCard,
  SUIT_NAMES,
} from './cards.js';

/** Colonna 0–8: Asso … Cavallo. Re non ha colonna. */
export function scartaIlReColumn(card) {
  const map = {
    asso: 0,
    '2': 1,
    '3': 2,
    '4': 3,
    '5': 4,
    '6': 5,
    '7': 6,
    fante: 7,
    cavallo: 8,
  };
  return map[card?.rank] ?? -1;
}

export function isKing(card) {
  return card?.rank === 're';
}

/**
 * Solitario "Scarta il Re" — ogni pesca e piazzamento è manuale (suspense).
 */
export class ScartaIlReGame {
  constructor() {
    this.reset();
  }

  reset() {
    resetCardIds();
    this.grid = Array.from({ length: 4 }, () =>
      Array.from({ length: 9 }, () => null)
    );
    this.rowSuits = [null, null, null, null];
    this.pozzo = [];
    this.discarded = [];
    this.current = null;
    this.phase = 'idle'; // draw | hold | won | lost
    this.message = '';
    this.gameOver = false;
    this.won = false;
  }

  startGame() {
    this.reset();
    const deck = shuffle(createDeck());
    let i = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 9; c++) {
        this.grid[r][c] = { card: deck[i++], faceUp: false };
      }
    }
    this.pozzo = deck.slice(36);
    this.phase = 'draw';
    this.message = 'Pesca la prima carta dal pozzo';
  }

  get freeRows() {
    return [0, 1, 2, 3].filter((r) => this.rowSuits[r] == null);
  }

  rowForSuit(suit) {
    const i = this.rowSuits.indexOf(suit);
    return i >= 0 ? i : -1;
  }

  get kingsDiscarded() {
    return this.discarded.filter(isKing).length;
  }

  get faceDownCount() {
    let n = 0;
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell && !cell.faceUp) n += 1;
      }
    }
    return n;
  }

  /** Celle su cui si può piazzare la carta corrente (click manuale). */
  getValidPlaceTargets() {
    if (this.phase !== 'hold' || !this.current || isKing(this.current)) return [];
    const col = scartaIlReColumn(this.current);
    if (col < 0) return [];
    const assigned = this.rowForSuit(this.current.suit);
    if (assigned >= 0) return [{ row: assigned, col }];
    return this.freeRows.map((row) => ({ row, col }));
  }

  /**
   * Pesca una sola carta dal pozzo — niente auto-catena.
   */
  draw() {
    if (this.phase !== 'draw' || this.gameOver) return false;
    if (this.pozzo.length === 0) {
      this.evaluateEnd();
      return true;
    }
    this.current = this.pozzo.pop();
    this.phase = 'hold';
    if (isKing(this.current)) {
      this.message = `Re di ${SUIT_NAMES[this.current.suit]} · Clicca la carta per scartarla`;
    } else {
      const assigned = this.rowForSuit(this.current.suit);
      this.message =
        assigned < 0
          ? `${this.current.label} di ${SUIT_NAMES[this.current.suit]} · Clicca una casella evidenziata (scegli la fila)`
          : `${this.current.label} di ${SUIT_NAMES[this.current.suit]} · Clicca la casella evidenziata per posizionarla`;
    }
    return true;
  }

  /**
   * Scarta il Re in mano (azione manuale).
   */
  discardKing() {
    if (this.phase !== 'hold' || !this.current || !isKing(this.current)) return false;
    this.discarded.push(this.current);
    this.current = null;
    const n = this.kingsDiscarded;
    if (n >= 4) {
      this.evaluateEnd();
      return true;
    }
    this.phase = 'draw';
    this.message = `Re scartato (${n}/4) · Pesca dal pozzo`;
    if (this.pozzo.length === 0) {
      this.evaluateEnd();
    }
    return true;
  }

  /**
   * Piazza la carta corrente sulla casella cliccata (e sola azione di piazzamento).
   * Se il seme non è ancora assegnato, la fila cliccata lo riceve.
   */
  placeAt(row, col) {
    if (this.phase !== 'hold' || !this.current || isKing(this.current)) return false;
    const ok = this.getValidPlaceTargets().some((t) => t.row === row && t.col === col);
    if (!ok) return false;

    if (this.rowForSuit(this.current.suit) < 0) {
      this.rowSuits[row] = this.current.suit;
    }

    const cell = this.grid[row][col];
    const lifted = cell?.card || null;
    const wasFaceDown = cell ? !cell.faceUp : false;

    this.grid[row][col] = { card: this.current, faceUp: true };
    this.current = null;

    if (lifted && wasFaceDown) {
      this.current = lifted;
      this.phase = 'hold';
      if (isKing(lifted)) {
        this.message = `Sollevato Re di ${SUIT_NAMES[lifted.suit]} · Clicca per scartarlo`;
      } else {
        const assigned = this.rowForSuit(lifted.suit);
        this.message =
          assigned < 0
            ? `Sollevata: ${lifted.label} di ${SUIT_NAMES[lifted.suit]} · Clicca una casella evidenziata`
            : `Sollevata: ${lifted.label} di ${SUIT_NAMES[lifted.suit]} · Clicca la casella evidenziata`;
      }
      return true;
    }

    this.phase = 'draw';
    this.message = this.pozzo.length ? 'Pesca dal pozzo' : 'Pozzo vuoto';
    if (this.pozzo.length === 0 && this.kingsDiscarded >= 4) {
      this.evaluateEnd();
    } else if (this.pozzo.length === 0) {
      this.evaluateEnd();
    }
    return true;
  }

  /** @deprecated usato dalla UI precedente — reindirizza a placeAt sulla prima target */
  chooseRow(rowIndex) {
    if (this.phase !== 'hold' || !this.current || isKing(this.current)) return false;
    const col = scartaIlReColumn(this.current);
    if (col < 0) return false;
    if (this.rowForSuit(this.current.suit) >= 0) return false;
    if (this.rowSuits[rowIndex] != null) return false;
    return this.placeAt(rowIndex, col);
  }

  isGridComplete() {
    for (let r = 0; r < 4; r++) {
      const suit = this.rowSuits[r];
      if (!suit) return false;
      for (let c = 0; c < 9; c++) {
        const cell = this.grid[r][c];
        if (!cell?.faceUp) return false;
        if (cell.card.suit !== suit) return false;
        if (scartaIlReColumn(cell.card) !== c) return false;
      }
    }
    return true;
  }

  evaluateEnd() {
    this.gameOver = true;
    this.current = null;
    if (this.kingsDiscarded >= 4 && this.faceDownCount === 0 && this.isGridComplete()) {
      this.won = true;
      this.phase = 'won';
      this.message = 'Solitario riuscito! Tutti i Re scartati e griglia in ordine.';
    } else {
      this.won = false;
      this.phase = 'lost';
      this.message =
        this.kingsDiscarded >= 4
          ? `Solitario fallito: restano ${this.faceDownCount} carte coperte.`
          : 'Solitario fallito: pozzo esaurito prima di scartare tutti i Re.';
    }
  }

  getState() {
    const targets = this.getValidPlaceTargets();
    return {
      gameType: 'scartaIlRe',
      grid: this.grid.map((row) =>
        row.map((cell) =>
          cell
            ? {
                faceUp: cell.faceUp,
                card: cell.faceUp ? publicCard(cell.card) : null,
              }
            : null
        )
      ),
      rowSuits: [...this.rowSuits],
      rowSuitNames: this.rowSuits.map((s) => (s ? SUIT_NAMES[s] : null)),
      pozzoCount: this.pozzo.length,
      discardedCount: this.discarded.length,
      kingsDiscarded: this.kingsDiscarded,
      discarded: this.discarded.map(publicCard),
      current: this.current ? publicCard(this.current) : null,
      freeRows: this.freeRows,
      placeTargets: targets,
      phase: this.phase,
      message: this.message,
      gameOver: this.gameOver,
      won: this.won,
      faceDownCount: this.faceDownCount,
      canDraw: this.phase === 'draw' && !this.gameOver && this.pozzo.length > 0,
      canDiscardKing:
        this.phase === 'hold' && !!this.current && isKing(this.current) && !this.gameOver,
      canPlace: this.phase === 'hold' && !!this.current && !isKing(this.current) && !this.gameOver,
    };
  }
}
