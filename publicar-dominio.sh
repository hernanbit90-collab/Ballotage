#!/usr/bin/env bash
# Publica BALLOTAGE en una dirección linda de Firebase (por ejemplo
# https://ballotage.web.app). Gratis, sin tarjeta. Se corre en Google Cloud Shell:
#
#   git clone https://github.com/hernanbit90-collab/Ballotage.git ~/Ballotage 2>/dev/null; cd ~/Ballotage && git pull -q && bash publicar-dominio.sh
#
# Se hace una sola vez: después el juego se actualiza solo desde GitHub.

set -uo pipefail
PROYECTO="ballotage-4edb5"
FB="npx --yes firebase-tools@13"
VERDE='\033[1;32m'; AMARILLO='\033[1;33m'; ROJO='\033[1;31m'; NADA='\033[0m'
paso() { echo -e "\n${VERDE}▶ $*${NADA}"; }
fallar() { echo -e "\n${ROJO}✖ $*${NADA}\n"; exit 1; }
cd "$(dirname "$0")"

paso "Conectando con Firebase"
if ! $FB projects:list >/dev/null 2>&1; then
  echo -e "${AMARILLO}Abrí el link que aparece abajo, elegí tu cuenta, tocá Permitir, copiá el código y pegalo acá.${NADA}"
  $FB login --no-localhost || fallar "No se pudo iniciar sesión en Firebase."
fi

paso "Buscando un nombre libre para la dirección"
SITIO=""
for N in ${1:-} ballotage ballotage-juego jugaballotage ballotage-online ballotage-ar; do
  [ -z "$N" ] && continue
  if $FB hosting:sites:get "$N" --project "$PROYECTO" >/dev/null 2>&1 \
     || $FB hosting:sites:create "$N" --project "$PROYECTO" >/dev/null 2>&1; then
    SITIO="$N"; break
  fi
  echo "  $N.web.app está ocupada, pruebo otra…"
done
[ -n "$SITIO" ] || fallar "No encontré un nombre libre. Probá con uno tuyo: bash publicar-dominio.sh minombre"
echo "  ¡Conseguida! $SITIO.web.app"

paso "Publicando la página"
cat > firebase.dominio.json <<JSON
{
  "hosting": {
    "site": "$SITIO",
    "public": "web",
    "headers": [{ "source": "**", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }]
  }
}
JSON
$FB deploy --only hosting --config firebase.dominio.json --project "$PROYECTO" --non-interactive \
  || fallar "No se pudo publicar. Volvé a correr el mismo comando."

paso "Autorizando la dirección nueva para entrar con Google"
TOKEN="$(gcloud auth print-access-token 2>/dev/null)"
API="https://identitytoolkit.googleapis.com/admin/v2/projects/$PROYECTO/config"
ACTUAL="$(curl -s -H "Authorization: Bearer $TOKEN" -H "X-Goog-User-Project: $PROYECTO" "$API")"
CUERPO="$(echo "$ACTUAL" | SITIO="$SITIO" python3 -c '
import json, os, sys
c = json.load(sys.stdin)
d = c.get("authorizedDomains", [])
for x in (os.environ["SITIO"] + ".web.app", os.environ["SITIO"] + ".firebaseapp.com"):
    if x not in d: d.append(x)
print(json.dumps({"authorizedDomains": d}))' 2>/dev/null)"
if [ -n "$CUERPO" ] && curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "X-Goog-User-Project: $PROYECTO" \
     -H 'Content-Type: application/json' "$API?updateMask=authorizedDomains" -d "$CUERPO" | grep -q "$SITIO.web.app"; then
  echo "  Listo."
else
  echo -e "${AMARILLO}  No pude hacerlo solo. Agregá a mano $SITIO.web.app en:${NADA}"
  echo "  https://console.firebase.google.com/project/$PROYECTO/authentication/settings  (Dominios autorizados)"
fi

echo -e "\n${VERDE}══════════════════════════════════════════════${NADA}"
echo -e "${VERDE}  ¡Listo! El juego ya está en:${NADA}"
echo -e "${VERDE}     https://$SITIO.web.app${NADA}"
echo -e "${VERDE}══════════════════════════════════════════════${NADA}\n"
