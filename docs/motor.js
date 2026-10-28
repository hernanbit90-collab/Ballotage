// Reglamento de BALLOTAGE. (docs/motor.js es una copia exacta: si cambiás
// este archivo, copialo también allá; la prueba automática lo controla.)
// Funciones puras: reciben el estado de una sala,
// aplican una jugada y devuelven el estado nuevo. No sabe nada de Firebase,
// así se puede probar con miles de partidas simuladas.
//
// Estado de una sala:
//   auth:     { [uidFirebase]: pid }            -> quién es quién
//   pub:      lo que ven todos los de la sala
//   priv:     { [pid]: datos privados }         -> solo lo lee ese jugador
//   sec:      mazo, roles, votos sin abrir      -> no lo lee nadie
//   presence: { [pid]: bool }                    -> lo escribe cada celular

'use strict';

const ROLES = { CAMPANA: 'campana', OPERADOR: 'operador', TOPO: 'topo' };
const BANDOS = { CAMPANA: 'campana', OPERADORES: 'operadores' };
const CARTAS = { PROPUESTA: 'P', ESCANDALO: 'E' };
const PODERES = {
  ENCUESTA: 'encuesta',
  CARPETA: 'carpeta',
  BAJADA: 'bajada',
  CARPETAZO: 'carpetazo',
};

const MIN_JUGADORES = 5;
const MAX_JUGADORES = 10;
const PROPUESTAS_PARA_GANAR = 5;
const ESCANDALOS_PARA_GANAR = 6;
const ESCANDALOS_ZONA_ROJA = 3;
const ESCANDALOS_VETO = 5;
const CRISIS_MAX = 3;

// Debate: segundos que tiene cada jugador para hablar antes de votar.
const DEBATE_OPCIONES = [0, 15, 30, 45, 60, 90];
const DEBATE_POR_DEFECTO = 30;
const TOLERANCIA_MS = 1500; // por diferencias de reloj entre celulares

// Cantidad de operadores (sin contar al Topo) según jugadores.
const OPERADORES_POR_CANTIDAD = { 5: 1, 6: 1, 7: 2, 8: 2, 9: 3, 10: 3 };

// Poder que activa cada Escándalo (posición 1 a 6). null = ninguno.
function tableroEscandalos(n) {
  if (n <= 6) return [null, null, PODERES.CARPETA, PODERES.CARPETAZO, PODERES.CARPETAZO, null];
  if (n <= 8) return [null, PODERES.ENCUESTA, PODERES.BAJADA, PODERES.CARPETAZO, PODERES.CARPETAZO, null];
  return [PODERES.ENCUESTA, PODERES.ENCUESTA, PODERES.BAJADA, PODERES.CARPETAZO, PODERES.CARPETAZO, null];
}

class ErrorJuego extends Error {}
function exigir(cond, msg) {
  if (!cond) throw new ErrorJuego(msg);
}

