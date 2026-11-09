// 네온 로비: 몇 MB 안 되는 three.js 장면이라 1~2초면 뜨고, 같은 장면으로 VR(퀘스트)·AR(안드로이드)에 들어간다.
// 문(포털)을 누르면 유니티 웹 / 언리얼 스트리밍 / AR 페이지로 넘어간다. 기다리는 동안 유니티 빌드를 미리 받아 둔다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const START = new THREE.Vector3(0, 0, 3.6);

const PORTALS = [
  { id: 'sumo', title: '말랑 스모', sub: '유니티 웹 · SDG 3 건강 · 16 공정', url: '/sdg-worlds/sumo/', color: 0xff5fa2, pos: [-4.4, 0, -3.0] },
  { id: 'neon', title: '네온 바람골', sub: '언리얼 스트리밍 · SDG 조각 7개', url: '/sdg-worlds/neon/', color: 0x2ee6ff, pos: [0, 0, -7.4], lift: 1.7 },
  { id: 'ar', title: 'AR 나무 심기', sub: '폰 카메라 · SDG 15 숲 · 13 기후', url: '/sdg-worlds/ar/', color: 0xffd23f, pos: [4.4, 0, -3.0] },
  { id: 'ocean', title: '바다 청소', sub: '분리배출 게임 · SDG 14 · 12', url: '/sdg-worlds/ocean/', color: 0x26bde2, pos: [-7.4, 0, 0.8] },
  { id: 'water', title: '물발자국', sub: '어림 게임 · SDG 6 · 12', url: '/sdg-worlds/ar/water/', color: 0x3dffa8, pos: [7.4, 0, 0.8] },
];

// ---------- 렌더러 ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
} catch (e) { $('err').style.display = 'flex'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Color(0x150a28), FOG_DENSITY = 0.026;
scene.fog = new THREE.FogExp2(FOG, FOG_DENSITY);
const world = new THREE.Group();     // 하늘·바닥·도시·비 (AR에서는 숨김)
const content = new THREE.Group();   // 단상·홀로그램·문 (AR에서는 작은 디오라마로)
scene.add(world, content);

const rig = new THREE.Group();
rig.position.copy(START);
scene.add(rig);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 600);
camera.position.set(0, 1.6, 0);
rig.add(camera);

// 공통 셰이더 끝부분(톤 매핑·색 공간은 three.js가 출력 대상에 맞게 처리)
const OUT = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
const uTime = { value: 0 };
const uCam = { value: new THREE.Vector3() };

// ---------- 반사용 네온 환경맵 ----------
{
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x05040a, side: THREE.BackSide })));
  const panel = (c, x, y, z, w, h, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(6), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; env.add(m);
  };
  panel(0xff3d9a, -14, 2, -4, 8, 3, Math.PI / 2);
  panel(0x22e0ff, 14, 3, 2, 10, 2, -Math.PI / 2);
  panel(0x8a4dff, 0, 6, -14, 14, 2, 0);
  panel(0xffc23a, 4, 1, 14, 6, 2, Math.PI);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.04).texture;
  pm.dispose();
}

