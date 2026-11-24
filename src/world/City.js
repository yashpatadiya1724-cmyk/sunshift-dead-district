import * as THREE from 'three';
import { assets } from '../core/Assets.js';

export class City {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.rayTargets = [];
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
    const dummy = new THREE.Object3D();

    // 1. Asphalt Ground (Single Draw Call)
    const groundGeo = new THREE.PlaneGeometry(260, 260);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1b1c1e,
      roughness: 0.85,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 2. Yellow Dashed Road Lines (InstancedMesh - 1 Draw Call)
    const roadLineMat = new THREE.MeshBasicMaterial({ color: 0xe0b020 });
    const lineGeo = new THREE.PlaneGeometry(6, 0.4);
    lineGeo.rotateX(-Math.PI / 2);

    const linePositions = [];
    for (let i = -110; i <= 110; i += 12) {
      linePositions.push({ x: i, y: 0.02, z: 0, rotY: 0 });
      linePositions.push({ x: 0, y: 0.02, z: i, rotY: Math.PI / 2 });
    }

    const linesInstanced = new THREE.InstancedMesh(lineGeo, roadLineMat, linePositions.length);
    linePositions.forEach((pos, idx) => {
      dummy.position.set(pos.x, pos.y, pos.z);
      dummy.rotation.set(0, pos.rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      linesInstanced.setMatrixAt(idx, dummy.matrix);
    });
    linesInstanced.instanceMatrix.needsUpdate = true;
    this.scene.add(linesInstanced);

    // 3. Grid Coordinates Calculation
    const blockSize = 14;
    const halfCity = 60;
    const buildingCoords = [];

    for (let x = -halfCity; x <= halfCity; x += 22) {
      for (let z = -halfCity; z <= halfCity; z += 22) {
        if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;
        const isTypeB = (Math.abs(x + z) % 4 === 0);
        const height = isTypeB ? 24 : 16;
        buildingCoords.push({ x, z, height, isTypeB });
      }
    }

    const count = buildingCoords.length;

    // 4. Instanced Sidewalk Bases (1 Draw Call)
    const swGeo = new THREE.BoxGeometry(blockSize + 3.5, 0.25, blockSize + 3.5);
    const swMat = new THREE.MeshStandardMaterial({ color: 0x44484d, roughness: 0.8, metalness: 0.1 });
    const swInstanced = new THREE.InstancedMesh(swGeo, swMat, count);
    swInstanced.receiveShadow = true;

    // 5. Instanced Buildings Type A & B (2 Draw Calls)
    const typeACoords = buildingCoords.filter(b => !b.isTypeB);
    const typeBCoords = buildingCoords.filter(b => b.isTypeB);

    const bMatA = new THREE.MeshStandardMaterial({
      color: 0x3c4048,
      roughness: 0.7,
      metalness: 0.15,
      emissiveMap: this.windowTexture,
      emissive: new THREE.Color(0xffe082),
      emissiveIntensity: 0.2
    });
    this.windowMaterials.push(bMatA);

    const bMatB = new THREE.MeshStandardMaterial({
      color: 0x223344,
      roughness: 0.65,
      metalness: 0.25,
      emissiveMap: this.windowTexture,
      emissive: new THREE.Color(0x6ec6ff),
      emissiveIntensity: 0.2
    });
    this.windowMaterials.push(bMatB);

    const bGeoA = new THREE.BoxGeometry(blockSize, 16, blockSize);
    const bGeoB = new THREE.BoxGeometry(blockSize, 24, blockSize);

    const instancedA = new THREE.InstancedMesh(bGeoA, bMatA, typeACoords.length);
    instancedA.castShadow = true;
    instancedA.receiveShadow = true;

    const instancedB = new THREE.InstancedMesh(bGeoB, bMatB, typeBCoords.length);
    instancedB.castShadow = true;
    instancedB.receiveShadow = true;

    // 6. Instanced Rooftop AC Units (1 Draw Call)
    const acGeo = new THREE.BoxGeometry(2.4, 1.4, 2.4);
    const acMat = new THREE.MeshStandardMaterial({ color: 0x666b73, roughness: 0.6, metalness: 0.3 });
    const acInstanced = new THREE.InstancedMesh(acGeo, acMat, count);
    acInstanced.castShadow = true;

    // Populate Transforms & Colliders
    buildingCoords.forEach((b, idx) => {
      // Sidewalk transform
      dummy.position.set(b.x, 0.125, b.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      swInstanced.setMatrixAt(idx, dummy.matrix);

      // Rooftop AC transform
      dummy.position.set(b.x - 2, b.height + 0.7, b.z - 2);
      dummy.updateMatrix();
      acInstanced.setMatrixAt(idx, dummy.matrix);

      // Physical Collider Box3
      const halfB = blockSize / 2;
      const box = new THREE.Box3(
        new THREE.Vector3(b.x - halfB, 0, b.z - halfB),
        new THREE.Vector3(b.x + halfB, b.height, b.z + halfB)
      );
      this.colliders.push(box);
    });

    typeACoords.forEach((b, idx) => {
      dummy.position.set(b.x, 8.25, b.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      instancedA.setMatrixAt(idx, dummy.matrix);
    });

    typeBCoords.forEach((b, idx) => {
      dummy.position.set(b.x, 12.25, b.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      instancedB.setMatrixAt(idx, dummy.matrix);
    });

    swInstanced.instanceMatrix.needsUpdate = true;
    instancedA.instanceMatrix.needsUpdate = true;
    instancedB.instanceMatrix.needsUpdate = true;
    acInstanced.instanceMatrix.needsUpdate = true;

    this.scene.add(swInstanced);
    this.scene.add(instancedA);
    this.scene.add(instancedB);
    this.scene.add(acInstanced);

    // 7. Streetlights (InstancedMesh - 2 Draw Calls: Poles & Lamps)
    this.createStreetlights();

    // 8. Abandoned Cars (InstancedMesh - 2 Draw Calls: Chassis & Cabins)
    this.createAbandonedCars();

    // 9. Barricades & Crates (InstancedMesh - 2 Draw Calls)
    this.createBarricadesAndCrates();
  }

  createStreetlights() {
    const coords = [-33, -11, 11, 33];
    const positions = [];

    coords.forEach(x => {
      coords.forEach(z => {
        if (Math.abs(x) < 14 && Math.abs(z) < 14) return;
        positions.push(new THREE.Vector3(x + 8.5, 0, z + 8.5));
      });
    });

    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 6, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.7, metalness: 0.4 });
    const poleInstanced = new THREE.InstancedMesh(poleGeo, poleMat, positions.length);
    poleInstanced.receiveShadow = true;

    const lampGeo = new THREE.BoxGeometry(0.6, 0.35, 0.6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffaa33, fog: false });
    const lampInstanced = new THREE.InstancedMesh(lampGeo, lampMat, positions.length);

    const dummy = new THREE.Object3D();
    positions.forEach((pos, idx) => {
      dummy.position.set(pos.x, 3, pos.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poleInstanced.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(pos.x, 6.0, pos.z);
      dummy.updateMatrix();
      lampInstanced.setMatrixAt(idx, dummy.matrix);

      this.streetlightPositions.push(new THREE.Vector3(pos.x, 5.8, pos.z));
    });

    poleInstanced.instanceMatrix.needsUpdate = true;
    lampInstanced.instanceMatrix.needsUpdate = true;

    this.scene.add(poleInstanced);
    this.scene.add(lampInstanced);

    // 6 dynamic point lights pooled for closest streetlights
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0xffaa33, 0, 16, 1.8);
      this.scene.add(pl);
      this.streetLightsPool.push(pl);
    }
  }

  createAbandonedCars() {
    const dummy = new THREE.Object3D();
    const count = 12;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x992222, roughness: 0.45, metalness: 0.4 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.3, metalness: 0.6 });

    const bodyGeo = new THREE.BoxGeometry(2.4, 0.75, 4.2);
    const cabinGeo = new THREE.BoxGeometry(2.1, 0.75, 2.3);

    const bodyInstanced = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    const cabinInstanced = new THREE.InstancedMesh(cabinGeo, cabinMat, count);
    bodyInstanced.castShadow = true;
    cabinInstanced.castShadow = true;

    for (let i = 0; i < count; i++) {
      const onXRoad = i % 2 === 0;
      const x = onXRoad ? (i - 6) * 16 : ((i % 4) - 1.5) * 22;
      const z = !onXRoad ? (i - 6) * 16 : ((i % 4) - 1.5) * 22;
      const rotY = (i * 1.3) % (Math.PI * 2);

      // Chassis transform
      dummy.position.set(x, 0.5, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bodyInstanced.setMatrixAt(i, dummy.matrix);

      // Cabin transform
      const cabinOffset = new THREE.Vector3(0, 0.65, -0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      dummy.position.set(x + cabinOffset.x, 0.5 + cabinOffset.y, z + cabinOffset.z);
      dummy.updateMatrix();
      cabinInstanced.setMatrixAt(i, dummy.matrix);

      // Add collision Box3
      this.colliders.push(new THREE.Box3(
        new THREE.Vector3(x - 1.4, 0, z - 2.2),
        new THREE.Vector3(x + 1.4, 1.8, z + 2.2)
      ));
    }

    bodyInstanced.instanceMatrix.needsUpdate = true;
    cabinInstanced.instanceMatrix.needsUpdate = true;

    this.scene.add(bodyInstanced);
    this.scene.add(cabinInstanced);
  }

  createBarricadesAndCrates() {
    const dummy = new THREE.Object3D();
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.85, metalness: 0.05 });
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x827d75, roughness: 0.75, metalness: 0.15 });

    const crateGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const barrierGeo = new THREE.BoxGeometry(3.5, 1.2, 0.6);

    const cratesInstanced = new THREE.InstancedMesh(crateGeo, crateMat, 8);
    const barriersInstanced = new THREE.InstancedMesh(barrierGeo, barrierMat, 7);
    cratesInstanced.receiveShadow = true;
    barriersInstanced.receiveShadow = true;

    let crateIdx = 0;
    let barrierIdx = 0;

    for (let i = 0; i < 15; i++) {
      const isCrate = i % 2 === 0;
      const angle = (i / 15) * Math.PI * 2;
      const dist = 18 + (i % 5) * 8;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const rotY = (i * 0.7) % Math.PI;

      dummy.position.set(x, isCrate ? 0.8 : 0.6, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();

      if (isCrate) {
        cratesInstanced.setMatrixAt(crateIdx++, dummy.matrix);
        this.colliders.push(new THREE.Box3(
          new THREE.Vector3(x - 0.9, 0, z - 0.9),
          new THREE.Vector3(x + 0.9, 1.7, z + 0.9)
        ));
      } else {
        barriersInstanced.setMatrixAt(barrierIdx++, dummy.matrix);
        this.colliders.push(new THREE.Box3(
          new THREE.Vector3(x - 1.8, 0, z - 0.4),
          new THREE.Vector3(x + 1.8, 1.3, z + 0.4)
        ));
      }
    }

    cratesInstanced.instanceMatrix.needsUpdate = true;
    barriersInstanced.instanceMatrix.needsUpdate = true;

    this.scene.add(cratesInstanced);
    this.scene.add(barriersInstanced);
  }

  updateStreetlights(playerPos) {
    if (!playerPos || this.streetlightPositions.length === 0) return;

    const sorted = [...this.streetlightPositions].sort((a, b) => {
      return a.distanceToSquared(playerPos) - b.distanceToSquared(playerPos);
    });

    for (let i = 0; i < this.streetLightsPool.length; i++) {
      if (i < sorted.length) {
        this.streetLightsPool[i].position.copy(sorted[i]);
      }
    }
  }

  isInsideBuilding(x, z, padding = 1.0) {
    for (let i = 0; i < this.colliders.length; i++) {
      const box = this.colliders[i];
      if (
        x >= box.min.x - padding && x <= box.max.x + padding &&
        z >= box.min.z - padding && z <= box.max.z + padding
      ) {
        return true;
      }
    }
    return false;
  }

  setWindowGlow(intensity, lerpFactor) {
    this.windowMaterials.forEach(mat => {
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, intensity, lerpFactor);
    });
  }
}
