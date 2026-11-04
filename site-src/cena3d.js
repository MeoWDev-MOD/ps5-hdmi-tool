// Modelos 3D do site: a peça girando na primeira dobra e o reparo montado camada por camada, conforme a rolagem.
// As faces e os pads do flex vêm do desenho técnico da peça (docs/img/3d). A placa é desenhada aqui, a partir de fotos da placa:
// posição do CXD, da NOR, do PMIC do Realtek e dos furos medidas na foto; contorno do cobre em placa-cobre.json.
// Gerar o arquivo final: ver site-src/LEIA-ME.md.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import COBRE from "./placa-cobre.json";

const IMG = new URL("../img/", import.meta.url).href;
const PI = Math.PI;
const cl = (x) => Math.max(0, Math.min(1, x));
const sm = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const prata = () => new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 1, roughness: 0.32 });

// Medidas em unidades da cena. Flex: mesma proporção do desenho (593 x 782).
const W = 4, H = (W * 782) / 593, T = 0.05;
const AZUL_NOITE = 0x0c0920;
// Do pixel do desenho da peça (593 x 782) para a cena. Centro dos footprints do RTD2175P e do MN864739: (289,5; 333).
const PX = 593 / W;
const pecaX = (px) => (px - 296.5) / PX, pecaZ = (py) => (py - 391) / PX;
const placaX = (px) => (px - 289.5) / PX, placaZ = (py) => (py - 333) / PX;

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

// ---------- peças em comum ----------
const sorteio = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

// Perna "asa de gaivota" de CI: sai do corpo, desce e deita no pad. Aponta para +x.
function pernaGeo(comp, alt, larg, esp = 0.018) {
  const s = new THREE.Shape();
  s.moveTo(0, alt); s.lineTo(comp * 0.34, alt); s.lineTo(comp * 0.58, esp); s.lineTo(comp, esp);
  s.lineTo(comp, 0); s.lineTo(comp * 0.5, 0); s.lineTo(comp * 0.26, alt - esp); s.lineTo(0, alt - esp);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: larg, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -larg / 2);
  return g;
}

// lista: [x, z, ângulo em volta de y]
function pernas(geo, mat, lista, y = 0) {
  const inst = new THREE.InstancedMesh(geo, mat, lista.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), um = new THREE.Vector3(1, 1, 1), eixo = new THREE.Vector3(0, 1, 0);
  lista.forEach(([x, z, a], i) => { q.setFromAxisAngle(eixo, a); m.compose(new THREE.Vector3(x, y, z), q, um); inst.setMatrixAt(i, m); });
  return inst;
}

function topoDeChip(renderer, w, d, y, desenho, { px = 1024, cor = "#17171c", rugosidade = 0.62, ruido = 0.5, giro = 0 } = {}) {
  const pw = d > w ? Math.round((px * w) / d) : px, ph = w > d ? Math.round((px * d) / w) : px;
  const tex = telaDeCanvas(renderer, pw, ph, (x, W2, H2) => {
    x.fillStyle = cor; x.fillRect(0, 0, W2, H2);
    const r = sorteio(77);
    x.globalAlpha = 0.5 * ruido;
    for (let i = 0; i < (W2 * H2) / 26; i++) { x.fillStyle = r() > 0.5 ? "#3c3c44" : "#0a0a0e"; x.fillRect(r() * W2, r() * H2, 1.6, 1.6); }
    x.globalAlpha = 1;
    desenho?.(x, W2, H2);
  });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: rugosidade, metalness: 0.08 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.set(-PI / 2, 0, giro);
  m.position.y = y;
  return m;
}

const LETRA = 'Arial,"Helvetica Neue",Roboto,sans-serif';
function escreve(x, txt, cx, cy, px, { peso = 600, cor = "#8d8d97", fonte = LETRA, espaco = 0 } = {}) {
  x.font = `${peso} ${px}px ${fonte}`;
  x.fillStyle = cor;
  x.textAlign = "center";
  x.textBaseline = "middle";
  if ("letterSpacing" in x) x.letterSpacing = `${espaco}px`;
  x.fillText(txt, cx, cy);
}

// Sombra macia de contato: um plano escuro embaixo da peça.
function sombraPlano(renderer, w, d) {
  const tex = telaDeCanvas(renderer, 128, 128, (x, a) => {
    x.clearRect(0, 0, a, a);
    x.shadowColor = "#000"; x.shadowBlur = 16;
    x.fillStyle = "#000";
    x.fillRect(20, 20, a - 40, a - 40);
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.45, d * 1.45), mat);
  m.rotation.x = -PI / 2;
  m.position.y = 0.004;
  m.renderOrder = 1;
  return m;
}

// ---------- CI HDMI novo: MN864739 (20 pinos por lado, 0,4 mm, nas fileiras de pads do desenho) ----------
function MN(renderer) {
  const g = new THREE.Group();
  const passo = 15.32 / PX, corpo = 2.4, alt = 0.17, base = 0.05;
  const mCorpo = new THREE.MeshStandardMaterial({ color: 0x18181d, roughness: 0.62, metalness: 0.08 });
  const c = new THREE.Mesh(caixaArredondada(corpo, corpo, alt, 0.03), mCorpo);
  c.position.y = base;
  const topo = topoDeChip(renderer, corpo - 0.03, corpo - 0.03, base + alt + 0.002, (x, a) => {
    escreve(x, "nuvoTon", a / 2, a * 0.27, a * 0.135, { peso: 700, cor: "#8f8f98", espaco: 2 });
    escreve(x, "MN864739", a / 2, a * 0.5, a * 0.098, { peso: 500, cor: "#6f6f79", espaco: 3 });
    escreve(x, "253U020E", a / 2, a * 0.65, a * 0.098, { peso: 500, cor: "#6f6f79", espaco: 3 });
    x.beginPath(); x.arc(a * 0.08, a * 0.92, a * 0.028, 0, 7); x.fillStyle = "#4b4b55"; x.fill();
  });
  const mPerna = prata();
  const geo = pernaGeo(0.135, base + alt * 0.45, 0.05);
  const lista = [];
  for (let i = 0; i < 20; i++) {
    const p = (i - 9.5) * passo, m = corpo / 2 - 0.02;
    lista.push([m, p, 0], [-m, p, PI], [p, -m, PI / 2], [p, m, -PI / 2]);
  }
  const som = sombraPlano(renderer, corpo, corpo);
  g.add(som, c, topo, pernas(geo, mPerna, lista));
  g.userData.mats = [mCorpo, topo.material, mPerna, som.material];
  return g;
}

// ---------- CI HDMI original: RTD2175P (QFN de 14 pinos por lado), com a marca como na foto ----------
function RTD(renderer, topoTex) {
  const g = new THREE.Group();
  const corpo = 1.814, alt = 0.2, passo = 15.35 / PX;
  const mCorpo = new THREE.MeshStandardMaterial({ color: 0x1b1b21, roughness: 0.62, metalness: 0.08 });
  const c = new THREE.Mesh(caixaArredondada(corpo, corpo, alt, 0.02), mCorpo);
  c.position.y = 0.015;
  const mTopo = new THREE.MeshStandardMaterial({ map: topoTex, roughness: 0.6, metalness: 0.08 });
  const topo = new THREE.Mesh(new THREE.PlaneGeometry(corpo - 0.02, corpo - 0.02), mTopo);
  // Na placa o chip fica de lado: marca à esquerda e bolinha do pino 1 no canto de baixo à direita.
  topo.rotation.set(-PI / 2, 0, PI / 2);
  topo.position.y = 0.015 + alt + 0.002;
  const mPino = prata();
  const lista = [];
  for (let i = 0; i < 14; i++) {
    const p = (i - 6.5) * passo, m = corpo / 2 + 0.008;
    lista.push([m, p, 0], [-m, p, 0], [p, m, PI / 2], [p, -m, PI / 2]);
  }
  const som = sombraPlano(renderer, corpo, corpo);
  g.add(som, c, topo, pernas(new THREE.BoxGeometry(0.05, 0.03, 0.05), mPino, lista, 0.022));
  g.userData.mats = [mCorpo, mTopo, mPino, som.material];
  return g;
}
const transparencia = (obj, a) => obj.userData.mats.forEach((m) => { m.transparent = a < 1 || m === obj.userData.mats[obj.userData.mats.length - 1]; m.opacity = m === obj.userData.mats[obj.userData.mats.length - 1] ? a * 0.55 : a; });

// ---------- a interposer: faces do desenho e componentes assentados nos pads medidos ----------
// Centro dos pads no desenho da face de cima (593 x 782): C1 a C7 e os cinco pads do U1.
const CAPS_PX = [[56.5, 77.5, 614], [55.5, 76.5, 651.5], [55.5, 76.5, 690.5], [55.5, 76.5, 729], [251.5, 272.5, 644.5], [251.5, 273, 683], [251.5, 272.5, 721]];
const U1_PX = { x: 482.5, y: 695, esqX: 440.5, dirX: 524.5, cima: 657.5, meio: 695, baixo: 731 };