function mezclar(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nuevoMazo(rnd) {
  const cartas = [];
  for (let i = 0; i < 6; i++) cartas.push(CARTAS.PROPUESTA);
  for (let i = 0; i < 11; i++) cartas.push(CARTAS.ESCANDALO);
  return mezclar(cartas, rnd);
}

function bandoDe(rol) {
  return rol === ROLES.CAMPANA ? BANDOS.CAMPANA : BANDOS.OPERADORES;
}

// Firebase no guarda arrays vacíos ni objetos vacíos: los normalizamos.
const lista = (x) => (Array.isArray(x) ? x : x ? Object.values(x) : []);
const objeto = (x) => x || {};

function nombre(S, pid) {
  return (S.pub.players[pid] && S.pub.players[pid].name) || '¿?';
}

function log(S, texto) {
  const g = S.pub.game;
  g.log = lista(g.log);
  g.log.push(texto);
  if (g.log.length > 30) g.log = g.log.slice(-30);
}

function vivos(S) {
  const g = S.pub.game;
  return lista(g.order).filter((pid) => g.alive[pid]);
}

// ---------------------------------------------------------------- Salas

function crearSala(code, uid, name, ahora) {
  return {
    auth: { [uid]: 'p1' },
    pub: {
      code,
      status: 'lobby',
      host: 'p1',
      nextPid: 2,
      createdAt: ahora,
      players: { p1: { name, joinedAt: ahora } },
      settings: { debate: DEBATE_POR_DEFECTO, declare: true },
    },
    priv: { p1: { pin: null } },
  };
}

function limpiarNombre(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  exigir(n.length >= 1, 'Poné un apodo.');
  return n;
}

// Devuelve el pid con el que quedó el jugador.
function unirse(S, uid, name, pin, ahora) {
  S.auth = objeto(S.auth);
  S.priv = objeto(S.priv);
  const ya = S.auth[uid];
  if (ya && S.pub.players[ya]) return ya; // ya estaba: reconexión normal

  const pids = Object.keys(S.pub.players);
  const mismo = pids.find((p) => S.pub.players[p].name.toLowerCase() === name.toLowerCase());

  if (S.pub.status !== 'lobby') {
    // Partida empezada: solo se puede volver con apodo + clave de regreso.
    exigir(mismo, 'La partida ya empezó. Solo pueden volver los que estaban.');
    exigir(pin && S.priv[mismo] && String(S.priv[mismo].pin) === String(pin).trim(),
      'Para volver desde otro celular necesitás tu clave de regreso (la ves en el menú de tu celular viejo).');
    for (const u of Object.keys(S.auth)) if (S.auth[u] === mismo) delete S.auth[u];
    S.auth[uid] = mismo;
    return mismo;
  }

  exigir(!mismo, 'Ya hay alguien con ese apodo en la sala. Elegí otro.');
  exigir(pids.length < MAX_JUGADORES, 'La sala está llena (máximo 10).');
  const pid = 'p' + S.pub.nextPid;
  S.pub.nextPid += 1;
  S.pub.players[pid] = { name, joinedAt: ahora };
  S.auth[uid] = pid;
  S.priv[pid] = { pin: null };
  return pid;
}

function salir(S, pid) {
  exigir(S.pub.status === 'lobby', 'No podés abandonar en plena campaña.');
  delete S.pub.players[pid];
  for (const u of Object.keys(objeto(S.auth))) if (S.auth[u] === pid) delete S.auth[u];
  if (S.priv) delete S.priv[pid];
  if (S.presence) delete S.presence[pid];
  if (S.pub.host === pid) {
    const resto = Object.keys(S.pub.players).sort((a, b) => S.pub.players[a].joinedAt - S.pub.players[b].joinedAt);
    S.pub.host = resto[0] || null;
  }
}

function echar(S, pid, objetivo) {
  exigir(S.pub.host === pid, 'Solo el anfitrión puede sacar gente.');
  exigir(objetivo !== pid, 'No te podés echar a vos.');
  exigir(S.pub.players[objetivo], 'Ese jugador no está.');
  salir(S, objetivo);
}

function ajustes(S, pid, a) {
  exigir(S.pub.host === pid, 'Solo el anfitrión cambia la configuración.');
  exigir(S.pub.status === 'lobby', 'La configuración se cambia antes de empezar.');
  const actual = config(S);
  if (a.debate !== undefined) {
    exigir(DEBATE_OPCIONES.includes(a.debate), 'Tiempo de debate inválido.');
    actual.debate = a.debate;
  }
  if (a.declare !== undefined) actual.declare = !!a.declare;
  S.pub.settings = actual;
}

function config(S) {
  const c = S.pub.settings || {};
  return {
    debate: DEBATE_OPCIONES.includes(c.debate) ? c.debate : DEBATE_POR_DEFECTO,
    declare: c.declare !== false,
  };
}

// ---------------------------------------------------------------- Inicio

function empezar(S, pid, rnd) {
  exigir(S.pub.host === pid, 'Solo el anfitrión puede iniciar.');
  exigir(S.pub.status === 'lobby', 'La partida ya empezó.');
  const pids = Object.keys(S.pub.players);
  const n = pids.length;
  exigir(n >= MIN_JUGADORES && n <= MAX_JUGADORES, 'Hacen falta entre 5 y 10 jugadores.');

  const order = mezclar(pids, rnd);
  const roles = {};
  const repartido = mezclar(pids, rnd);
  const nOp = OPERADORES_POR_CANTIDAD[n];
  repartido.forEach((p, i) => {
    roles[p] = i === 0 ? ROLES.TOPO : i <= nOp ? ROLES.OPERADOR : ROLES.CAMPANA;
  });
  const topo = repartido[0];
  const operadores = repartido.slice(1, 1 + nOp);

  S.priv = {};
  for (const p of pids) {
    const priv = {
      role: roles[p],
      side: bandoDe(roles[p]),
      pin: String(1000 + rnd(9000)),
      allies: null,
    };
    if (roles[p] === ROLES.OPERADOR) {
      priv.allies = { topo, operadores: operadores.filter((o) => o !== p) };
    } else if (roles[p] === ROLES.TOPO && n <= 6) {
      priv.allies = { topo: null, operadores };
    }
    S.priv[p] = priv;
  }

  const alive = {};
  for (const p of pids) alive[p] = true;
  const inicio = rnd(n);

  S.sec = { deck: nuevoMazo(rnd), discard: [], roles, votes: {}, hand: [] };
  S.pub.status = 'playing';
  S.pub.game = {
    n,
    order,
    alive,
    board: tableroEscandalos(n).map((x) => x || ''),
    rotation: inicio,
    special: '',
    candidate: order[inicio],
    nominee: '',
    chief: '',
    vocero: '',
    lastChief: '',
    lastVocero: '',
    crisis: 0,
    proposals: 0,
    scandals: 0,
    deckCount: 17,
    discardCount: 0,
    phase: 'nominate',
    voted: {},
    lastVote: null,
    vetoDenied: false,
    power: '',
    investigated: {},
    round: 1,
    history: [],
    log: [],
    winner: '',
    winReason: '',
    reveal: null,
    eventId: 0,
    events: [],
  };
  log(S, '¡Arrancó la campaña! Primer candidato a Jefe de Campaña: ' + nombre(S, order[inicio]) + '.');
}

// ---------------------------------------------------------------- Ayudas de ronda

// Cada cosa que pasa queda en una lista (no se pisan entre sí), para que los
// celulares muestren todas las animaciones y avisos en orden.
function evento(S, type, extra) {
  const g = S.pub.game;
  g.eventId = (g.eventId || 0) + 1;
  g.events = lista(g.events).concat([Object.assign({ id: g.eventId, type }, extra || {})]).slice(-12);
}

function rondaActual(S) {
  const g = S.pub.game;
  g.history = lista(g.history);
  return g.history[g.history.length - 1];
}

function siguienteVivo(S, idx) {
  const g = S.pub.game;
  const order = lista(g.order);
  for (let k = 1; k <= order.length; k++) {
    const j = (idx + k) % order.length;
    if (g.alive[order[j]]) return j;
  }
  return idx;
}

function siguienteRonda(S) {
  const g = S.pub.game;
  if (g.phase === 'ended') return;
  if (g.special) {
    g.candidate = g.special;
    g.special = '';
  } else {
    g.rotation = siguienteVivo(S, g.rotation);
    g.candidate = lista(g.order)[g.rotation];
  }
  g.nominee = '';
  g.chief = '';
  g.vocero = '';
  g.voted = {};
  g.power = '';
  g.pendingPower = '';
  g.debate = null;
  g.vetoDenied = false;
  g.phase = 'nominate';
  g.round += 1;
  S.sec.votes = {};
  S.sec.hand = [];
  for (const p of Object.keys(S.priv)) S.priv[p].hand = null;
}

function rearmarMazo(S, rnd) {
  S.sec.deck = lista(S.sec.deck);
  S.sec.discard = lista(S.sec.discard);
  if (S.sec.deck.length < 3) {
    S.sec.deck = mezclar(S.sec.deck.concat(S.sec.discard), rnd);
    S.sec.discard = [];
    log(S, 'Se vació la Mesa de Entradas: se rearmó el mazo con lo que había en La Trituradora.');
  }
  S.pub.game.deckCount = S.sec.deck.length;
  S.pub.game.discardCount = S.sec.discard.length;
}

function terminar(S, winner, reason) {
  const g = S.pub.game;
  g.phase = 'ended';
  g.winner = winner;
  g.winReason = reason;
  g.reveal = Object.assign({}, S.sec.roles);
  S.pub.status = 'ended';
  for (const p of Object.keys(S.priv)) S.priv[p].hand = null;
  evento(S, 'end', { winner });
  log(S, winner === BANDOS.CAMPANA ? '¡Ganó el Equipo de Campaña!' : '¡Ganaron los Operadores del Rival!');
}

// Publica una carta. Devuelve el poder que se activa (o '').
function publicar(S, carta, conPoderes, rnd) {
  const g = S.pub.game;
  let poder = '';
  if (carta === CARTAS.PROPUESTA) {
    g.proposals += 1;
    log(S, 'Se publicó una Propuesta. Van ' + g.proposals + ' de 5.');
  } else {
    g.scandals += 1;
    log(S, 'Se publicó un Escándalo. Van ' + g.scandals + ' de 6.');
    if (conPoderes) poder = lista(g.board)[g.scandals - 1] || '';
  }
  g.crisis = 0;
  rearmarMazo(S, rnd);
  if (g.proposals >= PROPUESTAS_PARA_GANAR) {
    terminar(S, BANDOS.CAMPANA, '¡Ganamos en primera vuelta! Se publicaron 5 Propuestas.');
    return '';
  }
  if (g.scandals >= ESCANDALOS_PARA_GANAR) {
    terminar(S, BANDOS.OPERADORES, 'Seis Escándalos en la tapa: la campaña se hundió.');
    return '';
  }
  return poder;
}

// Avanza el contador de Crisis. Si llega a 3, el pueblo enojado publica.
function avanzarCrisis(S, rnd) {
  const g = S.pub.game;
  g.crisis += 1;
  if (g.crisis < CRISIS_MAX) return;
  S.sec.deck = lista(S.sec.deck);
  const carta = S.sec.deck.shift();
  log(S, '¡Cacerolazo! El pueblo enojado publicó la carta de arriba de la Mesa de Entradas.');
  const r = rondaActual(S);
  if (r) {
    r.chaos = true;
    r.published = carta;
  }
  evento(S, 'chaos', { card: carta, n: carta === CARTAS.PROPUESTA ? g.proposals + 1 : g.scandals + 1 });
  publicar(S, carta, false, rnd);
  g.lastChief = '';
  g.lastVocero = '';
}

function puedeSerVocero(S, pid) {
  const g = S.pub.game;
  if (!g.alive[pid] || pid === g.candidate) return false;
  if (pid === g.lastVocero) return false;
  if (pid === g.lastChief && vivos(S).length > 5) return false;
  return true;
}

// ---------------------------------------------------------------- Jugadas

function nominar(S, pid, objetivo, ahora) {
  const g = S.pub.game;
  exigir(g.phase === 'nominate', 'No es momento de nominar.');
  exigir(g.candidate === pid, 'No sos el Candidato a Jefe de Campaña.');
  exigir(S.pub.players[objetivo], 'Ese jugador no existe.');
  exigir(puedeSerVocero(S, objetivo), 'Esa persona no puede ser Vocero en esta ronda.');
  g.nominee = objetivo;
  g.history = lista(g.history);
  g.history.push({ round: g.round, candidate: pid, nominee: objetivo });
  const segs = config(S).debate;
  if (!segs) {
    log(S, nombre(S, pid) + ' propone a ' + nombre(S, objetivo) + ' como Vocero. ¡A votar!');
    abrirVotacion(S);
    return;
  }
  // Hablan primero los de la fórmula y después el resto, en orden de mesa.
  const order = lista(g.order);
  const desde = order.indexOf(pid);
  const resto = [];
  for (let k = 1; k < order.length; k++) {
    const p = order[(desde + k) % order.length];
    if (g.alive[p] && p !== objetivo) resto.push(p);
  }
  g.debate = { order: [pid, objetivo].concat(resto), idx: 0, secs: segs, turnEnd: ahora + segs * 1000 };
  g.phase = 'debate';
  log(S, nombre(S, pid) + ' propone a ' + nombre(S, objetivo) + ' como Vocero. ¡Arranca el debate!');
}

function abrirVotacion(S) {
  const g = S.pub.game;
  g.debate = null;
  g.phase = 'vote';
  g.voted = {};
  S.sec.votes = {};
}

// Pasa la palabra al siguiente orador. Lo puede hacer quien está hablando,
// el anfitrión, o cualquiera cuando se terminó el tiempo. `idx` evita que dos
// celulares salteen dos oradores a la vez.
function pasarPalabra(S, pid, a, ahora) {
  const g = S.pub.game;
  exigir(g.phase === 'debate', 'No hay debate en curso.');
  const d = g.debate;
  if (a.all) {
    exigir(S.pub.host === pid, 'Solo el anfitrión puede cortar el debate.');
    log(S, 'El anfitrión cortó el debate. ¡A votar!');
    abrirVotacion(S);
    return;
  }
  if (a.idx !== undefined && a.idx !== d.idx) return; // ya lo pasó otro
  const orden = lista(d.order);
  const habla = orden[d.idx];
  exigir(pid === habla || pid === S.pub.host || ahora >= d.turnEnd - TOLERANCIA_MS,
    'Todavía está hablando ' + nombre(S, habla) + '.');
  d.idx += 1;
  if (d.idx >= orden.length) {
    log(S, 'Terminó el debate. ¡A votar!');
    abrirVotacion(S);
    return;
  }
  d.turnEnd = ahora + d.secs * 1000;
}

function votar(S, pid, voto, rnd) {
  const g = S.pub.game;
  exigir(g.phase === 'vote', 'No hay votación abierta.');
  exigir(g.alive[pid], 'Los eliminados no votan.');
  exigir(typeof voto === 'boolean', 'Voto inválido.');
  S.sec.votes = objeto(S.sec.votes);
  g.voted = objeto(g.voted);
  S.sec.votes[pid] = voto;
  g.voted[pid] = true;

  const electores = vivos(S);
  if (!electores.every((p) => S.sec.votes[p] !== undefined)) return;

  // Se abren todas las boletas juntas.
  const votos = {};
  let si = 0;
  for (const p of electores) {
    votos[p] = S.sec.votes[p];
    if (votos[p]) si += 1;
  }
  const aprobado = si > electores.length / 2;
  g.lastVote = { round: g.round, votes: votos, yes: si, no: electores.length - si, approved: aprobado };
  const r = rondaActual(S);
  r.votes = votos;
  r.approved = aprobado;
  S.sec.votes = {};
  evento(S, 'vote', { approved: aprobado });

  if (!aprobado) {
    log(S, 'Ganó el ¡No! (' + si + ' a ' + (electores.length - si) + '). El cargo pasa al siguiente.');
    avanzarCrisis(S, rnd);
    siguienteRonda(S);
    return;
  }

  log(S, 'Ganó el ¡Sí! (' + si + ' a ' + (electores.length - si) + '). ' +
    nombre(S, g.candidate) + ' es Jefe de Campaña y ' + nombre(S, g.nominee) + ' es Vocero.');
  g.chief = g.candidate;
  g.vocero = g.nominee;
  g.lastChief = g.chief;
  g.lastVocero = g.vocero;
  g.crisis = 0;

  if (g.scandals >= ESCANDALOS_ZONA_ROJA && S.sec.roles[g.vocero] === ROLES.TOPO) {
    terminar(S, BANDOS.OPERADORES, 'Zona roja: ¡El Topo fue elegido Vocero después del 3.er Escándalo!');
    return;
  }

  S.sec.deck = lista(S.sec.deck);
  const mano = S.sec.deck.splice(0, 3);
  S.sec.hand = mano;
  S.priv[g.chief].hand = mano;
  g.deckCount = S.sec.deck.length;
  g.phase = 'chiefDiscard';
}

function descartarJefe(S, pid, idx) {
  const g = S.pub.game;
  exigir(g.phase === 'chiefDiscard', 'No es momento de descartar.');
  exigir(g.chief === pid, 'No sos el Jefe de Campaña.');
  const mano = lista(S.sec.hand);
  exigir(Number.isInteger(idx) && idx >= 0 && idx < mano.length, 'Elegí una carta.');
  const [tirada] = mano.splice(idx, 1);
  S.sec.discard = lista(S.sec.discard);
  S.sec.discard.push(tirada);
  S.sec.hand = mano;
  S.priv[g.chief].hand = null;
  S.priv[g.vocero].hand = mano;
  g.discardCount = S.sec.discard.length;
  g.phase = 'voceroDiscard';
  log(S, nombre(S, pid) + ' mandó una carta a La Trituradora y le pasó dos al Vocero.');
}

function descartarVocero(S, pid, idx, rnd) {
  const g = S.pub.game;
  exigir(g.phase === 'voceroDiscard', 'No es momento de publicar.');
  exigir(g.vocero === pid, 'No sos el Vocero.');
  const mano = lista(S.sec.hand);
  exigir(Number.isInteger(idx) && idx >= 0 && idx < mano.length, 'Elegí una carta.');
  const [tirada] = mano.splice(idx, 1);
  const carta = mano[0];
  S.sec.discard = lista(S.sec.discard);
  S.sec.discard.push(tirada);
  S.sec.hand = [];
  S.priv[pid].hand = null;
  const r = rondaActual(S);
  r.published = carta;
  evento(S, 'publish', { card: carta, n: carta === CARTAS.PROPUESTA ? g.proposals + 1 : g.scandals + 1 });
  const poder = publicar(S, carta, true, rnd);
  if (g.phase === 'ended') return;
  if (poder) r.power = poder;
  if (config(S).declare) {
    g.pendingPower = poder;
    g.phase = 'declare';
    r.claims = {};
    log(S, 'Ahora el Jefe y el Vocero cuentan qué cartas les llegaron (pueden mentir).');
    return;
  }
  despuesDePublicar(S, poder);
}

function despuesDePublicar(S, poder) {
  if (poder) activarPoder(S, poder);
  else siguienteRonda(S);
}

// El Jefe cuenta cuántas Propuestas vio entre 3 cartas; el Vocero, entre 2.
function declarar(S, pid, propuestas) {
  const g = S.pub.game;
  exigir(g.phase === 'declare', 'No es momento de declarar.');
  exigir(pid === g.chief || pid === g.vocero, 'Solo declaran el Jefe y el Vocero.');
  const r = rondaActual(S);
  r.claims = objeto(r.claims);
  const cargo = pid === g.chief ? 'chief' : 'vocero';
  exigir(r.claims[cargo] === undefined, 'Ya hiciste tu declaración.');
  const total = cargo === 'chief' ? 3 : 2;
  exigir(Number.isInteger(propuestas) && propuestas >= 0 && propuestas <= total, 'Declaración inválida.');
  r.claims[cargo] = propuestas;
  log(S, nombre(S, pid) + (cargo === 'chief' ? ' (Jefe)' : ' (Vocero)') + ' dice que le llegaron ' +
    propuestas + ' Propuesta' + (propuestas === 1 ? '' : 's') + ' y ' + (total - propuestas) +
    ' Escándalo' + (total - propuestas === 1 ? '' : 's') + '.');
  if (r.claims.chief !== undefined && r.claims.vocero !== undefined) {
    const poder = g.pendingPower;
    g.pendingPower = '';
    despuesDePublicar(S, poder);
  }
}

function pedirVeto(S, pid) {
  const g = S.pub.game;
  exigir(g.phase === 'voceroDiscard', 'No es momento de vetar.');
  exigir(g.vocero === pid, 'Solo el Vocero puede proponer el Veto.');
  exigir(g.scandals >= ESCANDALOS_VETO, 'El Veto se habilita con 5 Escándalos.');
  exigir(!g.vetoDenied, 'El Jefe ya rechazó el Veto: tenés que publicar.');
  g.phase = 'vetoReply';
  log(S, nombre(S, pid) + ' propone VETAR las dos cartas. Decide el Jefe de Campaña.');
}

function responderVeto(S, pid, acepta, rnd) {
  const g = S.pub.game;
  exigir(g.phase === 'vetoReply', 'No hay veto pendiente.');
  exigir(g.chief === pid, 'Solo el Jefe de Campaña responde el Veto.');
  const r = rondaActual(S);
  if (acepta) {
    S.sec.discard = lista(S.sec.discard).concat(lista(S.sec.hand));
    S.sec.hand = [];
    S.priv[g.vocero].hand = null;
    r.veto = true;
    log(S, '¡VETADO! Las dos cartas fueron a La Trituradora.');
    evento(S, 'veto', {});
    rearmarMazo(S, rnd);
    avanzarCrisis(S, rnd);
    siguienteRonda(S);
  } else {
    g.vetoDenied = true;
    g.phase = 'voceroDiscard';
    evento(S, 'vetoDenied', {});
    log(S, 'El Jefe de Campaña rechazó el Veto. El Vocero tiene que publicar una.');
  }
}

const TEXTO_PODER = {
  encuesta: 'Encuesta: el Jefe de Campaña elige a quién encuestar.',
  carpeta: 'Mirar la carpeta: el Jefe de Campaña espía las próximas 3 cartas.',
  bajada: 'Bajada de línea: el Jefe de Campaña elige al próximo candidato.',
  carpetazo: 'Carpetazo: el Jefe de Campaña elige a quién voltear.',
};

function activarPoder(S, poder) {
  const g = S.pub.game;
  g.phase = 'power';
  g.power = poder;
  log(S, '¡Poder activado! ' + TEXTO_PODER[poder]);
  if (poder === PODERES.CARPETA) {
    S.priv[g.chief].peek = lista(S.sec.deck).slice(0, 3);
  }
}

function usarPoder(S, pid, objetivo) {
  const g = S.pub.game;
  exigir(g.phase === 'power', 'No hay poder para usar.');
  exigir(g.chief === pid, 'Solo el Jefe de Campaña usa el poder.');
  const r = rondaActual(S);
  const p = g.power;

  if (p === PODERES.CARPETA) {
    S.priv[pid].peek = null;
    log(S, nombre(S, pid) + ' ya miró la carpeta.');
    evento(S, 'carpeta', { by: pid });
    siguienteRonda(S);
    return;
  }

  exigir(S.pub.players[objetivo] && g.alive[objetivo], 'Elegí a un jugador en carrera.');
  exigir(objetivo !== pid, 'No te podés elegir a vos.');
  r.target = objetivo;

  if (p === PODERES.ENCUESTA) {
    g.investigated = objeto(g.investigated);
    exigir(!g.investigated[objetivo], 'A esa persona ya la encuestaron.');
    g.investigated[objetivo] = true;
    S.priv[pid].surveys = objeto(S.priv[pid].surveys);
    S.priv[pid].surveys[objetivo] = bandoDe(S.sec.roles[objetivo]);
    S.priv[pid].lastSurvey = objetivo;
    log(S, nombre(S, pid) + ' encuestó a ' + nombre(S, objetivo) + '. Solo el Jefe sabe el resultado.');
    evento(S, 'encuesta', { by: pid, target: objetivo });
    siguienteRonda(S);
  } else if (p === PODERES.BAJADA) {
    g.special = objetivo;
    log(S, 'Bajada de línea: ' + nombre(S, objetivo) + ' será el próximo Candidato a Jefe de Campaña.');
    evento(S, 'bajada', { by: pid, target: objetivo });
    siguienteRonda(S);
  } else if (p === PODERES.CARPETAZO) {
    g.alive[objetivo] = false;
    log(S, '¡Carpetazo! ' + nombre(S, objetivo) + ' quedó afuera de la campaña.');
    evento(S, 'carpetazo', { target: objetivo });
    if (S.sec.roles[objetivo] === ROLES.TOPO) {
      terminar(S, BANDOS.CAMPANA, '¡Le hicieron un carpetazo al Topo! Ganó la campaña limpia.');
      return;
    }
    siguienteRonda(S);
  }
}

function revancha(S, pid) {
  exigir(S.pub.host === pid, 'Solo el anfitrión puede armar la revancha.');
  exigir(S.pub.status === 'ended', 'La partida todavía no terminó.');
  S.pub.status = 'lobby';
  S.pub.game = null;
  S.sec = null;
  const priv = {};
  for (const p of Object.keys(S.pub.players)) priv[p] = { pin: null };
  S.priv = priv;
}

// ---------------------------------------------------------------- Despachador

// Aplica una jugada. `a` es { type, ...datos }. `rnd(n)` da un entero en [0, n).
function aplicar(S, pid, a, rnd, ahora) {
  if (ahora === undefined) ahora = Date.now();
  exigir(S.pub.players[pid], 'No estás en esta sala.');
  const enJuego = S.pub.status === 'playing';
  switch (a.type) {
    case 'leave': return salir(S, pid);
    case 'kick': return echar(S, pid, a.target);
    case 'start': return empezar(S, pid, rnd);
    case 'rematch': return revancha(S, pid);
    case 'settings': return ajustes(S, pid, a);
  }
  exigir(enJuego, 'No hay partida en curso.');
  switch (a.type) {
    case 'nominate': return nominar(S, pid, a.target, ahora);
    case 'debateNext': return pasarPalabra(S, pid, a, ahora);
    case 'declare': return declarar(S, pid, a.proposals);
    case 'vote': return votar(S, pid, a.vote, rnd);
    case 'chiefDiscard': return descartarJefe(S, pid, a.index);
    case 'voceroDiscard': return descartarVocero(S, pid, a.index, rnd);
    case 'vetoRequest': return pedirVeto(S, pid);
    case 'vetoReply': return responderVeto(S, pid, !!a.accept, rnd);
    case 'power': return usarPoder(S, pid, a.target);
    default: throw new ErrorJuego('Jugada desconocida.');
  }
}

const API = {
  ROLES, BANDOS, CARTAS, PODERES, OPERADORES_POR_CANTIDAD,
  ErrorJuego, crearSala, unirse, limpiarNombre, aplicar, puedeSerVocero, tableroEscandalos, lista,
  config, DEBATE_OPCIONES,
};

// En el servidor se usa con require(); en el modo práctica del navegador,
// una copia (docs/motor.js) queda en globalThis.BallotageEngine.
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else globalThis.BallotageEngine = API;
