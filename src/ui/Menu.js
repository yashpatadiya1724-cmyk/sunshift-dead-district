// FILE: src/ui/Menu.js
import { events } from '../core/Events.js';

export class Menu {
  constructor(game) {
    this.game = game;

    // Cache Panel Elements
    this.container = document.getElementById('menu-container') || document.getElementById('menu-layer');
    this.loadingScreen = document.getElementById('loading-screen');
    this.mainMenu = document.getElementById('main-menu');
    this.controlsPanel = document.getElementById('controls-panel');
    this.settingsPanel = document.getElementById('settings-panel');
    this.pauseMenu = document.getElementById('pause-menu');
    this.gameoverPanel = document.getElementById('gameover-panel');
    this.creditsPanel = document.getElementById('credits-panel');

    // Stats Elements on Gameover Panel
    this.gameoverTitle = document.getElementById('gameover-title');
    this.gameoverSubtitle = document.getElementById('gameover-subtitle');
    this.statTime = document.getElementById('stat-time');
    this.statKills = document.getElementById('stat-kills');
    this.statRelays = document.getElementById('stat-relays');
    this.statShifts = document.getElementById('stat-shifts');

    // Settings Controls
    this.sliderVolume = document.getElementById('slider-volume');
    this.sliderSens = document.getElementById('slider-sens');
    this.sliderFov = document.getElementById('slider-fov');
    this.checkInvert = document.getElementById('check-invert');
    this.qualityBtns = document.querySelectorAll('.btn-quality');

    // Keep track of previous menu to return cleanly
    this.settingsReturnTarget = this.mainMenu;

    this.bindButtons();
    this.bindSettings();
    this.initEvents();

    // Immediately display Main Menu (bypass blocking loading stall)
    this.showPanel(this.mainMenu);
    try {
      this.game.showMenu();
    } catch (e) {
      console.warn('Game.showMenu init notice:', e);
    }
  }

  showPanel(panel) {
    const panels = [
      this.loadingScreen,
      this.mainMenu,
      this.controlsPanel,
      this.settingsPanel,
      this.pauseMenu,
      this.gameoverPanel,
      this.creditsPanel
    ];

    panels.forEach(p => {
      if (p) {
        if (p === panel) {
          p.classList.remove('hidden-panel');
          p.style.display = 'flex';
        } else {
          p.classList.add('hidden-panel');
          p.style.display = 'none';
        }
      }
    });

    if (this.container) {
      this.container.style.display = panel ? 'flex' : 'none';
    }
  }

  bindButtons() {
    const bindClick = (id, handler) => {
      const btn = document.getElementById(id);
      if (btn) {
        const trigger = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          console.log(`[MENU] Clicked button #${id}`);
          try {
            if (this.game && this.game.sound) {
              if (typeof this.game.sound.playClick === 'function') {
                this.game.sound.playClick();
              } else if (typeof this.game.sound.uiClick === 'function') {
                this.game.sound.uiClick();
              }
            }
          } catch (soundErr) {
            console.warn('[MENU] Audio click notice:', soundErr);
          }

          try {
            handler();
          } catch (handlerErr) {
            console.error(`[MENU] Error executing handler for #${id}:`, handlerErr);
          }
        };

        btn.addEventListener('click', trigger);
      } else {
        console.warn(`[MENU] Button element #${id} not found in DOM`);
      }
    };

    // Main Menu Buttons
    bindClick('btn-play', () => {
      this.showPanel(null); // Instantly dismiss menu UI
      this.game.start();
    });
    bindClick('btn-controls', () => this.showPanel(this.controlsPanel));
    bindClick('btn-settings', () => {
      this.settingsReturnTarget = this.mainMenu;
      this.syncSettingsUI();
      this.showPanel(this.settingsPanel);
    });
    bindClick('btn-credits', () => this.showPanel(this.creditsPanel));

    // Back Buttons
    bindClick('btn-controls-back', () => this.showPanel(this.mainMenu));
    bindClick('btn-settings-back', () => {
      this.game.saveSettings();
      this.showPanel(this.settingsReturnTarget);
    });
    bindClick('btn-credits-back', () => this.showPanel(this.mainMenu));

    // Pause Menu Buttons
    bindClick('btn-resume', () => this.game.resume());
    bindClick('btn-pause-settings', () => {
      this.settingsReturnTarget = this.pauseMenu;
      this.syncSettingsUI();
      this.showPanel(this.settingsPanel);
    });
    bindClick('btn-restart', () => this.game.restart());
    bindClick('btn-pause-menu', () => this.game.showMenu());

