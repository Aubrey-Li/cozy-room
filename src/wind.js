import * as THREE from 'three';

/**
 * Shared wind: patches a material's vertex shader so vertices sway in world
 * space. Works for plain and instanced meshes, and for the depth material
 * used to render shadows, so shadows move with the foliage.
 */
export function createWind() {
  const uniforms = {
    uTime: { value: 0 },
    uWindStrength: { value: 1 },
  };

  function patch(material, { pinned = false, height = 1, amount = 1, flutter = 0 } = {}) {
    const weight = pinned ? `clamp(position.y / ${height.toFixed(3)}, 0.0, 1.0)` : '1.0';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWindStrength = uniforms.uWindStrength;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform float uWindStrength;`,
        )
        .replace(
          '#include <project_vertex>',
          `
          #ifdef USE_INSTANCING
            mat4 windModel = modelMatrix * instanceMatrix;
          #else
            mat4 windModel = modelMatrix;
          #endif
          vec4 windWorld = windModel * vec4(transformed, 1.0);
          float windWeight = ${weight} * ${amount.toFixed(3)};
          float windPhase = windWorld.x * 0.35 + windWorld.z * 0.25;
          float gust = sin(uTime * 1.1 + windPhase) * 0.6
                     + sin(uTime * 2.3 + windPhase * 1.7) * 0.3
                     + sin(uTime * 4.1 + windPhase * 3.1) * 0.1;
          gust = gust * 0.5 + 0.35;
          vec3 windDir = normalize(vec3(1.0, 0.0, 0.55));
          windWorld.xyz += windDir * gust * uWindStrength * windWeight * 0.25;
          ${flutter > 0
            ? `windWorld.y += sin(uTime * 5.0 + windPhase * 7.0 + position.x * 10.0) * 0.02 * ${flutter.toFixed(3)} * uWindStrength;
               windWorld.xz += vec2(cos(uTime * 3.7 + windPhase * 5.0), sin(uTime * 4.3 + windPhase * 6.0)) * 0.012 * ${flutter.toFixed(3)} * uWindStrength;`
            : ''}
          vec4 mvPosition = viewMatrix * windWorld;
          gl_Position = projectionMatrix * mvPosition;
          `,
        );
    };
    material.customProgramCacheKey = () => `wind|${pinned}|${height}|${amount}|${flutter}`;
    return material;
  }

  /** Depth material for shadow casting that applies the same sway. */
  function depthFor(material, opts) {
    const depth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: material.map ?? null,
      alphaTest: material.alphaTest ?? 0,
      side: material.side,
    });
    return patch(depth, opts);
  }

  function update(time) {
    uniforms.uTime.value = time;
  }

  return { uniforms, patch, depthFor, update };
}
