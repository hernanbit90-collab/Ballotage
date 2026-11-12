# Cómo se hizo el video "Cómo se juega"

El video (`docs/como-jugar.mp4`) se generó con estos archivos:

- `guion.json`: el texto de cada escena (lo que dice la voz y lo que se ve).
- `tts.py`: voz sintética en español latino (modelo `es_MX-claude-high`, licencia Apache-2.0, con `sherpa-onnx`).
- `slides.js`: dibuja una imagen por escena con las pantallas del juego (Playwright).

Para rehacerlo: sacar capturas del juego, correr `slides.js`, `tts.py` y unir todo con `ffmpeg`.
Si cambian las reglas, hay que editar `guion.json` y volver a generarlo.