function flex(renderer, topo, baseTex) {
  const g = new THREE.Group();
  const faz = (map) => new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.32, metalness: 0.12, depthWrite: false });
  const mT = faz(topo), mB = faz(baseTex);
  const t = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mT);
  t.rotation.x = -PI / 2; t.position.y = T / 2; t.renderOrder = 3;
  // O desenho de baixo tem 593 x 777 e é o espelho do de cima, com os furos deslocados: casa pelos furos.
  const b = new THREE.Mesh(new THREE.PlaneGeometry(W, (W * 777) / 593), mB);
  b.rotation.set(PI / 2, 0, PI);
  b.position.set(pecaX(293.5), -T / 2, pecaZ(390.5));
  b.renderOrder = 2;
  g.add(b, t);
  // lateral: mesmo recorte da peça, com o canto chanfrado do desenho
  const s = new THREE.Shape();
  const ponto = (px, py) => [pecaX(px), -pecaZ(py)];
  s.moveTo(...ponto(10, 772)); s.lineTo(...ponto(582, 772)); s.lineTo(...ponto(582, 9)); s.lineTo(...ponto(202, 9)); s.lineTo(...ponto(10, 200)); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
  geo.rotateX(-PI / 2); geo.translate(0, -T / 2, 0);
  const mS = new THREE.MeshStandardMaterial({ color: 0xc97a0c, transparent: true, opacity: 0.85, roughness: 0.4, depthWrite: false });
  const lado = new THREE.Mesh(geo, [new THREE.MeshBasicMaterial({ visible: false }), mS]);
  lado.renderOrder = 1;
  g.add(lado);

  // Regulador U1 (SOT-23-5 de 1,8 V): 3 pernas à esquerda e 2 à direita, cada uma no seu pad.
  const u1 = new THREE.Group();
  const larg = 61.4 / PX, comp = 111 / PX, altC = 0.21, pe = 0.02;
  const mCorpo = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.58, metalness: 0.08 });
  const corpo = new THREE.Mesh(caixaArredondada(larg, comp, altC, 0.012), mCorpo);
  corpo.position.y = pe;
  u1.add(corpo);
  const marca = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshStandardMaterial({ color: 0x35353d, roughness: 0.5 }));
  marca.rotation.x = -PI / 2;
  marca.position.set(-larg / 2 + 0.07, pe + altC + 0.002, -comp / 2 + 0.09);
  u1.add(marca);
  const mPerna = prata();
  const ponta = (54 / PX) - larg / 2; // a ponta da perna termina dentro do pad
  const geoP = pernaGeo(ponta, pe + altC * 0.42, 15 / PX, 0.02);
  const zC = (U1_PX.cima - U1_PX.y) / PX, zB = (U1_PX.baixo - U1_PX.y) / PX;
  u1.add(pernas(geoP, mPerna, [[larg / 2, zC, 0], [larg / 2, zB, 0], [-larg / 2, zC, PI], [-larg / 2, 0, PI], [-larg / 2, zB, PI]]));
  u1.position.set(pecaX(U1_PX.x), T / 2 + 0.002, pecaZ(U1_PX.y));
  g.add(u1);

  // Capacitores cerâmicos C1 a C7: corpo entre os dois pads e um terminal em cima de cada pad.
  const mCap = new THREE.MeshStandardMaterial({ color: 0xb49a78, roughness: 0.62 });
  const mTerm = prata();
  const CL = 27 / PX, CW = 13 / PX, CH = 0.085, TERM = 9 / PX;
  const corpoCap = new THREE.InstancedMesh(new THREE.BoxGeometry(CL - 2 * TERM + 0.002, CH * 0.92, CW * 0.96), mCap, CAPS_PX.length);
  const termCap = new THREE.InstancedMesh(new THREE.BoxGeometry(TERM, CH, CW), mTerm, CAPS_PX.length * 2);
  const m = new THREE.Matrix4();
  CAPS_PX.forEach(([a, b, py], i) => {
    const xa = pecaX(a), xb = pecaX(b), xm = (xa + xb) / 2, z = pecaZ(py), y = T / 2 + 0.004 + CH / 2;
    m.makeTranslation(xm, y, z); corpoCap.setMatrixAt(i, m);
    m.makeTranslation(xm - CL / 2 + TERM / 2, y, z); termCap.setMatrixAt(i * 2, m);
    m.makeTranslation(xm + CL / 2 - TERM / 2, y, z); termCap.setMatrixAt(i * 2 + 1, m);
  });
  g.add(corpoCap, termCap);
  g.userData.mats = [mT, mB, mS];
  return g;
}

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
  const peca = flex(renderer, t, b);
  peca.position.y = -0.55;
  const c = MN(renderer);
  c.position.set(pecaX(289.5), 0.85, pecaZ(333));
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
    c.position.y = -0.26 + 0.34 * (0.5 + 0.5 * Math.sin(agora / 1300));
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

// ---------- placa do PS5: desenhada a partir das fotos do dono, com o HDMI em cima, como nas fotos ----------
// Unidade da cena: 1 = 3,86 mm (a interposer tem 4 de largura). Origem: centro do Realtek.
const BX0 = -16.5, BZ0 = -9.2, BW = 28.7, BD = 24.7;
const CONTORNO = [[-16.5, -8.45], [8.7, -8.45], [8.78, -7.25], [9, -6.62], [9.3, -6.35], [9.58, -6.5], [9.82, -7], [9.85, -8.1], [10.05, -8.4], [11.2, -8.4], [11.68, -8], [11.85, -4], [11.95, 0], [11.95, 15.5], [-16.5, 15.5]];

const POS = {
  rtd: [0, 0], cxd: [1.23, 6.43], nor: [5.3, 6.87], pmicRtd: [-2.72, 0.65], pmicCxd: [4.2, 12.4],
  hdmi: [0.15, -8.9], trafo: [-8.67, -3.58],
};
const CXD_LADO = 3.6;

// Furos da placa: [x, z, raio, tipo]
const FUROS = [
  [-3.85, -7.69, 0.42], [-2.4, -4, 0.42], [-13.17, -3.73, 0.42], [-10.46, 0.08, 0.42], [-5.38, 0.08, 0.42],
  [4.48, -7.65, 0.42], [4.54, -5.44, 0.42], [4.48, 1.75, 0.43], [10, 2.17, 0.42], [11.19, 9.46, 0.4], [10.79, -7.21, 0.38],
  [7.5, -7.27, 0.6, "amarelo"], [-14.06, 0.44, 0.5, "amarelo"], [-15.3, -0.8, 0.36, "amarelo"],
  [7.75, -0.29, 0.25, "verde"], [7.6, -5.02, 0.15, "verde"],
];
// Pads redondos prateados com anel verde, no cobre
const VIAS_ANEL = [[-3.44, -5.6], [-0.21, -4.67], [2.08, -4.67], [-3.58, -2.38], [-4.44, -1.23], [-7.25, -0.33], [-8.54, -0.33], [-11.71, -1.12], [-12.6, -2.1], [-14.69, -4.35], [3.85, -3.2], [3.9, -0.71], [6.73, -6.38], [8.58, -6.27], [10.88, -3.79], [10.98, -1.44], [9.48, 5.02], [9.94, 7.27], [10.79, 11.23], [10.46, 12.38], [10.73, 4.44]];

// Componentes pequenos: [tipo, x, z, em pé?]. r = resistor preto, c = cerâmico 0402, C = cerâmico maior.
const SMD = [
  // trilhas de vídeo e arredores do Realtek
  ["c", -0.55, -2.8, 1], ["c", -0.16, -2.8, 1], ["c", 0.24, -2.8, 1], ["c", 0.65, -2.8, 1],
  ["r", 1.38, -2.75, 1], ["r", 1.66, -2.75, 1], ["r", 2.55, -1.2, 0], ["r", 2.2, -0.42, 0], ["r", 2.2, -0.2, 0],
  // volta do PMIC do Realtek
  ["r", -2.1, -0.37, 0], ["r", -2.65, -0.37, 0], ["c", -3.02, -0.2, 1], ["r", -3.05, 0.12, 0], ["C", -2.14, 0.38, 1], ["C", -2.14, 0.92, 1], ["r", -3.28, 1.02, 1],
  // volta do CXD
  ["r", -1.4, 4.1, 0], ["r", -0.8, 4.2, 0], ["C", -1.12, 4.9, 1], ["r", 3.72, 4.37, 0], ["r", 4.13, 5, 0], ["r", 4.13, 5.19, 0], ["r", 4.56, 5.87, 1],
  ["r", 3.47, 8.75, 0], ["r", 3.47, 9.03, 0], ["r", 1.88, 9.57, 0], ["r", 1.96, 9.03, 0], ["C", 0.92, 9.82, 1], ["r", -1.8, 8.7, 1], ["r", -1.41, 9.39, 0], ["r", -1.41, 9.6, 0],
  ["r", 4.62, 9.26, 0], ["r", 5.1, 8.7, 1], ["r", 5.2, 9.2, 1], ["r", -1.47, 10.65, 1], ["r", -1.69, 11.36, 0], ["r", 3.1, 9.5, 1],
  // volta do CI das bobinas, perto do CXD
  ["C", 2.84, 11.1, 1], ["C", 3.2, 11.1, 1], ["C", 4.15, 11.1, 1], ["C", 5.2, 11.1, 1], ["C", 5.6, 11.1, 1], ["C", 1.57, 12.1, 0], ["C", 0.54, 11.85, 1], ["C", 2.5, 12.6, 1], ["r", 2.9, 12.9, 0], ["r", 5.6, 12.3, 1], ["r", 5.85, 12.3, 1],
  // outros grupos que aparecem nas fotos
  ["C", -8.85, 4.33, 0], ["C", -7.5, 4.33, 0], ["r", 8.8, -2.4, 0], ["r", 9.1, -2.4, 0], ["r", 8.82, -1.75, 0], ["r", 9.12, -1.75, 0], ["r", 8.85, -1.15, 0],
  ["C", 9.4, 11.55, 0], ["C", 9.4, 12.05, 0], ["r", 8.3, 11.6, 1], ["r", 8.6, 12.2, 0], ["r", 3.3, 2.9, 1], ["r", 2.2, 3.2, 0],
  ["C", -4.9, 12.2, 1], ["C", -4.5, 12.2, 1], ["C", -3.6, 11.7, 0], ["C", -3.1, 12.6, 1], ["r", -6.1, 3.7, 0], ["r", -5.3, 3.8, 1],
];

