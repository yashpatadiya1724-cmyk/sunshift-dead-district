import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.shake = 0;

    // Particle Object Pool (Reusing 60 pooled meshes to eliminate runtime allocations)
    this.particlePool = [];
    this.activeParticles = [];
    this.poolSize = 60;

    const pGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    for (let i = 0; i < this.poolSize; i++) {
      const mesh = new THREE.Mesh(pGeo, pMat.clone());
      mesh.visible = false;
      this.scene.add(mesh);
      this.particlePool.push({
        mesh: mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0.6
      });
    }

    // Muzzle Flash
    this.muzzleLight = new THREE.PointLight(0xffaa22, 0, 10);
    this.scene.add(this.muzzleLight);

    const flashGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    this.flashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.flashMesh.visible = false;
    this.scene.add(this.flashMesh);
  }

  addShake(amount) {
    this.shake = Math.min(this.shake + amount, 0.6);
  }

  getShakeOffset(dt) {
    this.shake = Math.max(0, this.shake - dt * 1.5);
    return {
      x: (Math.random() - 0.5) * this.shake,
      y: (Math.random() - 0.5) * this.shake
    };
  }

  spawnMuzzleFlash(position, forward) {
    const flashPos = position.clone().addScaledVector(forward, 0.8);
    flashPos.y += 1.0;

    this.muzzleLight.position.copy(flashPos);
    this.muzzleLight.intensity = 4.0;

    this.flashMesh.position.copy(flashPos);
    this.flashMesh.visible = true;

    setTimeout(() => {
      this.muzzleLight.intensity = 0;
      this.flashMesh.visible = false;
    }, 50);
  }

  // Pooled Blood Splatter
  spawnBlood(point) {
    this.spawnPooledParticles(point, 0xaa0505, 10, 0.6, 4.0);
  }

  // Pooled Wall Sparks
  spawnSpark(point) {
    this.spawnPooledParticles(point, 0xffd700, 6, 0.35, 5.0);
  }

  spawnPooledParticles(point, hexColor, count, life, speed) {
    for (let i = 0; i < count; i++) {
      if (this.particlePool.length === 0) break;

      const p = this.particlePool.pop();
      p.mesh.position.copy(point);
      p.mesh.material.color.setHex(hexColor);
      p.mesh.visible = true;
      p.life = life;
      p.maxLife = life;

      p.velocity.set(
        (Math.random() - 0.5) * speed,
        Math.random() * speed + 1,
        (Math.random() - 0.5) * speed
      );

      this.activeParticles.push(p);
    }
  }

  update(dt) {
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= 16 * dt; // Gravity

      if (p.life <= 0) {
        p.mesh.visible = false;
        this.activeParticles.splice(i, 1);
        this.particlePool.push(p);
      }
    }
  }

  flashDamage() {
    const flashEl = document.getElementById('damage-flash');
    if (!flashEl) return;
    flashEl.style.opacity = '0.4';
    setTimeout(() => {
      flashEl.style.opacity = '0';
    }, 150);
  }

  // Countdown warning pulse: 0.18 opacity for 200ms (red if night incoming, white if day incoming)
  pulseWarning(isNextNight = true) {
    const flashEl = document.getElementById('shift-flash');
    if (!flashEl) return;
    flashEl.style.background = isNextNight ? '#ff2222' : '#ffffff';
    flashEl.style.opacity = '0.18';
    setTimeout(() => {
      flashEl.style.opacity = '0';
    }, 200);
  }

  // Shift Flash on phase change
  flashShift(isNight) {
    const flashEl = document.getElementById('shift-flash');
    if (!flashEl) return;
    flashEl.style.background = isNight ? '#ff2222' : '#ffffff';
    flashEl.style.opacity = '0.65';
    setTimeout(() => {
      flashEl.style.opacity = '0';
    }, 350);
  }

  setLowHealthEffect(active) {
    const el = document.getElementById('low-hp-desaturate');
    if (el) el.style.opacity = active ? '1' : '0';
  }

  showBanner(text, color) {
    const bannerEl = document.getElementById('banner');
    if (!bannerEl) return;
    bannerEl.innerText = text;
    bannerEl.style.color = color;
    bannerEl.style.opacity = '1';

    setTimeout(() => {
      bannerEl.style.opacity = '0';
    }, 2000);
  }
}
