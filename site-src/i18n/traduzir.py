# Gera as versões traduzidas do site (en/, es/, ru/...) a partir das páginas em português de docs/.
#
#   python site-src/i18n/traduzir.py extrair   lista os textos das páginas em textos-pt.json e o que falta em cada idioma
#   python site-src/i18n/traduzir.py gerar     escreve docs/<idioma>/... e atualiza, nas páginas em português,
#                                              os blocos entre <!--i18n:head--> e <!--i18n:menu--> (links de idioma e menu)
#
# As páginas em português continuam sendo a fonte. Cada texto vira uma unidade (parágrafo, título, item, botão,
# atributo alt/title/aria-label, meta de descrição, pergunta do JSON-LD) com uma chave curta (sha1 do texto).
# As traduções ficam em <idioma>.json: "@@ chave" + texto. Mudou o texto em português? A chave muda,
# a tradução falta e o "gerar" para e lista o que falta: nada sai em português sem ninguém ver.
# Só usa a biblioteca padrão do Python. Configuração do site em config.json, ao lado deste arquivo.
import hashlib
import json
import os
import posixpath
import re
import sys
from html.parser import HTMLParser

AQUI = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(AQUI, "config.json"), encoding="utf-8"))
REPO = os.path.abspath(os.path.join(AQUI, "..", ".."))
DOCS = os.path.join(REPO, CFG.get("docs", "docs"))
BASE = CFG["base"]  # endereço público da raiz do site, com / no fim
PAGINAS = CFG["paginas"]  # caminhos relativos a docs/, ex.: "index.html", "guia/index.html"
IDIOMAS = CFG["idiomas"]  # ex.: ["en", "es", "ru"]
ORIGEM = CFG.get("origem", "pt-BR")
CHAVE_LS = CFG.get("chave_idioma", "techmeow.lang")

NOMES = {"pt": "Português", "en": "English", "es": "Español", "ru": "Русский"}
LOCALE = {"pt": "pt_BR", "en": "en_US", "es": "es_ES", "ru": "ru_RU"}
HTML_LANG = {"pt": ORIGEM, "en": "en", "es": "es", "ru": "ru"}
SUGESTAO = {
    "pt": ("Ler esta página em português?", "Abrir"),
    "en": ("Read this page in English?", "Open"),
    "es": ("¿Leer esta página en español?", "Abrir"),
    "ru": ("Открыть эту страницу на русском?", "Открыть"),
}
ROTULO_MENU = {"pt": "Idioma", "en": "Language", "es": "Idioma", "ru": "Язык"}

