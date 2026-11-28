import * as THREE from 'three';
import { assets } from '../core/Assets.js';
import { CONFIG } from '../config.js';

export class AnimViewer {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'anim-viewer-container';
    this.container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;background:#14171d;color:#fff;font-family:monospace;';
    document.body.appendChild(this.container);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x15181f);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0.0, 1.0, 3.5); // Side view default (perpendicular to X-axis motion)
    this.target = new THREE.Vector3(0, 0.9, 0);
    this.camera.lookAt(this.target);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Studio Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x6ec6ff, 1.8);
    rimLight.position.set(-4, 3, -3);
    this.scene.add(rimLight);

    // Turntable Platform & Floor Grid
    this.platform = new THREE.Group();
    const platGeo = new THREE.CylinderGeometry(2.4, 2.5, 0.1, 48);
    const platMat = new THREE.MeshStandardMaterial({ color: 0x222630, roughness: 0.6, metalness: 0.2 });
    const platMesh = new THREE.Mesh(platGeo, platMat);
    platMesh.position.y = -0.05;
    platMesh.receiveShadow = true;
    this.platform.add(platMesh);

    const rimGeo = new THREE.TorusGeometry(2.42, 0.02, 16, 64);
    const rimMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.rotation.x = Math.PI / 2;
    this.platform.add(rimMesh);

    const grid = new THREE.GridHelper(10, 20, 0x00f3ff, 0x333b47);
    grid.position.y = 0.001;
    this.scene.add(grid);
    this.scene.add(this.platform);

    this.models = {};
    this.mixers = {};
    this.actions = {};
    this.currentClips = { survivor: 'walk', zombie: 'walk' };
    this.speedMultiplier = 1.0;
    this.isTurntableRotating = false;
    this.activeCharacter = 'survivor'; // 'survivor', 'zombie', 'both'

    this.clock = new THREE.Clock();
    window.THREE = THREE;

    this.setupCharacters();
    this.setupUI();
    this.setupMouseControls();

    window.__ANIM_VIEWER__ = this;
    this.assets = assets;
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupCharacters() {
    const scale = 1.8;

    // 1. Survivor
    const pMesh = assets.getInstance('player');
    const pClips = assets.getAnimations('player') || [];
    if (pMesh) {
      pMesh.scale.set(scale, scale, scale);
      pMesh.position.set(0, 0, 0);
      pMesh.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.platform.add(pMesh);
      this.models.survivor = pMesh;

      const pMixer = new THREE.AnimationMixer(pMesh);
      this.mixers.survivor = pMixer;
      this.actions.survivor = {};

      for (const clip of pClips) {
        const action = pMixer.clipAction(clip);
        this.actions.survivor[clip.name.toLowerCase()] = action;
        // Also map standard names
        if (/walk/i.test(clip.name)) this.actions.survivor['walk'] = action;
        if (/run/i.test(clip.name)) this.actions.survivor['run'] = action;
        if (/idle/i.test(clip.name)) this.actions.survivor['idle'] = action;
        if (/shoot/i.test(clip.name)) this.actions.survivor['shoot'] = action;
        if (/hurt/i.test(clip.name)) this.actions.survivor['hurt'] = action;
        if (/fall|death/i.test(clip.name)) this.actions.survivor['fall'] = action;
      }

      if (this.actions.survivor.walk) {
        this.actions.survivor.walk.play();
      }
    }

    // 2. Zombie
    const zMesh = assets.getInstance('zombie');
    const zClips = assets.getAnimations('zombie') || [];
    if (zMesh) {
      zMesh.scale.set(scale, scale, scale);
      zMesh.position.set(0, 0, 0);
      zMesh.visible = false; // Hidden initially in single view
      zMesh.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.platform.add(zMesh);
      this.models.zombie = zMesh;

      const zMixer = new THREE.AnimationMixer(zMesh);
      this.mixers.zombie = zMixer;
      this.actions.zombie = {};

      for (const clip of zClips) {
        const action = zMixer.clipAction(clip);
        this.actions.zombie[clip.name.toLowerCase()] = action;
        if (/walk/i.test(clip.name)) this.actions.zombie['walk'] = action;
        if (/run/i.test(clip.name)) this.actions.zombie['run'] = action;
        if (/idle/i.test(clip.name)) this.actions.zombie['idle'] = action;
      }

      if (this.actions.zombie.walk) {
        this.actions.zombie.walk.play();
      }
    }
  }

  playClip(char, clipName) {
    const actions = this.actions[char];
    if (!actions) return;
    const action = actions[clipName.toLowerCase()];
    if (!action) {
      console.warn(`[AnimViewer] Clip ${clipName} not found for ${char}`);
      return;
    }

    // Fade out other actions for this character
    for (const key in actions) {
      const act = actions[key];
      if (act !== action) {
        act.fadeOut(0.2);
      }
    }

    action.reset().fadeIn(0.2).play();
    action.timeScale = this.speedMultiplier;
    this.currentClips[char] = clipName;
  }

  setCharacterMode(mode) {
    this.activeCharacter = mode;
    if (mode === 'survivor') {
      if (this.models.survivor) {
        this.models.survivor.visible = true;
        this.models.survivor.position.set(0, 0, 0);
      }
      if (this.models.zombie) this.models.zombie.visible = false;
    } else if (mode === 'zombie') {
      if (this.models.survivor) this.models.survivor.visible = false;
      if (this.models.zombie) {
        this.models.zombie.visible = true;
        this.models.zombie.position.set(0, 0, 0);
      }
    } else if (mode === 'both') {
      if (this.models.survivor) {
        this.models.survivor.visible = true;
        this.models.survivor.position.set(0.9, 0, 0);
      }
      if (this.models.zombie) {
        this.models.zombie.visible = true;
        this.models.zombie.position.set(-0.9, 0, 0);
      }
    }
    this.updateClipButtons();
  }

  setCameraPreset(preset) {
    if (preset === 'side') {
      this.camera.position.set(0.0, 1.0, 3.5);
      this.target.set(0, 0.9, 0);
    } else if (preset === 'front') {
      this.camera.position.set(3.5, 1.0, 0.0);
      this.target.set(0, 0.9, 0);
    } else if (preset === 'perspective') {
      this.camera.position.set(2.6, 1.6, 2.6);
      this.target.set(0, 0.9, 0);
    }
    this.camera.lookAt(this.target);
  }

  setupUI() {
    const ui = document.createElement('div');
    ui.id = 'anim-viewer-ui';
    ui.style.cssText = `
      position: absolute; top: 16px; left: 16px; width: 360px;
      background: rgba(18, 22, 30, 0.92); border: 1px solid #00f3ff;
      border-radius: 8px; padding: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.8);
      font-size: 12px; line-height: 1.5; z-index: 100000;
    `;

    ui.innerHTML = `
      <div style="font-weight:bold; font-size:14px; color:#00f3ff; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <span>🎬 SUNSHIFT ANIMATION VIEWER</span>
        <a href="?" style="color:#ff4444; font-size:11px; text-decoration:none;">✕ EXIT</a>
      </div>
      <div style="margin-bottom:10px;">
        <span style="color:#8892b0;">CHARACTER:</span>
        <button id="btn-char-survivor" class="av-btn active">SURVIVOR</button>
        <button id="btn-char-zombie" class="av-btn">ZOMBIE</button>
        <button id="btn-char-both" class="av-btn">BOTH</button>
      </div>
      <div style="margin-bottom:10px;">
        <div style="color:#8892b0; margin-bottom:4px;">CLIPS:</div>
        <div id="av-clip-buttons" style="display:flex; flex-wrap:wrap; gap:4px;"></div>
      </div>
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between;">
          <span style="color:#8892b0;">SPEED:</span>
          <span id="av-speed-label" style="color:#00f3ff;">1.00x</span>
        </div>
        <input id="av-speed-slider" type="range" min="0.1" max="2.0" step="0.05" value="1.0" style="width:100%; cursor:pointer;">
      </div>
      <div style="margin-bottom:10px;">
        <div style="color:#8892b0; margin-bottom:4px;">CAMERA PRESET:</div>
        <button id="btn-cam-side" class="av-btn active">SIDE VIEW (FOOT SLIDE)</button>
        <button id="btn-cam-front" class="av-btn">FRONT</button>
        <button id="btn-cam-persp" class="av-btn">3/4 ORBIT</button>
      </div>
      <div style="margin-bottom:12px;">
        <button id="btn-turntable-toggle" class="av-btn" style="width:100%;">TURNTABLE ROTATION: OFF</button>
      </div>
      <div style="border-top:1px solid #233554; padding-top:10px; margin-top:10px;">
        <div style="color:#00f3ff; font-weight:bold; margin-bottom:6px;">DIAGNOSTICS & TELEMETRY:</div>
        <button id="btn-measure-stride" class="av-btn" style="width:100%; margin-bottom:6px; background:#004d40; border-color:#00bfa5;">📐 MEASURE STRIDE SPEED</button>
        <button id="btn-gen-contact" class="av-btn" style="width:100%; background:#2c384a; border-color:#6ec6ff;">📸 GENERATE CONTACT SHEET (8 FRAMES)</button>
        <div id="av-diagnostics-output" style="margin-top:8px; font-size:11px; color:#a8b2d1; max-height:120px; overflow-y:auto; background:rgba(0,0,0,0.4); padding:6px; border-radius:4px;">Ready.</div>
      </div>
    `;

    this.container.appendChild(ui);

    // Styling for buttons
    const style = document.createElement('style');
    style.innerHTML = `
      .av-btn {
        background: #1b202c; border: 1px solid #333b47; color: #ccd6f6;
        padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;
        font-family: monospace; transition: all 0.15s ease;
      }
      .av-btn:hover { background: #232b3b; border-color: #00f3ff; color: #fff; }
      .av-btn.active { background: #003747; border-color: #00f3ff; color: #00f3ff; font-weight: bold; }
    `;
    document.head.appendChild(style);

    // Hook events
    document.getElementById('btn-char-survivor').onclick = () => {
      this.setActiveBtn(['btn-char-survivor', 'btn-char-zombie', 'btn-char-both'], 'btn-char-survivor');
      this.setCharacterMode('survivor');
    };
    document.getElementById('btn-char-zombie').onclick = () => {
      this.setActiveBtn(['btn-char-survivor', 'btn-char-zombie', 'btn-char-both'], 'btn-char-zombie');
      this.setCharacterMode('zombie');
    };
    document.getElementById('btn-char-both').onclick = () => {
      this.setActiveBtn(['btn-char-survivor', 'btn-char-zombie', 'btn-char-both'], 'btn-char-both');
      this.setCharacterMode('both');
    };

    const slider = document.getElementById('av-speed-slider');
    const speedLbl = document.getElementById('av-speed-label');
    slider.oninput = (e) => {
      const val = parseFloat(e.target.value);
      this.speedMultiplier = val;
      speedLbl.textContent = `${val.toFixed(2)}x`;
      for (const char in this.mixers) {
        this.mixers[char].timeScale = val;
      }
    };

    document.getElementById('btn-cam-side').onclick = () => {
      this.setActiveBtn(['btn-cam-side', 'btn-cam-front', 'btn-cam-persp'], 'btn-cam-side');
      this.setCameraPreset('side');
    };
    document.getElementById('btn-cam-front').onclick = () => {
      this.setActiveBtn(['btn-cam-side', 'btn-cam-front', 'btn-cam-persp'], 'btn-cam-front');
      this.setCameraPreset('front');
    };
    document.getElementById('btn-cam-persp').onclick = () => {
      this.setActiveBtn(['btn-cam-side', 'btn-cam-front', 'btn-cam-persp'], 'btn-cam-persp');
      this.setCameraPreset('perspective');
    };

    const ttBtn = document.getElementById('btn-turntable-toggle');
    ttBtn.onclick = () => {
      this.isTurntableRotating = !this.isTurntableRotating;
      ttBtn.textContent = `TURNTABLE ROTATION: ${this.isTurntableRotating ? 'ON' : 'OFF'}`;
      ttBtn.classList.toggle('active', this.isTurntableRotating);
    };

    document.getElementById('btn-measure-stride').onclick = () => {
      this.measureStride();
    };

    document.getElementById('btn-gen-contact').onclick = () => {
      const char = this.activeCharacter === 'zombie' ? 'zombie' : 'survivor';
      const clip = this.currentClips[char] || 'walk';
      this.generateContactSheet(char, clip);
    };

    this.updateClipButtons();
  }

  setActiveBtn(allIds, activeId) {
    for (const id of allIds) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', id === activeId);
    }
  }

  updateClipButtons() {
    const btnContainer = document.getElementById('av-clip-buttons');
    if (!btnContainer) return;
    btnContainer.innerHTML = '';

    const char = this.activeCharacter === 'zombie' ? 'zombie' : 'survivor';
    const actions = this.actions[char] || {};
    const current = this.currentClips[char] || 'walk';

    for (const clipName of Object.keys(actions)) {
      // deduplicate
      if (['fall', 'hurt', 'idle', 'shoot', 'run', 'walk'].includes(clipName) || !actions[clipName.toLowerCase()]) {
        const btn = document.createElement('button');
        btn.className = `av-btn ${clipName.toLowerCase() === current.toLowerCase() ? 'active' : ''}`;
        btn.textContent = clipName.toUpperCase();
        btn.onclick = () => {
          this.playClip(char, clipName);
          const all = btnContainer.querySelectorAll('.av-btn');
          all.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        };
        btnContainer.appendChild(btn);
      }
    }
  }

  setupMouseControls() {
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    this.renderer.domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        isDragging = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const dx = e.clientX - prevMouseX;
        const dy = e.clientY - prevMouseY;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;

        this.platform.rotation.y += dx * 0.008;
        this.camera.position.y = Math.max(0.2, Math.min(3.5, this.camera.position.y - dy * 0.008));
        this.camera.lookAt(this.target);
      }
    });

    this.renderer.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomSpeed = 0.002;
      const dist = this.camera.position.distanceTo(this.target);
      const newDist = Math.max(1.5, Math.min(8.0, dist + e.deltaY * zoomSpeed));
      const dir = this.camera.position.clone().sub(this.target).normalize();
      this.camera.position.copy(this.target).addScaledVector(dir, newDist);
    }, { passive: false });
  }

  measureStride() {
    const char = this.activeCharacter === 'zombie' ? 'zombie' : 'survivor';
    const model = this.models[char];
    const mixer = this.mixers[char];
    const actions = this.actions[char];

    if (!model || !mixer || !actions) {
      console.error('[AnimViewer] Model or mixer missing for stride measurement');
      return;
    }

    const out = document.getElementById('av-diagnostics-output');
    const log = (msg) => {
      console.info(msg);
      if (out) out.innerHTML += `<div>${msg}</div>`;
    };

    if (out) out.innerHTML = '';
    log(`<b>🔬 STRIDE MEASUREMENT FOR ${char.toUpperCase()}</b>`);

    // Find foot bones
    let rFoot = null;
    let lFoot = null;
    model.traverse((node) => {
      if (node.isBone) {
        if (/r_foot|rightfoot/i.test(node.name)) rFoot = node;
        if (/l_foot|leftfoot/i.test(node.name)) lFoot = node;
      }
    });

    if (!rFoot) {
      log('⚠️ R_Foot bone not found!');
      return;
    }

    const clipsToMeasure = ['walk', 'run'];
    const results = {};

    for (const clipType of clipsToMeasure) {
      const act = actions[clipType];
      if (!act) continue;

      const clip = act.getClip();
      const duration = clip.duration;
      const numSamples = 120;
      const dt = duration / numSamples;

      // Stop all and set single action
      for (const k in actions) actions[k].stop();
      act.play();
      act.timeScale = 0;

      let minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      const footPositions = [];

      for (let i = 0; i < numSamples; i++) {
        act.time = i * dt;
        mixer.update(0);
        model.updateMatrixWorld(true);

        const rPos = new THREE.Vector3();
        rFoot.getWorldPosition(rPos);

        footPositions.push({ t: act.time, x: rPos.x, y: rPos.y, z: rPos.z });
        if (rPos.x < minX) minX = rPos.x;
        if (rPos.x > maxX) maxX = rPos.x;
        if (rPos.z < minZ) minZ = rPos.z;
        if (rPos.z > maxZ) maxZ = rPos.z;
      }

      // Foot displacement during stance phase along the primary travel axis
      const spanX = Math.abs(maxX - minX);
      const spanZ = Math.abs(maxZ - minZ);
      const strideDistance = Math.max(spanX, spanZ);
      // For a cyclic walk, one foot completes stance + swing in 1 full duration
      // Natural stride speed = (strideDistance of 1 step * 2) / duration
      const strideSpeed = (strideDistance * 2.0) / duration;
      results[clipType] = { duration, strideDistance, strideSpeed };

      log(`<b>${clipType.toUpperCase()} CLIP:</b>`);
      log(`  Duration: ${duration.toFixed(3)}s`);
      log(`  Step Stride (Z span): ${strideDistance.toFixed(3)}m (World scale 1.8)`);
      log(`  Measured Stride Speed: <b>${strideSpeed.toFixed(2)} m/s</b>`);

      const currentActualSpeed = clipType === 'run' ? (CONFIG.player.walkSpeed * CONFIG.player.sprintMultiplier) : CONFIG.player.walkSpeed;
      const requiredTimeScale = currentActualSpeed / strideSpeed;
      const clampedTimeScale = Math.min(1.6, Math.max(0.6, requiredTimeScale));
      log(`  Actual Config Speed: ${currentActualSpeed.toFixed(1)} m/s`);
      log(`  Computed timeScale: ${requiredTimeScale.toFixed(2)}x -> <b>Clamped: ${clampedTimeScale.toFixed(2)}x</b>`);
    }

    // Restore active clip
    this.playClip(char, this.currentClips[char] || 'walk');
    window.__STRIDE_RESULTS__ = results;
    return results;
  }

  async generateContactSheet(char = 'survivor', clipName = 'walk') {
    const model = this.models[char];
    const mixer = this.mixers[char];
    const actions = this.actions[char];
    if (!model || !mixer || !actions) return null;

    const act = actions[clipName.toLowerCase()];
    if (!act) return null;

    const clip = act.getClip();
    const duration = clip.duration;

    // Set side view camera
    this.setCameraPreset('side');
    this.platform.rotation.y = 0;

    // Set model isolated
    this.setCharacterMode(char);

    // 8 frames across 1 cycle
    const numFrames = 8;
    const frameCanvases = [];
    const frameWidth = 160;
    const frameHeight = 240;

    for (const k in actions) actions[k].stop();
    act.play();
    act.timeScale = 0;

    const origSize = new THREE.Vector2();
    this.renderer.getSize(origSize);
    this.renderer.setSize(frameWidth, frameHeight, false);

    for (let f = 0; f < numFrames; f++) {
      act.time = (f / numFrames) * duration;
      mixer.update(0);
      model.updateMatrixWorld(true);
      this.renderer.render(this.scene, this.camera);

      const fCanvas = document.createElement('canvas');
      fCanvas.width = frameWidth;
      fCanvas.height = frameHeight;
      const fCtx = fCanvas.getContext('2d');
      fCtx.drawImage(this.renderer.domElement, 0, 0);

      // Add frame text
      fCtx.fillStyle = 'rgba(0,0,0,0.6)';
      fCtx.fillRect(4, 4, 70, 18);
      fCtx.fillStyle = '#00f3ff';
      fCtx.font = 'bold 11px monospace';
      fCtx.fillText(`F${f + 1} ${(act.time).toFixed(2)}s`, 8, 17);

      frameCanvases.push(fCanvas);
    }

    // Restore render size
    this.renderer.setSize(origSize.x, origSize.y, false);
    this.playClip(char, clipName);

    // Composite into single 1280px contact sheet (8 x 160px = 1280px)
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = frameWidth * numFrames; // 1280px
    compositeCanvas.height = frameHeight + 40;
    const cCtx = compositeCanvas.getContext('2d');

    // Header
    cCtx.fillStyle = '#0f1218';
    cCtx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
    cCtx.fillStyle = '#00f3ff';
    cCtx.font = 'bold 14px monospace';
    cCtx.fillText(`SUNSHIFT: DEAD DISTRICT — ${char.toUpperCase()} [${clipName.toUpperCase()}] CONTACT SHEET (8 FRAMES / 1 CYCLE)`, 16, 25);

    for (let f = 0; f < numFrames; f++) {
      cCtx.drawImage(frameCanvases[f], f * frameWidth, 40);
      cCtx.strokeStyle = '#233554';
      cCtx.strokeRect(f * frameWidth, 40, frameWidth, frameHeight);
    }

    const dataUrl = compositeCanvas.toDataURL('image/jpeg', 0.92);
    window.__LAST_CONTACT_SHEET__ = {
      character: char,
      clip: clipName,
      dataUrl
    };

    console.info(`[AnimViewer] Generated 1280px contact sheet for ${char} ${clipName}`);
    const out = document.getElementById('av-diagnostics-output');
    if (out) {
      out.innerHTML += `<div>📸 Generated 1280px contact sheet for <b>${char} ${clipName}</b></div>`;
    }

    return dataUrl;
  }

  async captureWeaponShot(weaponId, isFullBody = false) {
    const model = this.models.survivor;
    const rHand = model ? model.getObjectByName('R_Hand') : null;
    if (!rHand) return null;

    // Attach weapon
    const toRemove = [];
    rHand.children.forEach(c => { if (c.name.startsWith('weapon_')) toRemove.push(c); });
    toRemove.forEach(c => rHand.remove(c));

    const wInstance = this.assets.getInstance(weaponId);
    if (!wInstance) return null;
    wInstance.name = weaponId;

    const targetLength = weaponId.includes('pistol') ? 0.22 : weaponId.includes('shotgun') ? 0.95 : 0.85;
    const { fitWeapon } = await import('../entities/Player.js');
    fitWeapon(wInstance, targetLength, 1.8);

    const grip = CONFIG.weapons[weaponId.replace('weapon_', '')]?.grip;
    const gripPos = grip?.position || [0.02, 0.08, 0.04];
    const gripRot = grip?.rotation || [0, 0, Math.PI * 0.5];
    wInstance.position.set(gripPos[0], gripPos[1], gripPos[2]);
    wInstance.rotation.set(gripRot[0], gripRot[1], gripRot[2]);
    rHand.add(wInstance);

    // Hide UI overlay for clean screenshot
    const ui = document.getElementById('anim-viewer-ui');
    if (ui) ui.style.display = 'none';

    // Set character to survivor
    this.setCharacterMode('survivor');
    this.platform.rotation.y = 0;

    // Set camera
    if (isFullBody) {
      this.playClip('survivor', 'shoot');
      this.camera.position.set(2.4, 1.1, 2.4);
      this.target.set(0, 0.85, 0);
    } else {
      this.playClip('survivor', 'shoot');
      this.camera.position.set(0.60, 1.05, 0.65);
      this.target.set(0.08, 0.95, 0.22);
    }
    this.camera.lookAt(this.target);

    // Render at 1280x720
    const origSize = new THREE.Vector2();
    this.renderer.getSize(origSize);
    this.renderer.setSize(1280, 720, false);
    this.camera.aspect = 1280 / 720;
    this.camera.updateProjectionMatrix();

    // Step mixer so pose is active
    this.mixers.survivor.update(0.016);
    this.renderer.render(this.scene, this.camera);

    const dataUrl = this.renderer.domElement.toDataURL('image/jpeg', 0.92);

    // Restore
    this.renderer.setSize(origSize.x, origSize.y, false);
    this.camera.aspect = origSize.x / origSize.y;
    this.camera.updateProjectionMatrix();
    if (ui) ui.style.display = 'block';

    return dataUrl;
  }

  animate() {
    requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();

    if (this.isTurntableRotating) {
      this.platform.rotation.y += dt * 0.5;
    }

    for (const char in this.mixers) {
      this.mixers[char].update(dt);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
