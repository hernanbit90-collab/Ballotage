// BALLOTAGE — lo que corre en cada celular.
// Solo muestra lo que el árbitro le deja ver y le manda pedidos.

import * as CFG from './config.js';
import * as T from './textos.js';
import * as A from './arte.js';
import * as Practica from './practica.js';
import * as Anfitrion from './anfitrion.js';
import * as Voz from './voz.js';
import * as Son from './sonido.js';
import * as Habla from './habla.js';

const { firebaseConfig, REGION } = CFG;

// ------------------------------------------------------------------ Firebase

const FB = 'https://www.gstatic.com/firebasejs/11.0.2/';
const params = new URLSearchParams(location.search);
const EMU = params.has('emu');
const cfg = EMU
  ? { apiKey: 'demo', projectId: 'demo-ballotage', databaseURL: 'http://127.0.0.1:9000/?ns=demo-ballotage' }
  : firebaseConfig;
const configurado = EMU || !String(cfg.apiKey).includes('PEGAR_ACA');
// Modo práctica: vos contra bots, todo en el navegador. Es el modo que se
// usa mientras Firebase no esté configurado, o con ?practica en el link.
const PRACTICA = params.has('practica') || !configurado;
// Modo gratis: el árbitro corre en el celular del anfitrión (plan gratuito
// de Firebase, sin tarjeta). Modo servidor: el árbitro corre en Cloud Functions.
const GRATIS = EMU ? params.has('gratis') : (CFG.MODO || 'gratis') !== 'servidor';

let auth, db, llamar;
const fb = {};
if (!PRACTICA) {
  const archivos = ['firebase-app.js', 'firebase-auth.js', 'firebase-database.js'].concat(GRATIS ? [] : ['firebase-functions.js']);
  const [app, au, da, fu] = await Promise.all(archivos.map((f) => import(FB + f)));
  Object.assign(fb, au, da, { authMod: au });
  const fapp = app.initializeApp(cfg);
  auth = au.getAuth(fapp);
  db = da.getDatabase(fapp);
  if (EMU) {
    au.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    da.connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }
  Voz.iniciar({ fb: da, db, onCambio: () => dibujar() });
  if (GRATIS) {
    Anfitrion.iniciar({ fb: da, db, ahora: () => Date.now() + st.desfase });
  } else {
    const fns = fu.getFunctions(fapp, REGION);
    if (EMU) fu.connectFunctionsEmulator(fns, '127.0.0.1', 5001);
    llamar = fu.httpsCallable(fns, 'ballotage');
  }
}

// ------------------------------------------------------------------ Estado local

const guardado = {
  get(k) { try { return localStorage.getItem('ballotage.' + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('ballotage.' + k) : localStorage.setItem('ballotage.' + k, v); } catch { /* sin almacenamiento */ } },
};

const st = {
  uid: null,
  code: null,
  pid: null,
  pub: null,
  priv: null,
  presence: {},
  ocupado: false,
  modal: null, // 'reglas' | 'historial' | 'rol' | 'menu'
  rolVisto: false,
  verRol: false,
  cancelar: [],
  ultimoVoto: null,
  ultimaCuenta: null,
  ultimaEncuesta: null,
  desfase: 0, // ms entre este celular y el servidor
  pasado: null, // último turno de debate que este celular pidió pasar
  ultimoEvento: null,
};

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lista = (x) => (Array.isArray(x) ? x : x ? Object.values(x) : []);

function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('fuera'), 3200);
  setTimeout(() => t.remove(), 3800);
}

async function pedir(datos, silencioso) {
  if (st.ocupado) return null;
  st.ocupado = true;
  document.body.classList.add('ocupado');
  try {
    const r = PRACTICA ? await Practica.pedir(datos)
      : GRATIS ? await Anfitrion.pedir(datos, auth.currentUser && auth.currentUser.email)
        : await llamar(datos);
    return r.data;
  } catch (e) {
    if (!silencioso) toast(e.message || 'Algo falló. Probá de nuevo.', 'error');
    return null;
  } finally {
    st.ocupado = false;
    document.body.classList.remove('ocupado');
  }
}

const jugar = (action, silencioso) => pedir({ op: 'act', code: st.code, action }, silencioso);
const ahoraServidor = () => Date.now() + st.desfase;

// ------------------------------------------------------------------ Conexión a una sala

function salirDeSala(msg) {
  if (PRACTICA) Practica.detener();
  if (GRATIS && !PRACTICA) Anfitrion.detener();
  if (!PRACTICA) { Voz.cortar(); Voz.sala(null, null); }
  st.cancelar.forEach((f) => f());
  st.cancelar = [];
  Object.assign(st, { code: null, pid: null, pub: null, priv: null, presence: {}, modal: null, rolVisto: false, verRol: false,
    ultimoVoto: null, ultimaCuenta: null, ultimaEncuesta: null, ultimoEvento: null });
  guardado.set('code', null);
  try { history.replaceState(null, '', location.pathname + (EMU ? '?emu' : params.has('practica') ? '?practica' : '')); } catch { /* sin historial */ }
  pantallaInicio();
  if (msg) toast(msg);
}

function entrarASala(code) {
  st.cancelar.forEach((f) => f());
  st.cancelar = [];
  st.code = code;
  guardado.set('code', code);
  const base = 'rooms/' + code + '/';
  const off1 = fb.onValue(fb.ref(db, base + 'auth/' + st.uid), (s) => {
    const pid = s.val();
    if (!pid) {
      if (st.pid) salirDeSala('Ya no estás en la sala ' + code + '.');
      else salirDeSala();
      return;
    }
    if (pid === st.pid) return;
    st.pid = pid;
    escucharSala(base, pid);
  });
  st.cancelar.push(off1);
}

function escucharSala(base, pid) {
  Voz.sala(st.code, pid);
  // Las escuchas viejas (si cambió el pid) se reemplazan.
  st.cancelar.splice(1).forEach((f) => f());
  // En modo gratis, si este celular creó la sala, retoma el papel de árbitro.
  if (GRATIS) Anfitrion.asegurarArbitro(st.code).catch((e) => console.error(e));
  const presRef = fb.ref(db, base + 'presence/' + pid);
  const offCon = fb.onValue(fb.ref(db, '.info/connected'), (s) => {
    if (s.val() === true) {
      fb.onDisconnect(presRef).set(false);
      fb.set(presRef, true).catch(() => {});
    }
  });
  const offPub = fb.onValue(fb.ref(db, base + 'pub'), (s) => { st.pub = s.val(); dibujar(); }, () => {});
  const offPriv = fb.onValue(fb.ref(db, base + 'priv/' + pid), (s) => { st.priv = s.val() || {}; dibujar(); }, () => {});
  const offPres = fb.onValue(fb.ref(db, base + 'presence'), (s) => { st.presence = s.val() || {}; dibujar(); }, () => {});
  const offDes = fb.onValue(fb.ref(db, '.info/serverTimeOffset'), (s) => { st.desfase = s.val() || 0; });
  st.cancelar.push(offCon, offPub, offPriv, offPres, offDes, () => fb.set(presRef, false).catch(() => {}));
}

// ------------------------------------------------------------------ Pantalla de inicio

function pantallaPractica() {
  Son.musica('inicio');
  setTimeout(botonSonido, 0);
  $app.className = 'inicio';
  $app.innerHTML = `
    <div class="portada">
      ${A.logo()}
      <p class="bajada">El juego donde la campaña se pudre desde adentro.</p>
    </div>
    <div class="aviso practica">🤖 <b>Modo práctica</b>: jugás vos contra bots, en este celular. ${configurado ? '' : 'Para jugar online con amigos hay que configurar Firebase (ver COMO_PUBLICAR.md).'}</div>
    <label class="campo">Tu apodo
      <input id="apodo" maxlength="16" autocomplete="nickname" placeholder="Ej: La Tana" value="${esc(guardado.get('name') || '')}">
    </label>
    <div class="tarjeta">
      <h3>¿Cuántos en la mesa?</h3>
      <div class="cantidades">${[5, 6, 7, 8, 9, 10].map((n) => `<button class="btn cant ${n === 7 ? 'elegida' : ''}" data-act="cantidad" data-n="${n}">${n}</button>`).join('')}</div>
      <p class="nota">Vos + bots que votan, mienten y se hacen los distraídos.</p>
      <h3>🎙️ Debate por persona (segundos)</h3>
      <div class="cantidades">${[0, 15, 30, 45, 60, 90].map((t) => `<button class="btn cant deb ${t === 30 ? 'elegida' : ''}" data-act="cantidadDeb" data-t="${t}">${t || 'Sin'}</button>`).join('')}</div>
      <h3>⏱️ Segundos para votar</h3>
      <div class="cantidades">${[0, 20, 30, 45, 60, 90].map((t) => `<button class="btn cant vot ${t === 30 ? 'elegida' : ''}" data-act="cantidadVot" data-t="${t}">${t || 'Sin'}</button>`).join('')}</div>
      <p class="nota">Si no votás a tiempo, tu boleta cuenta como ¡Sí!</p>
    </div>
    <button class="btn grande primario" data-act="practicar">¡Largar la campaña!</button>
    <div class="fila-btns">
      <button class="btn fantasma" data-act="editarPersonaje">🎨 Mi personaje</button>
      <button class="btn fantasma" data-act="probarMicro">🎙️ Probar micro</button>
    </div>
    <div class="links">
      <button class="btn link" data-act="reglas">📜 ¿Cómo se juega?</button>
      ${configurado ? `<a class="btn link" href="${location.pathname}">🌐 Jugar online con amigos</a>` : ''}
    </div>
  `;
}

// ------------------------------------------------------------------ Ingreso con mail

const ERRORES_AUTH = {
  'auth/invalid-email': 'Ese mail no parece válido.',
  'auth/missing-password': 'Poné una contraseña.',
  'auth/weak-password': 'La contraseña tiene que tener al menos 6 caracteres.',
  'auth/email-already-in-use': 'Ya hay una cuenta con ese mail. Tocá "Ya tengo cuenta" y entrá.',
  'auth/invalid-credential': 'Mail o contraseña incorrectos.',
  'auth/wrong-password': 'Mail o contraseña incorrectos.',
  'auth/user-not-found': 'No hay ninguna cuenta con ese mail. Creá una.',
  'auth/too-many-requests': 'Demasiados intentos. Esperá un ratito y probá de nuevo.',
  'auth/network-request-failed': 'No hay conexión. Revisá internet y probá de nuevo.',
  'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar.',
  'auth/unauthorized-domain': 'Este sitio no está autorizado en Firebase (ver COMO_PUBLICAR.md, paso 3).',
  'auth/operation-not-allowed': 'Este tipo de ingreso no está activado en Firebase (ver COMO_PUBLICAR.md, paso 3).',
};
const errorAuth = (e) => ERRORES_AUTH[e && e.code] || 'No se pudo entrar. Probá de nuevo.';