// Pads soltos, sem peça (o que fica à mostra nas fotos): [x, z, largura, altura]
const PADS_SOLTOS = [
  [-1.55, -1.05, 0.13, 0.13], [-1.32, -1.05, 0.13, 0.13], [-1.72, 0, 0.14, 0.14], [-1.45, 0.3, 0.16, 0.14], [-1.25, 0.38, 0.14, 0.14], [-1.75, 0.28, 0.13, 0.13],
  [-0.93, -1.6, 0.16, 0.16], [-0.93, -1.25, 0.1, 0.1], [-0.8, -1.25, 0.1, 0.1], [2.17, -1.72, 0.2, 0.1], [2.25, -1.2, 0.1, 0.1],
  [1.45, 1.17, 0.12, 0.12], [1.64, 1.17, 0.12, 0.12], [1.87, 1.17, 0.12, 0.12], [1.45, 1.38, 0.12, 0.12], [1.64, 1.38, 0.12, 0.12], [1.4, 1.71, 0.12, 0.12], [1.59, 1.71, 0.12, 0.12],
  [1.8, 0.27, 0.14, 0.14], [2.03, 0.27, 0.14, 0.14], [2.26, 0.27, 0.14, 0.14], [2.49, 0.27, 0.14, 0.14], [1.8, 0.53, 0.14, 0.14], [2.03, 0.53, 0.14, 0.14], [2.26, 0.53, 0.14, 0.14], [2.49, 0.53, 0.14, 0.14],
  [1.2, -0.75, 0.1, 0.1], [1.42, -0.8, 0.1, 0.1], [1.42, -0.55, 0.1, 0.1], [1.65, -0.4, 0.14, 0.14], [1.5, 0.05, 0.14, 0.14],
  [-0.85, 1.03, 0.55, 0.33],
  [2.6, 3.97, 0.14, 0.14], [2.88, 3.97, 0.14, 0.14], [2.6, 4.3, 0.14, 0.14], [2.88, 4.3, 0.14, 0.14], [2.28, 3.97, 0.1, 0.1],
  [4.13, 6.36, 0.11, 0.11], [4.4, 6.36, 0.11, 0.11], [4.13, 6.6, 0.11, 0.11], [4.4, 6.6, 0.11, 0.11], [4.13, 6.85, 0.11, 0.11], [4.4, 6.85, 0.11, 0.11], [4.13, 7.1, 0.11, 0.11], [4.4, 7.1, 0.11, 0.11],
  [4.4, 3.75, 0.13, 0.13], [4.72, 3.75, 0.13, 0.13], [4.45, 4.1, 0.13, 0.13], [4.8, 4.1, 0.13, 0.13], [4.5, 4.45, 0.13, 0.13], [4.8, 4.45, 0.13, 0.13], [4.9, 4.78, 0.13, 0.13],
  [5.45, 8.75, 0.12, 0.12], [5.75, 8.75, 0.12, 0.12], [6.05, 8.75, 0.12, 0.12], [5.45, 9.05, 0.12, 0.12], [5.75, 9.05, 0.12, 0.12], [6.05, 9.05, 0.12, 0.12],
];

// Feixes de trilhas: pontos [x, z, distância entre trilhas], quantidade de trilhas.
const FEIXES = [
  { n: 8, p: [[6.05, -4.9, 0.14], [6.1, -4.1, 0.3], [6.1, -3.5, 0.37], [6, -0.5, 0.31], [6.56, 1, 0.3], [7.03, 3, 0.31], [6.95, 5, 0.27], [6.77, 7, 0.24], [6.56, 13, 0.15], [6.56, 16, 0.15]] },
  { n: 9, p: [[-16.9, -3.7, 0.2], [-15.2, -2.9, 0.2], [-13.2, -0.9, 0.2], [-11.6, 1.2, 0.2], [-10.4, 3, 0.2], [-10.2, 4.6, 0.2], [-10.5, 6.5, 0.2], [-11.6, 8.6, 0.2], [-12.9, 10.5, 0.2], [-14.2, 12.6, 0.2], [-16.9, 16, 0.2]] },
  { n: 6, p: [[-16.9, 0.2, 0.17], [-14, 1.4, 0.17], [-12.3, 3.2, 0.17], [-11.8, 4.6, 0.17], [-12.5, 6.5, 0.17], [-14, 8.2, 0.17], [-16.9, 9.4, 0.17]] },
  { n: 8, p: [[-7.5, 1, 0.24], [-7.4, 1.5, 0.22], [-6.4, 2.1, 0.18], [-2.9, 2.45, 0.16], [-1.9, 2.6, 0.16], [0.4, 4.62, 0.16]] },
  { n: 5, fino: 1, p: [[-3.3, 6.17, 0.31], [-0.6, 6.17, 0.31]] },
  { n: 3, fino: 1, p: [[-5.83, 4.08, 0.1], [-5.1, 4.4, 0.1], [-3.65, 6.8, 0.1], [-1.67, 7.42, 0.1], [-0.6, 7.42, 0.1]] },
  { n: 2, fino: 1, p: [[-4.4, 4.08, 0.1], [-4.4, 6.17, 0.1], [-3.33, 7.2, 0.1], [-0.6, 7.2, 0.1]] },
  { n: 3, fino: 1, p: [[-3.1, 11, 0.14], [-2.2, 12.6, 0.14], [-2.2, 16, 0.14]] },
];
// Trilhas soltas finas: listas de pontos [x, z]
const FINAS = [
  [[2.55, -2.25], [2.55, 3.2], [2.9, 3.62]], [[2.75, -0.6], [2.75, 3], [3.1, 3.5]], [[2.95, -0.2], [2.95, 2.8], [3.3, 3.2]],
  [[1.25, -3], [2.2, -3], [2.2, -2.45], [1.25, -2.45]], [[2.7, -2.5], [2.9, -2.7], [2.9, -1.1]],
  [[-3.9, 1.05], [-3.45, 1.05], [-3.1, 0.75]], [[-4.1, 1.4], [-3.4, 1.4], [-2.8, 1.05]],
  [[-2.3, -0.7], [-1.9, -0.7], [-1.5, -0.45], [-1.1, -0.45]], [[-2.3, -0.62], [-1.92, -0.62], [-1.5, -0.32], [-1.1, -0.32]],
  [[-2.28, 0.55], [-1.6, 0.55], [-1.2, 0.2], [-1.05, 0.2]], [[-2.28, 0.75], [-1.5, 0.75], [-1.2, 0.45], [-1.05, 0.45]],
  [[3.3, 5.4], [4.3, 5.4], [4.8, 5.9]], [[3.1, 8], [3.9, 8.2], [4.3, 8.7]], [[6.4, 5.4], [5.6, 5.2], [5.2, 5.75]], [[4.65, 7.75], [4.95, 8.1], [5.3, 8.1]],
  [[-1.2, 8.7], [-0.9, 8.9], [-0.9, 11], [-0.5, 11.6], [-0.5, 16]], [[-0.4, 8.5], [-0.4, 11.4], [0.1, 12], [0.1, 16]], [[0.6, 8.5], [0.6, 10.2], [1.1, 10.8], [1.1, 16]],
  [[-6, 3.6], [-5.2, 4], [-4.4, 4]], [[-6.2, 4.6], [-5.3, 5.8], [-5.3, 8], [-4.7, 8.8]], [[9.1, 3], [8.7, 3.6], [8.7, 7.8]], [[9.1, 2.4], [8.45, 3.2], [8.45, 7.6]],
];
// Grupos de pernas e calçadas douradas pequenas: [x0, z0, x1, z1, quantidade]
const OUROS = [[-1.5, 8.4, 4.2, 10.4, 34], [1.3, 4.25, 3.1, 4.5, 7], [-1.3, 5.5, -0.7, 8.3, 10], [3.2, 4.8, 4, 8.2, 16], [-0.4, 2.2, 1.1, 3.4, 8], [-7.2, 10.6, -5.2, 13.5, 22], [-10.4, 9.4, -9.2, 13.5, 24], [-14.8, 3, -11.4, 8.6, 46], [-3.1, 2, -1.8, 3.2, 6], [-5.4, 8.1, -3.6, 9.2, 14]];
// Grupos de peças miúdas, com sorteio de semente fixa: [x0, z0, x1, z1, quantidade]
const GRUPOS = [[-14.4, 3, -11.4, 8.6, 58], [-5.7, 9.4, -3.5, 11.2, 22], [-3.3, 3.2, -2, 4.6, 7], [8, 10.2, 8.9, 13.8, 9], [0.4, 12.6, 2.6, 15, 14], [-12.2, 9.8, -10, 13.6, 16], [-14.8, -1, -12.4, 1.8, 8]];

const DIM_SMD = { r: [0.26, 0.13, 0.085], c: [0.26, 0.14, 0.1], C: [0.42, 0.24, 0.2] };

function pecasMiudas() {
  const r = sorteio(4242), todas = SMD.map((p) => p.slice());
  GRUPOS.forEach(([a, b, c, d, n]) => {
    for (let i = 0; i < n; i++) {
      const t = r() > 0.68 ? "c" : "r";
      todas.push([t, a + r() * (c - a), b + r() * (d - b), r() > 0.5 ? 1 : 0]);
    }
  });
  return todas;
}
const PECAS_MIUDAS = pecasMiudas();

