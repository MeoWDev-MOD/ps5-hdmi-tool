# Fontes do site (docs/)

- `cena3d.js`: modelos 3D do site. Gera `docs/js/cena3d.js`, com o Three.js junto:
  `NODE_PATH="<pasta com three instalado>/node_modules" esbuild site-src/cena3d.js --bundle --minify --format=esm --target=es2020 --outfile=docs/js/cena3d.js`
- `preparar_imagens.py`: gera `docs/img` a partir das fotos e dos desenhos da peça.

O resto do site é HTML, CSS e JS direto em `docs/`, sem etapa de build.
