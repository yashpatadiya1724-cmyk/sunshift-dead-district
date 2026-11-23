import * as THREE from 'three';

export class City {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.meshes = [];
    this.windowMaterials = [];
    this.streetlightPositions = [];
    this.streetLightsPool = [];

    this.windowTexture = this.generateWindowTexture();
    this.buildCity();
  }

  generateWindowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#111116';
    ctx.fillRect(0, 0, 128, 128);

    // Glowing window squares
    for (let y = 8; y < 128; y += 18) {
      for (let x = 8; x < 128; x += 18) {
        if (Math.random() > 0.3) {
          ctx.fillStyle = Math.random() > 0.4 ? '#ffe494' : '#6ec6ff';
          ctx.fillRect(x, y, 10, 10);
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  buildCity() {
    // 1. Asphalt Ground
    const groundGeo = new THREE.PlaneGeometry(260, 260);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x1b1c1e });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 2. Yellow Dashed Road Lines
    const roadLineMat = new THREE.MeshBasicMaterial({ color: 0xe0b020 });
    for (let i = -110; i <= 110; i += 12) {
      const lineH = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.4), roadLineMat);
      lineH.rotation.x = -Math.PI / 2;
      lineH.position.set(i, 0.02, 0);
      this.scene.add(lineH);

      const lineV = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 6), roadLineMat);
      lineV.rotation.x = -Math.PI / 2;
      lineV.position.set(0, 0.02, i);
      this.scene.add(lineV);
    }

    // 3. Buildings with 4 color themes & sidewalks
    const buildingColors = [0x3c4048, 0x5a2d2d, 0x484237, 0x223344];
    const blockSize = 14;
    const halfCity = 60;
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x44484d });
    const acMat = new THREE.MeshLambertMaterial({ color: 0x666b73 });

    for (let x = -halfCity; x <= halfCity; x += 22) {
      for (let z = -halfCity; z <= halfCity; z += 22) {
        if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;

        // Sidewalk base
        const swMesh = new THREE.Mesh(new THREE.BoxGeometry(blockSize + 3.5, 0.25, blockSize + 3.5), sidewalkMat);
        swMesh.position.set(x, 0.12, z);
        swMesh.receiveShadow = true;
        this.scene.add(swMesh);

        // Building
        const height = 10 + Math.random() * 20;
        const color = buildingColors[Math.floor(Math.random() * buildingColors.length)];

        const texCopy = this.windowTexture.clone();
        texCopy.repeat.set(1.5, height / 5);
        texCopy.needsUpdate = true;

        const bMat = new THREE.MeshLambertMaterial({
          color: color,
          emissiveMap: texCopy,
          emissive: 0xffe082,
          emissiveIntensity: 0.2
        });
        this.windowMaterials.push(bMat);

        const bMesh = new THREE.Mesh(new THREE.BoxGeometry(blockSize, height, blockSize), bMat);
        bMesh.position.set(x, height / 2 + 0.25, z);
        bMesh.castShadow = true;
        bMesh.receiveShadow = true;
        this.scene.add(bMesh);

        this.meshes.push(bMesh);
        this.colliders.push(new THREE.Box3().setFromObject(bMesh));

        // Rooftop AC Unit
        const acMesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.2), acMat);
        acMesh.position.set(x + (Math.random() - 0.5) * 4, height + 0.85, z + (Math.random() - 0.5) * 4);
        acMesh.castShadow = true;
        this.scene.add(acMesh);
      }
    }

    // 4. Streetlights (Poles + Glowing Orange Lamps)
    this.createStreetlights();

    // 5. Abandoned Cars (12 vehicles)
    this.createAbandonedCars();

    // 6. Barricades and Crates (15 obstacles)
    this.createBarricadesAndCrates();
  }

  createStreetlights() {
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 6, 8);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x22252a });
    const lampGeo = new THREE.BoxGeometry(0.6, 0.35, 0.6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffaa33, fog: false });

    const coords = [-33, -11, 11, 33];
    coords.forEach(x => {
      coords.forEach(z => {
        if (Math.abs(x) < 14 && Math.abs(z) < 14) return;
        const group = new THREE.Group();
        group.position.set(x + 8.5, 0, z + 8.5);

        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 3;
        pole.castShadow = true;
        group.add(pole);

        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.y = 6.0;
        group.add(lamp);

        this.scene.add(group);
        this.streetlightPositions.push(new THREE.Vector3(x + 8.5, 5.8, z + 8.5));
      });
    });

    // 6 dynamic point lights pooled for the closest streetlights
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0xffaa33, 0, 16, 1.8);
      this.scene.add(pl);
      this.streetLightsPool.push(pl);
    }
  }

  createAbandonedCars() {
    const carColors = [0x992222, 0x224488, 0x777777, 0x335533];
    for (let i = 0; i < 12; i++) {
      const group = new THREE.Group();

      // Pick road locations
      const onXRoad = Math.random() > 0.5;
      const x = onXRoad ? (Math.random() - 0.5) * 110 : (Math.floor(Math.random() * 4) - 1.5) * 22;
      const z = !onXRoad ? (Math.random() - 0.5) * 110 : (Math.floor(Math.random() * 4) - 1.5) * 22;

      if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;

      group.position.set(x, 0, z);
      group.rotation.y = Math.random() * Math.PI * 2;

      const bodyMat = new THREE.MeshLambertMaterial({ color: carColors[i % carColors.length] });
      const cabinMat = new THREE.MeshLambertMaterial({ color: 0x11161d });

      // Chassis
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.75, 4.2), bodyMat);
      body.position.y = 0.5;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Cabin
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 2.3), cabinMat);
      cabin.position.set(0, 1.15, -0.2);
      cabin.castShadow = true;
      group.add(cabin);

      this.scene.add(group);
      this.meshes.push(body);
      this.colliders.push(new THREE.Box3().setFromObject(group));
    }
  }

  createBarricadesAndCrates() {
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    const barrierMat = new THREE.MeshLambertMaterial({ color: 0x827d75 });

    for (let i = 0; i < 15; i++) {
      const isCrate = i % 2 === 0;
      const mesh = new THREE.Mesh(
        isCrate ? new THREE.BoxGeometry(1.6, 1.6, 1.6) : new THREE.BoxGeometry(3.5, 1.2, 0.6),
        isCrate ? crateMat : barrierMat
      );

      const angle = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * 50;
      mesh.position.set(Math.cos(angle) * dist, isCrate ? 0.8 : 0.6, Math.sin(angle) * dist);
      mesh.rotation.y = Math.random() * Math.PI;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      this.scene.add(mesh);
      this.meshes.push(mesh);
      this.colliders.push(new THREE.Box3().setFromObject(mesh));
    }
  }

  updateStreetlights(playerPos) {
    // Sort streetlights by distance to player
    const sorted = [...this.streetlightPositions].sort(
      (a, b) => a.distanceToSquared(playerPos) - b.distanceToSquared(playerPos)
    );

    for (let i = 0; i < this.streetLightsPool.length; i++) {
      const light = this.streetLightsPool[i];
      if (sorted[i]) {
        light.position.copy(sorted[i]);
        light.intensity = 1.4;
      }
    }
  }

  setWindowGlow(targetGlow, k) {
    for (let i = 0; i < this.windowMaterials.length; i++) {
      this.windowMaterials[i].emissiveIntensity = THREE.MathUtils.lerp(
        this.windowMaterials[i].emissiveIntensity,
        targetGlow,
        k
      );
    }
  }

  isInsideBuilding(x, z, margin = 2) {
    for (const box of this.colliders) {
      if (
        x >= box.min.x - margin && x <= box.max.x + margin &&
        z >= box.min.z - margin && z <= box.max.z + margin
      ) {
        return true;
      }
    }
    return false;
  }
}
