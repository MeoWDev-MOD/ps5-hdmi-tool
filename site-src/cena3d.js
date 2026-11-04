// Modelos 3D do site: a peça girando na primeira dobra e o reparo montado camada por camada, conforme a rolagem.
// As faces do flex vêm do desenho técnico da peça (docs/img/3d). Placa e chips são desenhados aqui: ilustram o reparo, não são foto.
// Gerar o arquivo final: ver site-src/LEIA-ME.md.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const IMG = new URL("../img/", import.meta.url).href;
const PI = Math.PI;
const cl = (x) => Math.max(0, Math.min(1, x));
const sm = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const prata = () => new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 1, roughness: 0.32 });

// Medidas em unidades da cena. Flex: mesma proporção do desenho (593 x 782).
const W = 4, H = (W * 782) / 593, T = 0.05;
const AZUL_NOITE = 0x0c0920;

export function has3D() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

function base(canvas, dpr) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dpr));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  return { renderer, scene };
}

function textura(renderer, nome) {
  return new THREE.TextureLoader().loadAsync(IMG + nome).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  });
}

function telaDeCanvas(renderer, w, h, desenho, cor = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  desenho(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (cor) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function caixaArredondada(w, d, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: h - 0.02, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-PI / 2);
  g.translate(0, 0.01, 0);
  return g;
}

// ---------- chips ----------
function chip(renderer, { corpo, altura = 0.14, pinos, pinoLargo, passa, linhas }) {
  const g = new THREE.Group();
  const matCorpo = new THREE.MeshStandardMaterial({ color: 0x17171c, metalness: 0.15, roughness: 0.58 });
  const c = new THREE.Mesh(caixaArredondada(corpo, corpo, altura, 0.05), matCorpo);
  c.position.y = 0.03;
  g.add(c);
  const tex = telaDeCanvas(renderer, 512, 512, (x, w) => {
    x.clearRect(0, 0, w, w);
    x.textAlign = "center";
    x.fillStyle = "#9b9ba6";
    linhas.forEach(([txt, y, px, fonte]) => { x.font = `${fonte || 600} ${px}px "JetBrains Mono",Consolas,monospace`; x.fillText(txt, w / 2, y); });
    x.beginPath(); x.arc(58, 454, 20, 0, 7); x.fillStyle = "#54545e"; x.fill();
  });
  const matTopo = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, depthWrite: false });
  const topo = new THREE.Mesh(new THREE.PlaneGeometry(corpo * 0.96, corpo * 0.96), matTopo);
  topo.rotation.x = -PI / 2;
  topo.position.y = 0.03 + altura + 0.003;
  g.add(topo);
  const matPino = prata();
  const n = pinos * 4;
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), matPino, n);
  const m = new THREE.Matrix4(), meio = (corpo + passa) / 2 - passa / 2 + passa / 2;
  const passo = (corpo * 0.86) / pinos;
  for (let i = 0; i < pinos; i++) {
    const p = (i - (pinos - 1) / 2) * passo;
    [[meio, p, passa, pinoLargo], [-meio, p, passa, pinoLargo], [p, meio, pinoLargo, passa], [p, -meio, pinoLargo, passa]].forEach(([x, z, sx, sz], k) => {
      m.makeScale(sx, 0.022, sz);
      m.setPosition(x, 0.014, z);
      inst.setMatrixAt(i * 4 + k, m);
    });
  }
  g.add(inst);
  g.userData.mats = [matCorpo, matTopo, matPino];
  return g;
}
const transparencia = (obj, a) => obj.userData.mats.forEach((m) => { m.transparent = a < 1 || m.map != null; m.opacity = a; });

