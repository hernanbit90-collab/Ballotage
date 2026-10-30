// Modo práctica: vos contra bots, todo dentro del navegador.
// Usa el mismo reglamento que el árbitro (motor.js) y el cerebro de bots.js.

import './motor.js';
import * as Bots from './bots.js';

const E = globalThis.BallotageEngine;
const rnd = (n) => Math.floor(Math.random() * n);
const clonar = (x) => JSON.parse(JSON.stringify(x));
const YO = 'p1';

let S = null;
let avisar = null;
let reloj = null;
let esperaba = false; // el humano estaba mirando una animación
let mem = Bots.crearMemoria();

export function iniciar(nombre, n, onCambio, ajustes, look) {
  detener();
  avisar = onCambio;
  mem = Bots.crearMemoria();
  const ahora = Date.now();
  S = E.crearSala('BOTS', 'yo', nombre, ahora);
  Bots.NOMBRES_BOTS.filter((b) => b.toLowerCase() !== nombre.toLowerCase())
    .slice(0, n - 1)
    .forEach((b, i) => {
      const pid = E.unirse(S, 'bot' + i, b, null, ahora + i + 1);
      S.pub.players[pid].bot = true;
    });
  if (ajustes) E.aplicar(S, YO, Object.assign({ type: 'settings' }, ajustes), rnd);
  if (look) { try { E.aplicar(S, YO, { type: 'look', look }, rnd); } catch { /* personaje viejo o inválido */ } }
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
  E.aplicar(T, YO, datos.action || {}, rnd, Date.now()); // si es ilegal, tira ErrorJuego con el mensaje
  if (datos.action && datos.action.type === 'rematch') mem = Bots.crearMemoria();
  S = T;
  emitir();
  if (datos.action && datos.action.type === 'rematch') { E.aplicar(S, YO, { type: 'start' }, rnd); emitir(); }
  programar();
  return { data: { ok: true } };
}

function emitir() {
  if (!S || !avisar) return;
  const presence = {};
  for (const p of Object.keys(S.pub.players)) presence[p] = true;
  avisar({ pub: clonar(S.pub), priv: clonar((S.priv && S.priv[YO]) || {}), presence });
}

const esBot = (p) => p !== YO;

function programar() {
  clearTimeout(reloj);
  if (!S || S.pub.status !== 'playing') return;
  const d = Bots.decidir(S, mem, esBot, Date.now());
  if (!d) return; // le toca al humano
  reloj = setTimeout(() => turnoBot(d), d.demora);
}

function turnoBot(d) {
  if (!S || S.pub.status !== 'playing') return;
  // Mientras el humano mira una animación (urna, carta publicada), esperan.
  if (globalThis.ballotageOcupado && globalThis.ballotageOcupado()) {
    esperaba = true;
    reloj = setTimeout(() => turnoBot(d), 400);
    return;
  }
  // Recién se cerró la animación: damos tiempo a ver la pantalla antes de jugar.
  if (esperaba) {
    esperaba = false;
    reloj = setTimeout(programar, 1600 + rnd(1000));
    return;
  }
  if (d.decir) {
    const g = S.pub.game;
    if (g.phase === 'debate' && g.debate) g.debate.say = { idx: g.debate.idx, round: g.round, pid: d.decir.pid, text: d.decir.text };
  } else {
    try {
      const T = clonar(S);
      E.aplicar(T, d.pid, d.action, rnd, Date.now());
      S = T;
    } catch (e) {
      console.warn('El bot se equivocó:', e.message); // no debería pasar
    }
  }
  emitir();
  programar();
}
