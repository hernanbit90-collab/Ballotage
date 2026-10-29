// Pruebas del reglamento: cientos de partidas al azar, verificando que nunca
// se rompan las reglas.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine');

// Imita a Firebase: no guarda null, ni arrays u objetos vacíos.
function comoFirebase(x) {
  if (x === null || x === undefined) return undefined;
  if (Array.isArray(x)) {
    const a = x.map(comoFirebase);
    return a.length ? a : undefined;
  }
  if (typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) {
      const v = comoFirebase(x[k]);
      if (v !== undefined) o[k] = v;
    }
    return Object.keys(o).length ? o : undefined;
  }
  return x;
}

function semilla(s) {
  return (n) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s % n;
  };
}

// Por defecto, sin debate ni declaraciones para probar el resto del reglamento.
function salaCon(n, rnd, ajustes = { debate: 0, declare: false }) {
  let S = E.crearSala('ABCD', 'u1', 'Jugador1', 0);
  E.aplicar(S, 'p1', Object.assign({ type: 'settings' }, ajustes), rnd, 0);
  for (let i = 2; i <= n; i++) {
    S = comoFirebase(S);
    E.unirse(S, 'u' + i, 'Jugador' + i, null, i);
  }
  S = comoFirebase(S);
  E.aplicar(S, 'p1', { type: 'start' }, rnd);
  return comoFirebase(S);
}

function jugar(S, pid, a, rnd, ahora) {
  E.aplicar(S, pid, a, rnd, ahora);
  return comoFirebase(S);
}

function contarCartas(S) {
  const g = S.pub.game;
  return E.lista(S.sec.deck).length + E.lista(S.sec.discard).length + E.lista(S.sec.hand).length +
    g.proposals + g.scandals;
}

function partidaAlAzar(n, seed) {
  const rnd = semilla(seed);
  let S = salaCon(n, rnd, seed % 2 ? { debate: 30, declare: true } : { debate: 0, declare: false });
  let pasos = 0;
  while (S.pub.game.phase !== 'ended') {
    assert.ok(pasos++ < 2000, 'la partida no termina');
    const g = S.pub.game;
    assert.strictEqual(contarCartas(S), 17, 'se perdieron cartas');
    assert.ok(g.crisis < 3);
    const vivos = g.order.filter((p) => g.alive[p]);
    switch (g.phase) {
      case 'nominate': {
        assert.ok(g.alive[g.candidate], 'candidato eliminado');
        const ok = vivos.filter((p) => E.puedeSerVocero(S, p));
        assert.ok(ok.length > 0);
        // Probar que nominar a alguien inválido falla.
        assert.throws(() => E.aplicar(JSON.parse(JSON.stringify(S)), g.candidate, { type: 'nominate', target: g.candidate }, rnd));
        S = jugar(S, g.candidate, { type: 'nominate', target: ok[rnd(ok.length)] }, rnd);
        break;
      }
      case 'debate': {
        const d = g.debate;
        const habla = d.order[d.idx];
        assert.ok(g.alive[habla], 'habla un eliminado');
        assert.strictEqual(d.order.length, vivos.length, 'no hablan todos');
        const otro = vivos.find((p) => p !== habla && p !== 'p1');
        if (otro) assert.throws(() => E.aplicar(JSON.parse(JSON.stringify(S)), otro, { type: 'debateNext', idx: d.idx }, rnd, d.turnEnd - 20000), /hablando/);
        const quien = [habla, 'p1', otro || habla][rnd(3)];
        S = jugar(S, quien, { type: 'debateNext', idx: d.idx }, rnd, d.turnEnd + 10);
        break;
      }
      case 'declare':
        if (!(g.history[g.history.length - 1].declared || {}).chief) S = jugar(S, g.chief, { type: 'declare', proposals: rnd(4) }, rnd);
        if (S.pub.game.phase === 'declare') S = jugar(S, g.vocero, { type: 'declare', proposals: rnd(3) }, rnd);
        break;
      case 'vote':
        for (const p of vivos) {
          if (S.pub.game.phase !== 'vote') break;
          S = jugar(S, p, { type: 'vote', vote: rnd(3) > 0 }, rnd);
        }
        break;
      case 'chiefDiscard':
        assert.strictEqual(E.lista(S.priv[g.chief].hand).length, 3);
        S = jugar(S, g.chief, { type: 'chiefDiscard', index: rnd(3) }, rnd);
        break;
      case 'voceroDiscard':
        assert.strictEqual(E.lista(S.priv[g.vocero].hand).length, 2);
        if (g.scandals >= 5 && !g.vetoDenied && rnd(2)) S = jugar(S, g.vocero, { type: 'vetoRequest' }, rnd);
        else S = jugar(S, g.vocero, { type: 'voceroDiscard', index: rnd(2) }, rnd);
        break;
      case 'vetoReply':
        S = jugar(S, g.chief, { type: 'vetoReply', accept: rnd(2) === 0 }, rnd);
        break;
      case 'power': {
        const inv = g.investigated || {};
        const ops = vivos.filter((p) => p !== g.chief && (g.power !== 'encuesta' || !inv[p]));
        S = jugar(S, g.chief, { type: 'power', target: ops[rnd(ops.length)] }, rnd);
        break;
      }
      default:
        assert.fail('fase rara ' + g.phase);
    }
  }
  return S;
}