// ---------- flex com os componentes montados ----------
function flex(topo, baseTex) {
  const g = new THREE.Group();
  const faz = (map) => new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.32, metalness: 0.12, depthWrite: false });
  const plano = new THREE.PlaneGeometry(W, H);
  const mT = faz(topo), mB = faz(baseTex);
  const t = new THREE.Mesh(plano, mT);
  t.rotation.x = -PI / 2; t.position.y = T / 2; t.renderOrder = 3;
  const b = new THREE.Mesh(plano, mB);
  b.rotation.set(PI / 2, 0, PI); b.position.y = -T / 2; b.renderOrder = 2;
  g.add(b, t);
  // lateral: mesmo recorte da peça, com o canto chanfrado do desenho
  const s = new THREE.Shape();
  s.moveTo(-W / 2, -H / 2); s.lineTo(W / 2, -H / 2); s.lineTo(W / 2, H / 2); s.lineTo(-W / 2 + W * 0.335, H / 2); s.lineTo(-W / 2, H / 2 - H * 0.25); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
  geo.rotateX(-PI / 2); geo.translate(0, -T / 2, 0);
  const mS = new THREE.MeshStandardMaterial({ color: 0xc97a0c, transparent: true, opacity: 0.85, roughness: 0.4, depthWrite: false });
  const lado = new THREE.Mesh(geo, [new THREE.MeshBasicMaterial({ visible: false }), mS]);
  lado.renderOrder = 1;
  g.add(lado);

  // Regulador U1 (SOT-23-5) e capacitores C1 a C7, nas posições do desenho.
  const pos = (u, v) => [(u - 0.5) * W, (v - 0.5) * H];
  const [ux, uz] = pos(0.835, 0.905);
  const u1 = new THREE.Group();
  const corpo = new THREE.Mesh(caixaArredondada(0.34, 0.6, 0.2, 0.02), new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.55, metalness: 0.1 }));
  corpo.position.y = 0.03;
  u1.add(corpo);
  const perna = prata();
  [[-1, -0.2], [-1, 0], [-1, 0.2], [1, -0.2], [1, 0.2]].forEach(([l, z]) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.09), perna);
    p.position.set(l * 0.24, 0.05, z);
    u1.add(p);
  });
  u1.position.set(ux, T / 2, uz);
  g.add(u1);
  const caps = [[0.127, 0.8], [0.127, 0.848], [0.127, 0.897], [0.127, 0.947], [0.466, 0.84], [0.466, 0.888], [0.466, 0.937]];
  const mCap = new THREE.MeshStandardMaterial({ color: 0x7a6650, roughness: 0.6 });
  caps.forEach(([u, v]) => {
    const [x, z] = pos(u, v);
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.1), mCap);
    c.position.set(x, T / 2 + 0.05, z);
    g.add(c);
    [-1, 1].forEach((l) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.095, 0.105), perna); e.position.set(x + l * 0.085, T / 2 + 0.05, z); g.add(e); });
  });
  g.userData.mats = [mT, mB, mS];
  g.userData.u1 = new THREE.Vector3(ux, T / 2 + 0.2, uz);
  return g;
}

const MN = (r) => chip(r, { corpo: 2.36, altura: 0.14, pinos: 20, pinoLargo: 0.06, passa: 0.15, linhas: [["nuvoton", 215, 70, 700], ["MN864739", 300, 62]] });
const RTD = (r) => chip(r, { corpo: 1.74, altura: 0.14, pinos: 13, pinoLargo: 0.06, passa: 0.14, linhas: [["REALTEK", 205, 62, 700], ["RTD2175P", 290, 62]] });

