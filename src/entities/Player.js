import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { events } from '../core/Events.js';
import { assets } from '../core/Assets.js';

// Module-level temporary scratch vectors to eliminate allocations in hot loops
const _moveVector = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _testPosX = new THREE.Vector3();
const _testPosZ = new THREE.Vector3();
const _headPos = new THREE.Vector3();
const _pivotPos = new THREE.Vector3();
const _idealOffset = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _finalCamPos = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camBackward = new THREE.Vector3();
const _shootRaycaster = new THREE.Raycaster();
const _shootForward = new THREE.Vector3();
const _spreadForward = new THREE.Vector3();
const _crosshairRaycaster = new THREE.Raycaster();
const _crosshairTargetPoint = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _bulletDir = new THREE.Vector3();
const _targetVel = new THREE.Vector3();
const _groundRaycaster = new THREE.Raycaster();
const _groundRayOrigin = new THREE.Vector3();
const _downDir = new THREE.Vector3(0, -1, 0);

// Helper to move 2D vector towards target without allocation
function moveTowards2D(current, targetX, targetZ, maxDelta) {
  const dx = targetX - current.x;
  const dz = targetZ - current.z;
  const distSq = dx * dx + dz * dz;
  if (distSq === 0 || (maxDelta >= 0 && distSq <= maxDelta * maxDelta)) {
    current.x = targetX;
    current.z = targetZ;
    return;
  }
  const dist = Math.sqrt(distSq);
  current.x += (dx / dist) * maxDelta;
  current.z += (dz / dist) * maxDelta;
}

export function fitWeapon(obj, targetLength, parentWorldScale = 1.8) {
  obj.scale.set(1, 1, 1);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const rawLength = Math.max(size.x, size.y, size.z);
  if (rawLength <= 0.0001) return 1.0;
  // S_local * rawLength * parentWorldScale = targetLength
  const localScale = targetLength / (rawLength * parentWorldScale);
  obj.scale.set(localScale, localScale, localScale);
  return localScale;
}

export class Player {
  constructor(scene, camera, input, sound, effects) {
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.sound = sound;
    this.effects = effects;

    this.maxHealth = CONFIG.player.maxHealth;
    this.health = this.maxHealth;
    this.speed = CONFIG.player.walkSpeed;
    this.sprintMultiplier = CONFIG.player.sprintMultiplier;
    this.jumpStrength = CONFIG.player.jumpStrength;
    this.gravity = CONFIG.player.gravity;
    this.camDistance = CONFIG.movement?.camera?.defaultDistance || CONFIG.player.camDistance;
    this.maxShootingRange = CONFIG.player.maxShootingRange || 100;
    this.sensitivity = CONFIG.player.mouseSensitivity;
    this.invertY = false;

    // Movement Kinematics
    this.velocity = new THREE.Vector3(0, 0, 0); // Horizontal XZ velocity
    this.velocityY = 0;
    this.isGrounded = true;
    this.walkTimer = 0;
    this.acceleration = 0;
    this.prevSpeed = 0;

    // Coyote Time & Jump Buffer
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.prevSpaceKey = false;

    // Stamina & Sprint
    this.stamina = CONFIG.movement?.staminaMax || 5.0;
    this.staminaRegenCooldown = 0;
    this.isSprinting = false;

    // Shift Dash & Invulnerability
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.invulnerableTimer = 0;
    this.shiftDown = false;
    this.shiftHeldTimer = 0;
    this.sprintStarted = false;
    this.dashDir = new THREE.Vector3(0, 0, -1);
    this.prevShiftDown = false;

    // Over-The-Shoulder Camera & Aiming
    this.isAiming = false;
    this.currentCamDist = CONFIG.movement?.camera?.defaultDistance || 3.2;
    this.currentOffsetRight = CONFIG.movement?.camera?.defaultOffsetRight || 0.7;
    this.camPos = new THREE.Vector3();
    this.baseFov = this.camera.fov || 75;
    this.targetFov = this.baseFov;

    // Procedural Animation & Lean / Squash
    this.bodyLeanPitch = 0;
    this.bodyLeanRoll = 0;
    this.squashTimer = 0;

    // F4 Debug Telemetry
    this.showDebug = false;
    this.accelHistory = []; // Rolling 3s window of acceleration samples

    // UV Flare Cooldown
    this.flareCooldownTimer = 0;
    this.flareDuration = CONFIG.player.flareFreezeDuration;

    // Weapons Arsenal (Pistol, Shotgun, Assault Rifle)
    this.weaponList = [
      { ...CONFIG.weapons.pistol, magAmmo: CONFIG.weapons.pistol.magSize },
      { ...CONFIG.weapons.shotgun, magAmmo: CONFIG.weapons.shotgun.magSize },
      { ...CONFIG.weapons.rifle, magAmmo: CONFIG.weapons.rifle.magSize }
    ];
    this.unlockedWeapons = { pistol: true, shotgun: false, rifle: false };
    this.currentWeaponIndex = 0;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.shootTimer = 0;

    this.camRaycaster = new THREE.Raycaster();

    this.mixer = null;
    this.actions = {};
    this.currentAnimState = 'idle';

    // Instance Character Hierarchy
    const characterInstance = assets.getInstance('player');
    if (characterInstance) {
      this.mesh = characterInstance;
      // Requirement 4: Scale: model height 1.0 hai. Player aur Normal zombie ke liye 1.8 se multiply karo.
      this.mesh.scale.set(1.8, 1.8, 1.8);

      this.rHandBone = this.mesh.getObjectByName('R_Hand');
      this.leftArm = this.mesh.getObjectByName('leftArm') || this.mesh.getObjectByName('L_Forearm') || this.createLimb(-0.55, 1.15, 0);
      this.rightArm = this.rHandBone || this.mesh.getObjectByName('rightArm') || this.createLimb(0.55, 1.15, 0);
      this.leftLeg = this.mesh.getObjectByName('leftLeg') || this.mesh.getObjectByName('L_Calf') || this.createLimb(-0.24, 0.48, 0);
      this.rightLeg = this.mesh.getObjectByName('rightLeg') || this.mesh.getObjectByName('R_Calf') || this.createLimb(0.24, 0.48, 0);

      // Setup AnimationMixer & Actions for Survivor
      const rawClips = assets.animations.get('player') || [];
      const clipMap = assets.getClipMap('player');
      if (rawClips.length > 0) {
        this.mixer = new THREE.AnimationMixer(this.mesh);
        const walkClip = clipMap.walk || rawClips.find(c => /walk/i.test(c.name)) || rawClips[0];
        const runClip = clipMap.run || rawClips.find(c => /run/i.test(c.name)) || walkClip;
        const idleClip = clipMap.idle || rawClips.find(c => /idle/i.test(c.name)) || walkClip;

        if (walkClip) this.actions.walk = this.mixer.clipAction(walkClip);
        if (runClip) this.actions.run = this.mixer.clipAction(runClip);
        if (idleClip) this.actions.idle = this.mixer.clipAction(idleClip);

        // Requirement 2(f): survivor real idle clip if present; otherwise walk frame where feet are close (0.59s, not frame 0)
        if (this.actions.idle) {
          this.actions.idle.play();
          this.currentAction = this.actions.idle;
          this.currentAnimState = 'idle';
        } else if (this.actions.walk) {
          this.actions.walk.play();
          this.actions.walk.time = 0.59;
          this.actions.walk.paused = true;
          this.currentAction = this.actions.walk;
          this.currentAnimState = 'idle';
        }
      }
    } else {
      this.mesh = new THREE.Group();
      this.buildDefaultRig();
    }

    // Attach 3D Weapon Model to Right Hand
    this.weaponMesh = null;
    this.updateHandWeaponModel();

    this.mesh.position.set(0, 0, 0);
    this.scene.add(this.mesh);

    this.yaw = 0;
    this.pitch = 0.2;

    this.setupControls();
    this.emitWeaponState();
  }

