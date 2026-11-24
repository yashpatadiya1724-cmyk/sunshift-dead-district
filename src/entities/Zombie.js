import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { events } from '../core/Events.js';
import { assets } from '../core/Assets.js';

const _tempTestPos = new THREE.Vector3();

export class Zombie {
  constructor(scene, position, sound, archetype = null, isNightSpawn = false) {
    this.scene = scene;
    this.sound = sound;
    this.isNightSpawn = isNightSpawn;
    this.isFading = false;
    this.fadeAlpha = 1.0;
    this.isRemoved = false;

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

    // 1. Instance Rig via SkeletonUtils.clone in Assets
    const zombieInstance = assets.getInstance('zombie');
    if (zombieInstance) {
      this.mesh = zombieInstance;
      this.leftArm = this.mesh.getObjectByName('leftArm');
      this.rightArm = this.mesh.getObjectByName('rightArm');
      this.leftLeg = this.mesh.getObjectByName('leftLeg');
      this.rightLeg = this.mesh.getObjectByName('rightLeg');
    } else {
      this.mesh = new THREE.Group();
      this.buildDefaultRig();
    }

    // 2. Setup AnimationMixer & Clip Mapping
    this.mixer = null;
    this.actions = {};
    const rawClips = assets.animations.get('zombie') || [];
    if (rawClips.length > 0) {
      this.mixer = new THREE.AnimationMixer(this.mesh);
      const clipNames = rawClips.map(c => c.name);
      console.info(`[Zombie ${this.archetype.name}] Animation clips:`, clipNames);

      // Map clips to canonical names: idle, walk, run, attack, death
      const findClip = (pattern, fallbackIdx) => {
        return rawClips.find(c => pattern.test(c.name)) || rawClips[fallbackIdx % rawClips.length];
      };

      const idleClip = findClip(/idle/i, 0);
      const walkClip = findClip(/walk/i, 1);
      const runClip = findClip(/run/i, 2);
      const attackClip = findClip(/attack|hit|strike|punch/i, 3);
      const deathClip = findClip(/death|die|fall/i, 4);

      if (idleClip) this.actions.idle = this.mixer.clipAction(idleClip);
      if (walkClip) this.actions.walk = this.mixer.clipAction(walkClip);
      if (runClip) this.actions.run = this.mixer.clipAction(runClip);
      if (attackClip) this.actions.attack = this.mixer.clipAction(attackClip);
      if (deathClip) {
        this.actions.death = this.mixer.clipAction(deathClip);
        this.actions.death.clampWhenFinished = true;
        this.actions.death.loop = THREE.LoopOnce;
      }

      if (this.actions.walk) this.actions.walk.play();
    }

    // 3. Archetype Scaling & Color Tinting
    const s = this.archetype.scale;
    this.mesh.scale.set(s, s, s);

    this.mesh.traverse((node) => {
      if (node.isMesh && node.material) {
        node.material = node.material.clone();
        node.castShadow = (node.position.y < 1.4 && node.position.y > 0.8);
        node.receiveShadow = true;

        if (node.name.includes('head') || node.geometry?.type === 'BoxGeometry' && node.position.y > 1.5) {
          node.material.color = new THREE.Color(this.archetype.headColor);
          this.headMat = node.material;
        } else if (!node.name.includes('Eye')) {
          node.material.color = new THREE.Color(this.archetype.color);
          this.bodyMat = node.material;
        }
      }
    });

    if (!this.headMat) {
      this.headMat = new THREE.MeshStandardMaterial({ color: this.archetype.headColor });
    }
    if (!this.bodyMat) {
      this.bodyMat = new THREE.MeshStandardMaterial({ color: this.archetype.color });
    }

    this.mesh.position.copy(position);
    this.scene.add(this.mesh);

    // Listen for UV Flare Freeze
    this.unsubscribeFlare = events.on('flareTriggered', ({ position, radius, duration }) => {
      if (this.isDead) return;
      if (this.mesh.position.distanceTo(position) <= radius) {
        this.freeze(duration);
      }
    });
  }

