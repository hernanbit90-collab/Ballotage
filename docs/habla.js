// Voz de los bots: leen en voz alta lo que escriben en su turno del debate,
// con la voz del propio celular (speechSynthesis). Cada bot tiene su tono.

const PREF = 'ballotage.vozBots';
let prendida = true;
try { prendida = localStorage.getItem(PREF) !== 'no'; } catch { /* sin almacenamiento */ }

const sintesis = window.speechSynthesis;
let voz = null;

function elegirVoz() {
  if (!sintesis) return null;
  const voces = sintesis.getVoices().filter((v) => /^es/i.test(v.lang));
  const prefer = ['es-AR', 'es-419', 'es-US', 'es-MX', 'es-ES'];
  for (const l of prefer) {
    const v = voces.find((x) => x.lang.replace('_', '-').toLowerCase() === l.toLowerCase());
    if (v) return v;
  }
  return voces[0] || null;
}
if (sintesis) {
  voz = elegirVoz();
  sintesis.addEventListener && sintesis.addEventListener('voiceschanged', () => { voz = elegirVoz(); });
}

// En iPhone la voz solo arranca si la primera vez fue después de un toque.
let destrabada = false;
document.addEventListener('pointerdown', () => {
  if (destrabada || !sintesis) return;
  destrabada = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    sintesis.speak(u);
  } catch { /* nada */ }
}, true);

export const soportada = () => !!sintesis;
export const activa = () => prendida && !!sintesis;

export function activar(si) {
  prendida = si;
  try { localStorage.setItem(PREF, si ? 'si' : 'no'); } catch { /* sin almacenamiento */ }
  if (!si) callar();
}

function hash(s) {
  let h = 7;
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

export function decir(texto, quien) {
  if (!activa() || !texto) return;
  try {
    sintesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    if (voz) u.voice = voz;
    u.lang = (voz && voz.lang) || 'es-AR';
    const h = hash(quien || texto);
    u.pitch = 0.75 + (h % 60) / 100; // 0,75 a 1,35: cada bot con su tono
    u.rate = 1.02 + ((h >> 4) % 15) / 100;
    u.volume = 1;
    sintesis.speak(u);
  } catch { /* el navegador no quiso hablar */ }
}

export function callar() {
  try { if (sintesis) sintesis.cancel(); } catch { /* nada */ }
}
