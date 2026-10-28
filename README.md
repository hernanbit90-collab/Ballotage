# Ballotage
Ballotage: el juego online donde la campaña se pudre desde adentro. Entre 5 y 10 jugadores, roles secretos, roscas de pasillo, encuestas truchas y carpetazos. Hay un Topo infiltrado y nadie sabe quién es. ¿Ganás en primera vuelta o terminás en la tapa de los diarios? Votá con cuidado.

## Para publicarlo
Seguí la guía paso a paso: **[COMO_PUBLICAR.md](COMO_PUBLICAR.md)**.

## Qué hay en cada carpeta
- `docs/`: la página que se abre en el celular (se publica con GitHub Pages).
  - `config.js`: **el único archivo que tenés que tocar** (tus datos de Firebase).
  - `textos.js`: reglas, frases de Propuestas y titulares de Escándalos. Podés cambiarlos a gusto.
  - `arte.js`: todos los dibujos (SVG hechos a mano).
- `functions/`: el árbitro que corre en el servidor (reparte roles, mezcla, cuenta votos).
  - `engine.js`: el reglamento completo.
  - `test/`: pruebas automáticas (cientos de partidas simuladas).
- `database.rules.json`: las reglas que impiden espiar secretos.
- `PLAN.md`: cómo está armado.

## Para quien programa
- Pruebas del reglamento: `cd functions && npm install && npm test`.
- Probar todo localmente con emuladores: `npx firebase-tools emulators:start --project demo-ballotage --only auth,database,functions`, servir `docs/` (por ejemplo `python3 -m http.server -d docs 8080`) y abrir `http://localhost:8080/?emu`. En el emulador, cargá las reglas en el namespace `demo-ballotage` (`PUT /.settings/rules.json?ns=demo-ballotage`).
