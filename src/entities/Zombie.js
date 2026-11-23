import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { events } from '../core/Events.js';

const _tempTestPos = new THREE.Vector3();

export class Zombie {
  constructor(scene, position, sound, archetype = null, isNightSpawn = false) {
    this.scene = scene;
    this.sound = sound;
    this.isNightSpawn = isNightSpawn;
    this.isFading = false;
    this.fadeAlpha = 1.0;

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

    // Build Stylized Rig scaled by Archetype
    this.mesh = new THREE.Group();

    // Torso
    const bodyGeo = new THREE.BoxGeometry(0.75, 1.05, 0.45);
    this.bodyMat = new THREE.MeshLambertMaterial({
      color: this.archetype.color,
      transparent: true,
      opacity: 1.0
    });
    const body = new THREE.Mesh(bodyGeo, this.bodyMat);
    body.position.y = 1.05;
    body.castShadow = true;
    body.receiveShadow = true;
    this.mesh.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.48, 0.48, 0.48);
    this.headMat = new THREE.MeshLambertMaterial({
      color: this.archetype.headColor,
      transparent: true,
      opacity: 1.0
    });
    const head = new THREE.Mesh(headGeo, this.headMat);
    head.position.y = 1.8;
    head.castShadow = true;
    this.mesh.add(head);

    // Glowing Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000, fog: false, transparent: true, opacity: 1.0 });
    const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.13, 1.85, 0.25);
    this.mesh.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.13, 1.85, 0.25);
    this.mesh.add(rightEye);

    // Arms
    this.limbMat = new THREE.MeshLambertMaterial({
      color: this.archetype.color,
      transparent: true,
      opacity: 1.0
    });
    const armGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);

    this.leftArm = new THREE.Mesh(armGeo, this.limbMat);
    this.leftArm.position.set(-0.52, 1.25, 0.35);
    this.leftArm.rotation.x = -Math.PI / 2 + 0.1;
    this.leftArm.castShadow = true;
    this.mesh.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, this.limbMat);
    this.rightArm.position.set(0.52, 1.25, 0.35);
    this.rightArm.rotation.x = -Math.PI / 2 - 0.1;
    this.rightArm.castShadow = true;
    this.mesh.add(this.rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.26, 0.9, 0.26);
    this.pantsMat = new THREE.MeshLambertMaterial({
      color: 0x1c2419,
      transparent: true,
      opacity: 1.0
    });

    this.leftLeg = new THREE.Mesh(legGeo, this.pantsMat);
    this.leftLeg.position.set(-0.22, 0.45, 0);
    this.leftLeg.castShadow = true;
    this.mesh.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, this.pantsMat);
    this.rightLeg.position.set(0.22, 0.45, 0);
    this.rightLeg.castShadow = true;
    this.mesh.add(this.rightLeg);

    // Apply Archetype Scale Factor (Runner = 0.82, Normal = 1.0, Brute = 1.45)
    const s = this.archetype.scale;
    this.mesh.scale.set(s, s, s);

    this.mesh.position.copy(position);
    this.scene.add(this.mesh);

    // Listen for UV Flare Freeze shockwave with Unsubscribe handle
    this.unsubscribeFlare = events.on('flareTriggered', ({ position, radius, duration }) => {
      if (this.isDead) return;
      if (this.mesh.position.distanceTo(position) <= radius) {
        this.freeze(duration);
      }
    });
  }

  freeze(duration) {
    this.frozenTimer = duration;
    this.bodyMat.color.setHex(0x0088ff);
    this.headMat.color.setHex(0x6ec6ff);
  }

  startDawnFade() {
    if (this.isNightSpawn && !this.isDead) {
      this.isFading = true;
    }
  }

  update(dt, player, isNight, cityColliders) {
    if (this.isDead) return;

    // Handle Dawn Fade-Out for extra night zombies
    if (this.isFading) {
      this.fadeAlpha -= dt * 0.7; // Fade over ~1.4 seconds
      this.mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.opacity = Math.max(0, this.fadeAlpha);
        }
      });
      if (this.fadeAlpha <= 0) {
        this.destroy();
        return;
      }
    }

    // Handle UV Flare Freeze Duration
    if (this.frozenTimer > 0) {
      this.frozenTimer -= dt;
      if (this.frozenTimer <= 0) {
        this.bodyMat.color.setHex(this.archetype.color);
        this.headMat.color.setHex(this.archetype.headColor);
      }
      return;
    }

    const dx = player.mesh.position.x - this.mesh.position.x;
    const dz = player.mesh.position.z - this.mesh.position.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);

    // Distance LOD Optimization (>60m updates on alternate frames)
    this.frameCounter++;
    if (horizontalDist > 60 && this.frameCounter % 2 !== 0) {
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
      let dirX = dx / horizontalDist;
      let dirZ = dz / horizontalDist;

      let stepX = dirX * currentSpeed * dt;
      let stepZ = dirZ * currentSpeed * dt;

      let movedX = false;
      let movedZ = false;

      // Test X movement
      _tempTestPos.copy(this.mesh.position);
      _tempTestPos.x += stepX;
      if (!this.checkCollisions(_tempTestPos, cityColliders)) {
        this.mesh.position.x = _tempTestPos.x;
        movedX = true;
      }

      // Test Z movement
      _tempTestPos.copy(this.mesh.position);
      _tempTestPos.z += stepZ;
      if (!this.checkCollisions(_tempTestPos, cityColliders)) {
        this.mesh.position.z = _tempTestPos.z;
        movedZ = true;
      }

      // Corner Avoidance: Tangent side-stepping around building edges
      if (!movedX && movedZ) {
        _tempTestPos.copy(this.mesh.position);
        _tempTestPos.z += (dirZ >= 0 ? 1 : -1) * currentSpeed * 0.6 * dt;
        if (!this.checkCollisions(_tempTestPos, cityColliders)) {
          this.mesh.position.z = _tempTestPos.z;
        }
      } else if (!movedZ && movedX) {
        _tempTestPos.copy(this.mesh.position);
        _tempTestPos.x += (dirX >= 0 ? 1 : -1) * currentSpeed * 0.6 * dt;
        if (!this.checkCollisions(_tempTestPos, cityColliders)) {
          this.mesh.position.x = _tempTestPos.x;
        }
      }

      this.mesh.lookAt(player.mesh.position.x, this.mesh.position.y, player.mesh.position.z);

      // Walk cycle animation
      this.walkTimer += dt * (isNight ? 8 : 4.5);
      const legSwing = Math.sin(this.walkTimer) * 0.55;
      this.leftLeg.rotation.x = legSwing;
      this.rightLeg.rotation.x = -legSwing;
      this.mesh.rotation.z = Math.sin(this.walkTimer * 0.5) * 0.08;
    } else if (horizontalDist <= this.attackDistance) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        player.takeDamage(this.damage, this.mesh.position);
        this.attackTimer = this.attackCooldown;
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

    this.headMat.color.setHex(0xffffff);
    setTimeout(() => {
      if (this.headMat && !this.isDead) {
        this.headMat.color.setHex(this.archetype.headColor);
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
    // Unsubscribe from global event bus
    if (this.unsubscribeFlare) {
      this.unsubscribeFlare();
      this.unsubscribeFlare = null;
    }

    this.scene.remove(this.mesh);
    this.mesh.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      }
    });
  }
}
