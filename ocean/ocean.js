// 바다 청소 대작전(SDG 14·12): 배 위에서 쓰레기를 건져 맞는 통에 나눠 담는 분류 게임. 데스크톱·폰·VR 같은 조작(가리키고 누르기).
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const GAME_TIME = 75;

const BINS = [
  { id: 'plastic', name: '플라스틱', color: 0x2f7fd8 },
  { id: 'can', name: '캔', color: 0xe3a50b },
  { id: 'vinyl', name: '비닐', color: 0x8a63c9 },
];
const TRASH = [
  { type: 'pet', name: '페트병', bin: 'plastic', hint: '페트병은 라벨을 떼고 플라스틱 통에!' },
  { type: 'cup', name: '플라스틱 컵', bin: 'plastic', hint: '플라스틱 컵은 씻어서 플라스틱 통에!' },
  { type: 'can', name: '음료 캔', bin: 'can', hint: '알루미늄 캔은 캔 통에!' },
  { type: 'bag', name: '비닐봉지', bin: 'vinyl', hint: '비닐봉지는 비닐 통에!' },
  { type: 'snack', name: '과자 봉지', bin: 'vinyl', hint: '과자 봉지도 비닐류예요!' },
];
const ANIMALS = [
  { type: 'fish', name: '물고기', fact: '물고기는 작게 부서진 미세플라스틱을 먹이로 착각해 삼키기도 해요.' },
  { type: 'turtle', name: '바다거북', fact: '바다거북은 떠다니는 비닐봉지를 해파리로 착각해 먹곤 해요.' },
  { type: 'jelly', name: '해파리', fact: '해파리는 쓰레기가 아니에요! 바다 생태계의 한 식구예요.' },
];
const FACTS = [
  '플라스틱은 바다에서 수백 년 동안 남아 있어요.',
  'SDG 14.1: 바다로 흘러드는 쓰레기와 오염을 크게 줄이자는 약속이에요.',
  '분리배출을 잘하면 플라스틱이 새 물건으로 다시 태어나요(SDG 12).',
  '강과 바닷가에 버린 쓰레기가 바람과 물을 타고 먼바다까지 가요.',
  '장바구니와 텀블러를 쓰면 바다로 갈 쓰레기가 처음부터 줄어요.',
];

// ---------- 장면 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.xr.enabled = true;
$('stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3f4);
scene.fog = new THREE.Fog(0x8fd3f4, 25, 90);
scene.add(new THREE.HemisphereLight(0xdff4ff, 0x1d6a8a, 1.5));
const sun = new THREE.DirectionalLight(0xfff3d6, 2.2); sun.position.set(8, 14, 6); scene.add(sun);

const rig = new THREE.Group(); scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 300);
camera.position.set(0, 1.6 + 0.5, 0); rig.add(camera);   // 갑판 높이 0.5m

const uTime = { value: 0 };
const wave = (x, z, t) => Math.sin(x * 0.45 + t * 1.1) * 0.12 + Math.cos(z * 0.38 + t * 0.9) * 0.1;
const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 160, 160), new THREE.ShaderMaterial({
  uniforms: { time: uTime },
  vertexShader: `uniform float time; varying float vH; varying vec3 vW;
    void main(){ vec3 p = position; float h = sin(p.x*0.45+time*1.1)*0.12 + cos(-p.y*0.38+time*0.9)*0.1; p.z += h; vH = h;
      vec4 w = modelMatrix*vec4(p,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `varying float vH; varying vec3 vW; uniform float time;
    void main(){ float d = length(vW.xz); vec3 deep = vec3(0.02,0.32,0.5), shallow = vec3(0.12,0.62,0.78);
      vec3 c = mix(shallow, deep, smoothstep(4.0, 40.0, d)) + vH*0.6;
      float sparkle = pow(max(0.0, sin(vW.x*3.0+time*2.0)*sin(vW.z*3.3-time*1.7)), 24.0)*0.6; c += sparkle;
      c = mix(c, vec3(0.56,0.83,0.96), smoothstep(30.0, 90.0, d));
      gl_FragColor = vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
water.rotation.x = -Math.PI / 2;
scene.add(water);

// 배(갑판) + 난간
const wood = new THREE.MeshStandardMaterial({ color: 0xb98652, roughness: 0.8 });
const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 5), wood); deck.position.set(0, 0.35, 0.4); scene.add(deck);
const hull = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.6, 5.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })); hull.position.set(0, 0.0, 0.4); scene.add(hull);
const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.45, 0.12, 5.25), new THREE.MeshStandardMaterial({ color: 0xe5243b })); stripe.position.set(0, 0.1, 0.4); scene.add(stripe);