function pantallaLogin(modo = 'entrar') {
  Son.musica('inicio');
  setTimeout(botonSonido, 0);
  $app.className = 'inicio';
  const crear = modo === 'crear';
  const olvido = modo === 'olvido';
  $app.innerHTML = `
    <div class="portada">
      ${A.logo()}
      <p class="bajada">El juego donde la campaña se pudre desde adentro.</p>
    </div>
    <form class="tarjeta login" id="form-login" novalidate>
      <h3>${crear ? 'Crear tu cuenta' : olvido ? 'Recuperar la contraseña' : 'Entrá con tu mail'}</h3>
      ${crear ? `<label class="campo">Tu apodo en el juego
        <input id="nombre" maxlength="16" autocomplete="nickname" placeholder="Ej: La Tana" value="${esc(guardado.get('name') || '')}">
      </label>` : ''}
      <label class="campo">Mail
        <input id="email" type="email" autocomplete="email" inputmode="email" placeholder="vos@ejemplo.com" value="${esc(guardado.get('email') || '')}">
      </label>
      ${olvido ? '' : `<label class="campo">Contraseña
        <input id="clave" type="password" autocomplete="${crear ? 'new-password' : 'current-password'}" placeholder="${crear ? 'Mínimo 6 caracteres' : 'Tu contraseña'}">
      </label>`}
      <button class="btn grande primario" type="submit">${crear ? 'Crear cuenta y entrar' : olvido ? 'Mandarme el mail' : 'Entrar'}</button>
      ${olvido ? '' : '<button class="btn grande google" type="button" data-act="google"><span class="g">G</span> Entrar con Google</button>'}
      <div class="login-links">
        ${crear ? '<button class="btn link" type="button" data-act="login" data-m="entrar">Ya tengo cuenta</button>'
          : '<button class="btn link" type="button" data-act="login" data-m="crear">Soy nuevo: crear cuenta</button>'}
        ${modo === 'entrar' ? '<button class="btn link" type="button" data-act="login" data-m="olvido">Me olvidé la contraseña</button>' : ''}
        ${olvido ? '<button class="btn link" type="button" data-act="login" data-m="entrar">Volver</button>' : ''}
      </div>
    </form>
    <div class="links">
      <button class="btn link" data-act="reglas">📜 ¿Cómo se juega?</button>
      <a class="btn link" href="?practica">🤖 Practicar contra bots (sin cuenta)</a>
    </div>
  `;
  document.getElementById('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const au = fb.authMod;
    const email = document.getElementById('email').value.trim();
    const clave = (document.getElementById('clave') || {}).value || '';
    guardado.set('email', email);
    document.body.classList.add('ocupado');
    try {
      if (olvido) {
        await au.sendPasswordResetEmail(auth, email);
        toast('Listo: te mandamos un mail para elegir una contraseña nueva (mirá también en spam).');
        pantallaLogin('entrar');
      } else if (crear) {
        const nombre = document.getElementById('nombre').value.trim();
        if (!nombre) { toast('Poné tu apodo.', 'error'); return; }
        guardado.set('name', nombre);
        const cred = await au.createUserWithEmailAndPassword(auth, email, clave);
        await au.updateProfile(cred.user, { displayName: nombre });
      } else {
        await au.signInWithEmailAndPassword(auth, email, clave);
      }
    } catch (e) {
      toast(errorAuth(e), 'error');
    } finally {
      document.body.classList.remove('ocupado');
    }
  });
}

async function entrarConGoogle() {
  const au = fb.authMod;
  const prov = new au.GoogleAuthProvider();
  try {
    await au.signInWithPopup(auth, prov);
  } catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
      return au.signInWithRedirect(auth, prov);
    }
    toast(errorAuth(e), 'error');
  }
}

function pantallaInicio() {
  Son.musica('inicio');
  setTimeout(botonSonido, 0);
  if (PRACTICA) return pantallaPractica();
  const yo = auth.currentUser;
  const codigo = (params.get('sala') || '').toUpperCase();
  $app.className = 'inicio';
  $app.innerHTML = `
    <div class="portada">
      ${A.logo()}
      <p class="bajada">El juego donde la campaña se pudre desde adentro.</p>
    </div>
    <div class="sesion">👤 <span>${esc(yo && (yo.email || yo.displayName) || '')}</span> <button class="btn link" data-act="cerrarSesion">Cerrar sesión</button></div>
    <label class="campo">Tu apodo
      <input id="apodo" maxlength="16" autocomplete="nickname" placeholder="Ej: La Tana" value="${esc(guardado.get('name') || (yo && yo.displayName) || '')}">
    </label>
    <div class="tarjeta">
      <h3>Unirme a una sala</h3>
      <label class="campo">Código de sala
        <input id="codigo" maxlength="4" autocapitalize="characters" placeholder="ABCD" value="${esc(codigo)}">
      </label>
      <button class="btn grande primario" data-act="unirme">Entrar</button>
    </div>
    <div class="o">o</div>
    <button class="btn grande secundario" data-act="crear">Crear sala nueva</button>
    <div class="links">
      <button class="btn link" data-act="reglas">📜 ¿Cómo se juega?</button>
      <a class="btn link" href="?practica">🤖 Practicar contra bots</a>
    </div>
  `;
  const codigoInput = document.getElementById('codigo');
  codigoInput.addEventListener('input', () => {
    codigoInput.value = codigoInput.value.toUpperCase().replace(/[^A-Z]/g, '');
  });
}

function apodo() {
  const n = document.getElementById('apodo').value.trim();
  if (!n) {
    toast('Poné un apodo primero.', 'error');
    return null;
  }
  guardado.set('name', n);
  return n;
}

// Botoncito de sonido en las pantallas de afuera de la partida.
function botonSonido() {
  if (st.pub && st.pub.status !== 'lobby') return;
  if ($app.querySelector('.btn-sonido')) return;
  const b = document.createElement('button');
  b.className = 'btn link btn-sonido';
  b.dataset.act = 'modal';
  b.dataset.m = 'sonido';
  b.textContent = Son.preferencias().musica ? '🔊 Música y sonido' : '🔇 Música y sonido';
  $app.appendChild(b);
}

// ------------------------------------------------------------------ Dibujo general

function dibujar() {
  if (!st.pub || !st.pid) return;
  const p = st.pub;
  if (!p.players || !p.players[st.pid]) return;
  if (p.status === 'lobby') {
    Object.assign(st, { rolVisto: false, ultimoVoto: null, ultimaCuenta: null, ultimaEncuesta: null, ultimoEvento: null });
    return pantallaEspera();
  }
  pantallaJuego();
}

const esBotPid = (pid) => !!(st.pub && st.pub.players && st.pub.players[pid] && st.pub.players[pid].bot);
const lookDe = (pid) => (st.pub && st.pub.players[pid] && st.pub.players[pid].look) || null;

function miLookGuardado() {
  try { return JSON.parse(guardado.get('look') || 'null'); } catch { return null; }
}

function nombre(pid) {
  return (st.pub.players[pid] && st.pub.players[pid].name) || '¿?';
}

// ------------------------------------------------------------------ Sala de espera

function invitacion(link) {
  return '🗳️ ¡Sumate a mi campaña en BALLOTAGE! Hay un Topo infiltrado y nadie sabe quién es.\n\n' +
    'Entrá desde el celu: ' + link + '\nCódigo de sala: ' + st.code;
}

function pantallaEspera() {
  Son.musica('inicio');
  setTimeout(botonSonido, 0);
  const p = st.pub;
  const guardadoLook = miLookGuardado();
  if (guardadoLook && !p.players[st.pid].look && !st.lookEnviado) {
    st.lookEnviado = true;
    jugar({ type: 'look', look: guardadoLook }, true);
  }
  const pids = Object.keys(p.players).sort((a, b) => p.players[a].joinedAt - p.players[b].joinedAt);
  const soyHost = p.host === st.pid;
  const n = pids.length;
  const link = location.origin + location.pathname + '?sala=' + st.code + (EMU ? '&emu' : '');
  $app.className = 'espera';
  $app.innerHTML = `
    <header class="barra">${A.logoChico()}<button class="btn icono" data-act="reglas" aria-label="Reglas">📜</button></header>
    <div class="codigo-sala">
      <span>Código de sala</span>
      <strong>${st.code}</strong>
      ${PRACTICA ? '<small>Partida de práctica contra bots</small>' : `<div class="invitar">
        <a class="btn chico whatsapp" href="https://wa.me/?text=${encodeURIComponent(invitacion(link))}" target="_blank" rel="noopener">💬 Invitar por WhatsApp</a>
        <button class="btn chico" data-act="compartir" data-link="${esc(link)}">🔗 Copiar link</button>
      </div>
      <small>Los invitados abren el link, ponen su apodo y tocan <b>Entrar</b>. También pueden entrar escribiendo el código.</small>`}
    </div>
    ${avisoAnfitrion()}
    ${GRATIS && soyHost ? '<p class="nota">📱 Sos el anfitrión: <b>dejá el juego abierto en tu celular</b> mientras juegan (tu celular hace de árbitro).</p>' : ''}
    <div class="titulo-sala"><h2>Militantes en el búnker</h2><small>${n}/10</small></div>
    <ul class="lista-jugadores">
      ${pids.map((pid) => `
        <li>
          <span class="punto ${st.presence[pid] ? 'on' : ''}"></span>
          <span class="mini-cara">${A.avatar(p.players[pid].name, p.players[pid].look)}</span>
          <span class="nombre">${esc(p.players[pid].name)}${pid === st.pid ? ' <em>(vos)</em>' : ''}${p.players[pid].bot ? ' <span class="chapa bot">🤖 bot</span>' : ''}</span>
          ${pid === p.host ? '<span class="chapa">anfitrión</span>' : ''}
          ${soyHost && pid !== st.pid && !PRACTICA ? `<button class="btn chico peligro sacar" data-act="echar" data-pid="${pid}" aria-label="Sacar a ${esc(p.players[pid].name)}" title="Sacar">✕</button>` : ''}
        </li>`).join('')}
    </ul>
    ${soyHost && GRATIS && !PRACTICA && n < 10 ? `<button class="btn grande secundario" data-act="agregarBot">🤖 Agregar un bot${n < 5 ? ` <small>(faltan ${5 - n})</small>` : ''}</button>` : ''}
    <button class="btn fantasma grande" data-act="editarPersonaje">🎨 Armar mi personaje</button>
    ${panelAjustes(p, soyHost)}
    ${n < 5 ? `<p class="nota">Faltan ${5 - n} para arrancar (mínimo 5, máximo 10).</p>` : ''}
    ${soyHost
      ? `<button class="btn grande primario" data-act="empezar" ${n < 5 || n > 10 ? 'disabled' : ''}>¡Largar la campaña!</button>`
      : `<p class="nota">Esperando que ${esc(nombre(p.host))} largue la campaña…</p>`}
    <button class="btn link" data-act="salir">Salir de la sala</button>
  `;
}

