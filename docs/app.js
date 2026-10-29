// BALLOTAGE — lo que corre en cada celular.
// Solo muestra lo que el árbitro le deja ver y le manda pedidos.

import * as CFG from './config.js';
import * as T from './textos.js';
import * as A from './arte.js';
import * as Practica from './practica.js';
import * as Anfitrion from './anfitrion.js';
import * as Voz from './voz.js';

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
      <h3>🎙️ Segundos de debate por persona</h3>
      <div class="cantidades">${[0, 15, 30, 45, 60, 90].map((t) => `<button class="btn cant deb ${t === 30 ? 'elegida' : ''}" data-act="cantidadDeb" data-t="${t}">${t || 'Sin'}</button>`).join('')}</div>
      <h3>⏱️ Segundos para votar</h3>
      <div class="cantidades">${[0, 20, 30, 45, 60, 90].map((t) => `<button class="btn cant vot ${t === 30 ? 'elegida' : ''}" data-act="cantidadVot" data-t="${t}">${t || 'Sin'}</button>`).join('')}</div>
      <p class="nota">Si no votás a tiempo, tu boleta cuenta como ¡Sí!</p>
    </div>
    <button class="btn grande primario" data-act="practicar">¡Largar la campaña!</button>
    <button class="btn link" data-act="reglas">📜 ¿Cómo se juega?</button>
    ${configurado ? `<a class="btn link" href="${location.pathname}">🌐 Jugar online con amigos</a>` : ''}
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
    <button class="btn link" data-act="reglas">📜 ¿Cómo se juega?</button>
    <a class="btn link" href="?practica">🤖 Practicar contra bots (sin cuenta)</a>
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
    <button class="btn link" data-act="reglas">📜 ¿Cómo se juega?</button>
    <a class="btn link" href="?practica">🤖 Practicar contra bots</a>
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

function nombre(pid) {
  return (st.pub.players[pid] && st.pub.players[pid].name) || '¿?';
}

// ------------------------------------------------------------------ Sala de espera

function invitacion(link) {
  return '🗳️ ¡Sumate a mi campaña en BALLOTAGE! Hay un Topo infiltrado y nadie sabe quién es.\n\n' +
    'Entrá desde el celu: ' + link + '\nCódigo de sala: ' + st.code;
}

function pantallaEspera() {
  const p = st.pub;
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
    <h2>Militantes en el búnker <small>${n}/10</small></h2>
    <ul class="lista-jugadores">
      ${pids.map((pid) => `
        <li>
          <span class="punto ${st.presence[pid] ? 'on' : ''}"></span>
          <span class="nombre">${esc(p.players[pid].name)}${pid === st.pid ? ' <em>(vos)</em>' : ''}</span>
          ${pid === p.host ? '<span class="chapa">anfitrión</span>' : ''}
          ${soyHost && pid !== st.pid && !PRACTICA ? `<button class="btn chico peligro" data-act="echar" data-pid="${pid}">Sacar</button>` : ''}
        </li>`).join('')}
    </ul>
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
  return `<div class="tarjeta ajustes">
    <h3>🎙️ Debate antes de cada votación</h3>
    <p class="nota izq">Cada jugador en carrera tiene su turno para hablar, con reloj. Primero la fórmula, después el resto.</p>
    ${soyHost
      ? `<div class="cantidades">${tiempos.map((t) => `<button class="btn cant ${c.debate === t ? 'elegida' : ''}" data-act="ajuste" data-debate="${t}">${txt(t)}</button>`).join('')}</div>`
      : `<p><b>${c.debate ? c.debate + ' segundos por persona' : 'Sin debate'}</b></p>`}
    <h3>⏱️ Tiempo para votar</h3>
    <p class="nota izq">Quien no vota antes de que se termine el reloj, cuenta como <b>¡Sí!</b>.</p>
    ${soyHost
      ? `<div class="cantidades">${[0, 20, 30, 45, 60, 90].map((t) => `<button class="btn cant ${c.voteTime === t ? 'elegida' : ''}" data-act="ajuste" data-vote="${t}">${t ? t + ' s' : 'Sin'}</button>`).join('')}</div>`
      : `<p><b>${c.voteTime ? c.voteTime + ' segundos' : 'Sin límite'}</b></p>`}
    <h3>🎧 Audio en el debate</h3>
    <p class="nota izq">Cuando te toca hablar, se prende tu micrófono y todos te escuchan desde su celular. Si están juntos o en una llamada, apáguenlo.</p>
    ${soyHost
      ? `<div class="dos"><button class="btn cant ${c.voice !== false ? 'elegida' : ''}" data-act="ajuste" data-voice="1">Sí</button><button class="btn cant ${c.voice === false ? 'elegida' : ''}" data-act="ajuste" data-voice="0">No</button></div>`
      : `<p><b>${c.voice !== false ? 'Sí' : 'No'}</b></p>`}
    ${c.voice !== false ? '<button class="btn chico" data-act="probarMicro">🎙️ Probar mi micrófono</button>' : ''}
    <h3>🗣️ Declaraciones</h3>
    <p class="nota izq">Después de publicar, el Jefe y el Vocero cuentan qué cartas les llegaron. Pueden mentir.</p>
    ${soyHost
      ? `<div class="dos"><button class="btn cant ${c.declare ? 'elegida' : ''}" data-act="ajuste" data-declare="1">Sí</button><button class="btn cant ${!c.declare ? 'elegida' : ''}" data-act="ajuste" data-declare="0">No</button></div>`
      : `<p><b>${c.declare ? 'Sí' : 'No'}</b></p>`}
  </div>`;
}

