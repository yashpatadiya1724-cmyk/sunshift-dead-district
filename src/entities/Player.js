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
const _idealOffset = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _finalCamPos = new THREE.Vector3();
const _shootRaycaster = new THREE.Raycaster();
const _shootForward = new THREE.Vector3();
const _spreadForward = new THREE.Vector3();

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
    this.camDistance = CONFIG.player.camDistance;
    this.maxShootingRange = CONFIG.player.maxShootingRange || 100;
    this.sensitivity = CONFIG.player.mouseSensitivity;
    this.invertY = false;

    // UV Flare Cooldown
    this.flareCooldownTimer = 0;
    this.flareDuration = CONFIG.player.flareFreezeDuration;

    this.velocityY = 0;
    this.isGrounded = true;
    this.walkTimer = 0;

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

    // Instance Character Hierarchy
    const characterInstance = assets.getInstance('player');
    if (characterInstance) {
      this.mesh = characterInstance;
      this.leftArm = this.mesh.getObjectByName('leftArm') || this.createLimb(-0.55, 1.15, 0);
      this.rightArm = this.mesh.getObjectByName('rightArm') || this.createLimb(0.55, 1.15, 0);
      this.leftLeg = this.mesh.getObjectByName('leftLeg') || this.createLimb(-0.24, 0.48, 0);
      this.rightLeg = this.mesh.getObjectByName('rightLeg') || this.createLimb(0.24, 0.48, 0);
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
    if (this.weaponMesh && this.rightArm) {
      this.rightArm.remove(this.weaponMesh);
    }

    const assetId = w.name.toLowerCase().includes('pistol') ? 'weapon_pistol'
                  : w.name.toLowerCase().includes('shotgun') ? 'weapon_shotgun'
                  : 'weapon_rifle';

    const modelInstance = assets ? assets.getInstance(assetId) : null;
    if (modelInstance) {
      this.weaponMesh = modelInstance;
      this.weaponMesh.position.set(0, -0.38, 0.22);
      this.weaponMesh.rotation.set(0, 0, 0);
      this.rightArm.add(this.weaponMesh);
    } else {
      this.weaponMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w.size[0], w.size[1], w.size[2]),
        new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.35, metalness: 0.8 })
      );
      this.weaponMesh.position.set(0, -0.35, w.size[2] * 0.5);
      this.weaponMesh.castShadow = true;
      this.rightArm.add(this.weaponMesh);
    }
  }

  startReload() {
    const w = this.getCurrentWeapon();
    if (this.isReloading) return;
    if (w.magAmmo >= w.magSize) return;
    if (w.reserveAmmo <= 0) return;

    this.isReloading = true;
    this.reloadTimer = w.reloadTime;
    if (this.sound) this.sound.reload();
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
      if (this.sound) this.sound.ammoPickup();
    }
  }

  refillAmmo(type, count) {
    this.addAmmo(type, count);
  }

  reset() {
    this.health = this.maxHealth;
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.velocityY = 0;
    this.isGrounded = true;
    this.yaw = 0;
    this.pitch = 0.2;
    this.shootTimer = 0;
    this.walkTimer = 0;
    this.flareCooldownTimer = 0;
    this.isReloading = false;

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
    // 1. Mouse Look with Invert Y
    const mouseDelta = this.input.consumeMouseDelta();
    this.yaw -= mouseDelta.x * this.sensitivity;
    const ySign = this.invertY ? -1 : 1;
    this.pitch -= mouseDelta.y * this.sensitivity * ySign;
    this.pitch = Math.max(-0.4, Math.min(0.8, this.pitch));

    // 2. Jump & Vertical Gravity
    if (this.input.isKey('Space') && this.isGrounded) {
      this.velocityY = this.jumpStrength;
      this.isGrounded = false;
    }

    if (!this.isGrounded) {
      this.velocityY -= this.gravity * dt;
      this.mesh.position.y += this.velocityY * dt;
    }

    if (this.mesh.position.y <= 0) {
      this.mesh.position.y = 0;
      this.velocityY = 0;
      this.isGrounded = true;
    }

    // 3. Movement without runtime Vector3 allocation
    let moveZ = 0;
    let moveX = 0;
    if (this.input.isKey('KeyW')) moveZ -= 1;
    if (this.input.isKey('KeyS')) moveZ += 1;
    if (this.input.isKey('KeyA')) moveX -= 1;
    if (this.input.isKey('KeyD')) moveX += 1;

    _moveVector.set(moveX, 0, moveZ);
    const isMoving = (moveX !== 0 || moveZ !== 0);

    const isSprinting = this.input.isKey('ShiftLeft') || this.input.isKey('ShiftRight');
    const currentSpeed = this.speed * (isSprinting ? this.sprintMultiplier : 1.0);

    if (isMoving) {
      _moveVector.normalize();
      _moveVector.applyAxisAngle(_upAxis, this.yaw);
      _moveVector.multiplyScalar(currentSpeed * dt);

      _testPosX.copy(this.mesh.position);
      _testPosX.x += _moveVector.x;
      if (!this.checkCollisions(_testPosX, cityColliders)) {
        this.mesh.position.x = _testPosX.x;
      }

      _testPosZ.copy(this.mesh.position);
      _testPosZ.z += _moveVector.z;
      if (!this.checkCollisions(_testPosZ, cityColliders)) {
        this.mesh.position.z = _testPosZ.z;
      }

      this.mesh.rotation.y = this.yaw + Math.PI;

      // Leg swing & Footsteps
      this.walkTimer += dt * (isSprinting ? 14 : 9);
      const swing = Math.sin(this.walkTimer) * 0.65;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.7;
      this.rightArm.rotation.x = swing * 0.7;

      if (Math.abs(swing) > 0.6 && this.isGrounded && this.sound) {
        this.sound.playFootstep();
      }
    } else {
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.leftArm.rotation.x = 0;
      this.rightArm.rotation.x = 0;
    }

    // 4. Camera Follow with Wall Raycast Occlusion Avoidance (Checked every 3rd frame)
    _headPos.copy(this.mesh.position);
    _headPos.y += 1.6;

    const shakeOffset = this.effects ? this.effects.getShakeOffset(dt) : { x: 0, y: 0 };
    _idealOffset.set(
      Math.sin(this.yaw) * Math.cos(this.pitch) * this.camDistance,
      Math.sin(this.pitch) * this.camDistance + 0.3,
      Math.cos(this.yaw) * Math.cos(this.pitch) * this.camDistance
    );

    _camDir.copy(_idealOffset).normalize();

    this.camRaycastFrame = (this.camRaycastFrame || 0) + 1;
    if (this.camRaycastFrame % 3 === 0) {
      this.camRaycaster.set(_headPos, _camDir);
      this.camRaycaster.far = this.camDistance;

      const hits = this.camRaycaster.intersectObjects(cityRayTargets, false);
      if (hits.length > 0) {
        this.cachedCamDist = Math.max(1.0, hits[0].distance - 0.35);
      } else {
        this.cachedCamDist = this.camDistance;
      }
    }
    const actualDist = this.cachedCamDist !== undefined ? this.cachedCamDist : this.camDistance;

    _finalCamPos.copy(_headPos).addScaledVector(_camDir, actualDist);
    _finalCamPos.x += shakeOffset.x;
    _finalCamPos.y += shakeOffset.y;

    this.camera.position.copy(_finalCamPos);
    this.camera.lookAt(_headPos.x, _headPos.y - 0.1, _headPos.z);

    // 5. Flare Cooldown Tick
    if (this.flareCooldownTimer > 0) {
      this.flareCooldownTimer = Math.max(0, this.flareCooldownTimer - dt);
      const cdPct = (1 - this.flareCooldownTimer / CONFIG.player.flareCooldown) * 100;
      const bar = document.getElementById('flare-cd-bar');
      const txt = document.getElementById('flare-status-txt');
      if (bar) bar.style.width = `${cdPct}%`;
      if (txt) txt.innerText = this.flareCooldownTimer > 0 ? `${Math.ceil(this.flareCooldownTimer)}s` : 'READY';
    }

    // 6. Reload Timer Tick
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

    // 7. Weapon Firing Logic
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

  checkCollisions(x, z, colliders) {
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

    if (this.effects) {
      this.effects.addShake(w.name === 'SHOTGUN' ? 0.16 : 0.08);
      _shootForward.set(0, 0, -1).applyAxisAngle(_upAxis, this.yaw);
      this.effects.spawnMuzzleFlash(this.mesh.position, _shootForward);
    }

    const activeZombies = zombies.filter(z => !z.isDead);
    const activeZombieMeshes = activeZombies.map(z => z.mesh);

    // Fire pellets with dedicated fast hierarchy separation
    for (let p = 0; p < w.pellets; p++) {
      _spreadForward.set(
        -Math.sin(this.yaw) * Math.cos(this.pitch) + (Math.random() - 0.5) * w.spread,
        -Math.sin(this.pitch) + (Math.random() - 0.5) * w.spread,
        -Math.cos(this.yaw) * Math.cos(this.pitch) + (Math.random() - 0.5) * w.spread
      ).normalize();

      _headPos.copy(this.mesh.position);
      _headPos.y += 1.6;

      _shootRaycaster.set(_headPos, _spreadForward);
      _shootRaycaster.far = this.maxShootingRange;

      // 1. Check against active zombie rigs (recursive)
      const zombieHits = _shootRaycaster.intersectObjects(activeZombieMeshes, true);
      // 2. Check against simple box proxies (flat, non-recursive, 12 triangles per box)
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
          hitZombie = null; // City building/prop wall was hit first
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
    if (this.health <= 0) return;
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

    if (this.sound) this.sound.healthPickup();
    events.emit('playerHealed', { health: this.health, maxHealth: this.maxHealth });
  }

  die() {
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
