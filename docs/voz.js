// Audio en vivo durante el debate: el que tiene la palabra habla y todos lo
// escuchan. El audio va directo de celular a celular (WebRTC); la base de
// datos solo sirve para que los celulares se "presenten" entre sí, en
// rooms/<CÓDIGO>/rtc/<turno>/<oyente>/...
//
// Cada oyente le manda una "oferta" al orador; el orador contesta con su
// micrófono. Cuando cambia el turno, se corta todo y arranca de nuevo.

import { ICE_EXTRA } from './config.js';

const SERVIDORES = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }].concat(ICE_EXTRA || []);

let fb = null;
let db = null;
let base = '';
let miPid = null;
let avisar = () => {};

let turno = null; // { clave, orador }
let micro = null; // MediaStream del micrófono (solo el orador)
let conexiones = []; // RTCPeerConnection abiertas
let escuchas = []; // funciones para dejar de escuchar la base
let silenciado = false; // el oyente apagó el audio
let callado = false; // el orador se silenció
let estado = 'apagado';

const audio = document.createElement('audio');
audio.autoplay = true;
audio.setAttribute('playsinline', '');
document.body.appendChild(audio);

// Los celulares (sobre todo iPhone) solo dejan sonar audio después de un toque.
let desbloqueado = false;
document.addEventListener('click', () => {
  if (desbloqueado) return;
  desbloqueado = true;
  audio.play().catch(() => { desbloqueado = false; });
}, true);

export function iniciar(opciones) {
  fb = opciones.fb;
  db = opciones.db;
  avisar = opciones.onCambio || avisar;
}

export function sala(code, pid) {
  if (base !== 'rooms/' + code + '/' || miPid !== pid) cortar();
  base = code ? 'rooms/' + code + '/' : '';
  miPid = pid;
}

export const estadoActual = () => ({ estado, silenciado, callado });

function cambiar(nuevo) {
  if (estado === nuevo) return;
  estado = nuevo;
  avisar();
}

const ref = (ruta) => fb.ref(db, base + 'rtc/' + ruta);

// Se llama en cada redibujo con el estado del juego.
export function actualizar(g, ajustes) {
  if (!fb || !base) return;
  const activo = ajustes && ajustes.voice !== false && g && g.phase === 'debate' && g.debate;
  const orador = activo ? g.debate.order[g.debate.idx] || (Object.values(g.debate.order || {})[g.debate.idx]) : null;
  const clave = activo ? g.round + '-' + g.debate.idx : null;
  if (turno && clave === turno.clave) return;
  const anterior = turno;
  cortar();
  if (anterior && anterior.orador === miPid) fb.set(ref(anterior.clave), null).catch(() => {});
  if (!clave) return;
  turno = { clave, orador };
  if (orador === miPid) hablar(clave);
  else escuchar(clave);
}

export function cortar() {
  escuchas.forEach((f) => f());
  escuchas = [];
  conexiones.forEach((pc) => { try { pc.close(); } catch { /* ya cerrada */ } });
  conexiones = [];
  if (micro) micro.getTracks().forEach((t) => t.stop());
  micro = null;
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

// Pide permiso de micrófono antes de jugar, así no se pierde tiempo en el turno.
export async function probarMicrofono() {
  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
  s.getTracks().forEach((t) => t.stop());
}

function nuevaConexion() {
  const pc = new RTCPeerConnection({ iceServers: SERVIDORES });
  conexiones.push(pc);
  return pc;
}

// Los candidatos que llegan antes de tiempo se guardan hasta que se puede.
function candidatos(pc) {
  const pendientes = [];
  return {
    agregar(c) {
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
  if (!turno || turno.clave !== clave) { micro.getTracks().forEach((t) => t.stop()); return; }
  callarme(false);
  cambiar('al-aire');
  const atendidos = new Set();
  const off = fb.onChildAdded(ref(clave), (snap) => {
    const oyente = snap.key;
    const offOferta = fb.onValue(ref(clave + '/' + oyente + '/offer'), async (o) => {
      const oferta = o.val();
      if (!oferta || atendidos.has(oyente) || !micro) return;
      atendidos.add(oyente);
      const pc = nuevaConexion();
      const cand = candidatos(pc);
      micro.getTracks().forEach((t) => pc.addTrack(t, micro));
      pc.onicecandidate = (e) => {
        if (e.candidate) fb.push(ref(clave + '/' + oyente + '/iceS'), e.candidate.toJSON()).catch(() => {});
      };
      escuchas.push(fb.onChildAdded(ref(clave + '/' + oyente + '/iceL'), (c) => cand.agregar(c.val())));
      try {
        await pc.setRemoteDescription(oferta);
        cand.listo();
        const respuesta = await pc.createAnswer();
        await pc.setLocalDescription(respuesta);
        await fb.set(ref(clave + '/' + oyente + '/answer'), { type: respuesta.type, sdp: respuesta.sdp });
      } catch (e) {
        console.warn('Audio: no pude atender a', oyente, e);
      }
    });
    escuchas.push(offOferta);
  });
  escuchas.push(off);
}

// ------------------------------------------------------------------ Oyente

async function escuchar(clave) {
  cambiar('conectando');
  const yo = miPid;
  const pc = nuevaConexion();
  const cand = candidatos(pc);
  pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0] || new MediaStream([e.track]);
    audio.muted = silenciado;
    audio.play().then(() => cambiar('escuchando')).catch(() => cambiar('tocar-para-escuchar'));
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') cambiar('sin-conexion');
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) fb.push(ref(clave + '/' + yo + '/iceL'), e.candidate.toJSON()).catch(() => {});
  };
  escuchas.push(fb.onValue(ref(clave + '/' + yo + '/answer'), async (s) => {
    const r = s.val();
    if (!r || pc.remoteDescription) return;
    try {
      await pc.setRemoteDescription(r);
      cand.listo();
    } catch (e) {
      console.warn('Audio: respuesta inválida', e);
    }
  }));
  escuchas.push(fb.onChildAdded(ref(clave + '/' + yo + '/iceS'), (c) => cand.agregar(c.val())));
  try {
    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    await fb.set(ref(clave + '/' + yo + '/offer'), { type: oferta.type, sdp: oferta.sdp });
  } catch (e) {
    console.warn('Audio: no pude pedir el audio', e);
    cambiar('sin-conexion');
  }
}

// Reintenta cuando el sonido quedó bloqueado por el navegador.
export function tocarParaEscuchar() {
  audio.play().then(() => cambiar('escuchando')).catch(() => {});
}
