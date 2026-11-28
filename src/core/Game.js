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
import { ColorGradingShader } from './ColorGradingShader.js';
import { assets } from './Assets.js';

import { CONFIG, applyDifficulty } from '../config.js';
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
import { SkyLighting } from '../world/SkyLighting.js';
import { Atmosphere } from '../world/Atmosphere.js';

export const GAME_STATES = {
  LOADING: 'LOADING',
  MENU: 'MENU',
  INTRO: 'INTRO',
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

    this.records = this.loadRecords();
    this.settings = this.loadSettings();
    applyDifficulty(this.settings.difficulty || 'NORMAL');

    // Auto-detect & Benchmark Tracking
    this.autoBenchmarkTimer = 0;
    this.autoBenchmarkFrames = 0;
    this.autoBenchmarkDone = (this.settings.qualityMode === 'MANUAL');
    this.hasAutoTierChanged = false;

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
    this.renderer.info.autoReset = false;

    const container = document.getElementById('game-container') || document.body;
    container.appendChild(this.renderer.domElement);

    // Read GPU info & set initial tier if in AUTO mode
    this.gpuFullName = this.getGPUInfo();
    this.gpuShortName = this.formatGPUShortName(this.gpuFullName);
    if (this.settings.qualityMode === 'AUTO') {
      const initialTier = this.determineInitialTier(this.gpuFullName);
      this.settings.quality = initialTier;
    }

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
      this.baseRenderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(this.baseRenderPass);

      // Half/Full resolution GTAOPass for optimal performance
      try {
        this.gtaoPass = new GTAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
        this.gtaoPass.blendIntensity = 0.85;
        this.gtaoPass.pdSamples = 8;
        this.gtaoPass.enabled = false;
        this.composer.addPass(this.gtaoPass);
      } catch (gtaoErr) {
        this.gtaoPass = null;
      }

      // UnrealBloomPass
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.floor(window.innerWidth * 0.5), Math.floor(window.innerHeight * 0.5)),
        CONFIG.shift.dayBloom,
        0.5,
        0.82
      );
      this.composer.addPass(this.bloomPass);

      // VignettePass
      this.vignettePass = new ShaderPass(VignetteShader);
      this.vignettePass.uniforms['offset'].value = 1.05;
      this.vignettePass.uniforms['darkness'].value = 1.25;
      this.composer.addPass(this.vignettePass);

      // ColorGradingPass
      this.colorGradingPass = new ShaderPass(ColorGradingShader);
      this.composer.addPass(this.colorGradingPass);

      // FilmPass (Grain)
      this.filmPass = new FilmPass(0.18, false);
      this.filmPass.enabled = false;
      this.composer.addPass(this.filmPass);

      // SMAAPass
      this.smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
      this.smaaPass.enabled = false;
      this.composer.addPass(this.smaaPass);

      // OutputPass
      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);
    } catch (e) {
      console.warn('EffectComposer initialization failed, falling back to WebGLRenderer:', e);
      this.composer = null;
    }

    // 4. PMREMGenerator & HDRI Environment
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremGenerator.compileEquirectangularShader();

    const dayHdr = assets.get('env_day');
    const nightHdr = assets.get('env_night');
    this.dayEnvMap = dayHdr ? this.pmremGenerator.fromEquirectangular(dayHdr).texture : null;
    this.nightEnvMap = nightHdr ? this.pmremGenerator.fromEquirectangular(nightHdr).texture : null;
    if (this.dayEnvMap) {
      this.scene.environment = this.dayEnvMap;
    }

    // 5. Core Systems, Physical Sky, Atmosphere, Entities, Vehicle & Pickups
    this.sound = new Sound();
    this.sound.setMasterVolume(this.settings.volume);

    this.effects = new Effects(this.scene);
    this.input = new Input();

    this.city = new City(this.scene, this.renderer);
    this.skyLighting = new SkyLighting(this.scene, this.renderer, this.dirLight);
    this.atmosphere = new Atmosphere(this.scene);

    this.shift = new ShiftSystem(
      this.scene,
      this.dirLight,
      this.hemiLight,
      this.bloomPass,
      this.city,
      this.sound,
      this.effects,
      this.colorGradingPass,
      this.dayEnvMap,
      this.nightEnvMap
    );
    this.player = new Player(this.scene, this.camera, this.input, this.sound, this.effects);
    this.player.sensitivity = this.settings.sensitivity;
    this.player.invertY = !!this.settings.invertY;

    this.vehicle = new Vehicle(this.scene, this.sound, this.effects);
    this.pickups = new PickupsManager(this.scene, this.sound);
    this.relays = new RelayManager(this.scene, this.sound);

    this.cameraFrustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();

    this.dialogue = new Dialogue(this.sound);
    this.missionManager = new MissionManager(this);
    this.noise = 0.0;

    this.zombies = [];
    this.extraNightZombies = [];
    this.spawnQueue = [];

    const isAutoInit = (this.settings.qualityMode === 'AUTO');
    this.applyQuality(this.settings.quality, isAutoInit);
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
        this.pause();
      }
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === GAME_STATES.PLAYING && !document.pointerLockElement) {
        this.requestPointerLockSafe();
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

  loadRecords() {
    const defaults = {
      bestSurvivalTime: 0,
      bestKills: 0
    };
    try {
      const saved = localStorage.getItem('sunshift_records');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  }

  saveRecords() {
    try {
      localStorage.setItem('sunshift_records', JSON.stringify(this.records));
    } catch (e) {
      console.warn('Could not save records', e);
    }
  }

  updateRecords(stats = this.stats) {
    if (!this.records) this.records = this.loadRecords();
    let updated = false;
    const sTime = Math.floor(parseFloat(stats.survivalTime || stats.timeSurvived || 0));
    const kills = parseInt(stats.zombiesKilled || 0, 10);

    if (sTime > (this.records.bestSurvivalTime || 0)) {
      this.records.bestSurvivalTime = sTime;
      updated = true;
    }
    if (kills > (this.records.bestKills || 0)) {
      this.records.bestKills = kills;
      updated = true;
    }

    if (updated) {
      this.saveRecords();
    }
    if (this.menu && typeof this.menu.updateRecordsDisplay === 'function') {
      this.menu.updateRecordsDisplay();
    }
    return this.records;
  }

  loadSettings() {
    const defaults = {
      volume: 0.5,
      sensitivity: 0.0025,
      fov: 65,
      invertY: false,
      qualityMode: 'AUTO',
      quality: 'MEDIUM',
      userSetQuality: false,
      difficulty: 'NORMAL'
    };
    try {
      const saved = localStorage.getItem('sunshift_settings');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  }

  setDifficulty(diff) {
    const d = (diff || 'NORMAL').toUpperCase();
    this.settings.difficulty = d;
    applyDifficulty(d);
    this.saveSettings();
    if (this.menu && typeof this.menu.updateDifficultyDisplay === 'function') {
      this.menu.updateDifficultyDisplay();
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('sunshift_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Could not save settings', e);
    }
  }

  getGPUInfo() {
    try {
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        return gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'Unknown GPU';
      }
    } catch (e) {}
    return 'Unknown GPU';
  }

  formatGPUShortName(fullName) {
    if (!fullName || fullName === 'Unknown GPU') return 'Unknown GPU';
    if (fullName.includes('Iris(R) Xe') || fullName.includes('Iris Xe')) return 'Intel Iris Xe';
    if (fullName.includes('UHD Graphics')) return 'Intel UHD';
    if (fullName.includes('RTX')) {
      const m = fullName.match(/RTX\s*[0-9]{3,4}[A-Za-z]*/i);
      return m ? `NVIDIA ${m[0]}` : 'NVIDIA RTX';
    }
    if (fullName.includes('GTX')) {
      const m = fullName.match(/GTX\s*[0-9]{3,4}[A-Za-z]*/i);
      return m ? `NVIDIA ${m[0]}` : 'NVIDIA GTX';
    }
    if (fullName.includes('Radeon')) return 'AMD Radeon';
    if (fullName.includes('Apple')) return 'Apple GPU';
    if (fullName.includes('Mali')) return 'ARM Mali';
    if (fullName.includes('Adreno')) return 'Qualcomm Adreno';
    if (fullName.includes('SwiftShader') || fullName.includes('llvmpipe')) return 'Software GPU';
    return fullName.slice(0, 24);
  }

  determineInitialTier(gpuName) {
    const name = (gpuName || '').toLowerCase();
    const highKeywords = ['nvidia', 'geforce', 'rtx', 'gtx', 'radeon rx', 'apple m'];
    const medKeywords = ['intel', 'uhd', 'iris', 'mali', 'adreno', 'swiftshader', 'llvmpipe'];

    for (const kw of highKeywords) {
      if (name.includes(kw)) return 'HIGH';
    }
    for (const kw of medKeywords) {
      if (name.includes(kw)) return 'MEDIUM';
    }
    return 'MEDIUM';
  }

  isIntegratedOrSoftwareGPU(gpuName) {
    const name = (gpuName || '').toLowerCase();
    const intKeywords = ['intel', 'uhd', 'iris', 'mali', 'adreno', 'swiftshader', 'llvmpipe', 'software'];
    return intKeywords.some(kw => name.includes(kw));
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

  setQuality(presetName, isAuto = false) {
    this.applyQuality(presetName, isAuto);
  }

  setAutoQuality() {
    this.settings.qualityMode = 'AUTO';
    this.autoBenchmarkDone = false;
    this.autoBenchmarkTimer = 0;
    this.autoBenchmarkFrames = 0;
    this.hasAutoTierChanged = false;
    this.autoUpgradeLocked = false;
    this.autoBenchmarkStage = 'INITIAL';
    const initial = this.determineInitialTier(this.gpuFullName);
    this.applyQuality(initial, true);
  }

  applyQuality(presetName, isAuto = false) {
    const tier = CONFIG.quality[presetName] ? presetName : 'MEDIUM';
    const preset = CONFIG.quality[tier];
    this.settings.quality = tier;
    if (!isAuto) {
      this.settings.qualityMode = 'MANUAL';
      this.settings.userSetQuality = true;
      this.autoBenchmarkDone = true;
    }
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
    if (this.gtaoPass) {
      this.gtaoPass.enabled = preset.gtao;
    }
    if (this.filmPass) {
      this.filmPass.enabled = preset.filmGrain;
    }
    if (this.smaaPass) {
      this.smaaPass.enabled = preset.smaa;
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
      this.atmosphere.setShiftPhase(this.shift.isNight, this.city.groundMat, tier);
    }
    if (this.city) {
      this.city.setWetAsphalt(preset.wetAsphalt);
      this.city.setLightConesVisible(preset.lightCones !== false);
      this.city.setAnisotropy(preset.anisotropy);
    }
    if (this.effects) {
      this.effects.setRainEnabled(preset.rain);
    }

    if (shadowsChanged) {
      this.scene.traverse((child) => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.needsUpdate = true);
          else child.material.needsUpdate = true;
        }
      });
    }

    const tierDisplayEl = document.getElementById('quality-tier-display');
    if (tierDisplayEl) {
      tierDisplayEl.innerText = `ACTIVE TIER: ${tier} (${this.settings.qualityMode})`;
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
      this.processSpawnQueue();
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

    const preset = CONFIG.quality[this.settings.quality] || CONFIG.quality.MEDIUM;
    const count = preset.zombieCount || 20;

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

  getMaxAlive() {
    if (this.maxAliveOverride) return this.maxAliveOverride;
    const preset = CONFIG.quality[this.settings.quality] || CONFIG.quality.MEDIUM;
    return preset.maxAlive || 14;
  }

  getActiveAliveCount() {
    return this.zombies.filter(z => !z.isDead && !z.isRemoved).length;
  }

  processSpawnQueue() {
    if (!this.spawnQueue || this.spawnQueue.length === 0) return;
    const maxAlive = this.getMaxAlive();
    while (this.spawnQueue.length > 0 && this.getActiveAliveCount() < maxAlive) {
      const task = this.spawnQueue.shift();
      if (task.type === 'CUSTOM') {
        const archetype = CONFIG.enemies[task.typeName.toLowerCase()] || CONFIG.enemies.normal;
        const z = new Zombie(this.scene, task.pos, this.sound, archetype, false);
        this.zombies.push(z);
        if (task.callback) task.callback(z);
      } else if (task.type === 'NIGHT') {
        const extraZombie = new Zombie(this.scene, task.pos, this.sound, null, true);
        this.extraNightZombies.push(extraZombie);
        this.zombies.push(extraZombie);
      }
    }
  }

  spawnCustomZombie(pos, type = 'NORMAL') {
    // Mission zombies must always appear: at the cap, remove the farthest ambient zombie
    if (this.getActiveAliveCount() >= this.getMaxAlive()) {
      const p = this.player.mesh.position;
      let farthest = null;
      for (const other of this.zombies) {
        if (other.isDead || other.isRemoved || other.isMission) continue;
        if (!farthest || other.mesh.position.distanceToSquared(p) > farthest.mesh.position.distanceToSquared(p)) {
          farthest = other;
        }
      }
      if (farthest) farthest.destroy();
    }
    const archetype = CONFIG.enemies[type.toLowerCase()] || CONFIG.enemies.normal;
    const z = new Zombie(this.scene, pos, this.sound, archetype, false);
    z.isMission = true;
    this.zombies.push(z);
    return z;
  }

  spawnExtraNightZombies() {
    const extraCount = this.settings.quality === 'LOW' ? 2 : (this.settings.quality === 'MEDIUM' ? 4 : CONFIG.shift.nightExtraSpawns);
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
        if (this.getActiveAliveCount() >= this.getMaxAlive()) {
          this.spawnQueue.push({ type: 'NIGHT', pos });
        } else {
          const extraZombie = new Zombie(this.scene, pos, this.sound, null, true);
          this.extraNightZombies.push(extraZombie);
          this.zombies.push(extraZombie);
        }
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
    // Reset auto-detect monitoring
    this.autoDetectChecked = false;
    this.autoDetectFrames = 0;
    this.autoDetectTotalTime = 0;
    this.resetWorld();
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
    this.input.reset();
    this.requestPointerLockSafe();
    events.emit('stateChange', this.state);
  }

  resetWorld() {
    this.clearExtraNightZombies();
    this.spawnQueue = [];
    if (this.dialogue) this.dialogue.clear();
    this.noise = 0;
    this.player.reset();
    this.player.unlockedWeapons = { pistol: true, shotgun: false, rifle: false };
    this.vehicle.reset();
    this.pickups.reset();
    this.relays.reset();
    this.shift.reset();
    this.spawnZombies();
    if (this.sound) this.sound.setLowHealthHeartbeat(false);
    if (this.effects) this.effects.setLowHealthEffect(false);
  }

  restart() {
    this.resetWorld();

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

    // Clear low health effects
    if (this.sound) this.sound.setLowHealthHeartbeat(false);
    if (this.effects) this.effects.setLowHealthEffect(false);

    events.emit('stateChange', this.state);
  }

  win(endingData = null) {
    if (this.dialogue) this.dialogue.clear();
    this.state = GAME_STATES.WIN;
    this.stats.survivalTime = ((performance.now() - this.stats.startTime) / 1000).toFixed(1);
    this.updateRecords(this.stats);
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
    if (this.dialogue) this.dialogue.clear();
    this.state = GAME_STATES.LOSE;
    this.stats.survivalTime = ((performance.now() - this.stats.startTime) / 1000).toFixed(1);
    this.updateRecords(this.stats);
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
    if (this.gtaoPass && typeof this.gtaoPass.setSize === 'function') {
      this.gtaoPass.setSize(window.innerWidth, window.innerHeight);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(Math.floor(window.innerWidth * 0.5), Math.floor(window.innerHeight * 0.5));
    }
    if (this.smaaPass && typeof this.smaaPass.setSize === 'function') {
      this.smaaPass.setSize(window.innerWidth, window.innerHeight);
    }
  }

  renderPass() {
    const t0 = performance.now();
    if (this.usePostProcessing && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.lastRenderMs = performance.now() - t0;
    this.lastFrameCalls = this.renderer.info.render.calls;
    this.lastFrameTriangles = this.renderer.info.render.triangles;
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const frameStart = performance.now();
    const dt = Math.min(this.clock.getDelta(), 0.1);

    this.renderer.info.reset();

    // FPS Display Tracker
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 500) {
      if (this.fpsCounterEl && this.showFps) {
        const fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
        const mode = this.settings.qualityMode === 'AUTO' ? 'AUTO' : 'MANUAL';
        const calls = this.lastFrameCalls !== undefined ? this.lastFrameCalls : this.renderer.info.render.calls;
        const tris = this.lastFrameTriangles !== undefined ? this.lastFrameTriangles : this.renderer.info.render.triangles;
        this.fpsCounterEl.innerHTML = `FPS: ${fps} &nbsp;|&nbsp; GPU: ${this.gpuShortName} &nbsp;|&nbsp; TIER: ${this.settings.quality} (${mode}) &nbsp;|&nbsp; DC: ${calls} &nbsp;|&nbsp; TRI: ${tris.toLocaleString()}`;
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
      // Auto-quality benchmark
      if (this.settings.qualityMode === 'AUTO' && !this.autoBenchmarkDone) {
        this.autoBenchmarkTimer += dt;
        this.autoBenchmarkFrames++;
        if (this.autoBenchmarkTimer >= 6.0) {
          const avgFps = this.autoBenchmarkFrames / this.autoBenchmarkTimer;
          const tiers = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
          const currentIdx = tiers.indexOf(this.settings.quality);
          const isIntegrated = this.isIntegratedOrSoftwareGPU(this.gpuFullName);

          if (this.autoBenchmarkStage === 'POST_UPGRADE') {
            // After auto-upgrade, check if avg FPS is < 45
            if (avgFps < 45 && currentIdx > 0) {
              const lowerTier = tiers[currentIdx - 1];
              this.applyQuality(lowerTier, true);
              this.autoUpgradeLocked = true;
              this.showToast(`Quality set to ${lowerTier} (auto)`);
            }
            this.autoBenchmarkDone = true;
          } else {
            // Initial stage
            let newTier = null;
            if (avgFps < 30 && currentIdx > 0) {
              newTier = tiers[currentIdx - 1];
              this.autoBenchmarkDone = true;
            } else if (avgFps > 58 && !this.autoUpgradeLocked) {
              // Intel/UHD/Iris/Mali/Adreno/SwiftShader GPU can only reach MEDIUM max
              const maxAllowedTierIdx = isIntegrated ? tiers.indexOf('MEDIUM') : tiers.length - 1;
              if (currentIdx < maxAllowedTierIdx) {
                newTier = tiers[currentIdx + 1];
                this.autoBenchmarkStage = 'POST_UPGRADE';
                this.autoBenchmarkTimer = 0;
                this.autoBenchmarkFrames = 0;
              } else {
                this.autoBenchmarkDone = true;
              }
            } else {
              this.autoBenchmarkDone = true;
            }

            if (newTier && newTier !== this.settings.quality) {
              this.applyQuality(newTier, true);
              this.showToast(`Quality set to ${newTier} (auto)`);
            }
          }
        }
      }

      // Core world updates: day/night cycle, car physics, pickups
      this.shift.update(dt);
      if (this.skyLighting) this.skyLighting.update(dt);
      this.vehicle.update(dt, this.input, this.city.colliders, this.zombies, this.shift.isNight);
      // While driving, the player travels with the car
      if (this.vehicle.isOccupied) this.player.mesh.position.copy(this.vehicle.mesh.position);
      this.pickups.update(dt, this.player);

      const activeEntityPos = this.vehicle.isOccupied ? this.vehicle.mesh.position : this.player.mesh.position;
      this.effects.update(dt, activeEntityPos);
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
        this.player.update(dt, this.city.colliders, this.zombies, this.city.rayTargets);
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

      this.projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.cameraFrustum.setFromProjectionMatrix(this.projScreenMatrix);

      const pPos = this.player.mesh.position;

      // Tiered Animation Budget (LOW: 6, MEDIUM: 8, HIGH: 12, ULTRA: 16) & Shadow Gating
      const activeList = [];
      for (let i = 0; i < this.zombies.length; i++) {
        const z = this.zombies[i];
        if (!z.isDead && !z.isRemoved && z.mesh) {
          activeList.push({
            zombie: z,
            dist: z.mesh.position.distanceTo(pPos)
          });
        }
      }
      activeList.sort((a, b) => a.dist - b.dist);

      const fullRateLimit = this.settings.quality === 'LOW' ? 6 : (this.settings.quality === 'MEDIUM' ? 8 : (this.settings.quality === 'HIGH' ? 12 : 16));
      const isHighOrUltra = (this.settings.quality === 'HIGH' || this.settings.quality === 'ULTRA');

      for (let k = 0; k < activeList.length; k++) {
        const item = activeList[k];
        const z = item.zombie;
        const dist = item.dist;

        // Animation budget tier
        if (k < fullRateLimit && dist < 40) {
          z.animBudgetTier = 'FULL';
        } else if (dist < 40) {
          z.animBudgetTier = 'THROTTLED_15HZ';
        } else {
          z.animBudgetTier = 'FROZEN';
        }

        // Shadow assignment: MEDIUM / LOW = false; HIGH / ULTRA = closest 8
        const shouldShadow = isHighOrUltra && k < 8;
        if (z.skinnedMesh && z.skinnedMesh.castShadow !== shouldShadow) {
          z.skinnedMesh.castShadow = shouldShadow;
        }
      }

      for (let i = this.zombies.length - 1; i >= 0; i--) {
        const z = this.zombies[i];
        if (z.isRemoved) {
          this.zombies.splice(i, 1);
          const extraIdx = this.extraNightZombies.indexOf(z);
          if (extraIdx !== -1) {
            this.extraNightZombies.splice(extraIdx, 1);
          }
          this.processSpawnQueue();
          continue;
        }
        z.update(dt, this.player, this.shift.isNight, this.city.colliders, _frustum);
      }

      if (this.player.health <= 0) {
        if (!this.benchmark || !this.benchmark.active) {
          events.emit('gameLost');
        } else {
          this.player.health = this.player.maxHealth;
        }
      }
    }

    this.lastUpdateMs = performance.now() - frameStart;
    this.renderPass();

    if (this.benchmark && this.benchmark.active) {
      const now = performance.now();
      const frameDelta = now - (this.lastBenchmarkFrameTime || frameStart);
      this.lastBenchmarkFrameTime = now;
      this.benchmark.frames++;
      this.benchmark.frameDeltas.push(frameDelta);
      this.benchmark.updateTimes.push(this.lastUpdateMs || 0);
      this.benchmark.renderTimes.push(this.lastRenderMs || 0);
      this.benchmark.drawCalls.push(this.lastFrameCalls || 0);
      this.benchmark.triangles.push(this.lastFrameTriangles || 0);

      if (this.benchmark.frames >= this.benchmark.targetFrames) {
        this.benchmark.active = false;
        this.benchmark.completed = true;
      }
    }
  }

  startBenchmark(targetFrames = 600) {
    this.benchmark = {
      active: true,
      completed: false,
      targetFrames,
      frames: 0,
      frameDeltas: [],
      updateTimes: [],
      renderTimes: [],
      drawCalls: [],
      triangles: []
    };
    this.lastBenchmarkFrameTime = performance.now();
    return { status: 'started', targetFrames };
  }

  getBenchmarkResults() {
    if (!this.benchmark) return { error: 'No benchmark run' };
    if (!this.benchmark.completed) return { status: 'running', frames: this.benchmark.frames, targetFrames: this.benchmark.targetFrames };

    // Discard first 5 frames for stabilization
    const sliceIdx = Math.min(5, this.benchmark.frameDeltas.length);
    const validDeltas = this.benchmark.frameDeltas.slice(sliceIdx);
    const validUpdates = this.benchmark.updateTimes.slice(sliceIdx);
    const validRenders = this.benchmark.renderTimes.slice(sliceIdx);
    const validCalls = this.benchmark.drawCalls.slice(sliceIdx);
    const validTris = this.benchmark.triangles.slice(sliceIdx);

    const fpsList = validDeltas.map(d => 1000 / Math.max(d, 0.001));
    const avgFps = fpsList.reduce((a, b) => a + b, 0) / Math.max(1, fpsList.length);
    const minFps = Math.min(...fpsList);
    const maxFps = Math.max(...fpsList);

    const avgUpdateMs = validUpdates.reduce((a, b) => a + b, 0) / Math.max(1, validUpdates.length);
    const avgRenderMs = validRenders.reduce((a, b) => a + b, 0) / Math.max(1, validRenders.length);
    const avgDrawCalls = Math.round(validCalls.reduce((a, b) => a + b, 0) / Math.max(1, validCalls.length));
    const avgTriangles = Math.round(validTris.reduce((a, b) => a + b, 0) / Math.max(1, validTris.length));

    // Zombie node counts
    let skinnedMeshesPerZombie = 0;
    let materialsPerZombie = 0;
    if (this.zombies.length > 0) {
      this.zombies[0].mesh.traverse(c => {
        if (c.isSkinnedMesh) {
          skinnedMeshesPerZombie++;
          materialsPerZombie += Array.isArray(c.material) ? c.material.length : 1;
        }
      });
    }

    const bottleneck = avgUpdateMs > avgRenderMs ? 'CPU (update/mixers)' : 'GPU (composer/fillrate)';

    return {
      status: 'completed',
      totalFrames: this.benchmark.frames,
      quality: this.settings.quality,
      activeZombies: this.zombies.length,
      avgFps: Math.round(avgFps * 10) / 10,
      minFps: Math.round(minFps * 10) / 10,
      maxFps: Math.round(maxFps * 10) / 10,
      avgUpdateMs: Math.round(avgUpdateMs * 100) / 100,
      avgRenderMs: Math.round(avgRenderMs * 100) / 100,
      avgDrawCalls,
      avgTriangles,
      bottleneck,
      f3Text: this.fpsCounterEl ? this.fpsCounterEl.innerText : '',
      gpu: this.gpuFullName,
      zombieStats: {
        skinnedMeshesPerZombie,
        materialsPerZombie,
        drawCallsPerZombie: skinnedMeshesPerZombie
      }
    };
  }
}
