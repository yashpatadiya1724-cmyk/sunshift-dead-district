import * as THREE from 'three';

/**
 * ProceduralTextures.js
 * Generates procedural PBR textures via HTML5 2D Canvas without downloading any external assets.
 * All textures configure RepeatWrapping and max anisotropy for high-fidelity filtering.
 */

function setupTexture(texture, maxAnisotropy = 4) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export class ProceduralTextures {
  constructor(renderer = null) {
    this.maxAnisotropy = renderer ? Math.min(renderer.capabilities.getMaxAnisotropy(), 4) : 4;
    this.cache = new Map();
  }

  /**
   * 1. Asphalt PBR Texture (Diffuse + Roughness)
   * Base dark gravel with fine surface noise, micro-cracks, and aggregate speckles.
   */
  getAsphaltTextures() {
    if (this.cache.has('asphalt')) return this.cache.get('asphalt');

    const size = 512;
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = size;
    colorCanvas.height = size;
    const cCtx = colorCanvas.getContext('2d');

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const rCtx = roughCanvas.getContext('2d');

    // Base asphalt fill
    cCtx.fillStyle = '#23252a';
    cCtx.fillRect(0, 0, size, size);

    rCtx.fillStyle = '#d0d0d0'; // Roughness ~ 0.82
    rCtx.fillRect(0, 0, size, size);

    // Fine asphalt gravel noise
    const imgData = cCtx.getImageData(0, 0, size, size);
    const rData = rCtx.getImageData(0, 0, size, size);
    const cPixels = imgData.data;
    const rPixels = rData.data;

    for (let i = 0; i < cPixels.length; i += 4) {
      const n = (Math.random() - 0.5) * 36;
      cPixels[i] = Math.max(0, Math.min(255, cPixels[i] + n));
      cPixels[i + 1] = Math.max(0, Math.min(255, cPixels[i + 1] + n));
      cPixels[i + 2] = Math.max(0, Math.min(255, cPixels[i + 2] + n));

      const rn = (Math.random() - 0.5) * 40;
      const rv = Math.max(0, Math.min(255, 200 + rn));
      rPixels[i] = rv;
      rPixels[i + 1] = rv;
      rPixels[i + 2] = rv;
    }
    cCtx.putImageData(imgData, 0, 0);
    rCtx.putImageData(rData, 0, 0);

    // Draw asphalt micro-cracks
    cCtx.strokeStyle = '#141517';
    cCtx.lineWidth = 1.2;
    rCtx.strokeStyle = '#ffffff';
    rCtx.lineWidth = 1.2;

    for (let c = 0; c < 12; c++) {
      let x = Math.random() * size;
      let y = Math.random() * size;
      cCtx.beginPath();
      rCtx.beginPath();
      cCtx.moveTo(x, y);
      rCtx.moveTo(x, y);

      for (let s = 0; s < 6; s++) {
        x += (Math.random() - 0.5) * 45;
        y += (Math.random() - 0.5) * 45;
        cCtx.lineTo(x, y);
        rCtx.lineTo(x, y);
      }
      cCtx.stroke();
      rCtx.stroke();
    }

    const map = setupTexture(new THREE.CanvasTexture(colorCanvas), this.maxAnisotropy);
    const roughnessMap = setupTexture(new THREE.CanvasTexture(roughCanvas), this.maxAnisotropy);
    const result = { map, roughnessMap };
    this.cache.set('asphalt', result);
    return result;
  }

  /**
   * 2. Sidewalk Tiles PBR Texture (Diffuse + Roughness)
   * 4x4 square concrete paving tiles with beveled grooves.
   */
  getSidewalkTextures() {
    if (this.cache.has('sidewalk')) return this.cache.get('sidewalk');

    const size = 512;
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = size;
    colorCanvas.height = size;
    const cCtx = colorCanvas.getContext('2d');

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const rCtx = roughCanvas.getContext('2d');

    // Base concrete tone
    cCtx.fillStyle = '#555a60';
    cCtx.fillRect(0, 0, size, size);

    rCtx.fillStyle = '#b0b0b0'; // Roughness ~ 0.70
    rCtx.fillRect(0, 0, size, size);

    // Grout lines grid (4x4 tiles)
    const tileSize = size / 4;
    cCtx.fillStyle = '#2a2c30';
    rCtx.fillStyle = '#f0f0f0'; // Rougher in joints

    for (let i = 0; i <= 4; i++) {
      const p = i * tileSize;
      cCtx.fillRect(p - 2, 0, 4, size);
      cCtx.fillRect(0, p - 2, size, 4);

      rCtx.fillRect(p - 2, 0, 4, size);
      rCtx.fillRect(0, p - 2, size, 4);
    }

    // Tile surface variation
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        const shade = (Math.random() - 0.5) * 20;
        cCtx.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${Math.abs(shade) / 255})`;
        cCtx.fillRect(x * tileSize + 2, y * tileSize + 2, tileSize - 4, tileSize - 4);
      }
    }

    const map = setupTexture(new THREE.CanvasTexture(colorCanvas), this.maxAnisotropy);
    const roughnessMap = setupTexture(new THREE.CanvasTexture(roughCanvas), this.maxAnisotropy);
    const result = { map, roughnessMap };
    this.cache.set('sidewalk', result);
    return result;
  }

  /**
   * 3. Brick PBR Texture (Diffuse + Roughness)
   * Staggered brick rows with mortar joints.
   */
  getBrickTextures() {
    if (this.cache.has('brick')) return this.cache.get('brick');

    const size = 512;
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = size;
    colorCanvas.height = size;
    const cCtx = colorCanvas.getContext('2d');

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const rCtx = roughCanvas.getContext('2d');

    // Mortar background
    cCtx.fillStyle = '#4a4744';
    cCtx.fillRect(0, 0, size, size);

    rCtx.fillStyle = '#f0f0f0';
    rCtx.fillRect(0, 0, size, size);

    const rows = 16;
    const cols = 8;
    const rowH = size / rows;
    const colW = size / cols;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (colW / 2);
      for (let c = -1; c <= cols; c++) {
        const bx = c * colW + offset;
        const by = r * rowH;

        // Brick color variation (rusty red-brown palette)
        const redTone = 110 + Math.floor(Math.random() * 45);
        const greenTone = 45 + Math.floor(Math.random() * 25);
        const blueTone = 35 + Math.floor(Math.random() * 20);
        cCtx.fillStyle = `rgb(${redTone}, ${greenTone}, ${blueTone})`;
        cCtx.fillRect(bx + 2, by + 2, colW - 4, rowH - 4);

        // Brick surface roughness ~ 0.75
        const rVal = 175 + Math.floor(Math.random() * 30);
        rCtx.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
        rCtx.fillRect(bx + 2, by + 2, colW - 4, rowH - 4);
      }
    }

    const map = setupTexture(new THREE.CanvasTexture(colorCanvas), this.maxAnisotropy);
    const roughnessMap = setupTexture(new THREE.CanvasTexture(roughCanvas), this.maxAnisotropy);
    const result = { map, roughnessMap };
    this.cache.set('brick', result);
    return result;
  }

  /**
   * 4. Concrete PBR Texture (Diffuse + Roughness)
   * Smooth architectural concrete with subtle aggregate specks.
   */
  getConcreteTextures() {
    if (this.cache.has('concrete')) return this.cache.get('concrete');

    const size = 512;
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = size;
    colorCanvas.height = size;
    const cCtx = colorCanvas.getContext('2d');

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const rCtx = roughCanvas.getContext('2d');

    cCtx.fillStyle = '#4c5259';
    cCtx.fillRect(0, 0, size, size);

    rCtx.fillStyle = '#c5c5c5'; // Roughness ~ 0.77
    rCtx.fillRect(0, 0, size, size);

    const imgData = cCtx.getImageData(0, 0, size, size);
    const pixels = imgData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const v = (Math.random() - 0.5) * 22;
      pixels[i] = Math.max(0, Math.min(255, pixels[i] + v));
      pixels[i + 1] = Math.max(0, Math.min(255, pixels[i + 1] + v));
      pixels[i + 2] = Math.max(0, Math.min(255, pixels[i + 2] + v));
    }
    cCtx.putImageData(imgData, 0, 0);

    const map = setupTexture(new THREE.CanvasTexture(colorCanvas), this.maxAnisotropy);
    const roughnessMap = setupTexture(new THREE.CanvasTexture(roughCanvas), this.maxAnisotropy);
    const result = { map, roughnessMap };
    this.cache.set('concrete', result);
    return result;
  }

  /**
   * 5. Building Windows Texture (Diffuse + Emissive Map)
   * High-contrast glass grid with illuminated office windows.
   */
  getWindowTextures() {
    if (this.cache.has('windows')) return this.cache.get('windows');

    const size = 256;
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = size;
    colorCanvas.height = size;
    const cCtx = colorCanvas.getContext('2d');

    const emissiveCanvas = document.createElement('canvas');
    emissiveCanvas.width = size;
    emissiveCanvas.height = size;
    const eCtx = emissiveCanvas.getContext('2d');

    cCtx.fillStyle = '#111317';
    cCtx.fillRect(0, 0, size, size);

    eCtx.fillStyle = '#000000';
    eCtx.fillRect(0, 0, size, size);

    const step = 32;
    for (let y = 10; y < size - 10; y += step) {
      for (let x = 10; x < size - 10; x += step) {
        cCtx.fillStyle = '#1a1f26';
        cCtx.fillRect(x, y, 16, 20);

        if (Math.random() > 0.35) {
          // Warm yellow or cool blue office lights
          const isWarm = Math.random() > 0.4;
          const color = isWarm ? '#ffe680' : '#88d4ff';
          cCtx.fillStyle = color;
          cCtx.fillRect(x, y, 16, 20);

          eCtx.fillStyle = color;
          eCtx.fillRect(x, y, 16, 20);
        }
      }
    }

    const map = setupTexture(new THREE.CanvasTexture(colorCanvas), this.maxAnisotropy);
    const emissiveMap = setupTexture(new THREE.CanvasTexture(emissiveCanvas), this.maxAnisotropy);
    const result = { map, emissiveMap };
    this.cache.set('windows', result);
    return result;
  }
}