function panelAjustes(p, soyHost) {
  const c = Object.assign({ debate: 30, declare: true, voteTime: 30 }, p.settings || {});
  const tiempos = [0, 15, 30, 45, 60, 90];
  const txt = (t) => (t ? t + ' s' : 'Sin');
  // Cada ajuste: título (y el valor, si no sos anfitrión), una línea de ayuda y el selector.
  const ajuste = (titulo, valor, ayuda, control, extra = '') => `<div class="ajuste">
      <div class="ajuste-cab"><h3>${titulo}</h3>${soyHost ? '' : `<span class="valor">${valor}</span>`}</div>
      <p class="nota izq">${ayuda}</p>
      ${soyHost ? control : ''}${extra}
    </div>`;
  return `<div class="tarjeta ajustes">
    ${ajuste('🎙️ Debate antes de votar', c.debate ? c.debate + ' s por persona' : 'Sin debate',
    'Cada uno en carrera habla por turno, con reloj. Primero la fórmula.',
    `<div class="cantidades">${tiempos.map((t) => `<button class="btn cant ${c.debate === t ? 'elegida' : ''}" data-act="ajuste" data-debate="${t}">${txt(t)}</button>`).join('')}</div>`)}
    ${ajuste('⏱️ Tiempo para votar', c.voteTime ? c.voteTime + ' segundos' : 'Sin límite',
    'Quien no vota a tiempo cuenta como <b>¡Sí!</b>.',
    `<div class="cantidades">${[0, 20, 30, 45, 60, 90].map((t) => `<button class="btn cant ${c.voteTime === t ? 'elegida' : ''}" data-act="ajuste" data-vote="${t}">${t ? t + ' s' : 'Sin'}</button>`).join('')}</div>`)}
    ${ajuste('🎧 Audio en el debate', c.voice !== false ? 'Sí' : 'No',
    'Cuando te toca, se prende tu micrófono y todos te escuchan. Si están juntos o en una llamada, apáguenlo.',
    `<div class="dos"><button class="btn cant ${c.voice !== false ? 'elegida' : ''}" data-act="ajuste" data-voice="1">Sí</button><button class="btn cant ${c.voice === false ? 'elegida' : ''}" data-act="ajuste" data-voice="0">No</button></div>`,
    c.voice !== false ? '<button class="btn chico" data-act="probarMicro">🎙️ Probar mi micrófono</button>' : '')}
    ${ajuste('🗣️ Declaraciones', c.declare ? 'Sí' : 'No',
    'Después de publicar, el Jefe y el Vocero cuentan qué cartas les llegaron. Pueden mentir.',
    `<div class="dos"><button class="btn cant ${c.declare ? 'elegida' : ''}" data-act="ajuste" data-declare="1">Sí</button><button class="btn cant ${!c.declare ? 'elegida' : ''}" data-act="ajuste" data-declare="0">No</button></div>`)}
    ${c.declare ? ajuste('📣 Debate abierto (¿Les creés?)', (c.charla ?? 30) ? (c.charla ?? 30) + ' segundos' : 'Sin debate abierto',
    'Después de las declaraciones se abren los micrófonos de todos a la vez para discutir.',
    `<div class="cantidades">${[0, 30, 45, 60].map((t) => `<button class="btn cant ${(c.charla ?? 30) === t ? 'elegida' : ''}" data-act="ajuste" data-charla="${t}">${t ? t + ' s' : 'Sin'}</button>`).join('')}</div>`) : ''}
  </div>`;
}

// ------------------------------------------------------------------ Juego

function pantallaJuego() {
  const g = st.pub.game;
  if (!g) return;
  detectarNovedades(g);
  if (!PRACTICA) Voz.actualizar(g, st.pub.settings, st.pub.host === st.pid, esBotPid);
  // Si habla un bot, se escucha lo que escribió (una sola vez por turno).
  if (g.phase === 'debate' && g.debate && g.debate.say && g.debate.say.idx === g.debate.idx) {
    const clave = g.round + '-' + g.debate.idx + '-' + g.debate.say.text.length;
    if (st.ultimoDicho !== clave) { st.ultimoDicho = clave; Habla.decir(g.debate.say.text, g.debate.say.pid); }
  } else if (g.phase === 'charla' && g.charla) {
    const dichos = lista(g.charla.dichos);
    const clave = 'c' + g.round;
    if (!st.charlaLeidos || st.charlaLeidos.clave !== clave) st.charlaLeidos = { clave, n: dichos.length };
    for (const x of dichos.slice(st.charlaLeidos.n)) if (esBotPid(x.pid)) Habla.decir(x.text, x.pid);
    st.charlaLeidos.n = dichos.length;
  } else if (st.ultimoDicho && g.phase !== 'debate') {
    st.ultimoDicho = null;
    Habla.callar();
  }
  const yo = st.pid;
  const vivo = g.alive[yo];
  // La pantalla final espera a que terminen las animaciones (no spoilear).
  const terminado = g.phase === 'ended' && !capaAbierta;
  const panel = terminado ? '' : g.phase === 'ended' ? esperando('Contando los votos del escrutinio…') : panelAccion(g);
  // Si el panel tiene algo para tocar (y no es solo esperar), se resalta: "te toca".
  const miTurno = panel && !panel.includes('espera-msg') && /data-act="(nominar|votar|descJefe|descVoc|veto|poder|pasarPalabra|declarar)"/.test(panel)
    && !(g.phase === 'vote' && g.voted && g.voted[yo]) && !(g.phase === 'debate' && lista(g.debate && g.debate.order)[g.debate && g.debate.idx] !== yo);
  // Sonido: sin música durante la partida; al final, el festejo o el cierre oscuro.
  if (terminado) {
    const clave = 'fin-' + (g.eventId || 0) + '-' + st.code;
    if (st.finalSonado !== clave) {
      st.finalSonado = clave;
      Son.musica(g.winner === 'campana' ? 'final-campana' : 'final-operadores');
    }
  } else {
    Son.musica(null);
  }
  if (!PRACTICA) Son.atenuar(['al-aire', 'escuchando'].includes(Voz.estadoActual().estado));
  if (miTurno && !st.miTurnoPrev) Son.efecto('turno');
  st.miTurnoPrev = !!miTurno;
  // El panel entra con una animación solo cuando cambia la etapa, no en cada redibujo.
  const etapa = g.round + '-' + g.phase + '-' + (miTurno ? 1 : 0);
  const entra = st.etapaVista !== etapa;
  st.etapaVista = etapa;
  $app.className = 'juego';
  $app.innerHTML = `
    <header class="barra">
      ${A.logoChico()}
      <span class="codigo-mini">Sala ${st.code}</span>
      <button class="btn icono" data-act="modal" data-m="sonido" aria-label="Sonido">${Son.preferencias().musica || Son.preferencias().efectos ? '🔊' : '🔇'}</button>
      <button class="btn icono" data-act="modal" data-m="rol" aria-label="Mi rol">🪪</button>
      <button class="btn icono" data-act="modal" data-m="historial" aria-label="Historial">🗂️</button>
      <button class="btn icono" data-act="modal" data-m="menu" aria-label="Menú">☰</button>
    </header>
    ${avisoAnfitrion()}
    ${!vivo && !terminado ? `<div class="aviso fantasma">👻 Te hicieron un Carpetazo. Ya no votás ni hablás: mirá en silencio.</div>` : ''}
    ${terminado ? pantallaFinal(g) : ''}
    <div class="cuerpo">
      <section class="accion${miTurno ? ' mi-turno' : ''}${entra ? ' entra' : ''}">${panel}</section>
      ${filaJugadores(g)}
      ${tablero(g)}
      <section class="cronica">
        <h3>📰 Último momento</h3>
        <ul>${lista(g.log).slice(-4).reverse().map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      </section>
    </div>
  `;
  dibujarModal();
  if (!st.rolVisto && st.priv && st.priv.role && g.phase !== 'ended') {
    st.rolVisto = true;
    st.modal = 'rol';
    dibujarModal();
  }
}

function avisoAnfitrion() {
  if (!GRATIS || PRACTICA || !st.pub || st.pub.host === st.pid || st.presence[st.pub.host]) return '';
  return `<div class="aviso pausa">⏸️ <b>${esc(nombre(st.pub.host))}</b> (anfitrión) cerró el juego. La partida sigue cuando lo vuelva a abrir.</div>`;
}

// La mesa redonda: todos sentados en el orden en que rota el cargo,
// y en el centro lo que está pasando ahora.
function filaJugadores(g) {
  const orden = lista(g.order);
  const n = orden.length;
  const habla = g.phase === 'debate' && g.debate ? lista(g.debate.order)[g.debate.idx] : null;
  const enEleccion = ['nominate', 'debate', 'vote'].includes(g.phase);
  const jefe = enEleccion ? g.candidate : g.chief;
  const vocero = enEleccion ? g.nominee : g.vocero;
  const proximo = proximoCandidato(g);
  // Arranca arriba y gira en el sentido de las agujas del reloj.
  const angulo = (i) => ((-90 + (360 * i) / n) * Math.PI) / 180;
  const lugar = (i, rx, ry) => [50 + rx * Math.cos(angulo(i)), 50 + ry * Math.sin(angulo(i))];
  const pos = orden.map((_, i) => lugar(i, 37, 39));

  const asientos = orden.map((pid, i) => {
    const [x, y] = pos[i];
    const esJefe = pid === jefe && jefe;
    const esVocero = pid === vocero && vocero;
    const cls = [
      'asiento',
      !g.alive[pid] ? 'muerto' : '',
      pid === st.pid ? 'yo' : '',
      st.presence[pid] ? '' : 'offline',
      pid === habla ? 'hablando' : '',
      esJefe ? 'es-jefe' : '',
      esVocero ? 'es-vocero' : '',
    ].join(' ');
    // Mientras se vota es candidato (cartel a rayas); con la mesa llena, en una sola línea.
    const hacerCartel = (tipo, texto) => {
      const previo = enEleccion && n < 8 ? '<small>candidato a</small>' : '';
      return `<span class="cartel ${tipo}${enEleccion ? ' cand' : ''}">${previo}${texto}</span>`;
    };
    let cartel = '';
    if (esJefe) cartel = hacerCartel('jefe', '🪪 JEFE');
    else if (esVocero) cartel = hacerCartel('vocero', '🎤 VOCERO');
    let estado = '';
    if (g.phase === 'vote' && g.alive[pid]) estado = g.voted && g.voted[pid] ? '<span class="voto-ok">✔ votó</span>' : '<span class="voto-esp">votando…</span>';
    else if (g.phase === 'nominate' && g.alive[pid] && pid !== g.candidate && !puedeSerVocero(g, pid)) estado = '<span class="limite">no elegible</span>';
    else if (pid === proximo && g.phase !== 'ended' && !esJefe) estado = '<span class="proximo">⏭ próximo Jefe</span>';
    const rev = g.reveal ? `<span class="rol-final ${g.reveal[pid]}">${esc(T.ROLES[g.reveal[pid]].titulo)}</span>` : '';
    return `<div class="${cls}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%">
      ${pid === st.pid ? '<span class="vos">VOS</span>' : ''}
      <div class="cara">${A.avatar(nombre(pid), lookDe(pid))}${pid === habla ? '<span class="marca habla" title="Está hablando">🎙️</span>' : ''}${!g.alive[pid] ? '<span class="sello-out">OUT</span>' : ''}</div>
      <div class="nom">${esbotMarca(pid)}${esc(nombre(pid))}</div>
      ${cartel}${estado}${rev}
    </div>`;
  }).join('');

  // Flechitas sobre el borde de la mesa: muestran hacia dónde pasa el cargo.
  const flechas = orden.map((_, i) => {
    const medio = i + 0.5;
    const ang = (-90 + (360 * medio) / n);
    const x = 50 + 30.5 * Math.cos((ang * Math.PI) / 180);
    const y = 50 + 28.5 * Math.sin((ang * Math.PI) / 180);
    return `<span class="giro" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;transform:translate(-50%,-50%) rotate(${(ang + 90).toFixed(0)}deg)">➤</span>`;
  }).join('');

  // La fórmula: una línea dorada une al Jefe con el Vocero.
  const ij = orden.indexOf(jefe);
  const iv = orden.indexOf(vocero);
  const formula = ij >= 0 && iv >= 0 && g.phase !== 'ended'
    ? `<line x1="${pos[ij][0].toFixed(1)}" y1="${pos[ij][1].toFixed(1)}" x2="${pos[iv][0].toFixed(1)}" y2="${pos[iv][1].toFixed(1)}" class="mesa-formula"/>`
    : '';

  return `<section class="mesa-zona" aria-label="Mesa de campaña">
    <div class="mesa n${n}">
      <svg class="mesa-arte" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <ellipse cx="50" cy="50" rx="32" ry="30" class="mesa-tabla"/>
        <ellipse cx="50" cy="50" rx="27" ry="25" class="mesa-pano"/>
        ${formula}
      </svg>
      ${flechas}
      <div class="mesa-centro">${centroMesa(g)}</div>
      ${asientos}
    </div>
    <p class="mesa-ayuda">➤ Las flechitas muestran hacia dónde rota el cargo de Jefe</p>
  </section>`;
}

