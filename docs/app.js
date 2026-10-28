// BALLOTAGE — lo que corre en cada celular.
// Solo muestra lo que el árbitro le deja ver y le manda pedidos.

import { firebaseConfig, REGION } from './config.js';
import * as T from './textos.js';
import * as A from './arte.js';
import * as Practica from './practica.js';

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

let auth, db, llamar;
const fb = {};
if (!PRACTICA) {
  const [app, au, da, fu] = await Promise.all(
    ['firebase-app.js', 'firebase-auth.js', 'firebase-database.js', 'firebase-functions.js'].map((f) => import(FB + f)));
  Object.assign(fb, au, da);
  const fapp = app.initializeApp(cfg);
  auth = au.getAuth(fapp);
  db = da.getDatabase(fapp);
  const fns = fu.getFunctions(fapp, REGION);
  if (EMU) {
    au.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    da.connectDatabaseEmulator(db, '127.0.0.1', 9000);
    fu.connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  }
  llamar = fu.httpsCallable(fns, 'ballotage');
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

async function pedir(datos) {
  if (st.ocupado) return null;
  st.ocupado = true;
  document.body.classList.add('ocupado');
  try {
    const r = PRACTICA ? await Practica.pedir(datos) : await llamar(datos);
    return r.data;
  } catch (e) {
    toast(e.message || 'Algo falló. Probá de nuevo.', 'error');
    return null;
  } finally {
    st.ocupado = false;
    document.body.classList.remove('ocupado');
  }
}

const jugar = (action) => pedir({ op: 'act', code: st.code, action });

// ------------------------------------------------------------------ Conexión a una sala

function salirDeSala(msg) {
  if (PRACTICA) Practica.detener();
  st.cancelar.forEach((f) => f());
  st.cancelar = [];
  Object.assign(st, { code: null, pid: null, pub: null, priv: null, presence: {}, modal: null, rolVisto: false, verRol: false,
    ultimoVoto: null, ultimaCuenta: null, ultimaEncuesta: null, ultimoEvento: null });
  guardado.set('code', null);
  history.replaceState(null, '', location.pathname + (EMU ? '?emu' : params.has('practica') ? '?practica' : ''));
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
  // Las escuchas viejas (si cambió el pid) se reemplazan.
  st.cancelar.splice(1).forEach((f) => f());
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
  st.cancelar.push(offCon, offPub, offPriv, offPres, () => fb.set(presRef, false).catch(() => {}));
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
    </div>
    <button class="btn grande primario" data-act="practicar">¡Largar la campaña!</button>
    <button class="btn link" data-act="reglas">📜 ¿Cómo se juega?</button>
    ${configurado ? `<a class="btn link" href="${location.pathname}">🌐 Jugar online con amigos</a>` : ''}
  `;
}

function pantallaInicio() {
  if (PRACTICA) return pantallaPractica();
  const codigo = (params.get('sala') || '').toUpperCase();
  $app.className = 'inicio';
  $app.innerHTML = `
    <div class="portada">
      ${A.logo()}
      <p class="bajada">El juego donde la campaña se pudre desde adentro.</p>
    </div>
    ${configurado ? '' : `<div class="aviso">⚠️ Falta configurar Firebase: abrí <b>docs/config.js</b> y pegá tus datos (ver <b>COMO_PUBLICAR.md</b>).</div>`}
    <label class="campo">Tu apodo
      <input id="apodo" maxlength="16" autocomplete="nickname" placeholder="Ej: La Tana" value="${esc(guardado.get('name') || '')}">
    </label>
    <div class="tarjeta">
      <h3>Unirme a una sala</h3>
      <label class="campo">Código de sala
        <input id="codigo" maxlength="4" autocapitalize="characters" placeholder="ABCD" value="${esc(codigo)}">
      </label>
      <details class="volver">
        <summary>¿Volvés desde otro celular?</summary>
        <label class="campo">Clave de regreso
          <input id="pin" inputmode="numeric" maxlength="4" placeholder="1234">
        </label>
      </details>
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
      ${PRACTICA ? '<small>Partida de práctica contra bots</small>' : `<button class="btn chico" data-act="compartir" data-link="${esc(link)}">📲 Compartir link</button>`}
    </div>
    <h2>Militantes en el búnker <small>${n}/10</small></h2>
    <ul class="lista-jugadores">
      ${pids.map((pid) => `
        <li>
          <span class="punto ${st.presence[pid] ? 'on' : ''}"></span>
          <span class="nombre">${esc(p.players[pid].name)}${pid === st.pid ? ' <em>(vos)</em>' : ''}</span>
          ${pid === p.host ? '<span class="chapa">anfitrión</span>' : ''}
          ${soyHost && pid !== st.pid ? `<button class="btn chico peligro" data-act="echar" data-pid="${pid}">Sacar</button>` : ''}
        </li>`).join('')}
    </ul>
    ${n < 5 ? `<p class="nota">Faltan ${5 - n} para arrancar (mínimo 5, máximo 10).</p>` : ''}
    ${soyHost
      ? `<button class="btn grande primario" data-act="empezar" ${n < 5 || n > 10 ? 'disabled' : ''}>¡Largar la campaña!</button>`
      : `<p class="nota">Esperando que ${esc(nombre(p.host))} largue la campaña…</p>`}
    <button class="btn link" data-act="salir">Salir de la sala</button>
  `;
}

// ------------------------------------------------------------------ Juego

function pantallaJuego() {
  const g = st.pub.game;
  if (!g) return;
  detectarNovedades(g);
  const yo = st.pid;
  const vivo = g.alive[yo];
  const terminado = g.phase === 'ended';
  $app.className = 'juego';
  $app.innerHTML = `
    <header class="barra">
      ${A.logoChico()}
      <span class="codigo-mini">Sala ${st.code}</span>
      <button class="btn icono" data-act="modal" data-m="rol" aria-label="Mi rol">🪪</button>
      <button class="btn icono" data-act="modal" data-m="historial" aria-label="Historial">🗂️</button>
      <button class="btn icono" data-act="modal" data-m="menu" aria-label="Menú">☰</button>
    </header>
    ${!vivo && !terminado ? `<div class="aviso fantasma">👻 Te hicieron un Carpetazo. Ya no votás ni hablás: mirá en silencio.</div>` : ''}
    ${terminado ? pantallaFinal(g) : ''}
    <section class="accion">${terminado ? '' : panelAccion(g)}</section>
    ${tablero(g)}
    ${filaJugadores(g)}
    <section class="cronica">
      <h3>📰 Último momento</h3>
      <ul>${lista(g.log).slice(-6).reverse().map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    </section>
  `;
  dibujarModal();
  if (!st.rolVisto && st.priv && st.priv.role && !terminado) {
    st.rolVisto = true;
    st.modal = 'rol';
    dibujarModal();
  }
}

function filaJugadores(g) {
  return `<section class="jugadores">
    ${lista(g.order).map((pid) => {
      const cls = [
        'jug',
        !g.alive[pid] ? 'muerto' : '',
        pid === st.pid ? 'yo' : '',
        st.presence[pid] ? '' : 'offline',
      ].join(' ');
      const marcas = [];
      if (pid === g.candidate && ['nominate', 'vote'].includes(g.phase)) marcas.push(`<span class="marca jefe" title="Candidato a Jefe">${A.credencial(true)}</span>`);
      if (pid === g.nominee && g.phase === 'vote') marcas.push(`<span class="marca vocero" title="Candidato a Vocero">${A.microfono(true)}</span>`);
      if (pid === g.chief && g.chief && g.phase !== 'nominate' && g.phase !== 'vote') marcas.push(`<span class="marca jefe" title="Jefe de Campaña">${A.credencial()}</span>`);
      if (pid === g.vocero && g.vocero && g.phase !== 'nominate' && g.phase !== 'vote') marcas.push(`<span class="marca vocero" title="Vocero">${A.microfono()}</span>`);
      const voto = g.phase === 'vote' && g.alive[pid] ? (g.voted && g.voted[pid] ? '<span class="voto-ok">✔ votó</span>' : '<span class="voto-esp">…</span>') : '';
      const limite = (pid === g.lastChief || pid === g.lastVocero) && g.phase === 'nominate' ? '<span class="limite">no elegible</span>' : '';
      const rev = g.reveal ? `<span class="rol-final ${g.reveal[pid]}">${esc(T.ROLES[g.reveal[pid]].titulo)}</span>` : '';
      return `<div class="${cls}">
        <div class="cara">${A.avatar(nombre(pid))}${marcas.join('')}</div>
        <div class="nom">${esc(nombre(pid))}</div>
        ${voto}${limite}${rev}
        ${!g.alive[pid] ? '<div class="sello-out">CARPETAZO</div>' : ''}
      </div>`;
    }).join('')}
  </section>`;
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
      if (g.chief !== yo) return esperando(`El Vocero pidió <b>VETO</b>. <b>${esc(nombre(g.chief))}</b> decide.`);
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
    ${A.titularFinal(ganoCampana)}
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
  // Urna: cuando se abre una votación nueva.
  const lv = g.lastVote;
  const claveVoto = lv ? lv.round + '-' + lv.yes + '-' + lv.no : null;
  if (st.ultimoVoto === null) st.ultimoVoto = claveVoto || '';
  else if (claveVoto && claveVoto !== st.ultimoVoto) {
    st.ultimoVoto = claveVoto;
    animarUrna(lv);
  }
  // Publicaciones.
  const cuenta = g.proposals + '-' + g.scandals;
  if (st.ultimaCuenta === null) st.ultimaCuenta = cuenta;
  else if (cuenta !== st.ultimaCuenta) {
    const [p0, e0] = st.ultimaCuenta.split('-').map(Number);
    st.ultimaCuenta = cuenta;
    const caos = g.event && g.event.type === 'chaos';
    if (g.proposals > p0) mostrarPublicacion('P', g.proposals - 1, caos);
    else if (g.scandals > e0) mostrarPublicacion('E', g.scandals - 1, caos);
  }
  // Eventos sueltos (veto, carpetazo).
  const ev = g.event && g.event.id;
  if (st.ultimoEvento === null) st.ultimoEvento = ev;
  else if (ev !== st.ultimoEvento) {
    st.ultimoEvento = ev;
    if (g.event.type === 'veto') toast('¡VETADO! Las dos cartas fueron a La Trituradora.');
    if (g.event.type === 'carpetazo') toast('¡Carpetazo a ' + nombre(g.event.target) + '!', 'error');
  }
  // Resultado de encuesta (solo lo ve quien encuestó).
  const enc = st.priv && st.priv.lastSurvey;
  if (st.ultimaEncuesta === null) st.ultimaEncuesta = enc || '';
  else if (enc && enc !== st.ultimaEncuesta) {
    st.ultimaEncuesta = enc;
    st.modal = 'encuesta';
  }
}

function capa(html, clase, ms) {
  const c = document.createElement('div');
  c.className = 'capa ' + clase;
  c.innerHTML = html;
  document.body.appendChild(c);
  const cerrar = () => { c.classList.add('fuera'); setTimeout(() => c.remove(), 400); };
  c.addEventListener('click', cerrar);
  if (ms) setTimeout(cerrar, ms);
  return c;
}

function animarUrna(lv) {
  const votos = lv.votes || {};
  const html = `<div class="urna-escena">
    ${A.urna()}
    <h2 class="resultado ${lv.approved ? 'si' : 'no'}">${lv.approved ? '¡Ganó el Sí!' : 'Ganó el No'} <small>${lv.yes} a ${lv.no}</small></h2>
    <div class="boletas-abiertas">
      ${Object.keys(votos).map((pid, i) => `<div class="bol ${votos[pid] ? 'si' : 'no'}" style="--i:${i}">
        <div class="dorso">${A.sobre()}</div>
        <div class="frente">${votos[pid] ? '¡Sí!' : '¡No!'}</div>
        <span>${esc(nombre(pid))}</span>
      </div>`).join('')}
    </div>
    <p class="nota">Tocá para cerrar</p>
  </div>`;
  capa(html, 'urna-capa', 7000);
}

function mostrarPublicacion(tipo, idx, caos) {
  const html = `<div class="publicacion ${tipo === 'P' ? 'prop' : 'esc'}">
    ${caos ? '<div class="cacerolazo">¡Cacerolazo! El pueblo publicó sin poderes</div>' : ''}
    ${tipo === 'P' ? A.volante(T.PROPUESTAS[idx % T.PROPUESTAS.length], idx, true) : A.titular(T.ESCANDALOS[idx % T.ESCANDALOS.length], true)}
    <p>${tipo === 'P' ? '¡Nueva Propuesta publicada!' : '¡Nuevo Escándalo en la tapa!'}</p>
  </div>`;
  // Si la urna está abierta, esperamos a que termine.
  const demora = document.querySelector('.urna-capa') ? 4200 : 0;
  setTimeout(() => capa(html, 'pub-capa', 3500), demora);
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
        ${pin ? `<div class="pin-box">Tu <b>clave de regreso</b>: <strong>${esc(pin)}</strong><small>Si se te rompe el celu o cambiás de navegador, entrá con tu mismo apodo, el código ${st.code} y esta clave. No se la muestres a nadie.</small></div>` : ''}`;
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
      ${Object.keys(votos).length ? `<div class="votos">${Object.keys(votos).map((p) => `<span class="${votos[p] ? 'si' : 'no'}">${esc(nombre(p))} ${votos[p] ? 'Sí' : 'No'}</span>`).join('')}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ------------------------------------------------------------------ Botones

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  const d = b.dataset;

  if (d.confirm && !confirm(d.confirm)) return;

  switch (act) {
    case 'cantidad':
      document.querySelectorAll('.cant').forEach((x) => x.classList.toggle('elegida', x === b));
      break;
    case 'practicar': {
      const name = apodo();
      if (!name) return;
      const n = Number((document.querySelector('.cant.elegida') || {}).dataset?.n || 7);
      Object.assign(st, { code: 'BOTS', pid: 'p1' });
      Practica.iniciar(name, n, (e) => {
        st.pub = e.pub;
        st.priv = e.priv;
        st.presence = e.presence;
        dibujar();
      });
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
      const pin = (document.getElementById('pin') || {}).value || null;
      const r = await pedir({ op: 'join', code, name, pin });
      if (r) entrarASala(r.code);
      break;
    }
    case 'compartir': {
      const link = d.link;
      if (navigator.share) {
        navigator.share({ title: 'BALLOTAGE', text: 'Sumate a mi campaña en BALLOTAGE. Código: ' + st.code, url: link }).catch(() => {});
      } else {
        try { await navigator.clipboard.writeText(link); toast('¡Link copiado!'); } catch { prompt('Copiá este link:', link); }
      }
      break;
    }
    case 'empezar': jugar({ type: 'start' }); break;
    case 'echar':
      if (confirm('¿Sacar a ' + nombre(d.pid) + ' de la sala?')) jugar({ type: 'kick', target: d.pid });
      break;
    case 'salir':
      if (PRACTICA) { salirDeSala(); break; }
      if (confirm('¿Salir de la sala?')) {
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
      if (confirm('¿Mandás esta carta a La Trituradora?')) jugar({ type: 'chiefDiscard', index: Number(d.i) });
      break;
    case 'descVoc':
      if (confirm('¿Triturás esta carta y publicás la otra?')) jugar({ type: 'voceroDiscard', index: Number(d.i) });
      break;
    case 'pedirVeto':
      if (confirm('¿Proponer VETO al Jefe de Campaña?')) jugar({ type: 'vetoRequest' });
      break;
    case 'veto': jugar({ type: 'vetoReply', accept: d.v === '1' }); break;
    case 'poder': jugar({ type: 'power', target: d.pid || null }); break;
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
  fb.onAuthStateChanged(auth, (u) => {
    if (!u) {
      fb.signInAnonymously(auth).catch((e) => {
        $app.innerHTML = `<div class="aviso">No me pude conectar: ${esc(e.message)}</div>`;
      });
      return;
    }
    if (st.uid === u.uid) return;
    st.uid = u.uid;
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
