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

    document.getElementById('select-game-type')?.addEventListener('change', (e) => {
      const count = document.getElementById('select-player-count');
      if (e.target.value === 'tressette') {
        count.value = '4';
        count.disabled = true;
      } else {
        count.disabled = false;
      }
    });

    document.getElementById('btn-setup-confirm')?.addEventListener('click', () => {
      this.online.confirmSetup();
    });

    document.getElementById('btn-start-game')?.addEventListener('click', () => {
      this.online.startGame();
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

document.addEventListener('DOMContentLoaded', () => {
  new App();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});
