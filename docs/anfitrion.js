// Modo gratis: el árbitro corre en el celular del anfitrión.
//
// Con el plan gratuito de Firebase no hay programas en el servidor, así que
// el celular que crea la sala hace de árbitro: guarda el mazo y los roles en
// un cajón que solo él puede leer, recibe los pedidos de los demás por un
// "buzón" y les contesta. Los otros jugadores siguen viendo solo lo suyo.
// Mientras el anfitrión tenga el juego cerrado, la partida queda en pausa.

import './motor.js';

const E = globalThis.BallotageEngine;
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O para no confundir
const ESPERA_MS = 12000;

let fb = null; // funciones de firebase-database
let db = null;
let ahora = () => Date.now();
let uidActual = null;
const salas = {}; // código -> { S, cola, off }

export function iniciar(opciones) {
  fb = opciones.fb;
  db = opciones.db;
  ahora = opciones.ahora || ahora;
}

export function usuario(uid) {
  uidActual = uid;
}

const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const clonar = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));
const ref = (ruta) => fb.ref(db, ruta);

function codigoNuevo() {
  let c = '';
  for (let i = 0; i < 4; i++) c += LETRAS[rnd(LETRAS.length)];
  return c;
}

// Devuelve { data } como lo haría el árbitro del servidor, o tira un Error.
export async function pedir(datos, email) {
  if (datos.op === 'create') return { data: await crear(datos.name, email) };
  const code = String(datos.code || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) throw new Error('El código de sala tiene 4 letras.');
  const anfitrion = (await fb.get(ref('rooms/' + code + '/hostUid'))).val();
  if (!anfitrion) throw new Error('No existe una sala con ese código.');
  const pedido = Object.assign({ uid: uidActual, email }, datos, { code });
  if (anfitrion === uidActual) {
    await asegurarArbitro(code);
    return { data: resultado(await procesar(code, pedido)) };
  }
  return { data: resultado(await porBuzon(code, pedido)) };
}

function resultado(r) {
  if (r && r.error) throw new Error(r.error);
  return r;
}

async function crear(nombre, email) {
  const name = E.limpiarNombre(nombre);
  for (let intento = 0; intento < 20; intento++) {
    const code = codigoNuevo();
    const t = await fb.runTransaction(ref('rooms/' + code + '/hostUid'), (actual) => (actual === null ? uidActual : undefined));
    if (!t.committed) continue;
    const S = E.crearSala(code, uidActual, name, ahora());
    S.emails = { p1: email || '' };
    await escribir(code, S);
    salas[code] = { S, cola: Promise.resolve() };
    escucharBuzon(code);
    return { code, pid: 'p1' };
  }
  throw new Error('No pude generar un código. Probá de nuevo.');
}

// Si este celular es el anfitrión de la sala, arranca (o retoma) el árbitro.
export async function asegurarArbitro(code) {
  if (salas[code]) return true;
  const anfitrion = (await fb.get(ref('rooms/' + code + '/hostUid'))).val();
  if (anfitrion !== uidActual) return false;
  const snap = (await fb.get(ref('rooms/' + code))).val() || {};
  if (!snap.pub) return false;
  salas[code] = {
    S: { auth: snap.auth || {}, pub: snap.pub, priv: snap.priv || {}, sec: snap.hostsec || null, emails: snap.emails || {} },
    cola: Promise.resolve(),
  };
  escucharBuzon(code);
  return true;
}

export function detener() {
  for (const code of Object.keys(salas)) {
    if (salas[code].off) salas[code].off();
    delete salas[code];
  }
}

function escucharBuzon(code) {
  const sala = salas[code];
  sala.off = fb.onChildAdded(ref('rooms/' + code + '/inbox'), async (snap) => {
    const pedido = snap.val() || {};
    const r = await procesar(code, pedido);
    if (!salas[code]) return; // la sala se cerró
    const respuesta = clonar(r) || { ok: true };
    await fb.set(ref('rooms/' + code + '/replies/' + pedido.uid + '/' + snap.key), respuesta).catch(() => {});
    await fb.remove(snap.ref).catch(() => {});
  });
}

async function escribir(code, S) {
  await fb.update(ref('rooms/' + code), clonar({
    pub: S.pub,
    auth: S.auth || null,
    priv: S.priv || null,
    hostsec: S.sec || null,
    emails: S.emails || null,
  }));
}

// Aplica un pedido. Los pedidos se atienden de a uno, en orden de llegada.
function procesar(code, pedido) {
  const sala = salas[code];
  if (!sala) return Promise.resolve({ error: 'La sala se cerró.' });
  const tarea = async () => {
    const T = clonar(sala.S);
    const t = ahora();
    try {
      let r;
      if (pedido.op === 'join') {
        const name = E.limpiarNombre(pedido.name);
        T.pub.lastActivity = t;
        const pid = E.unirse(T, pedido.uid, name, pedido.pin, t);
        T.emails = Object.assign({}, T.emails, { [pid]: pedido.email || '' });
        r = { code, pid };
      } else if (pedido.op === 'act') {
        const pid = T.auth && T.auth[pedido.uid];
        if (!pid) throw new E.ErrorJuego('No estás en esta sala.');
        const action = pedido.action || {};
        if (action.type === 'leave' && pedido.uid === uidActual) {
          // Si se va el anfitrión, se cierra la sala (él era el árbitro).
          E.aplicar(T, pid, { type: 'leave' }, rnd, t); // valida que sea en la sala de espera
          if (sala.off) sala.off();
          delete salas[code];
          await fb.set(ref('rooms/' + code), null);
          return { ok: true };
        }
        E.aplicar(T, pid, action, rnd, t);
        T.pub.lastActivity = t;
        r = { ok: true };
      } else {
        throw new E.ErrorJuego('Pedido desconocido.');
      }
      sala.S = T;
      await escribir(code, T);
      return r;
    } catch (e) {
      if (e instanceof E.ErrorJuego) return { error: e.message };
      console.error(e);
      return { error: 'Algo falló. Probá de nuevo.' };
    }
  };
  sala.cola = sala.cola.then(tarea, tarea);
  return sala.cola;
}

// Pedido de un jugador que no es el anfitrión: lo deja en el buzón y espera.
function porBuzon(code, pedido) {
  return new Promise((resolver, rechazar) => {
    const item = fb.push(ref('rooms/' + code + '/inbox'));
    const rutaResp = 'rooms/' + code + '/replies/' + uidActual + '/' + item.key;
    let off = null;
    const reloj = setTimeout(() => {
      if (off) off();
      rechazar(new Error('El anfitrión no responde: tiene que tener el juego abierto en su celular.'));
    }, ESPERA_MS);
    off = fb.onValue(ref(rutaResp), (s) => {
      const r = s.val();
      if (!r) return;
      clearTimeout(reloj);
      off();
      fb.remove(ref(rutaResp)).catch(() => {});
      resolver(r);
    }, () => {});
    fb.set(item, clonar(Object.assign({}, pedido, { t: Date.now() }))).catch((e) => {
      clearTimeout(reloj);
      if (off) off();
      rechazar(new Error('No pude mandar el pedido: ' + e.message));
    });
  });
}
