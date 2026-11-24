// FILE: src/core/Game.js
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';

import { CONFIG } from '../config.js';
import { events } from './Events.js';
import { Input } from './Input.js';
import { Sound } from './Sound.js';
import { Effects } from './Effects.js';
import { Player } from '../entities/Player.js';
import { Zombie } from '../entities/Zombie.js';
import { Vehicle } from '../entities/Vehicle.js';
import { PickupsManager } from '../world/Pickups.js';
import { City } from '../world/City.js';
import { ShiftSystem } from '../world/ShiftSystem.js';
import { RelayManager } from '../world/Relays.js';
import { Dialogue } from '../story/Dialogue.js';
import { MissionManager } from '../story/MissionManager.js';

export const GAME_STATES = {
  LOADING: 'LOADING',
  MENU: 'MENU',
  INTRO: 'INTRO',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  WIN: 'WIN',
  LOSE: 'LOSE'
};

export class Game {
  constructor() {
    this.isWebGLSupported = this.checkWebGLSupport();
    if (!this.isWebGLSupported) {
      const errEl = document.getElementById('webgl-fail-msg');
      if (errEl) errEl.style.display = 'block';
      return;
    }

    this.state = GAME_STATES.LOADING;

    this.stats = {
      startTime: 0,
      survivalTime: 0,
      zombiesKilled: 0,
      relaysCollected: 0,
      shiftsSurvived: 0
    };

    this.settings = this.loadSettings();

    // FPS Display
    this.showFps = false;
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.fpsCounterEl = document.getElementById('fps-counter');

    // Tutorial Flow State
    this.isShowingTutorial = false;
    this.tutorialIndex = 0;
    this.tutorialSteps = [
      { tag: 'TUTORIAL (1/5)', msg: 'Use [W, A, S, D] to move and hold [SHIFT] to sprint.' },
      { tag: 'TUTORIAL (2/5)', msg: 'Keys [1, 2, 3] switch weapons (Pistol, Shotgun, Rifle). Press [R] to reload.' },
      { tag: 'TUTORIAL (3/5)', msg: 'Collect all 4 yellow street Relays to power the central Evac Tower.' },
      { tag: 'TUTORIAL (4/5)', msg: 'Beware the SHIFT! In Night Shift, infected sprint and extra zombies spawn.' },
      { tag: 'TUTORIAL (5/5)', msg: 'Press [Q] for UV Flare to freeze enemies. Walk up to the muscle car and press [F] to drive!' }
    ];

    // 1. Scene, Camera, Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.shift.daySky);
    this.scene.fog = new THREE.FogExp2(CONFIG.shift.dayFog, CONFIG.shift.dayFogDensity);

    this.camera = new THREE.PerspectiveCamera(this.settings.fov || 65, window.innerWidth / window.innerHeight, 0.1, 300);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const container = document.getElementById('game-container') || document.body;
    container.appendChild(this.renderer.domElement);

    // 2. Lighting
    this.hemiLight = new THREE.HemisphereLight(CONFIG.shift.dayHemiSky, CONFIG.shift.dayHemiGround, CONFIG.shift.dayHemiIntensity);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(CONFIG.shift.dayDirColor, CONFIG.shift.dayDirIntensity);
    this.dirLight.position.set(30, 50, 25);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 140;

    const d = 38;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0006;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // 3. Post-Processing Pipeline
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        CONFIG.shift.dayBloom,
        0.5,
        0.82
      );
      this.composer.addPass(this.bloomPass);

