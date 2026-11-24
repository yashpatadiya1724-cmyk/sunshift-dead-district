import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ProceduralTextures } from './ProceduralTextures.js';
import { assets } from '../core/Assets.js';

export class City {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.colliders = [];
    this.meshes = [];
    this.rayTargets = []; // Simple invisible box proxies for raycasting (never merged)
    this.proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    this.windowMaterials = [];
    this.lightCones = [];
    this.streetlightPositions = [];
    this.streetLightsPool = [];
    this.lightConeInstanced = null;
    this._lastLightTargetPos = new THREE.Vector3(999, 999, 999);
    this._lightUpdateFrame = 0;

    this.procTextures = new ProceduralTextures(renderer);
    this.buildCity();
  }

  buildCity() {
    // 1. Asphalt Ground with PBR Texture (Single Mesh, static)
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
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    this.scene.add(ground);

    // 2. Yellow Dashed Road Lines (MERGED into 1 single BufferGeometry)
    const roadLineMat = new THREE.MeshStandardMaterial({
      color: 0xe0b020,
      roughness: 0.6,
      metalness: 0.1
    });

    const roadGeos = [];
    for (let i = -110; i <= 110; i += 12) {
      const gH = new THREE.PlaneGeometry(6, 0.45);
      gH.rotateX(-Math.PI / 2);
      gH.translate(i, 0.02, 0);
      roadGeos.push(gH);

      const gV = new THREE.PlaneGeometry(0.45, 6);
      gV.rotateX(-Math.PI / 2);
      gV.translate(0, 0.02, i);
      roadGeos.push(gV);
    }

    if (roadGeos.length > 0) {
      const mergedRoadGeo = BufferGeometryUtils.mergeGeometries(roadGeos, false);
      const roadLinesMesh = new THREE.Mesh(mergedRoadGeo, roadLineMat);
      roadLinesMesh.receiveShadow = true;
      roadLinesMesh.castShadow = false; // Never cast shadows on road lines
      roadLinesMesh.matrixAutoUpdate = false;
      roadLinesMesh.updateMatrix();
      this.scene.add(roadLinesMesh);
    }

    // 3. Sidewalks and Buildings
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

    // Prepare shared materials for Brick vs Concrete buildings with window emissive maps
    brick.map.repeat.set(2, 3);
    brick.roughnessMap.repeat.set(2, 3);
    windows.emissiveMap.repeat.set(1.5, 3);

    const brickBuildingMat = new THREE.MeshStandardMaterial({
      map: brick.map,
      roughnessMap: brick.roughnessMap,
      roughness: 0.75,
      metalness: 0.12,
      emissiveMap: windows.emissiveMap,
      emissive: 0xffcc44,
      emissiveIntensity: 0.15
    });
    this.windowMaterials.push(brickBuildingMat);

    concrete.map.repeat.set(2, 3);
    concrete.roughnessMap.repeat.set(2, 3);

    const concreteBuildingMat = new THREE.MeshStandardMaterial({
      map: concrete.map,
      roughnessMap: concrete.roughnessMap,
      roughness: 0.80,
      metalness: 0.12,
      emissiveMap: windows.emissiveMap,
      emissive: 0xffcc44,
      emissiveIntensity: 0.15
    });
    this.windowMaterials.push(concreteBuildingMat);

    const ledgeMat = new THREE.MeshStandardMaterial({
      color: 0x33373d,
      roughness: 0.7,
      metalness: 0.2
    });

    const blockSize = 14;
    const halfCity = 60;

    const sidewalkGeos = [];
    const brickGeos = [];
    const concreteGeos = [];
    const ledgeGeos = [];

    // Rooftop InstancedMesh matrices
    const acTransforms = [];
    const tankTransforms = [];

    for (let x = -halfCity; x <= halfCity; x += 22) {
      for (let z = -halfCity; z <= halfCity; z += 22) {
        if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;

        // Sidewalk Geometry (Merged)
        const swGeo = new THREE.BoxGeometry(blockSize + 3.5, 0.35, blockSize + 3.5);
        swGeo.translate(x, 0.175, z);
        sidewalkGeos.push(swGeo);

        // Building Dimensions
        const height = 12 + Math.random() * 22;
        const useBrick = Math.random() > 0.45;

        const bGeo = new THREE.BoxGeometry(blockSize, height, blockSize);
        bGeo.translate(x, height / 2 + 0.35, z);

        if (useBrick) {
          brickGeos.push(bGeo);
        } else {
          concreteGeos.push(bGeo);
        }

        // Store bounding box for physics collision
        const box = new THREE.Box3(
          new THREE.Vector3(x - blockSize / 2, 0, z - blockSize / 2),
          new THREE.Vector3(x + blockSize / 2, height + 0.35, z + blockSize / 2)
        );
        this.colliders.push(box);

        // Simple box proxy for bullet raycast & camera wall checks (12 triangles per building)
        const bProxy = new THREE.Mesh(new THREE.BoxGeometry(blockSize, height, blockSize), this.proxyMat);
        bProxy.position.set(x, height / 2 + 0.35, z);
        bProxy.updateMatrixWorld(true);
        bProxy.geometry.computeBoundingBox();
        this.rayTargets.push(bProxy);

        // Roof Ledge Geometry (Merged)
        const ledgeGeo = new THREE.BoxGeometry(blockSize + 0.6, 0.5, blockSize + 0.6);
        ledgeGeo.translate(x, height + 0.35, z);
        ledgeGeos.push(ledgeGeo);

        // Instanced Rooftop AC matrix
        const dummy = new THREE.Object3D();
        dummy.position.set(x + (Math.random() - 0.5) * 4, height + 1.15, z + (Math.random() - 0.5) * 4);
        dummy.rotation.y = (Math.floor(Math.random() * 4) * Math.PI) / 2;
        dummy.updateMatrix();
        acTransforms.push(dummy.matrix.clone());

        // Instanced Rooftop Water Tank (50% buildings)
        if (Math.random() > 0.4) {
          dummy.position.set(x + (Math.random() - 0.5) * 3, height + 2.4, z + (Math.random() - 0.5) * 3);
          dummy.rotation.y = Math.random() * Math.PI;
          dummy.updateMatrix();
          tankTransforms.push(dummy.matrix.clone());
        }
      }
    }

    // Merge Sidewalks -> 1 Mesh
    if (sidewalkGeos.length > 0) {
      const mergedSidewalkGeo = BufferGeometryUtils.mergeGeometries(sidewalkGeos, false);
      const swMesh = new THREE.Mesh(mergedSidewalkGeo, sidewalkMat);
      swMesh.receiveShadow = true;
      swMesh.castShadow = false;
      swMesh.matrixAutoUpdate = false;
      swMesh.updateMatrix();
      this.scene.add(swMesh);
    }

    // Merge Brick Buildings -> 1 Mesh
    if (brickGeos.length > 0) {
      const mergedBrickGeo = BufferGeometryUtils.mergeGeometries(brickGeos, false);
      const brickMesh = new THREE.Mesh(mergedBrickGeo, brickBuildingMat);
      brickMesh.castShadow = true;
      brickMesh.receiveShadow = true;
      brickMesh.matrixAutoUpdate = false;
      brickMesh.updateMatrix();
      this.scene.add(brickMesh);
    }

    // Merge Concrete Buildings -> 1 Mesh
    if (concreteGeos.length > 0) {
      const mergedConcreteGeo = BufferGeometryUtils.mergeGeometries(concreteGeos, false);
      const concreteMesh = new THREE.Mesh(mergedConcreteGeo, concreteBuildingMat);
      concreteMesh.castShadow = true;
      concreteMesh.receiveShadow = true;
      concreteMesh.matrixAutoUpdate = false;
      concreteMesh.updateMatrix();
      this.scene.add(concreteMesh);
    }

    // Merge Cornices / Roof Ledges -> 1 Mesh
    if (ledgeGeos.length > 0) {
      const mergedLedgeGeo = BufferGeometryUtils.mergeGeometries(ledgeGeos, false);
      const ledgeMesh = new THREE.Mesh(mergedLedgeGeo, ledgeMat);
      ledgeMesh.castShadow = true;
      ledgeMesh.receiveShadow = true;
      ledgeMesh.matrixAutoUpdate = false;
      ledgeMesh.updateMatrix();
      this.scene.add(ledgeMesh);
    }

    // 4. InstancedMesh for Rooftop AC Units
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
      acInstanced.matrixAutoUpdate = false;
      acInstanced.updateMatrix();
      this.scene.add(acInstanced);
    }

    // 5. InstancedMesh for Rooftop Water Tanks
    if (tankTransforms.length > 0) {
      const tankGeo = new THREE.CylinderGeometry(1.4, 1.4, 2.6, 10);
      const tankMat = new THREE.MeshStandardMaterial({ color: 0x8a6242, roughness: 0.8, metalness: 0.1 });
      const tankInstanced = new THREE.InstancedMesh(tankGeo, tankMat, tankTransforms.length);
      tankInstanced.castShadow = true;
      tankInstanced.receiveShadow = true;
      for (let i = 0; i < tankTransforms.length; i++) {
        tankInstanced.setMatrixAt(i, tankTransforms[i]);
      }
      tankInstanced.instanceMatrix.needsUpdate = true;
      tankInstanced.matrixAutoUpdate = false;
      tankInstanced.updateMatrix();
      this.scene.add(tankInstanced);
    }

    // 6. Streetlights with InstancedMeshes
    this.createStreetlights();

    // 7. Abandoned Cars (PBR, Merged by part)
    this.createAbandonedCars();

    // 8. Barricades & Crates (Merged)
    this.createBarricadesAndCrates();
  }

  createStreetlights() {
    const coords = [-33, -11, 11, 33];
    const poleTransforms = [];
    const lampTransforms = [];
    const coneTransforms = [];

    const dummy = new THREE.Object3D();

    coords.forEach(x => {
      coords.forEach(z => {
        if (Math.abs(x) < 14 && Math.abs(z) < 14) return;
        const posX = x + 8.5;
        const posZ = z + 8.5;

        // Pole
        dummy.position.set(posX, 3, posZ);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        poleTransforms.push(dummy.matrix.clone());

        // Lamp
        dummy.position.set(posX, 6.0, posZ);
        dummy.updateMatrix();
        lampTransforms.push(dummy.matrix.clone());

        // Light Cone
        dummy.position.set(posX, 3.25, posZ);
        dummy.updateMatrix();
        coneTransforms.push(dummy.matrix.clone());

        this.streetlightPositions.push(new THREE.Vector3(posX, 5.8, posZ));
      });
    });

    const count = poleTransforms.length;

    // 1. Instanced Poles
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x24282f, roughness: 0.6, metalness: 0.7 });
    const poleInstanced = new THREE.InstancedMesh(poleGeo, poleMat, count);
    poleInstanced.castShadow = false; // Poles are thin, skip shadow map
    for (let i = 0; i < count; i++) {
      poleInstanced.setMatrixAt(i, poleTransforms[i]);
    }
    poleInstanced.instanceMatrix.needsUpdate = true;
    poleInstanced.matrixAutoUpdate = false;
    poleInstanced.updateMatrix();
    this.scene.add(poleInstanced);

    // 2. Instanced Lamps
    const lampGeo = new THREE.BoxGeometry(0.65, 0.35, 0.65);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffaa33,
      emissive: 0xffaa33,
      emissiveIntensity: 2.0,
      roughness: 0.3
    });
    const lampInstanced = new THREE.InstancedMesh(lampGeo, lampMat, count);
    for (let i = 0; i < count; i++) {
      lampInstanced.setMatrixAt(i, lampTransforms[i]);
    }
    lampInstanced.instanceMatrix.needsUpdate = true;
    lampInstanced.matrixAutoUpdate = false;
    lampInstanced.updateMatrix();
    this.scene.add(lampInstanced);

    // 3. Instanced Transparent Light Cones
    const coneGeo = new THREE.CylinderGeometry(0.35, 3.4, 5.5, 12, 1, true);
    this.coneMat = new THREE.MeshBasicMaterial({
      color: 0xffaa33,
      transparent: true,
      opacity: 0.10,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.lightConeInstanced = new THREE.InstancedMesh(coneGeo, this.coneMat, count);
    for (let i = 0; i < count; i++) {
      this.lightConeInstanced.setMatrixAt(i, coneTransforms[i]);
    }
    this.lightConeInstanced.instanceMatrix.needsUpdate = true;
    this.lightConeInstanced.matrixAutoUpdate = false;
    this.lightConeInstanced.updateMatrix();
    this.scene.add(this.lightConeInstanced);

    // Dynamic point lights pool (Pre-allocated 6 in scene to prevent shader recompilation)
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0xffaa33, 0, 16, 1.8);
      this.scene.add(pl);
      this.streetLightsPool.push(pl);
    }
  }

  createAbandonedCars() {
    const bodyGeos = [];
    const cabinGeos = [];

    const dummy = new THREE.Object3D();

    for (let i = 0; i < 12; i++) {
      const onXRoad = Math.random() > 0.5;
      const x = onXRoad ? (Math.random() - 0.5) * 110 : (Math.floor(Math.random() * 4) - 1.5) * 22;
      const z = !onXRoad ? (Math.random() - 0.5) * 110 : (Math.floor(Math.random() * 4) - 1.5) * 22;

      if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;

      const rotY = Math.random() * Math.PI * 2;

      // Body Geometry
      const bGeo = new THREE.BoxGeometry(2.4, 0.75, 4.2);
      bGeo.translate(0, 0.5, 0);
      bGeo.rotateY(rotY);
      bGeo.translate(x, 0, z);
      bodyGeos.push(bGeo);

      // Cabin Geometry
      const cGeo = new THREE.BoxGeometry(2.1, 0.75, 2.3);
      cGeo.translate(0, 1.15, -0.2);
      cGeo.rotateY(rotY);
      cGeo.translate(x, 0, z);
      cabinGeos.push(cGeo);

      // Collider Box
      const box = new THREE.Box3(
        new THREE.Vector3(x - 1.8, 0, z - 1.8),
        new THREE.Vector3(x + 1.8, 1.8, z + 1.8)
      );
      this.colliders.push(box);

      // Simple box proxy for bullet & camera raycasting
      const carProxy = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 4.2), this.proxyMat);
      carProxy.position.set(x, 0.9, z);
      carProxy.rotation.y = rotY;
      carProxy.updateMatrixWorld(true);
      carProxy.geometry.computeBoundingBox();
      this.rayTargets.push(carProxy);
    }

    if (bodyGeos.length > 0) {
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x556677,
        roughness: 0.55,
        metalness: 0.6
      });
      const mergedBody = BufferGeometryUtils.mergeGeometries(bodyGeos, false);
      const carBodyMesh = new THREE.Mesh(mergedBody, bodyMat);
      carBodyMesh.castShadow = true;
      carBodyMesh.receiveShadow = true;
      carBodyMesh.matrixAutoUpdate = false;
      carBodyMesh.updateMatrix();
      this.scene.add(carBodyMesh);

      const cabinMat = new THREE.MeshStandardMaterial({
        color: 0x14181f,
        roughness: 0.3,
        metalness: 0.9
      });
      const mergedCabin = BufferGeometryUtils.mergeGeometries(cabinGeos, false);
      const carCabinMesh = new THREE.Mesh(mergedCabin, cabinMat);
      carCabinMesh.castShadow = true;
      carCabinMesh.matrixAutoUpdate = false;
      carCabinMesh.updateMatrix();
      this.scene.add(carCabinMesh);
    }
  }

  createBarricadesAndCrates() {
    const crateGeos = [];
    const barrierGeos = [];

    for (let i = 0; i < 15; i++) {
      const angle = (i / 15) * Math.PI * 2;
      const dist = 20 + Math.random() * 40;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      if (this.isInsideBuilding(x, z, 3)) continue;

      const isCrate = i % 2 === 0;
      if (isCrate) {
        const cGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
        cGeo.translate(x, 0.8, z);
        crateGeos.push(cGeo);

        this.colliders.push(new THREE.Box3(
          new THREE.Vector3(x - 0.9, 0, z - 0.9),
          new THREE.Vector3(x + 0.9, 1.7, z + 0.9)
        ));

        const cProxy = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), this.proxyMat);
        cProxy.position.set(x, 0.8, z);
        cProxy.updateMatrixWorld(true);
        cProxy.geometry.computeBoundingBox();
        this.rayTargets.push(cProxy);
      } else {
        const rotY = Math.random() * Math.PI;
        const bGeo = new THREE.BoxGeometry(3.5, 1.2, 0.7);
        bGeo.rotateY(rotY);
        bGeo.translate(x, 0.6, z);
        barrierGeos.push(bGeo);

        this.colliders.push(new THREE.Box3(
          new THREE.Vector3(x - 1.8, 0, z - 1.8),
          new THREE.Vector3(x + 1.8, 1.3, z + 1.8)
        ));

        const bProxy = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 0.7), this.proxyMat);
        bProxy.position.set(x, 0.6, z);
        bProxy.rotation.y = rotY;
        bProxy.updateMatrixWorld(true);
        bProxy.geometry.computeBoundingBox();
        this.rayTargets.push(bProxy);
      }
    }

    if (crateGeos.length > 0) {
      const crateMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.85, metalness: 0.05 });
      const mergedCrates = BufferGeometryUtils.mergeGeometries(crateGeos, false);
      const cratesMesh = new THREE.Mesh(mergedCrates, crateMat);
      cratesMesh.castShadow = true;
      cratesMesh.receiveShadow = true;
      cratesMesh.matrixAutoUpdate = false;
      cratesMesh.updateMatrix();
      this.scene.add(cratesMesh);
    }

    if (barrierGeos.length > 0) {
      const barrierMat = new THREE.MeshStandardMaterial({ color: 0x827d75, roughness: 0.75, metalness: 0.2 });
      const mergedBarriers = BufferGeometryUtils.mergeGeometries(barrierGeos, false);
      const barriersMesh = new THREE.Mesh(mergedBarriers, barrierMat);
      barriersMesh.castShadow = true;
      barriersMesh.receiveShadow = true;
      barriersMesh.matrixAutoUpdate = false;
      barriersMesh.updateMatrix();
      this.scene.add(barriersMesh);
    }
  }

  setWindowGlow(intensity, coneOpacity = 0.10) {
    this.windowMaterials.forEach(mat => {
      mat.emissiveIntensity = intensity;
    });
    if (this.coneMat) {
      this.coneMat.opacity = coneOpacity;
    }
  }

  setLightConesVisible(visible) {
    if (this.lightConeInstanced) {
      this.lightConeInstanced.visible = !!visible;
    }
  }

  updateStreetlights(targetPos, maxLights = 6) {
    if (!targetPos) return;

    if (maxLights <= 0) {
      for (let i = 0; i < this.streetLightsPool.length; i++) {
        this.streetLightsPool[i].intensity = 0;
      }
      return;
    }

    this._lightUpdateFrame++;
    const distSq = this._lastLightTargetPos.distanceToSquared(targetPos);
    if (distSq < 4.0 && this._lightUpdateFrame % 15 !== 0) {
      return;
    }
    this._lastLightTargetPos.copy(targetPos);

    if (!this._sortedLights) {
      this._sortedLights = this.streetlightPositions.slice();
    }
    this._sortedLights.sort((a, b) => {
      return a.distanceToSquared(targetPos) - b.distanceToSquared(targetPos);
    });

    for (let i = 0; i < this.streetLightsPool.length; i++) {
      if (i < maxLights && i < this._sortedLights.length) {
        this.streetLightsPool[i].position.copy(this._sortedLights[i]);
        this.streetLightsPool[i].intensity = 3.5;
      } else {
        this.streetLightsPool[i].intensity = 0;
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

  setWetAsphalt(isWet) {
    if (this.groundMat) {
      this.groundMat.roughness = isWet ? 0.18 : 0.85;
      this.groundMat.metalness = isWet ? 0.65 : 0.08;
      this.groundMat.needsUpdate = true;
    }
  }

  setAnisotropy(val) {
    const aniso = Math.min(val || 1, 16);
    if (this.groundMat?.map) {
      this.groundMat.map.anisotropy = aniso;
      this.groundMat.map.needsUpdate = true;
    }
    for (let i = 0; i < this.windowMaterials.length; i++) {
      const mat = this.windowMaterials[i];
      if (mat.map) {
        mat.map.anisotropy = aniso;
        mat.map.needsUpdate = true;
      }
      if (mat.emissiveMap) {
        mat.emissiveMap.anisotropy = aniso;
        mat.emissiveMap.needsUpdate = true;
      }
    }
  }
}