// Só o caminho: serve para a cor, para a aspereza/metal e para o relevo, sempre com as mesmas posições.
function desenhaPlaca(x, S, c, comRuido) {
  const X = (v) => (v - BX0) * S, Z = (v) => (v - BZ0) * S;
  const curva = (p) => {
    x.beginPath();
    x.moveTo(X(p[0][0]), Z(p[0][1]));
    for (let i = 1; i < p.length - 1; i++) x.quadraticCurveTo(X(p[i][0]), Z(p[i][1]), X((p[i][0] + p[i + 1][0]) / 2), Z((p[i][1] + p[i + 1][1]) / 2));
    x.lineTo(X(p[p.length - 1][0]), Z(p[p.length - 1][1]));
  };
  const linha = (p, w, cor) => { x.lineWidth = w * S; x.strokeStyle = cor; curva(p); x.stroke(); };
  const reta = (p, w, cor) => { x.lineWidth = w * S; x.strokeStyle = cor; x.beginPath(); p.forEach(([a, b], i) => (i ? x.lineTo(X(a), Z(b)) : x.moveTo(X(a), Z(b)))); x.stroke(); };
  const ret = (cx, cz, w, h, cor) => { x.fillStyle = cor; x.fillRect(X(cx - w / 2), Z(cz - h / 2), w * S, h * S); };
  const bola = (cx, cz, r, cor) => { x.fillStyle = cor; x.beginPath(); x.arc(X(cx), Z(cz), r * S, 0, 7); x.fill(); };
  const r = sorteio(991);

  // recorte da placa: fora dele fica transparente
  x.save();
  x.beginPath();
  CONTORNO.forEach(([a, b], i) => (i ? x.lineTo(X(a), Z(b)) : x.moveTo(X(a), Z(b))));
  x.closePath();
  x.clip();
  x.fillStyle = c.mascara;
  x.fillRect(0, 0, BW * S, BD * S);
  x.lineJoin = x.lineCap = "round";

  // pescoços do Realtek e ilhas escuras: onde a foto mostra o verde mais fechado
  x.fillStyle = c.escuro;
  [[-0.82, -3.62, 1.69, 2.55, 0.08], [-0.8, 1, 1.75, 1.08, 0.08], [-1.85, -0.92, 0.85, 1.85, 0.06], [1, -0.92, 0.82, 1.85, 0.06]].forEach(([a, b, w, h, q]) => { x.beginPath(); x.roundRect(X(a), Z(b), w * S, h * S, q * S); x.fill(); });

  // feixes: faixa escura e as trilhas por dentro
  FEIXES.forEach(({ n, p, fino }) => {
    const des = (k) => p.map((pt, i) => {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
      const tx = b[0] - a[0], tz = b[1] - a[1], L = Math.hypot(tx, tz) || 1;
      return [pt[0] - (tz / L) * k * pt[2], pt[1] + (tx / L) * k * pt[2]];
    });
    const meio = (n - 1) / 2;
    // faixa: várias linhas largas seguem a mesma curva
    if (fino) { for (let i = 0; i < n; i++) linha(des(i - meio), 0.04, c.trilhaClara); return; }
    for (let i = 0; i < n; i++) linha(des(i - meio), Math.max(0.15, (p[Math.floor(p.length / 2)][2] || 0.2) * 1.25), c.escuro);
    for (let i = 0; i < n; i++) linha(des(i - meio), 0.042, c.trilhaEscura);
  });
  FINAS.forEach((p) => reta(p, 0.034, c.trilhaClara));

  // saídas do CXD para os lados, em leque
  for (let i = 0; i < 20; i++) {
    const z = 4.75 + i * 0.175, d = (i % 3) * 0.14;
    reta([[3.03, z], [3.55 + d, z], [3.9 + d, z + (i < 10 ? -0.2 : 0.2)]], 0.024, c.trilhaClara);
    if (i > 2 && i < 17) reta([[-0.56, z], [-0.95 - d, z], [-1.2 - d, z + (i < 10 ? -0.14 : 0.14)]], 0.024, c.trilhaClara);
  }
  for (let i = 0; i < 22; i++) {
    const a = -0.42 + i * 0.158, d = (i % 3) * 0.13;
    reta([[a, 8.25], [a, 8.55 + d], [a + (i < 11 ? -0.14 : 0.14), 8.8 + d]], 0.024, c.trilhaClara);
    if (i > 8) reta([[a, 4.6], [a, 4.3 - d * 0.5], [a + 0.1, 4.12 - d * 0.5]], 0.024, c.trilhaClara);
  }
  // pentes em diagonal embaixo do CXD
  for (let i = 0; i < 16; i++) {
    reta([[1.6 + i * 0.09, 10.65], [2.5 + i * 0.09, 9.75]], 0.022, c.trilhaClara);
    reta([[-1.95 + i * 0.08, 8.95], [-1.05 + i * 0.08, 8.2]], 0.02, c.trilhaClara);
  }

  // Fan-out do Realtek: pares de vídeo para o conector e demais saídas
  [-0.55, -0.16, 0.24, 0.65].forEach((m, i) => {
    [-0.05, 0.05].forEach((d) => {
      reta([[m + d, -3.6], [m + d, -2.98]], 0.03, c.trilhaEscura);
      reta([[m + d, -2.64], [m + d, -1.65], [(-0.42 + i * 0.28) + d * 0.7, -1.2], [(-0.42 + i * 0.28) + d * 0.7, -1.02]], 0.03, c.trilhaEscura);
    });
  });
  for (let i = 0; i < 8; i++) {
    const a = -0.56 + i * 0.207;
    bola(a, -3.62, 0.05, c.via);
    bola(a, 2.02, 0.05, c.via);
    reta([[(i - 3.5) * 0.1035, 1.02], [(i - 3.5) * 0.1035, 1.25], [a, 1.6], [a, 1.8]], 0.028, c.trilhaEscura);
  }
  for (let i = 0; i < 14; i++) {
    const p = (i - 6.5) * 0.1035, q = p * 1.5;
    reta([[-1.02, p], [-1.25, p], [-1.55, q], [-1.78, q]], 0.024, c.trilhaEscura);
    reta([[1.02, p], [1.25, p], [1.5, q], [1.75, q]], 0.024, c.trilhaEscura);
    if (i % 2 === 0) { ret(-1.78, q, 0.09, 0.075, c.ouro); ret(1.75, q, 0.09, 0.075, c.ouro); }
  }

  // viazinhas espalhadas no verde
  const cobrePath = new Path2D();
  COBRE.forEach((l) => {
    const n = l.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ini = mid(l[n - 1], l[0]);
    cobrePath.moveTo(X(ini[0]), Z(ini[1]));
    for (let i = 0; i < n; i++) { const m = mid(l[i], l[(i + 1) % n]); cobrePath.quadraticCurveTo(X(l[i][0]), Z(l[i][1]), X(m[0]), Z(m[1])); }
    cobrePath.closePath();
  });
  const vazio = (a, b) => !(Math.abs(a) < 1.2 && Math.abs(b) < 1.2) && !(Math.abs(a - POS.cxd[0]) < 2 && Math.abs(b - POS.cxd[1]) < 2);
  for (let i = 0; i < 1500; i++) {
    const a = BX0 + r() * BW, b = BZ0 + r() * BD;
    if (!vazio(a, b) || x.isPointInPath(cobrePath, X(a), Z(b), "evenodd")) continue;
    bola(a, b, 0.045, c.viaAnel);
    bola(a, b, 0.018, c.via);
  }
  OUROS.forEach(([a0, b0, a1, b1, n]) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + r() * (a1 - a0), b = b0 + r() * (b1 - b0);
      if (Math.abs(a - POS.cxd[0]) < 1.82 && Math.abs(b - POS.cxd[1]) < 1.82) continue;
      bola(a, b, 0.05 + r() * 0.03, c.ouro);
    }
  });
  // terminais dos feixes
  [[-8.3, 1], [-8.06, 1], [-7.82, 1], [-7.58, 1], [-7.34, 1], [-7.1, 1], [-6.86, 1], [-6.62, 1]].forEach(([a, b]) => { bola(a, b, 0.07, c.viaAnel); bola(a, b, 0.03, c.via); });
  for (let i = 0; i < 8; i++) { const a = 4.95 + i * 0.32; bola(a, -4.95, 0.07, c.viaAnel); bola(a, -4.95, 0.03, c.via); }

  // cobre sem máscara, com o contorno tirado da foto
  x.strokeStyle = c.bordaCobre;
  x.lineWidth = 0.05 * S;
  x.stroke(cobrePath);
  x.fillStyle = c.cobre;
  x.fill(cobrePath, "evenodd");
  // pontinhos de costura no cobre
  for (let i = 0; i < 2200; i++) {
    const a = BX0 + r() * BW, b = BZ0 + r() * BD;
    if (!x.isPointInPath(cobrePath, X(a), Z(b), "evenodd")) continue;
    if (r() > 0.28) continue;
    bola(a, b, 0.024, c.furinho);
  }
  // duas cercas de furinhos entre a ilha do Realtek e a do conector
  [-0.78, 0.88].forEach((a) => { for (let b = -5.42; b < -4.02; b += 0.135) bola(a, b, 0.026, c.furinho); });

  // Realtek: pads medidos no desenho da interposer (14 por lado, passo de 0,4 mm)
  const PASSO = 15.35 / PX, MEIO = 131.25 / PX, LP = 33.5 / PX, GP = 7.5 / PX;
  for (let i = 0; i < 14; i++) {
    const p = (i - 6.5) * PASSO;
    ret(p, -MEIO, GP, LP, c.pad); ret(p, MEIO, GP, LP, c.pad);
    ret(-MEIO, p, LP, GP, c.pad); ret(MEIO, p, LP, GP, c.pad);
    // estanho que sobra na ponta, como na foto
    bola(p, -MEIO - LP / 2, GP * 0.6, c.padClaro); bola(p, MEIO + LP / 2, GP * 0.6, c.padClaro);
    bola(-MEIO - LP / 2, p, GP * 0.6, c.padClaro); bola(MEIO + LP / 2, p, GP * 0.6, c.padClaro);
  }
  ret(0, 0, 1.33, 1.33, c.pad);
  for (let i = 0; i < 60; i++) bola(-0.6 + r() * 1.2, -0.6 + r() * 1.2, 0.05 + r() * 0.1, c.padClaro);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) bola(-0.45 + i * 0.3, -0.45 + j * 0.3, 0.026, c.via);

  // pads soltos e dos componentes
  PADS_SOLTOS.forEach(([a, b, w, h]) => ret(a, b, w, h, c.pad));
  [-0.56, -0.44, -0.25, -0.03, 0.21, 0.42, 0.65, 0.89].forEach((a) => ret(a, 1.87, 0.11, 0.15, c.pad));
  PECAS_MIUDAS.forEach(([t, a, b, pe]) => {
    const [L, Wd] = DIM_SMD[t], e = L / 2 - 0.03, w = 0.11, h = Wd + 0.05;
    if (pe) { ret(a, b - e, h, w, c.pad); ret(a, b + e, h, w, c.pad); } else { ret(a - e, b, w, h, c.pad); ret(a + e, b, w, h, c.pad); }
  });
  // NOR: 8 pads com solda; diodos; PMIC do Realtek
  [-1.5, -0.5, 0.5, 1.5].forEach((k) => { [-1, 1].forEach((l) => { ret(POS.nor[0] + k * 0.3125, POS.nor[1] + l * 0.68, 0.17, 0.32, c.pad); bola(POS.nor[0] + k * 0.3125, POS.nor[1] + l * 0.8, 0.07, c.padClaro); }); });
  [[-1.65, -1.62], [-1.38, -1.62], [-1.92, -1.36]].forEach(([a, b]) => { ret(a, b - 0.16, 0.13, 0.08, c.pad); ret(a - 0.06, b + 0.16, 0.08, 0.08, c.pad); ret(a + 0.06, b + 0.16, 0.08, 0.08, c.pad); });
  for (let i = -1; i <= 1; i++) { ret(POS.pmicRtd[0] - 0.42, POS.pmicRtd[1] + i * 0.22, 0.14, 0.12, c.pad); ret(POS.pmicRtd[0] + 0.42, POS.pmicRtd[1] + i * 0.22, 0.14, 0.12, c.pad); }
  ret(-1.75, 4.95, 0.66, 0.66, c.padClaro);
  // pads do conector HDMI: fileira dourada e abas
  for (let i = 0; i < 19; i++) ret(0.3 + (i - 9) * 0.13, -6.98, 0.07, 0.38, c.ouro);
  ret(-1.72, -6.85, 0.3, 0.6, c.pad); ret(2.06, -6.85, 0.3, 0.6, c.pad);

  // quadradinhos e marcas
  ret(-2.65, -1.5, 0.72, 0.72, c.bronze); bola(-2.65, -1.5, 0.15, c.cobre);
  ret(9.65, -4.46, 0.7, 0.7, c.bronze); bola(9.65, -4.46, 0.13, c.pad);
  x.strokeStyle = c.trilhaEscura; x.lineWidth = 0.03 * S; x.strokeRect(X(1.06), Z(-1.98), 0.8 * S, 0.8 * S);
  bola(1.46, -1.58, 0.07, c.pad);
  bola(2.55, -3.3, 0.17, c.cobre); bola(2.55, -3.3, 0.1, c.pad);
  bola(-1.03, -2.12, 0.09, c.pad);

  // furos e anéis
  VIAS_ANEL.forEach(([a, b]) => { bola(a, b, 0.4, c.anel); bola(a, b, 0.22, c.pad); bola(a - 0.05, b - 0.05, 0.1, c.padClaro); });
  FUROS.forEach(([a, b, q, t]) => {
    if (t === "amarelo") bola(a, b, q + 0.14, c.amarelo);
    else if (t === "verde") bola(a, b, q + 0.17, c.anel);
    else bola(a, b, q + 0.03, c.bordaFuro);
    bola(a, b, q, c.furo);
  });
  x.fillStyle = c.amarelo; x.beginPath(); x.roundRect(X(10.77), Z(1.8), 0.86 * S, 1.75 * S, 0.43 * S); x.fill();
  x.fillStyle = c.furo; x.beginPath(); x.roundRect(X(10.88), Z(1.92), 0.64 * S, 1.5 * S, 0.32 * S); x.fill();

  if (comRuido) {
    // sombras de contato das peças altas
    const sombra = (a, b, w, h, q = 0.4) => { x.save(); x.shadowColor = `rgba(0,0,0,${q})`; x.shadowBlur = 0.34 * S; x.shadowOffsetX = 0.1 * S; x.shadowOffsetY = 0.1 * S; x.fillStyle = `rgba(0,0,0,${q})`; x.fillRect(X(a - w / 2), Z(b - h / 2), w * S, h * S); x.restore(); };
    sombra(POS.cxd[0], POS.cxd[1], CXD_LADO, CXD_LADO); sombra(POS.nor[0], POS.nor[1], 1.25, 0.96); sombra(POS.pmicRtd[0], POS.pmicRtd[1], 0.78, 0.78);
    sombra(POS.trafo[0], POS.trafo[1], 4.2, 1.77); sombra(-8.6, 8.75, 2.7, 2.66); sombra(8.47, 9.29, 1.6, 1.58); sombra(POS.pmicCxd[0], POS.pmicCxd[1], 1.2, 1.2);
    sombra(-7.8, 5.8, 1.5, 1.5); sombra(3.6, 11.05, 0.55, 0.7); sombra(4.65, 11.05, 0.55, 0.7);
    // cobre riscado e levemente oxidado
    x.save();
    x.clip(cobrePath, "evenodd");
    const s2 = sorteio(7);
    [[-3.5, -6, 6, "rgba(255,226,150,.3)"], [7.5, -3.5, 6, "rgba(96,44,14,.34)"], [10.5, 9, 7, "rgba(255,200,120,.2)"], [-11, -1, 5, "rgba(96,50,20,.3)"], [0, -5.6, 3.5, "rgba(255,220,160,.3)"], [4.4, 0, 3, "rgba(110,52,18,.34)"], [10, 3, 4, "rgba(90,42,16,.3)"]].forEach(([a, b, q, cor]) => {
      const g = x.createRadialGradient(X(a), Z(b), 0, X(a), Z(b), q * S);
      g.addColorStop(0, cor); g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(0, 0, BW * S, BD * S);
    });
    x.globalAlpha = 0.13;
    for (let i = 0; i < 1800; i++) {
      x.strokeStyle = s2() > 0.5 ? "#fff" : "#4a2a10";
      x.lineWidth = 0.5 + s2() * 1.1;
      const px = s2() * BW * S, py = s2() * BD * S, an = s2() * 6.3, le = 8 + s2() * 44;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(an) * le, py + Math.sin(an) * le); x.stroke();
    }
    x.restore();
    // máscara com pequenas variações de tom
    const s3 = sorteio(33);
    x.globalAlpha = 0.05;
    for (let i = 0; i < 90; i++) {
      const a = s3() * BW * S, b = s3() * BD * S, q = (0.8 + s3() * 2.6) * S;
      const g = x.createRadialGradient(a, b, 0, a, b, q);
      g.addColorStop(0, s3() > 0.5 ? "#d8f0b0" : "#02301a"); g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(a - q, b - q, q * 2, q * 2);
    }
    x.globalAlpha = 1;
  }
  // borda amarela da placa
  x.strokeStyle = c.amarelo; x.lineWidth = 0.13 * S; x.lineJoin = "round";
  x.beginPath();
  CONTORNO.slice(0, 14).forEach(([a, b], i) => (i ? x.lineTo(X(a), Z(b)) : x.moveTo(X(a), Z(b))));
  x.stroke();
  x.restore();
}