// ---------- 하늘 ----------
world.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec3 vDir;
    float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
    void main(){
      float h = vDir.y;
      vec3 c = mix(vec3(0.018, 0.008, 0.045), vec3(0.002, 0.002, 0.01), smoothstep(0.0, 0.6, h));
      c += vec3(0.22, 0.03, 0.2) * pow(1.0 - abs(h), 10.0);
      vec3 g = floor(vDir * 220.0);
      c += vec3(step(0.9978, hash(g)) * smoothstep(0.12, 0.5, h) * 0.6);
      gl_FragColor = vec4(c, 1.0);
      ${OUT}
    }`,
})));

// ---------- 젖은 바닥 + 네온 격자 ----------
const ground = new THREE.Mesh(new THREE.CircleGeometry(220, 64), new THREE.MeshStandardMaterial({ color: 0x0a0912, roughness: 0.2, metalness: 0.7 }));
ground.rotation.x = -Math.PI / 2;
world.add(ground);
const grid = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: uTime },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `varying vec3 vW; uniform float time;
    void main(){
      vec2 p = vW.xz / 2.0;
      vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
      float line = 1.0 - min(min(g.x, g.y), 1.0);
      float d = length(vW.xz);
      float pulse = 0.45 + 0.55 * sin(d * 0.7 - time * 2.2);
      vec3 col = mix(vec3(0.1, 0.85, 1.0), vec3(1.0, 0.2, 0.7), smoothstep(6.0, 30.0, d));
      gl_FragColor = vec4(col * line * exp(-d * 0.05) * (0.3 + 0.7 * pulse) * 1.3, 1.0);
      ${OUT}
    }`,
}));
grid.rotation.x = -Math.PI / 2;
grid.position.y = 0.003;
world.add(grid);

// ---------- 도시: 상자 하나를 여러 번 그려 창문을 셰이더로 켠다 ----------
const rand = (() => { let s = 20261103; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
const buildings = [];
{
  const N = 170;
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: uTime, cam: uCam, fogColor: { value: FOG }, fogDensity: { value: FOG_DENSITY } },
    vertexShader: `varying vec3 vW; varying vec3 vN; varying float vId;
      void main(){
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vId = float(gl_InstanceID);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `varying vec3 vW; varying vec3 vN; varying float vId;
      uniform float time; uniform vec3 cam; uniform vec3 fogColor; uniform float fogDensity;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 n = normalize(vN);
        vec3 col = vec3(0.01, 0.01, 0.022);
        if (abs(n.y) < 0.5) {
          float u = abs(n.x) > 0.5 ? vW.z : vW.x;
          vec2 cell = vec2(floor(u / 1.7), floor(vW.y / 2.6));
          vec2 f = vec2(fract(u / 1.7), fract(vW.y / 2.6));
          float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.24, f.y) * step(f.y, 0.8);
          float r = hash(cell + vId * 17.13);
          float lit = step(0.64, r) * step(2.0, vW.y);
          vec3 wc = r > 0.96 ? vec3(1.0, 0.25, 0.75) : (r > 0.83 ? vec3(0.35, 0.65, 1.0) : vec3(1.0, 0.6, 0.28));
          float flick = 0.85 + 0.15 * sin(time * 3.0 + r * 60.0);
          col += win * lit * wc * (0.7 + 0.8 * hash(cell + 3.1)) * 1.5 * flick;
          col += win * (1.0 - lit) * vec3(0.015, 0.02, 0.045);
        }
        float d = distance(vW, cam);
        col = mix(col, fogColor, 1.0 - exp(-fogDensity * fogDensity * d * d * 0.55));
        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4();
  let i = 0, tries = 0;
  while (i < N && tries++ < 4000) {
    const a = rand() * Math.PI * 2, r = 26 + Math.pow(rand(), 0.8) * 70;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 6 + rand() * 11, d = 6 + rand() * 11;
    const h = rand() < 0.12 ? 80 + rand() * 70 : 12 + rand() * 55;
    if (buildings.some((b) => Math.abs(b.x - x) < (b.w + w) / 2 + 1.5 && Math.abs(b.z - z) < (b.d + d) / 2 + 1.5)) continue;
    buildings.push({ x, z, w, d, h });
    m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    mesh.setMatrixAt(i++, m);
  }
  mesh.count = i;
  world.add(mesh);

  // 네온 띠: 모서리 세로줄 + 옥상 테두리
  const PAL = [0xff3d9a, 0x2ee6ff, 0x9b5cff, 0xffd23f, 0x3dffa8].map((c) => new THREE.Color(c).multiplyScalar(2.6));
  const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), buildings.length * 3);
  let k = 0;
  const put = (pos, scl, col) => { m.compose(pos, new THREE.Quaternion(), scl); strips.setMatrixAt(k, m); strips.setColorAt(k, col); k++; };
  for (const b of buildings) {
    const col = PAL[Math.floor(rand() * PAL.length)];
    if (rand() < 0.55) {
      const sx = rand() < 0.5 ? -1 : 1, sz = rand() < 0.5 ? -1 : 1;
      put(new THREE.Vector3(b.x + sx * b.w / 2, b.h / 2, b.z + sz * b.d / 2), new THREE.Vector3(0.25, b.h, 0.25), col);
    }
    if (rand() < 0.6) {
      put(new THREE.Vector3(b.x, b.h, b.z - b.d / 2), new THREE.Vector3(b.w, 0.3, 0.3), col);
      put(new THREE.Vector3(b.x, b.h, b.z + b.d / 2), new THREE.Vector3(b.w, 0.3, 0.3), col);
    }
  }
  strips.count = k;
  world.add(strips);
}

// ---------- 글자 텍스처(한글 네온 간판·문 이름표) ----------
function textTexture(lines, w, h, color, board = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (board) { g.fillStyle = 'rgba(8,5,18,0.82)'; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 26); g.fill(); }
  const hex = '#' + new THREE.Color(color).getHexString();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const L of lines) {
    g.font = `${L.weight || 800} ${L.size}px system-ui, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
    g.shadowColor = L.glow === false ? 'transparent' : hex; g.shadowBlur = L.glow === false ? 0 : L.size * 0.35;
    g.fillStyle = L.color || '#fff';
    for (let pass = 0; pass < (L.glow === false ? 1 : 2); pass++) g.fillText(L.text, w / 2, L.y);
  }
  if (board) { g.shadowColor = hex; g.shadowBlur = 18; g.strokeStyle = hex; g.lineWidth = 6; g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 22); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
{
  const SIGNS = [['라면', 0xff3d9a], ['PC방', 0x2ee6ff], ['노래방', 0x9b5cff], ['네온 바람골', 0xff3d9a], ['24시 편의점', 0x3dffa8], ['LAST LOGIN', 0x2ee6ff], ['오락실', 0xffd23f], ['데이터 시장', 0x9b5cff], ['기억 삽니다', 0xff3d9a], ['로그아웃 금지', 0xffd23f]];
  const near = buildings.filter((b) => Math.hypot(b.x, b.z) < 60).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  SIGNS.forEach(([text, col], i) => {
    const b = near[i % near.length]; if (!b) return;
    const tex = textTexture([{ text, size: 92, y: 128, color: '#fff' }], 512, 256, col);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide });
    mat.color.setScalar(1.7);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), mat);
    const y = 6 + (i * 7.3) % Math.max(6, b.h - 8);
    if (Math.abs(b.x) > Math.abs(b.z)) { s.position.set(b.x - Math.sign(b.x) * (b.w / 2 + 0.05), y, b.z); s.rotation.y = -Math.sign(b.x) * Math.PI / 2; }
    else { s.position.set(b.x, y, b.z - Math.sign(b.z) * (b.d / 2 + 0.05)); s.rotation.y = b.z > 0 ? Math.PI : 0; }
    world.add(s);
  });
}