test('reparto de roles según cantidad de jugadores', () => {
  const esperado = { 5: [3, 1], 6: [4, 1], 7: [4, 2], 8: [5, 2], 9: [5, 3], 10: [6, 3] };
  for (let n = 5; n <= 10; n++) {
    const S = salaCon(n, semilla(n));
    const roles = Object.values(S.sec.roles);
    assert.strictEqual(roles.filter((r) => r === 'campana').length, esperado[n][0]);
    assert.strictEqual(roles.filter((r) => r === 'operador').length, esperado[n][1]);
    assert.strictEqual(roles.filter((r) => r === 'topo').length, 1);
    const topo = Object.keys(S.sec.roles).find((p) => S.sec.roles[p] === 'topo');
    for (const p of Object.keys(S.priv)) {
      const pr = S.priv[p];
      if (pr.role === 'operador') assert.strictEqual(pr.allies.topo, topo);
      if (pr.role === 'campana') assert.ok(!pr.allies);
      if (pr.role === 'topo') assert.strictEqual(!!pr.allies, n <= 6);
    }
  }
});

test('no se puede empezar con menos de 5', () => {
  let S = E.crearSala('ABCD', 'u1', 'A', 0);
  for (let i = 2; i <= 4; i++) E.unirse(S, 'u' + i, 'J' + i, null, i);
  assert.throws(() => E.aplicar(S, 'p1', { type: 'start' }, semilla(1)), /entre 5 y 10/);
});

test('reconexión con clave de regreso', () => {
  const S = salaCon(5, semilla(3));
  const pin = S.priv.p3.pin;
  assert.throws(() => E.unirse(S, 'nuevo', 'Jugador3', '0000', 1), /clave/);
  assert.throws(() => E.unirse(S, 'nuevo', 'Desconocido', pin, 1), /ya empezó/);
  assert.strictEqual(E.unirse(S, 'nuevo', 'jugador3', pin, 1), 'p3');
  assert.strictEqual(S.auth.nuevo, 'p3');
  assert.strictEqual(S.auth.u3, undefined);
});

test('3 rechazos seguidos = cacerolazo', () => {
  const rnd = semilla(7);
  let S = salaCon(5, rnd);
  for (let i = 0; i < 3; i++) {
    const g = S.pub.game;
    const ok = g.order.filter((p) => E.puedeSerVocero(S, p));
    S = jugar(S, g.candidate, { type: 'nominate', target: ok[0] }, rnd);
    for (const p of g.order) S = jugar(S, p, { type: 'vote', vote: false }, rnd);
  }
  const g = S.pub.game;
  assert.strictEqual(g.crisis || 0, 0);
  assert.strictEqual(g.proposals + g.scandals, 1);
  assert.strictEqual(g.history[2].chaos, true);
  assert.ok(!g.lastChief && !g.lastVocero);
});

test('empate es rechazo y el voto se abre recién al final', () => {
  const rnd = semilla(11);
  let S = salaCon(6, rnd);
  const g0 = S.pub.game;
  const ok = g0.order.filter((p) => E.puedeSerVocero(S, p));
  S = jugar(S, g0.candidate, { type: 'nominate', target: ok[0] }, rnd);
  g0.order.forEach((p, i) => {
    S = jugar(S, p, { type: 'vote', vote: i < 3 }, rnd);
    if (i < 5) assert.ok(!S.pub.game.lastVote, 'se filtró el voto');
  });
  assert.strictEqual(S.pub.game.lastVote.approved, false);
  assert.strictEqual(S.pub.game.crisis, 1);
});