// ---------- a peça girando na primeira dobra ----------
export async function initHero(canvas, { onReady } = {}) {
  const { renderer, scene } = base(canvas, 1.75);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  cam.position.set(0, 0, 16.2);
  const luz = new THREE.DirectionalLight(0xffffff, 1.1);
  luz.position.set(3, 6, 8);
  scene.add(luz);
  const [t, b] = await Promise.all([textura(renderer, "3d/flex-topo.webp"), textura(renderer, "3d/flex-base.webp")]);
  const giro = new THREE.Group(), pe = new THREE.Group();
  scene.add(giro);
  giro.add(pe);
  pe.rotation.x = PI / 2;
  const peca = flex(t, b);
  peca.position.y = -0.55;
  const c = MN(renderer);
  c.position.set(0, 0.85, (0.435 - 0.5) * H);
  pe.add(peca, c);
  pe.position.y = 0.1;

  let vx = 0, rot = -0.55, inc = -0.22, arrasta = false, px = 0, py = 0, parado = 0, vis = true, raf = 0, ult = performance.now();
  const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const medir = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.position.z = w / h < 0.9 ? 19 : 16.2;
    cam.updateProjectionMatrix();
  };
  new ResizeObserver(medir).observe(canvas);
  medir();
  const desenho = (agora) => {
    const dt = Math.min(0.05, (agora - ult) / 1000);
    ult = agora;
    if (!arrasta) {
      parado += dt;
      if (!calmo) vx += (0.34 - vx) * Math.min(1, dt * 1.2);
      rot += vx * dt;
      inc += (-0.22 + 0.05 * Math.sin(agora / 1500) - inc) * Math.min(1, dt * 2);
    }
    giro.rotation.y = rot;
    giro.rotation.x = -inc;
    // chip desce e sobe devagar: mostra o encaixe por cima da peça
    c.position.y = 0.52 + 0.3 * (0.5 + 0.5 * Math.sin(agora / 1300));
    renderer.render(scene, cam);
    if (vis && !document.hidden && !calmo) raf = requestAnimationFrame(desenho);
    else raf = 0;
  };
  const toca = () => { if (!raf) raf = requestAnimationFrame(desenho); };
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis) { ult = performance.now(); toca(); } }).observe(canvas);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && vis) { ult = performance.now(); toca(); } });
  canvas.addEventListener("pointerdown", (e) => { arrasta = true; px = e.clientX; py = e.clientY; vx = 0; canvas.setPointerCapture?.(e.pointerId); canvas.classList.add("pega"); });
  canvas.addEventListener("pointermove", (e) => {
    if (!arrasta) return;
    rot += (e.clientX - px) * 0.012;
    inc = Math.max(-0.9, Math.min(0.7, inc + (e.clientY - py) * -0.006));
    vx = (e.clientX - px) * 0.25;
    px = e.clientX; py = e.clientY;
    toca();
  });
  const solta = () => { arrasta = false; parado = 0; canvas.classList.remove("pega"); };
  canvas.addEventListener("pointerup", solta);
  canvas.addEventListener("pointercancel", solta);
  raf = requestAnimationFrame(desenho);
  onReady?.();
  return {
    pose: (r, i, y) => { rot = r; inc = i; c.position.y = y; renderer.render(scene, cam); },
  };
}

// ---------- placa do PS5 (ilustração) ----------
const BW = 22, BD = 15;
const VIAS_ANEL = [[-8.6, 1.4], [-7.4, 5.3], [-8.9, 5.9], [-6.1, -2.1], [-8.3, -3.4], [-4.3, -3.6], [4.3, -3.5], [6.5, -2.2], [8.4, -3.5], [8.7, 1.4], [7.4, 5.2], [8.9, 5.9], [-9.1, -6], [-6.3, -5.6], [6.1, -5.7], [9.1, -6]];
const FUROS = [[-7.6, -0.8], [-5.2, -5.3], [7.6, -0.7], [5.2, -5.3], [-9.3, 3.5], [9.3, 3.5]];