const esbotMarca = (pid) => (esBotPid(pid) ? '<span class="es-bot" title="Bot">🤖</span>' : '');

function proximoCandidato(g) {
  if (g.special) return g.special;
  const orden = lista(g.order);
  for (let k = 1; k <= orden.length; k++) {
    const p = orden[((g.rotation || 0) + k) % orden.length];
    if (g.alive[p]) return p;
  }
  return null;
}

function centroMesa(g) {
  const n = (p) => `<b>${esc(nombre(p))}</b>`;
  const vivos = lista(g.order).filter((p) => g.alive[p]);
  const votaron = vivos.filter((p) => g.voted && g.voted[p]).length;
  const textos = {
    nominate: `<span class="c-ico">🪪</span>${n(g.candidate)}<small>elige Vocero</small>`,
    debate: g.debate ? `<span class="c-ico">🎙️</span>Habla ${n(lista(g.debate.order)[g.debate.idx])}<small><span data-fin="${g.debate.turnEnd}">${relojTexto(g.debate.turnEnd)}</span> s</small>` : '',
    vote: `<span class="c-ico">🗳️</span>Votación<small>${votaron} de ${vivos.length} boletas</small>`,
    chiefDiscard: `<span class="c-ico">📂</span>${n(g.chief)}<small>revisa 3 expedientes</small>`,
    voceroDiscard: `<span class="c-ico">🎤</span>${n(g.vocero)}<small>decide qué publicar</small>`,
    vetoReply: `<span class="c-ico">⛔</span>¡Pedido de veto!<small>decide ${esc(nombre(g.chief))}</small>`,
    declare: `<span class="c-ico">🗣️</span>Declaraciones<small>del Jefe y el Vocero</small>`,
    charla: g.charla ? `<span class="c-ico">📣</span>Debate abierto<small><span data-fin="${g.charla.fin}">${relojTexto(g.charla.fin)}</span> s · hablan todos</small>` : '',
    power: `<span class="c-ico">${A.iconoPoder(g.power)}</span>${(T.PODERES[g.power] || {}).nombre || 'Poder'}<small>lo usa ${esc(nombre(g.chief))}</small>`,
    ended: `<span class="c-ico">${g.winner === 'campana' ? '🎉' : '🕶️'}</span>${g.winner === 'campana' ? 'Ganó la Campaña' : 'Ganaron los Operadores'}`,
  };
  return `<div class="c-ronda">Ronda ${g.round}</div>${textos[g.phase] || ''}`;
}

const esperando = (texto) => `<div class="espera-msg"><div class="rosca"></div><p>${texto}</p><small>${T.ESPERAS[Math.floor(Date.now() / 8000) % T.ESPERAS.length]}</small></div>`;

function panelAccion(g) {
  const yo = st.pid;
  const vivo = g.alive[yo];
  const priv = st.priv || {};
  switch (g.phase) {
    case 'nominate': {
      if (g.candidate !== yo) return esperando(`<b>${esc(nombre(g.candidate))}</b> es Candidato a Jefe de Campaña y está eligiendo Vocero.`);
      const elegibles = lista(g.order).filter((p) => puedeSerVocero(g, p));
      return `<h2>Sos Candidato a Jefe de Campaña ${A.credencial(true)}</h2>
        <p>Elegí a quién proponés como <b>Vocero</b>. Después todos votan.</p>
        <div class="opciones">${elegibles.map((p) => `<button class="btn opcion" data-act="nominar" data-pid="${p}">${A.microfono(true)} ${esc(nombre(p))}</button>`).join('')}</div>`;
    }
    case 'debate':
      return panelDebate(g);
    case 'declare':
      return panelDeclarar(g);
    case 'charla':
      return panelCharla(g);
    case 'vote': {
      const titulo = `<h2>¿Votás esta fórmula?</h2>
        <div class="formula">
          <div>${A.credencial(true)}<b>${esc(nombre(g.candidate))}</b><small>Jefe de Campaña</small></div>
          <div class="y">+</div>
          <div>${A.microfono(true)}<b>${esc(nombre(g.nominee))}</b><small>Vocero</small></div>
        </div>
        ${g.scandals >= 3 ? '<p class="zona-roja-aviso">⚠️ Zona roja: si el Vocero es El Topo, ganan los Operadores.</p>' : ''}`;
      if (!vivo) return titulo + esperando('Los fantasmas no votan.');
      const ya = g.voted && g.voted[yo];
      const faltan = lista(g.order).filter((p) => g.alive[p] && !(g.voted && g.voted[p])).length;
      return titulo + `
        <div class="boletas">
          <button class="boleta si ${st.miVoto === true && ya ? 'elegida' : ''}" data-act="votar" data-v="1">${A.boleta(true)}</button>
          <button class="boleta no ${st.miVoto === false && ya ? 'elegida' : ''}" data-act="votar" data-v="0">${A.boleta(false)}</button>
        </div>
        ${g.voteEnd ? `<div class="reloj-voto ${ya ? '' : 'apurate'}">⏱️ <b data-fin="${g.voteEnd}">${relojTexto(g.voteEnd)}</b> s ${ya ? 'para que cierre la urna' : '· si no votás, tu boleta cuenta como <b>¡Sí!</b>'}</div>` : ''}
        <p class="nota">${ya ? `Tu boleta está en la urna (podés cambiarla). ` : ''}Faltan ${faltan} boleta${faltan === 1 ? '' : 's'}.</p>`;
    }
    case 'chiefDiscard': {
      if (g.chief !== yo) return esperando(`<b>${esc(nombre(g.chief))}</b> (Jefe de Campaña) está revisando 3 expedientes de la Mesa de Entradas.`);
      return `<h2>Sos Jefe de Campaña ${A.credencial()}</h2>
        <p>Tocá la carta que querés mandar a <b>La Trituradora</b>. Las otras dos van al Vocero.</p>
        <div class="mano">${lista(priv.hand).map((c, i) => `<button class="carta-btn" data-act="descJefe" data-i="${i}">${A.carta(c, i)}</button>`).join('')}</div>
        <p class="nota">Nadie va a ver lo que descartes. Podés mentir (o no).</p>`;
    }
    case 'voceroDiscard': {
      if (g.vocero !== yo) return esperando(`<b>${esc(nombre(g.vocero))}</b> (Vocero) está decidiendo qué publicar.`);
      const veto = g.scandals >= 5 && !g.vetoDenied;
      return `<h2>Sos Vocero ${A.microfono()}</h2>
        <p>Tocá la carta que querés <b>publicar</b>. La otra va a La Trituradora.</p>
        <div class="mano">${lista(priv.hand).map((c, i) => `<button class="carta-btn" data-act="descVoc" data-i="${i}">${A.carta(c, i + 3)}</button>`).join('')}</div>
        ${veto ? `<button class="btn grande veto" data-act="pedirVeto">${A.selloVetado()} Proponer VETO</button>` : ''}
        ${g.vetoDenied ? '<p class="nota">El Jefe rechazó el veto: tenés que publicar una.</p>' : ''}`;
    }
    case 'vetoReply': {
      if (g.chief !== yo) return esperando(g.vocero === yo
        ? `Pediste <b>VETO</b>. Ahora decide <b>${esc(nombre(g.chief))}</b>, el Jefe de Campaña.`
        : `<b>${esc(nombre(g.vocero))}</b> (Vocero) pidió <b>VETO</b>. Decide <b>${esc(nombre(g.chief))}</b>.`);
      return `<h2>¡El Vocero pide VETO! ${A.selloVetado()}</h2>
        <p>Si aceptás, las dos cartas van a La Trituradora y sube la Crisis.</p>
        <div class="dos">
          <button class="btn grande primario" data-act="veto" data-v="1">Acepto el veto</button>
          <button class="btn grande secundario" data-act="veto" data-v="0">No, que publique</button>
        </div>`;
    }
    case 'power':
      return panelPoder(g, priv);
    default:
      return '';
  }
}

function relojTexto(fin) {
  const r = Math.max(0, Math.ceil((fin - ahoraServidor()) / 1000));
  return r + '';
}

function panelDebate(g) {
  const d = g.debate;
  const orden = lista(d.order);
  const habla = orden[d.idx];
  const yo = st.pid;
  const soyHost = st.pub.host === yo;
  const dicho = d.say && d.say.idx === d.idx ? d.say.text : '';
  return `<h2>🎙️ Debate</h2>
    <div class="formula chica">
      <div>${A.credencial(true)}<b>${esc(nombre(g.candidate))}</b><small>Jefe</small></div>
      <div class="y">+</div>
      <div>${A.microfono(true)}<b>${esc(nombre(g.nominee))}</b><small>Vocero</small></div>
    </div>
    <div class="orador ${habla === yo ? 'soy-yo' : ''}">
      <div class="reloj" style="--total:${d.secs}"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/><circle class="arco" cx="22" cy="22" r="19" data-arco="${d.turnEnd}" style="stroke-dashoffset:${119.4 * (1 - Math.max(0, d.turnEnd - ahoraServidor()) / (d.secs * 1000))}"/></svg><span data-fin="${d.turnEnd}">${relojTexto(d.turnEnd)}</span></div>
      <div class="orador-txt">
        ${habla === yo
          ? '<b>¡Te toca hablar!</b><small>Defendé o atacá la fórmula, contá lo que sabés… o lo que te conviene.</small>'
          : `<b>Habla ${esc(nombre(habla))}${esBotPid(habla) ? ' 🤖' : ''}</b>${dicho ? `<span class="burbuja">“${esc(dicho)}”</span>` : `<small>${esBotPid(habla) ? 'Está pensando qué decir…' : 'Los demás, a escuchar (o a poner cara de póker).'}</small>`}`}
      </div>
    </div>
    <ol class="oradores">${orden.map((p, i) => `<li class="${i < d.idx ? 'hablo' : i === d.idx ? 'ahora' : ''}">${esc(nombre(p))}</li>`).join('')}</ol>
    ${habla === yo ? '<button class="btn grande primario" data-act="pasarPalabra">Terminé, paso la palabra</button>' : ''}
    ${soyHost && habla !== yo && g.alive[yo] ? `<div class="dos"><button class="btn secundario" data-act="pasarPalabra">Siguiente orador</button><button class="btn" data-act="cortarDebate" data-confirm="¿Cortar el debate e ir a votar?">Ir a votar ya</button></div>` : ''}
    ${panelVoz(habla)}
    ${!g.alive[yo] ? '<p class="nota">Los fantasmas no hablan.</p>' : ''}`;
}