test('cientos de partidas al azar respetan las reglas', () => {
  const ganadores = { campana: 0, operadores: 0 };
  for (let seed = 1; seed <= 600; seed++) {
    const n = 5 + (seed % 6);
    const S = partidaAlAzar(n, seed);
    const g = S.pub.game;
    assert.ok(g.winner);
    ganadores[g.winner]++;
    assert.strictEqual(Object.keys(g.reveal).length, n);
    if (g.winner === 'campana') assert.ok(g.proposals === 5 || g.order.some((p) => !g.alive[p] && g.reveal[p] === 'topo'));
    else assert.ok(g.scandals === 6 || g.reveal[g.vocero] === 'topo');
  }
  assert.ok(ganadores.campana > 0 && ganadores.operadores > 0);
});

test('bajada de línea: después el orden sigue desde donde estaba', () => {
  const rnd = semilla(5);
  let S = salaCon(7, rnd);
  const g = S.pub.game;
  // Forzamos un tablero con 2 escándalos y una mano con escándalos.
  S.pub.game.scandals = 2;
  const chief = g.candidate;
  const idx = g.order.indexOf(chief);
  const ok = g.order.filter((p) => E.puedeSerVocero(S, p));
  const voc = ok.find((p) => S.sec.roles[p] !== 'topo');
  S = jugar(S, chief, { type: 'nominate', target: voc }, rnd);
  for (const p of g.order) S = jugar(S, p, { type: 'vote', vote: true }, rnd);
  S.sec.hand = ['E', 'E', 'E'];
  S.priv[chief].hand = ['E', 'E', 'E'];
  S = jugar(S, chief, { type: 'chiefDiscard', index: 0 }, rnd);
  S = jugar(S, voc, { type: 'voceroDiscard', index: 0 }, rnd);
  assert.strictEqual(S.pub.game.phase, 'power');
  assert.strictEqual(S.pub.game.power, 'bajada');
  const elegido = g.order[(idx + 4) % 7];
  S = jugar(S, chief, { type: 'power', target: elegido }, rnd);
  assert.strictEqual(S.pub.game.candidate, elegido);
  // Ronda especial rechazada: vuelve al siguiente del que usó el poder.
  const ok2 = S.pub.game.order.filter((p) => E.puedeSerVocero(S, p));
  assert.ok(!ok2.includes(chief) && !ok2.includes(voc), 'límite de mandato');
  S = jugar(S, elegido, { type: 'nominate', target: ok2[0] }, rnd);
  for (const p of g.order) S = jugar(S, p, { type: 'vote', vote: false }, rnd);
  assert.strictEqual(S.pub.game.candidate, g.order[(idx + 1) % 7]);
});

test('docs/motor.js es una copia exacta del reglamento', () => {
  const fs = require('fs');
  const path = require('path');
  const a = fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8');
  const b = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'motor.js'), 'utf8');
  assert.strictEqual(b, a, 'copiá functions/engine.js a docs/motor.js');
});

test('debate: hablan todos los vivos, empezando por la fórmula', () => {
  const rnd = semilla(21);
  let S = salaCon(7, rnd, { debate: 30, declare: true });
  const g = S.pub.game;
  const ok = g.order.filter((p) => E.puedeSerVocero(S, p));
  S = jugar(S, g.candidate, { type: 'nominate', target: ok[0] }, rnd, 1000);
  let d = S.pub.game.debate;
  assert.strictEqual(S.pub.game.phase, 'debate');
  assert.deepStrictEqual(d.order.slice(0, 2), [g.candidate, ok[0]]);
  assert.strictEqual(d.order.length, 7);
  assert.strictEqual(d.turnEnd, 31000);
  // Antes de tiempo, otro no puede pasar la palabra; después sí.
  const otro = d.order.find((p, i) => i > 0 && p !== 'p1');
  assert.throws(() => E.aplicar(JSON.parse(JSON.stringify(S)), otro, { type: 'debateNext', idx: 0 }, rnd, 5000), /hablando/);
  S = jugar(S, otro, { type: 'debateNext', idx: 0 }, rnd, 31000);
  // Un pedido repetido con el índice viejo no saltea a nadie.
  S = jugar(S, otro, { type: 'debateNext', idx: 0 }, rnd, 99999);
  assert.strictEqual(S.pub.game.debate.idx, 1);
  // No se puede votar durante el debate.
  assert.throws(() => E.aplicar(JSON.parse(JSON.stringify(S)), 'p2', { type: 'vote', vote: true }, rnd), /votación/);
  S = jugar(S, 'p1', { type: 'debateNext', all: true }, rnd, 32000);
  assert.strictEqual(S.pub.game.phase, 'vote');
});

