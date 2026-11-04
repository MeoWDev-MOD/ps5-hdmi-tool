// Movimento da página: rolagem suave (Lenis), entrada e revelações ao rolar (GSAP), como no PS-5 Controle Test.
// O conteúdo já nasce visível: se algo falhar ou o sistema pedir menos movimento, nada some.
"use strict";

function splitWords(h) {
  const wrap = (txt, cls) => txt.split(/(\s+)/).map((w) => (/^\s*$/.test(w) ? w : `<span class="w ${cls}">${w}</span>`)).join("");
  h.innerHTML = [...h.childNodes].map((n) => (n.nodeType === 3 ? wrap(n.textContent, "") : wrap(n.textContent, n.className))).join("");
  return h.querySelectorAll(".w");
}

export function initFx() {
  const { gsap, ScrollTrigger, Lenis } = window;
  if (!gsap || !ScrollTrigger || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  const desktop = matchMedia("(hover: hover) and (pointer: fine)").matches;

  // rolagem suave só com mouse/trackpad: no toque, a rolagem nativa do celular é melhor
  if (Lenis && desktop) {
    const lenis = new Lenis({ lerp: 0.11, anchors: true }); // a folga do cabeçalho vem do scroll-padding-top
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const h1 = document.querySelector(".hero h1");
  if (h1) {
    const words = splitWords(h1);
    gsap.timeline({ defaults: { ease: "power3.out", clearProps: "transform,opacity,visibility" } })
      .from(".webcta", { y: -18, autoAlpha: 0, duration: 0.6 })
      .from(words, { yPercent: 55, autoAlpha: 0, duration: 0.65, stagger: 0.035 }, "-=0.35")
      .from(".hero .lead, .hero .cta, .hero .chips", { y: 18, autoAlpha: 0, duration: 0.55, stagger: 0.09 }, "-=0.4")
      .from(".stage3d, .caption", { y: 44, autoAlpha: 0, duration: 0.85, stagger: 0.12 }, 0.2);
  }

  // seções entram em cascata ao rolar (os passos do 3D ficam de fora: já têm o próprio destaque)
  const items = gsap.utils.toArray(".sec .h > *, .sec .card:not(.passo), .sec details, .sec > .cta, .foto");
  gsap.set(items, { y: 26, autoAlpha: 0 });
  ScrollTrigger.batch(items, {
    start: "top 92%", once: true,
    onEnter: (b) => gsap.to(b, { y: 0, autoAlpha: 1, duration: 0.6, ease: "power3.out", stagger: 0.06, clearProps: "transform,opacity,visibility" }),
  });

  // barras da conta do reparo crescem quando aparecem
  gsap.utils.toArray(".barra i").forEach((b) => {
    gsap.from(b, { scaleX: 0, duration: 1.1, ease: "power3.out", scrollTrigger: { trigger: b, start: "top 88%", once: true }, clearProps: "transform" });
  });

  // barra de progresso e aba ativa no menu
  gsap.to("#scrollBar", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });
  document.querySelectorAll(".links a[href^='#']").forEach((a) => {
    const sec = document.querySelector(a.getAttribute("href"));
    if (sec) ScrollTrigger.create({ trigger: sec, start: "top 45%", end: "bottom 45%", toggleClass: { targets: a, className: "on" } });
  });
}
