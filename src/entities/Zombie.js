import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { events } from '../core/Events.js';
import { assets } from '../core/Assets.js';

// Module-level scratch vectors to eliminate per-frame allocations
const _tempTestPos = new THREE.Vector3();

// Static shared geometries (allocated once, shared across all zombies)
const _bodyGeo = new THREE.CapsuleGeometry(0.36, 0.65, 8, 10);
const _headGeo = new THREE.SphereGeometry(0.26, 10, 10);
const _eyeGeo = new THREE.SphereGeometry(0.045, 6, 6);
const _armGeo = new THREE.CapsuleGeometry(0.11, 0.60, 5, 6);
const _legGeo = new THREE.CapsuleGeometry(0.13, 0.68, 5, 6);

// Static shared materials by archetype (allocated once, shared across all zombies)
const _sharedGLBMats = {
  NORMAL: new THREE.MeshStandardMaterial({ color: 0x3d5236, roughness: 0.75, metalness: 0.1 }),
  RUNNER: new THREE.MeshStandardMaterial({ color: 0x6a3830, roughness: 0.70, metalness: 0.1 }),
  BRUTE: new THREE.MeshStandardMaterial({ color: 0x29253d, roughness: 0.80, metalness: 0.15 })
};
const _sharedLODGeo = new THREE.BoxGeometry(0.7, 1.8, 0.4);

const _sharedMats = {
  NORMAL: {
    body: new THREE.MeshStandardMaterial({ color: 0x3d5236, roughness: 0.78, metalness: 0.05 }),
    head: new THREE.MeshStandardMaterial({ color: 0x5a7d4a, roughness: 0.72, metalness: 0.05 }),
    limb: new THREE.MeshStandardMaterial({ color: 0x3d5236, roughness: 0.78, metalness: 0.05 })
  },
  RUNNER: {
    body: new THREE.MeshStandardMaterial({ color: 0x6a3830, roughness: 0.78, metalness: 0.05 }),
    head: new THREE.MeshStandardMaterial({ color: 0x8e4c40, roughness: 0.72, metalness: 0.05 }),
    limb: new THREE.MeshStandardMaterial({ color: 0x6a3830, roughness: 0.78, metalness: 0.05 })
  },
  BRUTE: {
    body: new THREE.MeshStandardMaterial({ color: 0x29253d, roughness: 0.78, metalness: 0.05 }),
    head: new THREE.MeshStandardMaterial({ color: 0x3f3659, roughness: 0.72, metalness: 0.05 }),
    limb: new THREE.MeshStandardMaterial({ color: 0x29253d, roughness: 0.78, metalness: 0.05 })
  },
  EYE: new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff0000,
    emissiveIntensity: 2.5,
    roughness: 0.1,
    metalness: 0.2
  }),
  PANTS: new THREE.MeshStandardMaterial({
    color: 0x1c2419,
    roughness: 0.85,
    metalness: 0.05
  }),
  FREEZE_BODY: new THREE.MeshStandardMaterial({
    color: 0x0088ff,
    roughness: 0.78,
    metalness: 0.1
  }),
  FREEZE_HEAD: new THREE.MeshStandardMaterial({
    color: 0x6ec6ff,
    roughness: 0.72,
    metalness: 0.1
  }),
  FLASH_HEAD: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5
  })
};

