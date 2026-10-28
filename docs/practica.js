// Modo práctica: vos contra bots, todo dentro del navegador.
// Usa el mismo reglamento que el árbitro del servidor (motor.js).
// Acá no hay secretos que proteger: es para aprender a jugar.

import './motor.js';

const E = globalThis.BallotageEngine;
const BOTS = ['Cacho', 'Pocha', 'Rulo', 'Mirta', 'Beto', 'Chiche', 'Nené', 'Coco', 'Lali', 'Tota'];
const rnd = (n) => Math.floor(Math.random() * n);
const azar = (arr) => arr[rnd(arr.length)];
const clonar = (x) => JSON.parse(JSON.stringify(x));
const YO = 'p1';

let S = null;
let avisar = null;
let reloj = null;

export function iniciar(nombre, n, onCambio) {
  detener();
  avisar = onCambio;
  const ahora = Date.now();
  S = E.crearSala('BOTS', 'yo', nombre, ahora);
  BOTS.filter((b) => b.toLowerCase() !== nombre.toLowerCase())
    .slice(0, n - 1)
    .forEach((b, i) => E.unirse(S, 'bot' + i, b, null, ahora + i + 1));
  S = clonar(S);
  E.aplicar(S, YO, { type: 'start' }, rnd);
  emitir();
  programar();
}

export function detener() {
  clearTimeout(reloj);
  S = null;
  avisar = null;
}

// Imita al árbitro: aplica la jugada del humano o tira el mismo error.
export async function pedir(datos) {
  if (!S) throw new Error('No hay partida de práctica.');
  if (datos.op !== 'act') throw new Error('En práctica no hay salas online.');
  if (datos.action && datos.action.type === 'leave') return { data: { ok: true } };
  const T = clonar(S);
  E.aplicar(T, YO, datos.action || {}, rnd); // si es ilegal, tira ErrorJuego con el mensaje
  S = T;
  emitir();
  programar();
  return { data: { ok: true } };
}

function emitir() {
  if (!S || !avisar) return;
  const presence = {};
  for (const p of Object.keys(S.pub.players)) presence[p] = true;
  avisar({ pub: clonar(S.pub), priv: clonar((S.priv && S.priv[YO]) || {}), presence });
}

// ------------------------------------------------------------------ Bots

function programar() {
  clearTimeout(reloj);
  if (!S || S.pub.status !== 'playing') return;
  const g = S.pub.game;
  const demora = g.phase === 'vote' ? 350 + rnd(500) : 1100 + rnd(900);
  reloj = setTimeout(turnoBot, demora);
}

function turnoBot() {
  if (!S || S.pub.status !== 'playing') return;
  const jugada = elegirJugada();
  if (!jugada) return; // le toca al humano
  try {
    const T = clonar(S);
    E.aplicar(T, jugada.pid, jugada.action, rnd);
    S = T;
  } catch (e) {
    console.warn('El bot se equivocó:', e.message); // no debería pasar
  }
  emitir();
  programar();
}

const rol = (p) => S.sec.roles[p];
const esOp = (p) => rol(p) !== 'campana';

// Lo que cada bot "sabe" de verdad: no hacen trampa con los roles ajenos.
function aliados(p) {
  const a = S.priv[p].allies;
  if (!a) return [];
  return [a.topo, ...E.lista(a.operadores)].filter(Boolean);
}
function sospechosos(p) {
  const s = S.priv[p].surveys || {};
  return Object.keys(s).filter((x) => s[x] === 'operadores');
}
function confiables(p) {
  const s = S.priv[p].surveys || {};
  return Object.keys(s).filter((x) => s[x] === 'campana');
}