function panelVoz(habla) {
  if (esBotPid(habla)) return `<div class="voz"><span>🤖 <b>${esc(nombre(habla))}</b> es un bot: dice lo suyo por escrito${Habla.activa() ? ' y en voz alta' : ''}.</span></div>`;
  if (PRACTICA || (st.pub.settings && st.pub.settings.voice === false)) return '';
  if (!Voz.soportado()) return '<div class="voz"><span>⚠️ Este navegador no permite audio en vivo. Probá con Chrome o Safari actualizados.</span></div>';
  const v = Voz.estadoActual();
  const barra = '<span class="vumetro" data-nivel aria-hidden="true"><i></i></span>';
  if (habla === st.pid) {
    const textos = {
      'pidiendo-micro': '🎙️ Prendiendo tu micrófono… si te pregunta, tocá <b>Permitir</b>.',
      'sin-micro': '⚠️ No pude usar tu micrófono. Tocá el candadito 🔒 de la barra de arriba, permití el micrófono y tocá Reintentar.',
      'al-aire': v.callado ? '🔇 Te silenciaste: nadie te escucha.' : '<b>🔴 AL AIRE</b> · todos te están escuchando',
    };
    return `<div class="voz ${v.estado === 'al-aire' && !v.callado ? 'aire' : ''}">
      <span>${textos[v.estado] || '🎙️ Preparando el micrófono…'}</span>
      ${v.estado === 'al-aire' && !v.callado ? barra : ''}
      ${v.estado === 'al-aire' ? `<button class="btn chico" data-act="callarme">${v.callado ? '🎙️ Volver a hablar' : '🔇 Silenciarme'}</button>` : ''}
      ${v.estado === 'sin-micro' ? '<button class="btn chico primario" data-act="reintentarVoz">🔄 Reintentar</button>' : ''}
    </div>`;
  }
  const textos = {
    conectando: '🔊 Conectando con el micrófono de ' + esc(nombre(habla)) + '…',
    reconectando: '🔄 Reconectando el audio de ' + esc(nombre(habla)) + '…',
    escuchando: v.silenciado ? '🔇 Silenciaste el audio.' : '🔊 Escuchando a <b>' + esc(nombre(habla)) + '</b>',
    'tocar-para-escuchar': '🔈 Tu navegador frenó el sonido: tocá el botón para escuchar.',
    'sin-conexion': '⚠️ No pude conectar el audio con ' + esc(nombre(habla)) + '. Puede ser la red (pasa con algunos datos móviles): probá con Wi-Fi, reintentá o que hable en voz alta.',
  };
  let boton = `<button class="btn chico" data-act="silenciarVoz">${v.silenciado ? '🔊 Activar sonido' : '🔇 Silenciar'}</button>`;
  if (v.estado === 'tocar-para-escuchar') boton = '<button class="btn chico primario" data-act="escucharVoz">🔊 Escuchar</button>';
  if (v.estado === 'sin-conexion') boton = '<button class="btn chico primario" data-act="reintentarVoz">🔄 Reintentar</button>';
  return `<div class="voz">
    <span>${textos[v.estado] || '🔊 Esperando el audio…'}</span>
    ${v.estado === 'escuchando' && !v.silenciado ? barra : ''}
    ${boton}
  </div>`;
}

function panelCharla(g) {
  const yo = st.pid;
  const r = lista(g.history)[lista(g.history).length - 1] || {};
  const c = r.claims || {};
  const ch = g.charla || {};
  const dichos = lista(ch.dichos);
  const soyHost = st.pub.host === yo && g.alive[yo];
  return `<h2>📣 ¿Les creés? <small class="sub">Debate abierto</small></h2>
    <div class="declaraciones-resumen">
      <p>🪪 Jefe <b>${esc(nombre(r.candidate))}</b>: ${c.chief !== undefined ? A.combo(c.chief, 3) : '—'}</p>
      <p>🎤 Vocero <b>${esc(nombre(r.nominee))}</b>: ${c.vocero !== undefined ? A.combo(c.vocero, 2) : '—'}</p>
    </div>
    <div class="reloj-voto">⏱️ <b data-fin="${ch.fin}">${relojTexto(ch.fin)}</b> s · ${g.alive[yo] ? 'todos pueden hablar a la vez' : 'los fantasmas escuchan en silencio'}</div>
    ${panelVozCharla(g)}
    ${dichos.length ? `<div class="dichos-charla">${dichos.map((x) => `<p><b>${esbotMarca(x.pid)}${esc(nombre(x.pid))}:</b> ${esc(x.text)}</p>`).join('')}</div>` : ''}
    ${soyHost ? '<button class="btn chico" data-act="cortarCharla" data-confirm="¿Terminar el debate abierto y seguir?">⏭️ Seguir</button>' : ''}`;
}

function panelVozCharla(g) {
  if (PRACTICA || (st.pub.settings && st.pub.settings.voice === false)) return '';
  if (!Voz.soportado()) return '<div class="voz"><span>⚠️ Este navegador no permite audio en vivo. Probá con Chrome o Safari actualizados.</span></div>';
  const v = Voz.estadoActual();
  const yo = st.pid;
  const barra = '<span class="vumetro" data-nivel aria-hidden="true"><i></i></span>';
  const mio = !g.alive[yo] ? '👂 Escuchás el debate.'
    : v.estado === 'pidiendo-micro' ? '🎙️ Prendiendo tu micrófono… si te pregunta, tocá <b>Permitir</b>.'
      : v.estado === 'sin-micro' ? '⚠️ No pude usar tu micrófono. Permitilo en el candadito 🔒 y tocá Reintentar.'
        : v.callado ? '🔇 Te silenciaste.' : '<b>🔴 MICRÓFONOS ABIERTOS</b> · hablá cuando quieras';
  const otros = v.oyentes ? ` · 🔊 escuchando a ${v.escuchando} de ${v.oyentes}` : '';
  return `<div class="voz ${v.estado === 'al-aire' && !v.callado ? 'aire' : ''}">
    <span>${mio}${otros}</span>
    ${v.estado === 'al-aire' && !v.callado ? barra : ''}
    ${v.estado === 'al-aire' ? `<button class="btn chico" data-act="callarme">${v.callado ? '🎙️ Hablar' : '🔇 Silenciarme'}</button>` : ''}
    ${v.bloqueado ? '<button class="btn chico primario" data-act="escucharVoz">🔊 Escuchar</button>' : ''}
    ${v.estado === 'sin-micro' || v.fallan ? '<button class="btn chico primario" data-act="reintentarVoz">🔄 Reintentar</button>' : ''}
  </div>`;
}

function panelDeclarar(g) {
  const yo = st.pid;
  const r = lista(g.history)[lista(g.history).length - 1] || {};
  const ya = r.declared || {};
  const cargo = yo === g.chief ? 'chief' : yo === g.vocero ? 'vocero' : null;
  const total = cargo === 'chief' ? 3 : 2;
  const estado = (p, k) => `<li>${k === 'chief' ? '🪪 Jefe' : '🎤 Vocero'} <b>${esc(nombre(p))}</b>${p === yo ? ' (vos)' : ''}: ${ya[k] ? '✔ ya declaró' : '<i>pensando qué decir…</i>'}</li>`;
  let mio = '';
  if (cargo && !ya[cargo]) {
    const opciones = [];
    for (let pr = total; pr >= 0; pr--) opciones.push(pr);
    mio = `<p>${cargo === 'chief' ? '¿Qué te llegó de la Mesa de Entradas (las 3 cartas)?' : '¿Qué te pasó el Jefe (las 2 cartas)?'} <b>Podés mentir.</b></p>
      <div class="opciones declarar">${opciones.map((pr) => `<button class="btn opcion" data-act="declarar" data-n="${pr}">${A.combo(pr, total)}</button>`).join('')}</div>`;
  }
  return `<h2>🗣️ Declaraciones</h2>
    ${mio || '<p>El Jefe y el Vocero cuentan qué cartas vieron. Las dos declaraciones se muestran juntas.</p>'}
    <ul class="declaraciones">${estado(g.chief, 'chief')}${estado(g.vocero, 'vocero')}</ul>`;
}

function puedeSerVocero(g, pid) {
  if (!g.alive[pid] || pid === g.candidate || pid === g.lastVocero) return false;
  const vivos = lista(g.order).filter((p) => g.alive[p]).length;
  if (pid === g.lastChief && vivos > 5) return false;
  return true;
}

function panelPoder(g, priv) {
  const yo = st.pid;
  const P = T.PODERES[g.power];
  if (g.chief !== yo) return esperando(`¡Poder activado! <b>${P.nombre}</b>: ${P.texto} Le toca a <b>${esc(nombre(g.chief))}</b>.`);
  const icono = A.iconoPoder(g.power);
  if (g.power === 'carpeta') {
    return `<h2>${icono} Mirar la carpeta</h2>
      <p>Estas son las próximas 3 cartas de la Mesa de Entradas, en orden (la primera es la de arriba). No se cambian de lugar.</p>
      <div class="mano chica">${lista(priv.peek).map((c, i) => A.carta(c, 10 + i)).join('')}</div>
      <button class="btn grande primario" data-act="poder">Listo, cerrar carpeta</button>`;
  }
  const objetivos = lista(g.order).filter((p) => g.alive[p] && p !== yo && (g.power !== 'encuesta' || !(g.investigated && g.investigated[p])));
  const verbo = { encuesta: 'Encuestar a', bajada: 'Que el próximo candidato sea', carpetazo: 'Hacerle un carpetazo a' }[g.power];
  return `<h2>${icono} ${P.nombre}</h2>
    <p>${P.texto} Estás obligado a usarlo.</p>
    <div class="opciones">${objetivos.map((p) => `<button class="btn opcion ${g.power === 'carpetazo' ? 'peligro' : ''}" data-act="poder" data-pid="${p}" data-confirm="${esc(verbo + ' ' + nombre(p) + '?')}">${esc(nombre(p))}</button>`).join('')}</div>`;
}

function pantallaFinal(g) {
  const ganoCampana = g.winner === 'campana';
  const miBando = st.priv && st.priv.side;
  const gane = miBando === g.winner;
  const soyHost = st.pub.host === st.pid;
  return `<section class="final ${ganoCampana ? 'campana' : 'operadores'}">
    ${A.titularFinal(ganoCampana, g.proposals >= 5 ? 'prop' : g.scandals >= 6 ? 'esc' : 'topo')}
    <p class="razon">${esc(g.winReason)}</p>
    <p class="vos">${gane ? '🎉 ¡Ganaste!' : '😩 Perdiste. Hay revancha.'}</p>
    <div class="roles-finales">
      ${lista(g.order).map((pid) => `<div class="rf ${g.reveal[pid]}">${A.retratoRol(g.reveal[pid])}<b>${esc(nombre(pid))}</b><small>${T.ROLES[g.reveal[pid]].titulo}</small></div>`).join('')}
    </div>
    ${soyHost ? '<button class="btn grande primario" data-act="revancha">🔁 Revancha con los mismos</button>' : '<p class="nota">El anfitrión puede armar la revancha.</p>'}
    <button class="btn link" data-act="salirFinal">Volver al inicio</button>
  </section>`;
}

