// Música y efectos de BALLOTAGE, generados con código (Web Audio): no hay
// archivos de audio, todo es original y pesa casi nada.
//
// La música suena solo en el inicio, la sala de espera y el final; durante
// la partida hay efectos cortos, que bajan solos si alguien está al aire.

const PREFS = 'ballotage.sonido';
const prefs = Object.assign({ musica: true, efectos: true, volumen: 0.7 }, leer());

function leer() {
  try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; }
}
function guardar() {
  try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* sin almacenamiento */ }
}

let ctx = null;
let maestro = null; // volumen general
let busMusica = null;
let busEfectos = null;
let ruidoBuffer = null;
let atenuado = false;

function contexto() {
  if (ctx) return ctx;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  ctx = new C();
  maestro = ctx.createGain();
  maestro.gain.value = prefs.volumen;
  maestro.connect(ctx.destination);
  busMusica = ctx.createGain();
  busMusica.gain.value = prefs.musica ? 0.32 : 0;
  busMusica.connect(maestro);
  busEfectos = ctx.createGain();
  busEfectos.gain.value = prefs.efectos ? 0.9 : 0;
  busEfectos.connect(maestro);
  // Un segundo de ruido blanco para platillos, aplausos y papeles.
  ruidoBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = ruidoBuffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// Los navegadores solo dejan sonar audio después de un toque.
let pendiente = null;
document.addEventListener('pointerdown', () => {
  const c = contexto();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  if (pendiente) { const t = pendiente; pendiente = null; musica(t); }
}, true);

const listo = () => ctx && ctx.state === 'running';

export const preferencias = () => Object.assign({}, prefs);

export function configurar(cambios) {
  Object.assign(prefs, cambios);
  guardar();
  if (!ctx) return;
  maestro.gain.setTargetAtTime(prefs.volumen, ctx.currentTime, 0.05);
  busMusica.gain.setTargetAtTime(prefs.musica ? (atenuado ? 0 : 0.32) : 0, ctx.currentTime, 0.1);
  busEfectos.gain.setTargetAtTime(prefs.efectos ? (atenuado ? 0.3 : 0.9) : 0, ctx.currentTime, 0.1);
  if (cambios.musica === true && temaPedido) { const t = temaPedido; temaActual = null; musica(t); }
}

// Mientras alguien habla por micrófono, la música se va y los efectos bajan.
export function atenuar(si) {
  if (atenuado === si) return;
  atenuado = si;
  configurar({});
}

// ------------------------------------------------------------------ Instrumentos

const nota = (n) => 440 * Math.pow(2, (n - 69) / 12); // número MIDI -> Hz

function tono(bus, { f, t = 0, dur = 0.2, tipo = 'triangle', vol = 0.3, ataque = 0.005, f2 = null, filtro = null, vibrato = 0 }) {
  if (!ctx) return;
  const ahora = ctx.currentTime + t;
  const o = ctx.createOscillator();
  o.type = tipo;
  o.frequency.setValueAtTime(f, ahora);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, ahora + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ahora);
  g.gain.exponentialRampToValueAtTime(vol, ahora + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, ahora + dur);
  let salida = o;
  if (filtro) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = filtro;
    o.connect(fl);
    salida = fl;
  }
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(ahora);
    lfo.stop(ahora + dur + 0.05);
  }
  salida.connect(g).connect(bus);
  o.start(ahora);
  o.stop(ahora + dur + 0.05);
}

function ruido(bus, { t = 0, dur = 0.1, vol = 0.3, tipo = 'highpass', f = 6000, q = 0.7 }) {
  if (!ctx) return;
  const ahora = ctx.currentTime + t;
  const s = ctx.createBufferSource();
  s.buffer = ruidoBuffer;
  const fl = ctx.createBiquadFilter();
  fl.type = tipo;
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, ahora);
  g.gain.exponentialRampToValueAtTime(0.0001, ahora + dur);
  s.connect(fl).connect(g).connect(bus);
  s.start(ahora, Math.random() * 0.5);
  s.stop(ahora + dur + 0.02);
}

const bombo = (bus, t, vol = 0.9) => tono(bus, { f: 130, f2: 42, t, dur: 0.28, tipo: 'sine', vol });
const platillo = (bus, t, vol = 0.12, dur = 0.08) => ruido(bus, { t, dur, vol, f: 7000 });
const redoblante = (bus, t, vol = 0.25) => { ruido(bus, { t, dur: 0.12, vol, tipo: 'bandpass', f: 1800, q: 0.8 }); tono(bus, { f: 190, t, dur: 0.06, tipo: 'triangle', vol: vol * 0.6 }); };

// ------------------------------------------------------------------ Música

