import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export class AssetManager {
  constructor() {
    this.models = new Map();
    this.textures = new Map();
    this.animations = new Map();
    this.fallbacks = new Set();
    this.isLoaded = false;
    this.loadingProgress = 0;

    // 1. Configure GLTFLoader with MeshoptDecoder
    this.gltfLoader = new GLTFLoader();
    try {
      this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    } catch (e) {
      console.warn('[Assets] MeshoptDecoder initialization warning:', e);
    }

    // 2. Configure RGBELoader & TextureLoader
    this.rgbeLoader = new RGBELoader();
    this.textureLoader = new THREE.TextureLoader();

    // Asset manifest (attempt real files in public/ with graceful procedural fallback)
    this.manifest = [
      { id: 'building_a', type: 'gltf', path: 'models/city/building_a.glb' },
      { id: 'building_b', type: 'gltf', path: 'models/city/building_b.glb' },
      { id: 'road_straight', type: 'gltf', path: 'models/city/road_straight.glb' },
      { id: 'sidewalk', type: 'gltf', path: 'models/city/sidewalk.glb' },
      { id: 'player', type: 'gltf', path: 'models/characters/player.glb' },
      { id: 'zombie', type: 'gltf', path: 'models/characters/zombie.glb' },
      { id: 'car', type: 'gltf', path: 'models/vehicles/car.glb' },
      { id: 'weapon_pistol', type: 'gltf', path: 'models/weapons/pistol.glb' },
      { id: 'weapon_shotgun', type: 'gltf', path: 'models/weapons/shotgun.glb' },
      { id: 'weapon_rifle', type: 'gltf', path: 'models/weapons/rifle.glb' },
      { id: 'env_day', type: 'rgbe', path: 'textures/env/day_sky.hdr' },
      { id: 'env_night', type: 'rgbe', path: 'textures/env/night_sky.hdr' }
    ];
  }

  async loadAll(onProgress = null) {
    const total = this.manifest.length;
    let loadedCount = 0;

    for (let i = 0; i < total; i++) {
      const item = this.manifest[i];
      try {
        await this.loadAsset(item);
      } catch (err) {
        // Log fallback and generate procedural replacement so the engine never crashes
        this.fallbacks.add(item.id);
        this.createProceduralFallback(item);
      }
      loadedCount++;
      const ratio = loadedCount / total;
      this.loadingProgress = ratio;
      if (onProgress) {
        onProgress(ratio, item.id);
      }
    }

    this.isLoaded = true;
    return this;
  }

  loadAsset(item) {
    return new Promise((resolve, reject) => {
      // Fast check: verify path existence and ensure it isn't an SPA HTML fallback
      fetch(item.path, { method: 'HEAD' })
        .then(res => {
          const contentType = res.headers.get('content-type') || '';
          if (!res.ok || contentType.includes('text/html')) {
            reject(new Error(`File not found: ${item.path}`));
            return;
          }

          if (item.type === 'gltf') {
            try {
              this.gltfLoader.load(
                item.path,
                (gltf) => {
                  this.harmonizeMaterials(gltf.scene);
                  this.models.set(item.id, gltf.scene);
                  if (gltf.animations && gltf.animations.length > 0) {
                    this.animations.set(item.id, gltf.animations);
                    const clipNames = gltf.animations.map(a => a.name);
                    console.info(`[Assets] ${item.id} clips:`, clipNames);
                  }
                  resolve(gltf);
                },
                undefined,
                (err) => reject(err)
              );
            } catch (loadErr) {
              reject(loadErr);
            }
          } else if (item.type === 'rgbe') {
            try {
              this.rgbeLoader.load(
                item.path,
                (hdrTexture) => {
                  this.textures.set(item.id, hdrTexture);
                  resolve(hdrTexture);
                },
                undefined,
                (err) => reject(err)
              );
            } catch (loadErr) {
              reject(loadErr);
            }
          } else if (item.type === 'texture') {
            try {
              this.textureLoader.load(
                item.path,
                (tex) => {
                  this.textures.set(item.id, tex);
                  resolve(tex);
                },
                undefined,
                (err) => reject(err)
              );
            } catch (loadErr) {
              reject(loadErr);
            }
          } else {
            reject(new Error(`Unknown asset type ${item.type}`));
          }
        })
        .catch(err => reject(err));
    });
  }

  createProceduralFallback(item) {
    if (item.id === 'building_a') {
      this.models.set(item.id, this.buildProceduralBuilding(0x3c4048, 18, 14, 14));
    } else if (item.id === 'building_b') {
      this.models.set(item.id, this.buildProceduralBuilding(0x223344, 26, 14, 14));
    } else if (item.id === 'road_straight') {
      this.models.set(item.id, this.buildProceduralRoad());
    } else if (item.id === 'sidewalk') {
      this.models.set(item.id, this.buildProceduralSidewalk());
    } else if (item.id === 'player') {
      this.models.set(item.id, this.buildProceduralCharacter(0x224488, 0xffdbac));
    } else if (item.id === 'zombie') {
      this.models.set(item.id, this.buildProceduralCharacter(0x3b5335, 0x4a6b42, true));
    } else if (item.id === 'car') {
      this.models.set(item.id, this.buildProceduralCar());
    } else if (item.id === 'weapon_pistol') {
      this.models.set(item.id, this.buildProceduralWeapon('pistol'));
    } else if (item.id === 'weapon_shotgun') {
      this.models.set(item.id, this.buildProceduralWeapon('shotgun'));
    } else if (item.id === 'weapon_rifle') {
      this.models.set(item.id, this.buildProceduralWeapon('rifle'));
    } else if (item.id === 'env_day') {
      this.textures.set(item.id, this.buildProceduralEnvTexture(false));
    } else if (item.id === 'env_night') {
      this.textures.set(item.id, this.buildProceduralEnvTexture(true));
    }
  }

  // --- PROCEDURAL GENERATORS (Unified Palette & PBR Harmonization) ---

  buildProceduralBuilding(baseColor, height, width, depth) {
    const group = new THREE.Group();
    group.name = 'ProceduralBuilding';

    // Main Facade
    const bodyGeo = new THREE.BoxGeometry(width, height, depth);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.75,
      metalness: 0.15
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Decorative Cornice / Parapet
    const corniceGeo = new THREE.BoxGeometry(width + 0.6, 0.5, depth + 0.6);
    const corniceMat = new THREE.MeshStandardMaterial({ color: 0x55585d, roughness: 0.8, metalness: 0.1 });
    const cornice = new THREE.Mesh(corniceGeo, corniceMat);
    cornice.position.y = height + 0.25;
    cornice.castShadow = true;
    group.add(cornice);

    // Rooftop AC Unit & Water Tank
    const acGeo = new THREE.BoxGeometry(2.4, 1.4, 2.4);
    const acMat = new THREE.MeshStandardMaterial({ color: 0x777c82, roughness: 0.6, metalness: 0.4 });
    const acMesh = new THREE.Mesh(acGeo, acMat);
    acMesh.position.set(-2, height + 0.7, -2);
    acMesh.castShadow = true;
    group.add(acMesh);

    const tankGeo = new THREE.CylinderGeometry(1.2, 1.2, 2.2, 12);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x8a5d3b, roughness: 0.85, metalness: 0.05 });
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(2.5, height + 1.1, 2);
    tank.castShadow = true;
    group.add(tank);

    return group;
  }

  buildProceduralRoad() {
    const group = new THREE.Group();
    group.name = 'ProceduralRoad';

    const roadGeo = new THREE.PlaneGeometry(14, 22);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1b1c1e,
      roughness: 0.88,
      metalness: 0.1
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    group.add(road);

    // Yellow Dashed Center Line
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe0b020 });
    for (let z = -8; z <= 8; z += 5) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 3), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.015, z);
      group.add(stripe);
    }

    return group;
  }

  buildProceduralSidewalk() {
    const group = new THREE.Group();
    group.name = 'ProceduralSidewalk';

    const geo = new THREE.BoxGeometry(17.5, 0.25, 17.5);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x484c52,
      roughness: 0.8,
      metalness: 0.1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.125;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }

  buildProceduralCharacter(shirtColor, skinColor, isZombie = false) {
    const group = new THREE.Group();
    group.name = isZombie ? 'ProceduralZombie' : 'ProceduralPlayer';

    // Torso
    const torsoMat = new THREE.MeshStandardMaterial({
      color: shirtColor,
      roughness: 0.7,
      metalness: 0.1
    });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.45), torsoMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    torso.receiveShadow = true;
    group.add(torso);

    // Head
    const headMat = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.8,
      metalness: 0.05
    });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMat);
    head.position.y = 1.95;
    head.castShadow = true;
    group.add(head);

    // Arms
    const armMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.7, metalness: 0.1 });
    const armGeo = new THREE.BoxGeometry(0.24, 0.85, 0.24);

    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.name = 'leftArm';
    leftArm.position.set(-0.55, 1.15, 0);
    leftArm.castShadow = true;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.name = 'rightArm';
    rightArm.position.set(0.55, 1.15, 0);
    rightArm.castShadow = true;
    group.add(rightArm);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: isZombie ? 0x222428 : 0x1c2438, roughness: 0.85, metalness: 0.05 });
    const legGeo = new THREE.BoxGeometry(0.28, 0.95, 0.28);

    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.name = 'leftLeg';
    leftLeg.position.set(-0.24, 0.48, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.name = 'rightLeg';
    rightLeg.position.set(0.24, 0.48, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    // Glowing Eyes for Zombie
    if (isZombie) {
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1111, fog: false });
      const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);

      const lEye = new THREE.Mesh(eyeGeo, eyeMat);
      lEye.position.set(-0.13, 2.0, 0.26);
      group.add(lEye);

      const rEye = new THREE.Mesh(eyeGeo, eyeMat);
      rEye.position.set(0.13, 2.0, 0.26);
      group.add(rEye);
    }

    return group;
  }

  buildProceduralCar() {
    const group = new THREE.Group();
    group.name = 'ProceduralCar';

    // Chassis
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x991111,
      roughness: 0.35,
      metalness: 0.55
    });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.65, 4.4), bodyMat);
    chassis.position.y = 0.55;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    // Cabin
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x14181f,
      roughness: 0.2,
      metalness: 0.8
    });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.62, 2.3), cabinMat);
    cabin.position.set(0, 1.15, -0.3);
    cabin.castShadow = true;
    group.add(cabin);

    // 4 Wheels
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x151515,
      roughness: 0.85,
      metalness: 0.2
    });
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.35, 14);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelOffsets = [
      { name: 'wheel_FL', pos: [-1.15, 0.38, 1.35] },
      { name: 'wheel_FR', pos: [1.15, 0.38, 1.35] },
      { name: 'wheel_RL', pos: [-1.15, 0.38, -1.35] },
      { name: 'wheel_RR', pos: [1.15, 0.38, -1.35] }
    ];

    wheelOffsets.forEach(cfg => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.name = cfg.name;
      w.position.set(...cfg.pos);
      w.castShadow = true;
      group.add(w);
    });

    return group;
  }

  buildProceduralWeapon(type) {
    const group = new THREE.Group();
    group.name = `Weapon_${type}`;

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x2a2b2f,
      roughness: 0.3,
      metalness: 0.85
    });
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x181513,
      roughness: 0.9,
      metalness: 0.05
    });

    if (type === 'pistol') {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.36), metalMat);
      slide.position.set(0, 0.05, 0.1);
      group.add(slide);

      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.12), gripMat);
      grip.position.set(0, -0.1, -0.02);
      grip.rotation.x = -0.2;
      group.add(grip);
    } else if (type === 'shotgun') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), metalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.06, 0.25);
      group.add(barrel);

      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.42), gripMat);
      stock.position.set(0, -0.04, -0.2);
      group.add(stock);
    } else { // rifle
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.65), metalMat);
      receiver.position.set(0, 0.04, 0.15);
      group.add(receiver);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), metalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.06, 0.65);
      group.add(barrel);

      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.14), metalMat);
      mag.position.set(0, -0.14, 0.18);
      mag.rotation.x = 0.25;
      group.add(mag);

      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.35), gripMat);
      stock.position.set(0, -0.02, -0.3);
      group.add(stock);
    }

    group.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
      }
    });

    return group;
  }

  buildProceduralEnvTexture(isNight = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    if (!isNight) {
      grad.addColorStop(0, '#5ea8d8'); // Day sky top
      grad.addColorStop(0.5, '#c5def0'); // Horizon
      grad.addColorStop(1, '#2c3328'); // Ground bounce
    } else {
      grad.addColorStop(0, '#100004'); // Blood night sky
      grad.addColorStop(0.5, '#400810'); // Red horizon
      grad.addColorStop(1, '#080002'); // Ground shadow
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  // --- COHESION & MATERIAL HARMONIZATION ---

  harmonizeMaterials(root) {
    root.traverse(node => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;

        if (node.material) {
          // Standardize roughness & metalness for consistent lighting
          if (node.material.roughness !== undefined) {
            node.material.roughness = THREE.MathUtils.clamp(node.material.roughness, 0.35, 0.9);
          }
          if (node.material.metalness !== undefined) {
            node.material.metalness = THREE.MathUtils.clamp(node.material.metalness, 0.05, 0.85);
          }
        }
      }
    });
  }

  // --- INSTANCING & CLONING HELPERS ---

  getInstance(id) {
    const proto = this.models.get(id);
    if (!proto) return null;

    try {
      return SkeletonUtils.clone(proto);
    } catch {
      return proto.clone(true);
    }
  }

  get(id) {
    return this.models.get(id) || this.textures.get(id) || null;
  }

  getFallbacks() {
    return Array.from(this.fallbacks);
  }
}

// Global Singleton Instance
export const assets = new AssetManager();
if (typeof window !== 'undefined') {
  window.__SUNSHIFT_ASSETS__ = assets;
}