// ------------------------------------------------------------------ Tablero

function tablero(g) {
  return `<section class="tablero">
    ${A.tableroPropuestas(g.proposals, frasesDeLaPartida(g, T.PROPUESTAS))}
    ${A.tableroEscandalos(g.scandals, lista(g.board), g.n, frasesDeLaPartida(g, T.ESCANDALOS))}
    <div class="fila-baja">
      ${A.contadorCrisis(g.crisis || 0)}
      ${A.mesaEntradas(g.deckCount)}
      ${A.trituradora(g.discardCount || 0)}
    </div>
  </section>`;
}

// ------------------------------------------------------------------ Animaciones y avisos

function detectarNovedades(g) {
  // Todo lo que pasó desde la última vez, en orden, sin que nada se pise.
  const ultimo = g.eventId || 0;
  if (st.ultimoEvento === null || st.ultimoEvento > ultimo) st.ultimoEvento = ultimo;
  for (const ev of lista(g.events)) {
    if (ev.id <= st.ultimoEvento) continue;
    st.ultimoEvento = ev.id;
    switch (ev.type) {
      case 'vote': if (g.lastVote) animarUrna(g.lastVote); break;
      case 'publish': mostrarPublicacion(ev.card, (ev.n || 1) - 1, false); break;
      case 'chaos': mostrarPublicacion(ev.card, (ev.n || 1) - 1, true); break;
      case 'veto':
        Son.efecto('veto');
        capa(`<div class="aviso-grande">${A.selloVetado()}<h2>¡VETADO!</h2><p>Las dos cartas fueron a La Trituradora y sube la Crisis.</p></div>`, 'aviso-capa', 3500);
        break;
      case 'vetoDenied': toast('El Jefe rechazó el Veto: el Vocero tiene que publicar.'); break;
      case 'carpetazo': {
        const eraTopo = g.reveal && g.reveal[ev.target] === 'topo';
        Son.efecto('sello');
        const quien = ev.target === st.pid ? '<b>¡Te hicieron un Carpetazo a vos!</b> Quedaste afuera: desde ahora, calladito.' : `<b>${esc(nombre(ev.target))}</b> quedó afuera de la campaña.`;
        capa(`<div class="aviso-grande">${A.iconoPoder('carpetazo')}<h2>¡Carpetazo!</h2><p>${quien} ${eraTopo ? '<b>¡Y era El Topo!</b>' : 'Nadie sabe qué era.'}</p></div>`, 'aviso-capa', 4500);
        break;
      }
      case 'claims': {
        const r = lista(g.history).find((x) => x.claims && x.round === g.history[g.history.length - 1].round) || lista(g.history).filter((x) => x.claims).pop();
        if (r) capa(`<div class="aviso-grande"><h2>🗣️ Declaraciones</h2>
          <p>🪪 Jefe <b>${esc(nombre(r.candidate))}</b>: ${A.combo(r.claims.chief, 3)}</p>
          <p>🎤 Vocero <b>${esc(nombre(r.nominee))}</b>: ${A.combo(r.claims.vocero, 2)}</p>
          <p class="nota">¿Les creés?</p></div>`, 'aviso-capa', 5000);
        break;
      }
      case 'encuesta': Son.efecto('teclado'); if (ev.by !== st.pid) toast(nombre(ev.by) + ' encuestó a ' + nombre(ev.target) + '.'); break;
      case 'bajada': Son.efecto('orador'); toast('Bajada de línea: el próximo candidato es ' + (ev.target === st.pid ? 'vos' : nombre(ev.target)) + '.'); break;
      case 'carpeta': if (ev.by !== st.pid) toast(nombre(ev.by) + ' ya miró la carpeta.'); break;
    }
  }
  // Resultado de encuesta (solo lo ve quien encuestó).
  const enc = st.priv && st.priv.lastSurvey;
  if (st.ultimaEncuesta === null) st.ultimaEncuesta = enc || '';
  else if (enc && enc !== st.ultimaEncuesta) {
    st.ultimaEncuesta = enc;
    st.modal = 'encuesta';
  }
}

// Las animaciones grandes van en fila: una termina y arranca la otra.
const cola = [];
let capaAbierta = false;
function capa(html, clase, ms, extra) {
  cola.push(Object.assign({ html, clase, ms }, extra || {}));
  if (!capaAbierta) siguienteCapa();
}
function siguienteCapa() {
  const item = cola.shift();
  if (!item) { capaAbierta = false; dibujar(); return; }
  capaAbierta = true;
  const c = document.createElement('div');
  c.className = 'capa ' + item.clase;
  c.innerHTML = (item.suspenso || item.html) + '<p class="nota tocar">Tocá para seguir</p>';
  document.body.appendChild(c);
  if (item.alAbrir) item.alAbrir();
  let cerrado = false;
  const relojes = [];
  if (item.suspenso) {
    // Primero el suspenso, después la revelación.
    relojes.push(setTimeout(() => {
      if (cerrado) return;
      c.innerHTML = item.html + '<p class="nota tocar">Tocá para seguir</p>';
      if (item.alRevelar) item.alRevelar();
    }, item.esperaRevelar || 1400));
  } else if (item.alRevelar) {
    relojes.push(setTimeout(() => { if (!cerrado) item.alRevelar(); }, item.esperaRevelar || 1200));
  }
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    relojes.forEach((r) => clearTimeout(r));
    if (item.suspenso && item.alRevelar && !c.querySelector('.publicacion')) item.alRevelar();
    c.classList.add('fuera');
    setTimeout(() => { c.remove(); siguienteCapa(); }, 350);
  };
  c.addEventListener('click', cerrar);
  if (item.ms) setTimeout(cerrar, item.ms);
}
// Para el modo práctica: los bots esperan mientras mirás una animación.
window.ballotageOcupado = () => capaAbierta || !!document.querySelector('.confirmar, #modal');

function animarUrna(lv) {
  const votos = lv.votes || {};
  const html = `<div class="urna-escena">
    ${A.urna()}
    <h2 class="resultado ${lv.approved ? 'si' : 'no'}">${lv.approved ? '¡Ganó el Sí!' : 'Ganó el No'} <small>${lv.yes} a ${lv.no}</small></h2>
    <div class="boletas-abiertas">
      ${Object.keys(votos).map((pid, i) => `<div class="bol ${votos[pid] ? 'si' : 'no'}" style="--i:${i}">
        <div class="dorso">${A.sobre()}</div>
        <div class="frente">${votos[pid] ? '¡Sí!' : '¡No!'}${lista(lv.late).includes(pid) ? '<small>no votó</small>' : ''}</div>
        <span>${esc(nombre(pid))}</span>
      </div>`).join('')}
    </div>
  </div>`;
  capa(html, 'urna-capa', 5000 + 300 * Object.keys(votos).length, {
    alAbrir: () => Son.efecto('urna'),
    alRevelar: () => Son.efecto(lv.approved ? 'si' : 'no'),
    esperaRevelar: 1200,
  });
}

