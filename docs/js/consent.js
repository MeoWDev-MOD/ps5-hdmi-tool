// Termos de uso e cookies. A escolha fica só neste navegador e muda o que o site guarda e conta:
// sem o aceite dos opcionais, nada opcional fica salvo e os anúncios não são contados (ver privacidade/).
// Mesma barra do PS-5 Controle Test, com chaves próprias: os dois sites dividem o domínio.
"use strict";

// Mudou os termos? Troque esta data: o site pede um novo aceite.
export const TERMS_VERSION = "2026-11-04";
const KEY = "hdmi.consent";

// O que só fica salvo com "Aceitar tudo". Tema e a própria escolha são necessários.
const OPTIONAL = [/^hdmi-ad-/];
export const isOptionalKey = (key) => OPTIONAL.some((re) => re.test(key));

const realStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
let memoryChoice = null; // navegador que não deixa salvar: a escolha vale enquanto a página estiver aberta

export function readConsent(storage = realStorage()) {
  let saved = null;
  try { saved = JSON.parse(storage?.getItem(KEY) ?? "null"); } catch { /* lê a da memória */ }
  saved ??= memoryChoice;
  return saved && saved.v === TERMS_VERSION ? saved : null;
}
export const termsAccepted = (storage) => !!readConsent(storage);
export const optionalAllowed = (storage) => readConsent(storage)?.optional === true;

export function purgeOptional(storage = realStorage()) {
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    keys.filter(isOptionalKey).forEach((k) => storage.removeItem(k));
  } catch { /* sem armazenamento: não há o que apagar */ }
  try { globalThis.sessionStorage?.removeItem("hdmi-de"); } catch { /* idem */ }
}

export function saveConsent(optional, storage = realStorage(), now = Date.now()) {
  memoryChoice = { v: TERMS_VERSION, optional: !!optional, at: new Date(now).toISOString() };
  try { storage?.setItem(KEY, JSON.stringify(memoryChoice)); } catch { /* fica na memória */ }
  if (!optional) purgeOptional(storage);
  return memoryChoice;
}

// Mesma cara do localStorage. Sem o aceite, guarda só na memória: some ao fechar a página.
export function optionalStorage(storage = realStorage()) {
  const memory = new Map();
  const open = () => !!storage && optionalAllowed(storage);
  return {
    getItem(k) { try { if (open()) return storage.getItem(k); } catch { /* usa a memória */ } return memory.get(k) ?? null; },
    setItem(k, v) { try { if (open()) { storage.setItem(k, v); return; } } catch { /* usa a memória */ } memory.set(k, String(v)); },
    removeItem(k) { memory.delete(k); try { if (open()) storage.removeItem(k); } catch { /* só na memória */ } },
  };
}

// ---------- barra na parte de baixo da tela ----------
const CSS = `
.ck{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:50;width:min(760px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:14px 16px;border-radius:18px;background:var(--ck-bg);color:var(--text,#f3f0ff);border:1px solid var(--line,rgba(167,139,250,.35));box-shadow:0 16px 44px rgba(5,3,20,.45);font-size:13px;line-height:1.45;--ck-bg:#171134}
:root[data-theme="light"] .ck{--ck-bg:#fff}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]) .ck{--ck-bg:#fff}}
.ck b{display:block;font-size:14px;margin-bottom:2px}
.ck p{margin:0}
.ck a{color:var(--accent,#a78bfa);text-decoration:underline}
.ck-btns{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:10px}
.ck button{flex:1 1 auto;font:inherit;font-weight:600;min-height:44px;padding:8px 16px;border-radius:99px;cursor:pointer;color:var(--text,#f3f0ff);background:transparent;border:1px solid var(--line,rgba(167,139,250,.35))}
.ck .ck-yes{color:#fff;border-color:transparent;background:linear-gradient(100deg,#5a3cf0,#7c3aed 45%,#c026d3 100%)}
.ck button:focus-visible{outline:2px solid var(--accent,#a78bfa);outline-offset:2px}
`;

let rootPath = "";
let bar = null;

// Textos da barra no idioma da página (<html lang>); as páginas em en/, es/ e ru/ são geradas por site-src/i18n.
const A = 'target="_blank" rel="noopener"';
const TXT = {
  pt: { t: "Termos de uso e cookies", no: "Aceitar só o necessário", yes: "Aceitar tudo",
    p: (r) => `Ao usar este site, você aceita os <a href="${r}termos/" ${A}>Termos de uso</a>. Os cookies opcionais lembram o último anúncio visto e contam, sem identificar você, as exibições e os cliques dos anúncios. Veja <a href="${r}privacidade/" ${A}>Privacidade e cookies</a>.` },
  en: { t: "Terms of use and cookies", no: "Accept only the necessary", yes: "Accept all",
    p: (r) => `By using this website, you accept the <a href="${r}termos/" ${A}>Terms of use</a>. Optional cookies remember the last ad you saw and count ad views and clicks without identifying you. See <a href="${r}privacidade/" ${A}>Privacy and cookies</a>.` },
  es: { t: "Términos de uso y cookies", no: "Aceptar solo lo necesario", yes: "Aceptar todo",
    p: (r) => `Al usar este sitio, aceptas los <a href="${r}termos/" ${A}>Términos de uso</a>. Las cookies opcionales recuerdan el último anuncio que viste y cuentan, sin identificarte, las vistas y los clics de los anuncios. Consulta <a href="${r}privacidade/" ${A}>Privacidad y cookies</a>.` },
  ru: { t: "Условия использования и cookie", no: "Только необходимые", yes: "Принять все",
    p: (r) => `Пользуясь этим сайтом, вы принимаете <a href="${r}termos/" ${A}>Условия использования</a>. Необязательные cookie запоминают последнюю показанную рекламу и считают показы и клики по рекламе, не идентифицируя вас. Подробнее: <a href="${r}privacidade/" ${A}>Конфиденциальность и cookie</a>.` },
};
const txt = () => TXT[(document.documentElement.lang || "pt").slice(0, 2).toLowerCase()] ?? TXT.pt;

function draw() {
  const x = txt();
  bar.innerHTML = `<b>${x.t}</b>
    <p>${x.p(rootPath)}</p>
    <div class="ck-btns"><button type="button" class="ck-no">${x.no}</button><button type="button" class="ck-yes">${x.yes}</button></div>`;
  bar.querySelector(".ck-no").onclick = () => choose(false);
  bar.querySelector(".ck-yes").onclick = () => choose(true);
}

function showBar() {
  if (!document.getElementById("ckStyle")) {
    const style = document.createElement("style");
    style.id = "ckStyle";
    style.textContent = CSS;
    document.head.append(style);
  }
  if (!bar) {
    bar = document.createElement("section");
    bar.className = "ck";
    document.body.append(bar);
  }
  bar.setAttribute("aria-label", txt().t);
  draw();
}

function choose(optional) {
  saveConsent(optional);
  bar?.remove();
  bar = null;
}

// root: caminho até a raiz do site, a partir da página atual ("" na inicial, "../" nas outras).
export function mountConsent(root = "") {
  rootPath = root;
  document.addEventListener("click", (e) => {
    if (!e.target.closest?.("[data-ck-manage]")) return;
    e.preventDefault();
    showBar();
  });
  if (!termsAccepted()) showBar();
}