function desenhaPlaca(x, S, c, comRuido) {
  const X = (v) => (v + BW / 2) * S, Z = (v) => (v + BD / 2) * S;
  x.fillStyle = c.mascara;
  x.fillRect(0, 0, BW * S, BD * S);
  // cobre: faixa orgânica em volta, como na placa de verdade
  x.lineJoin = x.lineCap = "round";
  x.strokeStyle = x.fillStyle = c.cobre;
  x.lineWidth = 3.3 * S;
  x.beginPath();
  x.moveTo(X(-8.2), Z(8));
  x.bezierCurveTo(X(-8.8), Z(3), X(-8.8), Z(-0.8), X(-6.4), Z(-3.2));
  x.bezierCurveTo(X(-4.2), Z(-5), X(4.2), Z(-5), X(6.4), Z(-3.2));
  x.bezierCurveTo(X(8.8), Z(-0.8), X(8.8), Z(3), X(8.2), Z(8));
  x.stroke();
  [[-11.2, -8, 7.9, 4.4], [3.3, -8, 7.9, 4.4]].forEach(([a, b, w, h]) => { x.beginPath(); x.roundRect(X(a), Z(b), w * S, h * S, 1.2 * S); x.fill(); });
  // ilha verde do conector e "pescoço" com as trilhas de vídeo
  x.fillStyle = c.mascara;
  x.beginPath(); x.roundRect(X(-2.9), Z(-8), 5.8 * S, 3 * S, 1.1 * S); x.fill();
  x.beginPath(); x.roundRect(X(-1.7), Z(-6), 3.4 * S, 5 * S, 0.5 * S); x.fill();
  // furos e vias grandes no cobre
  VIAS_ANEL.forEach(([a, b]) => {
    x.fillStyle = c.mascara; x.beginPath(); x.arc(X(a), Z(b), 0.36 * S, 0, 7); x.fill();
    x.fillStyle = c.pad; x.beginPath(); x.arc(X(a), Z(b), 0.2 * S, 0, 7); x.fill();
  });
  FUROS.forEach(([a, b]) => { x.fillStyle = c.furo; x.beginPath(); x.arc(X(a), Z(b), 0.42 * S, 0, 7); x.fill(); });
  // trilhas
  x.strokeStyle = c.trilha;
  x.lineWidth = 0.055 * S;
  for (let i = 0; i < 4; i++) {
    for (const d of [-0.08, 0.08]) {
      const a = -0.72 + i * 0.48 + d;
      x.beginPath(); x.moveTo(X(a), Z(-1.1)); x.lineTo(X(a), Z(-3.4)); x.lineTo(X(a * 1.35), Z(-4.2)); x.lineTo(X(a * 1.35), Z(-5.9)); x.stroke();
    }
  }
  for (let i = 0; i < 9; i++) {
    x.beginPath(); x.moveTo(X(-1.2), Z(-0.6 + i * 0.16)); x.lineTo(X(-3.2 - i * 0.05), Z(-0.6 + i * 0.16)); x.lineTo(X(-5 - i * 0.08), Z(1.4 + i * 0.18)); x.lineTo(X(-5 - i * 0.08), Z(8)); x.stroke();
    x.beginPath(); x.moveTo(X(1.2), Z(-0.6 + i * 0.16)); x.lineTo(X(3 + i * 0.05), Z(-0.6 + i * 0.16)); x.lineTo(X(4.8 + i * 0.09), Z(1.6 + i * 0.18)); x.lineTo(X(4.8 + i * 0.09), Z(8)); x.stroke();
  }
  for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(X(-0.6 + i * 0.24), Z(1.2)); x.lineTo(X(-0.6 + i * 0.24), Z(8)); x.stroke(); }
  // pads do RTD2175P: é o que aparece quando o chip sai e através do flex
  x.fillStyle = c.pad;
  const n = 13, passo = (1.74 * 0.86) / n, l = 0.2, g = 0.075, d = 0.92;
  for (let i = 0; i < n; i++) {
    const p = (i - (n - 1) / 2) * passo;
    x.fillRect(X(p - g / 2), Z(-d - l / 2), g * S, l * S);
    x.fillRect(X(p - g / 2), Z(d - l / 2), g * S, l * S);
    x.fillRect(X(-d - l / 2), Z(p - g / 2), l * S, g * S);
    x.fillRect(X(d - l / 2), Z(p - g / 2), l * S, g * S);
  }
  x.fillRect(X(-0.56), Z(-0.56), 1.12 * S, 1.12 * S);
  // serigrafia: cantos do chip
  x.strokeStyle = c.seri;
  x.lineWidth = 0.04 * S;
  const q = 1.24, a = 0.26;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    x.beginPath(); x.moveTo(X(sx * q), Z(sz * (q - a))); x.lineTo(X(sx * q), Z(sz * q)); x.lineTo(X(sx * (q - a)), Z(sz * q)); x.stroke();
  });
  if (comRuido) {
    // cobre riscado e máscara com leve variação, para não parecer plástico liso
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    x.globalAlpha = 0.09;
    for (let i = 0; i < 900; i++) {
      x.strokeStyle = r() > 0.5 ? "#fff" : "#000";
      x.lineWidth = 0.6 + r() * 1.2;
      const px = r() * BW * S, py = r() * BD * S, an = r() * 6.3, le = 8 + r() * 46;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(an) * le, py + Math.sin(an) * le); x.stroke();
    }
    x.globalAlpha = 0.55;
    x.fillStyle = "#07401f";
    for (let i = 0; i < 1500; i++) { const px = X(-1.7 + r() * 3.4), py = Z(-1 + r() * 8); if (Math.abs(px - X(0)) > 0) x.fillRect(px, py, 2, 2); }
    x.globalAlpha = 1;
  }
}

