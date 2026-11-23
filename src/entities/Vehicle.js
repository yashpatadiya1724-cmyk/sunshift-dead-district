import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { events } from '../core/Events.js';

export class Vehicle {
  constructor(scene, sound, effects) {
    this.scene = scene;
    this.sound = sound;
    this.effects = effects;

    this.isOccupied = false;
    this.speed = 0;
    this.yaw = 0;
    this.steerAngle = 0;
    this.health = CONFIG.vehicle.maxHealth;
    this.isDestroyed = false;
    this.respawnTimer = 0;

    // Build Low-Poly Muscle Car 3D Rig
    this.mesh = new THREE.Group();

    // 1. Muscle Car Body (Sleek aggressive red/black)
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x991111 });
    const chassisGeo = new THREE.BoxGeometry(2.3, 0.65, 4.4);
    this.chassis = new THREE.Mesh(chassisGeo, bodyMat);
    this.chassis.position.y = 0.55;
    this.chassis.castShadow = true;
    this.chassis.receiveShadow = true;
    this.mesh.add(this.chassis);

    // 2. Cabin & Windshield
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
    const cabinGeo = new THREE.BoxGeometry(1.95, 0.62, 2.3);
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.15, -0.3);
    cabin.castShadow = true;
    this.mesh.add(cabin);

    // 3. 4 Low-Poly Wheels
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const wheelGeo = new THREE.BoxGeometry(0.4, 0.7, 0.7);
    this.wheels = [];
    const wheelOffsets = [
      [-1.15, 0.35, 1.4],  // Front Left
      [1.15, 0.35, 1.4],   // Front Right
      [-1.15, 0.35, -1.4], // Rear Left
      [1.15, 0.35, -1.4]   // Rear Right
    ];
    wheelOffsets.forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, wy, wz);
      wheel.castShadow = true;
      this.mesh.add(wheel);
      this.wheels.push(wheel);
    });

    // 4. Emissive Headlights & SpotLights
    const lightGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffcc, fog: false });
    const lightGeo = new THREE.BoxGeometry(0.35, 0.18, 0.1);
    
    const leftLightMesh = new THREE.Mesh(lightGeo, lightGlowMat);
    leftLightMesh.position.set(-0.8, 0.65, 2.21);
    this.mesh.add(leftLightMesh);

    const rightLightMesh = new THREE.Mesh(lightGeo, lightGlowMat);
    rightLightMesh.position.set(0.8, 0.65, 2.21);
    this.mesh.add(rightLightMesh);

    // Forward SpotLights
    this.headlightSpot = new THREE.SpotLight(0xffffdd, 0, 45, Math.PI / 4.5, 0.4, 1.2);
    this.headlightSpot.position.set(0, 0.8, 2.3);
    this.headlightTarget = new THREE.Object3D();
    this.headlightTarget.position.set(0, 0.5, 25);
    this.mesh.add(this.headlightSpot);
    this.mesh.add(this.headlightTarget);
    this.headlightSpot.target = this.headlightTarget;

    // Initial Placement
    this.reset();
    this.scene.add(this.mesh);

    // Handle 'F' key enter/exit listener
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF') {
        this.toggleEntry();
      }
    });
  }

  reset() {
    this.isOccupied = false;
    this.speed = 0;
    this.yaw = 0;
    this.health = CONFIG.vehicle.maxHealth;
    this.isDestroyed = false;
    this.respawnTimer = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(CONFIG.vehicle.spawnPosition);
    this.mesh.rotation.set(0, 0, 0);
    this.headlightSpot.intensity = 0;
    if (this.sound) this.sound.stopEngine();
    events.emit('vehicleState', { inVehicle: false, speed: 0, health: this.health });
  }

  toggleEntry() {
    const player = window.__SUNSHIFT_GAME__?.player;
    if (!player || this.isDestroyed) return;

    if (!this.isOccupied) {
      // Check distance to car
      const dist = player.mesh.position.distanceTo(this.mesh.position);
      if (dist <= CONFIG.vehicle.enterRadius) {
        this.enter(player);
      }
    } else {
      this.exit(player);
    }
  }

  enter(player) {
    this.isOccupied = true;
    player.mesh.visible = false;
    if (this.sound) this.sound.startEngine();
    events.emit('vehicleState', { inVehicle: true, speed: this.speed, health: this.health });
  }

  exit(player) {
    this.isOccupied = false;
    player.mesh.visible = true;

    // Eject player slightly to the left of the car
    const sideOffset = new THREE.Vector3(-2.2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    player.mesh.position.copy(this.mesh.position).add(sideOffset);
    player.mesh.position.y = 0;

    if (this.sound) this.sound.stopEngine();
    events.emit('vehicleState', { inVehicle: false, speed: 0, health: this.health });
  }

  update(dt, input, cityColliders, zombies, isNight) {
    // Handle respawn timer if destroyed
    if (this.isDestroyed) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.reset();
      }
      return;
    }

    // Toggle headlights based on Night Shift
    this.headlightSpot.intensity = isNight ? 2.5 : 0;

    if (!this.isOccupied) {
      // Apply passive ground friction when empty
      if (Math.abs(this.speed) > 0.1) {
        this.speed -= Math.sign(this.speed) * CONFIG.vehicle.friction * dt;
        this.moveWithCollisions(dt, cityColliders);
      } else {
        this.speed = 0;
      }
      return;
    }

    // 1. Controls & Acceleration
    const isHandbraking = input.isKey('Space');

    if (input.isKey('KeyW')) {
      this.speed = Math.min(CONFIG.vehicle.maxSpeed, this.speed + CONFIG.vehicle.acceleration * dt);
    } else if (input.isKey('KeyS')) {
      if (this.speed > 0.5) {
        this.speed = Math.max(0, this.speed - CONFIG.vehicle.braking * dt);
      } else {
        this.speed = Math.max(CONFIG.vehicle.reverseSpeed, this.speed - CONFIG.vehicle.acceleration * 0.7 * dt);
      }
    } else {
      // Engine drag / coasting friction
      if (Math.abs(this.speed) > 0.1) {
        this.speed -= Math.sign(this.speed) * CONFIG.vehicle.friction * dt;
      } else {
        this.speed = 0;
      }
    }

    // Handbrake
    if (isHandbraking) {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, CONFIG.vehicle.handbrakeDecel * 0.05 * dt);
    }

    // 2. Steering based on speed ratio
    if (Math.abs(this.speed) > 0.2) {
      const steerDir = this.speed >= 0 ? 1 : -1;
      if (input.isKey('KeyA')) {
        this.yaw += CONFIG.vehicle.steerSpeed * steerDir * dt;
      }
      if (input.isKey('KeyD')) {
        this.yaw -= CONFIG.vehicle.steerSpeed * steerDir * dt;
      }
    }

    this.mesh.rotation.y = this.yaw;

    // 3. Movement & Collision with buildings
    this.moveWithCollisions(dt, cityColliders);

    // 4. Zombie Roadkill Check
    this.checkZombieRoadkill(zombies);

    // 5. Sound & Engine Pitch
    if (this.sound) {
      const speedRatio = Math.abs(this.speed) / CONFIG.vehicle.maxSpeed;
      this.sound.updateEngine(speedRatio);
    }

    // 6. Emit state for HUD
    events.emit('vehicleState', {
      inVehicle: true,
      speed: Math.abs(Math.round(this.speed * 3.6)), // km/h
      health: this.health
    });
  }

  moveWithCollisions(dt, colliders) {
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const step = forward.multiplyScalar(this.speed * dt);

    // Check X axis
    const testPosX = this.mesh.position.clone();
    testPosX.x += step.x;
    if (!this.checkCarCollision(testPosX, colliders)) {
      this.mesh.position.x = testPosX.x;
    } else {
      this.onBuildingCrash(Math.abs(this.speed));
      this.speed *= -0.3; // Bounce back
    }

    // Check Z axis
    const testPosZ = this.mesh.position.clone();
    testPosZ.z += step.z;
    if (!this.checkCarCollision(testPosZ, colliders)) {
      this.mesh.position.z = testPosZ.z;
    } else {
      this.onBuildingCrash(Math.abs(this.speed));
      this.speed *= -0.3; // Bounce back
    }
  }

  checkCarCollision(pos, colliders) {
    const radius = 1.6;
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

  onBuildingCrash(impactSpeed) {
    if (impactSpeed > 6.0) {
      const damage = Math.round(impactSpeed * 1.5);
      this.health = Math.max(0, this.health - damage);
      if (this.effects) this.effects.addShake(0.2);

      if (this.health <= 0) {
        this.explode();
      }
    }
  }

  checkZombieRoadkill(zombies) {
    if (Math.abs(this.speed) < CONFIG.vehicle.roadkillMinSpeed) return;

    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (z.isDead) continue;

      const dist = this.mesh.position.distanceTo(z.mesh.position);
      if (dist < 2.2) {
        z.takeDamage(999); // Instant crush
        if (this.effects) {
          this.effects.spawnBlood(z.mesh.position);
          this.effects.addShake(0.12);
        }
      }
    }
  }

  explode() {
    this.isDestroyed = true;
    this.mesh.visible = false;
    this.respawnTimer = CONFIG.vehicle.respawnDelay;

    if (this.sound) {
      this.sound.stopEngine();
      this.sound.carExplosion();
    }

    if (this.effects) {
      this.effects.spawnSpark(this.mesh.position);
      this.effects.spawnBlood(this.mesh.position);
      this.effects.addShake(0.6);
      this.effects.showBanner('VEHICLE DESTROYED!', '#ff2222');
    }

    // If player inside, eject and damage player
    const player = window.__SUNSHIFT_GAME__?.player;
    if (player && this.isOccupied) {
      this.exit(player);
      player.takeDamage(CONFIG.vehicle.ejectDamage);
    }
  }
}
