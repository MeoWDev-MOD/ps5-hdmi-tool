// Cortina entre as páginas do site. A chegada é só CSS (classe "pt" no <html>): nunca fica presa.
"use strict";

/** Vale a cortina? Só para outra página do próprio site, abrindo na mesma aba e sem ser download. */
export function isPageLink(href, here, { target = "", download = false, modified = false } = {}) {
  if (!href || target === "_blank" || download || modified) return false;
  let to;
  try { to = new URL(href, here); } catch { return false; }
  const from = new URL(here);
  if (to.origin !== from.origin || to.pathname === from.pathname) return false;
  return !/\.(apk|txt|pdf|png|jpg|svg|zip)$/i.test(to.pathname);
}

export function initPageFx(logoSrc) {
  const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let curtain = null;
  new Image().src = logoSrc;   // já carregada quando a cortina fechar
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a || e.defaultPrevented || calm() || !window.gsap) return;
    if (!isPageLink(a.href, location.href, { target: a.target, download: a.hasAttribute("download"), modified: e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0 })) return;
    e.preventDefault();
    curtain = document.createElement("div");
    curtain.className = "ptc";
    curtain.innerHTML = `<img src="${logoSrc}" alt="">`;
    document.body.appendChild(curtain);
    try { sessionStorage.setItem("hdmi.pt", "1"); } catch { /* modo privado: chega sem cortina */ }
    gsap.timeline({ onComplete: () => location.assign(a.href) })
      .fromTo(curtain, { clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)", duration: 0.42, ease: "power3.inOut" })
      .fromTo(curtain.firstChild, { scale: 0.7, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.24, ease: "back.out(2)" }, "-=0.18");
  });
  // voltar pelo navegador restaura a página como estava: tira a cortina
  addEventListener("pageshow", (e) => { if (e.persisted && curtain) { curtain.remove(); curtain = null; } });
}