// Tema de campaña original: bombo con ritmo de murga, platillo y una
// melodía de "bronces" alegre. 8 compases en loop.
const TEMPO = 112;
const MELODIA = [ // [nota MIDI, duración en corcheas] (0 = silencio)
  [67, 2], [72, 1], [72, 1], [74, 2], [76, 2], [74, 1], [72, 1], [69, 2], [67, 4],
  [65, 2], [69, 1], [69, 1], [72, 2], [74, 2], [72, 1], [69, 1], [67, 6],
  [67, 2], [72, 1], [72, 1], [74, 2], [76, 2], [79, 2], [77, 1], [76, 1], [74, 4],
  [72, 2], [74, 1], [76, 1], [74, 2], [71, 2], [72, 8],
];
const BAJOS = [48, 48, 53, 53, 48, 48, 43, 48]; // uno por compás

let temaActual = null;
let temaPedido = null;
let reloj = null;
let proxCorchea = 0;
let corchea = 0;

export function musica(tema) {
  temaPedido = tema;
  if (tema === temaActual) return;
  detenerMusica();
  if (!tema || !prefs.musica) return;
  const c = contexto();
  if (!c) return;
  if (!listo()) { pendiente = tema; return; }
  temaActual = tema;
  if (tema === 'inicio') arrancarLoop();
  else if (tema === 'final-campana') festejo();
  else if (tema === 'final-operadores') conspiracion();
}

function detenerMusica() {
  clearInterval(reloj);
  reloj = null;
  temaActual = null;
}

function arrancarLoop() {
  const seg = 60 / TEMPO / 2; // una corchea
  const total = MELODIA.reduce((a, [, d]) => a + d, 0);
  const tiempos = [];
  let acc = 0;
  for (const [n, d] of MELODIA) { tiempos.push([acc, n, d]); acc += d; }
  corchea = 0;
  proxCorchea = ctx.currentTime + 0.1;
  reloj = setInterval(() => {
    while (proxCorchea < ctx.currentTime + 0.25) {
      const t = proxCorchea - ctx.currentTime;
      const enCompas = corchea % 8;
      const compas = Math.floor(corchea / 8) % BAJOS.length;
      // Bombo "de murga": 1, el "y" del 2 y el 4.
      if (enCompas === 0 || enCompas === 3 || enCompas === 6) bombo(busMusica, t, enCompas === 0 ? 0.8 : 0.55);
      if (enCompas % 2 === 1) platillo(busMusica, t, 0.06);
      if (enCompas === 4) redoblante(busMusica, t, 0.12);
      if (enCompas === 0) tono(busMusica, { f: nota(BAJOS[compas] - 12), t, dur: seg * 3.5, tipo: 'triangle', vol: 0.22, filtro: 500 });
      if (enCompas === 4) tono(busMusica, { f: nota(BAJOS[compas] - 5), t, dur: seg * 3.5, tipo: 'triangle', vol: 0.18, filtro: 500 });
      const pos = corchea % total;
      for (const [ini, n, d] of tiempos) {
        if (ini === pos && n) {
          tono(busMusica, { f: nota(n), t, dur: seg * d * 0.95, tipo: 'sawtooth', vol: 0.09, filtro: 1800, ataque: 0.02, vibrato: d > 3 ? 4 : 0 });
          tono(busMusica, { f: nota(n - 12), t, dur: seg * d * 0.95, tipo: 'square', vol: 0.035, filtro: 1200, ataque: 0.02 });
        }
      }
      corchea += 1;
      proxCorchea += seg;
    }
  }, 40);
}

function festejo() {
  const b = busMusica;
  [60, 64, 67, 72].forEach((n, i) => tono(b, { f: nota(n), t: i * 0.14, dur: 0.3, tipo: 'sawtooth', vol: 0.12, filtro: 2200 }));
  [72, 76, 79, 84].forEach((n) => tono(b, { f: nota(n), t: 0.62, dur: 1.4, tipo: 'sawtooth', vol: 0.07, filtro: 2600, vibrato: 5 }));
  [0, 0.14, 0.28, 0.42, 0.62].forEach((t) => bombo(b, t, 0.8));
  ruido(b, { t: 0.62, dur: 1.4, vol: 0.18, f: 5000 });
  for (let i = 0; i < 10; i++) { bombo(b, 2.1 + i * 0.27, i % 2 ? 0.5 : 0.8); platillo(b, 2.1 + i * 0.27 + 0.13, 0.07); }
  setTimeout(() => { if (temaActual === 'final-campana') temaActual = 'final-hecho'; }, 5000);
}

function conspiracion() {
  const b = busMusica;
  tono(b, { f: nota(36), t: 0, dur: 4, tipo: 'sawtooth', vol: 0.12, filtro: 300 });
  [67, 63, 60, 59].forEach((n, i) => tono(b, { f: nota(n), t: 0.3 + i * 0.55, dur: 0.9, tipo: 'triangle', vol: 0.16, vibrato: 3 }));
  bombo(b, 0.3, 0.7);
  bombo(b, 2.5, 0.9);
  ruido(b, { t: 2.5, dur: 1.6, vol: 0.12, tipo: 'lowpass', f: 900 });
  setTimeout(() => { if (temaActual === 'final-operadores') temaActual = 'final-hecho'; }, 5000);
}

// ------------------------------------------------------------------ Efectos