    // Game Over Buttons
    bindClick('btn-play-again', () => this.game.restart());
    bindClick('btn-over-menu', () => this.game.showMenu());
  }

  bindSettings() {
    // 1. Master Volume
    if (this.sliderVolume) {
      this.sliderVolume.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.game.settings.volume = val;
        if (this.game.sound) this.game.sound.setMasterVolume(val);
      });
    }

    // 2. Mouse Sensitivity
    if (this.sliderSens) {
      this.sliderSens.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.game.settings.sensitivity = val;
        if (this.game.player) this.game.player.sensitivity = val;
      });
    }

    // 3. Field of View (FOV)
    if (this.sliderFov) {
      this.sliderFov.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.game.settings.fov = val;
        if (this.game.camera) {
          this.game.camera.fov = val;
          this.game.camera.updateProjectionMatrix();
        }
      });
    }

    // 4. Invert Mouse Y
    if (this.checkInvert) {
      this.checkInvert.addEventListener('change', (e) => {
        const val = e.target.checked;
        this.game.settings.invertY = val;
        if (this.game.player) this.game.player.invertY = val;
      });
    }

    // 5. Quality Presets (LOW / MEDIUM / HIGH)
    this.qualityBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          if (this.game && this.game.sound) {
            if (typeof this.game.sound.playClick === 'function') this.game.sound.playClick();
            else if (typeof this.game.sound.uiClick === 'function') this.game.sound.uiClick();
          }
        } catch {}
        const q = btn.dataset.quality;
        this.qualityBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (typeof this.game.setQuality === 'function') {
          this.game.setQuality(q);
        } else if (typeof this.game.applyQuality === 'function') {
          this.game.applyQuality(q);
        }
      });
    });
  }

  syncSettingsUI() {
    if (this.sliderVolume && this.game.settings.volume !== undefined) {
      this.sliderVolume.value = this.game.settings.volume;
    }
    if (this.sliderSens && this.game.settings.sensitivity !== undefined) {
      this.sliderSens.value = this.game.settings.sensitivity;
    }
    if (this.sliderFov && this.game.settings.fov !== undefined) {
      this.sliderFov.value = this.game.settings.fov;
    }
    if (this.checkInvert && this.game.settings.invertY !== undefined) {
      this.checkInvert.checked = !!this.game.settings.invertY;
    }
    if (this.qualityBtns) {
      this.qualityBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.quality === this.game.settings.quality);
      });
    }
  }

  initEvents() {
    events.on('stateChange', (payload) => {
      const state = typeof payload === 'string' ? payload : payload?.state;
      const stats = (typeof payload === 'object' && payload?.stats) ? payload.stats : (this.game.stats || {});

      switch (state) {
        case 'MENU':
          this.showPanel(this.mainMenu);
          break;
        case 'PLAYING':
          this.showPanel(null); // Hide all menu overlays
          break;
        case 'PAUSE':
        case 'PAUSED':
          this.showPanel(this.pauseMenu);
          break;
        case 'WIN':
        case 'LOSE':
          this.populateGameOver(state, stats);
          this.showPanel(this.gameoverPanel);
          break;
      }
    });
  }

  populateGameOver(state, stats = {}) {
    const isWin = state === 'WIN';
    if (this.gameoverTitle) {
      this.gameoverTitle.textContent = isWin ? 'VICTORY: DISTRICT PURGED' : 'SIGNAL LOST: YOU DIED';
      this.gameoverTitle.className = isWin ? 'title-win' : 'title-lose';
    }
    if (this.gameoverSubtitle) {
      this.gameoverSubtitle.textContent = isWin
        ? 'Relay grid online. Evacuation aircraft contacted.'
        : 'The infected overwhelmed your position.';
    }

    const totalSeconds = Math.floor(stats.survivalTime || stats.timeSurvived || 0);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');

    if (this.statTime) this.statTime.textContent = `${m}:${s}`;
    if (this.statKills) this.statKills.textContent = stats.zombiesKilled || 0;
    if (this.statRelays) this.statRelays.textContent = `${stats.relaysCollected || 0} / 4`;
    if (this.statShifts) this.statShifts.textContent = stats.shiftsSurvived || 0;
  }
}
