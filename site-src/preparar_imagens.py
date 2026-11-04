# Prepara as imagens do site em docs/img: fotos em WebP e as texturas do flex usadas no modelo 3D.
# A cor do desenho técnico vira material: substrato âmbar translúcido, trilha opaca, pad prateado e serigrafia branca.
import os, shutil
import numpy as np
from PIL import Image, ImageFilter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(REPO, "docs")
SAIDA = os.path.join(DOCS, "img")
BRUTO = "F:/PROJECT IDE/CRM Perssoal/publicidade/Interposer PS5"
CAD = "F:/PROJECT IDE/PS5 HDMI TooL/INSTERPOSER"
for d in ("", "3d", "placa", "ferramentas"):
    os.makedirs(os.path.join(SAIDA, d), exist_ok=True)


def webp(origem, destino, largura=None, q=82):
    im = Image.open(origem)
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    if largura and im.width > largura:
        im = im.resize((largura, round(im.height * largura / im.width)), Image.LANCZOS)
    im.save(os.path.join(SAIDA, destino), "WEBP", quality=q, method=6)
    print(destino, im.size, os.path.getsize(os.path.join(SAIDA, destino)) // 1024, "KB")


# Fotos reais (a peça tem o código e o C1 corrigidos em relação à foto retocada)
F = BRUTO + "/EDICAO/fonte/"
A = BRUTO + "/ARQUIVO BRUTO/WhatsApp Image 2026-10-30 at "
webp(F + "peca.png", "interposer-ps5-tech-meow.webp", 773, 86)
webp(F + "flex-na-placa.jpg", "interposer-ps5-flex-transparente-na-placa.webp", 1000)
webp(F + "soldado.jpg", "ci-hdmi-nuvoton-mn864739-soldado-na-interposer.webp", 960)
webp(A + "12.17.02 (2).jpeg", "interposers-ps5-flex-frente-e-verso.webp", 960)
webp(F + "realtek-cortado.png", "realtek-rtd2175p-cortado-de-placa.webp", 566, 84)
webp(F + "gato.png", "logo-gato-tech-meow.webp", 487, 88)
Image.open(REPO + "/docs/assets/screenshot.png").convert("RGB").crop((0, 0, 1022, 552)).save(os.path.join(SAIDA, "ps5-hdmi-tool-tela-do-programa.webp"), "WEBP", quality=88, method=6)
B = REPO + "/docs/assets/board/"
webp(B + "01-visao-geral.jpg", "placa/ci-hdmi-ps5-slim-visao-geral.webp", 900)
webp(B + "02-proximo-ao-conector.jpg", "placa/ci-hdmi-ps5-slim-perto-do-conector.webp", 900)
webp(B + "03-entre-apu-e-conector.jpg", "placa/ci-hdmi-ps5-slim-entre-apu-e-conector.webp", 900)
webp(B + "04-detalhe-realtek.jpg", "placa/realtek-rtd2175p-detalhe-na-placa.webp", 900)
T = REPO + "/docs/assets/tools/"
for arq, nome in (("ch341a", "programador-ch341a"), ("flux-amtech-nc559", "fluxo-amtech-nc559"), ("pasta-solda-183c", "pasta-de-solda-183c"), ("estacao-ar-quente-sugon-2020d", "estacao-sugon-2020d"), ("ferro-aifen-a9-pro-c210", "ferro-aifen-a9-pro")):
    webp(T + arq + ".png", "ferramentas/" + nome + ".webp", 320)
for lado, nome in (("rtd2175p", "chip-realtek-rtd2175p"), ("mn864739", "chip-panasonic-mn864739")):
    webp(REPO + "/docs/assets/chips/" + lado + ".png", nome + ".webp", 420)
L = Image.open(REPO + "/docs/assets/logo.png").convert("RGBA")
L.resize((192, 192), Image.LANCZOS).save(os.path.join(SAIDA, "icon-192.png"))
L.resize((180, 180), Image.LANCZOS).save(os.path.join(SAIDA, "icon-180.png"))


def textura(origem, destino):
    im = Image.open(os.path.join(CAD, origem)).convert("RGBA")
    im = im.resize((im.width * 4, im.height * 4), Image.BICUBIC)
    a = np.asarray(im).astype(float)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3] / 255
    branco = (b > 165) & (r > 200) & (g > 200)
    escuro = (r < 95) & (g < 95)
    trilha = (r > 225) & (g > 125) & (g < 188) & (b < 70)
    pad = (r > 200) & (g > 165) & (b > 58) & ~branco & ~trilha
    out = np.zeros(a.shape)
    out[...] = (214, 128, 8, 172)          # substrato: âmbar translúcido, deixa ver a placa
    out[trilha] = (255, 178, 44, 250)
    out[pad] = (226, 222, 208, 255)
    out[branco] = (255, 253, 244, 255)
    out[escuro] = (46, 30, 8, 240)
    out[..., 3] *= al
    t = Image.fromarray(out.astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(1.4))
    t = t.resize((1186, round(1186 * t.height / t.width)), Image.LANCZOS)
    t.save(os.path.join(SAIDA, "3d", destino), "WEBP", quality=90, method=6)
    print(destino, t.size, os.path.getsize(os.path.join(SAIDA, "3d", destino)) // 1024, "KB")


textura("INTERPOSER TOP BUTTON 1.png", "flex-topo.webp")
textura("INTERPOSER DOWN BUTTON.png", "flex-base.webp")
# Vídeo e arquivos antigos continuam em docs/assets: o README e o guia em Markdown apontam para lá.