// ------------------------------------------------------------------ Juego

function pantallaJuego() {
  const g = st.pub.game;
  if (!g) return;
  detectarNovedades(g);
  if (!PRACTICA) Voz.actualizar(g, st.pub.settings);
  const yo = st.pid;
  const vivo = g.alive[yo];
  // La pantalla final espera a que terminen las animaciones (no spoilear).
  const terminado = g.phase === 'ended' && !capaAbierta;
  $app.className = 'juego';
  $app.innerHTML = `
    <header class="barra">
      ${A.logoChico()}
      <span class="codigo-mini">Sala ${st.code}</span>
      <button class="btn icono" data-act="modal" data-m="rol" aria-label="Mi rol">🪪</button>
      <button class="btn icono" data-act="modal" data-m="historial" aria-label="Historial">🗂️</button>
      <button class="btn icono" data-act="modal" data-m="menu" aria-label="Menú">☰</button>
    </header>
    ${avisoAnfitrion()}
    ${!vivo && !terminado ? `<div class="aviso fantasma">👻 Te hicieron un Carpetazo. Ya no votás ni hablás: mirá en silencio.</div>` : ''}
    ${terminado ? pantallaFinal(g) : ''}
    <section class="accion">${terminado ? '' : g.phase === 'ended' ? esperando('Contando los votos del escrutinio…') : panelAccion(g)}</section>
    ${filaJugadores(g)}
    <section class="cronica">
      <h3>📰 Último momento</h3>
      <ul>${lista(g.log).slice(-4).reverse().map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    </section>
    ${tablero(g)}
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
  const proximo = proximoCandidato(g);
  const asientos = orden.map((pid, i) => {
    // Arranca arriba y gira en el sentido de las agujas del reloj.
    const ang = (-90 + (360 * i) / n) * (Math.PI / 180);
    const x = 50 + 41 * Math.cos(ang);
    const y = 50 + 39 * Math.sin(ang);
    const cls = [
      'asiento',
      !g.alive[pid] ? 'muerto' : '',
      pid === st.pid ? 'yo' : '',
      st.presence[pid] ? '' : 'offline',
      pid === habla ? 'hablando' : '',
      (enEleccion ? pid === g.candidate : pid === g.chief) ? 'es-jefe' : '',
      (enEleccion ? pid === g.nominee : pid === g.vocero) ? 'es-vocero' : '',
    ].join(' ');
    const marcas = [];
    if (enEleccion ? pid === g.candidate : pid === g.chief && g.chief) marcas.push(`<span class="marca jefe" title="${enEleccion ? 'Candidato a Jefe' : 'Jefe de Campaña'}">${A.credencial(enEleccion)}</span>`);
    if (enEleccion ? pid === g.nominee && g.nominee : pid === g.vocero && g.vocero) marcas.push(`<span class="marca vocero" title="${enEleccion ? 'Candidato a Vocero' : 'Vocero'}">${A.microfono(enEleccion)}</span>`);
    if (pid === habla) marcas.push('<span class="marca habla" title="Está hablando">🎙️</span>');
    let estado = '';
    if (g.phase === 'vote' && g.alive[pid]) estado = g.voted && g.voted[pid] ? '<span class="voto-ok">✔ votó</span>' : '<span class="voto-esp">votando…</span>';
    else if (g.phase === 'nominate' && g.alive[pid] && pid !== g.candidate && !puedeSerVocero(g, pid)) estado = '<span class="limite">no elegible</span>';
    else if (pid === proximo && g.phase !== 'ended' && pid !== g.candidate) estado = '<span class="proximo">próximo Jefe</span>';
    const rev = g.reveal ? `<span class="rol-final ${g.reveal[pid]}">${esc(T.ROLES[g.reveal[pid]].titulo)}</span>` : '';
    return `<div class="${cls}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%">
      <div class="cara">${A.avatar(nombre(pid))}${marcas.join('')}${!g.alive[pid] ? '<span class="sello-out">OUT</span>' : ''}</div>
      ${pid === st.pid ? '<span class="vos">VOS</span>' : ''}
      <div class="nom">${esc(nombre(pid))}</div>
      ${estado}${rev}
    </div>`;
  }).join('');
  return `<section class="mesa-zona" aria-label="Mesa de campaña">
    <div class="mesa n${n}">
      <svg class="mesa-arte" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <ellipse cx="50" cy="50" rx="30" ry="28" class="mesa-tabla"/>
        <ellipse cx="50" cy="50" rx="26.5" ry="24.5" class="mesa-pano"/>
        <path d="M50 14 A36 34 0 0 1 84 44" class="mesa-giro"/>
        <path d="M84 44 l-3.5 -3 M84 44 l1.6 -4.2" class="mesa-giro punta"/>
      </svg>
      <div class="mesa-centro">${centroMesa(g)}</div>
      ${asientos}
    </div>
    <p class="mesa-ayuda">El cargo de Jefe rota en el sentido de la flecha ↻ · 🪪 Jefe · 🎤 Vocero · 🎙️ habla</p>
  </section>`;
}

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
        <p>Tocá la carta que querés <b>triturar</b>. La otra se publica.</p>
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
          : `<b>Habla ${esc(nombre(habla))}</b><small>${dicho ? '“' + esc(dicho) + '”' : 'Los demás, a escuchar (o a poner cara de póker).'}</small>`}
      </div>
    </div>
    <ol class="oradores">${orden.map((p, i) => `<li class="${i < d.idx ? 'hablo' : i === d.idx ? 'ahora' : ''}">${esc(nombre(p))}</li>`).join('')}</ol>
    ${habla === yo ? '<button class="btn grande primario" data-act="pasarPalabra">Terminé, paso la palabra</button>' : ''}
    ${soyHost && habla !== yo && g.alive[yo] ? `<div class="dos"><button class="btn secundario" data-act="pasarPalabra">Siguiente orador</button><button class="btn" data-act="cortarDebate" data-confirm="¿Cortar el debate e ir a votar?">Ir a votar ya</button></div>` : ''}
    ${panelVoz(habla)}
    ${!g.alive[yo] ? '<p class="nota">Los fantasmas no hablan.</p>' : ''}`;
}

