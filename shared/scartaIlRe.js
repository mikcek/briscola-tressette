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
 * Solitario "Scarta il Re" — regolamento_solitario_scarta_il_re.md
 * Solo giocatore, niente CPU / multiplayer.
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
    this.phase = 'idle'; // draw | chooseRow | won | lost
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

  /**
   * Pesca dal pozzo (o continua dopo uno scarto Re).
   */
  draw() {
    if (this.phase !== 'draw' || this.gameOver) return false;
    if (this.pozzo.length === 0) {
      this.evaluateEnd();
      return true;
    }
    this.current = this.pozzo.pop();
    return this.resolveCurrent();
  }

  /**
   * Se current è Re → scarta e torna a draw.
   * Se seme già assegnato → piazza automaticamente.
   * Altrimenti → chooseRow.
   */
  resolveCurrent() {
    if (!this.current) {
      this.phase = 'draw';
      this.message = this.pozzo.length
        ? 'Pesca dal pozzo'
        : 'Pozzo vuoto';
      if (this.pozzo.length === 0) this.evaluateEnd();
      return true;
    }

    if (isKing(this.current)) {
      this.discarded.push(this.current);
      this.current = null;
      const n = this.kingsDiscarded;
      if (n >= 4) {
        this.evaluateEnd();
        return true;
      }
      this.phase = 'draw';
      this.message = `Re scartato (${n}/4) · Pesca dal pozzo`;
      if (this.pozzo.length > 0) {
        return this.draw();
      }
      this.evaluateEnd();
      return true;
    }

    const row = this.rowForSuit(this.current.suit);
    if (row < 0) {
      this.phase = 'chooseRow';
      this.message = `Scegli la fila per ${SUIT_NAMES[this.current.suit]}`;
      return true;
    }

    return this.placeOnRow(row);
  }

  /**
   * Assegna il seme della carta corrente a una fila libera e piazza.
   */
  chooseRow(rowIndex) {
    if (this.phase !== 'chooseRow' || !this.current) return false;
    if (rowIndex < 0 || rowIndex > 3) return false;
    if (this.rowSuits[rowIndex] != null) return false;
    if (this.freeRows.length === 0) return false;

    this.rowSuits[rowIndex] = this.current.suit;
    return this.placeOnRow(rowIndex);
  }

  placeOnRow(row) {
    if (!this.current || isKing(this.current)) return false;
    const col = scartaIlReColumn(this.current);
    if (col < 0) return false;

    const cell = this.grid[row][col];
    const lifted = cell?.card || null;
    const wasFaceDown = cell ? !cell.faceUp : false;

    this.grid[row][col] = { card: this.current, faceUp: true };
    this.current = null;

    if (lifted && wasFaceDown) {
      this.current = lifted;
      this.message = `Sollevata: ${lifted.label} di ${SUIT_NAMES[lifted.suit]}`;
      return this.resolveCurrent();
    }

    // Cella già scoperta (caso anomalo) o vuota: riprendi dal pozzo
    this.phase = 'draw';
    this.message = this.pozzo.length
      ? 'Pesca dal pozzo'
      : 'Pozzo vuoto';
    if (this.pozzo.length === 0 && this.kingsDiscarded >= 4) {
      this.evaluateEnd();
    }
    return true;
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
      phase: this.phase,
      message: this.message,
      gameOver: this.gameOver,
      won: this.won,
      faceDownCount: this.faceDownCount,
      canDraw: this.phase === 'draw' && !this.gameOver && this.pozzo.length > 0,
      canChooseRow: this.phase === 'chooseRow' && !this.gameOver,
    };
  }
}