// ---------- 비 ----------
const rain = (() => {
  const N = isMobile ? 900 : 1800;
  const pos = new Float32Array(N * 6), end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = (rand() - 0.5) * 40, y = rand() * 22, z = (rand() - 0.5) * 40;
    pos.set([x, y, z, x, y, z], i * 6); end[i * 2] = 0; end[i * 2 + 1] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('end', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: uTime, center: { value: new THREE.Vector3() } },
    vertexShader: `attribute float end; uniform float time; uniform vec3 center; varying float vA;
      void main(){
        float y = mod(position.y - time * 15.0, 22.0);
        vec3 p = vec3(center.x + position.x, y + end * 0.55, center.z + position.z);
        vA = end;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(0.45, 0.6, 1.0) * (0.12 + 0.2 * vA), 1.0); ${OUT} }`,
  });
  const l = new THREE.LineSegments(g, mat); l.frustumCulled = false;
  world.add(l);
  return mat;
})();

// ---------- 단상 + 홀로그램 말랑이 ----------
const DAIS = new THREE.Vector3(0, 0, -1.6);
{
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.75, 0.28, 64), new THREE.MeshStandardMaterial({ color: 0x15121f, roughness: 0.3, metalness: 0.8 }));
  dais.position.copy(DAIS).setY(0.14);
  content.add(dais);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3d9a).multiplyScalar(3), toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.035, 8, 128), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.copy(DAIS).setY(0.29);
  content.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.02, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2ee6ff).multiplyScalar(2.5), toneMapped: false }));
  ring2.rotation.x = Math.PI / 2; ring2.position.copy(DAIS).setY(0.29);
  content.add(ring2);
  // 빛 기둥
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.35, 2.4, 48, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { time: uTime },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float time;
      void main(){ float a = (1.0 - vUv.y) * 0.16 * (0.75 + 0.25 * sin(vUv.x * 60.0 + time * 4.0)); gl_FragColor = vec4(vec3(0.3, 0.8, 1.0) * a, 1.0); ${OUT} }`,
  }));
  beam.position.copy(DAIS).setY(1.5);
  content.add(beam);
  const pl = new THREE.PointLight(0xff5fa2, 18, 9, 1.6); pl.position.copy(DAIS).setY(1.2); content.add(pl);
  // 손님 쪽에서 비추는 무대 조명(말랑이 얼굴이 보이게)
  const key = new THREE.SpotLight(0xffe2ee, 12, 14, 0.42, 0.6, 1.2);
  key.position.set(0.6, 4.2, DAIS.z + 4.6); key.target.position.copy(DAIS).setY(0.9);
  content.add(key, key.target);
}
const holo = new THREE.Group();
holo.position.copy(DAIS).setY(0.34);
content.add(holo);
const holoMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: uTime },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `varying vec3 vN; varying vec3 vV; varying float vY; uniform float time;
    void main(){
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
      float scan = 0.6 + 0.4 * sin(vY * 70.0 - time * 7.0);
      vec3 col = mix(vec3(0.2, 0.9, 1.0), vec3(1.0, 0.35, 0.8), f) * (f * 0.9 + 0.015) * scan;
      gl_FragColor = vec4(col, 1.0);
      ${OUT}
    }`,
});
new GLTFLoader().load('/sdg-worlds/ar/mallang.glb', (gltf) => {
  const m = gltf.scene;
  m.scale.setScalar(3.3);
  const meshes = [];
  m.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    const shell = new THREE.Mesh(o.geometry, holoMat);
    shell.scale.setScalar(1.015);
    o.add(shell);
  }
  holo.add(m);
});

// ---------- 문(포털) ----------
const hitTargets = [];
const portalObjs = PORTALS.map((p) => {
  const g = new THREE.Group();
  g.position.set(...p.pos);
  g.lookAt(START.x, 0, START.z);
  const color = new THREE.Color(p.color);
  const frameMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3.2), toneMapped: false });
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.075, 16, 128), frameMat);
  frame.position.y = 1.75;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.64, 0.02, 8, 128), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.6), toneMapped: false }));
  halo.position.y = 1.75;
  const disk = new THREE.Mesh(new THREE.CircleGeometry(1.46, 96), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: uTime, col: { value: color }, hot: { value: 0 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy / 1.46; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vP; uniform float time; uniform vec3 col; uniform float hot;
      void main(){
        float r = length(vP), a = atan(vP.y, vP.x);
        float swirl = 0.5 + 0.5 * sin(a * 3.0 + r * 9.0 - time * (2.0 + hot * 3.0));
        float rings = 0.5 + 0.5 * sin(r * 26.0 - time * 5.0);
        float edge = smoothstep(0.35, 1.0, r);
        float v = (0.18 + 0.55 * swirl * edge + 0.15 * rings * edge) * (1.0 - smoothstep(0.96, 1.0, r));
        gl_FragColor = vec4(col * v * (0.9 + hot * 0.9), 1.0);
        ${OUT}
      }`,
  }));
  disk.position.y = 1.75;
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.6), new THREE.MeshStandardMaterial({ color: 0x15121f, roughness: 0.3, metalness: 0.8 }));
  base.position.y = 0.08;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
  label.position.y = 3.85;
  const setLabel = (sub) => {
    label.material.map?.dispose();
    label.material.map = textTexture([{ text: p.title, size: 118, y: 92, color: '#fff' }, { text: sub, size: 46, y: 196, color: '#e9e2ff', weight: 600, glow: false }], 1024, 256, p.color);
    label.material.needsUpdate = true;
  };
  setLabel(p.sub);
  label.material.color.setScalar(1.35);
  const light = new THREE.PointLight(p.color, 14, 7, 1.6); light.position.set(0, 1.4, 1.0);
  g.add(frame, halo, disk, base, label, light);
  if (p.lift) {
    // 가운데 문은 홀로그램 너머로 보이게 무대 위에 올린다
    for (const o of [frame, halo, disk, base, label, light]) o.position.y += p.lift;
    const stage = new THREE.Mesh(new THREE.BoxGeometry(4.2, p.lift, 2.6), new THREE.MeshStandardMaterial({ color: 0x14111e, roughness: 0.35, metalness: 0.8 }));
    stage.position.y = p.lift / 2;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(4.24, 0.05, 0.05), frameMat);
    edge.position.set(0, p.lift, 1.3);
    const edge2 = edge.clone(); edge2.position.y = 0.03;
    g.add(stage, edge, edge2);
  }
  content.add(g);
  const o = { p, g, frame, disk, setLabel, hot: 0 };
  for (const t of [frame, disk]) { t.userData.portal = o; hitTargets.push(t); }
  return o;
});