function panelVoz(habla) {
  if (PRACTICA || (st.pub.settings && st.pub.settings.voice === false)) return '';
  const v = Voz.estadoActual();
  if (habla === st.pid) {
    const textos = {
      'pidiendo-micro': '🎙️ Prendiendo tu micrófono… si te pregunta, tocá <b>Permitir</b>.',
      'sin-micro': '⚠️ No pude usar tu micrófono. Revisá el permiso en el navegador (el candadito de arriba) y hablá en voz alta.',
      'al-aire': v.callado ? '🔇 Te silenciaste: nadie te escucha.' : '<b>🔴 AL AIRE</b> · todos te están escuchando',
    };
    return `<div class="voz ${v.estado === 'al-aire' && !v.callado ? 'aire' : ''}">
      <span>${textos[v.estado] || '🎙️ Preparando el micrófono…'}</span>
      ${v.estado === 'al-aire' ? `<button class="btn chico" data-act="callarme">${v.callado ? '🎙️ Volver a hablar' : '🔇 Silenciarme'}</button>` : ''}
    </div>`;
  }
  const textos = {
    conectando: '🔊 Conectando con el micrófono de ' + esc(nombre(habla)) + '…',
    escuchando: v.silenciado ? '🔇 Silenciaste el audio.' : '🔊 Escuchando a <b>' + esc(nombre(habla)) + '</b>',
    'tocar-para-escuchar': '🔈 Tocá el botón para escuchar.',
    'sin-conexion': '⚠️ No pude conectar el audio con ' + esc(nombre(habla)) + ' (puede ser la red). Que hable en voz alta o por llamada.',
  };
  return `<div class="voz">
    <span>${textos[v.estado] || '🔊 Esperando el audio…'}</span>
    ${v.estado === 'tocar-para-escuchar' ? '<button class="btn chico primario" data-act="escucharVoz">🔊 Escuchar</button>'
      : `<button class="btn chico" data-act="silenciarVoz">${v.silenciado ? '🔊 Activar sonido' : '🔇 Silenciar'}</button>`}
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
    ${A.tableroPropuestas(g.proposals, T.PROPUESTAS)}
    ${A.tableroEscandalos(g.scandals, lista(g.board), g.n, T.ESCANDALOS)}
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
        capa(`<div class="aviso-grande">${A.selloVetado()}<h2>¡VETADO!</h2><p>Las dos cartas fueron a La Trituradora y sube la Crisis.</p></div>`, 'aviso-capa', 3500);
        break;
      case 'vetoDenied': toast('El Jefe rechazó el Veto: el Vocero tiene que publicar.'); break;
      case 'carpetazo': {
        const eraTopo = g.reveal && g.reveal[ev.target] === 'topo';
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
      case 'encuesta': if (ev.by !== st.pid) toast(nombre(ev.by) + ' encuestó a ' + nombre(ev.target) + '.'); break;
      case 'bajada': toast('Bajada de línea: el próximo candidato es ' + (ev.target === st.pid ? 'vos' : nombre(ev.target)) + '.'); break;
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
function capa(html, clase, ms) {
  cola.push({ html, clase, ms });
  if (!capaAbierta) siguienteCapa();
}
function siguienteCapa() {
  const item = cola.shift();
  if (!item) { capaAbierta = false; dibujar(); return; }
  capaAbierta = true;
  const c = document.createElement('div');
  c.className = 'capa ' + item.clase;
  c.innerHTML = item.html + '<p class="nota tocar">Tocá para seguir</p>';
  document.body.appendChild(c);
  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
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
  capa(html, 'urna-capa', 5000 + 300 * Object.keys(votos).length);
}

function mostrarPublicacion(tipo, idx, caos) {
  const html = `<div class="publicacion ${tipo === 'P' ? 'prop' : 'esc'}">
    ${caos ? '<div class="cacerolazo">¡Cacerolazo! El pueblo publicó sin poderes</div>' : ''}
    ${tipo === 'P' ? A.volante(T.PROPUESTAS[idx % T.PROPUESTAS.length], idx, true) : A.titular(T.ESCANDALOS[idx % T.ESCANDALOS.length], true)}
    <p>${tipo === 'P' ? '¡Nueva Propuesta publicada!' : '¡Nuevo Escándalo en la tapa!'}</p>
  </div>`;
  capa(html, 'pub-capa', 4000);
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

function contenidoModal() {
  const g = st.pub && st.pub.game;
  switch (st.modal) {
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
      }, { debate, declare: true, voteTime });
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
      if (await confirmar('¿Triturás esta carta y publicás la otra?')) jugar({ type: 'voceroDiscard', index: Number(d.i) });
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
    case 'callarme': Voz.callarme(!Voz.estadoActual().callado); break;
    case 'silenciarVoz': Voz.silenciarAudio(!Voz.estadoActual().silenciado); break;
    case 'escucharVoz': Voz.tocarParaEscuchar(); break;
    case 'probarMicro':
      try {
        await Voz.probarMicrofono();
        toast('🎙️ ¡Micrófono listo! Cuando te toque hablar se prende solo.');
      } catch {
        toast('No pude usar el micrófono. Tocá el candadito de la barra de direcciones y permitilo.', 'error');
      }
      break;
    case 'declarar': jugar({ type: 'declare', proposals: Number(d.n) }); break;
    case 'ajuste':
      jugar(Object.assign({ type: 'settings' },
        d.debate !== undefined ? { debate: Number(d.debate) }
          : d.vote !== undefined ? { voteTime: Number(d.vote) }
            : d.voice !== undefined ? { voice: d.voice === '1' }
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
      st.modal = null;
      st.verRol = false;
      dibujarModal();
      break;
    case 'toggleRol':
      st.verRol = !st.verRol;
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