export class Zombie {
  constructor(scene, position, sound, archetype = null, isNightSpawn = false) {
    this.scene = scene;
    this.sound = sound;
    this.isNightSpawn = isNightSpawn;
    this.isFading = false;
    this.fadeAlpha = 1.0;
    this.isRemoved = false;
    this.hasClonedMaterials = false;

    // Pick Archetype (Normal 60%, Runner 25%, Brute 15%) if not specified
    if (!archetype) {
      const rand = Math.random();
      if (rand < CONFIG.enemies.normal.weight) {
        this.archetype = CONFIG.enemies.normal;
      } else if (rand < CONFIG.enemies.normal.weight + CONFIG.enemies.runner.weight) {
        this.archetype = CONFIG.enemies.runner;
      } else {
        this.archetype = CONFIG.enemies.brute;
      }
    } else {
      this.archetype = archetype;
    }

    this.typeKey = this.archetype.type || 'NORMAL';
    this.archetypeMats = _sharedMats[this.typeKey] || _sharedMats.NORMAL;

    this.health = this.archetype.health;
    this.maxHealth = this.archetype.health;
    this.damage = this.archetype.damage;
    this.isDead = false;
    this.isRemoved = false;
    this.isNightSpawn = isNightSpawn;
    this.isFading = false;
    this.fadeAlpha = 1.0;
    this.animBudgetTier = 'FULL';
    this.accumulatedAnimDt = 0;

    // UV Flare Freeze state
    this.frozenTimer = 0;

    this.attackDistance = CONFIG.zombie.attackDistance * (this.archetype.scale >= 1.2 ? 1.4 : 1.0);
    this.attackCooldown = CONFIG.zombie.attackCooldown;
    this.attackTimer = 0;
    this.groanTimer = 3.0 + Math.random() * 5.0;
    this.walkTimer = Math.random() * 10;
    this.frameCounter = Math.floor(Math.random() * 2);

    // Stuck detection against geometry
    this.stuckTimer = 0;
    this.lastStuckPos = new THREE.Vector3();
    this.hasLoggedStuck = false;

    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.attackAnimTimer = 0;

    // 1. Check if GLB Model Instance is available
    const zombieInstance = assets ? assets.getInstance('zombie') : null;
    if (zombieInstance) {
      this.mesh = zombieInstance;
      this.leftArm = this.mesh.getObjectByName('leftArm') || this.mesh.getObjectByName('L_Forearm');
      this.rightArm = this.mesh.getObjectByName('rightArm') || this.mesh.getObjectByName('R_Forearm');
      this.leftLeg = this.mesh.getObjectByName('leftLeg') || this.mesh.getObjectByName('L_Calf');
      this.rightLeg = this.mesh.getObjectByName('rightLeg') || this.mesh.getObjectByName('R_Calf');

      const rawClips = assets.animations.get('zombie') || [];
      const clipMap = assets.getClipMap('zombie');
      if (rawClips.length > 0) {
        this.mixer = new THREE.AnimationMixer(this.mesh);

        const walkClip = clipMap.walk || rawClips.find(c => /walk/i.test(c.name)) || rawClips[0];
        const runClip = clipMap.run || rawClips.find(c => /run/i.test(c.name)) || walkClip;
        const idleClip = clipMap.idle || rawClips.find(c => /idle/i.test(c.name)) || walkClip;

        if (idleClip) this.actions.idle = this.mixer.clipAction(idleClip);
        if (walkClip) this.actions.walk = this.mixer.clipAction(walkClip);
        if (runClip) this.actions.run = this.mixer.clipAction(runClip);

        this.currentAction = this.actions.walk;
        if (this.currentAction) this.currentAction.play();
      }

      // Shared Archetype Material for GLB SkinnedMesh (1 single material per archetype)
      const archetypeKey = this.archetype.name || 'NORMAL';
      this.archetypeMat = _sharedGLBMats[archetypeKey] || _sharedGLBMats.NORMAL;

      let primarySkinnedMesh = null;
      this.mesh.traverse((node) => {
        if (node.isSkinnedMesh) {
          primarySkinnedMesh = node;
          node.material = this.archetypeMat;
          node.castShadow = false; // Off by default on LOW/MEDIUM; closest 8 enabled dynamically on HIGH
          node.receiveShadow = true;
        } else if (node.isMesh) {
          node.material = this.archetypeMat;
          node.castShadow = false;
          node.receiveShadow = true;
        }
      });
      this.skinnedMesh = primarySkinnedMesh;

      // Zombie LOD: 15+ units simplified low-poly mesh (1 draw call, 12 triangles, no skeleton skinning)
      this.lodLowMesh = new THREE.Mesh(_sharedLODGeo, this.archetypeMat);
      this.lodLowMesh.position.y = 0.9;
      this.lodLowMesh.visible = false;
      this.lodLowMesh.castShadow = false;
      this.lodLowMesh.receiveShadow = true;
      this.mesh.add(this.lodLowMesh);
    } else {
      // Build Natural PBR Procedural Rig
      this.mesh = new THREE.Group();

      this.bodyMesh = new THREE.Mesh(_bodyGeo, this.archetypeMats.body);
      this.bodyMesh.position.y = 1.05;
      this.bodyMesh.castShadow = true;
      this.bodyMesh.receiveShadow = true;
      this.mesh.add(this.bodyMesh);

      this.headMesh = new THREE.Mesh(_headGeo, this.archetypeMats.head);
      this.headMesh.position.y = 1.75;
      this.headMesh.castShadow = false;
      this.headMesh.receiveShadow = true;
      this.mesh.add(this.headMesh);

      const leftEye = new THREE.Mesh(_eyeGeo, _sharedMats.EYE);
      leftEye.position.set(-0.11, 1.78, 0.22);
      leftEye.castShadow = false;
      this.mesh.add(leftEye);

      const rightEye = new THREE.Mesh(_eyeGeo, _sharedMats.EYE);
      rightEye.position.set(0.11, 1.78, 0.22);
      rightEye.castShadow = false;
      this.mesh.add(rightEye);

      this.leftArm = new THREE.Mesh(_armGeo, this.archetypeMats.limb);
      this.leftArm.position.set(-0.48, 1.25, 0.35);
      this.leftArm.rotation.x = -Math.PI / 2 + 0.1;
      this.leftArm.castShadow = false;
      this.mesh.add(this.leftArm);

      this.rightArm = new THREE.Mesh(_armGeo, this.archetypeMats.limb);
      this.rightArm.position.set(0.48, 1.25, 0.35);
      this.rightArm.rotation.x = -Math.PI / 2 - 0.1;
      this.rightArm.castShadow = false;
      this.mesh.add(this.rightArm);

      this.leftLeg = new THREE.Mesh(_legGeo, _sharedMats.PANTS);
      this.leftLeg.position.set(-0.20, 0.45, 0);
      this.leftLeg.castShadow = false;
      this.mesh.add(this.leftLeg);

      this.rightLeg = new THREE.Mesh(_legGeo, _sharedMats.PANTS);
      this.rightLeg.position.set(0.20, 0.45, 0);
      this.rightLeg.castShadow = false;
      this.mesh.add(this.rightLeg);
    }

    // Apply Archetype Scale Factor (Requirement 4: Model height 1.0 -> Normal 1.8; Runner/Brute scale from CONFIG)
    const baseZombieScale = 1.8;
    const s = baseZombieScale * (this.archetype.scale || 1.0);
    this.mesh.scale.set(s, s, s);

    this.mesh.position.copy(position);
    this.scene.add(this.mesh);

    // Listen for UV Flare Freeze shockwave
    this.unsubscribeFlare = events.on('flareTriggered', ({ position, radius, duration }) => {
      if (this.isDead) return;
      if (this.mesh.position.distanceTo(position) <= radius) {
        this.freeze(duration);
      }
    });
  }