// ---------- SDG 17개 기둥: 눌러서 목표를 읽고 O/X 퀴즈를 맞히면 여권 도장 ----------
let GOALS = [];
const pillars = [];
function pillarLabel(g, stamped) {
  return textTexture([{ text: String(g.n), size: 150, y: 120, color: '#fff' }, { text: g.name.length > 9 ? g.name.slice(0, 9) + '…' : g.name, size: 46, y: 238, color: '#fff', weight: 700, glow: false },
    ...(stamped ? [{ text: '✓ 도장', size: 40, y: 300, color: '#ffe680', weight: 800, glow: false }] : [])], 512, 340, g.color);
}
SDG.goals().then(({ goals }) => {
  GOALS = goals;
  const R = 10.6;
  goals.forEach((g, i) => {
    const a = (i / goals.length) * Math.PI * 2 + Math.PI * 0.53;
    const grp = new THREE.Group();
    grp.position.set(DAIS.x + Math.cos(a) * R, 0, DAIS.z + Math.sin(a) * R);
    grp.lookAt(DAIS.x, 0, DAIS.z);
    const col = new THREE.Color(g.color);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.2, 0.7), new THREE.MeshStandardMaterial({ color: 0x15121f, roughness: 0.35, metalness: 0.8 }));
    body.position.y = 1.6;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.0, 0.02), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.4), toneMapped: false }));
    stripe.position.set(0, 1.6, 0.36);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.22, 0.82), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.0), toneMapped: false }));
    cap.position.y = 3.3;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshBasicMaterial({ map: pillarLabel(g, false), transparent: true, toneMapped: false }));
    label.position.set(0, 4.05, 0.05);
    grp.add(body, stripe, cap, label);
    content.add(grp);
    const pObj = { g, grp, label, cap, hot: 0, stamped: false };
    for (const t of [body, stripe, cap, label]) { t.userData.goal = pObj; hitTargets.push(t); }
    pillars.push(pObj);
  });
  refreshStamps();
});
async function refreshStamps() {
  const pp = await SDG.passport();
  const stamps = (pp && pp.stamps) || {};
  for (const p of pillars) {
    const on = !!stamps[p.g.n];
    if (on !== p.stamped) { p.stamped = on; p.label.material.map.dispose(); p.label.material.map = pillarLabel(p.g, on); p.label.material.needsUpdate = true; }
  }
  $('pass').textContent = pp ? `${pp.nick}의 여권 ${Object.keys(stamps).length} / 17` : 'SDG 여권 만들기';
}
addEventListener('sdg:passport', refreshStamps);

