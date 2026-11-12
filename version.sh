#!/usr/bin/env bash
# Pone una "marca de versión" (?v=...) en todos los archivos del juego que se
# cargan entre sí. Así, después de publicar, ningún celular mezcla archivos
# nuevos con viejos guardados en su memoria (eso puede romper la app).
# Correrlo antes de cada publicación:  ./version.sh
set -euo pipefail
cd "$(dirname "$0")"
v=$(date -u +%Y%m%d%H%M)
for f in docs/*.js; do
  [ "$f" = docs/motor.js ] && continue # copia exacta del árbitro: no se toca
  sed -i -E "s#(from '\./[a-z]+\.js)(\?v=[0-9]+)?'#\1?v=$v'#g; s#(^import '\./[a-z]+\.js)(\?v=[0-9]+)?'#\1?v=$v'#g" "$f"
done
for f in docs/index.html web/index.html; do
  sed -i -E "s#(estilos\.css|app\.js)(\?v=[0-9]+)?\"#\1?v=$v\"#g" "$f"
done
echo "Versión $v"
