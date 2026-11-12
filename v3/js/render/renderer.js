// Penalty Kings v3 — renderer and post chain.
// Linear HDR target (half float, MSAA) -> bloom -> AgX tone map + sRGB.
import * as THREE from 'three';
import { EffectComposer } from '../../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/addons/postprocessing/OutputPass.js';
import { TIERS, renderSize } from '../core/quality.js';

export function createRenderer(canvas, scene, camera, tierName) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // ?tm=agx|aces|neutral lets us compare looks on a real screen
  const tm = new URLSearchParams(location.search).get('tm') || 'aces';
  renderer.toneMapping = { agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping }[tm] || THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.info.autoReset = false;

  let tier = TIERS[tierName];
  let name = tierName;
  let dynamicScale = 1;
  let override = {}; // development: try a setting without changing the tier table
  let composer = null;
  let bloom = null;
  const size = { width: 1, height: 1, scale: 1 };

  function build() {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const s = renderSize(name, cssW, cssH, window.devicePixelRatio || 1);
    size.width = Math.max(1, Math.round(s.width * dynamicScale));
    size.height = Math.max(1, Math.round(s.height * dynamicScale));
    size.scale = s.scale * dynamicScale;
    renderer.setPixelRatio(1);
    renderer.setSize(size.width, size.height, false);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const msaa = override.msaa != null ? override.msaa : tier.msaa;
    const useBloom = override.bloom != null ? override.bloom : tier.bloom;

    if (composer) composer.dispose();
    const target = new THREE.WebGLRenderTarget(size.width, size.height, {
      type: THREE.HalfFloatType,
      samples: msaa,
      depthBuffer: true,
    });
    composer = new EffectComposer(renderer, target);
    composer.setSize(size.width, size.height);
    composer.addPass(new RenderPass(scene, camera));
    if (useBloom) {
      bloom = new UnrealBloomPass(new THREE.Vector2(size.width * tier.bloomScale, size.height * tier.bloomScale), tier.bloomStrength, 0.45, 1.6);
      // UnrealBloomPass sizes its mips from setSize; keep them at the tier's bloom scale
      const origSetSize = bloom.setSize.bind(bloom);
      bloom.setSize = (w, h) => origSetSize(Math.round(w * tier.bloomScale * 2), Math.round(h * tier.bloomScale * 2));
      bloom.setSize(size.width, size.height);
      composer.addPass(bloom);
    }
    composer.addPass(new OutputPass());
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
  }
  build();

  return {
    renderer,
    get tierName() { return name; },
    get tier() { return tier; },
    get size() { return size; },
    setTier(n) { name = n; tier = TIERS[n]; dynamicScale = 1; build(); },
    setDynamicScale(s) { if (s !== dynamicScale) { dynamicScale = s; build(); } },
    resize: build,
    /** Development: override msaa / bloom and rebuild. */
    setOverride(o) { override = o || {}; build(); },
    render() {
      renderer.info.reset();
      composer.render();
    },
    /** Milliseconds for one fully finished frame (blocks until the GPU is done). */
    measureFrameMs(frames = 12) {
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      composer.render();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        composer.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // forces the frame to complete
      }
      return (performance.now() - t0) / frames;
    },
    gpuName() {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    },
  };
}