      const vignettePass = new ShaderPass(VignetteShader);
      vignettePass.uniforms['offset'].value = 1.05;
      vignettePass.uniforms['darkness'].value = 1.25;
      this.composer.addPass(vignettePass);
      this.composer.addPass(new OutputPass());
    } catch (e) {
      console.warn('EffectComposer initialization failed, falling back to WebGLRenderer:', e);
      this.composer = null;
    }

    // 4. Core Systems, Entities, Vehicle & Pickups
    this.sound = new Sound();
    this.sound.setMasterVolume(this.settings.volume);

    this.effects = new Effects(this.scene);
    this.input = new Input();

    this.city = new City(this.scene);
    this.shift = new ShiftSystem(this.scene, this.dirLight, this.hemiLight, this.bloomPass, this.city, this.sound, this.effects);
    this.player = new Player(this.scene, this.camera, this.input, this.sound, this.effects);
    this.player.sensitivity = this.settings.sensitivity;
    this.player.invertY = !!this.settings.invertY;

    this.vehicle = new Vehicle(this.scene, this.sound, this.effects);
    this.pickups = new PickupsManager(this.scene, this.sound);
    this.relays = new RelayManager(this.scene, this.sound);

    this.dialogue = new Dialogue(this.sound);
    this.missionManager = new MissionManager(this);
    this.noise = 0.0;

    this.zombies = [];
    this.extraNightZombies = [];

    this.applyQuality(this.settings.quality);
    this.setupEvents();
    this.spawnZombies();

    window.addEventListener('resize', () => this.onResize());

    // Window Blur -> Auto-Pause
    window.addEventListener('blur', () => {
      if (this.state === GAME_STATES.PLAYING) {
        this.pause();
      }
    });

    // F3 -> Toggle FPS Counter / Space -> Advance tutorial / T -> Dev Shift
    window.addEventListener('keydown', (e) => {
      if (import.meta.env.DEV && e.code === 'KeyT') {
        if (this.shift && this.state === GAME_STATES.PLAYING) {
          this.shift.triggerShift();
        }
      }
      if (e.code === 'F3') {
        this.showFps = !this.showFps;
        if (this.fpsCounterEl) {
          this.fpsCounterEl.style.display = this.showFps ? 'block' : 'none';
        }
      }
      if (e.code === 'Space' && this.isShowingTutorial) {
        this.advanceTutorial();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === GAME_STATES.PLAYING) {
        if (this.input && this.input.isLocked) {
          this.pause();
        }
      }
    });

    this.clock = new THREE.Clock();
    this.menuCamAngle = 0;
    this.loop();
  }

  checkWebGLSupport() {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch {
      return false;
    }
  }

  loadSettings() {
    const defaults = { volume: 0.5, sensitivity: 0.0025, fov: 65, invertY: false, quality: 'HIGH' };
    try {
      const saved = localStorage.getItem('sunshift_settings');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('sunshift_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Could not save settings', e);
    }
  }

  setSensitivity(val) {
    this.settings.sensitivity = val;
    this.player.sensitivity = val;
    this.saveSettings();
  }

  setVolume(val) {
    this.settings.volume = val;
    this.sound.setMasterVolume(val);
    this.saveSettings();
  }

  setFov(val) {
    this.settings.fov = val;
    this.camera.fov = val;
    this.camera.updateProjectionMatrix();
    this.saveSettings();
  }

  setInvertY(val) {
    this.settings.invertY = val;
    this.player.invertY = val;
    this.saveSettings();
  }

  setQuality(presetName) {
    this.applyQuality(presetName);
  }

  applyQuality(presetName) {
    const preset = CONFIG.quality[presetName] || CONFIG.quality.HIGH;
    this.settings.quality = presetName;
    this.saveSettings();

    const shadowsChanged = this.renderer.shadowMap.enabled !== preset.shadows;
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.setPixelRatio(preset.pixelRatio);

    if (this.composer) {
      this.composer.setPixelRatio(preset.pixelRatio);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
    if (this.bloomPass) {
      this.bloomPass.enabled = preset.bloom;
    }

    if (preset.shadows) {
      this.dirLight.shadow.mapSize.width = preset.shadowMapSize;
      this.dirLight.shadow.mapSize.height = preset.shadowMapSize;
      if (this.dirLight.shadow.map) {
        this.dirLight.shadow.map.dispose();
        this.dirLight.shadow.map = null;
      }
    }

    if (shadowsChanged) {
      this.scene.traverse((child) => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.needsUpdate = true);
          else child.material.needsUpdate = true;
        }
      });
    }
  }

  setupEvents() {
    // 1. Zombie Killed -> increment stats & spawn pickup drop
    events.on('zombieKilled', (zombie) => {
      this.stats.zombiesKilled++;
      if (zombie && zombie.mesh && this.pickups) {
        this.pickups.spawnDrop(zombie.mesh.position);
      }
    });

    // 2. Day/Night Shift Escalation
    events.on('shift', ({ isNight }) => {
      if (this.state === GAME_STATES.PLAYING) {
        this.stats.shiftsSurvived++;
        if (this.effects) this.effects.flashShift(isNight);

        if (isNight) {
          this.spawnExtraNightZombies();
        } else {
          this.fadeExtraNightZombies();
        }
      }
    });

    events.on('playerShot', (data) => {
      const w = data?.weapon?.toUpperCase() || '';
      if (w.includes('PISTOL')) this.noise = Math.min(1.0, this.noise + 0.25);
      else if (w.includes('SHOTGUN')) this.noise = Math.min(1.0, this.noise + 0.60);
      else if (w.includes('RIFLE')) this.noise = Math.min(1.0, this.noise + 0.40);
      else this.noise = Math.min(1.0, this.noise + 0.25);
    });

    events.on('relayCollected', () => {
      this.stats.relaysCollected++;
    });

    events.on('gameWon', (endingData) => {
      this.win(endingData);
    });

    events.on('gameLost', () => {
      this.lose();
    });
  }

  spawnZombies() {
    this.zombies.forEach(z => z.destroy());
    this.zombies = [];
    this.clearExtraNightZombies();

    const count = this.settings.quality === 'LOW' ? 14 : CONFIG.zombie.count;

    for (let i = 0; i < count; i++) {
      let pos = new THREE.Vector3();
      let valid = false;

      for (let attempt = 0; attempt < 25; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 18 + Math.random() * 55;
        const testX = Math.cos(angle) * dist;
        const testZ = Math.sin(angle) * dist;

        if (!this.city.isInsideBuilding(testX, testZ, 2.5)) {
          pos.set(testX, 0, testZ);
          valid = true;
          break;
        }
      }

      if (valid) {
        this.zombies.push(new Zombie(this.scene, pos, this.sound));
      }
    }
  }

  spawnCustomZombie(pos, type = 'NORMAL') {
    const archetype = CONFIG.enemies[type.toLowerCase()] || CONFIG.enemies.normal;
    const z = new Zombie(this.scene, pos, this.sound, archetype, false);
    this.zombies.push(z);
    return z;
  }

  spawnExtraNightZombies() {
    const pPos = this.player.mesh.position;
    for (let i = 0; i < CONFIG.shift.nightExtraSpawns; i++) {
      let pos = new THREE.Vector3();
      let valid = false;

      for (let attempt = 0; attempt < 20; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 35 + Math.random() * 30; // 35+ units away
        const testX = pPos.x + Math.cos(angle) * dist;
        const testZ = pPos.z + Math.sin(angle) * dist;

        if (!this.city.isInsideBuilding(testX, testZ, 2.5)) {
          pos.set(testX, 0, testZ);
          valid = true;
          break;
        }
      }

      if (valid) {
        const extraZombie = new Zombie(this.scene, pos, this.sound, null, true);
        this.extraNightZombies.push(extraZombie);
        this.zombies.push(extraZombie);
      }
    }
  }

  fadeExtraNightZombies() {
    this.extraNightZombies.forEach(z => z.startDawnFade());
  }

  clearExtraNightZombies() {
    this.extraNightZombies.forEach(z => z.destroy());
    this.extraNightZombies = [];
  }

  requestPointerLockSafe() {
    try {
      const p = document.body.requestPointerLock();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch {}
  }

  playIntro(onComplete) {
    const introOverlay = document.getElementById('intro-overlay');
    const introText = document.getElementById('intro-text');
    if (!introOverlay || !introText) {
      if (onComplete) onComplete();
      return;
    }

    this.state = GAME_STATES.INTRO;
    introOverlay.style.display = 'flex';
    introOverlay.style.opacity = '1';
    introText.textContent = '';

    const fullText = 'HAVEN CITY. The Shift began 3 days ago. Day is quiet. Night is not.';
    let charIdx = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(typeTimer);
      clearTimeout(autoTimer);
      window.removeEventListener('keydown', skip);
      introOverlay.removeEventListener('click', skip);

      introOverlay.style.opacity = '0';
      setTimeout(() => {
        introOverlay.style.display = 'none';
        if (onComplete) onComplete();
      }, 700);
    };

    const skip = () => finish();
    window.addEventListener('keydown', skip, { once: true });
    introOverlay.addEventListener('click', skip, { once: true });

    const typeTimer = setInterval(() => {
      charIdx++;
      introText.textContent = fullText.slice(0, charIdx);
      if (charIdx >= fullText.length) {
        clearInterval(typeTimer);
      }
    }, 45);

    // 6 seconds total
    const autoTimer = setTimeout(() => {
      finish();
    }, 6000);
  }

  start() {
    if (this.sound) this.sound.startAmbient();
    this.stats.startTime = performance.now();
    this.stats.zombiesKilled = 0;
    this.stats.relaysCollected = 0;
    this.stats.shiftsSurvived = 0;
    this.noise = 0;
    this.input.reset();

    this.playIntro(() => {
      this.state = GAME_STATES.PLAYING;
      this.requestPointerLockSafe();
      events.emit('stateChange', this.state);

      if (this.missionManager) {
        this.missionManager.start();
      }
    });
  }

  retryFromCheckpoint() {
    this.clearExtraNightZombies();
    this.noise = 0;

    if (this.sound) this.sound.setLowHealthHeartbeat(false);
    if (this.effects) this.effects.setLowHealthEffect(false);

    if (this.missionManager) {
      this.missionManager.retryFromCheckpoint();
    }

    this.state = GAME_STATES.PLAYING;
    this.input.reset();
    this.requestPointerLockSafe();
    events.emit('stateChange', this.state);
  }

  pause() {
    if (this.state !== GAME_STATES.PLAYING) return;
    this.state = GAME_STATES.PAUSED;
    if (document.exitPointerLock) document.exitPointerLock();
    this.input.reset();
    events.emit('stateChange', this.state);
  }

  resume() {
    if (this.state !== GAME_STATES.PAUSED) return;
    this.state = GAME_STATES.PLAYING;
    this.input.reset();
    this.requestPointerLockSafe();
    events.emit('stateChange', this.state);
  }

  restart() {
    this.clearExtraNightZombies();
    if (this.dialogue) this.dialogue.clear();
    this.noise = 0;
    this.player.reset();
    this.player.unlockedWeapons = { pistol: true, shotgun: false, rifle: false };
    this.vehicle.reset();
    this.pickups.reset();
    this.relays.reset();
    this.shift.reset();
    this.spawnZombies();

    this.stats.startTime = performance.now();
    this.stats.survivalTime = 0;
    this.stats.zombiesKilled = 0;
    this.stats.relaysCollected = 0;
    this.stats.shiftsSurvived = 0;

    // Clear low health effects
    if (this.sound) this.sound.setLowHealthHeartbeat(false);
    if (this.effects) this.effects.setLowHealthEffect(false);

    this.state = GAME_STATES.PLAYING;
    this.input.reset();
    this.requestPointerLockSafe();
    events.emit('stateChange', this.state);

    if (this.missionManager) {
      this.missionManager.start();
    }
  }

  showMenu() {
    this.state = GAME_STATES.MENU;
    if (document.exitPointerLock) document.exitPointerLock();
    this.input.reset();
    if (this.dialogue) this.dialogue.clear();
    this.noise = 0;

    this.clearExtraNightZombies();
    this.player.reset();
    this.player.unlockedWeapons = { pistol: true, shotgun: false, rifle: false };
    this.vehicle.reset();
    this.pickups.reset();
    this.relays.reset();
    this.shift.reset();
    this.spawnZombies();

    // Clear low health effects
    if (this.sound) this.sound.setLowHealthHeartbeat(false);
    if (this.effects) this.effects.setLowHealthEffect(false);

    events.emit('stateChange', this.state);
  }

  win(endingData = null) {
    this.state = GAME_STATES.WIN;
    this.stats.survivalTime = ((performance.now() - this.stats.startTime) / 1000).toFixed(1);
    if (document.exitPointerLock) document.exitPointerLock();
    this.input.reset();

    // Clear low health effects
    if (this.sound) {
      this.sound.setLowHealthHeartbeat(false);
      this.sound.win();
    }
    if (this.effects) this.effects.setLowHealthEffect(false);

    // Update Game Over panel for Ending A or B
    const titleEl = document.getElementById('gameover-title');
    const subEl = document.getElementById('gameover-subtitle');
    const missionEl = document.getElementById('gameover-mission');
    const missionsStatEl = document.getElementById('stat-missions');
    const btnRetry = document.getElementById('btn-checkpoint-retry');
    const btnPlayAgain = document.getElementById('btn-play-again');

    if (titleEl) {
      titleEl.className = 'title-win';
      titleEl.textContent = endingData?.title || 'SURVIVOR — EVACUATION SUCCESSFUL';
    }
    if (subEl) {
      subEl.textContent = endingData?.text || 'District evacuated successfully.';
    }
    if (missionEl) {
      missionEl.textContent = endingData?.type === 'A' ? 'ENDING A: THE ESCAPE' : 'ENDING B: DAWN RESTORED';
    }
    if (missionsStatEl) {
      missionsStatEl.textContent = '6 / 6';
    }
    if (btnRetry) btnRetry.style.display = 'none';
    if (btnPlayAgain) btnPlayAgain.textContent = 'PLAY AGAIN';

    events.emit('stateChange', this.state);
  }

  lose() {
    this.state = GAME_STATES.LOSE;
    this.stats.survivalTime = ((performance.now() - this.stats.startTime) / 1000).toFixed(1);
    if (document.exitPointerLock) document.exitPointerLock();
    this.input.reset();

    // Clear low health effects
    if (this.sound) {
      this.sound.setLowHealthHeartbeat(false);
      this.sound.gameOver();
    }
    if (this.effects) this.effects.setLowHealthEffect(false);

    const titleEl = document.getElementById('gameover-title');
    const subEl = document.getElementById('gameover-subtitle');
    const missionEl = document.getElementById('gameover-mission');
    const missionsStatEl = document.getElementById('stat-missions');
    const btnRetry = document.getElementById('btn-checkpoint-retry');
    const btnPlayAgain = document.getElementById('btn-play-again');

    const m = this.missionManager ? this.missionManager.getCurrentMission() : null;
    const mIdx = this.missionManager ? this.missionManager.currentMissionIndex : 0;

    if (titleEl) {
      titleEl.className = 'title-lose';
      titleEl.textContent = 'SIGNAL LOST — YOU DIED';
    }
    if (subEl) {
      subEl.textContent = m ? `Failed during Mission ${m.id}: ${m.title}` : 'Your biometrics have flatlined.';
    }
    if (missionEl) {
      missionEl.textContent = m ? `OBJECTIVE: ${m.objective}` : '';
    }
    if (missionsStatEl) {
      missionsStatEl.textContent = `${mIdx} / 6`;
    }
    if (btnRetry) {
      btnRetry.style.display = 'inline-block';
      btnRetry.textContent = `RETRY FROM MISSION ${m ? m.id : 1}`;
    }
    if (btnPlayAgain) {
      btnPlayAgain.textContent = 'RESTART CAMPAIGN';
    }

    events.emit('stateChange', this.state);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) {
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  renderPass() {
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.1);

    // FPS Display Tracker
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 500) {
      if (this.fpsCounterEl && this.showFps) {
        const fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
        this.fpsCounterEl.innerText = `FPS: ${fps}`;
      }
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    if (this.state === GAME_STATES.MENU || this.state === GAME_STATES.LOADING) {
      this.menuCamAngle += dt * 0.15;
      this.camera.position.set(
        Math.cos(this.menuCamAngle) * 36,
        20,
        Math.sin(this.menuCamAngle) * 36
      );
      this.camera.lookAt(0, 3, 0);
      this.shift.applyShiftVisuals(dt);
      this.renderPass();
      return;
    }

    if (this.state === GAME_STATES.PLAYING) {
      this.effects.update(dt);
      this.shift.update(dt);
      this.vehicle.update(dt, this.input, this.city.colliders, this.zombies, this.shift.isNight);
      this.pickups.update(dt, this.player);

      const activeEntityPos = this.vehicle.isOccupied ? this.vehicle.mesh.position : this.player.mesh.position;

      if (this.vehicle.isOccupied) {
        const rear = new THREE.Vector3(0, CONFIG.vehicle.camHeight, -CONFIG.vehicle.camDistance)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.vehicle.yaw);
        this.camera.position.copy(this.vehicle.mesh.position).add(rear);
        this.camera.lookAt(
          this.vehicle.mesh.position.x,
          this.vehicle.mesh.position.y + 1.2,
          this.vehicle.mesh.position.z
        );
      } else {
        this.player.update(dt, this.city.colliders, this.zombies, this.city.meshes);
      }

      this.dirLight.position.set(
        activeEntityPos.x + 30,
        activeEntityPos.y + 50,
        activeEntityPos.z + 25
      );
      this.dirLight.target.position.copy(activeEntityPos);

      this.relays.update(dt, this.vehicle.isOccupied ? { mesh: { position: this.vehicle.mesh.position } } : this.player);
      this.city.updateStreetlights(activeEntityPos);

      // Story Mission Manager update
      if (this.missionManager) {
        this.missionManager.update(dt);
      }

      // Noise System: decay by 0.35/s, add car engine noise if moving
      if (this.vehicle && this.vehicle.isOccupied && Math.abs(this.vehicle.speed) > 2) {
        this.noise = Math.min(1.0, this.noise + dt * 0.15);
      }
      this.noise = Math.max(0.0, this.noise - dt * 0.35);
      if (this.player) {
        this.player.noise = this.noise;
      }

      const noiseBar = document.getElementById('noise-bar');
      const noiseText = document.getElementById('noise-text');
      if (noiseBar) noiseBar.style.width = `${Math.round(this.noise * 100)}%`;
      if (noiseText) noiseText.textContent = `${Math.round(this.noise * 100)}%`;

      for (let i = this.zombies.length - 1; i >= 0; i--) {
        const z = this.zombies[i];
        if (z.isRemoved) {
          this.zombies.splice(i, 1);
          const extraIdx = this.extraNightZombies.indexOf(z);
          if (extraIdx !== -1) {
            this.extraNightZombies.splice(extraIdx, 1);
          }
          continue;
        }
        z.update(dt, this.player, this.shift.isNight, this.city.colliders);
      }

      if (this.player.health <= 0) {
        events.emit('gameLost');
      }
    }

    this.renderPass();
  }
}
