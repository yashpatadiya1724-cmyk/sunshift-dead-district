import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { events } from '../core/Events.js';

export class PickupsManager {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;
    this.pickups = [];
    this.bobTimer = 0;

    // Shared geometries & materials
    this.boxGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    this.healthMat = new THREE.MeshLambertMaterial({ color: 0x00ff66 });
    this.ammoMat = new THREE.MeshLambertMaterial({ color: 0xffaa00 });
  }

  reset() {
    this.pickups.forEach(p => this.scene.remove(p.mesh));
    this.pickups = [];
  }

  spawnDrop(position) {
    // Check 20% drop probability
    if (Math.random() > CONFIG.pickups.dropChance) return;

    const isHealth = Math.random() > 0.5;
    const mesh = new THREE.Mesh(this.boxGeo, isHealth ? this.healthMat : this.ammoMat);
    mesh.position.copy(position);
    mesh.position.y = 0.5;
    mesh.castShadow = true;

    this.scene.add(mesh);
    this.pickups.push({
      mesh: mesh,
      isHealth: isHealth,
      life: CONFIG.pickups.lifetime
    });
  }

  update(dt, player) {
    this.bobTimer += dt * 3.0;
    const playerPos = player.mesh.position;

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;

      // Animate rotation and vertical bobbing
      p.mesh.rotation.y += dt * 2.0;
      p.mesh.position.y = 0.5 + Math.sin(this.bobTimer) * 0.15;

      // Check collection proximity
      const dist = p.mesh.position.distanceTo(playerPos);
      if (dist <= CONFIG.pickups.collectRadius) {
        if (p.isHealth) {
          player.heal(CONFIG.pickups.healthHealAmount);
          if (this.sound) this.sound.pickupCollect(true);
        } else {
          // Refill shotgun & rifle reserves
          player.refillAmmo('shotgun', CONFIG.pickups.ammoRefill.shotgun);
          player.refillAmmo('rifle', CONFIG.pickups.ammoRefill.rifle);
          if (this.sound) this.sound.pickupCollect(false);
        }

        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
        continue;
      }

      // Despawn after lifetime expires
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }
}
