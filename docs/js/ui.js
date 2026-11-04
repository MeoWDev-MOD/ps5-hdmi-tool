// Microinterações da interface (inspiradas em Animate UI, uiverse, Vengeance UI, Forge UI e UI Lora,
// recriadas aqui em JS puro, sem dependências). Tudo respeita "reduzir movimento" do sistema.
"use strict";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- luz que segue o ponteiro nos cartões .spot
function spotlight() {
  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest?.(".spot");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", (e.clientX - r.left) + "px");
    el.style.setProperty("--my", (e.clientY - r.top) + "px");
  }, { passive: true });
}

// ---- ondinha no toque dos botões (confirma o clique)
function ripple() {
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest?.("button.b, .snav button");
    if (!b || b.disabled || reduced()) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2;
    const w = document.createElement("span");
    w.className = "ripple";
    w.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.appendChild(w);
    w.addEventListener("animationend", () => w.remove(), { once: true });
  });
}

// ---- botão magnético: puxa levemente em direção ao cursor
function magnetic() {
  document.addEventListener("pointermove", (e) => {
    if (reduced() || e.pointerType !== "mouse") return;
    const b = e.target.closest?.(".magnetic");
    document.querySelectorAll(".magnetic.pull").forEach((x) => { if (x !== b) { x.classList.remove("pull"); x.style.transform = ""; } });
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    b.classList.add("pull");
    b.style.transform = `translate(${(dx * 6).toFixed(1)}px,${(dy * 4).toFixed(1)}px)`;
  }, { passive: true });
  document.addEventListener("pointerleave", () => document.querySelectorAll(".magnetic.pull").forEach((x) => { x.classList.remove("pull"); x.style.transform = ""; }));
}

// ---- pílula que desliza até o item ativo de um seletor (.seg)
export function moveSeg(seg) {
  const pill = seg?.querySelector(".segpill"), on = seg?.querySelector("button.on");
  if (!pill || !on || !on.offsetWidth) return;
  pill.style.width = on.offsetWidth + "px";
  pill.style.transform = `translateX(${on.offsetLeft}px)`;
}

// ---- troca de tema com revelação circular a partir do botão
export function themeSwitch(e, apply) {
  const btn = e.currentTarget;
  btn.classList.remove("flip"); void btn.offsetWidth; btn.classList.add("flip");
  if (!document.startViewTransition || reduced()) { apply(); return; }
  const r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = document.startViewTransition(apply);
  vt.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 480, easing: "cubic-bezier(.2,.7,.2,1)", pseudoElement: "::view-transition-new(root)" },
    );
  }).catch(() => {});
}

// ---- número que sobe animado
const counters = new WeakMap();
export function countTo(el, to, suffix = "") {
  const from = counters.get(el) ?? 0;
  counters.set(el, to);
  if (from === to) { el.textContent = to + suffix; return; }
  if (reduced()) { el.textContent = to + suffix; return; }
  const t0 = performance.now(), dur = 420;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    el.textContent = v + suffix;
    if (k < 1 && counters.get(el) === to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---- anel de progresso (0 a 1)
export function setRing(svg, frac) {
  const c = svg.querySelector(".ring-val"); if (!c) return;
  const len = 2 * Math.PI * c.r.baseVal.value;
  c.style.strokeDasharray = String(len);
  c.style.strokeDashoffset = String(len * (1 - Math.max(0, Math.min(1, frac))));
  svg.classList.toggle("full", frac >= 1);
}

// ---- "pulinho" quando algo muda para OK
export function pop(el) {
  if (!el || reduced()) return;
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
}

export function initUI() {
  spotlight();
  ripple();
  magnetic();
  addEventListener("resize", () => document.querySelectorAll(".seg").forEach(moveSeg));
}
