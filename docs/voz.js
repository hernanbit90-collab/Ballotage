// Audio en vivo de BALLOTAGE (WebRTC, de celular a celular).
//
// Dos momentos:
//   - Debate por turnos: habla uno solo (el que tiene la palabra).
//   - Debate abierto (después de las declaraciones): hablan todos a la vez.
// En los dos casos cada "orador" publica su micrófono y cada oyente se
// conecta a cada orador. La base de datos solo sirve para presentarlos:
//
//   rtc/<turno>/<orador>/orador            -> sesión actual del orador
//   rtc/<turno>/<orador>/s/<sesión oyente> -> { offer, answer, para, iceL/*, iceS/* }
//
// Cada oyente abre una sesión nueva cada vez que se conecta (si recarga la
// página, si se cae la conexión o si el orador recarga).

import { ICE_EXTRA } from './config.js';

const SERVIDORES = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }].concat(ICE_EXTRA || []);
const ESPERA_CONEXION_MS = 12000;
const REINTENTOS = 3;

let fb = null;
let db = null;
let base = '';
let miPid = null;
let esAnfitrion = false;
let avisar = () => {};

let turno = null; // { clave, oradores: [pids], modo: 'debate' | 'charla' }
let micro = null; // mi micrófono, si soy orador
let estadoMicro = 'apagado'; // pidiendo-micro | sin-micro | al-aire
let escuchasMicro = [];
let conexionesMicro = [];
const oyendo = {}; // orador -> { audio, pcs, escuchas, relojes, estado }
let silenciado = false;
let callado = false;
let nivel = 0;
let medidor = null;

const id = () => Math.random().toString(36).slice(2, 10);

// ------------------------------------------------------------------ Sonido y pantalla

let ctx = null;
function contextoAudio() {
  const C = window.AudioContext || window.webkitAudioContext;
  if (!ctx && C) ctx = new C();
  return ctx;
}
// Los celulares (sobre todo iPhone) solo dejan sonar audio después de un toque.
document.addEventListener('pointerdown', () => {
  const c = contextoAudio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  for (const o of Object.values(oyendo)) {
    if (o.audio.srcObject && o.audio.paused) o.audio.play().then(() => { o.estado = 'escuchando'; avisar(); }).catch(() => {});
  }
}, true);

// La pantalla no se apaga sola mientras se juega (si el navegador lo permite).
let candado = null;
async function pantallaPrendida(si) {
  try {
    if (si && !candado && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      candado = await navigator.wakeLock.request('screen');
      candado.addEventListener('release', () => { candado = null; });
    } else if (!si && candado) {
      await candado.release();
      candado = null;
    }
  } catch { /* no soportado o sin permiso */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && base) pantallaPrendida(true);
});

// ------------------------------------------------------------------ API

export function iniciar(opciones) {
  fb = opciones.fb;
  db = opciones.db;
  avisar = opciones.onCambio || avisar;
}

export function sala(code, pid) {
  if (base !== (code ? 'rooms/' + code + '/' : '') || miPid !== pid) cortar();
  base = code ? 'rooms/' + code + '/' : '';
  miPid = pid;
  pantallaPrendida(!!code);
}

export const soportado = () => !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

// Resumen para la pantalla.
export function estadoActual() {
  const lista = Object.values(oyendo);
  const escuchando = lista.filter((o) => o.estado === 'escuchando').length;
  const fallan = lista.filter((o) => o.estado === 'sin-conexion').length;
  const bloqueado = lista.some((o) => o.estado === 'tocar-para-escuchar');
  let estado = 'apagado';
  if (turno) {
    if (turno.oradores.includes(miPid)) estado = estadoMicro;
    else if (lista.length) estado = bloqueado ? 'tocar-para-escuchar' : lista[0].estado;
  }
  return { estado, silenciado, callado, nivel, escuchando, fallan, oyentes: lista.length, bloqueado, modo: turno && turno.modo };
}

const ref = (ruta) => fb.ref(db, base + 'rtc/' + ruta);

// Se llama en cada redibujo con el estado del juego.
export function actualizar(g, ajustes, anfitrion, esBot) {
  if (!fb || !base) return;
  esAnfitrion = !!anfitrion;
  const prendido = ajustes && ajustes.voice !== false && g && soportado();
  let clave = null;
  let oradores = [];
  let modo = null;
  if (prendido && g.phase === 'debate' && g.debate) {
    const orden = Array.isArray(g.debate.order) ? g.debate.order : Object.values(g.debate.order || {});
    const habla = orden[g.debate.idx];
    // Los bots no tienen micrófono: "hablan" por escrito y con la voz del celular.
    if (habla && !(esBot && esBot(habla))) { clave = g.round + '-' + g.debate.idx; oradores = [habla]; modo = 'debate'; }
  } else if (prendido && g.phase === 'charla') {
    const orden = Array.isArray(g.order) ? g.order : Object.values(g.order || {});
    oradores = orden.filter((p) => g.alive[p] && !(esBot && esBot(p)));
    if (oradores.length) { clave = 'c' + g.round; modo = 'charla'; }
  }
  if (!turno && !clave) return; // nada que hacer (evita redibujos en cadena)
  const mismo = turno && clave === turno.clave && turno.oradores.join() === oradores.join();
  if (mismo) return;
  const anterior = turno;
  cortar();
  // Limpieza: el anfitrión borra lo del turno anterior.
  if (anterior && esAnfitrion && anterior.clave !== clave) fb.set(ref(anterior.clave), null).catch(() => {});
  if (!clave) return;
  turno = { clave, oradores, modo };
  if (oradores.includes(miPid)) hablar(clave);
  for (const o of oradores) if (o !== miPid) escuchar(clave, o, 0);
}