function placa(renderer, pequena) {
  const S = pequena ? 56 : 96;
  const w = Math.round(BW * S), h = Math.round(BD * S);
  const cor = telaDeCanvas(renderer, w, h, (x) => desenhaPlaca(x, S, { mascara: "#0b5229", cobre: "#b56f33", trilha: "#15703a", pad: "#c9c9c4", seri: "#dfe6dc", furo: "#070911" }, true));
  // verde = aspereza, azul = metal
  const orm = telaDeCanvas(renderer, Math.round(w / 2), Math.round(h / 2), (x) => desenhaPlaca(x, S / 2, { mascara: "rgb(0,120,12)", cobre: "rgb(0,105,190)", trilha: "rgb(0,92,30)", pad: "rgb(0,70,255)", seri: "rgb(0,170,0)", furo: "rgb(0,255,0)" }, false), false);
  const mat = new THREE.MeshStandardMaterial({ map: cor, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1, envMapIntensity: 0.62 });
  const g = new THREE.Group();
  const topo = new THREE.Mesh(new THREE.PlaneGeometry(BW, BD), mat);
  topo.rotation.x = -PI / 2;
  g.add(topo);
  const lat = new THREE.Mesh(new THREE.BoxGeometry(BW, 0.2, BD), new THREE.MeshStandardMaterial({ color: 0x0d3b20, roughness: 0.7 }));
  lat.position.y = -0.102;
  g.add(lat);

  // conector HDMI: chapa com o perfil trapezoidal, aberto para a borda da placa
  const perfil = new THREE.Shape();
  perfil.moveTo(-1.65, 0.05); perfil.lineTo(1.65, 0.05); perfil.lineTo(1.65, 0.62); perfil.lineTo(1.28, 0.98); perfil.lineTo(-1.28, 0.98); perfil.lineTo(-1.65, 0.62); perfil.closePath();
  const geoH = new THREE.ExtrudeGeometry(perfil, { depth: 2.2, bevelEnabled: false });
  const hdmi = new THREE.Mesh(geoH, new THREE.MeshStandardMaterial({ color: 0xb9bbc2, metalness: 1, roughness: 0.34 }));
  hdmi.position.set(0, 0, -7.45);
  g.add(hdmi);
  // abas de solda da carcaça
  [-1.78, 1.78].forEach((x) => { const a = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.5), hdmi.material); a.position.set(x, 0.25, -6); g.add(a); });
  const brilhoHdmi = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.5, 0.02), new THREE.MeshBasicMaterial({ color: 0xffb01f, transparent: true, opacity: 0, toneMapped: false }));
  brilhoHdmi.position.set(0, 0.5, -5.24);
  g.add(brilhoHdmi);

  // componentes em volta, com semente fixa
  const mb = new THREE.Group();
  let s = 91;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const corpoPreto = new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.55 });
  const corpoCap = new THREE.MeshStandardMaterial({ color: 0x8b7458, roughness: 0.6 });
  const corpoRes = new THREE.MeshStandardMaterial({ color: 0x26262a, roughness: 0.6 });
  const ponta = prata();
  const lista = [];
  for (let i = 0; lista.length < 46 && i < 500; i++) {
    const a = -5 + r() * 10, b = -2.6 + r() * 9;
    if (Math.abs(a) < 2.5 && b > -2.9 && b < 3.6) continue;
    if (Math.abs(a) < 1.9 && b < -1) continue;
    if (lista.some(([u, v]) => Math.hypot(u - a, v - b) < 0.55)) continue;
    lista.push([a, b, r() > 0.5]);
  }
  lista.forEach(([a, b, deitado]) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(deitado ? 0.16 : 0.1, 0.09, deitado ? 0.1 : 0.16), r() > 0.5 ? corpoCap : corpoRes);
    c.position.set(a, 0.05, b);
    mb.add(c);
    for (const l of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(deitado ? 0.07 : 0.104, 0.094, deitado ? 0.104 : 0.07), ponta);
      e.position.set(a + (deitado ? l * 0.11 : 0), 0.05, b + (deitado ? 0 : l * 0.11));
      mb.add(e);
    }
  });
  // os quatro pares de capacitores nas trilhas de vídeo
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.32), corpoCap); c.position.set(-0.72 + i * 0.48, 0.05, -3.75); mb.add(c); }
  // PMIC ao lado, de onde o fio costuma ser puxado
  const pmic = new THREE.Mesh(caixaArredondada(1.25, 1.25, 0.16, 0.04), corpoPreto);
  pmic.position.set(-3.8, 0.02, 2.9);
  mb.add(pmic);
  g.add(mb);

  // NOR: chip de 8 pinos
  const nor = chip(renderer, { corpo: 1.3, altura: 0.17, pinos: 4, pinoLargo: 0.13, passa: 0.16, linhas: [["NOR", 270, 118, 800]] });
  nor.position.set(6.6, 0, 3.4);
  g.add(nor);
  return { g, brilhoHdmi, nor, pmic };
}

