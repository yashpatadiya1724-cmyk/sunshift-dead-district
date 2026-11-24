import * as THREE from 'three';
import { ProceduralTextures } from './ProceduralTextures.js';

export class City {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.colliders = [];
    this.meshes = [];
    this.windowMaterials = [];
    this.lightCones = [];
    this.streetlightPositions = [];
    this.streetLightsPool = [];

    this.procTextures = new ProceduralTextures(renderer);
    this.buildCity();
  }

  buildCity() {
    // 1. Asphalt Ground with PBR Texture
    const asphalt = this.procTextures.getAsphaltTextures();
    asphalt.map.repeat.set(18, 18);
    asphalt.roughnessMap.repeat.set(18, 18);

    const groundGeo = new THREE.PlaneGeometry(260, 260);
    this.groundMat = new THREE.MeshStandardMaterial({
      map: asphalt.map,
      roughnessMap: asphalt.roughnessMap,
      roughness: 0.85,
      metalness: 0.08,
      color: 0xcccccc
    });
    const ground = new THREE.Mesh(groundGeo, this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 2. Yellow Dashed Road Lines
    const roadLineMat = new THREE.MeshStandardMaterial({
      color: 0xe0b020,
      roughness: 0.6,
      metalness: 0.1
    });
    for (let i = -110; i <= 110; i += 12) {
      const lineH = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.45), roadLineMat);
      lineH.rotation.x = -Math.PI / 2;
      lineH.position.set(i, 0.02, 0);
      lineH.receiveShadow = true;
      this.scene.add(lineH);

      const lineV = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 6), roadLineMat);
      lineV.rotation.x = -Math.PI / 2;
      lineV.position.set(0, 0.02, i);
      lineV.receiveShadow = true;
      this.scene.add(lineV);
    }

    // 3. Sidewalks and Buildings with PBR Textures
    const sidewalk = this.procTextures.getSidewalkTextures();
    sidewalk.map.repeat.set(2, 2);
    sidewalk.roughnessMap.repeat.set(2, 2);

    const sidewalkMat = new THREE.MeshStandardMaterial({
      map: sidewalk.map,
      roughnessMap: sidewalk.roughnessMap,
      roughness: 0.72,
      metalness: 0.1,
      color: 0xbbbbbb
    });

    const brick = this.procTextures.getBrickTextures();
    const concrete = this.procTextures.getConcreteTextures();
    const windows = this.procTextures.getWindowTextures();

    const blockSize = 14;
    const halfCity = 60;

    // Collect positions for InstancedMesh rooftop details
    const acTransforms = [];
    const tankTransforms = [];

    for (let x = -halfCity; x <= halfCity; x += 22) {
      for (let z = -halfCity; z <= halfCity; z += 22) {
        if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;

        // Sidewalk Base
        const swMesh = new THREE.Mesh(new THREE.BoxGeometry(blockSize + 3.5, 0.35, blockSize + 3.5), sidewalkMat);
        swMesh.position.set(x, 0.175, z);
        swMesh.receiveShadow = true;
        this.scene.add(swMesh);

        // Building
        const height = 12 + Math.random() * 22;
        const useBrick = Math.random() > 0.45;
        const baseTexture = useBrick ? brick : concrete;

        const texCopy = baseTexture.map.clone();
        texCopy.repeat.set(2, Math.max(1, height / 8));
        texCopy.needsUpdate = true;

        const roughCopy = baseTexture.roughnessMap.clone();
        roughCopy.repeat.set(2, Math.max(1, height / 8));
        roughCopy.needsUpdate = true;

        const winTex = windows.emissiveMap.clone();
        winTex.repeat.set(1.5, Math.max(1, height / 6));
        winTex.needsUpdate = true;

        const bMat = new THREE.MeshStandardMaterial({
          map: texCopy,
          roughnessMap: roughCopy,
          roughness: useBrick ? 0.75 : 0.80,
          metalness: 0.12,
          emissiveMap: winTex,
          emissive: 0xffcc44,
          emissiveIntensity: 0.15
        });
        this.windowMaterials.push(bMat);

        const bMesh = new THREE.Mesh(new THREE.BoxGeometry(blockSize, height, blockSize), bMat);
        bMesh.position.set(x, height / 2 + 0.35, z);
        bMesh.castShadow = true;
        bMesh.receiveShadow = true;
        this.scene.add(bMesh);

        this.meshes.push(bMesh);
        this.colliders.push(new THREE.Box3().setFromObject(bMesh));

        // Cornice / Roof Ledge Detail
        const ledgeMat = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.7, metalness: 0.2 });
        const ledge = new THREE.Mesh(new THREE.BoxGeometry(blockSize + 0.6, 0.5, blockSize + 0.6), ledgeMat);
        ledge.position.set(x, height + 0.35, z);
        ledge.castShadow = true;
        ledge.receiveShadow = true;
        this.scene.add(ledge);

        // Prepare Instanced Rooftop AC matrix
        const dummy = new THREE.Object3D();
        dummy.position.set(x + (Math.random() - 0.5) * 4, height + 1.15, z + (Math.random() - 0.5) * 4);
        dummy.rotation.y = (Math.floor(Math.random() * 4) * Math.PI) / 2;
        dummy.updateMatrix();
        acTransforms.push(dummy.matrix.clone());

        // Prepare Instanced Rooftop Water Tank matrix (50% buildings)
        if (Math.random() > 0.4) {
          dummy.position.set(x + (Math.random() - 0.5) * 3, height + 2.4, z + (Math.random() - 0.5) * 3);
          dummy.rotation.y = Math.random() * Math.PI;
          dummy.updateMatrix();
          tankTransforms.push(dummy.matrix.clone());
        }
      }
    }

    // 4. InstancedMesh for Rooftop AC Units (Draw call optimization)
    if (acTransforms.length > 0) {
      const acGeo = new THREE.BoxGeometry(2.2, 1.3, 2.2);
      const acMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.65, metalness: 0.4 });
      const acInstanced = new THREE.InstancedMesh(acGeo, acMat, acTransforms.length);
      acInstanced.castShadow = true;
      acInstanced.receiveShadow = true;
      for (let i = 0; i < acTransforms.length; i++) {
        acInstanced.setMatrixAt(i, acTransforms[i]);
      }
      acInstanced.instanceMatrix.needsUpdate = true;
      this.scene.add(acInstanced);
    }

    // 5. InstancedMesh for Rooftop Water Tanks
    if (tankTransforms.length > 0) {
      const tankGeo = new THREE.CylinderGeometry(1.4, 1.4, 2.6, 12);
      const tankMat = new THREE.MeshStandardMaterial({ color: 0x8a6242, roughness: 0.8, metalness: 0.1 });
      const tankInstanced = new THREE.InstancedMesh(tankGeo, tankMat, tankTransforms.length);
      tankInstanced.castShadow = true;
      tankInstanced.receiveShadow = true;
      for (let i = 0; i < tankTransforms.length; i++) {
        tankInstanced.setMatrixAt(i, tankTransforms[i]);
      }
      tankInstanced.instanceMatrix.needsUpdate = true;
      this.scene.add(tankInstanced);
    }

    // 6. Streetlights with Transparent Light-Cone Meshes
    this.createStreetlights();

    // 7. Abandoned Cars (PBR)
    this.createAbandonedCars();

    // 8. Barricades & Crates (PBR)
    this.createBarricadesAndCrates();
  }

  createStreetlights() {
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x24282f, roughness: 0.6, metalness: 0.7 });

    const lampGeo = new THREE.BoxGeometry(0.65, 0.35, 0.65);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffaa33,
      emissive: 0xffaa33,
      emissiveIntensity: 2.0,
      roughness: 0.3
    });

    // Transparent light-cone mesh underneath lamp
    const coneGeo = new THREE.CylinderGeometry(0.35, 3.4, 5.5, 16, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffaa33,
      transparent: true,
      opacity: 0.10,
      depthWrite: false,
      side: THREE.DoubleSide
    });

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

        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.y = 3.25;
        group.add(cone);
        this.lightCones.push(cone);

        this.scene.add(group);
        this.streetlightPositions.push(new THREE.Vector3(x + 8.5, 5.8, z + 8.5));
      });
    });

    // 6 dynamic point lights pooled for closest streetlights
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0xffaa33, 0, 16, 1.8);
      this.scene.add(pl);
      this.streetLightsPool.push(pl);
    }
  }

  createAbandonedCars() {
    const carColors = [0x992222, 0x224488, 0x666b73, 0x2d4f34];
    for (let i = 0; i < 12; i++) {
      const group = new THREE.Group();

      const onXRoad = Math.random() > 0.5;
      const x = onXRoad ? (Math.random() - 0.5) * 110 : (Math.floor(Math.random() * 4) - 1.5) * 22;
      const z = !onXRoad ? (Math.random() - 0.5) * 110 : (Math.floor(Math.random() * 4) - 1.5) * 22;

      if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;

      group.position.set(x, 0, z);
      group.rotation.y = Math.random() * Math.PI * 2;

      const bodyMat = new THREE.MeshStandardMaterial({
        color: carColors[i % carColors.length],
        roughness: 0.5,
        metalness: 0.7
      });
      const cabinMat = new THREE.MeshStandardMaterial({
        color: 0x14181f,
        roughness: 0.3,
        metalness: 0.9
      });

      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.75, 4.2), bodyMat);
      body.position.y = 0.5;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

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
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.85, metalness: 0.05 });
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x827d75, roughness: 0.75, metalness: 0.2 });

    for (let i = 0; i < 15; i++) {
      const angle = (i / 15) * Math.PI * 2;
      const dist = 20 + Math.random() * 40;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      if (this.isInsideBuilding(x, z, 3)) continue;

      const isCrate = i % 2 === 0;
      let mesh;

      if (isCrate) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), crateMat);
        mesh.position.set(x, 0.8, z);
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 0.7), barrierMat);
        mesh.position.set(x, 0.6, z);
        mesh.rotation.y = Math.random() * Math.PI;
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.meshes.push(mesh);
      this.colliders.push(new THREE.Box3().setFromObject(mesh));
    }
  }

  setWindowGlow(intensity, coneOpacity = 0.10) {
    this.windowMaterials.forEach(mat => {
      mat.emissiveIntensity = intensity;
    });
    this.lightCones.forEach(cone => {
      cone.material.opacity = coneOpacity;
    });
  }

  updateStreetlights(targetPos) {
    if (!targetPos) return;

    const sorted = [...this.streetlightPositions].sort((a, b) => {
      return a.distanceToSquared(targetPos) - b.distanceToSquared(targetPos);
    });

    for (let i = 0; i < this.streetLightsPool.length; i++) {
      if (i < sorted.length) {
        this.streetLightsPool[i].position.copy(sorted[i]);
        this.streetLightsPool[i].intensity = 3.5;
      }
    }
  }

  isInsideBuilding(x, z, margin = 1.0) {
    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      if (
        x > b.min.x - margin && x < b.max.x + margin &&
        z > b.min.z - margin && z < b.max.z + margin
      ) {
        return true;
      }
    }
    return false;
  }
}
