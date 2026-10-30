// Audio en vivo durante el debate: el que tiene la palabra habla y todos lo
// escuchan. El audio va directo de celular a celular (WebRTC); la base de
// datos solo sirve para que los celulares se "presenten" entre sí, en
// rooms/<CÓDIGO>/rtc/<turno>/...
//
//   rtc/<turno>/orador            -> sesión actual del que habla (cambia si recarga)
//   rtc/<turno>/s/<sesión oyente> -> { offer, answer, para, iceL/*, iceS/* }
//
// Cada oyente abre una "sesión" nueva cada vez que se conecta (si recarga la
// página, si se cae la conexión o si el orador recarga), así nunca queda
// enganchado a una conexión vieja.

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

let turno = null; // { clave, orador }
let micro = null; // MediaStream del micrófono (solo el orador)
let conexiones = [];
let escuchas = [];
let relojes = [];
let silenciado = false;
let callado = false;
let estado = 'apagado';
let nivel = 0; // 0..1, para la barrita de volumen
let medidor = null;

const id = () => Math.random().toString(36).slice(2, 10);

const audio = document.createElement('audio');
audio.autoplay = true;
audio.setAttribute('playsinline', '');
document.body.appendChild(audio);

// Los celulares (sobre todo iPhone) solo dejan sonar audio después de un toque:
// con el primer toque en cualquier parte se "destraba" el sonido.
let ctx = null;
function contextoAudio() {
  const C = window.AudioContext || window.webkitAudioContext;
  if (!ctx && C) ctx = new C();
  return ctx;
}
document.addEventListener('pointerdown', () => {
  const c = contextoAudio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  if (audio.srcObject && audio.paused) audio.play().then(() => cambiar('escuchando')).catch(() => {});
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

export const estadoActual = () => ({ estado, silenciado, callado, nivel });
export const soportado = () => !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

function cambiar(nuevo) {
  if (estado === nuevo) return;
  estado = nuevo;
  avisar();
}

const ref = (ruta) => fb.ref(db, base + 'rtc/' + ruta);

// Se llama en cada redibujo con el estado del juego.
export function actualizar(g, ajustes, anfitrion, esBot) {
  if (!fb || !base) return;
  esAnfitrion = !!anfitrion;
  let activo = ajustes && ajustes.voice !== false && g && g.phase === 'debate' && g.debate && soportado();
  const orden = activo ? (Array.isArray(g.debate.order) ? g.debate.order : Object.values(g.debate.order || {})) : [];
  // Los bots no tienen micrófono: "hablan" por escrito y con la voz del celular.
  if (activo && esBot && esBot(orden[g.debate.idx])) activo = false;
  const orador = activo ? orden[g.debate.idx] : null;
  const clave = activo ? g.round + '-' + g.debate.idx : null;
  if (turno && clave === turno.clave) return;
  const anterior = turno;
  cortar();
  // Limpieza: el que hablaba (o el anfitrión) borra lo del turno anterior.
  if (anterior && (anterior.orador === miPid || esAnfitrion)) fb.set(ref(anterior.clave), null).catch(() => {});
  if (!clave) return;
  turno = { clave, orador };
  if (orador === miPid) hablar(clave);
  else escuchar(clave, 0);
}

function limpiarConexiones() {
  escuchas.forEach((f) => f());
  escuchas = [];
  relojes.forEach((r) => clearTimeout(r));
  relojes = [];
  conexiones.forEach((pc) => { try { pc.close(); } catch { /* ya cerrada */ } });
  conexiones = [];
}

export function cortar() {
  limpiarConexiones();
  if (micro) micro.getTracks().forEach((t) => t.stop());
  micro = null;
  pararMedidor();
  audio.srcObject = null;
  turno = null;
  callado = false;
  cambiar('apagado');
}

export function silenciarAudio(si) {
  silenciado = si;
  audio.muted = si;
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
  audio.play().then(() => cambiar('escuchando')).catch(() => {});
}

export function reintentar() {
  if (!turno) return;
  const t = turno;
  limpiarConexiones();
  if (t.orador === miPid) {
    if (micro) micro.getTracks().forEach((x) => x.stop());
    micro = null;
    hablar(t.clave);
  } else {
    escuchar(t.clave, 0);
  }
}

// ------------------------------------------------------------------ Barrita de volumen

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

function nuevaConexion() {
  const pc = new RTCPeerConnection({ iceServers: SERVIDORES });
  conexiones.push(pc);
  return pc;
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

// ------------------------------------------------------------------ Orador

async function hablar(clave) {
  cambiar('pidiendo-micro');
  try {
    micro = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    cambiar('sin-micro');
    return;
  }
  if (!turno || turno.clave !== clave) { micro.getTracks().forEach((t) => t.stop()); micro = null; return; }
  callarme(false);
  medir(micro);
  const yo = id();
  await fb.set(ref(clave + '/orador'), yo).catch(() => {});
  cambiar('al-aire');
  const atendidas = new Set();
  escuchas.push(fb.onChildAdded(ref(clave + '/s'), (snap) => {
    const sesion = snap.key;
    const offOferta = fb.onValue(ref(clave + '/s/' + sesion + '/offer'), async (o) => {
      const oferta = o.val();
      if (!oferta || atendidas.has(sesion) || !micro) return;
      if (oferta.para && oferta.para !== yo) return; // era para una sesión vieja mía
      atendidas.add(sesion);
      const pc = nuevaConexion();
      const cand = candidatos(pc);
      micro.getTracks().forEach((t) => pc.addTrack(t, micro));
      pc.onicecandidate = (e) => {
        if (e.candidate) fb.push(ref(clave + '/s/' + sesion + '/iceS'), e.candidate.toJSON()).catch(() => {});
      };
      escuchas.push(fb.onChildAdded(ref(clave + '/s/' + sesion + '/iceL'), (c) => cand.agregar(c.val())));
      try {
        await pc.setRemoteDescription({ type: oferta.type, sdp: oferta.sdp });
        cand.listo();
        const respuesta = await pc.createAnswer();
        await pc.setLocalDescription(respuesta);
        await fb.set(ref(clave + '/s/' + sesion + '/answer'), { type: respuesta.type, sdp: respuesta.sdp, de: yo });
      } catch (e) {
        console.warn('Audio: no pude atender a un oyente', e);
      }
    });
    escuchas.push(offOferta);
  }));
}

// ------------------------------------------------------------------ Oyente

function escuchar(clave, intento) {
  cambiar(intento ? 'reconectando' : 'conectando');
  // Espera a saber qué sesión del orador está al aire y se conecta a esa;
  // si el orador recarga la página, cambia la sesión y se reconecta solo.
  let sesionOrador = null;
  escuchas.push(fb.onValue(ref(clave + '/orador'), (s) => {
    const nueva = s.val();
    if (!nueva || nueva === sesionOrador) return;
    sesionOrador = nueva;
    conectar(clave, nueva, intento);
  }));
}

async function conectar(clave, sesionOrador, intento) {
  // Corta una conexión anterior (si el orador cambió de sesión).
  conexiones.forEach((pc) => { try { pc.close(); } catch { /* ya cerrada */ } });
  conexiones = [];
  const sesion = miPid + '-' + id();
  const camino = clave + '/s/' + sesion;
  const pc = nuevaConexion();
  const cand = candidatos(pc);
  let conectado = false;
  pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = (e) => {
    const stream = e.streams[0] || new MediaStream([e.track]);
    audio.srcObject = stream;
    audio.muted = silenciado;
    medir(stream);
    audio.play().then(() => cambiar('escuchando')).catch(() => cambiar('tocar-para-escuchar'));
  };
  const fallo = () => {
    if (!turno || turno.clave !== clave || conectado) return;
    if (intento + 1 < REINTENTOS) {
      limpiarConexiones();
      escuchar(clave, intento + 1);
    } else {
      cambiar('sin-conexion');
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      conectado = true;
      if (estado !== 'tocar-para-escuchar') cambiar('escuchando');
    }
    if (pc.connectionState === 'failed') { conectado = false; fallo(); }
  };
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed') { conectado = false; fallo(); }
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) fb.push(ref(camino + '/iceL'), e.candidate.toJSON()).catch(() => {});
  };
  escuchas.push(fb.onValue(ref(camino + '/answer'), async (s) => {
    const r = s.val();
    if (!r || pc.remoteDescription || pc.signalingState === 'closed') return;
    try {
      await pc.setRemoteDescription({ type: r.type, sdp: r.sdp });
      cand.listo();
    } catch (e) {
      console.warn('Audio: respuesta inválida', e);
    }
  }));
  escuchas.push(fb.onChildAdded(ref(camino + '/iceS'), (c) => cand.agregar(c.val())));
  relojes.push(setTimeout(() => { if (!conectado) fallo(); }, ESPERA_CONEXION_MS));
  try {
    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    await fb.set(ref(camino + '/offer'), { type: oferta.type, sdp: oferta.sdp, para: sesionOrador });
  } catch (e) {
    console.warn('Audio: no pude pedir el audio', e);
    fallo();
  }
}
