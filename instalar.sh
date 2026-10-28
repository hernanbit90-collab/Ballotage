#!/usr/bin/env bash
# Instalador automático de BALLOTAGE para Google Cloud Shell.
#
# Hace todo: crea el proyecto de Firebase, lo conecta a tu cuenta de
# facturación (con alerta de 1 USD), activa el ingreso con mail, crea la base
# de datos, sube el árbitro y las reglas, y publica la página.
#
# Uso (en https://shell.cloud.google.com):
#   git clone https://github.com/hernanbit90-collab/Ballotage.git && cd Ballotage && bash instalar.sh
#
# Si algo falla, se puede volver a correr: retoma donde quedó.

set -uo pipefail

FB="npx --yes firebase-tools@13"
VERDE='\033[1;32m'; AMARILLO='\033[1;33m'; ROJO='\033[1;31m'; NADA='\033[0m'
paso() { echo -e "\n${VERDE}▶ $*${NADA}"; }
aviso() { echo -e "${AMARILLO}⚠ $*${NADA}"; }
fallar() { echo -e "\n${ROJO}✖ $*${NADA}\n"; exit 1; }

cd "$(dirname "$0")"
[ -f firebase.json ] || fallar "Corré este script desde la carpeta Ballotage."

# ------------------------------------------------------------------ 1. Proyecto
ID_GUARDADO=".proyecto-firebase"
if [ -n "${1:-}" ]; then
  PROYECTO="$1"
elif [ -f "$ID_GUARDADO" ]; then
  PROYECTO="$(cat "$ID_GUARDADO")"
else
  PROYECTO="ballotage-$(head -c 200 /dev/urandom | tr -dc 'a-z0-9' | head -c 6)"
fi
echo "$PROYECTO" > "$ID_GUARDADO"

paso "Iniciando sesión en Firebase (abrí el link que aparece, elegí tu cuenta y pegá el código acá)"
if ! $FB projects:list >/dev/null 2>&1; then
  $FB login --no-localhost || fallar "No se pudo iniciar sesión en Firebase."
fi

paso "Proyecto: $PROYECTO"
if $FB projects:list --json 2>/dev/null | grep -q "\"projectId\": \"$PROYECTO\""; then
  echo "Ya existe, sigo."
else
  $FB projects:create "$PROYECTO" --display-name "BALLOTAGE" \
    || fallar "No pude crear el proyecto. Si es la primera vez que usás Firebase, entrá una vez a https://console.firebase.google.com, aceptá los términos y volvé a correr: bash instalar.sh"
fi
gcloud config set project "$PROYECTO" >/dev/null 2>&1

# ------------------------------------------------------------------ 2. Facturación
paso "Conectando la facturación (plan Blaze: con amigos cuesta \$0)"
CUENTA="$(gcloud billing accounts list --filter='open=true' --format='value(name)' 2>/dev/null | head -n1)"
if [ -z "$CUENTA" ]; then
  fallar "No encontré una cuenta de facturación. Creala una sola vez acá (pide tarjeta): https://console.cloud.google.com/billing/create  — y después volvé a correr: bash instalar.sh"
fi
gcloud billing projects link "$PROYECTO" --billing-account="$CUENTA" >/dev/null \
  || fallar "No pude conectar la facturación al proyecto."
echo "Facturación conectada ($CUENTA)."

paso "Poniendo una alerta de gasto de 1 USD"
gcloud services enable billingbudgets.googleapis.com --project "$PROYECTO" >/dev/null 2>&1
if gcloud billing budgets list --billing-account="$CUENTA" --format='value(displayName)' 2>/dev/null | grep -q "BALLOTAGE"; then
  echo "La alerta ya estaba."
else
  gcloud billing budgets create --billing-account="$CUENTA" --display-name="BALLOTAGE 1 USD" \
    --budget-amount=1USD --threshold-rule=percent=0.5 --threshold-rule=percent=1.0 \
    --filter-projects="projects/$PROYECTO" >/dev/null 2>&1 \
    && echo "Listo: te llega un mail si el gasto pasa de 0,50 o 1 USD." \
    || aviso "No pude crear la alerta automáticamente. Hacelo a mano en https://console.cloud.google.com/billing/budgets (monto 1 USD)."
fi

# ------------------------------------------------------------------ 3. Ingreso con mail
paso "Activando el ingreso con mail y contraseña"
gcloud services enable identitytoolkit.googleapis.com --project "$PROYECTO" >/dev/null 2>&1
TOKEN="$(gcloud auth print-access-token)"
API="https://identitytoolkit.googleapis.com"
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "X-Goog-User-Project: $PROYECTO" \
  "$API/v2/projects/$PROYECTO/identityPlatform:initializeAuth" >/dev/null 2>&1