export function cortar() {
  const habiaAlgo = !!(turno || micro || Object.keys(oyendo).length);
  for (const o of Object.keys(oyendo)) cerrarOyente(o);
  escuchasMicro.forEach((f) => f());
  escuchasMicro = [];
  conexionesMicro.forEach((pc) => { try { pc.close(); } catch { /* ya cerrada */ } });
  conexionesMicro = [];
  if (micro) micro.getTracks().forEach((t) => t.stop());
  micro = null;
  estadoMicro = 'apagado';
  pararMedidor();
  turno = null;
  callado = false;
  if (habiaAlgo) avisar();
}

export function silenciarAudio(si) {
  silenciado = si;
  for (const o of Object.values(oyendo)) o.audio.muted = si;
  avisar();
}

export function callarme(si) {
  callado = si;
  if (micro) micro.getAudioTracks().forEach((t) => { t.enabled = !si; });
  avisar();
}

export function tocarParaEscuchar() {
  const c = contextoAudio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  for (const o of Object.values(oyendo)) {
    o.audio.play().then(() => { o.estado = 'escuchando'; avisar(); }).catch(() => {});
  }
}

export function reintentar() {
  if (!turno) return;
  const t = turno;
  cortar();
  turno = t;
  if (t.oradores.includes(miPid)) hablar(t.clave);
  for (const o of t.oradores) if (o !== miPid) escuchar(t.clave, o, 0);
}

// ------------------------------------------------------------------ Barrita de volumen (mi micrófono)

function medir(stream) {
  pararMedidor();
  const c = contextoAudio();
  if (!c || !stream) return;
  try {
    const fuente = c.createMediaStreamSource(stream);
    const an = c.createAnalyser();
    an.fftSize = 256;
    fuente.connect(an);
    const datos = new Uint8Array(an.fftSize);
    const loop = () => {
      an.getByteTimeDomainData(datos);
      let max = 0;
      for (const v of datos) max = Math.max(max, Math.abs(v - 128));
      nivel = Math.min(1, max / 64);
      document.querySelectorAll('[data-nivel]').forEach((el) => { el.style.setProperty('--nivel', nivel.toFixed(2)); });
      medidor.raf = requestAnimationFrame(loop);
    };
    medidor = { fuente, raf: requestAnimationFrame(loop) };
  } catch { /* algunos navegadores no dejan medir */ }
}

function pararMedidor() {
  if (medidor) {
    cancelAnimationFrame(medidor.raf);
    try { medidor.fuente.disconnect(); } catch { /* nada */ }
  }
  medidor = null;
  nivel = 0;
}

