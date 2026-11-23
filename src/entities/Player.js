import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { events } from '../core/Events.js';

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
    this.currentWeaponIndex = 0;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.shootTimer = 0;

    this.camRaycaster = new THREE.Raycaster();

    // Build Stylized Rig
    this.mesh = new THREE.Group();

    // Torso
    const bodyGeo = new THREE.BoxGeometry(0.8, 1.1, 0.45);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x224488 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.15;
    body.castShadow = true;
    body.receiveShadow = true;
    this.mesh.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.95;
    head.castShadow = true;
    this.mesh.add(head);

    // Limbs
    const limbMat = new THREE.MeshLambertMaterial({ color: 0x1b356e });
    const armGeo = new THREE.BoxGeometry(0.24, 0.85, 0.24);

    this.leftArm = new THREE.Mesh(armGeo, limbMat);
    this.leftArm.position.set(-0.55, 1.15, 0);
    this.leftArm.castShadow = true;
    this.mesh.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, limbMat);
    this.rightArm.position.set(0.55, 1.15, 0);
    this.rightArm.castShadow = true;
    this.mesh.add(this.rightArm);

    // 3D Weapon Model Attached to Right Arm
    this.weaponMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x444444 })
    );
    this.weaponMesh.position.set(0, -0.4, 0.25);
    this.weaponMesh.castShadow = true;
    this.rightArm.add(this.weaponMesh);

    // Legs
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x22262d });
    const legGeo = new THREE.BoxGeometry(0.28, 0.95, 0.28);

    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.24, 0.48, 0);
    this.leftLeg.castShadow = true;
    this.mesh.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.24, 0.48, 0);
    this.rightLeg.castShadow = true;
    this.mesh.add(this.rightLeg);

    this.mesh.position.set(0, 0, 0);
    this.scene.add(this.mesh);

    this.yaw = 0;
    this.pitch = 0.2;

    this.setupInputListeners();
    this.updateHandWeaponModel();
    this.emitWeaponState();
  }

  setupInputListeners() {
    window.addEventListener('keydown', (e) => {
      // Weapon selection 1, 2, 3
      if (e.code === 'Digit1') this.switchWeapon(0);
      if (e.code === 'Digit2') this.switchWeapon(1);
      if (e.code === 'Digit3') this.switchWeapon(2);

      // Manual reload [R]
      if (e.code === 'KeyR') {
        this.startReload();
      }

      // UV Flare [Q]
      if (e.code === 'KeyQ') {
        this.triggerFlare();
      }
    });

    // Mouse wheel weapon cycle
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

  getCurrentWeapon() {
    return this.weaponList[this.currentWeaponIndex];
  }

  switchWeapon(index) {
    if (index === this.currentWeaponIndex || this.isReloading) return;
    this.currentWeaponIndex = index;
    this.shootTimer = 0.15;
    this.updateHandWeaponModel();
    this.emitWeaponState();
    if (this.sound) this.sound.uiClick();
  }

  updateHandWeaponModel() {
    const w = this.getCurrentWeapon();
    this.rightArm.remove(this.weaponMesh);
    if (this.weaponMesh.geometry) this.weaponMesh.geometry.dispose();

    this.weaponMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w.size[0], w.size[1], w.size[2]),
      new THREE.MeshLambertMaterial({ color: w.color })
    );
    this.weaponMesh.position.set(0, -0.35, w.size[2] * 0.5);
    this.weaponMesh.castShadow = true;
    this.rightArm.add(this.weaponMesh);
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

    // If health recovers above 25, clear low-health visual filter and heartbeat sound
    if (this.health > 25) {
      if (this.effects) this.effects.setLowHealthEffect(false);
      if (this.sound) this.sound.setLowHealthHeartbeat(false);
    }

    const bar = document.getElementById('health-bar');
    if (bar) bar.style.width = `${(this.health / this.maxHealth) * 100}%`;
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

    // Reset weapons ammo
    this.weaponList = [
      { ...CONFIG.weapons.pistol, magAmmo: CONFIG.weapons.pistol.magSize },
      { ...CONFIG.weapons.shotgun, magAmmo: CONFIG.weapons.shotgun.magSize },
      { ...CONFIG.weapons.rifle, magAmmo: CONFIG.weapons.rifle.magSize }
    ];
    this.currentWeaponIndex = 0;
    this.updateHandWeaponModel();
    this.emitWeaponState();

    if (this.effects) this.effects.setLowHealthEffect(false);
    if (this.sound) this.sound.setLowHealthHeartbeat(false);

    const bar = document.getElementById('health-bar');
    if (bar) bar.style.width = '100%';
  }

  triggerFlare() {
    if (this.flareCooldownTimer > 0 || this.health <= 0) return;
    this.flareCooldownTimer = CONFIG.player.flareCooldown;

    if (this.sound) this.sound.flarePulse();
    if (this.effects) {
      this.effects.spawnSpark(this.mesh.position);
      this.effects.addShake(0.3);
      this.effects.showBanner('UV FLARE DEPLOYED!', '#6ec6ff');
    }

    events.emit('flareTriggered', {
      position: this.mesh.position.clone(),
      radius: CONFIG.player.flareRadius,
      duration: this.flareDuration
    });
  }

  update(dt, cityColliders, zombies, cityMeshes) {
    // 1. Mouse Look with Invert Y
    const mouseDelta = this.input.consumeMouseDelta();
    this.yaw -= mouseDelta.x * this.sensitivity;
    const ySign = this.invertY ? -1 : 1;
    this.pitch -= mouseDelta.y * this.sensitivity * ySign;
    this.pitch = Math.max(-0.4, Math.min(0.8, this.pitch));

    // 2. Jump
    if (this.input.isKey('Space') && this.isGrounded) {
      this.velocityY = this.jumpStrength;
      this.isGrounded = false;
    }

    this.velocityY += this.gravity * dt;
    this.mesh.position.y += this.velocityY * dt;

    if (this.mesh.position.y <= 0) {
      this.mesh.position.y = 0;
      this.velocityY = 0;
      this.isGrounded = true;
    }

    // 3. Movement with X/Z Wall Sliding
    let moveZ = 0;
    let moveX = 0;
    if (this.input.isKey('KeyW')) moveZ -= 1;
    if (this.input.isKey('KeyS')) moveZ += 1;
    if (this.input.isKey('KeyA')) moveX -= 1;
    if (this.input.isKey('KeyD')) moveX += 1;

    const moveVector = new THREE.Vector3(moveX, 0, moveZ).normalize();
    const isSprinting = this.input.isKey('ShiftLeft') || this.input.isKey('ShiftRight');
    const currentSpeed = this.speed * (isSprinting ? this.sprintMultiplier : 1.0);

    const isMoving = moveVector.lengthSq() > 0;
    if (isMoving) {
      moveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      const step = moveVector.multiplyScalar(currentSpeed * dt);

      const testPosX = this.mesh.position.clone();
      testPosX.x += step.x;
      if (!this.checkCollisions(testPosX, cityColliders)) {
        this.mesh.position.x = testPosX.x;
      }

      const testPosZ = this.mesh.position.clone();
      testPosZ.z += step.z;
      if (!this.checkCollisions(testPosZ, cityColliders)) {
        this.mesh.position.z = testPosZ.z;
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
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.2);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.2);
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, 0.2);
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, 0.2);
    }

    // 4. Camera Follow with Wall Raycast Occlusion Avoidance
    const headPos = this.mesh.position.clone();
    headPos.y += 1.6;

    const shakeOffset = this.effects ? this.effects.getShakeOffset(dt) : { x: 0, y: 0 };
    const idealOffset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch) * this.camDistance,
      Math.sin(this.pitch) * this.camDistance + 0.3,
      Math.cos(this.yaw) * Math.cos(this.pitch) * this.camDistance
    );

    const idealCamPos = headPos.clone().add(idealOffset);
    const camDir = idealOffset.clone().normalize();
    this.camRaycaster.set(headPos, camDir);
    this.camRaycaster.far = this.camDistance;

    const hits = this.camRaycaster.intersectObjects(cityMeshes, false);
    let actualDist = this.camDistance;
    if (hits.length > 0) {
      actualDist = Math.max(1.0, hits[0].distance - 0.35);
    }

    const finalCamPos = headPos.clone().addScaledVector(camDir, actualDist);
    finalCamPos.x += shakeOffset.x;
    finalCamPos.y += shakeOffset.y;

    this.camera.position.copy(finalCamPos);
    this.camera.lookAt(headPos.x, headPos.y - 0.1, headPos.z);

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

    // 7. Weapon Firing Logic (Auto vs Semi-Auto)
    this.shootTimer -= dt;
    const w = this.getCurrentWeapon();

    if (this.input.mouse.isDown && this.shootTimer <= 0 && !this.isReloading) {
      if (w.magAmmo > 0) {
        this.shoot(zombies, cityMeshes);
        w.magAmmo--;
        this.shootTimer = w.fireRate;
        this.emitWeaponState();

        // If semi-auto, consume click
        if (!w.auto) {
          this.input.mouse.isDown = false;
        }
      } else {
        // Auto-reload on empty trigger
        this.startReload();
      }
    }
  }

  checkCollisions(pos, colliders) {
    const radius = 0.5;
    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (
        pos.x > box.min.x - radius && pos.x < box.max.x + radius &&
        pos.z > box.min.z - radius && pos.z < box.max.z + radius
      ) {
        return true;
      }
    }
    return false;
  }

  shoot(zombies, cityMeshes = []) {
    events.emit('playerShot');

    const w = this.getCurrentWeapon();

    // Trigger weapon-specific audio
    if (this.sound) {
      if (w.name === 'SHOTGUN') this.sound.shotgunBlast();
      else if (w.name === 'ASSAULT RIFLE') this.sound.rifleShot();
      else this.sound.gunshot();
    }

    if (this.effects) {
      this.effects.addShake(w.name === 'SHOTGUN' ? 0.16 : 0.08);
      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.effects.spawnMuzzleFlash(this.mesh.position, forward);
    }

    const activeZombies = zombies.filter(z => !z.isDead);
    const activeZombieMeshes = activeZombies.map(z => z.mesh);
    const candidateTargets = [...activeZombieMeshes, ...cityMeshes];

    // Fire pellets (Shotgun = 6 pellets with spread; Pistol/Rifle = 1 pellet)
    for (let p = 0; p < w.pellets; p++) {
      const raycaster = new THREE.Raycaster();
      const spreadX = (Math.random() - 0.5) * w.spread;
      const spreadY = (Math.random() - 0.5) * w.spread;
      raycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), this.camera);
      raycaster.far = this.maxShootingRange;

      const intersects = raycaster.intersectObjects(candidateTargets, true);
      if (intersects.length > 0) {
        const closestHit = intersects[0];
        const hitZombie = activeZombies.find(
          z => z.mesh === closestHit.object || z.mesh.children.includes(closestHit.object)
        );

        if (hitZombie) {
          hitZombie.takeDamage(w.damage);
          if (this.effects) this.effects.spawnBlood(closestHit.point);
        } else {
          if (this.effects) this.effects.spawnSpark(closestHit.point);
        }
      }
    }
  }

  takeDamage(amount, fromPosition = null) {
    this.health = Math.max(0, this.health - amount);

    if (this.health <= 25 && this.health > 0) {
      if (this.effects) this.effects.setLowHealthEffect(true);
      if (this.sound) this.sound.setLowHealthHeartbeat(true);
    }

    events.emit('playerHurt', {
      amount,
      from: fromPosition,
      health: this.health
    });

    if (this.sound) this.sound.playerHurt();
    if (this.effects) {
      this.effects.addShake(0.3);
      this.effects.flashDamage();
    }

    const bar = document.getElementById('health-bar');
    if (bar) bar.style.width = `${(this.health / this.maxHealth) * 100}%`;
  }
}