const EFECTOS = {
  // Redoble de suspenso antes de mostrar la carta publicada (≈1,4 s).
  redoble(b) {
    for (let i = 0; i < 26; i++) {
      const t = i * 0.055;
      redoblante(b, t, 0.05 + (i / 26) * 0.25);
    }
  },
  propuesta(b) {
    [72, 76, 79, 84].forEach((n, i) => tono(b, { f: nota(n), t: i * 0.07, dur: 0.6, tipo: 'triangle', vol: 0.22 }));
    tono(b, { f: nota(84), t: 0.3, dur: 0.9, tipo: 'sine', vol: 0.12 });
    for (let i = 0; i < 28; i++) ruido(b, { t: 0.25 + Math.random() * 1.2, dur: 0.05, vol: 0.12, tipo: 'bandpass', f: 1500 + Math.random() * 2500, q: 1.5 });
    bombo(b, 0, 0.6);
  },
  escandalo(b) {
    ruido(b, { t: 0, dur: 0.25, vol: 0.35, f: 3000 }); // el flash del diario
    tono(b, { f: nota(43), t: 0.15, dur: 0.28, tipo: 'sawtooth', vol: 0.3, filtro: 700 });
    tono(b, { f: nota(43), t: 0.5, dur: 0.28, tipo: 'sawtooth', vol: 0.3, filtro: 700 });
    tono(b, { f: nota(39), t: 0.85, dur: 1.3, tipo: 'sawtooth', vol: 0.34, filtro: 600, vibrato: 3 });
    bombo(b, 0.85, 0.7);
  },
  urna(b) {
    for (let i = 0; i < 6; i++) ruido(b, { t: i * 0.12 + Math.random() * 0.05, dur: 0.07, vol: 0.2, tipo: 'bandpass', f: 2500, q: 2 });
    ruido(b, { t: 0.9, dur: 0.35, vol: 0.2, tipo: 'bandpass', f: 900, q: 0.6 }); // se abren las boletas
  },
  si(b) {
    tono(b, { f: nota(72), t: 0, dur: 0.25, tipo: 'triangle', vol: 0.25 });
    tono(b, { f: nota(79), t: 0.12, dur: 0.5, tipo: 'triangle', vol: 0.25 });
  },
  no(b) {
    tono(b, { f: 140, t: 0, dur: 0.35, tipo: 'square', vol: 0.12, filtro: 900 });
    tono(b, { f: 110, t: 0.18, dur: 0.4, tipo: 'square', vol: 0.12, filtro: 900 });
  },
  turno(b) {
    tono(b, { f: nota(81), t: 0, dur: 0.5, tipo: 'sine', vol: 0.3 });
    tono(b, { f: nota(88), t: 0.12, dur: 0.6, tipo: 'sine', vol: 0.22 });
  },
  orador(b) { tono(b, { f: nota(79), t: 0, dur: 0.35, tipo: 'sine', vol: 0.16 }); },
  tic(b) { tono(b, { f: 1500, t: 0, dur: 0.04, tipo: 'square', vol: 0.06, filtro: 4000 }); },
  sello(b) {
    tono(b, { f: 90, f2: 40, t: 0, dur: 0.25, tipo: 'sine', vol: 0.8 });
    ruido(b, { t: 0, dur: 0.12, vol: 0.4, tipo: 'lowpass', f: 1200 });
  },
  veto(b) { EFECTOS.sello(b); setTimeout(() => EFECTOS.sello(busEfectos), 260); },
  teclado(b) { for (let i = 0; i < 9; i++) ruido(b, { t: i * 0.075 + Math.random() * 0.03, dur: 0.025, vol: 0.25, tipo: 'bandpass', f: 3500, q: 3 }); },
  cacerolazo(b) {
    for (let i = 0; i < 12; i++) {
      const t = i * 0.16 + (i % 3 === 2 ? 0.05 : 0);
      [310, 452, 687, 913].forEach((f) => tono(b, { f: f * (0.95 + Math.random() * 0.1), t, dur: 0.25, tipo: 'triangle', vol: 0.05 }));
      ruido(b, { t, dur: 0.08, vol: 0.12, tipo: 'bandpass', f: 3000, q: 1 });
    }
  },
  sobre(b) { ruido(b, { t: 0, dur: 0.35, vol: 0.18, tipo: 'bandpass', f: 1200, q: 0.5 }); },
  misterio(b) {
    [57, 60, 64, 68].forEach((n) => tono(b, { f: nota(n), t: 0.1, dur: 1.6, tipo: 'sine', vol: 0.07, ataque: 0.3, vibrato: 4 }));
  },
  boton(b) { tono(b, { f: 900, t: 0, dur: 0.05, tipo: 'sine', vol: 0.05 }); },
};

export function efecto(nombre) {
  if (!prefs.efectos || !EFECTOS[nombre]) return;
  const c = contexto();
  if (!c) return;
  if (!listo()) { c.resume().catch(() => {}); return; }
  try { EFECTOS[nombre](busEfectos); } catch (e) { console.warn('Sonido:', e); }
}

// Para las pruebas automáticas: qué sonó último.
export const _depuracion = { get tema() { return temaActual; } };
