# Gera a imagem de compartilhamento (1200x630) em cada idioma: docs/img/og-<idioma>.jpg.
# Mesmo visual de docs/img/og.jpg (português): fundo roxo, texto à esquerda e a peça à direita.
# Uso: python site-src/i18n/og.py   (precisa do Google Chrome instalado)
import os
import subprocess
import tempfile

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.abspath(os.path.join(AQUI, "..", "..", "docs"))
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

TEXTOS = {
    "en": ("For PS5 Slim technicians",
           'PS5 Interposer: swap the <em>R$1,700</em> HDMI chip for an <em>R$80</em> one.',
           "Transparent flex, 1.8 V regulator already soldered and a free program for the NOR."),
    "es": ("Para técnicos de PS5 Slim",
           'Interposer PS5: cambia el chip HDMI de <em>R$ 1.700</em> por uno de <em>R$ 80</em>.',
           "Flex transparente, regulador de 1,8 V ya soldado y programa gratis para la NOR."),
    "ru": ("Для мастеров PS5 Slim",
           'Интерпозер PS5: замените HDMI-чип за <em>1 700 R$</em> на чип за <em>80 R$</em>.',
           "Прозрачный гибкий шлейф, стабилизатор 1,8 В уже впаян, бесплатная программа для NOR."),
}

HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:1200px;height:630px;overflow:hidden}}
body{{background:radial-gradient(760px 520px at 74% 46%,#2b1a73 0%,#170f45 46%,#0c0920 100%);color:#f3f0ff;
font-family:"Segoe UI",system-ui,sans-serif;position:relative}}
.txt{{position:absolute;left:64px;top:92px;width:690px}}
.k{{font-size:21px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#b9a6ff}}
h1{{font-size:{tam}px;line-height:1.12;font-weight:800;margin:16px 0 22px;letter-spacing:-.01em}}
h1 em{{font-style:normal;color:#ffb21f}}
p{{font-size:25px;line-height:1.38;color:#cfc6f2;margin:0 0 26px;max-width:650px}}
.pill{{display:inline-block;padding:11px 22px;border-radius:99px;border:1px solid rgba(185,166,255,.45);
background:rgba(255,255,255,.06);font-size:20px;font-weight:700}}
img{{position:absolute;right:46px;top:30px;height:580px;transform:rotate(5deg);
filter:drop-shadow(0 26px 40px rgba(0,0,0,.55))}}
</style></head><body><img src="{img}"><div class="txt"><div class="k">{k}</div><h1>{h}</h1><p>{p}</p>
<span class="pill">PS5 HDMI Tool · Interposer Tech MeoW</span></div></body></html>"""


def main():
    img = "file:///" + os.path.join(DOCS, "img", "interposer-ps5-tech-meow.webp").replace("\\", "/")
    with tempfile.TemporaryDirectory() as tmp:
        for lang, (k, h, p) in TEXTOS.items():
            tam = 56 if lang != "ru" else 50
            html = os.path.join(tmp, f"og-{lang}.html")
            open(html, "w", encoding="utf-8").write(HTML.format(img=img, k=k, h=h, p=p, tam=tam))
            png = os.path.join(tmp, f"og-{lang}.png")
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                            "--allow-file-access-from-files", f"--screenshot={png}", "--window-size=1200,630",
                            "file:///" + html.replace("\\", "/")], check=True, capture_output=True)
            destino = os.path.join(DOCS, "img", f"og-{lang}.jpg")
            Image.open(png).convert("RGB").crop((0, 0, 1200, 630)).save(destino, "JPEG", quality=88, optimize=True)
            print(destino, os.path.getsize(destino) // 1024, "KB")


if __name__ == "__main__":
    main()