VAZIOS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
INLINE = {"a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", "em", "i", "img", "kbd", "mark", "q", "s",
          "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "svg"}
PULAR = {"script", "style", "svg", "template", "pre", "textarea"}
ATRIBUTOS = {"alt", "title", "aria-label", "placeholder"} | set(CFG.get("atributos_extra", []))
META_TRADUZ = {"description", "keywords", "og:title", "og:description", "og:image:alt", "twitter:title",
               "twitter:description", "twitter:image:alt"}
LETRA = re.compile(r"[A-Za-zÀ-ÿ]")


def chave(t):
    return hashlib.sha1(t.encode("utf-8")).hexdigest()[:10]


def normal(t):
    return re.sub(r"\s+", " ", t).strip()


# ---------------------------------------------------------------- leitura do HTML com a posição de cada pedaço
class No:
    def __init__(self, tag, attrs, ini, fim_abre):
        self.tag, self.attrs, self.ini, self.fim_abre = tag, attrs, ini, fim_abre
        self.ini_fecha = self.fim = None
        self.filhos = []


class Texto:
    def __init__(self, ini, fim, bruto):
        self.ini, self.fim, self.bruto = ini, fim, bruto


class Leitor(HTMLParser):
    def __init__(self, src):
        super().__init__(convert_charrefs=False)
        self.src = src
        self.linhas = [0]
        for m in re.finditer("\n", src):
            self.linhas.append(m.end())
        self.raiz = No("#doc", [], 0, 0)
        self.pilha = [self.raiz]

    def pos(self):
        lin, col = self.getpos()
        return self.linhas[lin - 1] + col

    def handle_starttag(self, tag, attrs):
        ini = self.pos()
        texto = self.get_starttag_text()
        no = No(tag, attrs, ini, ini + len(texto))
        if tag in ("li", "p", "option", "dt", "dd") and self.pilha[-1].tag == tag:
            self._fecha(self.pilha[-1], ini)
            self.pilha.pop()
        self.pilha[-1].filhos.append(no)
        if tag in VAZIOS:
            no.ini_fecha = no.fim = no.fim_abre
        else:
            self.pilha.append(no)

    def handle_startendtag(self, tag, attrs):
        ini = self.pos()
        no = No(tag, attrs, ini, ini + len(self.get_starttag_text()))
        no.ini_fecha = no.fim = no.fim_abre
        self.pilha[-1].filhos.append(no)

    def handle_endtag(self, tag):
        ini = self.pos()
        fim = self.src.index(">", ini) + 1
        if not any(n.tag == tag for n in self.pilha[1:]):
            return
        while self.pilha[-1].tag != tag:
            self._fecha(self.pilha.pop(), ini)
        no = self.pilha.pop()
        no.ini_fecha, no.fim = ini, fim

    def _fecha(self, no, ini):
        no.ini_fecha = no.fim = ini

    def _texto(self, bruto):
        ini = self.pos()
        self.pilha[-1].filhos.append(Texto(ini, ini + len(bruto), bruto))

    def handle_data(self, d):
        self._texto(d)

    def handle_entityref(self, n):
        self._texto(f"&{n};")

    def handle_charref(self, n):
        self._texto(f"&#{n};")


def ler(src):
    p = Leitor(src)
    p.feed(src)
    p.close()
    while len(p.pilha) > 1:
        p._fecha(p.pilha.pop(), len(src))
    return p.raiz


def eh_inline(no):
    if isinstance(no, Texto):
        return True
    if no.tag not in INLINE:
        return False
    if no.tag == "svg":
        return True
    return all(eh_inline(f) for f in no.filhos)


# ---------------------------------------------------------------- unidades de tradução
def unidades(src):
    """Lista (ini, fim, texto normalizado, tipo) de tudo que se traduz na página."""
    raiz = ler(src)
    saida = []

    def atributos(no):
        d = dict(no.attrs)
        if no.tag == "meta":
            nome = d.get("name") or d.get("property") or ""
            if nome in META_TRADUZ and d.get("content") and LETRA.search(d["content"]):
                saida.append(("attr", no, "content", d["content"]))
            return
        for k, v in no.attrs:
            if k in ATRIBUTOS and v and LETRA.search(v):
                saida.append(("attr", no, k, v))

    def corrida(nos):
        # trecho de nós inline seguidos: com texto direto, vira uma unidade; só com elementos, cada um é visto por si
        # (os atributos dos elementos de dentro de uma unidade com texto viajam junto com ela, na mesma tradução)
        tem_texto = any(isinstance(n, Texto) and LETRA.search(n.bruto) for n in nos)
        if not tem_texto:
            for n in nos:
                if not isinstance(n, Texto) and n.tag not in PULAR:
                    container(n)
            return
        uteis = [n for n in nos if not (isinstance(n, Texto) and not n.bruto.strip())]
        ini, fim = uteis[0].ini, uteis[-1].fim
        bruto = src[ini:fim]
        # espaço nas pontas fica fora da unidade
        a = len(bruto) - len(bruto.lstrip())
        b = len(bruto.rstrip())
        saida.append(("bloco", ini + a, ini + b, bruto[a:b]))

    def visita_attrs(no):
        if no.tag in ("script", "style", "template"):
            return
        atributos(no)
        for f in no.filhos:
            if not isinstance(f, Texto):
                visita_attrs(f)

    def container(no):
        if no.tag in PULAR:
            if no.tag == "svg":
                return
            if no.tag == "script":
                tipo = dict(no.attrs).get("type", "")
                if tipo == "application/ld+json":
                    saida.append(("jsonld", no.fim_abre, no.ini_fecha, src[no.fim_abre:no.ini_fecha]))
            return
        atributos(no)
        grupo = []
        for f in no.filhos:
            if eh_inline(f):
                grupo.append(f)
                continue
            if grupo:
                corrida(grupo)
                grupo = []
            container(f)
        if grupo:
            corrida(grupo)

    container(raiz)
    return saida


JSONLD_TEXTO = {"description", "text", "headline", "caption", "alternateName", "articleBody", "abstract"}
JSONLD_NOME_EM = {"Question", "HowToStep", "HowToSection", "HowTo", "ListItem", "Offer", "WebPage", "Article", "BlogPosting"}


def textos_jsonld(obj, tipo_pai=None):
    """Strings do JSON-LD que se traduzem (descrições, perguntas, respostas)."""
    if isinstance(obj, dict):
        tipo = obj.get("@type", tipo_pai)
        for k, v in obj.items():
            if isinstance(v, str):
                if (k in JSONLD_TEXTO or (k == "name" and tipo in JSONLD_NOME_EM)) and LETRA.search(v):
                    yield v
            else:
                yield from textos_jsonld(v, tipo)
    elif isinstance(obj, list):
        for v in obj:
            yield from textos_jsonld(v, tipo_pai)


def troca_jsonld(obj, trad, tipo_pai=None):
    if isinstance(obj, dict):
        tipo = obj.get("@type", tipo_pai)
        novo = {}
        for k, v in obj.items():
            if isinstance(v, str) and (k in JSONLD_TEXTO or (k == "name" and tipo in JSONLD_NOME_EM)) and LETRA.search(v):
                novo[k] = trad(v)
            else:
                novo[k] = troca_jsonld(v, trad, tipo)
        return novo
    if isinstance(obj, list):
        return [troca_jsonld(v, trad, tipo_pai) for v in obj]
    return obj


def textos_da_pagina(src):
    """Textos normalizados, na ordem em que aparecem."""
    out = []
    for u in unidades(src):
        if u[0] == "bloco":
            out.append(normal(u[3]))
        elif u[0] == "attr":
            out.append(normal(u[3]))
        else:
            try:
                out.extend(normal(t) for t in textos_jsonld(json.loads(u[3])))
            except json.JSONDecodeError:
                pass
    return out


# ---------------------------------------------------------------- caminhos
def url_pagina(pag, idioma):
    d = posixpath.dirname(pag)
    pre = "" if idioma == "pt" else idioma + "/"
    return BASE + pre + (d + "/" if d else "")


def caminho_pagina(pag, idioma):
    return pag if idioma == "pt" else idioma + "/" + pag


def relativo(de_pag, para_pag):
    a = posixpath.dirname(de_pag) or "."
    b = posixpath.dirname(para_pag) or "."
    r = posixpath.relpath(b, a)
    return "./" if r == "." else r + "/"


PAG_DIRS = {posixpath.dirname(p) for p in PAGINAS}


def eh_pagina(destino):
    """O endereço relativo (já resolvido a partir de docs/) aponta para uma página traduzida?"""
    d = destino.split("#")[0].split("?")[0]
    if d.endswith("index.html"):
        d = posixpath.dirname(d)
    d = d.rstrip("/")
    return d in PAG_DIRS or (d == "." and "" in PAG_DIRS)


def reescreve_caminhos(html, pag):
    """Página movida para <idioma>/: recurso ganha ../, link para outra página traduzida continua igual."""
    base_dir = posixpath.dirname(pag)

    def ajusta(url):
        if not url or re.match(r"^([a-z][a-z0-9+.-]*:|//|#|/|\{|\$)", url, re.I):
            return url
        alvo = posixpath.normpath(posixpath.join(base_dir, url.split("#")[0].split("?")[0] or "."))
        if eh_pagina(alvo if not url.endswith("/") else alvo + "/"):
            return url
        return "../" + url

    def attr(m):
        nome, aspas, valor = m.group(1), m.group(2), m.group(3)
        if nome.lower() == "srcset":
            partes = [p.strip() for p in valor.split(",")]
            valor = ", ".join(" ".join([ajusta(p.split()[0])] + p.split()[1:]) for p in partes if p)
        else:
            valor = ajusta(valor)
        return f"{nome}={aspas}{valor}{aspas}"

    html = re.sub(r'\b(src|href|poster|srcset|data-src|data-href|data-poster)=(["\'])(.*?)\2', attr, html)
    html = re.sub(r"url\((['\"]?)(?!data:|https?:|/)([^)'\"]+)\1\)", lambda m: f"url({m.group(1)}{ajusta(m.group(2))}{m.group(1)})", html)
    return html


# ---------------------------------------------------------------- blocos injetados (links de idioma e menu)
def bloco_head(pag, idioma):
    linhas = ["<!--i18n:head-->"]
    for i in ["pt"] + IDIOMAS:
        linhas.append(f'<link rel="alternate" hreflang="{HTML_LANG[i]}" href="{url_pagina(pag, i)}">')
    linhas.append(f'<link rel="alternate" hreflang="x-default" href="{url_pagina(pag, "pt")}">')
    mapa = {i: relativo(caminho_pagina(pag, idioma), caminho_pagina(pag, i)) for i in ["pt"] + IDIOMAS}
    sug = {i: SUGESTAO[i] for i in ["pt"] + IDIOMAS}
    linhas.append("<style>" + CSS_MENU + "</style>")
    linhas.append("<script>" + JS_IDIOMA.replace("__ATUAL__", idioma).replace("__MAPA__", json.dumps(mapa))
                  .replace("__SUG__", json.dumps(sug, ensure_ascii=False)).replace("__CHAVE__", CHAVE_LS) + "</script>")
    linhas.append("<!--/i18n:head-->")
    return "\n".join(linhas)


def bloco_menu(pag, idioma):
    itens = []
    for i in ["pt"] + IDIOMAS:
        href = relativo(caminho_pagina(pag, idioma), caminho_pagina(pag, i))
        atual = ' aria-current="true"' if i == idioma else ""
        itens.append(f'<li><a href="{href}" hreflang="{HTML_LANG[i]}" lang="{HTML_LANG[i]}" data-lang="{i}"{atual}>'
                     f'<b>{i.upper()}</b>{NOMES[i]}</a></li>')
    return ("<!--i18n:menu-->"
            f'<div class="i18n-menu" data-i18n-menu><button type="button" class="i18n-btn" aria-haspopup="true" '
            f'aria-expanded="false" aria-label="{ROTULO_MENU[idioma]}: {NOMES[idioma]}" title="{ROTULO_MENU[idioma]}">'
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" '
            'aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 '
            '6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9s1.3-6.2 3.9-9z"/></svg>'
            f'<span>{idioma.upper()}</span></button><ul class="i18n-lista" hidden>{"".join(itens)}</ul></div>'
            "<!--/i18n:menu-->")


CSS_MENU = (
    ".i18n-menu{position:relative;display:inline-flex;flex:none}"
    ".i18n-btn{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 12px;border-radius:99px;"
    "border:1px solid var(--line,rgba(127,127,127,.35));background:var(--surface2,transparent);color:inherit;"
    "font:inherit;font-size:13px;font-weight:700;letter-spacing:.04em;cursor:pointer}"
    ".i18n-btn:hover{border-color:currentColor}"
    ".i18n-lista{position:absolute;right:0;top:calc(100% + 8px);z-index:200;list-style:none;margin:0;padding:6px;"
    "min-width:176px;border-radius:14px;border:1px solid var(--line,rgba(127,127,127,.35));"
    "background:var(--surface,#16122c);box-shadow:0 18px 40px rgba(0,0,0,.35)}"
    ".i18n-lista a{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;color:inherit;"
    "text-decoration:none;font-size:14px;font-weight:600}"
    ".i18n-lista a b{font-size:11px;letter-spacing:.06em;opacity:.65;width:22px}"
    ".i18n-lista a:hover,.i18n-lista a:focus-visible{background:var(--surface2,rgba(127,127,127,.15))}"
    ".i18n-lista a[aria-current]{color:var(--accent,#a78bfa)}"
    ".i18n-sug{position:absolute;right:0;top:calc(100% + 8px);z-index:199;display:flex;align-items:center;gap:8px;"
    "white-space:nowrap;padding:8px 8px 8px 14px;border-radius:99px;font-size:13px;font-weight:600;"
    "border:1px solid var(--line,rgba(127,127,127,.35));background:var(--surface,#16122c);"
    "box-shadow:0 14px 34px rgba(0,0,0,.35)}"
    ".i18n-sug a{padding:6px 12px;border-radius:99px;background:var(--accent,#7c5cff);color:#fff;text-decoration:none}"
    ".i18n-sug button{border:0;background:none;color:inherit;font:inherit;font-size:16px;line-height:1;"
    "padding:4px 6px;cursor:pointer;opacity:.7}"
    # no celular a sugestão vai para o body (cabeçalho fixo com blur prenderia o position:fixed), logo abaixo do topo
    ".i18n-sug.m{position:fixed;left:12px;right:12px;top:calc(76px + env(safe-area-inset-top));z-index:60;"
    "justify-content:space-between;white-space:normal}"
)

# Preferência salva (vale para todos os sites de techmeow.app): abre direto no idioma escolhido.
# Sem preferência e com o navegador em outro idioma: só sugere, sem redirecionar (o Google vê cada página como ela é).
JS_IDIOMA = r"""(function(){var A="__ATUAL__",M=__MAPA__,S=__SUG__,K="__CHAVE__";
function salva(l){try{localStorage.setItem(K,l)}catch(e){}}
var p=null;try{p=localStorage.getItem(K)}catch(e){}
if(p&&p!==A&&M[p]){location.replace(M[p]+location.search+location.hash);return}
document.addEventListener("DOMContentLoaded",function(){var m=document.querySelector("[data-i18n-menu]");if(!m)return;
var b=m.querySelector(".i18n-btn"),l=m.querySelector(".i18n-lista");
function abre(v){l.hidden=!v;b.setAttribute("aria-expanded",v?"true":"false")}
b.addEventListener("click",function(e){e.stopPropagation();var s=document.querySelector(".i18n-sug");if(s)s.remove();abre(l.hidden)});
document.addEventListener("click",function(e){if(!m.contains(e.target))abre(false)});
document.addEventListener("keydown",function(e){if(e.key==="Escape"){abre(false);b.focus()}});
m.querySelectorAll("a[data-lang]").forEach(function(a){a.addEventListener("click",function(e){salva(a.dataset.lang);
e.preventDefault();location.href=a.getAttribute("href")+location.hash})});
if(p)return;var n=((navigator.languages&&navigator.languages[0])||navigator.language||"").toLowerCase().slice(0,2);
var q=M[n]?n:(n&&n!=="pt"?"en":null);if(!q||q===A||!M[q])return;
var s=document.createElement("div");s.className="i18n-sug";s.setAttribute("role","status");s.lang=q;
s.innerHTML='<span></span><a></a><button type="button" aria-label="×">×</button>';
s.querySelector("span").textContent=S[q][0];var a=s.querySelector("a");a.textContent=S[q][1];a.href=M[q];
a.addEventListener("click",function(){salva(q)});
s.querySelector("button").addEventListener("click",function(){salva(A);s.remove()});
if(matchMedia("(max-width:600px)").matches){s.classList.add("m");document.body.appendChild(s)}else m.appendChild(s)})})();"""


def troca_bloco(html, nome, novo):
    rx = re.compile(r"<!--i18n:" + nome + r"-->.*?<!--/i18n:" + nome + "-->", re.S)
    if rx.search(html):
        return rx.sub(lambda m: novo, html, count=1)
    if nome == "head":
        return html.replace("</head>", novo + "\n</head>", 1)
    raise SystemExit("falta o marcador <!--i18n:menu--><!--/i18n:menu--> no cabeçalho da página")


def limpa_blocos(html):
    """Esvazia os blocos injetados (ficam só os marcadores), para ler e traduzir a página como ela é."""
    return re.sub(r"<!--i18n:(head|menu)-->.*?<!--/i18n:\1-->", r"<!--i18n:\1--><!--/i18n:\1-->", html, flags=re.S)


# ---------------------------------------------------------------- tradução de uma página
def traduz_pagina(src, pag, idioma, dic, faltas):
    def t(texto):
        n = normal(texto)
        k = chave(n)
        if k in dic:
            return dic[k]
        faltas.setdefault(k, n)
        return texto

    trocas = []
    for u in unidades(src):
        if u[0] == "bloco":
            _, ini, fim, bruto = u
            trocas.append((ini, fim, t(bruto)))
        elif u[0] == "attr":
            _, no, nome, valor = u
            abre = src[no.ini:no.fim_abre]
            m = re.search(r'(\s' + re.escape(nome) + r'\s*=\s*)(["\'])(.*?)\2', abre, re.S)
            if m:
                novo = t(valor).replace('"', "&quot;") if m.group(2) == '"' else t(valor)
                trocas.append((no.ini + m.start(3), no.ini + m.end(3), novo))
        else:
            _, ini, fim, bruto = u
            try:
                dados = json.loads(bruto)
            except json.JSONDecodeError:
                continue
            dados = troca_jsonld(dados, t)
            trocas.append((ini, fim, "\n" + json.dumps(ajusta_jsonld(dados, pag, idioma), ensure_ascii=False, indent=2) + "\n"))
    trocas.sort(key=lambda x: x[0], reverse=True)
    out = src
    for ini, fim, novo in trocas:
        out = out[:ini] + novo + out[fim:]
    return out


def ajusta_jsonld(obj, pag, idioma):
    pt_url = url_pagina(pag, "pt")
    if isinstance(obj, dict):
        novo = {}
        for k, v in obj.items():
            if k == "url" and v == pt_url:
                novo[k] = url_pagina(pag, idioma)
            elif k == "inLanguage" and isinstance(v, str):
                novo[k] = HTML_LANG[idioma]
            else:
                novo[k] = ajusta_jsonld(v, pag, idioma)
        return novo
    if isinstance(obj, list):
        return [ajusta_jsonld(v, pag, idioma) for v in obj]
    return obj


def troca_imagens(html, idioma):
    for orig, por in CFG.get("imagens", {}).items():
        if idioma in por:
            html = html.replace(BASE + orig, BASE + por[idioma])
            html = re.sub(r'(["\'(/])' + re.escape(orig) + r'(["\')])', lambda m: m.group(1) + por[idioma] + m.group(2), html)
    return html


def finaliza(html, pag, idioma):
    html = re.sub(r'<html lang="[^"]*"', f'<html lang="{HTML_LANG[idioma]}"', html, count=1)
    url = url_pagina(pag, idioma)
    html = re.sub(r'(<link rel="canonical" href=")[^"]*(")', lambda m: m.group(1) + url + m.group(2), html, count=1)
    html = re.sub(r'(<meta property="og:url" content=")[^"]*(")', lambda m: m.group(1) + url + m.group(2), html, count=1)
    html = re.sub(r'(<meta property="og:locale" content=")[^"]*(")', lambda m: m.group(1) + LOCALE[idioma] + m.group(2), html, count=1)
    html = troca_bloco(html, "head", bloco_head(pag, idioma))
    html = troca_bloco(html, "menu", bloco_menu(pag, idioma))
    return html


# ---------------------------------------------------------------- comandos
def carrega(idioma):
    """Traduções de <idioma>.txt: uma linha "@@ chave" e, embaixo, o texto traduzido (HTML como na página)."""
    f = os.path.join(AQUI, f"{idioma}.txt")
    if not os.path.exists(f):
        return {}
    dic, k, linhas = {}, None, []
    for linha in open(f, encoding="utf-8").read().splitlines():
        if linha.startswith("@@ "):
            if k:
                dic[k] = " ".join(x.strip() for x in linhas if x.strip())
            k, linhas = linha[3:].strip(), []
        elif k and not linha.startswith("#"):
            linhas.append(linha)
    if k:
        dic[k] = " ".join(x.strip() for x in linhas if x.strip())
    return dic


def extrair():
    todos, vistos = [], set()
    for pag in PAGINAS:
        src = limpa_blocos(open(os.path.join(DOCS, pag), encoding="utf-8").read())
        for txt in textos_da_pagina(src):
            k = chave(txt)
            if k not in vistos:
                vistos.add(k)
                todos.append({"k": k, "pagina": pag, "pt": txt})
    json.dump(todos, open(os.path.join(AQUI, "textos-pt.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(todos)} textos em {len(PAGINAS)} páginas -> textos-pt.json")
    for i in IDIOMAS:
        dic = carrega(i)
        falta = [x for x in todos if x["k"] not in dic]
        sobra = set(dic) - vistos
        print(f"  {i}: {len(todos) - len(falta)} traduzidos, {len(falta)} faltando, {len(sobra)} sem uso")
        json.dump(falta, open(os.path.join(AQUI, f"faltando-{i}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def gerar():
    falhou = False
    for idioma in IDIOMAS:
        dic = carrega(idioma)
        faltas = {}
        saidas = {}
        for pag in PAGINAS:
            src = limpa_blocos(open(os.path.join(DOCS, pag), encoding="utf-8").read())
            html = traduz_pagina(src, pag, idioma, dic, faltas)
            html = reescreve_caminhos(html, pag)
            html = troca_imagens(html, idioma)
            saidas[pag] = finaliza(html, pag, idioma)
        if faltas:
            falhou = True
            print(f"{idioma}: faltam {len(faltas)} traduções (ver faltando-{idioma}.json depois do extrair)")
            continue
        for pag, html in saidas.items():
            destino = os.path.join(DOCS, idioma, pag)
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            open(destino, "w", encoding="utf-8", newline="\n").write(html)
        print(f"{idioma}: {len(saidas)} páginas")
    for pag in PAGINAS:
        f = os.path.join(DOCS, pag)
        src = open(f, encoding="utf-8").read()
        novo = troca_bloco(troca_bloco(src, "head", bloco_head(pag, "pt")), "menu", bloco_menu(pag, "pt"))
        if novo != src:
            open(f, "w", encoding="utf-8", newline="\n").write(novo)
    if falhou:
        sys.exit(1)
    sitemap()
    print("ok: português atualizado (links de idioma e menu)")


def sitemap():
    """sitemap.xml com cada página em todos os idiomas e os links entre as versões (config "sitemap")."""
    pags = CFG.get("sitemap")
    if not pags:
        return
    from datetime import date
    hoje = date.today().isoformat()
    todos = ["pt"] + IDIOMAS
    linhas = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for pag in pags:
        for i in todos:
            linhas.append(f"  <url><loc>{url_pagina(pag, i)}</loc><lastmod>{hoje}</lastmod>")
            for j in todos:
                linhas.append(f'    <xhtml:link rel="alternate" hreflang="{HTML_LANG[j]}" href="{url_pagina(pag, j)}"/>')
            linhas.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{url_pagina(pag, "pt")}"/>')
            linhas.append("  </url>")
    linhas.append("</urlset>")
    open(os.path.join(DOCS, "sitemap.xml"), "w", encoding="utf-8", newline="\n").write("\n".join(linhas) + "\n")
    print(f"sitemap.xml: {len(pags) * len(todos)} endereços")


if __name__ == "__main__":
    {"extrair": extrair, "gerar": gerar}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: print(__doc__ or "uso: extrair | gerar"))()