RESP="$(curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "X-Goog-User-Project: $PROYECTO" \
  -H 'Content-Type: application/json' \
  "$API/admin/v2/projects/$PROYECTO/config?updateMask=signIn.email,authorizedDomains" \
  -d "{\"signIn\":{\"email\":{\"enabled\":true,\"passwordRequired\":true}},\"authorizedDomains\":[\"localhost\",\"$PROYECTO.firebaseapp.com\",\"$PROYECTO.web.app\",\"hernanbit90-collab.github.io\"]}")"
if echo "$RESP" | grep -q '"error"'; then
  aviso "No pude activar el mail automáticamente. Hacelo a mano: https://console.firebase.google.com/project/$PROYECTO/authentication/providers → Correo electrónico/contraseña → activar."
else
  echo "Ingreso con mail activado."
fi

# ------------------------------------------------------------------ 4. Base de datos
paso "Creando la base de datos"
INSTANCIA="$PROYECTO-default-rtdb"
if $FB database:instances:list --project "$PROYECTO" 2>/dev/null | grep -q "$INSTANCIA"; then
  echo "Ya existe, sigo."
else
  $FB database:instances:create "$INSTANCIA" --location us-central1 --project "$PROYECTO" \
    || fallar "No pude crear la base de datos."
fi

# ------------------------------------------------------------------ 5. App web y config.js
paso "Registrando la app web"
APP_ID="$($FB apps:list WEB --project "$PROYECTO" --json 2>/dev/null | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try { const r = JSON.parse(s).result || []; console.log(r.length ? r[0].appId : ""); } catch { console.log(""); }
  });')"
if [ -z "$APP_ID" ]; then
  APP_ID="$($FB apps:create WEB "BALLOTAGE" --project "$PROYECTO" --json 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { console.log(JSON.parse(s).result.appId); } catch { console.log(""); }
    });')"
fi
[ -n "$APP_ID" ] || fallar "No pude registrar la app web."

$FB apps:sdkconfig WEB "$APP_ID" --project "$PROYECTO" --json 2>/dev/null | INSTANCIA="$INSTANCIA" node -e '
  const fs = require("fs");
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const r = JSON.parse(s).result;
    const c = r.sdkConfig || r;
    c.databaseURL = c.databaseURL || ("https://" + process.env.INSTANCIA + ".firebaseio.com");
    const campos = ["apiKey", "authDomain", "databaseURL", "projectId", "storageBucket", "messagingSenderId", "appId"];
    const cuerpo = campos.map((k) => "  " + k + ": " + JSON.stringify(c[k] || "") + ",").join("\n");
    const viejo = fs.readFileSync("docs/config.js", "utf8");
    const nuevo = viejo.replace(/export const firebaseConfig = \{[\s\S]*?\};/, "export const firebaseConfig = {\n" + cuerpo + "\n};");
    fs.writeFileSync("docs/config.js", nuevo);
  });' || fallar "No pude escribir docs/config.js."
echo "docs/config.js listo."

# ------------------------------------------------------------------ 6. Subir todo
paso "Instalando el árbitro"
(cd functions && npm install --no-audit --no-fund >/dev/null) || fallar "Falló npm install."

$FB hosting:sites:create "$PROYECTO" --project "$PROYECTO" >/dev/null 2>&1 || true

paso "Subiendo el árbitro, las reglas y la página (la primera vez tarda unos 5 minutos)"
$FB deploy --only functions,database,hosting --project "$PROYECTO" --force \
  || fallar "Falló la subida. Volvé a correr: bash instalar.sh (muchas veces la primera vez falla porque Google todavía está activando cosas)."

# ------------------------------------------------------------------ Listo
echo -e "\n${VERDE}══════════════════════════════════════════════════════${NADA}"
echo -e "${VERDE}  ¡BALLOTAGE está online!${NADA}"
echo -e "${VERDE}  Link para jugar:  https://$PROYECTO.web.app${NADA}"
echo -e "${VERDE}══════════════════════════════════════════════════════${NADA}"
echo
echo "Opcional: para que también funcione 'Entrar con Google', activalo acá (2 clics):"
echo "  https://console.firebase.google.com/project/$PROYECTO/authentication/providers"
echo
echo "Último paso: copiá TODO este bloque y pegáselo a Claude, así queda guardado en GitHub:"
echo "------------------------------------------------------------"
sed -n '/export const firebaseConfig/,/^};/p' docs/config.js
echo "------------------------------------------------------------"
