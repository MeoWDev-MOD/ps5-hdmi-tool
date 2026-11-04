// Página do PS5 HDMI Tool: anúncios do CRM, tema, efeitos e os modelos 3D (carregados só quando vão aparecer).
import { initUI, themeSwitch } from "./ui.js";
import { mountAdPairs, mountSideAds } from "./banners.js";
import { mountConsent } from "./consent.js";
import { startShader } from "./shader.js";
import { initPageFx } from "./pagefx.js";
import { initFx } from "./fx.js";

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;
const economia = navigator.connection?.saveData === true;
const pequena = matchMedia("(max-width: 980px)").matches;

const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);

initUI();
mountConsent();
mountAdPairs([[$("adSlot"), $("adMedia")], [$("adSlot2"), $("adMedia2")]], "hdmi-site");
mountSideAds([[$("adL"), $("adLMedia")], [$("adR"), $("adRMedia")]], "hdmi-site-lado", "(min-width: 1580px) and (min-height: 720px)");

$("themeBtn").onclick = (e) => themeSwitch(e, () => {
  const next = isDark() ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem("hdmi.theme", next); } catch { /* modo privado */ }
});

startShader($("fxBg"), isDark).start();
initPageFx("img/logo-gato-tech-meow.webp");
initFx();

// Barra de compra no celular: aparece quando os botões principais saem da tela.
const barra = $("mDl");
if (barra) new IntersectionObserver(([e]) => barra.classList.toggle("on", !e.isIntersecting && e.boundingClientRect.top < 0)).observe(document.querySelector(".hero .cta"));

// ---------- 3D ----------
let modulo3d = null;
const carrega3d = () => (modulo3d ??= import("./cena3d.js"));
const quandoOcioso = (fn) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 900));

async function ligaHero() {
  const canvas = $("hero3d");
  if (calmo || economia || !canvas) return;
  try {
    const m = await carrega3d();
    if (!m.has3D()) return;
    window.__hero = await m.initHero(canvas, { onReady: () => $("heroStage").classList.add("pronto") });
  } catch (e) { console.warn("3D da peça indisponível", e); }
}

// Rolagem dentro da seção vira s de 0 a 5 (um trecho para cada passo).
function ligaStory() {
  const secao = $("montagem"), canvas = $("story3d");
  if (!secao || !canvas) return;
  const passos = [...secao.querySelectorAll(".passo")];
  const semGl = () => secao.classList.add("nogl");
  let cena = null;
  const calcula = () => {
    const meio = innerHeight * (pequena ? 0.72 : 0.5);
    const a = passos[0].getBoundingClientRect(), z = passos[passos.length - 1].getBoundingClientRect();
    const ini = a.top + a.height / 2, fim = z.top + z.height / 2;
    const p = Math.max(0, Math.min(1, (meio - ini) / (fim - ini)));
    const s = p * 5;
    const atual = Math.min(passos.length - 1, Math.round(p * (passos.length - 1)));
    passos.forEach((el, i) => el.classList.toggle("on", atual === i));
    // Com menos movimento, para em cada passo em vez de acompanhar a rolagem.
    cena?.ir(calmo ? (atual / (passos.length - 1)) * 5 : s);
  };
  addEventListener("scroll", calcula, { passive: true });
  addEventListener("resize", calcula, { passive: true });
  calcula();
  if (economia) { semGl(); return; }
  const io = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    try {
      const m = await carrega3d();
      if (!m.has3D()) { semGl(); return; }
      cena = await m.initStory(canvas, $("rotulos3d"), { pequena });
      window.__story = cena;
      $("storyStage").classList.add("pronto");
      calcula();
    } catch (err) { console.warn("3D do reparo indisponível", err); semGl(); }
  }, { rootMargin: "900px" });
  io.observe(secao);
}

quandoOcioso(ligaHero);
ligaStory();
