export const ColorGradingShader = {
  name: 'ColorGradingShader',
  uniforms: {
    'tDiffuse': { value: null },
    'uContrast': { value: 1.12 },
    'uSaturation': { value: 1.15 },
    'uNightTint': { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uNightTint;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      // 1. Contrast adjustment
      color = (color - 0.5) * uContrast + 0.5;

      // 2. Saturation
      float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(lum), color, uSaturation);

      // 3. Night Split-Toning (Teal Shadows, Blood-Red Highlights)
      if (uNightTint > 0.001) {
        vec3 tealShadow = vec3(0.08, 0.22, 0.30);
        vec3 bloodHighlight = vec3(1.15, 0.20, 0.15);
        vec3 splitGrade = mix(tealShadow, bloodHighlight, clamp(lum * 1.4, 0.0, 1.0));
        color = mix(color, color * splitGrade * 1.8, uNightTint * 0.75);
      }

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
    }
  `
};