function label(text, color, w = 512, h = 160) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#' + new THREE.Color(color).getHexString(); g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 30); g.fill();
  g.fillStyle = '#fff'; g.font = `800 ${Math.round(h * 0.48)}px system-ui, "Malgun Gothic", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// 분리배출 통 3개(배 앞쪽)
const hit = [];
const binObjs = BINS.map((b, i) => {
  const g = new THREE.Group(); g.position.set((i - 1) * 0.95, 0.5, -2.05); g.scale.setScalar(0.72);
  const mat = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.9, 24, 1, true), mat); body.position.y = 0.45;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), mat); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.02;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 32), new THREE.MeshStandardMaterial({ color: 0xffffff })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.9;
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.25), new THREE.MeshBasicMaterial({ map: label(b.name, b.color), transparent: true }));
  tag.position.set(0, 1.18, 0.1);
  g.add(body, bottom, rim, tag); scene.add(g);
  const o = { ...b, g, mat, glow: 0, err: 0 };
  for (const m of [body, tag, rim]) { m.userData.bin = o; hit.push(m); }
  return o;
});

// ---------- 떠다니는 것들 ----------
const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, ...extra });
function makeMesh(type) {
  const g = new THREE.Group();
  if (type === 'pet') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 16), M(0x9fe3ff, { transparent: true, opacity: 0.75, roughness: 0.1 }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12), M(0x1f6fd1)); cap.position.y = 0.24;
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.12, 16), M(0x3dbb5a)); g.add(b, cap, lab); g.rotation.z = Math.PI / 2.2;
  } else if (type === 'cup') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.24, 16, 1, true), M(0xffffff, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), M(0xff5fa2)); straw.position.set(0.03, 0.12, 0); straw.rotation.z = 0.25; g.add(b, straw); g.rotation.z = 1.2;
  } else if (type === 'can') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 18), M(0xe5243b, { metalness: 0.7, roughness: 0.3 }));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.01, 18), M(0xcfd6dc, { metalness: 0.9, roughness: 0.2 })); top.position.y = 0.125; g.add(b, top); g.rotation.z = Math.PI / 2;
  } else if (type === 'bag') {
    const geo = new THREE.SphereGeometry(0.22, 12, 8); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + Math.random() * 0.5), p.getY(i) * 0.45, p.getZ(i) * (0.8 + Math.random() * 0.5));
    geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, M(0xf4f4f4, { transparent: true, opacity: 0.8 })));
  } else if (type === 'snack') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2), M(0xffb000, { metalness: 0.5, roughness: 0.3 }));
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.045, 0.04), M(0xe5243b)); s.position.z = 0.05; g.add(b, s);
  } else if (type === 'fish') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), M(0xff8a3d)); b.scale.set(1.6, 0.9, 0.7);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 4), M(0xffb84d)); tail.rotation.z = Math.PI / 2; tail.position.x = -0.3;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), M(0x111111)); eye.position.set(0.17, 0.04, 0.09); g.add(b, tail, eye);
  } else if (type === 'turtle') {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0x3f7e44)); shell.scale.y = 0.55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), M(0x8fbf5a)); head.position.set(0.36, 0.04, 0);
    g.add(shell, head);
    for (const [x, z] of [[0.18, 0.24], [0.18, -0.24], [-0.18, 0.22], [-0.18, -0.22]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.08), M(0x8fbf5a)); f.position.set(x, 0, z); g.add(f); }
  } else if (type === 'jelly') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0xd7a8ff, { transparent: true, opacity: 0.65, emissive: 0x6a2aa8, emissiveIntensity: 0.3 }));
    g.add(dome);
    for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.35, 5), M(0xe8cfff, { transparent: true, opacity: 0.6 })); const a = (i / 6) * Math.PI * 2; t.position.set(Math.cos(a) * 0.12, -0.17, Math.sin(a) * 0.12); g.add(t); }
  }
  return g;
}

const floaters = [];
function spawn(kind, def) {
  const mesh = makeMesh(def.type); mesh.scale.setScalar(1.9);
  const a = Math.random() * Math.PI * 1.6 - Math.PI * 1.3;          // 주로 앞쪽과 양옆
  const r = 3.0 + Math.random() * 4.5;
  const o = { kind, def, mesh, x: Math.cos(a) * r, z: Math.sin(a) * r - 1, vx: (Math.random() - 0.5) * 0.25, vz: (Math.random() - 0.5) * 0.25, spin: (Math.random() - 0.5) * 0.6, phase: Math.random() * 6 };
  mesh.traverse((m) => { if (m.isMesh) { m.userData.item = o; hit.push(m); } });
  scene.add(mesh); floaters.push(o);
  return o;
}
function despawn(o) {
  scene.remove(o.mesh);
  o.mesh.traverse((m) => { const i = hit.indexOf(m); if (i >= 0) hit.splice(i, 1); });
  floaters.splice(floaters.indexOf(o), 1);
}
function fillSea() {
  while (floaters.filter((f) => f.kind === 'trash').length < 9) spawn('trash', TRASH[Math.floor(Math.random() * TRASH.length)]);
  while (floaters.filter((f) => f.kind === 'animal').length < 5) spawn('animal', ANIMALS[Math.floor(Math.random() * ANIMALS.length)]);
}

// ---------- 게임 상태 ----------
let playing = false, timeLeft = GAME_TIME, score = 0, sorted = 0, mistakes = 0, held = null, factI = 0;
const heldSlot = new THREE.Group(); heldSlot.position.set(0, 1.55, -0.85); camera.add(heldSlot); heldSlot.position.set(0, -0.35, -0.8);
function say(t) { $('msg').textContent = t; vrSay(t); }
function setHand() { $('hand').hidden = !held; if (held) $('hand').textContent = `손에 든 것: ${held.def.name} → 맞는 통을 누르세요`; }

function pickItem(o) {
  if (!playing) return;
  if (o.kind === 'animal') {
    score = Math.max(0, score - 5); mistakes++;
    say(`앗, ${o.def.name}! −5점. ${o.def.fact}`);
    o.vx += (o.x > 0 ? 1 : -1) * 0.8; return;
  }
  if (held) { say(`먼저 손에 든 ${held.def.name}부터 통에 넣어요.`); return; }
  held = o;
  floaters.splice(floaters.indexOf(o), 1);
  o.mesh.traverse((m) => { const i = hit.indexOf(m); if (i >= 0) hit.splice(i, 1); });
  scene.remove(o.mesh); heldSlot.add(o.mesh); o.mesh.position.set(0, 0, 0); o.mesh.scale.setScalar(0.9);
  setHand(); say(`${o.def.name}을(를) 건졌어요! 어느 통에 넣을까요?`);
  fillSea();
}
function pickBin(b) {
  if (!playing || !held) { if (playing) say('먼저 바다에 떠 있는 쓰레기를 건져요.'); return; }
  if (held.def.bin === b.id) {
    score += 10; sorted++; b.glow = 1;
    heldSlot.remove(held.mesh); held = null; setHand();
    say(`딩동! +10점. ${FACTS[factI++ % FACTS.length]}`);
  } else { b.err = 1; mistakes++; say(`그 통이 아니에요. 힌트: ${held.def.hint}`); }
  $('score').textContent = score;
}

// ---------- 조작: 가리키고 누르기(마우스·터치·VR 컨트롤러) ----------
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
let yaw = 0, pitch = -0.2, drag = null;
const cv = renderer.domElement;
function pointAt(x, y) { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.intersectObjects(hit, false)[0]; }
function act(h) { if (!h) return; const u = h.object.userData; if (u.bin) pickBin(u.bin); else if (u.item) pickItem(u.item); }
cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => {
  if (drag) { yaw -= (e.clientX - drag.x) * 0.004; pitch = Math.max(-1.2, Math.min(0.6, pitch - (e.clientY - drag.y) * 0.0035)); drag.x = e.clientX; drag.y = e.clientY; }
  else if (e.pointerType === 'mouse') cv.style.cursor = pointAt(e.clientX, e.clientY) ? 'pointer' : 'grab';
});
cv.addEventListener('pointerup', (e) => { if (drag && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) act(pointAt(e.clientX, e.clientY)); drag = null; });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const controllers = [0, 1].map((i) => {
  const c = renderer.xr.getController(i);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffffff }));
  line.scale.z = 10; c.add(line);
  c.addEventListener('select', () => { ray.setFromXRController(c); act(ray.intersectObjects(hit, false)[0]); });
  rig.add(c); return c;
});
// VR에서는 화면 글자가 안 보이므로 통 위에 안내판을 띄운다
const vrBoard = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshBasicMaterial({ transparent: true }));
vrBoard.position.set(0, 2.35, -2.2); vrBoard.visible = false; scene.add(vrBoard);
function vrSay(t) {
  if (!renderer.xr.isPresenting) return;
  const c = document.createElement('canvas'); c.width = 1300; c.height = 250; const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.roundRect(4, 4, 1292, 242, 40); g.fill();
  g.fillStyle = '#0c2a3a'; g.font = '700 46px system-ui, "Malgun Gothic", sans-serif'; g.textAlign = 'center';
  const lines = []; let line = ''; for (const ch of `${t}   점수 ${score} · ${Math.ceil(timeLeft)}초`) { line += ch; if (line.length > 30 && ch === ' ') { lines.push(line); line = ''; } } lines.push(line);
  lines.slice(0, 3).forEach((l, i) => g.fillText(l.trim(), 650, 70 + i * 62));
  vrBoard.material.map?.dispose(); vrBoard.material.map = new THREE.CanvasTexture(c); vrBoard.material.map.colorSpace = THREE.SRGBColorSpace; vrBoard.material.needsUpdate = true;
  vrBoard.visible = true;
}

// ---------- 시작·끝 ----------
function start() {
  $('intro').hidden = true; $('result').hidden = true;
  for (const f of [...floaters]) despawn(f);
  if (held) { heldSlot.remove(held.mesh); held = null; }
  score = 0; sorted = 0; mistakes = 0; timeLeft = GAME_TIME; playing = true;
  $('score').textContent = 0; setHand(); fillSea();
  say('바다에 떠 있는 쓰레기를 눌러 건져 올리세요');
}
async function finish() {
  playing = false;
  const s = renderer.xr.getSession(); if (s) await s.end().catch(() => {});
  const got14 = score >= 50, got12 = sorted >= 5;
  $('resultBody').innerHTML = `<h1>바다가 깨끗해졌어요!</h1><div class="big">${score}점</div>
    <p>바르게 나눈 쓰레기 ${sorted}개 · 실수 ${mistakes}번</p>
    <ul><li>${got14 ? '✅ SDG 14 해양 생태계 도장!' : '⬜ SDG 14 도장은 50점부터 (다시 도전!)'}</li><li>${got12 ? '✅ SDG 12 책임 있는 소비와 생산 도장!' : '⬜ SDG 12 도장은 다섯 번 바르게 나누면'}</li></ul>
    <p>집에서도: 페트병 라벨 떼기, 캔 헹구기, 비닐은 비닐끼리!</p>
    <div class="row"><button class="btn" id="again">다시 하기</button><a class="btn alt" href="/sdg-worlds/passport/">여권 보기</a></div>`;
  $('result').hidden = false; $('again').onclick = start;
  if (got14) await SDG.stamp(14, 'ocean', '바다 청소 성공! SDG 14 도장');
  if (got12) setTimeout(() => SDG.stamp(12, 'ocean', '분리배출 달인! SDG 12 도장'), 1500);
}
$('start').onclick = start;
(async () => {
  if (!navigator.xr) { $('xrNote').textContent = window.isSecureContext ? '' : 'VR은 https 주소에서 열면 할 수 있어요.'; return; }
  if (await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) {
    $('vr').hidden = false;
    $('vr').onclick = async () => {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      renderer.xr.setReferenceSpaceType('local-floor'); await renderer.xr.setSession(session);
      camera.position.set(0, 0.5, 0); start(); vrSay('쓰레기를 가리키고 방아쇠를 당겨 건지세요');
      session.addEventListener('end', () => { vrBoard.visible = false; camera.position.set(0, 2.1, 0); });
    };
  }
})();

// ---------- 루프 ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime; uTime.value = t;
  if (!renderer.xr.isPresenting) { rig.rotation.y = yaw; camera.rotation.x = pitch; }
  for (const f of floaters) {
    f.x += f.vx * dt; f.z += f.vz * dt; f.vx *= 0.995; f.vz *= 0.995;
    const r = Math.hypot(f.x, f.z + 1); if (r < 2.9) { f.vx += (f.x / r) * dt; f.vz += ((f.z + 1) / r) * dt; } if (r > 11) { f.vx -= (f.x / r) * dt * 0.5; f.vz -= ((f.z + 1) / r) * dt * 0.5; }
    const y = wave(f.x, f.z, t) + (f.kind === 'animal' && f.def.type !== 'turtle' ? Math.sin(t * 1.5 + f.phase) * 0.06 : 0.02);
    f.mesh.position.set(f.x, y, f.z); f.mesh.rotation.y += f.spin * dt;
    if (f.def.type === 'fish') f.mesh.rotation.y = Math.atan2(-f.vz, f.vx);
  }
  if (held) { held.mesh.rotation.y += dt * 1.5; }
  for (const b of binObjs) {
    b.glow = Math.max(0, b.glow - dt * 2); b.err = Math.max(0, b.err - dt * 2.5);
    b.mat.emissive.setRGB(b.err * 0.8, b.glow * 0.6, b.glow * 0.2);
    b.g.position.y = 0.5 + b.glow * 0.08 + Math.sin(b.err * 20) * b.err * 0.03;
  }
  if (playing) {
    timeLeft -= dt; $('time').textContent = Math.max(0, Math.ceil(timeLeft));
    if (renderer.xr.isPresenting && Math.floor(timeLeft) !== Math.floor(timeLeft + dt)) vrSay($('msg').textContent);
    if (timeLeft <= 0) finish();
  }
  renderer.render(scene, camera);
});
