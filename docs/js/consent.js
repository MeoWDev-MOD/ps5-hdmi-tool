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

function draw() {
  bar.innerHTML = `<b>Termos de uso e cookies</b>
    <p>Ao usar este site, você aceita os <a href="${rootPath}termos/" target="_blank" rel="noopener">Termos de uso</a>. Os cookies opcionais lembram o último anúncio visto e contam, sem identificar você, as exibições e os cliques dos anúncios. Veja <a href="${rootPath}privacidade/" target="_blank" rel="noopener">Privacidade e cookies</a>.</p>
    <div class="ck-btns"><button type="button" class="ck-no">Aceitar só o necessário</button><button type="button" class="ck-yes">Aceitar tudo</button></div>`;
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
  bar.setAttribute("aria-label", "Termos de uso e cookies");
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
