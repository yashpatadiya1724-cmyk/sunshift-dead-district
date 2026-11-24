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

export const GAME_STATES = {
  LOADING: 'LOADING',
  MENU: 'MENU',
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

    // F3 -> Toggle FPS Counter / Space -> Advance tutorial
    window.addEventListener('keydown', (e) => {
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

    events.on('relayCollected', () => {
      this.stats.relaysCollected++;
    });

    events.on('gameWon', () => {
      this.win();
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
    setTimeout(() => {
      this.extraNightZombies = [];
      this.zombies = this.zombies.filter(z => !z.isDead && !z.isFading);
    }, 1500);
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

  start() {
    if (this.sound) this.sound.startAmbient();
    this.state = GAME_STATES.PLAYING;
    this.stats.startTime = performance.now();
    this.stats.zombiesKilled = 0;
    this.stats.relaysCollected = 0;
    this.stats.shiftsSurvived = 0;
    this.input.reset();
    this.requestPointerLockSafe();
    events.emit('stateChange', this.state);

    this.checkFirstTimeTutorial();
  }

  checkFirstTimeTutorial() {
    try {
      const seen = localStorage.getItem('sunshift_tutorial_seen');
      if (!seen) {
        this.isShowingTutorial = true;
        this.tutorialIndex = 0;
        this.renderTutorialStep();
      }
    } catch {}
  }

  renderTutorialStep() {
    const box = document.getElementById('tutorial-box');
    const tag = document.getElementById('tutorial-step-tag');
    const msg = document.getElementById('tutorial-msg');
    if (!box || !tag || !msg) return;

    if (this.tutorialIndex < this.tutorialSteps.length) {
      const step = this.tutorialSteps[this.tutorialIndex];
      tag.innerText = step.tag;
      msg.innerText = step.msg;
      box.style.display = 'block';
    } else {
      box.style.display = 'none';
      this.isShowingTutorial = false;
      try { localStorage.setItem('sunshift_tutorial_seen', 'true'); } catch {}
    }
  }

  advanceTutorial() {
    this.tutorialIndex++;
    this.renderTutorialStep();
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
    this.player.reset();
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
  }

  showMenu() {
    this.state = GAME_STATES.MENU;
    if (document.exitPointerLock) document.exitPointerLock();
    this.input.reset();

    this.clearExtraNightZombies();
    this.player.reset();
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

  win() {
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

      for (let i = 0; i < this.zombies.length; i++) {
        this.zombies[i].update(dt, this.player, this.shift.isNight, this.city.colliders);
      }

      if (this.player.health <= 0) {
        events.emit('gameLost');
      }
    }

    this.renderPass();
  }
}
