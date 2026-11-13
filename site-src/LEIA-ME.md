# Fontes do site (docs/)

- `cena3d.js`: modelos 3D do site. Gera `docs/js/cena3d.js`, com o Three.js junto:
  `NODE_PATH="<pasta com three instalado>/node_modules" esbuild site-src/cena3d.js --bundle --minify --format=esm --target=es2020 --outfile=docs/js/cena3d.js`
- `placa-cobre.json`: contorno do cobre exposto da placa, tirado de `docs/assets/board/04-detalhe-realtek.jpg` com a perspectiva corrigida. Posições das peças em `cena3d.js` (`POS`, `SMD`, `FUROS`), medidas nas fotos da placa. Componentes da interposer em `CAPS_PX` e `U1_PX`, em pixels do desenho técnico: é isso que os mantém nos pads.
- `preparar_imagens.py`: gera `docs/img` a partir das fotos e dos desenhos da peça.

O resto do site é HTML, CSS e JS direto em `docs/`, sem etapa de build.

## Idiomas (inglês, espanhol e russo)

As páginas em português de `docs/` são a fonte. `site-src/i18n/traduzir.py` gera `docs/en/`, `docs/es/` e `docs/ru/`:

- `python site-src/i18n/traduzir.py extrair` lista os textos em `site-src/i18n/textos-pt.json` e mostra o que falta traduzir (`faltando-<idioma>.json`).
- As traduções ficam em `site-src/i18n/en.txt`, `es.txt` e `ru.txt`: uma linha `@@ chave` e, embaixo, o texto traduzido, com o mesmo HTML da página.
- `python site-src/i18n/traduzir.py gerar` escreve as páginas traduzidas, o `sitemap.xml` com os quatro idiomas e atualiza, nas páginas em português, os links de idioma (`<!--i18n:head-->`) e o menu (`<!--i18n:menu-->`, no cabeçalho). Se faltar alguma tradução, ele para e não publica página pela metade.
- Mudou um texto em português? Rode `extrair`, traduza o que aparecer em `faltando-*.json` e rode `gerar`.
- Imagens com texto: `site-src/i18n/og.py` gera `docs/img/og-<idioma>.jpg`; as telas do programa em inglês e espanhol são `docs/img/ps5-hdmi-tool-tela-do-programa-<idioma>.webp` (o russo usa a de inglês, porque o programa não tem russo). A troca de imagem por idioma fica em `site-src/i18n/config.json`.
- O idioma escolhido fica em `techmeow.lang` no navegador e vale para todos os sites de techmeow.app. Sem escolha, quem tem o navegador em outro idioma só vê uma sugestão; a página não muda sozinha (o Google vê cada versão como ela é).