// 퀴즈 카드(화면) — VR에서는 같은 내용을 3D 판으로 띄운다
let quizGoal = null;
function openGoal(p) {
  const g = p.g; quizGoal = p;
  if (xrMode === 'immersive-vr') { showVrPanel(p, null); return; }
  const c = $('card');
  c.style.setProperty('--g', g.color);
  c.innerHTML = `<button class="x" aria-label="닫기">✕</button>
    <div class="badge">${g.n}</div><h2>${g.name}</h2>
    <p class="kid">${g.kid}</p>
    <ul>${g.targets.map((t) => `<li><b>${t.id}</b> ${t.text}</li>`).join('')}</ul>
    <div class="q"><div class="qt">O/X 퀴즈</div><p>${g.quiz.q}</p><div class="ox"><button data-a="1">O</button><button data-a="0">X</button></div><div class="fb"></div></div>
    <p class="src">출처: <a href="${g.source}" target="_blank" rel="noopener">UN SDG ${g.n}</a> (SDG 플랫폼 지식 모음 요약)${p.stamped ? ' · 이미 도장을 받았어요' : ''}</p>`;
  c.hidden = false;
  c.querySelector('.x').onclick = () => { c.hidden = true; quizGoal = null; };
  for (const b of c.querySelectorAll('.ox button')) b.onclick = () => answer(p, b.dataset.a === '1', (msg, ok) => {
    const fb = c.querySelector('.fb'); fb.textContent = msg; fb.className = 'fb ' + (ok ? 'ok' : 'no');
  });
}
async function answer(p, said, show) {
  const ok = said === p.g.quiz.a;
  show(`${ok ? '정답!' : '아쉬워요, 다시 생각해 봐요.'} ${p.g.quiz.why}`, ok);
  if (!ok) return;
  if (xrMode && !SDG.me()) { show('정답! 도장은 헤드셋을 벗고 포털에서 여권을 만든 뒤 받을 수 있어요.', true); return; }
  await SDG.stamp(p.g.n, 'lobby-quiz', `SDG ${p.g.n} ${p.g.name} 도장!`);
}