function caixaComTexto(renderer, w, d, h, corCorpo, y0, desenho, opcoes = {}) {
  const g = new THREE.Group();
  const corpo = new THREE.Mesh(caixaArredondada(w, d, h, opcoes.raio ?? 0.03), new THREE.MeshStandardMaterial({ color: corCorpo, roughness: opcoes.rugosidade ?? 0.6, metalness: opcoes.metal ?? 0.08 }));
  corpo.position.y = y0;
  const topo = topoDeChip(renderer, w - 0.03, d - 0.03, y0 + h + 0.002, desenho, { px: opcoes.px ?? 512, cor: opcoes.corTopo ?? "#17171c", rugosidade: opcoes.rugosidade ?? 0.6, ruido: opcoes.ruido ?? 0.5 });
  g.add(corpo, topo);
  return g;
}

function placa(renderer, pequena) {
  const S = pequena ? 52 : 96;
  const w = Math.round(BW * S), h = Math.round(BD * S);
  const PALETA = { mascara: "#2f7637", escuro: "#10573f", trilhaEscura: "#27795a", trilhaClara: "#3c8c47", cobre: "#b57b3e", bordaCobre: "#245f30", pad: "#d4d4cf", padClaro: "#eeeeea", ouro: "#d8a14e", via: "#0b2416", viaAnel: "#3b8a48", furinho: "#3a2410", anel: "#2a6f3e", furo: "#060810", bordaFuro: "#7d5a30", amarelo: "#d8cc4a", bronze: "#7c5a38" };
  const cor = telaDeCanvas(renderer, w, h, (x) => {
    x.clearRect(0, 0, w, h);
    desenhaPlaca(x, S, PALETA, true);
    // a placa some aos poucos à esquerda e embaixo, onde as fotos terminam
    x.globalCompositeOperation = "destination-out";
    let g = x.createLinearGradient(0, 0, 2.2 * S, 0);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, 2.2 * S, h);
    g = x.createLinearGradient(0, h - 2.4 * S, 0, h);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,1)");
    x.fillStyle = g; x.fillRect(0, h - 2.4 * S, w, 2.4 * S);
    x.globalCompositeOperation = "source-over";
  });
  // verde = aspereza, azul = metal
  const ORM = { mascara: "rgb(0,112,10)", escuro: "rgb(0,100,10)", trilhaEscura: "rgb(0,92,24)", trilhaClara: "rgb(0,96,24)", cobre: "rgb(0,105,190)", bordaCobre: "rgb(0,112,10)", pad: "rgb(0,72,255)", padClaro: "rgb(0,60,255)", ouro: "rgb(0,74,235)", via: "rgb(0,160,10)", viaAnel: "rgb(0,100,20)", furinho: "rgb(0,190,30)", anel: "rgb(0,105,10)", furo: "rgb(0,255,0)", bordaFuro: "rgb(0,120,120)", amarelo: "rgb(0,150,0)", bronze: "rgb(0,120,170)" };
  const orm = telaDeCanvas(renderer, Math.round(w / 2), Math.round(h / 2), (x) => { x.fillStyle = "rgb(0,112,10)"; x.fillRect(0, 0, w, h); desenhaPlaca(x, S / 2, ORM, false); }, false);
  const opcoes = { map: cor, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1, envMapIntensity: 0.62, transparent: true, alphaTest: 0.02 };
  if (!pequena) {
    // relevo: trilha e pad um pouco mais altos que a máscara
    const REL = { mascara: "#808080", escuro: "#7c7c7c", trilhaEscura: "#a2a2a2", trilhaClara: "#a6a6a6", cobre: "#6a6a6a", bordaCobre: "#808080", pad: "#b4b4b4", padClaro: "#c8c8c8", ouro: "#a8a8a8", via: "#505050", viaAnel: "#969696", furinho: "#303030", anel: "#868686", furo: "#000000", bordaFuro: "#7a7a7a", amarelo: "#808080", bronze: "#747474" };
    opcoes.bumpMap = telaDeCanvas(renderer, Math.round(w / 2), Math.round(h / 2), (x) => { x.fillStyle = "#808080"; x.fillRect(0, 0, w, h); desenhaPlaca(x, S / 2, REL, false); }, false);
    opcoes.bumpScale = 1.1;
  }
  const mat = new THREE.MeshStandardMaterial(opcoes);
  const g = new THREE.Group();
  const topo = new THREE.Mesh(new THREE.PlaneGeometry(BW, BD), mat);
  topo.rotation.x = -PI / 2;
  topo.position.set(BX0 + BW / 2, 0, BZ0 + BD / 2);
  g.add(topo);
  // espessura só nas bordas reais da placa
  const borda = CONTORNO.slice(0, 14), pos = [];
  for (let i = 0; i < borda.length - 1; i++) {
    const [a, b] = borda[i], [c, d] = borda[i + 1], y = -0.22;
    pos.push(a, 0, b, a, y, b, c, 0, d, c, 0, d, a, y, b, c, y, d);
  }
  const gb = new THREE.BufferGeometry();
  gb.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  gb.computeVertexNormals();
  g.add(new THREE.Mesh(gb, new THREE.MeshStandardMaterial({ color: 0xb4a83c, roughness: 0.7, side: THREE.DoubleSide })));

  const metal = new THREE.MeshStandardMaterial({ color: 0xc2c4ca, metalness: 1, roughness: 0.36 });
  const escuro = new THREE.MeshStandardMaterial({ color: 0x16161b, roughness: 0.65 });

  // ---------- CXD: o CI grandão, sem pernas à vista (BGA) ----------
  const cxd = caixaComTexto(renderer, CXD_LADO, CXD_LADO, 0.3, 0x17171c, 0.02, (x, a) => {
    x.save();
    x.translate(a / 2 + a * 0.07, a / 2);
    x.rotate(PI / 2);
    escreve(x, "SIE", 0, -a * 0.27, a * 0.082, { peso: 400, cor: "#94949e", espaco: 10 });
    [["CXD90069GG", -0.155], ["2448-AXDSH", -0.09], ["BCMCOLR3-1E", -0.025], ["TAIWAN", 0.04]].forEach(([t, k]) => escreve(x, t, 0, a * k, a * 0.052, { peso: 500, cor: "#8a8a94", espaco: 3 }));
    x.restore();
    x.beginPath(); x.arc(a * 0.035, a * 0.035, a * 0.012, 0, 7); x.fillStyle = "#b8b8c0"; x.fill();
  }, { px: 1024, ruido: 1, rugosidade: 0.78, raio: 0.02 });
  cxd.position.set(POS.cxd[0], 0, POS.cxd[1]);
  g.add(cxd);

  // ---------- NOR: 8 pernas, 4 de cada lado, com os dizeres que aparecem na foto ----------
  const nor = new THREE.Group();
  const norW = 1.25, norD = 0.96, norH = 0.32, norB = 0.05;
  nor.add(caixaComTexto(renderer, norW, norD, norH, 0x17171c, norB, (x, a, b) => {
    escreve(x, "adesto 2403", a / 2, b * 0.26, b * 0.15, { peso: 500, cor: "#7f7f89", espaco: 1 });
    escreve(x, "25SF161B", a / 2, b * 0.5, b * 0.15, { peso: 500, cor: "#7f7f89", espaco: 1 });
    escreve(x, "SSHB", a / 2, b * 0.74, b * 0.14, { peso: 500, cor: "#7f7f89", espaco: 1 });
    x.beginPath(); x.moveTo(a * 0.2, b * 0.8); x.lineTo(a * 0.28, b * 0.8); x.lineTo(a * 0.24, b * 0.66); x.closePath(); x.strokeStyle = "#7f7f89"; x.lineWidth = 2; x.stroke();
  }, { px: 640 }));
  const geoNor = pernaGeo(0.3, norB + norH * 0.42, 0.15, 0.024);
  const listaNor = [];
  [-1.5, -0.5, 0.5, 1.5].forEach((k) => { listaNor.push([k * 0.3125, norD / 2, -PI / 2], [k * 0.3125, -norD / 2, PI / 2]); });
  nor.add(pernas(geoNor, metal, listaNor));
  nor.position.set(POS.nor[0], 0, POS.nor[1]);
  g.add(nor);

  // ---------- PMIC do Realtek: o quadradinho ao lado do chip, de onde saem os 3,3 V e os 0,9 V ----------
  const pmicRtd = caixaComTexto(renderer, 0.78, 0.78, 0.2, 0x17171c, 0.015, (x, a) => {
    escreve(x, "RJ=BC", a / 2, a * 0.38, a * 0.17, { peso: 500, cor: "#73737d" });
    escreve(x, "6X4", a / 2, a * 0.62, a * 0.17, { peso: 500, cor: "#73737d" });
    x.beginPath(); x.arc(a * 0.12, a * 0.12, a * 0.04, 0, 7); x.fillStyle = "#4a4a54"; x.fill();
  });
  pmicRtd.position.set(POS.pmicRtd[0], 0, POS.pmicRtd[1]);
  g.add(pmicRtd);

  // ---------- CI ao lado das duas bobinas, perto do CXD ----------
  const pmicCxd = caixaComTexto(renderer, 1.2, 1.2, 0.17, 0x17171c, 0.015, (x, a) => { x.beginPath(); x.arc(a * 0.1, a * 0.1, a * 0.03, 0, 7); x.fillStyle = "#4a4a54"; x.fill(); });
  pmicCxd.position.set(POS.pmicCxd[0], 0, POS.pmicCxd[1]);
  g.add(pmicCxd);
  [[3.6, 11.05], [4.65, 11.05]].forEach(([a, b]) => {
    const i = caixaComTexto(renderer, 0.55, 0.7, 0.42, 0x5f5f5f, 0, null, { corTopo: "#6b6b6b", rugosidade: 0.5, metal: 0.4, ruido: 0.4 });
    i.position.set(a, 0, b); g.add(i);
  });

  // ---------- chip pequeno em cima do CXD, sobre o estanho ----------
  const peq = new THREE.Mesh(caixaArredondada(0.46, 0.46, 0.16, 0.02), escuro);
  peq.position.set(-1.75, 0.012, 4.95);
  g.add(peq);

  // ---------- bobinas e transformador da rede ----------
  const bob = (a, b, w, d, h, cor, topoCor, txt, tam) => {
    const i = caixaComTexto(renderer, w, d, h, cor, 0, (x, W2, H2) => {
      x.save(); x.translate(W2 / 2, H2 / 2); x.rotate(-PI / 2);
      escreve(x, txt, 0, 0, W2 * tam, { peso: 700, cor: "#23201c", espaco: 4 });
      x.restore();
    }, { corTopo: topoCor, rugosidade: 0.72, metal: 0.05, ruido: 0.25, raio: 0.1 });
    i.position.set(a, 0, b); g.add(i);
  };
  bob(-8.6, 8.75, 2.7, 2.66, 1.05, 0xa8a196, "#b5aea2", "R22H", 0.2);
  bob(8.47, 9.29, 1.6, 1.58, 0.8, 0x8b8b8d, "#979799", "2R2", 0.26);
  const trafo = caixaComTexto(renderer, 4.2, 1.77, 0.68, 0x17171c, 0.1, (x, a, b) => {
    escreve(x, "GST5009S", a * 0.58, b * 0.22, b * 0.2, { peso: 600, cor: "#9a9aa4", espaco: 3 });
    escreve(x, "LF", a * 0.86, b * 0.5, b * 0.2, { peso: 600, cor: "#9a9aa4" });
    escreve(x, "2446D5", a * 0.66, b * 0.78, b * 0.2, { peso: 600, cor: "#9a9aa4", espaco: 3 });
    escreve(x, "IB", a * 0.1, b * 0.36, b * 0.3, { peso: 800, cor: "#9a9aa4" });
    x.beginPath(); x.arc(a * 0.07, b * 0.8, b * 0.05, 0, 7); x.fillStyle = "#8a8a94"; x.fill();
  }, { px: 900 });
  const geoT = pernaGeo(0.26, 0.42, 0.12, 0.024), listaT = [];
  for (let i = 0; i < 12; i++) { const k = (i - 5.5) * 0.28; listaT.push([k, 0.885, -PI / 2], [k, -0.885, PI / 2]); }
  trafo.add(pernas(geoT, metal, listaT));
  trafo.position.set(POS.trafo[0], 0, POS.trafo[1]);
  g.add(trafo);

  // ---------- pasta térmica azul nas duas peças das fotos ----------
  const azul = new THREE.MeshStandardMaterial({ color: 0xaec9e6, roughness: 0.9 });
  const q1 = new THREE.Mesh(caixaArredondada(1.6, 1.56, 0.42, 0.04), escuro);
  q1.position.set(-7.8, 0, 5.8);
  const gel1 = new THREE.Mesh(new THREE.SphereGeometry(0.68, 24, 14), azul);
  gel1.scale.y = 0.34; gel1.position.set(-7.8, 0.42, 5.8);
  const gel2 = new THREE.Mesh(new THREE.SphereGeometry(0.68, 24, 14), azul);
  gel2.scale.y = 0.24; gel2.position.set(-4.63, 0.12, 10.23);
  g.add(q1, gel1, gel2);

  // ---------- conector HDMI, para fora da borda, com os pinos dourados atrás ----------
  const perfil = new THREE.Shape();
  perfil.moveTo(-1.83, 0.02); perfil.lineTo(1.83, 0.02); perfil.lineTo(1.83, 0.86); perfil.lineTo(1.5, 1.22); perfil.lineTo(-1.5, 1.22); perfil.lineTo(-1.83, 0.86); perfil.closePath();
  const hdmi = new THREE.Mesh(new THREE.ExtrudeGeometry(perfil, { depth: 3, bevelEnabled: false }), metal);
  hdmi.position.set(POS.hdmi[0], 0, -10.4);
  g.add(hdmi);
  const fundoH = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.95, 0.1), escuro);
  fundoH.position.set(POS.hdmi[0], 0.55, -7.36);
  g.add(fundoH);
  [-1.05, 0, 1.05].forEach((k) => {
    const buraco = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.01, 1.35), escuro);
    buraco.position.set(POS.hdmi[0] + k, 1.225, -9.1);
    const lingua = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.8), metal);
    lingua.position.set(POS.hdmi[0] + k, 1.2, -9.2);
    lingua.rotation.x = -0.12;
    g.add(buraco, lingua);
  });
  const pinoGeo = pernaGeo(0.4, 0.3, 0.07, 0.016);
  const listaPino = [];
  for (let i = 0; i < 19; i++) listaPino.push([0.3 + (i - 9) * 0.13, -7.3, -PI / 2]);
  g.add(pernas(pinoGeo, new THREE.MeshStandardMaterial({ color: 0xd8a84e, metalness: 1, roughness: 0.3 }), listaPino));
  [-1.72, 2.06].forEach((a) => { const t = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.75), metal); t.position.set(a, 0.38, -7.05); g.add(t); });
  const brilhoHdmi = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.55, 0.02), new THREE.MeshBasicMaterial({ color: 0xffb01f, transparent: true, opacity: 0, toneMapped: false }));
  brilhoHdmi.position.set(POS.hdmi[0], 0.55, -7.3);
  g.add(brilhoHdmi);

  // ---------- rede e USB, à esquerda do HDMI, como nas fotos ----------
  const porta = (x0, x1, z0, z1, alt, abas) => {
    const c = new THREE.Mesh(caixaArredondada(x1 - x0, z1 - z0, alt, 0.08), metal);
    c.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    g.add(c);
    abas.forEach(([a, b, w, d]) => {
      const fresta = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.012, d + 0.1), escuro);
      fresta.position.set(a, alt + 0.004, b);
      const lamina = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), metal);
      lamina.position.set(a, alt + 0.012, b);
      g.add(fresta, lamina);
    });
  };
  porta(-12.3, -7.1, -10.5, -6.5, 2.3, [[-11.3, -8.5, 0.34, 1.9], [-8.7, -8.6, 0.5, 2]]);
  porta(-16.2, -13.2, -10.2, -6.3, 2, [[-14.5, -8.3, 0.4, 1.8]]);

  // ---------- diodos pretos e peças miúdas ----------
  const diodo = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.09, 0.24), escuro, 3);
  const m4 = new THREE.Matrix4();
  [[-1.65, -1.62], [-1.38, -1.62], [-1.92, -1.36]].forEach(([a, b], i) => { m4.makeTranslation(a, 0.055, b); diodo.setMatrixAt(i, m4); });
  g.add(diodo);
  const mMiudos = {
    r: new THREE.MeshStandardMaterial({ color: 0x1d1d22, roughness: 0.55 }),
    c: new THREE.MeshStandardMaterial({ color: 0xb49a78, roughness: 0.62 }),
    C: new THREE.MeshStandardMaterial({ color: 0xb49a78, roughness: 0.62 }),
  };
  const corpoB = new THREE.BoxGeometry(1, 1, 1);
  const contar = { r: 0, c: 0, C: 0 };
  PECAS_MIUDAS.forEach(([t]) => { contar[t]++; });
  const insts = {}, idx = { r: 0, c: 0, C: 0 };
  for (const t of Object.keys(mMiudos)) insts[t] = new THREE.InstancedMesh(corpoB, mMiudos[t], Math.max(1, contar[t]));
  const pontas = new THREE.InstancedMesh(corpoB, prata(), PECAS_MIUDAS.length * 2);
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  let np = 0;
  PECAS_MIUDAS.forEach(([t, a, b, pe]) => {
    const [L, Wd, Hd] = DIM_SMD[t], e = 0.06;
    sc.set(pe ? Wd * 0.96 : L - 2 * e, Hd * 0.92, pe ? L - 2 * e : Wd * 0.96);
    m4.compose(v.set(a, Hd / 2 + 0.006, b), q, sc);
    insts[t].setMatrixAt(idx[t]++, m4);
    [-1, 1].forEach((l) => {
      sc.set(pe ? Wd : e, Hd, pe ? e : Wd);
      m4.compose(v.set(a + (pe ? 0 : (l * (L - e)) / 2), Hd / 2 + 0.006, b + (pe ? (l * (L - e)) / 2 : 0)), q, sc);
      pontas.setMatrixAt(np++, m4);
    });
  });
  g.add(insts.r, insts.c, insts.C, pontas);
  return { g, brilhoHdmi, nor, pmicRtd, pmicCxd };
}

