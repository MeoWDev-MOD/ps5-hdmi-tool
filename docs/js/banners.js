// Banners de publicidade: vêm do CRM (rota pública /api/banners). Se o CRM falhar, o site só fica sem banner.
"use strict";

import { optionalAllowed } from "./consent.js";

export const BANNERS_URL = "https://crm-pessoal-chi.vercel.app/api/banners";
export const EVENTS_URL = `${BANNERS_URL}/evento`;
const isHttps = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };
const fromSupabase = (u) => { try { return new URL(u).hostname.endsWith(".supabase.co"); } catch { return false; } };

// Só aceita o que o CRM deve mandar: arquivo no Supabase e link https.
export function cleanBanners(json) {
  if (!Array.isArray(json?.banners)) return [];
  return json.banners
    .filter((b) => b && typeof b.media_url === "string" && isHttps(b.media_url) && fromSupabase(b.media_url) && (b.kind === "image" || b.kind === "video"))
    .map((b) => ({ id: String(b.id), title: String(b.title ?? ""), media: b.media_url, kind: b.kind, link: typeof b.link_url === "string" && isHttps(b.link_url) ? b.link_url : null }));
}

// `local`: lugar cadastrado no CRM (aba Publicidade). Cada lugar recebe só os anúncios marcados para ele.
export const bannersUrl = (local) => `${BANNERS_URL}?local=${encodeURIComponent(local)}`;

export async function fetchBanners(local, ms = 5000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(bannersUrl(local), { signal: c.signal });
    return r.ok ? cleanBanners(await r.json()) : [];
  } catch { return []; } finally { clearTimeout(t); }
}

// Cada visita começa pelo anúncio seguinte ao último que esta pessoa viu. Sem histórico (ou se ele saiu do ar), sorteia,
// para os anúncios dividirem as visitas novas.
export function firstIndex(ads, lastId, random = Math.random) {
  if (!ads.length) return 0;
  const at = ads.findIndex((a) => a.id === lastId);
  return at < 0 ? Math.floor(random() * ads.length) : (at + 1) % ads.length;
}

// O histórico fica só no navegador; sem armazenamento, os anúncios apenas não alternam entre visitas.
// Sem o aceite dos cookies opcionais, nada fica salvo: o primeiro anúncio da visita é sorteado.
const readLast = (key) => { try { return optionalAllowed() ? localStorage.getItem(key) : null; } catch { return null; } };
const saveLast = (key, id) => { try { if (optionalAllowed()) localStorage.setItem(key, id); } catch { /* segue sem histórico */ } };

// Números do anúncio no CRM (só somas: nada de IP, cookie ou identificação de quem viu). Falhar não atrapalha o site.
function sendEvent(data) {
  try { navigator.sendBeacon(EVENTS_URL, JSON.stringify(data)); } catch { /* o site segue normal */ }
}

// De onde a pessoa chegou: só o nome do site. Guarda o da primeira página da visita, porque depois vem o nosso.
export function sourceOf(referrer) { try { return new URL(referrer).hostname; } catch { return ""; } }
function visitSource() {
  try {
    let source = sessionStorage.getItem("hdmi-de");
    if (source === null) { source = sourceOf(document.referrer); sessionStorage.setItem("hdmi-de", source); }
    return source;
  } catch { return sourceOf(document.referrer); }
}

// O clique passa pelo CRM, que conta e leva ao destino; a origem vai junto só nesse caso.
// Sem o aceite (allowed = false), o CRM só leva ao destino, sem contar.
export function clickLink(link, source, allowed = true) {
  if (!link.startsWith(`${BANNERS_URL}/clique?`)) return link;
  if (!allowed) return `${link}&contar=0`;
  return source ? `${link}&de=${encodeURIComponent(source)}` : link;
}
const currentClickLink = (link) => (optionalAllowed() ? clickLink(link, visitSource(), true) : clickLink(link, "", false));

// Primeira vez que este navegador vê o anúncio: é o que soma em "Pessoas".
function firstTime(id) {
  try {
    const key = `hdmi-ad-visto-${id}`;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
    return true;
  } catch { return false; }
}