// Prueba del micrófono antes de jugar: mide unos segundos y lo apaga.
export async function probarMicrofono(alCambiar) {
  const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const c = contextoAudio();
  if (c && c.state === 'suspended') await c.resume().catch(() => {});
  let raf = null;
  let fuente = null;
  if (c) {
    fuente = c.createMediaStreamSource(s);
    const an = c.createAnalyser();
    an.fftSize = 256;
    fuente.connect(an);
    const datos = new Uint8Array(an.fftSize);
    const loop = () => {
      an.getByteTimeDomainData(datos);
      let max = 0;
      for (const v of datos) max = Math.max(max, Math.abs(v - 128));
      if (alCambiar) alCambiar(Math.min(1, max / 64));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  return () => {
    if (raf) cancelAnimationFrame(raf);
    try { if (fuente) fuente.disconnect(); } catch { /* nada */ }
    s.getTracks().forEach((t) => t.stop());
  };
}

function candidatos(pc) {
  const pendientes = [];
  return {
    agregar(c) {
      if (!c) return;
      if (pc.remoteDescription) pc.addIceCandidate(c).catch(() => {});
      else pendientes.push(c);
    },
    listo() {
      pendientes.splice(0).forEach((c) => pc.addIceCandidate(c).catch(() => {}));
    },
  };
}

// ------------------------------------------------------------------ Orador (yo hablo)

async function hablar(clave) {
  estadoMicro = 'pidiendo-micro';
  avisar();
  try {
    micro = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    estadoMicro = 'sin-micro';
    avisar();
    return;
  }
  if (!turno || turno.clave !== clave) { micro.getTracks().forEach((t) => t.stop()); micro = null; return; }
  callarme(false);
  medir(micro);
  const yo = id();
  const raiz = clave + '/' + miPid;
  await fb.set(ref(raiz + '/orador'), yo).catch(() => {});
  estadoMicro = 'al-aire';
  avisar();
  const atendidas = new Set();
  escuchasMicro.push(fb.onChildAdded(ref(raiz + '/s'), (snap) => {
    const sesion = snap.key;
    const camino = raiz + '/s/' + sesion;
    escuchasMicro.push(fb.onValue(ref(camino + '/offer'), async (o) => {
      const oferta = o.val();
      if (!oferta || atendidas.has(sesion) || !micro) return;
      if (oferta.para && oferta.para !== yo) return; // era para una sesión vieja mía
      atendidas.add(sesion);
      const pc = new RTCPeerConnection({ iceServers: SERVIDORES });
      conexionesMicro.push(pc);
      const cand = candidatos(pc);
      micro.getTracks().forEach((t) => pc.addTrack(t, micro));
      pc.onicecandidate = (e) => {
        if (e.candidate) fb.push(ref(camino + '/iceS'), e.candidate.toJSON()).catch(() => {});
      };
      escuchasMicro.push(fb.onChildAdded(ref(camino + '/iceL'), (c) => cand.agregar(c.val())));
      try {
        await pc.setRemoteDescription({ type: oferta.type, sdp: oferta.sdp });
        cand.listo();
        const respuesta = await pc.createAnswer();
        await pc.setLocalDescription(respuesta);
        await fb.set(ref(camino + '/answer'), { type: respuesta.type, sdp: respuesta.sdp, de: yo });
      } catch (e) {
        console.warn('Audio: no pude atender a un oyente', e);
      }
    }));
  }));
}

// ------------------------------------------------------------------ Oyente (escucho a un orador)

function cerrarOyente(orador) {
  const o = oyendo[orador];
  if (!o) return;
  o.escuchas.forEach((f) => f());
  o.relojes.forEach((r) => clearTimeout(r));
  o.pcs.forEach((pc) => { try { pc.close(); } catch { /* ya cerrada */ } });
  o.audio.srcObject = null;
  o.audio.remove();
  delete oyendo[orador];
}

function escuchar(clave, orador, intento) {
  cerrarOyente(orador);
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.setAttribute('playsinline', '');
  audio.muted = silenciado;
  audio.dataset.orador = orador;
  document.body.appendChild(audio);
  const o = { audio, pcs: [], escuchas: [], relojes: [], estado: intento ? 'reconectando' : 'conectando', intento };
  oyendo[orador] = o;
  avisar();
  // Espera a saber qué sesión del orador está al aire y se conecta a esa;
  // si el orador recarga la página, cambia la sesión y se reconecta solo.
  let sesionOrador = null;
  o.escuchas.push(fb.onValue(ref(clave + '/' + orador + '/orador'), (s) => {
    const nueva = s.val();
    if (!nueva || nueva === sesionOrador) return;
    sesionOrador = nueva;
    conectar(clave, orador, nueva, o);
  }));
}

async function conectar(clave, orador, sesionOrador, o) {
  o.pcs.forEach((pc) => { try { pc.close(); } catch { /* ya cerrada */ } });
  o.pcs = [];
  const sesion = miPid + '-' + id();
  const camino = clave + '/' + orador + '/s/' + sesion;
  const pc = new RTCPeerConnection({ iceServers: SERVIDORES });
  o.pcs.push(pc);
  const cand = candidatos(pc);
  let conectado = false;
  const cambiar = (e) => { o.estado = e; avisar(); };
  pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = (e) => {
    o.audio.srcObject = e.streams[0] || new MediaStream([e.track]);
    o.audio.muted = silenciado;
    o.audio.play().then(() => cambiar('escuchando')).catch(() => cambiar('tocar-para-escuchar'));
  };
  const fallo = () => {
    if (!turno || turno.clave !== clave || conectado || oyendo[orador] !== o) return;
    if (o.intento + 1 < REINTENTOS) escuchar(clave, orador, o.intento + 1);
    else cambiar('sin-conexion');
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') { conectado = true; if (o.estado !== 'tocar-para-escuchar') cambiar('escuchando'); }
    if (pc.connectionState === 'failed') { conectado = false; fallo(); }
  };
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed') { conectado = false; fallo(); }
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) fb.push(ref(camino + '/iceL'), e.candidate.toJSON()).catch(() => {});
  };
  o.escuchas.push(fb.onValue(ref(camino + '/answer'), async (s) => {
    const r = s.val();
    if (!r || pc.remoteDescription || pc.signalingState === 'closed') return;
    try {
      await pc.setRemoteDescription({ type: r.type, sdp: r.sdp });
      cand.listo();
    } catch (e) {
      console.warn('Audio: respuesta inválida', e);
    }
  }));
  o.escuchas.push(fb.onChildAdded(ref(camino + '/iceS'), (c) => cand.agregar(c.val())));
  o.relojes.push(setTimeout(() => { if (!conectado) fallo(); }, ESPERA_CONEXION_MS));
  try {
    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    await fb.set(ref(camino + '/offer'), { type: oferta.type, sdp: oferta.sdp, para: sesionOrador });
  } catch (e) {
    console.warn('Audio: no pude pedir el audio', e);
    fallo();
  }
}