// VR 3D 퀴즈 판: 설명 + O/X 버튼(컨트롤러로 누름)
const vrPanel = new THREE.Group();
const vrBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
const mkBtn = (txt, x, ans) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ map: textTexture([{ text: txt, size: 120, y: 80, color: '#fff' }], 256, 160, ans ? 0x3dffa8 : 0xff5f7a), transparent: true, toneMapped: false }));
  m.position.set(x, -0.72, 0.01); m.userData.answer = ans; return m;
};
const vrO = mkBtn('O', -0.3, true), vrX = mkBtn('X', 0.3, false);
vrPanel.add(vrBoard, vrO, vrX); vrPanel.visible = false; scene.add(vrPanel);
function wrapLines(text, max) { const out = []; let line = ''; for (const ch of text) { line += ch; if (line.length >= max && /[\s,.!?]/.test(ch)) { out.push(line.trim()); line = ''; } } if (line.trim()) out.push(line.trim()); return out; }
function showVrPanel(p, fb) {
  const g = p.g;
  const lines = [{ text: `SDG ${g.n} · ${g.name}`, size: 64, y: 70, color: '#fff' }];
  wrapLines(g.kid, 22).slice(0, 2).forEach((t, i) => lines.push({ text: t, size: 40, y: 150 + i * 50, color: '#e9e2ff', weight: 600, glow: false }));
  wrapLines('Q. ' + g.quiz.q, 24).slice(0, 3).forEach((t, i) => lines.push({ text: t, size: 40, y: 290 + i * 50, color: '#ffe680', weight: 700, glow: false }));
  if (fb) wrapLines(fb, 26).slice(0, 2).forEach((t, i) => lines.push({ text: t, size: 36, y: 460 + i * 44, color: '#9fffd0', weight: 600, glow: false }));
  vrBoard.material.map?.dispose();
  vrBoard.material.map = textTexture(lines, 1024, 560, g.color); vrBoard.material.needsUpdate = true;
  // 컨트롤러 앞쪽, 기둥 방향으로 1.6m 떨어진 곳
  const head = new THREE.Vector3(); camera.getWorldPosition(head);
  const to = new THREE.Vector3(); p.grp.getWorldPosition(to); to.y = head.y; to.sub(head).setLength(1.6);
  vrPanel.position.copy(head).add(to); vrPanel.position.y = head.y - 0.1; vrPanel.lookAt(head);
  vrPanel.visible = true;
}

// ---------- 화면 효과(번짐) — VR·AR 중에는 끈다 ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
if (isMobile) bloom.resolution.set(innerWidth / 2, innerHeight / 2);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// ---------- 조작: 드래그로 보기, 눌러서 입장, WASD 이동 ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let yaw = 0, pitch = -0.06, drag = null, hover = null, entering = null;
const canvas = renderer.domElement;
function pick(clientX, clientY) {
  ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(hitTargets, false)[0];
  return hit ? hit.object.userData : null;   // { portal } 또는 { goal }
}
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    yaw -= (e.clientX - drag.x) * 0.0042; pitch -= (e.clientY - drag.y) * 0.0036;
    pitch = Math.max(-1.1, Math.min(1.0, pitch));
    drag.x = e.clientX; drag.y = e.clientY;
  }
  if (e.pointerType === 'mouse') setHover(pick(e.clientX, e.clientY), e.clientX, e.clientY);
});
canvas.addEventListener('pointerup', (e) => {
  if (drag && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) {
    const h = pick(e.clientX, e.clientY);
    if (h?.portal) enter(h.portal); else if (h?.goal) openGoal(h.goal);
  }
  drag = null;
});
function setHover(h, x, y) {
  hover = h?.portal || null;
  canvas.style.cursor = h ? 'pointer' : 'grab';
  const tip = $('tip');
  if (h) {
    tip.textContent = h.portal ? `${h.portal.p.title} 들어가기` : `SDG ${h.goal.g.n} ${h.goal.g.name} · 눌러서 퀴즈`;
    tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.add('on');
  } else tip.classList.remove('on');
}
const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));

