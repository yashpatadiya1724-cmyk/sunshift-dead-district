import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { events } from '../core/Events.js';
import { assets } from '../core/Assets.js';

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

    this.setupInputListeners();
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
    const bodyGeo = new THREE.BoxGeometry(0.8, 1.1, 0.45);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x224488, roughness: 0.7, metalness: 0.1 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.15;
    body.castShadow = true;
    body.receiveShadow = true;
    this.mesh.add(body);

    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.8 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.95;
    head.castShadow = true;
    this.mesh.add(head);

    this.leftArm = this.createLimb(-0.55, 1.15, 0);
    this.rightArm = this.createLimb(0.55, 1.15, 0);

    const legGeo = new THREE.BoxGeometry(0.28, 0.95, 0.28);
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.85 });

    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.24, 0.48, 0);
    this.leftLeg.castShadow = true;
    this.mesh.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.24, 0.48, 0);
    this.rightLeg.castShadow = true;
    this.mesh.add(this.rightLeg);
  }

  setupInputListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Digit1') this.switchWeapon(0);
      if (e.code === 'Digit2') this.switchWeapon(1);
      if (e.code === 'Digit3') this.switchWeapon(2);

      if (e.code === 'KeyR') {
        this.startReload();
      }

      if (e.code === 'KeyQ') {
        this.triggerFlare();
      }
    });

    window.addEventListener('wheel', (e) => {
      if (this.input.isLocked) {
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
    if (this.unlockedWeapons[key] !== undefined) {
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
    if (!this.unlockedWeapons[key]) {
      if (this.effects) {
        this.effects.showBanner(`${key.toUpperCase()} LOCKED`, '#ff4444');
      }
      return;
    }
    if (index === this.currentWeaponIndex || this.isReloading) return;
    this.currentWeaponIndex = index;
    this.shootTimer = 0.15;
    this.updateHandWeaponModel();
    this.emitWeaponState();
    if (this.sound) this.sound.uiClick();
  }

  updateHandWeaponModel() {
    const w = this.getCurrentWeapon();
    if (this.weaponMesh && this.rightArm) {
      this.rightArm.remove(this.weaponMesh);
    }

    const assetId = w.name.toLowerCase().includes('pistol') ? 'weapon_pistol'
                  : w.name.toLowerCase().includes('shotgun') ? 'weapon_shotgun'
                  : 'weapon_rifle';

    const modelInstance = assets.getInstance(assetId);
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
    if (this.isReloading || w.magAmmo === w.magSize || w.reserveAmmo <= 0) return;

    this.isReloading = true;
    this.reloadTimer = w.reloadTime;
    if (this.sound) this.sound.playReload();
    this.emitWeaponState();
  }

  emitWeaponState() {
    const w = this.getCurrentWeapon();
    events.emit('weaponState', {
      name: w.name,
      mag: w.magAmmo,
      reserve: w.reserveAmmo === Infinity ? '∞' : w.reserveAmmo,
      isReloading: this.isReloading,
      reloadProgress: this.isReloading ? (1 - this.reloadTimer / w.reloadTime) : 1
    });
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);

    if (this.health > 25) {
      if (this.effects) this.effects.setLowHealthEffect(false);
      if (this.sound) this.sound.setLowHealthHeartbeat(false);
    }

    const bar = document.getElementById('health-bar');
    if (bar) bar.style.width = `${(this.health / this.maxHealth) * 100}%`;

    events.emit('playerHealed', { health: this.health, maxHealth: this.maxHealth });
  }

  refillAmmo(type, amount) {
    const target = this.weaponList.find(w => w.name.toLowerCase().includes(type.toLowerCase()));
    if (target && target.reserveAmmo !== Infinity) {
      target.reserveAmmo = Math.min(target.maxReserve, target.reserveAmmo + amount);
      this.emitWeaponState();
    }
  }

  reset() {
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.health = this.maxHealth;
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
      this.effects.spawnShockwave(this.mesh.position, CONFIG.player.flareRadius);
    }
    if (this.sound) {
      if (typeof this.sound.playFlare === 'function') this.sound.playFlare();
      else if (typeof this.sound.flarePulse === 'function') this.sound.flarePulse();
    }

    events.emit('flareTriggered', {
      position: this.mesh.position.clone(),
      radius: CONFIG.player.flareRadius,
      duration: this.flareDuration
    });
  }

  takeDamage(amount, sourcePos) {
    if (this.health <= 0) return;

    this.health = Math.max(0, this.health - amount);

    if (this.effects) {
      this.effects.flashDamage();
      this.effects.addShake(0.25);
      if (sourcePos && typeof this.effects.showDamageArc === 'function') {
        this.effects.showDamageArc(this.mesh.position, sourcePos, this.yaw);
      }
    }
    if (this.sound) {
      if (typeof this.sound.playHurt === 'function') this.sound.playHurt();
      else if (typeof this.sound.playerHurt === 'function') this.sound.playerHurt();
    }

    if (this.health <= 25 && this.health > 0) {
      if (this.effects) this.effects.setLowHealthEffect(true);
      if (this.sound) this.sound.setLowHealthHeartbeat(true);
    }

    events.emit('playerHit', { health: this.health, maxHealth: this.maxHealth });

    if (this.health <= 0) {
      this.die();
    }
  }

  die() {
    if (this.sound) {
      if (typeof this.sound.playDeath === 'function') this.sound.playDeath();
      else if (typeof this.sound.playerDeath === 'function') this.sound.playerDeath();
      this.sound.setLowHealthHeartbeat(false);
    }
    if (this.effects) {
      this.effects.setLowHealthEffect(false);
    }
    events.emit('playerDied');
  }

  update(dt, cityColliders, zombies) {
    if (this.health <= 0) return;

    if (this.flareCooldownTimer > 0) {
      this.flareCooldownTimer -= dt;
      events.emit('flareCooldown', {
        cooldown: Math.max(0, this.flareCooldownTimer),
        total: CONFIG.player.flareCooldown
      });
    }

    if (this.shootTimer > 0) this.shootTimer -= dt;

    if (this.isReloading) {
      this.reloadTimer -= dt;
      this.emitWeaponState();
      if (this.reloadTimer <= 0) {
        this.finishReload();
      }
    }

    this.handleMouseLook();
    this.handleMovement(dt, cityColliders);

    const isFiring = (typeof this.input.isMouseDown === 'function' ? this.input.isMouseDown() : this.input.mouse?.isDown);
    if (isFiring && this.input.isLocked) {
      this.shoot(zombies);
    }

    this.updateCamera(dt, cityColliders);
  }

  finishReload() {
    const w = this.getCurrentWeapon();
    const needed = w.magSize - w.magAmmo;
    const available = (w.reserveAmmo === Infinity) ? needed : Math.min(needed, w.reserveAmmo);

    w.magAmmo += available;
    if (w.reserveAmmo !== Infinity) {
      w.reserveAmmo -= available;
    }

    this.isReloading = false;
    this.emitWeaponState();
  }

  handleMouseLook() {
    if (!this.input.isLocked) return;

    const delta = typeof this.input.consumeMouseDelta === 'function'
      ? this.input.consumeMouseDelta()
      : { x: this.input.mouse?.deltaX || 0, y: this.input.mouse?.deltaY || 0 };

    this.yaw -= delta.x * this.sensitivity;
    const invertMultiplier = this.invertY ? -1 : 1;
    this.pitch += delta.y * this.sensitivity * invertMultiplier;
    this.pitch = Math.max(-0.6, Math.min(1.1, this.pitch));
  }

  handleMovement(dt, colliders) {
    const moveX = (this.input.isKey('KeyD') ? 1 : 0) - (this.input.isKey('KeyA') ? 1 : 0);
    const moveZ = (this.input.isKey('KeyS') ? 1 : 0) - (this.input.isKey('KeyW') ? 1 : 0);

    const isMoving = moveX !== 0 || moveZ !== 0;
    const isSprinting = this.input.isKey('ShiftLeft') || this.input.isKey('ShiftRight');
    const curSpeed = this.speed * (isSprinting ? this.sprintMultiplier : 1.0);

    if (isMoving) {
      const moveVec = new THREE.Vector3(moveX, 0, moveZ).normalize();
      moveVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      moveVec.multiplyScalar(curSpeed * dt);

      this.moveWithCollision(moveVec, colliders);

      this.walkTimer += dt * (isSprinting ? 12 : 7);
      const swing = Math.sin(this.walkTimer) * (isSprinting ? 0.7 : 0.4);
      if (this.leftLeg) this.leftLeg.rotation.x = swing;
      if (this.rightLeg) this.rightLeg.rotation.x = -swing;
      if (this.leftArm) this.leftArm.rotation.x = -swing;
      if (this.rightArm) this.rightArm.rotation.x = swing * 0.3;

      if (this.isGrounded && this.sound) {
        if (Math.sin(this.walkTimer) > 0.9) {
          this.sound.playFootstep();
        }
      }
    } else {
      if (this.leftLeg) this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.1);
      if (this.rightLeg) this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.1);
      if (this.leftArm) this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, 0.1);
    }

    if (this.input.isKey('Space') && this.isGrounded) {
      this.velocityY = this.jumpStrength;
      this.isGrounded = false;
    }

    if (!this.isGrounded) {
      this.velocityY -= this.gravity * dt;
      this.mesh.position.y += this.velocityY * dt;

      if (this.mesh.position.y <= 0) {
        this.mesh.position.y = 0;
        this.velocityY = 0;
        this.isGrounded = true;
      }
    }

    this.mesh.rotation.y = this.yaw;
  }

  moveWithCollision(moveVec, colliders) {
    if (!colliders || colliders.length === 0) {
      this.mesh.position.add(moveVec);
      return;
    }

    const testX = this.mesh.position.x + moveVec.x;
    if (!this.checkCollisions(testX, this.mesh.position.z, colliders)) {
      this.mesh.position.x = testX;
    }

    const testZ = this.mesh.position.z + moveVec.z;
    if (!this.checkCollisions(this.mesh.position.x, testZ, colliders)) {
      this.mesh.position.z = testZ;
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

  shoot(zombies) {
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
      if (w.name.toLowerCase().includes('shotgun')) this.sound.playShotgun();
      else if (w.name.toLowerCase().includes('rifle')) this.sound.playRifle();
      else this.sound.playGunshot();
    }

    if (this.effects) {
      this.effects.spawnMuzzleFlash(this.rightArm.position.clone().add(this.mesh.position));
      this.effects.addShake(w.name.toLowerCase().includes('shotgun') ? 0.15 : 0.06);
    }

    events.emit('shotFired', { weapon: w.name, noise: w.noise || 0.4 });

    const pellets = w.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      this.performRaycastShot(w, zombies);
    }

    if (w.magAmmo <= 0) {
      this.startReload();
    }
  }

  performRaycastShot(weapon, zombies) {
    const spread = weapon.spread || 0;
    const rayDir = new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      -1
    );

    rayDir.applyAxisAngle(new THREE.Vector3(1, 0, 0), -this.pitch);
    rayDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    rayDir.normalize();

    const origin = this.mesh.position.clone();
    origin.y += 1.6;

    let closestZombie = null;
    let closestDist = this.maxShootingRange;
    let hitPoint = origin.clone().add(rayDir.clone().multiplyScalar(this.maxShootingRange));

    if (zombies) {
      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (z.isDead || z.isRemoved) continue;

        const toZ = z.mesh.position.clone().sub(origin);
        toZ.y += 1.0;
        const projection = toZ.dot(rayDir);

        if (projection > 0 && projection < closestDist) {
          const closestPointOnRay = origin.clone().add(rayDir.clone().multiplyScalar(projection));
          const distToRay = closestPointOnRay.distanceTo(z.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)));

          const hitRadius = 0.7 * (z.archetype?.scale || 1.0);
          if (distToRay < hitRadius) {
            closestDist = projection;
            closestZombie = z;
            hitPoint = closestPointOnRay;
          }
        }
      }
    }

    if (this.effects) {
      this.effects.spawnBulletTracer(origin, hitPoint);
    }

    if (closestZombie) {
      closestZombie.takeDamage(weapon.damage);
      if (this.effects) {
        this.effects.spawnBlood(hitPoint);
      }
    }
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