  createLimb(x, y, z) {
    const limb = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.85, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x1b356e, roughness: 0.7 })
    );
    limb.position.set(x, y, z);
    limb.castShadow = true;
    this.mesh.add(limb);
    return limb;
  }

  buildDefaultRig() {
    const bodyGeo = new THREE.CapsuleGeometry(0.38, 0.65, 8, 10);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x224488, roughness: 0.82, metalness: 0.05 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.15;
    body.castShadow = true;
    body.receiveShadow = true;
    this.mesh.add(body);

    const headGeo = new THREE.SphereGeometry(0.28, 10, 10);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.65, metalness: 0.05 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.85;
    head.castShadow = false;
    this.mesh.add(head);

    this.leftArm = this.createLimb(-0.52, 1.15, 0);
    this.rightArm = this.createLimb(0.52, 1.15, 0);

    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.85, metalness: 0.05 });
    const legGeo = new THREE.CapsuleGeometry(0.14, 0.70, 5, 6);

    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.22, 0.48, 0);
    this.leftLeg.castShadow = false;
    this.mesh.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.22, 0.48, 0);
    this.rightLeg.castShadow = false;
    this.mesh.add(this.rightLeg);
  }

  setupControls() {
    window.addEventListener('keydown', (e) => {
      if (this.health <= 0) return;
      if (e.code === 'Digit1') this.switchWeapon(0);
      if (e.code === 'Digit2') this.switchWeapon(1);
      if (e.code === 'Digit3') this.switchWeapon(2);
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'KeyQ') this.triggerFlare();
      if (e.code === 'F4' && import.meta.env.DEV) {
        this.showDebug = !this.showDebug;
        const dbgEl = document.getElementById('movement-debug-overlay');
        if (dbgEl) dbgEl.style.display = this.showDebug ? 'block' : 'none';
      }
    });

    window.addEventListener('wheel', (e) => {
      if (this.input && this.input.isLocked && this.health > 0) {
        if (e.deltaY > 0) {
          this.switchWeapon((this.currentWeaponIndex + 1) % this.weaponList.length);
        } else {
          this.switchWeapon((this.currentWeaponIndex - 1 + this.weaponList.length) % this.weaponList.length);
        }
      }
    });
  }

  unlockWeapon(name) {
    const key = name.toLowerCase();
    if (this.unlockedWeapons && this.unlockedWeapons[key] !== undefined) {
      this.unlockedWeapons[key] = true;
    }
  }

  getCurrentWeapon() {
    return this.weaponList[this.currentWeaponIndex];
  }

  switchWeapon(index) {
    if (typeof index === 'string') {
      const map = { pistol: 0, shotgun: 1, rifle: 2 };
      index = map[index.toLowerCase()] ?? 0;
    }
    const key = (index === 0) ? 'pistol' : (index === 1) ? 'shotgun' : 'rifle';
    if (this.unlockedWeapons && !this.unlockedWeapons[key]) {
      if (this.effects) {
        this.effects.showBanner(`${key.toUpperCase()} LOCKED`, '#ff4444');
      }
      return;
    }
    if (index === this.currentWeaponIndex || index < 0 || index >= this.weaponList.length) return;
    if (this.isReloading) {
      this.isReloading = false;
    }
    this.currentWeaponIndex = index;
    this.shootTimer = 0.15;
    this.updateHandWeaponModel();
    this.emitWeaponState();
    if (this.sound) {
      if (typeof this.sound.playClick === 'function') this.sound.playClick();
      else if (typeof this.sound.uiClick === 'function') this.sound.uiClick();
    }
  }

  updateHandWeaponModel() {
    const w = this.getCurrentWeapon();
    const rHand = this.rHandBone || (this.mesh ? this.mesh.getObjectByName('R_Hand') : null);
    if (this.weaponMesh) {
      if (this.weaponMesh.parent) this.weaponMesh.parent.remove(this.weaponMesh);
      else if (this.rightArm) this.rightArm.remove(this.weaponMesh);
    }

    const assetId = w.name.toLowerCase().includes('pistol') ? 'weapon_pistol'
                  : w.name.toLowerCase().includes('shotgun') ? 'weapon_shotgun'
                  : 'weapon_rifle';

    const targetLength = w.targetLength || (assetId.includes('pistol') ? 0.22 : assetId.includes('shotgun') ? 0.95 : 0.85);
    const parentWorldScale = this.mesh ? this.mesh.scale.y : 1.8;

    const modelInstance = assets ? assets.getInstance(assetId) : null;
    if (modelInstance) {
      this.weaponMesh = modelInstance;
      fitWeapon(this.weaponMesh, targetLength, parentWorldScale);
      if (rHand) {
        const gripPos = w.grip?.position || [0.02, 0.08, 0.04];
        const gripRot = w.grip?.rotation || [0, 0, Math.PI * 0.5];
        this.weaponMesh.position.set(gripPos[0], gripPos[1], gripPos[2]);
        this.weaponMesh.rotation.set(gripRot[0], gripRot[1], gripRot[2]);
        rHand.add(this.weaponMesh);
      } else if (this.rightArm) {
        this.weaponMesh.position.set(0, -0.38, 0.22);
        this.weaponMesh.rotation.set(0, 0, 0);
        this.rightArm.add(this.weaponMesh);
      }
    } else {
      this.weaponMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w.size[0], w.size[1], w.size[2]),
        new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.35, metalness: 0.8 })
      );
      if (rHand) {
        this.weaponMesh.position.set(0, 0.05, 0.08);
        rHand.add(this.weaponMesh);
      } else if (this.rightArm) {
        this.weaponMesh.position.set(0, -0.35, w.size[2] * 0.5);
        this.weaponMesh.castShadow = true;
        this.rightArm.add(this.weaponMesh);
      }
    }
  }

  startReload() {
    const w = this.getCurrentWeapon();
    if (this.isReloading) return;
    if (w.magAmmo >= w.magSize) return;
    if (w.reserveAmmo <= 0) return;

    this.isReloading = true;
    this.reloadTimer = w.reloadTime;
    if (this.sound) {
      if (typeof this.sound.reload === 'function') this.sound.reload();
      else if (typeof this.sound.playReload === 'function') this.sound.playReload();
    }
    this.emitWeaponState();
  }

  emitWeaponState() {
    const w = this.getCurrentWeapon();
    const reloadPct = this.isReloading && w.reloadTime > 0
      ? (1 - this.reloadTimer / w.reloadTime) * 100
      : 0;

    events.emit('weaponState', {
      name: w.name,
      mag: w.magAmmo,
      reserve: w.reserveAmmo,
      isReloading: this.isReloading,
      reloadProgress: reloadPct
    });
  }

  addAmmo(type, count) {
    const w = this.weaponList.find(item => item.name.toLowerCase().includes(type.toLowerCase()));
    if (w && w.reserveAmmo !== Infinity) {
      w.reserveAmmo = Math.min(w.maxReserve, w.reserveAmmo + count);
      this.emitWeaponState();
    }
  }

  refillAmmo(type, count) {
    this.addAmmo(type, count);
  }

  reset() {
    this.health = this.maxHealth;
    this.isDead = false;
    this.isInVehicle = false;
    this.mesh.visible = true;
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.velocityY = 0;
    this.isGrounded = true;
    this.yaw = 0;
    this.pitch = 0.2;
    this.shootTimer = 0;
    this.walkTimer = 0;
    this.flareCooldownTimer = 0;
    this.isReloading = false;

    this.isAiming = false;
    this.currentCamDist = CONFIG.movement?.camera?.defaultDistance || 3.2;
    this.currentOffsetRight = CONFIG.movement?.camera?.defaultOffsetRight || 0.7;
    this.camPos.set(0, 0, 0);
    this.camera.fov = this.baseFov || 75;
    this.camera.updateProjectionMatrix();

    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.prevSpaceKey = false;
    this.stamina = CONFIG.movement?.staminaMax || 5.0;
    this.staminaRegenCooldown = 0;
    this.isSprinting = false;
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.bodyLeanPitch = 0;
    this.bodyLeanRoll = 0;
    this.squashTimer = 0;
    this.mesh.scale.set(1.8, 1.8, 1.8);

    const crosshairEl = document.getElementById('crosshair');
    if (crosshairEl) crosshairEl.classList.remove('aiming');

    this.weaponList = [
      { ...CONFIG.weapons.pistol, magAmmo: CONFIG.weapons.pistol.magSize },
      { ...CONFIG.weapons.shotgun, magAmmo: CONFIG.weapons.shotgun.magSize },
      { ...CONFIG.weapons.rifle, magAmmo: CONFIG.weapons.rifle.magSize }
    ];
    this.unlockedWeapons = { pistol: true, shotgun: false, rifle: false };
    this.currentWeaponIndex = 0;
    this.updateHandWeaponModel();

    if (this.effects) this.effects.setLowHealthEffect(false);
    if (this.sound) this.sound.setLowHealthHeartbeat(false);

    this.emitWeaponState();
  }

  triggerFlare() {
    if (this.flareCooldownTimer > 0) return;

    this.flareCooldownTimer = CONFIG.player.flareCooldown;
    if (this.effects) {
      this.effects.spawnSpark(this.mesh.position);
      this.effects.addShake(0.3);
      this.effects.showBanner('UV FLARE DEPLOYED!', '#6ec6ff');
      if (typeof this.effects.pulseFlareLight === 'function') this.effects.pulseFlareLight(this.mesh.position);
      if (typeof this.effects.spawnShockwave === 'function') this.effects.spawnShockwave(this.mesh.position, CONFIG.player.flareRadius);
    }
    if (this.sound) {
      if (typeof this.sound.playFlare === 'function') this.sound.playFlare();
      else if (typeof this.sound.flarePulse === 'function') this.sound.flarePulse();
    }

    events.emit('flareTriggered', {
      position: this.mesh.position,
      radius: CONFIG.player.flareRadius,
      duration: this.flareDuration
    });
  }

  update(dt, cityColliders, zombies, cityRayTargets = []) {
    const moveCfg = CONFIG.movement || {};
    const camCfg = moveCfg.camera || {};

    // 1. Mouse Look & Aiming State
    const mouseDelta = this.input.consumeMouseDelta();
    this.yaw -= mouseDelta.x * this.sensitivity;
    const ySign = this.invertY ? -1 : 1;
    this.pitch -= mouseDelta.y * this.sensitivity * ySign;
    this.pitch = Math.max(-0.4, Math.min(0.8, this.pitch));

    // Right Mouse Button = AIM
    this.isAiming = this.input.isMouseDown(2);
    const crosshairEl = document.getElementById('crosshair');
    if (crosshairEl) {
      crosshairEl.classList.toggle('aiming', this.isAiming);
    }

    // 2. Dash & Shift Handling (Tap < 180ms = Dash, Hold >= 180ms = Sprint)
    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    }
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    }

    // 3. Movement Inputs
    let moveZ = 0;
    let moveX = 0;
    if (this.input.isKey('KeyW')) moveZ -= 1;
    if (this.input.isKey('KeyS')) moveZ += 1;
    if (this.input.isKey('KeyA')) moveX -= 1;
    if (this.input.isKey('KeyD')) moveX += 1;
    const isMoving = (moveX !== 0 || moveZ !== 0);

    if (isMoving) {
      _moveVector.set(moveX, 0, moveZ).normalize();
      _moveVector.applyAxisAngle(_upAxis, this.yaw);
    }

    const shiftKey = this.input.isKey('ShiftLeft') || this.input.isKey('ShiftRight');
    const tapMaxTime = moveCfg.dashTapMaxDuration || 0.18;

    if (shiftKey && !this.shiftDown) {
      this.shiftDown = true;
      this.shiftHeldTimer = 0;
      this.sprintStarted = false;
    }

    if (this.shiftDown && shiftKey) {
      this.shiftHeldTimer += dt;
      if (this.shiftHeldTimer >= tapMaxTime) {
        // Holding Shift >= 180ms: Enter Sprint (Dash will NOT trigger on release)
        if (isMoving && !this.isAiming && this.stamina > 0.1) {
          this.isSprinting = true;
          this.sprintStarted = true;
        }
      }
    }

    // On Shift Key Release
    if (this.shiftDown && !shiftKey) {
      this.shiftDown = false;
      this.isSprinting = false;

      // Tap (< 180ms) + Movement Key active + Not Aiming + Off Cooldown = DASH
      if (!this.sprintStarted && this.shiftHeldTimer < tapMaxTime && isMoving && !this.isAiming && this.dashCooldownTimer <= 0) {
        this.dashTimer = moveCfg.dashDuration || 0.20;
        this.invulnerableTimer = moveCfg.dashInvulnerabilityTime || 0.20;
        this.dashCooldownTimer = moveCfg.dashCooldown || 1.2;
        this.dashDir.copy(_moveVector);
        this.stamina = Math.max(0, this.stamina - (moveCfg.dashStaminaCost || 1.0));
        this.staminaRegenCooldown = moveCfg.staminaRegenDelay || 3.0;

        if (this.sound && typeof this.sound.playDash === 'function') {
          this.sound.playDash();
        }
      } else if (this.sprintStarted) {
        this.staminaRegenCooldown = moveCfg.staminaRegenDelay || 3.0;
      }
      this.sprintStarted = false;
      this.shiftHeldTimer = 0;
    }

    const isDashing = this.dashTimer > 0;
    if (isDashing) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
    }

    // 4. Stamina Drain / Regeneration
    if (this.isSprinting && !isDashing) {
      this.stamina = Math.max(0, this.stamina - dt * (moveCfg.staminaDrainRate || 1.0));
      this.staminaRegenCooldown = moveCfg.staminaRegenDelay || 3.0;
      if (this.stamina <= 0.05) {
        this.isSprinting = false;
      }
    } else if (!isDashing) {
      if (this.staminaRegenCooldown > 0) {
        this.staminaRegenCooldown = Math.max(0, this.staminaRegenCooldown - dt);
      } else {
        this.stamina = Math.min(moveCfg.staminaMax || 5.0, this.stamina + dt * (moveCfg.staminaRegenRate || 2.5));
      }
    }

    // Update HUD Stamina Bar
    const stamMax = moveCfg.staminaMax || 5.0;
    const stamPct = Math.min(100, Math.max(0, (this.stamina / stamMax) * 100));
    const stamBar = document.getElementById('stamina-bar');
    const stamTxt = document.getElementById('stamina-text');
    if (stamBar) stamBar.style.width = `${stamPct}%`;
    if (stamTxt) stamTxt.innerText = `${Math.round(stamPct)}%`;

    // 5. Velocity Kinematics (Instant Velocity for Dash, Kinematic Curve for Walk/Sprint)
    if (isDashing) {
      // Instant velocity: 5.0m over 0.20s = 25.0 m/s (zero acceleration ramp)
      const dashSpeed = moveCfg.dashSpeed || 25.0;
      this.velocity.x = this.dashDir.x * dashSpeed;
      this.velocity.z = this.dashDir.z * dashSpeed;
      this.currentSpeed = dashSpeed;
    } else {
      let targetTopSpeed = this.speed;
      if (this.isSprinting) {
        targetTopSpeed = this.speed * this.sprintMultiplier;
      } else if (this.isAiming) {
        targetTopSpeed = this.speed * 0.65;
      }

      if (isMoving) {
        _targetVel.copy(_moveVector).multiplyScalar(targetTopSpeed);
      } else {
        _targetVel.set(0, 0, 0);
      }

      const accelTime = moveCfg.accelerationTime || 0.2;
      const decelTime = moveCfg.decelerationTime || 0.1;
      const accelRate = targetTopSpeed / accelTime;
      const decelRate = (this.speed * this.sprintMultiplier) / decelTime;
      const currentRate = isMoving ? accelRate : decelRate;

      moveTowards2D(this.velocity, _targetVel.x, _targetVel.z, currentRate * dt);
      this.currentSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    }

    const horizontalSpeed = this.currentSpeed;

    // Track acceleration for debug
    this.acceleration = (horizontalSpeed - this.prevSpeed) / Math.max(dt, 0.001);
    this.prevSpeed = horizontalSpeed;
    if (this.showDebug && import.meta.env.DEV) {
      this.updateDebugTelemetry(horizontalSpeed, dt);
    }

    // 6. Smooth Model Turning vs Aim Facing
    const modelYawOffset = this.rHandBone ? -Math.PI * 0.5 : 0;
    if (this.isAiming) {
      // Aim mode: face camera direction immediately to strafe
      this.mesh.rotation.y = this.yaw + Math.PI + modelYawOffset;
    } else if (horizontalSpeed > 0.15) {
      // Movement mode: smoothly turn body towards velocity direction over turnSmoothTime
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z) + modelYawOffset;
      let diff = targetYaw - this.mesh.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      const turnTime = moveCfg.turnSmoothTime || 0.1;
      this.mesh.rotation.y += diff * Math.min(1.0, dt / turnTime);
    }

    // 7. Ground Collision & Movement Application
    _testPosX.copy(this.mesh.position);
    _testPosX.x += this.velocity.x * dt;
    if (!this.checkCollisions(_testPosX, cityColliders)) {
      this.mesh.position.x = _testPosX.x;
    } else {
      this.velocity.x = 0;
    }

    _testPosZ.copy(this.mesh.position);
    _testPosZ.z += this.velocity.z * dt;
    if (!this.checkCollisions(_testPosZ, cityColliders)) {
      this.mesh.position.z = _testPosZ.z;
    } else {
      this.velocity.z = 0;
    }

    // 8. Coyote Time & Jump Buffer (Key-press edge, strictly zero timers on jump, never re-jump in mid-air)
    if (this.isGrounded) {
      this.coyoteTimer = moveCfg.coyoteTime || 0.1;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    const spaceDown = this.input.isKey('Space');
    const spacePressedEdge = spaceDown && !this.prevSpaceKey;
    this.prevSpaceKey = spaceDown;

    if (spacePressedEdge) {
      if (this.isGrounded || this.coyoteTimer > 0) {
        this.velocityY = this.jumpStrength;
        this.isGrounded = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
      } else {
        // Buffer queued only on the exact press edge while falling/in-air
        this.jumpBufferTimer = moveCfg.jumpBufferTime || 0.1;
      }
    }
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    // Downward gravity acceleration (gravity magnitude strictly positive)
    const gravityMagnitude = Math.abs(this.gravity || 22.0);
    if (!this.isGrounded) {
      this.velocityY -= gravityMagnitude * dt;
      this.mesh.position.y += this.velocityY * dt;
    }

    // Ground raycast check (ignores player's own mesh and children)
    let groundHeight = 0;
    if (cityRayTargets && cityRayTargets.length > 0) {
      _groundRayOrigin.set(this.mesh.position.x, this.mesh.position.y + 0.5, this.mesh.position.z);
      _groundRaycaster.set(_groundRayOrigin, _downDir);
      _groundRaycaster.far = Math.max(1.5, this.mesh.position.y + 1.0);
      const groundHits = _groundRaycaster.intersectObjects(cityRayTargets, false);
      for (let i = 0; i < groundHits.length; i++) {
        const hit = groundHits[i];
        if (!hit || hit.object === this.mesh || (this.mesh && this.mesh.getObjectById(hit.object.id))) continue;
        if (hit.point && hit.point.y > groundHeight && hit.point.y <= this.mesh.position.y + 0.2) {
          groundHeight = hit.point.y;
        }
      }
    }

    if (this.mesh.position.y <= groundHeight) {
      this.mesh.position.y = groundHeight;
      const justLanded = !this.isGrounded;
      this.isGrounded = true;
      this.velocityY = 0;

      if (justLanded) {
        this.squashTimer = 0.16; // Landing impact squash
        // Consume jump buffer ONLY if an edge-triggered buffer was queued
        if (this.jumpBufferTimer > 0) {
          this.velocityY = this.jumpStrength;
          this.isGrounded = false;
          this.coyoteTimer = 0;
          this.jumpBufferTimer = 0;
        }
      }
    }

    // Landing Squash
    const basePlayerScale = 1.8;
    if (this.squashTimer > 0) {
      this.squashTimer -= dt;
      const factor = 1.0 - Math.sin((this.squashTimer / 0.16) * Math.PI) * 0.14;
      this.mesh.scale.set(basePlayerScale * (1.0 + (1.0 - factor) * 0.45), basePlayerScale * factor, basePlayerScale * (1.0 + (1.0 - factor) * 0.45));
    } else {
      this.mesh.scale.set(basePlayerScale, basePlayerScale, basePlayerScale);
    }

    // 9. Skeletal Animation & Procedural Leans
    const maxLeanSpeed = this.speed * this.sprintMultiplier;
    const forwardLeanTarget = -Math.min(0.18, (horizontalSpeed / maxLeanSpeed) * 0.14);
    const lateralSpeed = -Math.sin(this.yaw) * this.velocity.z + Math.cos(this.yaw) * this.velocity.x;
    const rollLeanTarget = Math.max(-0.14, Math.min(0.14, (lateralSpeed / this.speed) * 0.08));

    this.bodyLeanPitch = THREE.MathUtils.lerp(this.bodyLeanPitch, forwardLeanTarget, dt * 10);
    this.bodyLeanRoll = THREE.MathUtils.lerp(this.bodyLeanRoll, rollLeanTarget, dt * 10);
    this.mesh.rotation.x = this.bodyLeanPitch;
    this.mesh.rotation.z = this.bodyLeanRoll;

    // Requirement 2(e, f): survivor idle = real idle clip (or walk 0.59s), directional walk/run with clamped timeScale
    if (this.mixer) {
      let targetState = 'idle';
      if (horizontalSpeed > 0.2) {
        targetState = this.isSprinting ? 'run' : 'walk';
      }

      if (this.currentAnimState !== targetState) {
        const prevAction = this.currentAction;
        if (targetState === 'idle') {
          const targetAction = this.actions.idle || this.actions.walk;
          if (targetAction) {
            targetAction.paused = false;
            if (prevAction && prevAction !== targetAction) {
              prevAction.crossFadeTo(targetAction, 0.2, true);
            }
            targetAction.play();
            if (!this.actions.idle && this.actions.walk) {
              targetAction.time = 0.59;
              targetAction.timeScale = 0;
              targetAction.paused = true;
            } else {
              targetAction.timeScale = 1.0;
            }
            this.currentAction = targetAction;
          }
        } else if (targetState === 'walk') {
          const targetAction = this.actions.walk;
          if (targetAction) {
            targetAction.paused = false;
            if (prevAction && prevAction !== targetAction) {
              prevAction.crossFadeTo(targetAction, 0.2, true);
            }
            targetAction.play();
            this.currentAction = targetAction;
          }
        } else if (targetState === 'run') {
          const targetAction = this.actions.run || this.actions.walk;
          if (targetAction) {
            targetAction.paused = false;
            if (prevAction && prevAction !== targetAction) {
              prevAction.crossFadeTo(targetAction, 0.2, true);
            }
            targetAction.play();
            this.currentAction = targetAction;
          }
        }
        this.currentAnimState = targetState;
      }

      // Directional motion in Aim mode:
      // Local forward = +1, backward = -1 (reverse timeScale), strafe side = 0.8
      let directionalMultiplier = 1.0;
      if (this.isAiming && horizontalSpeed > 0.15) {
        const fX = -Math.sin(this.yaw);
        const fZ = -Math.cos(this.yaw);
        const rX = Math.cos(this.yaw);
        const rZ = -Math.sin(this.yaw);

        const forwardDot = (this.velocity.x * fX + this.velocity.z * fZ) / horizontalSpeed;
        const strafeDot = Math.abs((this.velocity.x * rX + this.velocity.z * rZ) / horizontalSpeed);

        if (forwardDot < -0.5) {
          directionalMultiplier = -1.0;
        } else if (strafeDot > 0.5 && Math.abs(forwardDot) <= 0.5) {
          directionalMultiplier = 0.8;
        } else {
          directionalMultiplier = 1.0;
        }
      }

      // timeScale = actual speed / clip stride speed (clamped to [0.6, 1.6])
      if (this.currentAction && !this.currentAction.paused) {
        const measuredWalkStrideSpeed = 0.66; // measured world stride speed at 1.8 scale
        const measuredRunStrideSpeed = 1.35;

        if (this.currentAnimState === 'walk') {
          const rawScale = horizontalSpeed / measuredWalkStrideSpeed;
          const clampedScale = THREE.MathUtils.clamp(rawScale, 0.6, 1.6);
          this.currentAction.timeScale = clampedScale * directionalMultiplier;
        } else if (this.currentAnimState === 'run') {
          const rawScale = horizontalSpeed / measuredRunStrideSpeed;
          const clampedScale = THREE.MathUtils.clamp(rawScale, 0.6, 1.6);
          this.currentAction.timeScale = clampedScale;
        } else if (this.currentAnimState === 'idle') {
          this.currentAction.timeScale = 1.0;
        }
      }

      this.mixer.update(dt);
    } else {
      // Procedural limb swings fallback for box-mesh testing
      if (horizontalSpeed > 0.2) {
        const strideRate = this.isSprinting ? 14 : 9.5;
        this.walkTimer += dt * strideRate * (horizontalSpeed / this.speed);
        const swing = Math.sin(this.walkTimer) * 0.65;
        if (this.leftLeg) this.leftLeg.rotation.x = swing;
        if (this.rightLeg) this.rightLeg.rotation.x = -swing;

        if (!this.isAiming) {
          if (this.leftArm) this.leftArm.rotation.x = -swing * 0.7;
          if (this.rightArm) this.rightArm.rotation.x = swing * 0.7;
        }
      } else {
        if (this.leftLeg) this.leftLeg.rotation.x = 0;
        if (this.rightLeg) this.rightLeg.rotation.x = 0;
        if (!this.isAiming) {
          if (this.leftArm) this.leftArm.rotation.x = 0;
          if (this.rightArm) this.rightArm.rotation.x = 0;
        }
      }
    }

    if (horizontalSpeed > 0.2 && this.isGrounded && this.sound) {
      const strideRate = this.isSprinting ? 14 : 9.5;
      this.walkTimer += dt * strideRate * (horizontalSpeed / this.speed);
      if (Math.sin(this.walkTimer) > 0.9) {
        if (!this._footstepPlayed) {
          this.sound.playFootstep();
          this._footstepPlayed = true;
        }
      } else {
        this._footstepPlayed = false;
      }
    }

    if (this.isAiming) {
      // Aim posture: arms and weapon point in pitch direction of camera
      this.rightArm.rotation.x = -Math.PI * 0.48 + this.pitch;
      this.leftArm.rotation.x = -Math.PI * 0.35 + this.pitch * 0.5;
    }

    // 10. Over-The-Shoulder Camera with Spring Position Damping & Wall Occlusion
    const shoulderH = camCfg.shoulderHeight || 1.55;
    _pivotPos.copy(this.mesh.position);
    _pivotPos.y += shoulderH;

    const targetDist = this.isAiming ? (camCfg.aimDistance || 2.0) : (camCfg.defaultDistance || 3.2);
    const targetOffset = this.isAiming ? (camCfg.aimOffsetRight || 0.9) : (camCfg.defaultOffsetRight || 0.7);

    this.currentCamDist = THREE.MathUtils.lerp(this.currentCamDist, targetDist, dt * (camCfg.fovLerpSpeed || 10.0));
    this.currentOffsetRight = THREE.MathUtils.lerp(this.currentOffsetRight, targetOffset, dt * (camCfg.fovLerpSpeed || 10.0));

    // Right vector in camera yaw space
    _camRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    // Backward vector from pitch & yaw
    _camBackward.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    // Compute ideal camera offset from shoulder pivot
    _idealOffset.copy(_camRight).multiplyScalar(this.currentOffsetRight)
      .addScaledVector(_camBackward, this.currentCamDist);

    _camDir.copy(_idealOffset).normalize();
    const idealDist = _idealOffset.length();

    // Check Wall Raycast Occlusion Avoidance every 3rd frame
    this.camRaycastFrame = (this.camRaycastFrame || 0) + 1;
    if (this.camRaycastFrame % 3 === 0) {
      this.camRaycaster.set(_pivotPos, _camDir);
      this.camRaycaster.far = idealDist;

      const hits = this.camRaycaster.intersectObjects(cityRayTargets, false);
      if (hits.length > 0) {
        this.cachedCamDist = Math.max(0.9, hits[0].distance - 0.3);
      } else {
        this.cachedCamDist = idealDist;
      }
    }
    const actualDist = this.cachedCamDist !== undefined ? this.cachedCamDist : idealDist;
    _desiredCamPos.copy(_pivotPos).addScaledVector(_camDir, actualDist);

    // Smooth position spring damping
    if (this.camPos.lengthSq() === 0) this.camPos.copy(_desiredCamPos);
    const dampingFactor = 1.0 - Math.exp(-(camCfg.posDamping || 14.0) * dt);
    this.camPos.lerp(_desiredCamPos, dampingFactor);

    // Add camera shake
    const shakeOffset = this.effects ? this.effects.getShakeOffset(dt) : { x: 0, y: 0 };
    this.camera.position.copy(this.camPos);
    this.camera.position.x += shakeOffset.x;
    this.camera.position.y += shakeOffset.y;

    // Camera LookAt: align view with crosshair forward line
    _headPos.copy(_pivotPos).addScaledVector(_camRight, this.currentOffsetRight * 0.35);
    _headPos.addScaledVector(
      _crosshairTargetPoint.set(-Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)),
      24.0
    );
    this.camera.lookAt(_headPos);

    // Smooth FOV Updates (Aim Zoom, Sprint Kick, Dash Kick)
    const fovDelta = (this.isAiming ? (camCfg.aimFovDelta || -12.0) : 0) +
                     (this.isSprinting ? (camCfg.sprintFovDelta || 5.0) : 0) +
                     (isDashing ? (camCfg.dashFovKick || 4.0) : 0);
    this.targetFov = (this.baseFov || 75) + fovDelta;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.targetFov, dt * (camCfg.fovLerpSpeed || 10.0));
    this.camera.updateProjectionMatrix();

    // 11. Flare Cooldown Tick
    if (this.flareCooldownTimer > 0) {
      this.flareCooldownTimer = Math.max(0, this.flareCooldownTimer - dt);
      const cdPct = (1 - this.flareCooldownTimer / CONFIG.player.flareCooldown) * 100;
      const bar = document.getElementById('flare-cd-bar');
      const txt = document.getElementById('flare-status-txt');
      if (bar) bar.style.width = `${cdPct}%`;
      if (txt) txt.innerText = this.flareCooldownTimer > 0 ? `${Math.ceil(this.flareCooldownTimer)}s` : 'READY';
    }

    // 12. Reload Timer Tick
    if (this.isReloading) {
      this.reloadTimer -= dt;
      this.emitWeaponState();
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        const w = this.getCurrentWeapon();
        const needed = w.magSize - w.magAmmo;
        const transfer = Math.min(needed, w.reserveAmmo);
        w.magAmmo += transfer;
        if (w.reserveAmmo !== Infinity) {
          w.reserveAmmo -= transfer;
        }
        this.emitWeaponState();
      }
    }

    // 13. Weapon Firing Logic
    this.shootTimer -= dt;
    const w = this.getCurrentWeapon();

    if (this.input.mouse.isDown && this.shootTimer <= 0 && !this.isReloading) {
      if (w.magAmmo > 0) {
        this.shoot(zombies, cityRayTargets);
        w.magAmmo--;
        this.shootTimer = w.fireRate;
        this.emitWeaponState();

        if (!w.auto) {
          this.input.mouse.isDown = false;
        }
      } else {
        this.startReload();
      }
    }
  }

  updateDebugTelemetry(speed, dt) {
    const elSpeed = document.getElementById('dbg-speed');
    const elState = document.getElementById('dbg-state');
    const elStam = document.getElementById('dbg-stamina');
    const elDash = document.getElementById('dbg-dash');
    const elAim = document.getElementById('dbg-aim');
    const canvas = document.getElementById('dbg-accel-canvas');

    if (elSpeed) {
      const kmh = (speed * 3.6).toFixed(1);
      elSpeed.textContent = `${speed.toFixed(2)} m/s (${kmh} km/h)`;
    }
    if (elState) {
      const state = this.dashTimer > 0 ? 'DASH'
                  : this.isSprinting ? 'SPRINT'
                  : !this.isGrounded ? 'IN-AIR'
                  : speed > 0.2 ? 'WALK'
                  : 'IDLE';
      elState.textContent = state;
    }
    if (elStam) {
      elStam.textContent = `${this.stamina.toFixed(1)} / ${(CONFIG.movement?.staminaMax || 5.0).toFixed(1)}s`;
    }
    if (elDash) {
      elDash.textContent = this.dashCooldownTimer > 0 ? `${this.dashCooldownTimer.toFixed(1)}s` : 'READY';
    }
    if (elAim) {
      elAim.textContent = this.isAiming ? 'AIMING (ZOOMED)' : 'OTS NORMAL';
    }

    if (canvas) {
      this.accelHistory.push(Math.abs(this.acceleration));
      if (this.accelHistory.length > 180) { // 3 seconds at 60Hz
        this.accelHistory.shift();
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#06090e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const maxVal = 60; // 60 m/s^2 scale
        const step = canvas.width / Math.max(1, this.accelHistory.length - 1);
        for (let i = 0; i < this.accelHistory.length; i++) {
          const val = Math.min(this.accelHistory[i], maxVal);
          const y = canvas.height - (val / maxVal) * (canvas.height - 6) - 3;
          const x = i * step;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }

  checkCollisions(xOrPos, zOrColliders, maybeColliders) {
    let x, z, colliders;
    if (xOrPos && typeof xOrPos === 'object') {
      x = xOrPos.x;
      z = xOrPos.z;
      colliders = zOrColliders || [];
    } else {
      x = xOrPos;
      z = zOrColliders;
      colliders = maybeColliders || [];
    }
    if (!Array.isArray(colliders)) return false;
    const playerRadius = 0.45;
    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (
        x > box.min.x - playerRadius && x < box.max.x + playerRadius &&
        z > box.min.z - playerRadius && z < box.max.z + playerRadius
      ) {
        return true;
      }
    }
    return false;
  }

  shoot(zombies, cityRayTargets = []) {
    const w = this.getCurrentWeapon();
    if (this.shootTimer > 0 || this.isReloading) return;

    if (w.magAmmo <= 0) {
      this.startReload();
      return;
    }

    w.magAmmo--;
    this.shootTimer = w.fireRate;
    this.emitWeaponState();

    if (this.sound) {
      if (w.name.toLowerCase().includes('shotgun')) this.sound.playShotgun ? this.sound.playShotgun() : this.sound.shotgunBlast();
      else if (w.name.toLowerCase().includes('rifle')) this.sound.playRifle ? this.sound.playRifle() : this.sound.rifleShot();
      else this.sound.playGunshot ? this.sound.playGunshot() : this.sound.gunshot();
    }

    // World position of weapon muzzle
    if (this.weaponMesh) {
      this.weaponMesh.getWorldPosition(_muzzlePos);
    } else {
      _muzzlePos.copy(this.mesh.position);
      _muzzlePos.y += 1.2;
    }

    if (this.effects) {
      this.effects.addShake(w.name === 'SHOTGUN' ? 0.16 : 0.08);
      _shootForward.set(-Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      this.effects.spawnMuzzleFlash(_muzzlePos, _shootForward);
    }

    const activeZombies = zombies.filter(z => !z.isDead);
    const activeZombieMeshes = activeZombies.map(z => z.mesh);

    // Crosshair Center Target Point (Cast ray from camera screen center)
    _crosshairRaycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    _crosshairRaycaster.far = this.maxShootingRange;

    const crosshairZombieHits = _crosshairRaycaster.intersectObjects(activeZombieMeshes, true);
    const crosshairCityHits = (cityRayTargets && cityRayTargets.length > 0)
      ? _crosshairRaycaster.intersectObjects(cityRayTargets, false)
      : [];

    let mainAimPoint = null;
    let mainAimHitZombie = null;

    if (crosshairZombieHits.length > 0) {
      mainAimPoint = crosshairZombieHits[0].point;
      let obj = crosshairZombieHits[0].object;
      while (obj) {
        mainAimHitZombie = activeZombies.find(z => z.mesh === obj);
        if (mainAimHitZombie) break;
        obj = obj.parent;
      }
    }
    if (crosshairCityHits.length > 0) {
      if (!mainAimPoint || crosshairCityHits[0].distance < crosshairZombieHits[0]?.distance) {
        mainAimPoint = crosshairCityHits[0].point;
        mainAimHitZombie = null;
      }
    }
    if (!mainAimPoint) {
      mainAimPoint = _crosshairTargetPoint.copy(_crosshairRaycaster.ray.origin)
        .addScaledVector(_crosshairRaycaster.ray.direction, this.maxShootingRange);
    }

    // Fire pellets: Trajectory from weapon muzzle to the crosshair-targeted point with spread
    for (let p = 0; p < w.pellets; p++) {
      _bulletDir.subVectors(mainAimPoint, _muzzlePos).normalize();
      if (w.spread > 0) {
        _bulletDir.x += (Math.random() - 0.5) * w.spread;
        _bulletDir.y += (Math.random() - 0.5) * w.spread;
        _bulletDir.z += (Math.random() - 0.5) * w.spread;
        _bulletDir.normalize();
      }

      _shootRaycaster.set(_muzzlePos, _bulletDir);
      _shootRaycaster.far = this.maxShootingRange;

      const zombieHits = _shootRaycaster.intersectObjects(activeZombieMeshes, true);
      const cityHits = (cityRayTargets && cityRayTargets.length > 0)
        ? _shootRaycaster.intersectObjects(cityRayTargets, false)
        : [];

      let nearestHit = null;
      let hitZombie = null;

      if (zombieHits.length > 0) {
        nearestHit = zombieHits[0];
        let obj = nearestHit.object;
        while (obj) {
          hitZombie = activeZombies.find(z => z.mesh === obj);
          if (hitZombie) break;
          obj = obj.parent;
        }
      }

      if (cityHits.length > 0) {
        if (!nearestHit || cityHits[0].distance < nearestHit.distance) {
          nearestHit = cityHits[0];
          hitZombie = null;
        }
      }

      if (nearestHit) {
        if (hitZombie) {
          const isHeadshot = (nearestHit.point.y - hitZombie.mesh.position.y) > 1.45 * (hitZombie.archetype ? hitZombie.archetype.scale : 1.0);
          const finalDmg = isHeadshot ? w.damage * 2.0 : w.damage;

          hitZombie.takeDamage(finalDmg);

          if (this.effects) {
            this.effects.spawnBlood(nearestHit.point);
            if (isHeadshot) {
              this.effects.addShake(0.12);
              this.effects.showBanner('CRITICAL HEADSHOT!', '#ff2222');
            }
          }
        } else {
          if (this.effects) {
            this.effects.spawnSpark(nearestHit.point);
          }
        }
      }
    }
  }

  takeDamage(amount, sourcePos = null) {
    if (this.isInVehicle) return; // the car shields the driver
    if (this.health <= 0) return;
    if (this.invulnerableTimer > 0) return; // 0.2s dash invulnerability window
    this.health = Math.max(0, this.health - amount);

    if (this.sound) {
      if (typeof this.sound.playerHurt === 'function') this.sound.playerHurt();
      else if (typeof this.sound.playerHit === 'function') this.sound.playerHit();
    }
    if (this.effects) {
      this.effects.flashDamage();
      this.effects.addShake(0.22);
      if (sourcePos && typeof this.effects.showDamageArc === 'function') {
        this.effects.showDamageArc(this.mesh.position, this.yaw, sourcePos);
      }
    }

    if (this.health <= 35 && this.health > 0) {
      if (this.sound) this.sound.setLowHealthHeartbeat(true);
      if (this.effects) this.effects.setLowHealthEffect(true);
    }

    events.emit('playerDamaged', { health: this.health, maxHealth: this.maxHealth });

    if (this.health <= 0) {
      this.die();
    }
  }

  hit(amount, sourcePos = null) {
    this.takeDamage(amount, sourcePos);
  }

  heal(amount) {
    if (this.health <= 0) return;
    this.health = Math.min(this.maxHealth, this.health + amount);

    if (this.health > 35) {
      if (this.sound) this.sound.setLowHealthHeartbeat(false);
      if (this.effects) this.effects.setLowHealthEffect(false);
    }

    events.emit('playerHealed', { health: this.health, maxHealth: this.maxHealth });
  }

  die() {
    this.health = 0;
    this.isDead = true;
    if (this.sound) {
      this.sound.setLowHealthHeartbeat(false);
      if (typeof this.sound.playerDeath === 'function') {
        this.sound.playerDeath();
      } else if (typeof this.sound.gameOver === 'function') {
        this.sound.gameOver();
      }
    }
    if (this.effects) {
      this.effects.setLowHealthEffect(false);
      this.effects.showBanner('SIGNAL LOST — YOU DIED', '#ff0000');
    }
    events.emit('gameLost');
  }

  death() {
    this.die();
  }

  updateCamera(dt, colliders) {
    const shoulderOffset = new THREE.Vector3(0.55, 1.65, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const targetLook = this.mesh.position.clone().add(shoulderOffset);

    const camOffset = new THREE.Vector3(0, 0, this.camDistance);
    camOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), -this.pitch);
    camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const desiredCamPos = targetLook.clone().add(camOffset);

    this.camRaycaster.set(targetLook, camOffset.clone().normalize());
    this.camRaycaster.far = this.camDistance;

    this.camera.position.copy(desiredCamPos);
    this.camera.lookAt(targetLook.clone().add(new THREE.Vector3(0, 0, -10).applyAxisAngle(new THREE.Vector3(1, 0, 0), -this.pitch).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw)));
  }
}