function enter(o) {
  if (entering) return;
  entering = { o, t0: performance.now(), from: rig.position.clone() };
  const flash = $('flash');
  flash.style.background = `radial-gradient(circle, #${new THREE.Color(o.p.color).getHexString()} 0%, #07060f 75%)`;
  flash.classList.add('on');
  const go = () => { location.href = o.p.url; };
  const s = renderer.xr.getSession();
  if (s) { s.end().catch(() => {}).finally(() => setTimeout(go, 60)); return; }
  setTimeout(go, 620);
}

// ---------- VR·AR ----------
const controllers = [];
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  line.scale.z = 14; c.add(line); c.userData.line = line;
  c.addEventListener('select', () => {
    ray.setFromXRController(c);
    const hit = ray.intersectObjects(vrPanel.visible ? [vrO, vrX, ...hitTargets] : hitTargets, false)[0];
    if (!hit) { vrPanel.visible = false; return; }
    const u = hit.object.userData;
    if (u.answer !== undefined && quizGoal) answer(quizGoal, u.answer, (msg) => showVrPanel(quizGoal, msg));
    else if (u.portal) enter(u.portal);
    else if (u.goal) openGoal(u.goal);
  });
  rig.add(c); controllers.push(c);
}
let xrMode = null;
function applyMode() {
  const ar = xrMode === 'immersive-ar';
  world.visible = !ar;
  scene.fog = ar ? null : new THREE.FogExp2(FOG, FOG_DENSITY);
  if (ar) {
    // 내 방 탁자 위에 놓인 작은 디오라마
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    content.scale.setScalar(0.14); content.position.set(0, -0.55, -1.0);
  } else {
    rig.position.copy(START); content.scale.setScalar(1); content.position.set(0, 0, 0);
  }
  for (const c of controllers) c.userData.line.visible = xrMode === 'immersive-vr';
  vrPanel.visible = false;
  if (!xrMode) { camera.position.set(0, 1.6, 0); camera.rotation.set(pitch, 0, 0); }
  $('hint').hidden = !!xrMode;
}
async function startXR(mode) {
  try {
    const opts = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
    if (mode === 'immersive-ar') { opts.optionalFeatures.push('dom-overlay'); opts.domOverlay = { root: $('hud') }; }
    const session = await navigator.xr.requestSession(mode, opts);
    renderer.xr.setReferenceSpaceType(mode === 'immersive-ar' ? 'local' : 'local-floor');
    await renderer.xr.setSession(session);
    xrMode = mode; applyMode();
    session.addEventListener('end', () => { xrMode = null; applyMode(); });
  } catch (e) { $('xrNote').textContent = '들어가지 못했어요: ' + (e.message || e); }
}
(async () => {
  const note = $('xrNote');
  if (!('xr' in navigator)) {
    note.textContent = window.isSecureContext ? '이 브라우저는 WebXR을 지원하지 않아요. 퀘스트 브라우저나 안드로이드 크롬에서 열면 VR·AR로 들어갈 수 있어요.' : 'VR·AR은 https 주소에서만 열려요(포털의 https 주소를 쓰세요).';
    return;
  }
  const [vr, ar] = await Promise.all(['immersive-vr', 'immersive-ar'].map((m) => navigator.xr.isSessionSupported(m).catch(() => false)));
  if (vr) { $('vrBtn').hidden = false; $('vrBtn').onclick = () => startXR('immersive-vr'); }
  if (ar) { $('arBtn').hidden = false; $('arBtn').onclick = () => startXR('immersive-ar'); }
  if (!vr && !ar) note.textContent = '이 기기에는 VR 헤드셋이나 AR 카메라가 없어요. 퀘스트 브라우저나 안드로이드 크롬에서 열면 같은 로비로 VR·AR 입장이 돼요.';
})();