// Tubo com brilho correndo: mostra a tensão passando.
function tuboDeSinal(renderer, pontos, cor, raio = 0.034, passos = 60, tensao = 0.15) {
  const curva = new THREE.CatmullRomCurve3(pontos.map((p) => new THREE.Vector3(...p)), false, "catmullrom", tensao);
  const tex = telaDeCanvas(renderer, 128, 8, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#ffffff00"); g.addColorStop(0.5, "#ffffffb0"); g.addColorStop(1, "#ffffff00");
    x.fillStyle = cor; x.fillRect(0, 0, w, h);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, Math.round(curva.getLength() * 0.9)), 1);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
  const m = new THREE.Mesh(new THREE.TubeGeometry(curva, passos, raio, 8, false), mat);
  m.renderOrder = 6;
  return m;
}

// Caminho de uma trilha da interposer: pontos em pixels do desenho, em cima do flex já assentado.
const trilha = (lista, y) => lista.map(([a, b]) => [placaX(a), y, placaZ(b)]);

// ---------- o reparo montado camada por camada: s vai de 0 a 5 com a rolagem ----------
export async function initStory(canvas, camadaRotulos, { pequena = false } = {}) {
  const { renderer, scene } = base(canvas, pequena ? 1.5 : 1.75);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const luz = new THREE.DirectionalLight(0xffffff, 0.8);
  luz.position.set(-4, 10, 7);
  scene.add(luz);
  const [t, b, tela, chipTopo] = await Promise.all([textura(renderer, "3d/flex-topo.webp"), textura(renderer, "3d/flex-base.webp"), textura(renderer, "ps5-hdmi-tool-tela-do-programa.webp"), textura(renderer, "3d/chip-realtek.webp")]);

  const pl = placa(renderer, pequena);
  scene.add(pl.g);
  const rtd = RTD(renderer, chipTopo);
  scene.add(rtd);
  const anel = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.62, 56), new THREE.MeshBasicMaterial({ color: 0xff2b3d, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
  anel.rotation.x = -PI / 2;
  anel.position.y = 0.04;
  scene.add(anel);
  const peca = flex(renderer, t, b);
  // o centro dos dois footprints da peça fica exatamente sobre o centro dos pads do Realtek
  const pecaPos = [placaX(296.5), placaZ(391)];
  peca.position.set(pecaPos[0], 0, pecaPos[1]);
  scene.add(peca);
  const mn = MN(renderer);
  scene.add(mn);

  // ---------- tensões ----------
  const NIVEL = T + 0.012 + 0.018, BAIXO = 0.03;
  // Do PMIC do Realtek até os pinos do Realtek na placa, contornando o CI. O traçado na placa é ilustração.
  const pmicX = POS.pmicRtd[0], pmicZ = POS.pmicRtd[1];
  const z33 = placaZ(279.5), z09 = placaZ(264.5), xPad = placaX(420.5);
  const placa33 = tuboDeSinal(renderer, [[pmicX + 0.18, BAIXO, pmicZ - 0.44], [pmicX + 0.5, BAIXO, -1.0], [-1.5, BAIXO, -2.15], [-1, BAIXO, -2.46], [1.9, BAIXO, -2.46], [2.42, BAIXO, -2], [2.42, BAIXO, z33 - 0.12], [2.3, BAIXO, z33], [xPad + 0.12, BAIXO, z33]], "#ff4757", 0.03, 110, 0.05);
  const placa09 = tuboDeSinal(renderer, [[pmicX - 0.1, BAIXO, pmicZ - 0.44], [pmicX + 0.26, BAIXO, -1.0], [-1.62, BAIXO, -2.3], [-1.05, BAIXO, -2.6], [1.98, BAIXO, -2.6], [2.58, BAIXO, -2.06], [2.58, BAIXO, z09 - 0.12], [2.46, BAIXO, z09], [xPad + 0.12, BAIXO, z09]], "#4fb8ff", 0.03, 110, 0.05);
  // Trilhas reais da interposer, seguidas no desenho técnico.
  const flex33 = tuboDeSinal(renderer, trilha([[420.5, 279.5], [533, 280], [545, 292], [545, 557], [453, 647], [441, 657]], NIVEL), "#ff4757", 0.022, 90, 0.04);
  const flexEn = tuboDeSinal(renderer, trilha([[481, 265], [493, 265], [523, 297], [523, 427], [553, 453], [553, 527], [517, 560], [507, 561], [473, 592], [417.4, 643.8], [417.4, 717], [441, 731]], NIVEL), "#4fb8ff", 0.022, 120, 0.04);
  const flex18 = tuboDeSinal(renderer, trilha([[524.5, 658], [520, 671], [477, 713.5], [477, 745], [478, 753], [320, 753], [365, 707], [365, 627], [477, 497], [533, 437], [533, 337], [497, 305], [481, 310]], NIVEL), "#ffb01f", 0.022, 150, 0.04);
  scene.add(placa33, placa09, flex33, flexEn, flex18);
  // brilho no PMIC do Realtek
  const brilhoPmic = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 40), new THREE.MeshBasicMaterial({ color: 0xffb01f, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
  brilhoPmic.rotation.x = -PI / 2;
  brilhoPmic.position.set(pmicX, 0.03, pmicZ);
  scene.add(brilhoPmic);
  // o fio que a interposer dispensa: sairia do PMIC do CXD, perto do CXD
  const fio = tuboDeSinal(renderer, [[POS.pmicCxd[0] - 0.2, 0.26, POS.pmicCxd[1] - 0.5], [3.9, 1.7, 9.6], [3.6, 2.3, 6], [2.7, 1.7, 3.5], [1.4, 0.4, 1.5]], "#ff4757", 0.05, 80);
  scene.add(fio);

  // ---------- tela do programa e a ligação até a NOR ----------
  const janela = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.2 * (552 / 1022)), new THREE.MeshBasicMaterial({ map: tela, transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide }));
  janela.position.set(5.6, 4.5, 1.4);
  janela.rotation.set(-0.5, -0.14, -0.03);
  scene.add(janela);
  const leva = tuboDeSinal(renderer, [[5.6, 3.05, 2.2], [5.8, 1.9, 4.2], [5.6, 1, 5.9], [POS.nor[0], 0.42, POS.nor[1]]], "#a78bfa", 0.05);
  scene.add(leva);
  const video = tuboDeSinal(renderer, [[0.48, T + 0.25, -1.4], [0.48, 0.14, -2.2], [0.4, 0.12, -4.4], [0.3, 0.5, -7.25]], "#ffb01f", 0.05);
  scene.add(video);
  const brilhoNor = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.2, 40), new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
  brilhoNor.rotation.x = -PI / 2;
  brilhoNor.position.set(POS.nor[0], 0.04, POS.nor[1]);
  scene.add(brilhoNor);

  // Posições da câmera ao longo da rolagem: [s, posição, para onde olha]
  const CAM = [
    [0, [1.7, 19, 12.4], [1.6, 0, 0.8]],
    [0.3, [1.7, 19, 12.4], [1.6, 0, 0.8]],
    [0.82, [1.9, 7.6, 6.7], [0, 0.6, 0.1]],
    [1.72, [-1.05, 5.3, 6.2], [0, 0.05, 0.45]],
    [2.72, [1.5, 7.2, 7], [0, 0.2, 0.5]],
    [3.14, [-3.1, 7.4, 6.8], [-0.3, 0, 0.5]],
    [3.46, [2.7, 2.8, 5.1], [1.28, 0.05, 2.32]],
    [3.66, [2.7, 2.8, 5.1], [1.28, 0.05, 2.32]],
    [3.86, [2.4, 19.2, 15.4], [2.1, 0.5, 6.1]],
    [4.42, [6.4, 13, 15.5], [4.2, 1.6, 4.2]],
    [5, [1.2, 15.5, 11.5], [0.9, 0.6, -1.6]],
  ];
  const quadro = (s) => {
    let i = 0;
    while (i < CAM.length - 2 && s > CAM[i + 1][0]) i++;
    const [a, pa, la] = CAM[i], [z, pz, lz] = CAM[i + 1];
    const k = sm(a, z, s);
    return { p: pa.map((v, n) => mix(v, pz[n], k)), l: la.map((v, n) => mix(v, lz[n], k)) };
  };

  // Pontas das pernas do U1 na cena: onde ficam as etiquetas dos pinos.
  const ux = (px) => placaX(px), uz = (py) => placaZ(py);
  // Rótulos em HTML presos a pontos da cena. lado: e = à esquerda do ponto, d = à direita, sem lado = em cima.
  const ROTULOS = [
    { txt: "Conector HDMI", cor: "br", pos: () => [POS.hdmi[0], 1.3, -7.5], de: -1, ate: 0.42 },
    { txt: "Realtek RTD2175P · R$ 1.700", cor: "vm", pos: () => [0, rtd.position.y + 0.3, -1.05], de: -1, ate: 0.86 },
    { txt: "CXD", cor: "br", pos: () => [POS.cxd[0], 0.4, POS.cxd[1] - 1.8], de: -1, ate: 0.42 },
    { txt: "NOR", cor: "ro", pos: () => [POS.nor[0], 0.4, POS.nor[1] - 0.8], de: -1, ate: 0.42 },
    { txt: "PMIC do Realtek", cor: "am", pos: () => [pmicX, 0.26, pmicZ - 0.42], de: -1, ate: 0.42 },
    { txt: "Os pads aparecem através do flex", cor: "am", pos: () => [0, 0.3, -2.1], de: 1.46, ate: 2.02 },
    { txt: "MN864739 · R$ 80 em média", cor: "am", pos: () => [0, mn.position.y + 0.3, -1.4], de: 2.28, ate: 3 },
    { txt: "PMIC do Realtek: 3,3 V e 0,9 V", cor: "am", pos: () => [pmicX, 0.26, pmicZ - 0.48], de: 3.04, ate: 3.32 },
    { txt: "Pino 1 · 3,3 V", cor: "vm", lado: "e", oy: -12, pos: () => [ux(424), 0.1, uz(657.5)], de: 3.38, ate: 3.72 },
    { txt: "Pino 2 · GND", cor: "br", lado: "e", oy: 0, pos: () => [ux(424), 0.1, uz(695)], de: 3.38, ate: 3.72 },
    { txt: "Pino 3 · EN 0,9 V", cor: "az", lado: "e", oy: 12, pos: () => [ux(424), 0.1, uz(731)], de: 3.38, ate: 3.72 },
    { txt: "Saída 1,8 V", cor: "am", lado: "d", oy: -8, pos: () => [ux(541), 0.1, uz(658)], de: 3.42, ate: 3.72 },
    { txt: "Sem ligação", cor: "br", lado: "d", oy: 8, pos: () => [ux(541), 0.1, uz(731)], de: 3.42, ate: 3.72 },
    { txt: "Sem fio puxado do PMIC do CXD", cor: "vm", pos: () => [3.6, 2.5, 6], de: 3.74, ate: 4 },
    { txt: "PS5 HDMI Tool grava a NOR", cor: "ro", pos: () => [POS.nor[0], 0.75, POS.nor[1] - 0.9], de: 4.22, ate: 4.76 },
    { txt: "Vídeo de volta", cor: "am", pos: () => [POS.hdmi[0], 1.5, -8], de: 4.72, ate: 5.1 },
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
    rtd.position.y = sobe * 3.6;
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
    mn.position.y = mix(3.8, T + 0.014, n);
    mn.rotation.y = (1 - n) * -0.6;
    transparencia(mn, sm(1.96, 2.18, s));
    // tensões: primeiro o PMIC do Realtek, depois as trilhas da peça até o U1 e a saída de 1,8 V
    const corre = calmo ? 0 : agora / 1000;
    const fim = 1 - sm(4.1, 4.4, s) * 0.5;
    const noPmic = sm(3.02, 3.2, s);
    brilhoPmic.material.opacity = noPmic * (1 - sm(3.34, 3.5, s)) * (0.55 + 0.45 * Math.sin(agora / 260));
    placa33.material.opacity = sm(3.06, 3.24, s) * fim; placa33.material.map.offset.x = -corre * 0.9;
    placa09.material.opacity = sm(3.1, 3.28, s) * fim; placa09.material.map.offset.x = -corre * 0.9;
    flex33.material.opacity = sm(3.26, 3.42, s) * fim; flex33.material.map.offset.x = -corre * 0.9;
    flexEn.material.opacity = sm(3.3, 3.46, s) * fim; flexEn.material.map.offset.x = -corre * 0.9;
    flex18.material.opacity = sm(3.4, 3.56, s) * fim; flex18.material.map.offset.x = -corre * 0.9;
    fio.material.opacity = sm(3.7, 3.8, s) * (1 - sm(3.92, 4.02, s));
    fio.material.map.offset.x = -corre;
    // programa grava a NOR e o vídeo volta
    const pr = sm(4.04, 4.42, s);
    const saiPr = 1 - sm(4.62, 4.82, s);
    janela.visible = pr * saiPr > 0.001;
    janela.material.opacity = pr * saiPr;
    janela.position.y = mix(3, 4.5, pr);
    leva.material.opacity = sm(4.2, 4.42, s) * saiPr;
    leva.material.map.offset.x = -corre * 0.8;
    brilhoNor.material.opacity = pr * saiPr * (0.45 + 0.45 * Math.sin(agora / 260));
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
      const a = (r.de < 0 ? 1 : sm(r.de, r.de + 0.1, s)) * (1 - sm(r.ate - 0.1, r.ate, s));
      r.el.style.opacity = a;
      if (a <= 0.01) { r.el.style.visibility = "hidden"; return; }
      r.el.style.visibility = "visible";
      r.v.set(...r.pos()).project(cam);
      const x = (r.v.x * 0.5 + 0.5) * largura, y = (-r.v.y * 0.5 + 0.5) * altura;
      const lw = r.el.offsetWidth;
      if (r.lado === "e") {
        r.el.style.transform = `translate(${Math.max(lw + 6, x - 12)}px,${y + (r.oy || 0)}px) translate(-100%,-50%)`;
      } else if (r.lado === "d") {
        r.el.style.transform = `translate(${Math.min(largura - lw - 6, x + 12)}px,${y + (r.oy || 0)}px) translate(0,-50%)`;
      } else {
        const mw = lw / 2 + 8;
        r.el.style.transform = `translate(${Math.max(mw, Math.min(largura - mw, x))}px,${Math.max(26, Math.min(altura - 12, y))}px) translate(-50%,-100%)`;
      }
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
