// FILE: src/core/Game.js
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
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
import { SkyLighting } from '../world/SkyLighting.js';
import { Atmosphere } from '../world/Atmosphere.js';

export const GAME_STATES = {
  LOADING: 'LOADING',
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  WIN: 'WIN',
  LOSE: 'LOSE'
};

// Module-level reusable scratch objects
const _projScreenMatrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _vehicleCamRear = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);

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

    // Auto-detect Quality State (Monitors first 5s of gameplay)
    this.autoDetectChecked = false;
    this.autoDetectFrames = 0;
    this.autoDetectTotalTime = 0;

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

    // 2. Lighting with Optimized Shadow Camera Extents
    this.hemiLight = new THREE.HemisphereLight(CONFIG.shift.dayHemiSky, CONFIG.shift.dayHemiGround, CONFIG.shift.dayHemiIntensity);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(CONFIG.shift.dayDirColor, CONFIG.shift.dayDirIntensity);
    this.dirLight.position.set(30, 50, 25);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1536;
    this.dirLight.shadow.mapSize.height = 1536;
    this.dirLight.shadow.camera.near = 1.0;
    this.dirLight.shadow.camera.far = 110;

    // Tighter shadow frustum bounds (28 units radius)
    const d = 28;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0006;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // 3. Post-Processing Pipeline (GTAOPass, UnrealBloomPass, Vignette, FilmPass, SMAAPass)
    try {
      this.composer = new EffectComposer(this.renderer);
      this.renderPassObj = new RenderPass(this.scene, this.camera);
      this.composer.addPass(this.renderPassObj);

      // Half-resolution GTAOPass for optimal laptop performance
      try {
        const halfW = Math.max(1, Math.floor(window.innerWidth * 0.5));
        const halfH = Math.max(1, Math.floor(window.innerHeight * 0.5));
        this.gtaoPass = new GTAOPass(this.scene, this.camera, halfW, halfH);
        this.gtaoPass.blendIntensity = 0.8;
        this.gtaoPass.pdSamples = 8;
        const origGtaoSetSize = this.gtaoPass.setSize.bind(this.gtaoPass);
        this.gtaoPass.setSize = (w, h) => {
          origGtaoSetSize(Math.max(1, Math.floor(w * 0.5)), Math.max(1, Math.floor(h * 0.5)));
        };
        this.gtaoPass.enabled = false;
        this.composer.addPass(this.gtaoPass);
      } catch (gtaoErr) {
        this.gtaoPass = null;
      }

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.floor(window.innerWidth * 0.5), Math.floor(window.innerHeight * 0.5)),
        CONFIG.shift.dayBloom,
        0.5,
        0.82
      );
      this.composer.addPass(this.bloomPass);

      this.vignettePass = new ShaderPass(VignetteShader);
      this.vignettePass.uniforms['offset'].value = 1.05;
      this.vignettePass.uniforms['darkness'].value = 1.25;
      this.composer.addPass(this.vignettePass);

      this.filmPass = new FilmPass(0.12, false);
      this.composer.addPass(this.filmPass);

      this.smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
      this.composer.addPass(this.smaaPass);

      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);
    } catch (e) {
      console.warn('EffectComposer initialization failed, falling back to WebGLRenderer:', e);
      this.composer = null;
    }

    // 4. Core Systems, Physical Sky, Atmosphere, Entities, Vehicle & Pickups
    this.sound = new Sound();
    this.sound.setMasterVolume(this.settings.volume);

    this.effects = new Effects(this.scene);
    this.input = new Input();

    this.city = new City(this.scene, this.renderer);
    this.skyLighting = new SkyLighting(this.scene, this.renderer, this.dirLight);
    this.atmosphere = new Atmosphere(this.scene);

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

    // 5. Pre-warm WebGL shader pipelines to eliminate in-game hitching
    try {
      this.renderer.compile(this.scene, this.camera);
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    } catch (compileErr) {
      console.warn('Pre-compile notice:', compileErr);
    }

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
    // Default quality is MEDIUM (HIGH only when explicitly selected by user)
    const defaults = { volume: 0.5, sensitivity: 0.0025, fov: 65, invertY: false, quality: 'MEDIUM', userSetQuality: false };
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
    if (this.player) this.player.sensitivity = val;
    this.saveSettings();
  }

  setVolume(val) {
    this.settings.volume = val;
    if (this.sound) this.sound.setMasterVolume(val);
    this.saveSettings();
  }

  setFov(val) {
    this.settings.fov = val;
    if (this.camera) {
      this.camera.fov = val;
      this.camera.updateProjectionMatrix();
    }
    this.saveSettings();
  }

  setInvertY(val) {
    this.settings.invertY = val;
    if (this.player) this.player.invertY = val;
    this.saveSettings();
  }

  setQuality(presetName, isUserAction = false) {
    if (isUserAction) {
      this.settings.userSetQuality = true;
    }
    this.applyQuality(presetName);
  }

  applyQuality(presetName) {
    const preset = CONFIG.quality[presetName] || CONFIG.quality.MEDIUM;
    this.settings.quality = presetName;
    this.saveSettings();

    const shadowsChanged = this.renderer.shadowMap.enabled !== preset.shadows;
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.setPixelRatio(preset.pixelRatio);

    this.usePostProcessing = preset.postProcessing !== false;

    if (this.composer) {
      this.composer.setPixelRatio(preset.pixelRatio);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
    if (this.gtaoPass) {
      this.gtaoPass.enabled = !!preset.gtao;
    }
    if (this.bloomPass) {
      this.bloomPass.enabled = !!preset.bloom;
    }
    if (this.vignettePass) {
      this.vignettePass.enabled = !!preset.vignette;
    }
    if (this.filmPass) {
      this.filmPass.enabled = !!preset.film;
    }
    if (this.smaaPass) {
      this.smaaPass.enabled = !!preset.smaa;
    }

    if (this.city) {
      this.city.setLightConesVisible(preset.lightCones !== false);
    }

    if (preset.shadows) {
      this.dirLight.shadow.mapSize.width = preset.shadowMapSize;
      this.dirLight.shadow.mapSize.height = preset.shadowMapSize;
      if (this.dirLight.shadow.map) {
        this.dirLight.shadow.map.dispose();
        this.dirLight.shadow.map = null;
      }
    }

    if (this.atmosphere && this.city && this.shift) {
      this.atmosphere.setShiftPhase(this.shift.isNight, this.city.groundMat, presetName);
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

  showToast(msg) {
    let toast = document.getElementById('perf-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'perf-toast';
      toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(18,20,26,0.92);border:1px solid #ffaa00;color:#ffaa00;padding:10px 20px;border-radius:8px;font-family:sans-serif;font-size:13px;font-weight:bold;letter-spacing:1px;box-shadow:0 4px 20px rgba(0,0,0,0.8);z-index:9999;transition:opacity 0.5s ease;pointer-events:none;';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => { if (toast) toast.style.display = 'none'; }, 500);
    }, 3000);
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

        if (this.skyLighting) {
          this.skyLighting.setShiftPhase(isNight);
        }
        if (this.atmosphere && this.city) {
          this.atmosphere.setShiftPhase(isNight, this.city.groundMat, this.settings.quality);
        }

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

    const count = (CONFIG.zombie.counts && CONFIG.zombie.counts[this.settings.quality]) || 16;

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
    const extraCount = this.settings.quality === 'LOW' ? 3 : (this.settings.quality === 'MEDIUM' ? 5 : CONFIG.shift.nightExtraSpawns);
    const pPos = this.player.mesh.position;
    for (let i = 0; i < extraCount; i++) {
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

  start() {
    if (this.sound) this.sound.startAmbient();
    this.state = GAME_STATES.PLAYING;
    this.stats.startTime = performance.now();
    this.stats.zombiesKilled = 0;
    this.stats.relaysCollected = 0;
    this.stats.shiftsSurvived = 0;

    // Reset auto-detect monitoring
    this.autoDetectChecked = false;
    this.autoDetectFrames = 0;
    this.autoDetectTotalTime = 0;

    this.player.reset();
    this.vehicle.reset();
    this.pickups.reset();
    this.relays.reset();
    this.shift.reset();
    this.spawnZombies();

    // Clear low health effects
    if (this.sound) this.sound.setLowHealthHeartbeat(false);
    if (this.effects) this.effects.setLowHealthEffect(false);

    // Initial tutorial step
    const hasSeenTutorial = localStorage.getItem('sunshift_tutorial_seen');
    if (!hasSeenTutorial) {
      this.showTutorial(0);
    }

    this.requestPointerLockSafe();
    events.emit('stateChange', this.state);
  }

  showTutorial(index) {
    if (index >= this.tutorialSteps.length) {
      this.isShowingTutorial = false;
      const el = document.getElementById('tutorial-box');
      if (el) el.style.display = 'none';
      localStorage.setItem('sunshift_tutorial_seen', 'true');
      return;
    }

    this.isShowingTutorial = true;
    this.tutorialIndex = index;
    const step = this.tutorialSteps[index];

    const box = document.getElementById('tutorial-box');
    const tag = document.getElementById('tutorial-step-tag');
    const msg = document.getElementById('tutorial-msg');

    if (box) box.style.display = 'block';
    if (tag) tag.textContent = step.tag;
    if (msg) msg.textContent = step.msg;
  }

  advanceTutorial() {
    this.showTutorial(this.tutorialIndex + 1);
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
    this.requestPointerLockSafe();
    events.emit('stateChange', this.state);
  }

  showMenu() {
    this.state = GAME_STATES.MENU;
    if (document.exitPointerLock) document.exitPointerLock();
    this.input.reset();

    // Clear low health effects
    if (this.sound) this.sound.setLowHealthHeartbeat(false);
    if (this.effects) this.effects.setLowHealthEffect(false);

    events.emit('stateChange', this.state);
  }

  restart() {
    this.state = GAME_STATES.PLAYING;
    this.stats.startTime = performance.now();
    this.stats.zombiesKilled = 0;
    this.stats.relaysCollected = 0;
    this.stats.shiftsSurvived = 0;

    this.autoDetectChecked = false;
    this.autoDetectFrames = 0;
    this.autoDetectTotalTime = 0;

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
    if (this.gtaoPass) {
      this.gtaoPass.setSize(window.innerWidth, window.innerHeight);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(Math.floor(window.innerWidth * 0.5), Math.floor(window.innerHeight * 0.5));
    }
    if (this.smaaPass) {
      this.smaaPass.setSize(window.innerWidth, window.innerHeight);
    }
  }

  renderPass() {
    if (this.usePostProcessing && this.composer) {
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
      if (this.skyLighting) this.skyLighting.update(dt);
      this.shift.applyShiftVisuals(dt);
      this.renderPass();
      return;
    }

    if (this.state === GAME_STATES.PLAYING) {
      // Auto-detect: first 5 seconds FPS monitoring
      if (!this.autoDetectChecked && !this.settings.userSetQuality) {
        this.autoDetectTotalTime += dt;
        this.autoDetectFrames++;
        if (this.autoDetectTotalTime >= 5.0) {
          this.autoDetectChecked = true;
          const avgFps = this.autoDetectFrames / this.autoDetectTotalTime;
          if (avgFps < 30) {
            if (this.settings.quality === 'HIGH') {
              this.setQuality('MEDIUM', false);
              this.showToast('Quality lowered for performance');
            } else if (this.settings.quality === 'MEDIUM') {
              this.setQuality('LOW', false);
              this.showToast('Quality lowered for performance');
            }
          }
        }
      }

      this.effects.update(dt);
      this.shift.update(dt);
      if (this.skyLighting) this.skyLighting.update(dt);
      this.vehicle.update(dt, this.input, this.city.colliders, this.zombies, this.shift.isNight);
      this.pickups.update(dt, this.player);

      const activeEntityPos = this.vehicle.isOccupied ? this.vehicle.mesh.position : this.player.mesh.position;
      if (this.atmosphere) this.atmosphere.update(dt, activeEntityPos);

      if (this.vehicle.isOccupied) {
        _vehicleCamRear.set(0, CONFIG.vehicle.camHeight, -CONFIG.vehicle.camDistance)
          .applyAxisAngle(_upAxis, this.vehicle.yaw);
        this.camera.position.copy(this.vehicle.mesh.position).add(_vehicleCamRear);
        this.camera.lookAt(
          this.vehicle.mesh.position.x,
          this.vehicle.mesh.position.y + 1.2,
          this.vehicle.mesh.position.z
        );
      } else {
        this.player.update(dt, this.city.colliders, this.zombies, this.city.meshes);
      }

      this.dirLight.position.set(
        activeEntityPos.x + 28,
        activeEntityPos.y + 45,
        activeEntityPos.z + 22
      );
      this.dirLight.target.position.copy(activeEntityPos);

      this.relays.update(dt, this.vehicle.isOccupied ? { mesh: { position: this.vehicle.mesh.position } } : this.player);

      const qPreset = CONFIG.quality[this.settings.quality] || CONFIG.quality.MEDIUM;
      this.city.updateStreetlights(activeEntityPos, qPreset.pointLights);

      // Frustum calculation for zombie LOD & animation culling
      _projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_projScreenMatrix);

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
        z.update(dt, this.player, this.shift.isNight, this.city.colliders, _frustum);
      }

      if (this.player.health <= 0) {
        events.emit('gameLost');
      }
    }

    this.renderPass();
  }
}