// Pelo menos metade do anúncio dentro da tela.
export function mostlyOnScreen(r, width, height) {
  if (!r.width || !r.height) return false;
  const w = Math.min(r.right, width) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, height) - Math.max(r.top, 0);
  return w > 0 && h > 0 && w * h >= (r.width * r.height) / 2;
}

// Avisa quando o anúncio fica 1 s na tela, com a aba à vista e o aceite dos cookies opcionais. Devolve como parar de olhar.
function watchView(el, onSeen) {
  let seen = 0;
  const timer = setInterval(() => {
    seen = !document.hidden && mostlyOnScreen(el.getBoundingClientRect(), innerWidth, innerHeight) ? seen + 1 : 0;
    if (seen >= 2 && optionalAllowed()) { clearInterval(timer); onSeen(); }
  }, 500);
  return () => clearInterval(timer);
}

// Desenha um anúncio em um espaço. Sem anúncio, o espaço fica escondido. Repetir o mesmo anúncio não recomeça o vídeo.
function slotView(slot, box, onFail, onSeen) {
  let shown = null;
  let stopWatching = () => {};
  return (b) => {
    if (!b) { stopWatching(); slot.classList.add("hidden"); shown = null; return; }
    slot.classList.remove("hidden");
    if (shown === b.media) return;
    shown = b.media;
    stopWatching();
    stopWatching = watchView(slot, () => onSeen(b));
    const m = document.createElement(b.kind === "video" ? "video" : "img");
    m.src = b.media;
    if (b.kind === "video") {
      m.muted = true; m.loop = true; m.playsInline = true; m.setAttribute("aria-label", b.title);
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) m.autoplay = true;
    } else m.alt = b.title;
    m.onerror = () => { shown = null; onFail(b); };
    let node = m;
    if (b.link) { const a = document.createElement("a"); a.href = currentClickLink(b.link); a.onclick = () => { a.href = currentClickLink(b.link); }; a.target = "_blank"; a.rel = "noopener sponsored"; a.append(m); node = a; }
    box.replaceChildren(node);
  };
}

// Liga um ou mais espaços ao mesmo lugar do CRM: busca, mostra, troca a cada 20 s e atualiza a cada 10 min.
// Com dois espaços, o segundo mostra o anúncio seguinte ao do primeiro.
function runAds(pairs, local) {
  const key = `hdmi-ad-${local}`;
  let ads = [], i = 0, rotate = 0;
  // Cada anúncio conta uma exibição por abertura da página, mesmo voltando na troca de 20 s.
  const counted = new Set();
  const countView = (b) => {
    if (counted.has(b.id)) return;
    counted.add(b.id);
    sendEvent({ id: b.id, local, tipo: "exibicao", novo: firstTime(b.id), de: visitSource() });
  };
  const views = pairs.map(([slot, box]) => slotView(slot, box, (b) => { ads = ads.filter((x) => x !== b); show(); }, countView));
  function show() {
    views.forEach((view, n) => view(ads.length ? ads[(i + n) % ads.length] : null));
    if (ads.length) saveLast(key, ads[i % ads.length].id);
  }
  async function load() {
    const current = ads.length ? ads[i % ads.length].id : null;
    ads = await fetchBanners(local);
    const keep = ads.findIndex((a) => a.id === current);
    i = keep >= 0 ? keep : firstIndex(ads, readLast(key));
    show();
    clearInterval(rotate);
    if (ads.length > 1) rotate = setInterval(() => { i++; show(); }, 20000);
  }
  load();
  setInterval(load, 600000);
}

export const mountAds = (slot, box, local) => runAds([[slot, box]], local);
// Vários espaços no mesmo lugar do CRM: cada um mostra o anúncio seguinte ao do espaço anterior.
export const mountAdPairs = (pairs, local) => runAds(pairs, local);

// Anúncios verticais nas laterais: só em tela larga o bastante, e só baixa o arquivo quando for aparecer.
export function mountSideAds(pairs, local, query) {
  const wide = matchMedia(query);
  let started = false;
  const start = () => { if (wide.matches && !started) { started = true; runAds(pairs, local); } };
  wide.addEventListener("change", start);
  start();
}