  freeze(duration) {
    this.frozenTimer = duration;
    if (this.bodyMesh && this.headMesh) {
      this.bodyMesh.material = _sharedMats.FREEZE_BODY;
      this.headMesh.material = _sharedMats.FREEZE_HEAD;
    } else {
      if (this.bodyMat) this.bodyMat.color.setHex(0x0088ff);
      if (this.headMat) this.headMat.color.setHex(0x6ec6ff);
    }
  }

  startDawnFade() {
    if (this.isNightSpawn && !this.isDead) {
      this.isFading = true;
      if (!this.hasClonedMaterials) {
        this.hasClonedMaterials = true;
        this.mesh.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.transparent = true;
          }
        });
      }
    }
  }

  updateAnimation(dt, isNight = false, currentSpeed = 0, isMoving = true) {
    if (this.isDead || this.frozenTimer > 0) return;

    // Requirement 5: Zombie: din me walk, raat me run, ruke hue idle. Crossfade 0.2 second. timeScale = asli speed / clip ki speed.
    if (this.mixer) {
      let targetAction = this.actions.idle;
      if (isMoving && currentSpeed > 0.1) {
        targetAction = isNight ? (this.actions.run || this.actions.walk) : this.actions.walk;
      }

      if (targetAction && this.currentAction !== targetAction) {
        if (this.currentAction) {
          this.currentAction.crossFadeTo(targetAction, 0.2, true);
        }
        targetAction.play();
        this.currentAction = targetAction;
      }

      // timeScale = actual speed / clip speed
      if (this.currentAction) {
        const nominalSpeed = isNight ? (this.archetype.nightSpeed || 5.2) : (this.archetype.daySpeed || 1.8);
        this.currentAction.timeScale = isMoving ? THREE.MathUtils.clamp(currentSpeed / nominalSpeed, 0.6, 1.6) : 1.0;
      }
    }

    // Animation budget tiers: FROZEN = 0 Hz, THROTTLED_15HZ = 15 Hz, FULL = full 60 Hz
    if (this.animBudgetTier === 'FROZEN') {
      return;
    }
    if (this.animBudgetTier === 'THROTTLED_15HZ') {
      this.accumulatedAnimDt += dt;
      if (this.accumulatedAnimDt < 0.066) return;
      dt = this.accumulatedAnimDt;
      this.accumulatedAnimDt = 0;
    }

    if (this.mixer) {
      this.mixer.update(dt);
    } else {
      if (this.leftLeg && this.rightLeg) {
        const legSwing = Math.sin(this.walkTimer) * 0.55;
        this.leftLeg.rotation.x = legSwing;
        this.rightLeg.rotation.x = -legSwing;
      }
      if (this.leftArm && this.rightArm) {
        this.leftArm.rotation.x = -Math.PI / 2 + Math.sin(this.walkTimer) * 0.3;
        this.rightArm.rotation.x = -Math.PI / 2 - Math.sin(this.walkTimer) * 0.3;
      }
    }
  }

  update(dt, player, isNight, cityColliders, frustum = null) {
    if (this.isDead || this.isRemoved) return;

    // Handle Dawn Fade-Out for extra night zombies
    if (this.isFading) {
      this.fadeAlpha -= dt * 0.7;
      if (this.hasClonedMaterials) {
        this.mesh.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.opacity = Math.max(0, this.fadeAlpha);
          }
        });
      }
      if (this.fadeAlpha <= 0) {
        this.destroy();
        return;
      }
    }

    // Handle UV Flare Freeze Duration
    if (this.frozenTimer > 0) {
      this.frozenTimer -= dt;
      if (this.frozenTimer <= 0) {
        if (this.bodyMesh && this.headMesh) {
          this.bodyMesh.material = this.archetypeMats.body;
          this.headMesh.material = this.archetypeMats.head;
        } else {
          if (this.bodyMat) this.bodyMat.color.setHex(this.archetype.color);
          if (this.headMat) this.headMat.color.setHex(this.archetype.headColor);
        }
      }
      return;
    }

    const dx = player.mesh.position.x - this.mesh.position.x;
    const dz = player.mesh.position.z - this.mesh.position.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);

    // Far (60+ unit) zombies skip mesh update and animation completely
    if (horizontalDist > 60) {
      return;
    }

    const currentSpeed = isNight ? this.archetype.nightSpeed : this.archetype.daySpeed;

    // Audio groan timer
    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      this.groanTimer = 4.0 + Math.random() * 5.0;
      if (this.sound && typeof this.sound.zombieGroan === 'function' && horizontalDist < CONFIG.zombie.soundHearingRadius) {
        const volume = Math.max(0, 1.0 - (horizontalDist / CONFIG.zombie.soundHearingRadius));
        this.sound.zombieGroan(volume);
      }
    }

    const baseAgro = isNight ? CONFIG.zombie.agroRangeNight : CONFIG.zombie.agroRangeDay;
    const noise = (player && player.noise !== undefined) ? player.noise : (window.__SUNSHIFT_GAME__?.noise || 0);
    const agroRange = baseAgro * (1.0 + noise);

    if (horizontalDist < agroRange && horizontalDist > this.attackDistance) {
      const dirX = dx / horizontalDist;
      const dirZ = dz / horizontalDist;

      const stepX = dirX * currentSpeed * dt;
      const stepZ = dirZ * currentSpeed * dt;

      // Test X movement
      _tempTestPos.copy(this.mesh.position);
      _tempTestPos.x += stepX;
      if (!this.checkCollisions(_tempTestPos, cityColliders)) {
        this.mesh.position.x = _tempTestPos.x;
      }

      // Test Z movement
      _tempTestPos.copy(this.mesh.position);
      _tempTestPos.z += stepZ;
      if (!this.checkCollisions(_tempTestPos, cityColliders)) {
        this.mesh.position.z = _tempTestPos.z;
      }

      // Stuck detection against geometry (> 5s threshold)
      if (this.lastStuckPos.distanceToSquared(this.mesh.position) < 0.04) {
        this.stuckTimer += dt;
        if (this.stuckTimer >= 5.0) {
          if (!this.hasLoggedStuck) {
            console.warn(`[Zombie Stuck] Zombie ${this.archetype?.name || 'normal'} stuck against geometry for > 5s at (${this.mesh.position.x.toFixed(1)}, ${this.mesh.position.z.toFixed(1)})`);
            this.hasLoggedStuck = true;
          }
          // Slide tangent to obstacle to unstick
          const perpX = -dirZ;
          const perpZ = dirX;
          _tempTestPos.copy(this.mesh.position);
          _tempTestPos.x += perpX * currentSpeed * dt * 1.5;
          _tempTestPos.z += perpZ * currentSpeed * dt * 1.5;
          if (!this.checkCollisions(_tempTestPos, cityColliders)) {
            this.mesh.position.copy(_tempTestPos);
          }
        }
      } else {
        this.stuckTimer = 0;
        this.hasLoggedStuck = false;
        this.lastStuckPos.copy(this.mesh.position);
      }

      // Face player
      this.mesh.rotation.y = Math.atan2(dirX, dirZ);

      // Zombie LOD: 15+ units simplified low-poly mesh (1 draw call, no skinning)
      if (this.lodLowMesh && this.skinnedMesh) {
        if (horizontalDist > 15) {
          if (this.skinnedMesh.visible) {
            this.skinnedMesh.visible = false;
            this.lodLowMesh.visible = true;
          }
        } else {
          if (!this.skinnedMesh.visible) {
            this.skinnedMesh.visible = true;
            this.lodLowMesh.visible = false;
          }
        }
      }

      // Far Visibility Culling (60+ units invisible)
      if (horizontalDist > 60) {
        this.mesh.visible = false;
      } else {
        this.mesh.visible = true;
      }

      // Frustum & distance check for animations
      const inView = frustum ? frustum.containsPoint(this.mesh.position) : true;
      if (inView && horizontalDist <= 40) {
        this.walkTimer += dt * (isNight ? 10 : 6);
        this.updateAnimation(dt, isNight, currentSpeed, true);
      }
    } else {
      if (this.leftLeg) this.leftLeg.rotation.x = 0;
      if (this.rightLeg) this.rightLeg.rotation.x = 0;
      this.updateAnimation(dt, isNight, 0, false);
    }

    // Procedural attack forward lean
    if (this.attackAnimTimer > 0) {
      this.attackAnimTimer -= dt;
      const progress = 1 - (this.attackAnimTimer / 0.35);
      const lean = Math.sin(progress * Math.PI) * 0.45;
      this.mesh.rotation.x = lean;
    } else if (!this.isDead) {
      this.mesh.rotation.x = 0;
    }

    // Attack Player Logic
    if (horizontalDist <= this.attackDistance) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = this.attackCooldown;
        this.attack(player);
      }
    }
  }

  attack(player) {
    this.attackAnimTimer = 0.35;
    if (this.actions?.attack) {
      this.actions.attack.reset().play();
    }
    if (player && typeof player.takeDamage === 'function') {
      player.takeDamage(this.damage, this.mesh ? this.mesh.position : null);
    }
    if (this.sound && typeof this.sound.zombieAttack === 'function') {
      this.sound.zombieAttack();
    }
  }

  checkCollisions(pos, colliders) {
    if (!colliders) return false;
    const radius = 0.5 * this.archetype.scale;
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

  takeDamage(amt) {
    this.health -= amt;

    if (this.skinnedMesh) {
      this.skinnedMesh.material = _sharedMats.FLASH_HEAD;
      setTimeout(() => {
        if (this.skinnedMesh && !this.isDead) {
          this.skinnedMesh.material = this.archetypeMat;
        }
      }, 80);
    } else if (this.headMesh) {
      this.headMesh.material = _sharedMats.FLASH_HEAD;
      setTimeout(() => {
        if (this.headMesh && !this.isDead) {
          this.headMesh.material = this.frozenTimer > 0 ? _sharedMats.FREEZE_HEAD : this.archetypeMats.head;
        }
      }, 80);
    } else if (this.headMat) {
      this.headMat.color.setHex(0xffffff);
      setTimeout(() => {
        if (this.headMat && !this.isDead) {
          this.headMat.color.setHex(this.archetype.headColor);
        }
      }, 80);
    }

    if (this.health <= 0 && !this.isDead) {
      this.die();
    }
  }

  die() {
    this.isDead = true;
    if (this.sound && typeof this.sound.zombieDeath === 'function') {
      this.sound.zombieDeath();
    }

    if (this.actions) {
      if (this.actions.walk) this.actions.walk.stop();
      if (this.actions.run) this.actions.run.stop();
      if (this.actions.idle) this.actions.idle.stop();
      if (this.actions.attack) this.actions.attack.stop();
    }

    // Requirement 5: procedural death (-90 degree fall down and sink slightly into ground)
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = -0.2;

    events.emit('zombieKilled', this);
  }

  destroy() {
    if (this.isRemoved) return;
    this.isRemoved = true;

    if (this.unsubscribeFlare) {
      this.unsubscribeFlare();
      this.unsubscribeFlare = null;
    }

    this.scene.remove(this.mesh);

    // Only dispose if this zombie cloned materials (e.g. dawn fade)
    if (this.hasClonedMaterials) {
      this.mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }
  }
}
