import { LocalApp } from './local.js';
import { OnlineApp } from './online.js';
import { showScreen } from './ui.js';
import { loadSession } from './net.js';

class App {
  constructor() {
    this.local = new LocalApp(this);
    this.online = new OnlineApp(this);
    this.bind();
    this.bootSession();
  }

  async bootSession() {
    const params = new URLSearchParams(location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      this.online.openJoin(roomParam);
      return;
    }
    const session = loadSession();
    if (session.roomCode) {
      try {
        await this.online.ensureConnected();
        this.online.net.send({ type: 'reconnect', code: session.roomCode });
      } catch {
        /* ignore */
      }
    }
  }

  bind() {
    document.getElementById('btn-mode-local')?.addEventListener('click', () => {
      showScreen('local-menu-screen');
    });
    document.getElementById('btn-mode-online')?.addEventListener('click', () => {
      showScreen('online-menu-screen');
    });

    document.querySelectorAll('[data-back="home"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.local.stop();
        this.online.stop();
        showScreen('home-screen');
      });
    });

    document.querySelectorAll('.local-game-select').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.online.stop();
        this.local.start(btn.dataset.game);
      });
    });

    document.getElementById('btn-online-create')?.addEventListener('click', () => {
      this.local.stop();
      this.online.openCreate();
    });
    document.getElementById('btn-online-join')?.addEventListener('click', () => {
      this.local.stop();
      this.online.openJoin();
    });

    document.getElementById('select-game-type')?.addEventListener('change', () => {
      updateSetupHint();
    });
    document.getElementById('select-player-count')?.addEventListener('change', () => {
      updateSetupHint();
    });

    document.getElementById('btn-setup-confirm')?.addEventListener('click', () => {
      this.online.confirmSetup();
    });

    document.getElementById('btn-start-game')?.addEventListener('click', () => {
      this.online.startGame();
    });
    document.getElementById('btn-fill-cpu')?.addEventListener('click', () => {
      this.online.fillCpu();
    });
    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      this.online.copyLink();
    });
    document.getElementById('btn-leave-lobby')?.addEventListener('click', () => {
      this.online.leave();
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
      if (this.online.room) {
        this.online.leave();
      } else {
        this.local.stop();
        showScreen('home-screen');
      }
    });

    document.getElementById('btn-new-hand')?.addEventListener('click', () => {
      this.local.newHand();
    });
  }
}

function updateSetupHint() {
  const game = document.getElementById('select-game-type')?.value;
  const count = document.getElementById('select-player-count')?.value;
  const hint = document.getElementById('setup-hint');
  if (!hint) return;
  if (game === 'tressette' && count === '2') {
    hint.textContent =
      "Tressette 1 vs 1: dopo ogni presa si pesca e si mostra la carta all'avversario.";
  } else if (game === 'tressette' && count === '4') {
    hint.textContent =
      'Squadre 1+3 vs 2+4. Due amici sulla stessa squadra: posti liberi → «Riempi con CPU».';
  } else if (game === 'scopa') {
    hint.textContent =
      count === '2'
        ? 'Scopa 1 vs 1 · Settebello jolly, Buongioco, vittoria a 21.'
        : 'Scopa a squadre · posti liberi riempibili con CPU · a 21.';
  } else if (game === 'briscola' && count === '4') {
    hint.textContent = 'Briscola a 4 a squadre. Puoi riempire i posti liberi con CPU.';
  } else {
    hint.textContent = 'Crea una stanza e condividi codice o QR.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
  updateSetupHint();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});