test('declaraciones del Jefe y el Vocero después de publicar', () => {
  const rnd = semilla(33);
  let S = salaCon(5, rnd, { debate: 0, declare: true });
  const g = S.pub.game;
  const ok = g.order.filter((p) => E.puedeSerVocero(S, p) && S.sec.roles[p] !== 'topo');
  S = jugar(S, g.candidate, { type: 'nominate', target: ok[0] }, rnd);
  for (const p of g.order) S = jugar(S, p, { type: 'vote', vote: true }, rnd);
  const chief = S.pub.game.chief;
  const voc = S.pub.game.vocero;
  S = jugar(S, chief, { type: 'chiefDiscard', index: 0 }, rnd);
  S = jugar(S, voc, { type: 'voceroDiscard', index: 0 }, rnd);
  assert.strictEqual(S.pub.game.phase, 'declare');
  assert.throws(() => E.aplicar(JSON.parse(JSON.stringify(S)), voc, { type: 'declare', proposals: 3 }, rnd), /inválida/);
  S = jugar(S, voc, { type: 'declare', proposals: 1 }, rnd);
  assert.strictEqual(S.pub.game.history[0].claims, undefined, 'la declaración se ve antes de tiempo');
  assert.strictEqual(S.pub.game.history[0].declared.vocero, true);
  assert.throws(() => E.aplicar(JSON.parse(JSON.stringify(S)), voc, { type: 'declare', proposals: 1 }, rnd), /Ya hiciste/);
  S = jugar(S, chief, { type: 'declare', proposals: 2 }, rnd);
  assert.strictEqual(S.pub.game.phase, 'nominate');
  assert.deepStrictEqual(S.pub.game.history[0].claims, { chief: 2, vocero: 1 });
});

test('quien no vota a tiempo cuenta como Sí', () => {
  const rnd = semilla(44);
  let S = salaCon(5, rnd, { debate: 0, declare: false, voteTime: 20 });
  const g = S.pub.game;
  const ok = g.order.filter((p) => E.puedeSerVocero(S, p) && S.sec.roles[p] !== 'topo');
  S = jugar(S, g.candidate, { type: 'nominate', target: ok[0] }, rnd, 1000);
  assert.strictEqual(S.pub.game.voteEnd, 21000);
  const [a, b] = g.order;
  S = jugar(S, a, { type: 'vote', vote: false }, rnd);
  S = jugar(S, b, { type: 'vote', vote: false }, rnd);
  assert.throws(() => E.aplicar(JSON.parse(JSON.stringify(S)), a, { type: 'voteTimeout' }, rnd, 5000), /Todavía/);
  S = jugar(S, a, { type: 'voteTimeout' }, rnd, 21000);
  const lv = S.pub.game.lastVote;
  assert.strictEqual(lv.yes, 3);
  assert.strictEqual(lv.approved, true);
  assert.strictEqual(lv.late.length, 3);
  // Un aviso repetido no rompe nada.
  S = jugar(S, b, { type: 'voteTimeout' }, rnd, 22000);
  assert.strictEqual(S.pub.game.phase, 'chiefDiscard');
});

test('cada jugador puede elegir su personaje', () => {
  const S = E.crearSala('ABCD', 'u1', 'A', 0);
  const look = { piel: 2, pelo: 5, colorPelo: 1, lentes: 1, cara: 0, gorro: 3, ropa: 7, fondo: 4 };
  E.aplicar(S, 'p1', { type: 'look', look }, semilla(1));
  assert.deepStrictEqual(S.pub.players.p1.look, look);
  assert.throws(() => E.aplicar(S, 'p1', { type: 'look', look: Object.assign({}, look, { pelo: 99 }) }, semilla(1)), /inválido/);
  assert.throws(() => E.aplicar(S, 'p1', { type: 'look', look: { piel: 1 } }, semilla(1)), /inválido/);
});
