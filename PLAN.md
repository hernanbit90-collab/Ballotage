# Plan de armado de BALLOTAGE

Este es el plan corto, en criollo, de cómo se arma el juego.

## 1. Las tres piezas

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **La página** (lo que ves en el celu) | Pantallas, botones, tablero y animaciones. | GitHub Pages (gratis), carpeta `docs/`. |
| **El árbitro** (el "servidor") | Un programita que reparte roles, mezcla el mazo, cuenta votos y aplica las reglas. Es el único que sabe todo. | Firebase Cloud Functions, carpeta `functions/`. |
| **La libreta compartida** | La base de datos en tiempo real donde el árbitro anota lo que cada uno puede ver. | Firebase Realtime Database. |

## 2. Cómo se protegen los secretos

- Cada celular entra con un usuario anónimo de Firebase (no pide mail ni contraseña).
- La base de datos tiene tres "cajones" por sala:
  - **público**: tablero, votos ya abiertos, historial. Lo ven todos los de la sala.
  - **privado de cada jugador**: tu rol, tus compañeros, las cartas que tenés en la mano y los resultados de tus poderes. **Solo lo puede leer tu celular.**
  - **secreto**: el mazo, la trituradora, los roles de todos y los votos que todavía no se abrieron. **No lo puede leer nadie**, solo el árbitro.
- Ningún celular puede escribir en la base: todo pedido ("voto Sí", "descarto esta carta") va al árbitro, que verifica que sea tu turno y que la jugada sea legal.
- Así, aunque alguien "inspeccione la página", no hay nada secreto para ver.

> Ojo con un detalle: el plan 100 % gratuito de Firebase (Spark) **no permite** poner el árbitro en el servidor. Sin árbitro en el servidor es imposible que los secretos estén protegidos de verdad. Por eso usamos el plan **Blaze**, que tiene una cuota gratis enorme (2 millones de pedidos por mes). Para partidas entre amigos el costo es **$0**, pero Google pide cargar una tarjeta. Te explico cómo poner una alerta de presupuesto para dormir tranquilo.

## 3. Etapas

1. **Etapa 1 – Versión jugable básica**: todas las reglas, salas con código, roles secretos, votación, cartas, poderes, veto, historial, reconexión y pantalla final. Diseño simple pero prolijo.
2. **Etapa 2 – Mejoras visuales**: afiche de campaña con volantes, tapa de diario de escándalos, gráfico de crisis con "¡Cacerolazo!", urna animada, Mesa de Entradas y La Trituradora, caricaturas de roles, credenciales y micrófono, todo dibujado a mano en SVG (100 % original).
3. **Etapa 3 – Publicación**: guía paso a paso (`COMO_PUBLICAR.md`) para crear Firebase, subir el árbitro y prender GitHub Pages.

## 4. Pruebas

- Pruebas automáticas del reglamento (cientos de partidas simuladas al azar).
- Prueba completa en un Firebase "de mentira" (emuladores) con 5 celulares virtuales.