// ---------- 서버 상태와 미리 받기 ----------
fetch('/api/status').then((r) => r.json()).then((s) => {
  const neon = portalObjs.find((o) => o.p.id === 'neon');
  if (!s.neon.signalling) neon.setLabel('언리얼 · 스트리밍 서버 꺼짐');
  if (!s.sumo.built) portalObjs.find((o) => o.p.id === 'sumo').setLabel('유니티 웹 · 빌드 준비 중');
}).catch(() => {});
async function prefetchSumo() {
  if (navigator.connection && navigator.connection.saveData) return;
  const list = await fetch('/api/prefetch/sumo').then((r) => r.json()).catch(() => []);
  if (!list.length) return;
  const pre = $('pre'); pre.classList.add('on');
  for (let i = 0; i < list.length; i++) {
    pre.textContent = `말랑 스모 미리 받는 중 ${i + 1}/${list.length}`;
    await fetch(list[i], { priority: 'low' }).then((r) => r.arrayBuffer()).catch(() => {});
  }
  pre.textContent = '말랑 스모 준비 완료 · 문을 누르면 바로 열려요';
  setTimeout(() => pre.classList.remove('on'), 5000);
}

// ---------- 루프 ----------
const clock = new THREE.Clock();
let firstFrame = true;
const fwd = new THREE.Vector3(), side = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  uTime.value = t;

  if (!xrMode) {
    rig.rotation.y = yaw; camera.rotation.x = pitch;
    const mv = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const st = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if ((mv || st) && !entering) {
      fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); side.set(Math.cos(yaw), 0, -Math.sin(yaw));
      rig.position.addScaledVector(fwd, mv * 3.6 * dt).addScaledVector(side, st * 3.6 * dt);
      const d = new THREE.Vector2(rig.position.x - DAIS.x, rig.position.z - DAIS.z);
      if (d.length() > 11) { d.setLength(11); rig.position.x = DAIS.x + d.x; rig.position.z = DAIS.z + d.y; }
    }
    if (entering) {
      const k = Math.min(1, (performance.now() - entering.t0) / 600), e = k * k * (3 - 2 * k);
      const target = entering.o.g.position;
      rig.position.lerpVectors(entering.from, new THREE.Vector3(target.x, 0, target.z), e * 0.85);
    }
  }

  // 말랑이: 손님 쪽을 보며 둥실둥실, 말랑말랑
  holo.position.y = 0.42 + Math.sin(t * 1.3) * 0.08;
  holo.rotation.y = Math.sin(t * 0.5) * 0.7;
  const sq = Math.sin(t * 3.1) * 0.035;
  holo.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);

  // 문: 가리키면 커지고 밝아진다(VR은 컨트롤러 광선으로)
  let vrHover = null;
  if (xrMode === 'immersive-vr') {
    for (const c of controllers) {
      ray.setFromXRController(c);
      const hit = ray.intersectObjects(vrPanel.visible ? [vrO, vrX, ...hitTargets] : hitTargets, false)[0];
      c.userData.line.scale.z = hit ? hit.distance : 14;
      if (hit && hit.object.userData.portal) vrHover = hit.object.userData.portal;
    }
  }
  for (const o of portalObjs) {
    const want = (o === hover || o === vrHover || (entering && entering.o === o)) ? 1 : 0;
    o.hot += (want - o.hot) * Math.min(1, dt * 10);
    o.frame.scale.setScalar(1 + o.hot * 0.07);
    o.disk.material.uniforms.hot.value = o.hot;
    o.frame.rotation.z = Math.sin(t * 0.8 + o.g.position.x) * 0.05;
  }

  camera.getWorldPosition(uCam.value);
  rain.uniforms.center.value.set(uCam.value.x, 0, uCam.value.z);

  if (renderer.xr.isPresenting) renderer.render(scene, camera);
  else composer.render();

  if (firstFrame) {
    firstFrame = false;
    const sec = (performance.now() / 1000).toFixed(1);
    $('time').textContent = `로비 ${sec}초 만에 열림`;
    try { localStorage.setItem('portal.load.lobby', sec); } catch (e) {}
    setTimeout(prefetchSumo, 1200);
  }
});
applyMode();