  buildDefaultRig() {
    // Torso (Main shadow caster)
    const bodyGeo = new THREE.BoxGeometry(0.75, 1.05, 0.45);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: this.archetype.color,
      roughness: 0.75,
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
    this.headMat = new THREE.MeshStandardMaterial({
      color: this.archetype.headColor,
      roughness: 0.8,
      transparent: true,
      opacity: 1.0
    });
    const head = new THREE.Mesh(headGeo, this.headMat);
    head.position.y = 1.8;
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
    const armMat = new THREE.MeshStandardMaterial({
      color: this.archetype.color,
      roughness: 0.75,
      transparent: true,
      opacity: 1.0
    });
    const armGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);

    this.leftArm = new THREE.Mesh(armGeo, armMat);
    this.leftArm.position.set(-0.52, 1.25, 0.35);
    this.leftArm.rotation.x = -Math.PI / 2 + 0.1;
    this.mesh.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, armMat);
    this.rightArm.position.set(0.52, 1.25, 0.35);
    this.rightArm.rotation.x = -Math.PI / 2 - 0.1;
    this.mesh.add(this.rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.26, 0.9, 0.26);
    this.pantsMat = new THREE.MeshStandardMaterial({
      color: 0x1c2419,
      roughness: 0.85,
      transparent: true,
      opacity: 1.0
    });

    this.leftLeg = new THREE.Mesh(legGeo, this.pantsMat);
    this.leftLeg.position.set(-0.22, 0.45, 0);
    this.mesh.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, this.pantsMat);
    this.rightLeg.position.set(0.22, 0.45, 0);
    this.mesh.add(this.rightLeg);
  }

  freeze(duration) {
    this.frozenTimer = duration;
    if (this.bodyMat) this.bodyMat.color.setHex(0x0088ff);
    if (this.headMat) this.headMat.color.setHex(0x6ec6ff);
  }

  startDawnFade() {
    if (this.isNightSpawn && !this.isDead) {
      this.isFading = true;
    }
  }

  // Animation update throttled to frustum + 40 unit range
  updateAnimation(dt) {
    if (this.isDead || this.frozenTimer > 0) return;

    if (this.mixer) {
      this.mixer.update(dt);
    } else {
      // Procedural limb animation
      if (this.leftLeg && this.rightLeg) {
        const legSwing = Math.sin(this.walkTimer) * 0.55;
        this.leftLeg.rotation.x = legSwing;
        this.rightLeg.rotation.x = -legSwing;
      }
      if (this.leftArm && this.rightArm) {
        this.leftArm.rotation.z = Math.sin(this.walkTimer * 0.8) * 0.1;
        this.rightArm.rotation.z = -Math.sin(this.walkTimer * 0.8) * 0.1;
      }
    }
  }

  update(dt, player, isNight, cityColliders) {
    if (this.isDead || this.isRemoved) return;

    // Handle Dawn Fade-Out for extra night zombies
    if (this.isFading) {
      this.fadeAlpha -= dt * 0.7;
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
        if (this.bodyMat) this.bodyMat.color.setHex(this.archetype.color);
        if (this.headMat) this.headMat.color.setHex(this.archetype.headColor);
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

    const baseAgro = isNight ? CONFIG.zombie.agroRangeNight : CONFIG.zombie.agroRangeDay;
    const noise = (player && player.noise !== undefined) ? player.noise : (window.__SUNSHIFT_GAME__?.noise || 0);
    const agroRange = baseAgro * (1.0 + noise);

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
      this.walkTimer += dt * (isNight ? 8 : 4.5);
    } else if (horizontalDist <= this.attackDistance) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        player.takeDamage(this.damage, this.mesh.position);
        this.attackTimer = this.attackCooldown;
        if (this.sound && typeof this.sound.zombieAttack === 'function') {
          this.sound.zombieAttack();
        }
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

    if (this.headMat) {
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
    if (this.sound) this.sound.zombieDeath();

    if (this.actions.death) {
      if (this.actions.walk) this.actions.walk.stop();
      if (this.actions.run) this.actions.run.stop();
      this.actions.death.reset().play();
    } else {
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.2;
    }

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