// Tubo com brilho correndo: mostra a tensão passando.
function tuboDeSinal(renderer, pontos, cor, raio = 0.034, passos = 60) {
  const curva = new THREE.CatmullRomCurve3(pontos.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.15);
  const tex = telaDeCanvas(renderer, 128, 8, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#ffffff00"); g.addColorStop(0.5, "#ffffffb0"); g.addColorStop(1, "#ffffff00");
    x.fillStyle = cor; x.fillRect(0, 0, w, h);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, Math.round(curva.getLength() * 0.7)), 1);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
  const m = new THREE.Mesh(new THREE.TubeGeometry(curva, passos, raio, 8, false), mat);
  m.renderOrder = 6;
  m.userData.pontaFinal = pontos[pontos.length - 1];
  return m;
}

// ---------- o reparo montado camada por camada: s vai de 0 a 5 com a rolagem ----------
export async function initStory(canvas, camadaRotulos, { pequena = false } = {}) {
  const { renderer, scene } = base(canvas, pequena ? 1.5 : 1.75);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const luz = new THREE.DirectionalLight(0xffffff, 0.75);
  luz.position.set(-4, 10, 7);
  scene.add(luz);
  const [t, b, tela] = await Promise.all([textura(renderer, "3d/flex-topo.webp"), textura(renderer, "3d/flex-base.webp"), textura(renderer, "ps5-hdmi-tool-tela-do-programa.webp")]);

  const pl = placa(renderer, pequena);
  scene.add(pl.g);
  const rtd = RTD(renderer);
  scene.add(rtd);
  const anel = new THREE.Mesh(new THREE.RingGeometry(1.42, 1.56, 48), new THREE.MeshBasicMaterial({ color: 0xff2b3d, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
  anel.rotation.x = -PI / 2;
  anel.position.y = 0.04;
  scene.add(anel);
  const peca = flex(t, b);
  const zPeca = -(0.435 - 0.5) * H; // o centro do encaixe da peça fica sobre os pads
  peca.position.z = zPeca;
  scene.add(peca);
  const mn = MN(renderer);
  mn.position.z = 0;
  scene.add(mn);

  // tensões: 3,3 V entra no U1 e sai 1,8 V para o chip novo
  const u1 = peca.userData.u1.clone().add(new THREE.Vector3(0, 0, zPeca));
  const ALT = T + 0.11;
  const v33 = tuboDeSinal(renderer, [[1.4, ALT, 1.5], [0.9, ALT, 1.95], [0.92, ALT, 2.45], [u1.x - 0.22, ALT, u1.z - 0.02]], "#ff4757");
  const v18 = tuboDeSinal(renderer, [[u1.x + 0.26, ALT + 0.02, u1.z - 0.1], [1.92, ALT, u1.z - 0.6], [1.86, ALT, 1.56], [1.25, ALT + 0.03, 1.16]], "#ffb01f");
  scene.add(v33, v18);
  // o fio que a interposer dispensa
  const fio = tuboDeSinal(renderer, [[-3.6, 0.2, 2.5], [-3.1, 1.5, 2.1], [-1.85, 1.15, 1.45], [-1.15, 0.26, 1.06]], "#ff4757", 0.045);
  scene.add(fio);

  // tela do programa e a ligação até a NOR
  const janela = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 6.8 * (552 / 1022)), new THREE.MeshBasicMaterial({ map: tela, transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide }));
  janela.position.set(5.2, 4.8, -1.6);
  janela.rotation.set(-0.3, -0.22, -0.04);
  scene.add(janela);
  const leva = tuboDeSinal(renderer, [[5.6, 2.6, -1.2], [6.2, 1.7, 0.8], [6.6, 0.9, 2.3], [6.6, 0.28, 3.3]], "#a78bfa", 0.05);
  scene.add(leva);
  const video = tuboDeSinal(renderer, [[0.48, ALT + 0.2, -1.2], [0.48, 0.14, -2.2], [0.4, 0.12, -4], [0.3, 0.5, -5.25]], "#ffb01f", 0.05);
  scene.add(video);
  const brilhoNor = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.28, 40), new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
  brilhoNor.rotation.x = -PI / 2;
  brilhoNor.position.set(6.6, 0.04, 3.4);
  scene.add(brilhoNor);

  // Posições da câmera ao longo da rolagem: [s, posição, para onde olha]
  const CAM = [
    [0, [2.7, 6.2, 7.2], [0, 0.1, 0.1]],
    [0.8, [2.2, 7.4, 6.6], [0, 0.7, 0.1]],
    [1.72, [-1.05, 5.1, 5.9], [-0.05, 0.05, 0.42]],
    [2.72, [1.5, 7.2, 6.8], [0, 0.2, 0.45]],
    [3.3, [4.1, 3.5, 7.3], [1.05, 0.1, 1.45]],
    [3.72, [-1.2, 6.8, 8.1], [-1.2, 0.2, 1.3]],
    [4.42, [5.2, 11.5, 16.6], [2.5, 1.5, 0.6]],
    [5, [1.2, 12.6, 17.6], [1.5, 1.2, -0.6]],
  ];
  const quadro = (s) => {
    let i = 0;
    while (i < CAM.length - 2 && s > CAM[i + 1][0]) i++;
    const [a, pa, la] = CAM[i], [z, pz, lz] = CAM[i + 1];
    const k = sm(a, z, s);
    return { p: pa.map((v, n) => mix(v, pz[n], k)), l: la.map((v, n) => mix(v, lz[n], k)) };
  };

  // Rótulos em HTML presos a pontos da cena
  const ROTULOS = [
    { txt: "Realtek RTD2175P · R$ 1.700", cor: "vm", pos: () => [0, rtd.position.y + 0.3, -1.05], de: 0, ate: 0.86 },
    { txt: "Os pads aparecem através do flex", cor: "am", pos: () => [0, 0.3, -2.1], de: 1.46, ate: 2.02 },
    { txt: "MN864739 · R$ 80 em média", cor: "am", pos: () => [0, mn.position.y + 0.3, -1.4], de: 2.28, ate: 3 },
    { txt: "3,3 V", cor: "vm", pos: () => [1.1, 0.34, 1.52], de: 3.16, ate: 3.54 },
    { txt: "U1", cor: "br", pos: () => [u1.x, 0.56, u1.z], de: 3.12, ate: 3.54 },
    { txt: "1,8 V", cor: "am", pos: () => [2.05, 0.34, 1.82], de: 3.2, ate: 3.54 },
    { txt: "Sem fio puxado do PMIC", cor: "vm", pos: () => [-2.9, 1.9, 2], de: 3.54, ate: 3.96 },
    { txt: "PS5 HDMI Tool grava a NOR", cor: "ro", pos: () => [6.6, 0.95, 3.4], de: 4.22, ate: 4.76 },
    { txt: "Vídeo de volta", cor: "am", pos: () => [0, 1.5, -6.2], de: 4.72, ate: 5.1 },
  ].map((r) => {
    const el = document.createElement("span");
    el.className = `l3d ${r.cor}`;
    el.textContent = r.txt;
    camadaRotulos.append(el);
    return { ...r, el, v: new THREE.Vector3() };
  });

  let sAlvo = 0, s = 0, vis = false, raf = 0, ult = performance.now(), largura = 1, altura = 1, fatorCam = 1;
  const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const medir = () => {
    largura = canvas.clientWidth; altura = canvas.clientHeight;
    renderer.setSize(largura, altura, false);
    cam.aspect = largura / altura;
    fatorCam = cam.aspect < 0.95 ? 1.42 : cam.aspect < 1.25 ? 1.14 : 1;
    cam.updateProjectionMatrix();
    desenhaQuadro(performance.now());
  };

  function aplica(agora) {
    // Realtek: acende em vermelho, levanta e some
    const sobe = sm(0.34, 0.95, s);
    rtd.position.y = 0.012 + sobe * 3.6;
    rtd.rotation.y = sobe * 0.5;
    rtd.visible = sobe < 0.995;
    transparencia(rtd, 1 - sm(0.68, 0.98, sobe));
    anel.material.opacity = (1 - sm(0.3, 0.55, s)) * (0.5 + 0.5 * Math.sin(agora / 240));
    anel.visible = s < 0.56;
    // interposer desce sobre os pads
    const f = sm(1, 1.66, s);
    peca.visible = s >= 0.92;
    peca.position.y = mix(4.1, T / 2 + 0.012, f);
    peca.rotation.z = (1 - f) * -0.32;
    peca.rotation.y = (1 - f) * 0.55;
    const [mT, mB, mS] = peca.userData.mats;
    const entra = sm(0.92, 1.14, s);
    const ve = 1 - 0.2 * sm(1.5, 1.72, s) * (1 - sm(2.05, 2.3, s)); // mais transparente na hora de alinhar
    mT.opacity = entra * ve; mB.opacity = entra * ve; mS.opacity = 0.85 * entra;
    // chip novo desce por cima
    const n = sm(2.02, 2.72, s);
    mn.visible = s >= 1.96;
    mn.position.y = mix(3.8, T + 0.016, n);
    mn.rotation.y = (1 - n) * -0.6;
    transparencia(mn, sm(1.96, 2.18, s));
    // tensões
    const vt = sm(3.05, 3.28, s) * (1 - sm(4.1, 4.4, s) * 0.45);
    const corre = calmo ? 0 : agora / 1000;
    v33.material.opacity = vt; v33.material.map.offset.x = -corre * 0.9;
    v18.material.opacity = sm(3.16, 3.4, s) * (1 - sm(4.1, 4.4, s) * 0.45); v18.material.map.offset.x = -corre * 0.9;
    fio.material.opacity = sm(3.42, 3.56, s) * (1 - sm(3.72, 3.96, s));
    fio.material.map.offset.x = -corre;
    // programa grava a NOR e o vídeo volta
    const pr = sm(4.04, 4.42, s);
    janela.visible = pr > 0.001;
    janela.material.opacity = pr;
    janela.position.y = mix(3, 4.5, pr);
    leva.material.opacity = sm(4.2, 4.42, s);
    leva.material.map.offset.x = -corre * 0.8;
    brilhoNor.material.opacity = pr * (0.45 + 0.45 * Math.sin(agora / 260));
    video.material.opacity = sm(4.62, 4.86, s);
    video.material.map.offset.x = -corre * 0.9;
    pl.brilhoHdmi.material.opacity = sm(4.72, 4.92, s) * (0.7 + 0.3 * Math.sin(agora / 320));
    // câmera
    const { p, l } = quadro(s);
    const alvo = new THREE.Vector3(...l);
    cam.position.set(...p).sub(alvo).multiplyScalar(fatorCam).add(alvo);
    cam.lookAt(alvo);
  }

  function rotulos() {
    ROTULOS.forEach((r) => {
      const a = sm(r.de, r.de + 0.1, s) * (1 - sm(r.ate - 0.1, r.ate, s));
      r.el.style.opacity = a;
      if (a <= 0.01) { r.el.style.visibility = "hidden"; return; }
      r.el.style.visibility = "visible";
      r.v.set(...r.pos()).project(cam);
      const x = (r.v.x * 0.5 + 0.5) * largura, y = (-r.v.y * 0.5 + 0.5) * altura;
      const mw = r.el.offsetWidth / 2 + 8;
      r.el.style.transform = `translate(${Math.max(mw, Math.min(largura - mw, x))}px,${Math.max(26, Math.min(altura - 12, y))}px) translate(-50%,-100%)`;
    });
  }

  function desenhaQuadro(agora) {
    aplica(agora);
    renderer.render(scene, cam);
    rotulos();
  }

  const laço = (agora) => {
    const dt = Math.min(0.05, (agora - ult) / 1000);
    ult = agora;
    s += (sAlvo - s) * Math.min(1, dt * 7);
    if (Math.abs(sAlvo - s) < 0.0005) s = sAlvo;
    desenhaQuadro(agora);
    raf = vis && !document.hidden ? requestAnimationFrame(laço) : 0;
  };
  const toca = () => { if (!raf && vis) { ult = performance.now(); raf = requestAnimationFrame(laço); } };
  new ResizeObserver(medir).observe(canvas);
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; toca(); }, { rootMargin: "120px" }).observe(canvas);
  document.addEventListener("visibilitychange", toca);
  medir();

  return {
    /** s de 0 a 5. Com imediato, pula a animação (menos movimento e testes). */
    ir(valor, imediato = false) {
      sAlvo = Math.max(0, Math.min(5, valor));
      if (imediato || calmo) { s = sAlvo; desenhaQuadro(performance.now()); }
      toca();
    },
  };
}
export const FUNDO = AZUL_NOITE;