// Cada partida mezcla los textos de las cartas a su manera, pero igual para todos:
// la semilla sale del código de sala y del orden de la mesa (que se sortea al empezar).
function frasesDeLaPartida(g, frases) {
  let h = 7;
  for (const ch of String(st.code) + lista(g && g.order).join('')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const out = frases.slice();
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function mostrarPublicacion(tipo, idx, caos) {
  const html = `<div class="publicacion ${tipo === 'P' ? 'prop' : 'esc'}">
    ${caos ? '<div class="cacerolazo">¡Cacerolazo! El pueblo publicó sin poderes</div>' : ''}
    ${tipo === 'P' ? A.volante(frasesDeLaPartida(st.pub && st.pub.game, T.PROPUESTAS)[idx], idx, true) : A.titular(frasesDeLaPartida(st.pub && st.pub.game, T.ESCANDALOS)[idx], true)}
    <p>${tipo === 'P' ? '¡Nueva Propuesta publicada!' : '¡Nuevo Escándalo en la tapa!'}</p>
  </div>`;
  const suspenso = `<div class="suspenso">${caos ? '<div class="cacerolazo">¡Cacerolazo!</div>' : ''}<div class="suspenso-ico">🥁</div><p>${caos ? 'El pueblo enojado publica sin poderes…' : 'Se viene la tapa…'}</p></div>`;
  capa(html, 'pub-capa', 5400, {
    suspenso,
    alAbrir: () => Son.efecto(caos ? 'cacerolazo' : 'redoble'),
    alRevelar: () => Son.efecto(tipo === 'P' ? 'propuesta' : 'escandalo'),
    esperaRevelar: caos ? 2000 : 1400,
  });
}

// ------------------------------------------------------------------ Ventanas (modales)

function dibujarModal() {
  let m = document.getElementById('modal');
  if (!st.modal) {
    if (m) m.remove();
    return;
  }
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal';
    document.body.appendChild(m);
  }
  m.className = 'modal-fondo';
  m.innerHTML = `<div class="modal">${contenidoModal()}<button class="btn link cerrar" data-act="cerrarModal">Cerrar</button></div>`;
}

// ------------------------------------------------------------------ Editor de personaje

const FILAS_LOOK = [
  ['piel', 'Piel', 'color'],
  ['pelo', 'Peinado', 'cara'],
  ['colorPelo', 'Color de pelo', 'color'],
  ['lentes', 'Anteojos', 'cara'],
  ['cara', 'Bigote o barba', 'cara'],
  ['gorro', 'Gorro', 'cara'],
  ['ropa', 'Ropa', 'color'],
  ['fondo', 'Fondo', 'color'],
];

function editorPersonaje() {
  const nom = st.lookNombre || 'Vos';
  const L = st.lookEdit;
  const filas = FILAS_LOOK.map(([k, titulo, tipo]) => `
    <div class="fila-look">
      <h3>${titulo}</h3>
      <div class="opciones-look ${tipo}">
        ${A.LOOK[k].map((v, i) => {
          const elegido = L[k] === i ? 'elegida' : '';
          if (tipo === 'color') return `<button class="muestra ${elegido}" style="background:${v}" data-act="look" data-k="${k}" data-v="${i}" aria-label="${titulo} ${i + 1}"></button>`;
          const prueba = Object.assign({}, L, { [k]: i });
          return `<button class="muestra-cara ${elegido}" data-act="look" data-k="${k}" data-v="${i}" aria-label="${esc(v)}">${A.avatar(nom, prueba)}<small>${esc(v)}</small></button>`;
        }).join('')}
      </div>
    </div>`).join('');
  return `<h2>🎨 Tu personaje</h2>
    <div class="vista-personaje">${A.avatar(nom, L)}<b>${esc(nom)}</b></div>
    <p class="nota">Es solo tu cara en la mesa: no tiene nada que ver con el rol que te toque.</p>
    <button class="btn chico secundario azar" data-act="lookAzar">🎲 Al azar</button>
    ${filas}
    <button class="btn grande primario" data-act="guardarLook">Listo, guardar</button>`;
}

function contenidoModal() {
  const g = st.pub && st.pub.game;
  switch (st.modal) {
    case 'personaje':
      return editorPersonaje();
    case 'sonido': {
      const pr = Son.preferencias();
      const interruptor = (k, titulo, ayuda) => `<div class="ajuste-sonido">
        <div><b>${titulo}</b><small>${ayuda}</small></div>
        <button class="btn chico ${pr[k] ? 'primario' : ''}" data-act="sonidoToggle" data-k="${k}" aria-pressed="${pr[k]}">${pr[k] ? 'Prendida' : 'Apagada'}</button>
      </div>`;
      return `<h2>🔊 Música y sonido</h2>
        ${interruptor('musica', '🎵 Música', 'En el inicio, la sala de espera y el final. Nunca durante el debate.')}
        ${interruptor('efectos', '✨ Efectos', 'Suspenso al publicar, la urna, tu turno, el carpetazo…')}
        ${Habla.soportada() ? `<div class="ajuste-sonido">
          <div><b>🤖 Voz de los bots</b><small>Leen en voz alta lo que dicen en el debate.</small></div>
          <button class="btn chico ${Habla.activa() ? 'primario' : ''}" data-act="vozBots" aria-pressed="${Habla.activa()}">${Habla.activa() ? 'Prendida' : 'Apagada'}</button>
        </div>` : ''}
        <label class="campo">🔈 Volumen
          <input id="volumen" type="range" min="0" max="1" step="0.05" value="${pr.volumen}">
        </label>
        <button class="btn chico" data-act="probarSonido">▶️ Probar</button>
        <p class="nota">Cada celular guarda su elección. Si alguien está hablando por micrófono, los efectos bajan solos.</p>`;
    }
    case 'micro': {
      const textos = {
        pidiendo: 'Si el navegador te pregunta, tocá <b>Permitir</b>.',
        'hablá': 'Decí algo en voz alta: la barra se tiene que mover.',
        'te-escucho': '✅ <b>¡Te escucho perfecto!</b> Cuando te toque hablar en el debate, el micrófono se prende solo.',
        error: '⚠️ No pude usar el micrófono. Tocá el candadito 🔒 de la barra de direcciones, permití el micrófono y probá de nuevo. En iPhone: Ajustes → Safari → Micrófono → Permitir.',
      };
      return `<h2>🎙️ Prueba de micrófono</h2>
        <p>${textos[st.pruebaMicro] || ''}</p>
        ${st.pruebaMicro !== 'error' ? '<div class="vumetro grande" data-nivel-prueba><i></i></div>' : '<button class="btn grande primario" data-act="probarMicro">Probar de nuevo</button>'}
        <p class="nota">Consejo: si juegan en la misma habitación, usen auriculares o bajen el volumen para que no se acople.</p>`;
    }
    case 'reglas':
      return `<div class="reglas">${A.logoChico()}${T.REGLAS}</div>`;
    case 'rol':
      return modalRol();
    case 'historial':
      return modalHistorial(g);
    case 'encuesta': {
      const pid = st.priv && st.priv.lastSurvey;
      const bando = st.priv && st.priv.surveys && st.priv.surveys[pid];
      return `<h2>Resultado de la Encuesta</h2>${A.credencialAfiliado(nombre(pid), bando)}
        <p class="nota">Solo vos ves esto. Contalo como quieras… o mentí.</p>`;
    }
    case 'menu': {
      const pin = st.priv && st.priv.pin;
      return `<h2>Menú</h2>
        <button class="btn grande secundario" data-act="modal" data-m="reglas">📜 Reglas</button>
        <button class="btn grande secundario" data-act="modal" data-m="historial">🗂️ Historial de rondas</button>
        ${encuestasHechas()}
        <div class="pin-box">¿Se te cortó o cambiaste de celular? Entrá al juego con <b>tu mismo mail</b> y volvés a esta partida (sala <b>${st.code}</b>).</div>`;
    }
    default:
      return '';
  }
}

function encuestasHechas() {
  const s = st.priv && st.priv.surveys;
  if (!s) return '';
  return `<div class="tarjeta"><h3>Tus encuestas</h3>${Object.keys(s).map((p) => `<p>${esc(nombre(p))}: <b class="bando ${s[p]}">${s[p] === 'campana' ? 'Campaña' : 'Operadores'}</b></p>`).join('')}</div>`;
}

function modalRol() {
  const pr = st.priv || {};
  if (!pr.role) return '<p>Todavía no hay roles repartidos.</p>';
  const R = T.ROLES[pr.role];
  if (!st.verRol) {
    return `<div class="sobre-rol" data-act="toggleRol">
      ${A.sobreSecreto()}
      <p><b>Tocá para ver tu rol</b></p>
      <small>Tapá la pantalla: que nadie espíe.</small>
    </div>`;
  }
  let aliados = '';
  if (pr.allies) {
    const ops = lista(pr.allies.operadores);
    if (pr.role === 'operador') {
      aliados = `<div class="aliados"><p>🕶️ El Topo es: <b>${esc(nombre(pr.allies.topo))}</b></p>
        ${ops.length ? `<p>Tus compañeros Operadores: <b>${ops.map((p) => esc(nombre(p))).join(', ')}</b></p>` : '<p>No hay otros Operadores además de vos.</p>'}</div>`;
    } else if (pr.role === 'topo') {
      aliados = `<div class="aliados"><p>Tus Operadores: <b>${ops.map((p) => esc(nombre(p))).join(', ')}</b></p></div>`;
    }
  } else if (pr.role === 'topo') {
    aliados = '<div class="aliados"><p>Hay demasiada gente: no sabés quiénes son tus Operadores. Ellos sí te conocen a vos.</p></div>';
  }
  return `<div class="rol-revelado ${pr.role}" data-act="toggleRol">
    ${A.retratoRol(pr.role)}
    <h2>${R.titulo}</h2>
    <p class="bando-chapa ${pr.side}">Bando: ${R.bando}</p>
    <p>${R.texto}</p>
    ${aliados}
    <small>Tocá para ocultar</small>
  </div>`;
}

function modalHistorial(g) {
  const h = lista(g && g.history).slice().reverse();
  if (!h.length) return '<h2>Historial</h2><p>Todavía no pasó nada. Ya va a pasar.</p>';
  return `<h2>Historial de rondas</h2><div class="historial">${h.map((r) => {
    const votos = r.votes || {};
    const pub = r.published === 'P' ? '<span class="pill prop">Propuesta</span>' : r.published === 'E' ? '<span class="pill esc">Escándalo</span>' : '';
    const estado = r.approved === undefined ? '<span class="pill">En curso</span>'
      : r.approved ? '<span class="pill si">Aprobada</span>' : '<span class="pill no">Rechazada</span>';
    const extra = [
      r.veto ? '<span class="pill">VETADO</span>' : '',
      r.chaos ? '<span class="pill">¡Cacerolazo!</span>' : '',
      r.power ? `<span class="pill">${T.PODERES[r.power].nombre}${r.target ? ': ' + esc(nombre(r.target)) : ''}</span>` : '',
    ].join('');
    return `<div class="ronda">
      <div class="r-cab"><b>Ronda ${r.round}</b> ${estado} ${pub} ${extra}</div>
      <div>🪪 Jefe: <b>${esc(nombre(r.candidate))}</b> · 🎤 Vocero: <b>${esc(nombre(r.nominee))}</b></div>
      ${r.claims && (r.claims.chief !== undefined || r.claims.vocero !== undefined) ? `<div class="dichos">🗣️ Jefe dijo: ${r.claims.chief !== undefined ? A.combo(r.claims.chief, 3) : '—'} · Vocero dijo: ${r.claims.vocero !== undefined ? A.combo(r.claims.vocero, 2) : '—'}</div>` : ''}
      ${Object.keys(votos).length ? `<div class="votos">${Object.keys(votos).map((p) => `<span class="${votos[p] ? 'si' : 'no'}">${esc(nombre(p))} ${votos[p] ? 'Sí' : 'No'}${lista(r.late).includes(p) ? ' (no votó)' : ''}</span>`).join('')}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ------------------------------------------------------------------ Confirmación

// Pregunta "¿seguro?" dentro de la página (los cuadros del navegador
// no andan en todos lados y en el celu quedan feos).
function confirmar(texto) {
  return new Promise((resolver) => {
    const c = document.createElement('div');
    c.className = 'modal-fondo confirmar';
    c.innerHTML = `<div class="modal chico" role="alertdialog" aria-label="${esc(texto)}">
      <p class="pregunta">${esc(texto)}</p>
      <div class="dos">
        <button class="btn grande secundario" data-r="0">Mejor no</button>
        <button class="btn grande primario" data-r="1">¡Dale!</button>
      </div>
    </div>`;
    c.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-r]');
      if (!b && ev.target !== c) return;
      ev.stopPropagation();
      c.remove();
      resolver(!!b && b.dataset.r === '1');
    });
    document.body.appendChild(c);
    c.querySelector('[data-r="1"]').focus();
  });
}

// ------------------------------------------------------------------ Botones

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  const d = b.dataset;

  if (d.confirm && !(await confirmar(d.confirm))) return;

  switch (act) {
    case 'login': pantallaLogin(d.m); break;
    case 'google': entrarConGoogle(); break;
    case 'cerrarSesion':
      if (await confirmar('¿Cerrar sesión en este celular?')) {
        salirDeSala();
        await fb.authMod.signOut(auth);
      }
      break;
    case 'cantidad':
      document.querySelectorAll('.cant:not(.deb):not(.vot)').forEach((x) => x.classList.toggle('elegida', x === b));
      break;
    case 'cantidadVot':
      document.querySelectorAll('.cant.vot').forEach((x) => x.classList.toggle('elegida', x === b));
      break;
    case 'cantidadDeb':
      document.querySelectorAll('.cant.deb').forEach((x) => x.classList.toggle('elegida', x === b));
      break;
    case 'practicar': {
      const name = apodo();
      if (!name) return;
      const n = Number((document.querySelector('.cant.elegida:not(.deb):not(.vot)') || {}).dataset?.n || 7);
      const debate = Number((document.querySelector('.cant.deb.elegida') || {}).dataset?.t ?? 30);
      const voteTime = Number((document.querySelector('.cant.vot.elegida') || {}).dataset?.t ?? 30);
      Object.assign(st, { code: 'BOTS', pid: 'p1' });
      Practica.iniciar(name, n, (e) => {
        st.pub = e.pub;
        st.priv = e.priv;
        st.presence = e.presence;
        dibujar();
      }, { debate, declare: true, voteTime }, miLookGuardado());
      break;
    }
    case 'crear': {
      if (!configurado) return toast('Primero hay que configurar Firebase.', 'error');
      const name = apodo();
      if (!name) return;
      const r = await pedir({ op: 'create', name });
      if (r) entrarASala(r.code);
      break;
    }
    case 'unirme': {
      if (!configurado) return toast('Primero hay que configurar Firebase.', 'error');
      const name = apodo();
      if (!name) return;
      const code = document.getElementById('codigo').value.trim().toUpperCase();
      if (code.length !== 4) return toast('El código tiene 4 letras.', 'error');
      const pin = null; // con cuenta de mail, se vuelve a entrar desde cualquier celular
      const r = await pedir({ op: 'join', code, name, pin });
      if (r) entrarASala(r.code);
      break;
    }
    case 'compartir': {
      const link = d.link;
      try {
        await navigator.clipboard.writeText(invitacion(link));
        toast('¡Invitación copiada! Pegala en el grupo.');
      } catch {
        if (navigator.share) navigator.share({ title: 'BALLOTAGE', text: invitacion(link) }).catch(() => {});
        else toast('Copiá el link de la barra del navegador y agregale ?sala=' + st.code);
      }
      break;
    }
    case 'empezar': jugar({ type: 'start' }); break;
    case 'echar':
      if (await confirmar('¿Sacar a ' + nombre(d.pid) + ' de la sala?')) jugar({ type: 'kick', target: d.pid });
      break;
    case 'salir':
      if (PRACTICA) { salirDeSala(); break; }
      if (await confirmar('¿Salir de la sala?')) {
        const r = await jugar({ type: 'leave' });
        if (r) salirDeSala();
      }
      break;
    case 'salirFinal': salirDeSala(); break;
    case 'nominar': jugar({ type: 'nominate', target: d.pid }); break;
    case 'votar': {
      const v = d.v === '1';
      st.miVoto = v;
      const r = await jugar({ type: 'vote', vote: v });
      if (r && navigator.vibrate) navigator.vibrate(40);
      dibujar();
      break;
    }
    case 'descJefe':
      if (await confirmar('¿Mandás esta carta a La Trituradora?')) jugar({ type: 'chiefDiscard', index: Number(d.i) });
      break;
    case 'descVoc':
      // La carta tocada se publica: al reglamento se le manda la OTRA para triturar.
      if (await confirmar('¿Publicás esta carta? La otra va a La Trituradora.')) jugar({ type: 'voceroDiscard', index: 1 - Number(d.i) });
      break;
    case 'pedirVeto':
      if (await confirmar('¿Proponer VETO al Jefe de Campaña?')) jugar({ type: 'vetoRequest' });
      break;
    case 'veto': jugar({ type: 'vetoReply', accept: d.v === '1' }); break;
    case 'poder': jugar({ type: 'power', target: d.pid || null }); break;
    case 'pasarPalabra': {
      const db = st.pub.game.debate;
      if (db) jugar({ type: 'debateNext', idx: db.idx });
      break;
    }
    case 'cortarDebate': jugar({ type: 'debateNext', all: true }); break;
    case 'editarPersonaje': {
      const campo = document.getElementById('apodo');
      const nom = (st.pub && st.pub.players && st.pub.players[st.pid] && st.pub.players[st.pid].name)
        || (campo && campo.value.trim()) || guardado.get('name') || 'Vos';
      st.lookNombre = nom;
      st.lookEdit = Object.assign({}, lookDe(st.pid) || miLookGuardado() || A.lookDesdeNombre(nom));
      st.modal = 'personaje';
      dibujarModal();
      break;
    }
    case 'look': {
      const caja = document.querySelector('#modal .modal');
      const scroll = caja ? caja.scrollTop : 0;
      st.lookEdit[d.k] = Number(d.v);
      dibujarModal();
      const nueva = document.querySelector('#modal .modal');
      if (nueva) nueva.scrollTop = scroll;
      break;
    }
    case 'lookAzar':
      st.lookEdit = A.lookAlAzar();
      dibujarModal();
      break;
    case 'guardarLook':
      guardado.set('look', JSON.stringify(st.lookEdit));
      if (st.pub && st.pub.players && st.pub.players[st.pid]) jugar({ type: 'look', look: st.lookEdit });
      st.modal = null;
      dibujarModal();
      toast('¡Listo! Así te van a ver en la mesa.');
      break;
    case 'callarme': Voz.callarme(!Voz.estadoActual().callado); break;
    case 'silenciarVoz': Voz.silenciarAudio(!Voz.estadoActual().silenciado); break;
    case 'escucharVoz': Voz.tocarParaEscuchar(); break;
    case 'probarMicro':
      st.modal = 'micro';
      st.pruebaMicro = 'pidiendo';
      dibujarModal();
      try {
        st.pararPrueba = await Voz.probarMicrofono((n) => {
          document.querySelectorAll('[data-nivel-prueba]').forEach((el) => el.style.setProperty('--nivel', n.toFixed(2)));
          if (n > 0.12 && st.pruebaMicro !== 'te-escucho') { st.pruebaMicro = 'te-escucho'; dibujarModal(); }
        });
        if (st.pruebaMicro === 'pidiendo') { st.pruebaMicro = 'hablá'; dibujarModal(); }
      } catch {
        st.pruebaMicro = 'error';
        dibujarModal();
      }
      break;
    case 'reintentarVoz': Voz.reintentar(); break;
    case 'cortarCharla': jugar({ type: 'charlaFin' }); break;
    case 'declarar': jugar({ type: 'declare', proposals: Number(d.n) }); break;
    case 'ajuste':
      jugar(Object.assign({ type: 'settings' },
        d.debate !== undefined ? { debate: Number(d.debate) }
          : d.vote !== undefined ? { voteTime: Number(d.vote) }
            : d.voice !== undefined ? { voice: d.voice === '1' }
              : d.charla !== undefined ? { charla: Number(d.charla) }
              : { declare: d.declare === '1' }));
      break;
    case 'revancha': jugar({ type: 'rematch' }); break;
    case 'reglas':
      st.modal = 'reglas';
      dibujarModal();
      break;
    case 'modal':
      st.modal = d.m;
      if (d.m === 'rol') st.verRol = false;
      dibujarModal();
      break;
    case 'cerrarModal':
      if (st.pararPrueba) { st.pararPrueba(); st.pararPrueba = null; }
      st.modal = null;
      st.verRol = false;
      dibujarModal();
      break;
    case 'agregarBot': {
      const r = await pedir({ op: 'addBot', code: st.code });
      if (r) toast('🤖 Se sumó un bot a la mesa.');
      break;
    }
    case 'vozBots':
      Habla.activar(!Habla.activa());
      dibujarModal();
      break;
    case 'sonidoToggle': {
      const pr = Son.preferencias();
      Son.configurar({ [d.k]: !pr[d.k] });
      if (d.k === 'musica' && !pr.musica && (!st.pub || st.pub.status === 'lobby')) Son.musica('inicio');
      dibujarModal();
      const bs = $app.querySelector('.btn-sonido');
      if (bs) bs.textContent = Son.preferencias().musica ? '🔊 Música y sonido' : '🔇 Música y sonido';
      break;
    }
    case 'probarSonido': Son.efecto('propuesta'); break;
    case 'toggleRol':
      st.verRol = !st.verRol;
      if (st.verRol) { Son.efecto('sobre'); Son.efecto('misterio'); }
      dibujarModal();
      break;
  }
});

// Reloj del debate: actualiza los números y, cuando se acaba el tiempo,
// el celular del orador (o el del anfitrión) pasa la palabra.
setInterval(() => {
  document.querySelectorAll('[data-fin]').forEach((el) => { el.textContent = relojTexto(Number(el.dataset.fin)); });
  document.querySelectorAll('[data-arco]').forEach((el) => {
    const d = st.pub && st.pub.game && st.pub.game.debate;
    if (!d) return;
    const resto = Math.max(0, Number(el.dataset.arco) - ahoraServidor()) / (d.secs * 1000);
    el.style.strokeDashoffset = String(119.4 * (1 - resto));
  });
  const g = st.pub && st.pub.game;
  // Tic-tac en los últimos 5 segundos del debate y de la votación.
  const fin = g && g.phase === 'debate' && g.debate ? g.debate.turnEnd
    : g && g.phase === 'charla' && g.charla ? g.charla.fin
      : g && g.phase === 'vote' && !(g.voted && g.voted[st.pid]) ? g.voteEnd : 0;
  if (g && g.phase === 'charla' && g.charla && ahoraServidor() >= g.charla.fin) {
    const clave = 'c' + g.round;
    const reintento = !st.pasado || st.pasado.clave !== clave || Date.now() - st.pasado.t > 2500;
    if ((st.pub.host === st.pid || !st.presence[st.pub.host]) && reintento) {
      st.pasado = { clave, t: Date.now() };
      jugar({ type: 'charlaFin' }, true);
    }
  }
  if (fin) {
    const quedan = Math.ceil((fin - ahoraServidor()) / 1000);
    if (quedan > 0 && quedan <= 5 && st.ultimoTic !== fin + '-' + quedan) {
      st.ultimoTic = fin + '-' + quedan;
      Son.efecto('tic');
    }
  }
  if (g && g.phase === 'vote' && g.voteEnd && ahoraServidor() >= g.voteEnd) {
    // Avisa el anfitrión (o cualquiera, si el anfitrión no está conectado).
    const clave = 'v' + g.round;
    const reintento = !st.pasado || st.pasado.clave !== clave || Date.now() - st.pasado.t > 2500;
    if ((st.pub.host === st.pid || !st.presence[st.pub.host]) && reintento) {
      st.pasado = { clave, t: Date.now() };
      jugar({ type: 'voteTimeout' }, true);
    }
  }
  if (!g || g.phase !== 'debate' || !g.debate) return;
  const d = g.debate;
  const habla = lista(d.order)[d.idx];
  const clave = g.round + '-' + d.idx;
  if (habla === st.pid && st.avisoHabla !== clave) {
    st.avisoHabla = clave;
    if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
  }
  if (st.ultimoOrador !== clave) {
    if (st.ultimoOrador && habla !== st.pid) Son.efecto('orador');
    st.ultimoOrador = clave;
  }
  const responsable = habla === st.pid || st.pub.host === st.pid || !st.presence[habla];
  const reintento = !st.pasado || st.pasado.clave !== clave || Date.now() - st.pasado.t > 2500;
  if (responsable && ahoraServidor() >= d.turnEnd && reintento) {
    st.pasado = { clave, t: Date.now() };
    jugar({ type: 'debateNext', idx: d.idx }, true);
  }
}, 250);

// Al terminar una votación nueva, se olvida el voto local.
setInterval(() => {
  const g = st.pub && st.pub.game;
  if (g && g.phase !== 'vote') st.miVoto = undefined;
}, 1000);

document.addEventListener('input', (ev) => {
  if (ev.target && ev.target.id === 'volumen') Son.configurar({ volumen: Number(ev.target.value) });
});

// ------------------------------------------------------------------ Arranque

if (PRACTICA) {
  pantallaInicio();
} else {
  $app.innerHTML = '<div class="cargando">Conectando con el búnker…</div>';
  fb.authMod.getRedirectResult(auth).catch((e) => toast(errorAuth(e), 'error'));
  fb.onAuthStateChanged(auth, (u) => {
    if (!u || u.isAnonymous) {
      // Sin sesión (o una sesión vieja sin mail): a la pantalla de ingreso.
      if (u) fb.authMod.signOut(auth);
      st.uid = null;
      pantallaLogin();
      return;
    }
    if (st.uid === u.uid) return;
    st.uid = u.uid;
    if (GRATIS) Anfitrion.usuario(u.uid);
    const salaUrl = (params.get('sala') || '').toUpperCase();
    const salaGuardada = guardado.get('code');
    if (salaGuardada && (!salaUrl || salaUrl === salaGuardada)) {
      pantallaInicio();
      entrarASala(salaGuardada); // si seguís en la sala, entrás directo
    } else {
      pantallaInicio();
    }
  });
}