function elegirJugada() {
  const g = S.pub.game;
  const vivos = E.lista(g.order).filter((p) => g.alive[p]);
  const bot = (p) => p !== YO;
  switch (g.phase) {
    case 'nominate': {
      const c = g.candidate;
      if (!bot(c)) return null;
      const ok = vivos.filter((p) => E.puedeSerVocero(S, p));
      let elegido;
      if (esOp(c)) {
        const topo = ok.find((p) => rol(p) === 'topo' && aliados(c).includes(p));
        const amigos = ok.filter((p) => aliados(c).includes(p));
        elegido = g.scandals >= 3 && topo ? topo : amigos.length && rnd(2) ? azar(amigos) : azar(ok);
      } else {
        const buenos = ok.filter((p) => confiables(c).includes(p));
        const noMalos = ok.filter((p) => !sospechosos(c).includes(p));
        elegido = buenos.length ? azar(buenos) : azar(noMalos.length ? noMalos : ok);
      }
      return { pid: c, action: { type: 'nominate', target: elegido } };
    }
    case 'vote': {
      const falta = vivos.find((p) => bot(p) && !(g.voted && g.voted[p]));
      if (!falta) return null;
      return { pid: falta, action: { type: 'vote', vote: votoDe(falta) } };
    }
    case 'chiefDiscard': {
      if (!bot(g.chief)) return null;
      return { pid: g.chief, action: { type: 'chiefDiscard', index: aTriturar(g.chief, E.lista(S.sec.hand)) } };
    }
    case 'voceroDiscard': {
      const v = g.vocero;
      if (!bot(v)) return null;
      const mano = E.lista(S.sec.hand);
      if (g.scandals >= 5 && !g.vetoDenied && !esOp(v) && mano.every((c) => c === 'E')) {
        return { pid: v, action: { type: 'vetoRequest' } };
      }
      return { pid: v, action: { type: 'voceroDiscard', index: aTriturar(v, mano) } };
    }
    case 'vetoReply':
      if (!bot(g.chief)) return null;
      return { pid: g.chief, action: { type: 'vetoReply', accept: !esOp(g.chief) } };
    case 'power': {
      const c = g.chief;
      if (!bot(c)) return null;
      if (g.power === 'carpeta') return { pid: c, action: { type: 'power' } };
      let ops = vivos.filter((p) => p !== c);
      if (g.power === 'encuesta') ops = ops.filter((p) => !(g.investigated && g.investigated[p]));
      let t;
      if (esOp(c)) {
        const amigos = ops.filter((p) => aliados(c).includes(p));
        const otros = ops.filter((p) => !aliados(c).includes(p));
        t = g.power === 'bajada' && amigos.length ? azar(amigos) : azar(otros.length ? otros : ops);
      } else {
        const malos = ops.filter((p) => sospechosos(c).includes(p));
        const noBuenos = ops.filter((p) => !confiables(c).includes(p));
        t = g.power === 'carpetazo' && malos.length ? azar(malos) : azar(noBuenos.length ? noBuenos : ops);
      }
      return { pid: c, action: { type: 'power', target: t } };
    }
    default:
      return null;
  }
}

function aTriturar(p, mano) {
  const quiero = esOp(p) ? 'P' : 'E'; // cada uno tritura lo que no le conviene
  const i = mano.indexOf(quiero);
  // A veces los operadores disimulan para no quedar en evidencia.
  if (esOp(p) && i >= 0 && rnd(4) === 0) return mano.indexOf('E') >= 0 ? mano.indexOf('E') : i;
  return i >= 0 ? i : 0;
}

function votoDe(p) {
  const g = S.pub.game;
  const formula = [g.candidate, g.nominee];
  if (esOp(p)) {
    const ami = aliados(p).concat(p);
    if (g.scandals >= 3 && rol(g.nominee) === 'topo' && ami.includes(g.nominee)) return true;
    if (formula.some((x) => ami.includes(x))) return rnd(10) < 9;
    return rnd(2) === 0;
  }
  if (formula.some((x) => sospechosos(p).includes(x))) return false;
  if (g.scandals >= 3 && formula[1] !== p && !confiables(p).includes(formula[1]) && rnd(3) === 0) return false;
  if (g.crisis >= 2) return rnd(10) < 8;
  return rnd(10) < 6;
}
