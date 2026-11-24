import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { events } from '../core/Events.js';

// Module-level scratch vectors to eliminate per-frame allocations
const _tempTestPos = new THREE.Vector3();

// Static shared geometries (allocated once, shared across all zombies)
const _bodyGeo = new THREE.CapsuleGeometry(0.36, 0.65, 8, 10);
const _headGeo = new THREE.SphereGeometry(0.26, 10, 10);
const _eyeGeo = new THREE.SphereGeometry(0.045, 6, 6);
const _armGeo = new THREE.CapsuleGeometry(0.11, 0.60, 5, 6);
const _legGeo = new THREE.CapsuleGeometry(0.13, 0.68, 5, 6);

// Static shared materials by archetype (allocated once, shared across all zombies)
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

    // UV Flare Freeze state
    this.frozenTimer = 0;

    this.attackDistance = CONFIG.zombie.attackDistance * (this.archetype.scale >= 1.2 ? 1.4 : 1.0);
    this.attackCooldown = CONFIG.zombie.attackCooldown;
    this.attackTimer = 0;
    this.groanTimer = 3.0 + Math.random() * 5.0;
    this.walkTimer = Math.random() * 10;
    this.frameCounter = Math.floor(Math.random() * 2);

    // Build Natural PBR Rig scaled by Archetype using shared geometries & materials
    this.mesh = new THREE.Group();

    // Torso (Capsule) - ONLY body casts shadow
    this.bodyMesh = new THREE.Mesh(_bodyGeo, this.archetypeMats.body);
    this.bodyMesh.position.y = 1.05;
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.mesh.add(this.bodyMesh);

    // Head (Sphere)
    this.headMesh = new THREE.Mesh(_headGeo, this.archetypeMats.head);
    this.headMesh.position.y = 1.75;
    this.headMesh.castShadow = false; // Skip shadow pass for head to reduce draw calls
    this.headMesh.receiveShadow = true;
    this.mesh.add(this.headMesh);

    // Glowing Red Emissive Eyes (Spheres)
    const leftEye = new THREE.Mesh(_eyeGeo, _sharedMats.EYE);
    leftEye.position.set(-0.11, 1.78, 0.22);
    leftEye.castShadow = false;
    this.mesh.add(leftEye);

    const rightEye = new THREE.Mesh(_eyeGeo, _sharedMats.EYE);
    rightEye.position.set(0.11, 1.78, 0.22);
    rightEye.castShadow = false;
    this.mesh.add(rightEye);

    // Arms (Capsules)
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

    // Legs (Capsules)
    this.leftLeg = new THREE.Mesh(_legGeo, _sharedMats.PANTS);
    this.leftLeg.position.set(-0.20, 0.45, 0);
    this.leftLeg.castShadow = false;
    this.mesh.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(_legGeo, _sharedMats.PANTS);
    this.rightLeg.position.set(0.20, 0.45, 0);
    this.rightLeg.castShadow = false;
    this.mesh.add(this.rightLeg);

    // Apply Archetype Scale Factor
    const s = this.archetype.scale;
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
    this.bodyMesh.material = _sharedMats.FREEZE_BODY;
    this.headMesh.material = _sharedMats.FREEZE_HEAD;
  }

  startDawnFade() {
    if (this.isNightSpawn && !this.isDead) {
      this.isFading = true;
      // Clone materials only when fading out opacity
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
        this.bodyMesh.material = this.archetypeMats.body;
        this.headMesh.material = this.archetypeMats.head;
      }
      return;
    }

    const dx = player.mesh.position.x - this.mesh.position.x;
    const dz = player.mesh.position.z - this.mesh.position.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);

    // Requirement 9: Far (60+ unit) zombies skip mesh update and animation completely
    if (horizontalDist > 60) {
      return;
    }

    const currentSpeed = isNight ? this.archetype.nightSpeed : this.archetype.daySpeed;

    // Audio groan timer
    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      this.groanTimer = 4.0 + Math.random() * 5.0;
      if (this.sound && horizontalDist < CONFIG.zombie.soundHearingRadius) {
        const volume = Math.max(0, 1.0 - (horizontalDist / CONFIG.zombie.soundHearingRadius));
        this.sound.zombieGroan(volume);
      }
    }

    const agroRange = isNight ? CONFIG.zombie.agroRangeNight : CONFIG.zombie.agroRangeDay;

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

      // Face player
      this.mesh.rotation.y = Math.atan2(dirX, dirZ);

      // Frustum check: don't animate zombies outside camera frustum
      const inView = frustum ? frustum.containsPoint(this.mesh.position) : true;
      if (inView) {
        this.walkTimer += dt * 8;
        const swing = Math.sin(this.walkTimer) * 0.45;
        this.leftLeg.rotation.x = swing;
        this.rightLeg.rotation.x = -swing;
        this.leftArm.rotation.x = -Math.PI / 2 + swing * 0.4;
        this.rightArm.rotation.x = -Math.PI / 2 - swing * 0.4;
      }
    } else {
      // Idle reset
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
    }

    // Attack Player Logic
    if (horizontalDist <= this.attackDistance) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = this.attackCooldown;
        player.takeDamage(this.damage, this.mesh.position);
        if (this.sound) this.sound.zombieAttack();
      }
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

    this.headMesh.material = _sharedMats.FLASH_HEAD;
    setTimeout(() => {
      if (this.headMesh && !this.isDead) {
        this.headMesh.material = this.frozenTimer > 0 ? _sharedMats.FREEZE_HEAD : this.archetypeMats.head;
      }
    }, 80);

    if (this.health <= 0 && !this.isDead) {
      this.die();
    }
  }

  die() {
    this.isDead = true;
    if (this.sound) this.sound.zombieDeath();
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.2;
    events.emit('zombieKilled', this);
  }

  destroy() {
    if (this.isRemoved) return;
    this.isRemoved = true;

    // Unsubscribe from global event bus
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
