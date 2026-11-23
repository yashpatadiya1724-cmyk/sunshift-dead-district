import { events } from '../core/Events.js';

export class Menu {
  constructor(game) {
    this.game = game;

    // Cache Panel Elements
    this.container = document.getElementById('menu-container');
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
    this.startLoadingSequence();
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
        } else {
          p.classList.add('hidden-panel');
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
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // Avoid triggering canvas pointer lock
          if (this.game.sound) this.game.sound.playClick();
          handler();
        });
      }
    };

    // Main Menu Buttons
    bindClick('btn-play', () => this.game.start());
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
        this.game.settings.masterVolume = val;
        if (this.game.sound) this.game.sound.setMasterVolume(val);
      });
    }

    // 2. Mouse Sensitivity
    if (this.sliderSens) {
      this.sliderSens.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.game.settings.mouseSensitivity = val;
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
        if (this.game.sound) this.game.sound.playClick();
        const q = btn.dataset.quality;
        this.qualityBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.game.setQuality(q);
      });
    });
  }

  syncSettingsUI() {
    if (this.sliderVolume && this.game.settings.masterVolume !== undefined) {
      this.sliderVolume.value = this.game.settings.masterVolume;
    }
    if (this.sliderSens && this.game.settings.mouseSensitivity !== undefined) {
      this.sliderSens.value = this.game.settings.mouseSensitivity;
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
    events.on('stateChange', ({ state, stats }) => {
      switch (state) {
        case 'MENU':
          this.showPanel(this.mainMenu);
          break;
        case 'PLAYING':
          this.showPanel(null); // Hide all menu overlays
          break;
        case 'PAUSE':
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

    const totalSeconds = Math.floor(stats.timeSurvived || 0);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');

    if (this.statTime) this.statTime.textContent = `${m}:${s}`;
    if (this.statKills) this.statKills.textContent = stats.zombiesKilled || 0;
    if (this.statRelays) this.statRelays.textContent = `${stats.relaysCollected || 0} / 4`;
    if (this.statShifts) this.statShifts.textContent = stats.shiftsSurvived || 0;
  }

  startLoadingSequence() {
    this.showPanel(this.loadingScreen);
    const bar = document.getElementById('loading-bar-fill');
    let progress = 0;

    const interval = setInterval(() => {
      progress += 0.25;
      if (bar) bar.style.width = `${Math.min(100, progress * 100)}%`;

      if (progress >= 1.0) {
        clearInterval(interval);
        // Minimum 1 second showcase of loading screen before main menu
        setTimeout(() => {
          this.game.showMenu();
        }, 300);
      }
    }, 250);
  }
}
