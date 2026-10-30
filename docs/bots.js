// Cerebro de los bots de BALLOTAGE. Lo usan el modo práctica y las salas
// online (ahí los maneja el celular del anfitrión).
//
// Los bots no hacen trampa: cada uno decide solo con lo que su rol le deja
// saber (su bando, sus aliados si los conoce, sus encuestas y lo que pasó en
// la mesa a la vista de todos).
//
//   const mem = crearMemoria();
//   const d = decidir(S, mem, esBot, ahora);
//   d = { pid, action, demora }      -> jugada para aplicar con el reglamento
//   d = { decir: { pid, text }, demora } -> el bot habla en el debate
//   d = null                          -> le toca a un humano

import './motor.js';

const E = globalThis.BallotageEngine;
const L = (x) => E.lista(x);
const rnd = (n) => Math.floor(Math.random() * n);
const azar = (arr) => arr[rnd(arr.length)];
const chance = (p) => Math.random() < p;

export const NOMBRES_BOTS = ['Cacho', 'Pocha', 'Rulo', 'Mirta', 'Beto', 'Chiche', 'Nené', 'Coco', 'Lali', 'Tota', 'Pirucha', 'Toto'];

export function crearMemoria() {
  return { vistas: {}, dichos: {}, intencion: {} };
}

// ------------------------------------------------------------------ Lo que sabe cada bot

const rol = (S, p) => S.sec.roles[p];
const esOp = (S, p) => rol(S, p) !== 'campana';
const nombre = (S, p) => (S.pub.players[p] && S.pub.players[p].name) || '¿?';

function aliados(S, p) {
  const a = S.priv[p] && S.priv[p].allies;
  if (!a) return [];
  return [a.topo, ...L(a.operadores)].filter(Boolean);
}

// Sospecha que un jugador de la Campaña tendría de cada uno, usando solo
// información pública (+ sus encuestas). Más alto = más sospechoso.
function sospechas(S, desde) {
  const g = S.pub.game;
  const orden = L(g.order);
  const sc = {};
  const motivos = {};
  for (const p of orden) { sc[p] = 0; motivos[p] = []; }
  const sumar = (p, v, motivo) => { if (sc[p] === undefined) return; sc[p] += v; if (motivo) motivos[p].push(motivo); };
  for (const r of L(g.history)) {
    if (!r.approved || !r.published || r.chaos) continue;
    if (r.published === 'E') {
      sumar(r.candidate, 1, 'escandalo');
      sumar(r.nominee, 1.2, 'escandalo');
      for (const [p, si] of Object.entries(r.votes || {})) if (si && p !== r.candidate && p !== r.nominee) sumar(p, 0.25);
    } else {
      sumar(r.candidate, -0.9);
      sumar(r.nominee, -1);
      for (const [p, si] of Object.entries(r.votes || {})) if (si) sumar(p, -0.15);
    }
    const c = r.claims;
    if (c && c.chief !== undefined && c.vocero !== undefined) {
      // El Jefe dice que pasó al menos una Propuesta pero el Vocero dice que no le llegó ninguna.
      const pasoP = c.chief >= 2 ? 1 : c.chief; // con 2+ seguro pasó alguna
      if (pasoP > 0 && c.vocero === 0) { sumar(r.candidate, 0.9, 'mintio'); sumar(r.nominee, 0.9, 'mintio'); }
      // Al Vocero le llegó una Propuesta y publicó un Escándalo.
      if (c.vocero > 0 && r.published === 'E') sumar(r.nominee, 2.2, 'traiciono');
    }
  }
  const enc = (S.priv[desde] && S.priv[desde].surveys) || {};
  for (const [p, bando] of Object.entries(enc)) sumar(p, bando === 'operadores' ? 20 : -20, bando === 'operadores' ? 'encuesta' : null);
  sc[desde] = -99;
  return { sc, motivos };
}

// ------------------------------------------------------------------ Decisión principal

export function decidir(S, mem, esBot, ahora) {
  if (!S || S.pub.status !== 'playing' || !S.pub.game) return null;
  const g = S.pub.game;
  const vivos = L(g.order).filter((p) => g.alive[p]);
  const bot = (p) => !!p && esBot(p);
  const lento = 1700 + rnd(1300);
  switch (g.phase) {
    case 'nominate': {
      const c = g.candidate;
      if (!bot(c)) return null;
      return { pid: c, action: { type: 'nominate', target: elegirVocero(S, c, vivos) }, demora: lento };
    }
    case 'debate': {
      const d = g.debate;
      const habla = L(d.order)[d.idx];
      if (!bot(habla)) return null;
      const clave = g.round + '-' + d.idx;
      const ya = mem.dichos[clave];
      if (!ya) {
        const text = frase(S, mem, habla);
        const dur = Math.min(Math.max(2600, text.length * 70 + 900), Math.max(1500, d.turnEnd - ahora - 600));
        mem.dichos[clave] = { t: ahora, dur };
        return { decir: { pid: habla, text }, demora: 500 };
      }
      const falta = ya.t + ya.dur - ahora;
      return { pid: habla, action: { type: 'debateNext', idx: d.idx }, demora: Math.max(200, falta) };
    }
    case 'vote': {
      const pendientes = vivos.filter((p) => bot(p) && !(g.voted && g.voted[p]));
      if (!pendientes.length) return null;
      const p = azar(pendientes);
      const clave = g.round + '-' + p;
      const voto = mem.intencion[clave] !== undefined ? mem.intencion[clave] : votar(S, p);
      return { pid: p, action: { type: 'vote', vote: voto }, demora: 500 + rnd(900) };
    }
    case 'chiefDiscard': {
      if (!bot(g.chief)) return null;
      const mano = L(S.sec.hand);
      mem.vistas = { chief: mano.filter((x) => x === 'P').length, mano: mano.slice() };
      return { pid: g.chief, action: { type: 'chiefDiscard', index: descarteJefe(S, g.chief, mano) }, demora: lento };
    }
    case 'voceroDiscard': {
      const v = g.vocero;
      if (!bot(v)) return null;
      const mano = L(S.sec.hand);
      mem.vistas.vocero = mano.filter((x) => x === 'P').length;
      if (g.scandals >= 5 && !g.vetoDenied && !esOp(S, v) && mano.every((x) => x === 'E')) {
        return { pid: v, action: { type: 'vetoRequest' }, demora: lento };
      }
      const i = descarteVocero(S, v, mano);
      mem.vistas.publico = mano[1 - i];
      return { pid: v, action: { type: 'voceroDiscard', index: i }, demora: lento };
    }
    case 'vetoReply':
      if (!bot(g.chief)) return null;
      return { pid: g.chief, action: { type: 'vetoReply', accept: !esOp(S, g.chief) || g.scandals >= 6 }, demora: lento };
    case 'declare': {
      const r = L(g.history)[L(g.history).length - 1];
      const ya = r.declared || {};
      if (bot(g.chief) && !ya.chief) return { pid: g.chief, action: { type: 'declare', proposals: declarar(S, mem, g.chief, 'chief') }, demora: 900 + rnd(900) };
      if (bot(g.vocero) && !ya.vocero) return { pid: g.vocero, action: { type: 'declare', proposals: declarar(S, mem, g.vocero, 'vocero') }, demora: 900 + rnd(900) };
      return null;
    }
    case 'charla': {
      // Debate abierto: algunos bots opinan (una vez cada uno), sin apuro.
      const clave = 'c' + g.round + '-';
      const pendientes = vivos.filter((p) => bot(p) && !mem.dichos[clave + p]);
      for (const p of pendientes) {
        mem.dichos[clave + p] = { t: ahora };
        if (chance(0.6)) {
          const quedan = g.charla ? g.charla.fin - ahora : 10000;
          return { pid: p, action: { type: 'charlaSay', text: reaccion(S, p) }, demora: Math.min(1500 + rnd(4500), Math.max(400, quedan - 3000)) };
        }
      }
      return null;
    }
    case 'power': {
      const c = g.chief;
      if (!bot(c)) return null;
      if (g.power === 'carpeta') return { pid: c, action: { type: 'power' }, demora: lento };
      return { pid: c, action: { type: 'power', target: objetivoPoder(S, c, vivos) }, demora: lento };
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------------ Estrategias

function elegirVocero(S, c, vivos) {
  const g = S.pub.game;
  const ok = vivos.filter((p) => E.puedeSerVocero(S, p));
  const { sc } = sospechas(S, c);
  const masLimpio = (lista) => lista.slice().sort((a, b) => sc[a] - sc[b])[0];
  if (esOp(S, c)) {
    const ami = aliados(S, c).filter((p) => ok.includes(p));
    const topo = ami.find((p) => rol(S, p) === 'topo');
    // Zona roja: si puede, sube al Topo.
    if (g.scandals >= 3 && topo) return topo;
    // Si no, a veces un aliado (sin que se note) y a veces el más "limpio" para disimular.
    const amiLimpio = ami.filter((p) => sc[p] < 1.5);
    if (amiLimpio.length && chance(0.55)) return azar(amiLimpio);
    const otros = ok.filter((p) => !ami.includes(p));
    return masLimpio(otros.length ? otros : ok);
  }
  // Campaña: el que menos sospechas genera (con un poco de azar al principio).
  if (g.round <= 1) return azar(ok);
  const orden = ok.slice().sort((a, b) => sc[a] - sc[b]);
  return chance(0.8) ? orden[0] : orden[Math.min(1, orden.length - 1)];
}

function votar(S, p) {
  const g = S.pub.game;
  const j = g.candidate;
  const v = g.nominee;
  if (esOp(S, p)) {
    const ami = aliados(S, p).concat(p);
    if (g.scandals >= 3 && rol(S, v) === 'topo' && ami.includes(v)) return true; // ¡a ganar!
    if (ami.includes(j) || ami.includes(v)) return chance(0.92);
    // Contra una fórmula de la Campaña: suele votar No (el caos favorece a los Escándalos),
    // pero no siempre, para no quedar en evidencia.
    if (g.crisis >= 2) return chance(0.35);
    return chance(0.35);
  }
  const { sc } = sospechas(S, p);
  if (j === p || v === p) return true;
  let riesgo = Math.max(0, sc[j]) + Math.max(0, sc[v]) * 1.3;
  if (g.scandals >= 3) riesgo += Math.max(0, sc[v]) * 1.5 + 0.6; // zona roja: más cuidado con el Vocero
  const tolerancia = g.crisis >= 2 ? 3.2 : g.round <= 1 ? 2.5 : 1.6;
  if (riesgo > tolerancia) return false;
  return chance(riesgo > tolerancia * 0.6 ? 0.55 : 0.92);
}

function descarteJefe(S, p, mano) {
  const g = S.pub.game;
  const iP = mano.indexOf('P');
  const iE = mano.indexOf('E');
  if (!esOp(S, p)) return iE >= 0 ? iE : 0; // la Campaña tira un Escándalo si puede
  const topo = rol(S, p) === 'topo';
  const { sc } = sospechas(S, p);
  // Disimular: al principio (o si ya sospechan), deja pasar Propuestas. El Topo, más.
  const disimula = (g.scandals < 3 && topo && chance(0.7)) || (g.scandals < 2 && chance(0.4)) || (sc[p] > 2 && chance(0.5));
  if (disimula) return iE >= 0 ? iE : 0;
  return iP >= 0 ? iP : 0;
}

function descarteVocero(S, p, mano) {
  const g = S.pub.game;
  const iP = mano.indexOf('P');
  const iE = mano.indexOf('E');
  if (!esOp(S, p)) return iE >= 0 ? iE : 0;
  if (g.proposals >= 4 && iP >= 0) return iP; // nunca regalar la Propuesta que gana
  if (g.scandals >= 5 && iE >= 0) return iP >= 0 ? iP : 0; // publicar el Escándalo que gana
  const topo = rol(S, p) === 'topo';
  const disimula = (g.scandals < 3 && topo && chance(0.65)) || (g.scandals < 2 && chance(0.35));
  if (disimula) return iE >= 0 ? iE : 0;
  return iP >= 0 ? iP : 0;
}

// La Campaña dice la verdad. Los Operadores mienten para culpar al otro.
function declarar(S, mem, p, cargo) {
  const g = S.pub.game;
  const visto = cargo === 'chief' ? mem.vistas.chief : mem.vistas.vocero;
  const total = cargo === 'chief' ? 3 : 2;
  const real = visto === undefined ? rnd(total + 1) : visto;
  if (!esOp(S, p)) return real;
  const companero = cargo === 'chief' ? g.vocero : g.chief;
  const ami = aliados(S, p);
  const publico = mem.vistas.publico;
  if (ami.includes(companero)) {
    // Se cubren: "la Mesa de Entradas vino mala".
    return cargo === 'chief' ? Math.min(real, 0) : 0;
  }
  if (publico === 'E') {
    // Culpar al otro: el Jefe dice que pasó una Propuesta; el Vocero, que no le llegó ninguna.
    return cargo === 'chief' ? Math.max(1, Math.min(real, 2)) : 0;
  }
  return real;
}

function objetivoPoder(S, c, vivos) {
  const g = S.pub.game;
  let ops = vivos.filter((p) => p !== c);
  if (g.power === 'encuesta') ops = ops.filter((p) => !(g.investigated && g.investigated[p]));
  const { sc } = sospechas(S, c);
  const orden = ops.slice().sort((a, b) => sc[b] - sc[a]); // más sospechoso primero
  if (esOp(S, c)) {
    const ami = aliados(S, c);
    const noAmi = ops.filter((p) => !ami.includes(p));
    if (g.power === 'bajada') {
      const topo = ops.find((p) => ami.includes(p) && rol(S, p) === 'topo');
      const amigos = ops.filter((p) => ami.includes(p));
      return topo || (amigos.length ? azar(amigos) : orden[orden.length - 1]);
    }
    if (g.power === 'carpetazo') {
      // Voltea al de la Campaña que más confianza tiene (el más peligroso para ellos).
      const blancos = noAmi.slice().sort((a, b) => sc[a] - sc[b]);
      return blancos[0] || orden[0];
    }
    return azar(noAmi.length ? noAmi : ops);
  }
  if (g.power === 'bajada') return orden[orden.length - 1];
  return orden[0];
}

// ------------------------------------------------------------------ Lo que dicen en el debate

// Comentarios de campaña (inventados, sin partidos ni políticos reales).
const DE_CAMPANA = [
  'Esto se gana en la calle, no en el búnker.',
  'Ya están los choripanes para el cierre, no lo arruinemos.',
  'Los punteros me dicen que en los barrios estamos bárbaro.',
  'La encuesta que pagamos nosotros nos da arriba, je.',
  'Que no se filtre nada a El Bochinche, por favor.',
  'Hay que bajar al territorio y escuchar a la gente.',
  'Un micrófono abierto es más peligroso que el rival.',
  'Para el acto del sábado ya tenemos los bombos y el escenario.',
  'Menos rosca de pasillo y más propuestas, equipo.',
  'Acá nadie se baja de la boleta, ¿estamos?',
  'Tito Ventura nos mira desde el afiche: no lo defraudemos.',
  'El que filtra un audio, se va de la campaña.',
  'Con dos Propuestas más, festejamos con asado.',
];
const DE_ESCANDALO = [
  'Otra tapa con escándalo y nos bajan del escenario.',
  'Esto ya huele a operación de Los de Enfrente.',
  'Alguien está pasando información al búnker de enfrente.',
];
const DE_DISIMULO = [ // lo que dice un Operador para parecer de la campaña
  'Yo estoy en esta campaña desde la primera pegatina, eh.',
  'Que me revisen los bolsillos si quieren: no hay bolsos.',
  'Yo los Escándalos los detesto, me hacen mal a la úlcera.',
  'Confíen: yo pegué más afiches que nadie en esta mesa.',
];
const DE_ZONA_ROJA = [
  'Zona roja, gente: el que vota mal al Vocero nos hunde.',
  'Ahora sí: un Vocero equivocado y perdemos la elección.',
];

// Lo que dice un bot sobre las declaraciones del Jefe y el Vocero.
function reaccion(S, p) {
  const g = S.pub.game;
  const N = (x) => nombre(S, x);
  const r = L(g.history)[L(g.history).length - 1] || {};
  const c = r.claims || {};
  const j = r.candidate;
  const v = r.nominee;
  if (p === j || p === v) {
    return azar(['Yo dije la verdad, revisen todo lo que quieran.', 'Me llegó lo que dije, no hay más que hablar.', 'Si no me creen, encuéstenme cuando puedan.']);
  }
  const op = esOp(S, p);
  const ami = op ? aliados(S, p) : [];
  if (op && (ami.includes(j) || ami.includes(v))) {
    return azar(['Yo les creo: la Mesa de Entradas viene cargada de Escándalos.', 'Mala suerte con las cartas, nada más. Les creo.', 'No busquemos fantasmas donde no hay.']);
  }
  const contradicen = c.chief > 0 && c.vocero === 0;
  if (op) {
    // Siembra dudas sobre alguno de la Campaña.
    const blanco = chance(0.5) ? j : v;
    return azar([`Para mí ${N(blanco)} se guardó la Propuesta.`, `No le creo nada a ${N(blanco)}.`, `${N(blanco)} está mintiendo, se le nota en la cara.`]);
  }
  if (contradicen) return `¿${N(j)} dice que pasó una Propuesta y ${N(v)} dice que no le llegó ninguna? Alguno de los dos miente.`;
  if (r.published === 'E' && c.vocero > 0) return `${N(v)} tenía una Propuesta y publicó un Escándalo. ¡Eso es traición!`;
  if (r.published === 'P') return azar(['Bien ahí, una Propuesta. Por ahora les creo.', 'Así se hace: Propuesta a la tapa. Les creo.']);
  return azar([`Tres Escándalos en la mano… qué mala suerte, ¿no? Mmm.`, `Les creo a medias. Los vamos a seguir mirando.`, `Anoten esta: ${N(j)} y ${N(v)} quedan en observación.`]);
}

function comentario(S, p) {
  const g = S.pub.game;
  const op = esOp(S, p);
  if (g.scandals >= 3 && chance(0.4)) return azar(DE_ZONA_ROJA);
  if (op && chance(0.45)) return azar(DE_DISIMULO);
  if (g.scandals > g.proposals && chance(0.5)) return azar(DE_ESCANDALO);
  return azar(DE_CAMPANA);
}

function frase(S, mem, p) {
  const g = S.pub.game;
  const j = g.candidate;
  const v = g.nominee;
  const N = (x) => nombre(S, x);
  const op = esOp(S, p);
  const { sc, motivos } = sospechas(S, p);
  const vota = votar(S, p);
  mem.intencion[g.round + '-' + p] = vota; // vota lo que dijo
  const partes = [];

  if (p === j) {
    partes.push(azar([`Confíen en esta fórmula: ${N(v)} tiene las manos limpias.`, `Elegí a ${N(v)} porque hasta ahora jugó derecho.`, `Con ${N(v)} de Vocero esto sale bien, palabra.`]));
  } else if (p === v) {
    partes.push(azar(['Si me votan, publico Propuestas, nada más.', 'Yo cuido el micrófono: conmigo no hay escándalos.', `${N(j)} me eligió porque sabe que conmigo no se juega.`]));
  }

  // A quién apunta: la Campaña al más sospechoso; los Operadores a un inocente.
  let blanco = null;
  if (op) {
    const ami = aliados(S, p).concat(p);
    const inocentes = L(g.order).filter((x) => g.alive[x] && !ami.includes(x));
    blanco = inocentes.sort((a, b) => sc[b] - sc[a])[0];
  } else {
    blanco = L(g.order).filter((x) => g.alive[x] && x !== p).sort((a, b) => sc[b] - sc[a])[0];
    if (blanco && sc[blanco] < 0.8) blanco = null;
  }
  if (blanco && p !== j && p !== v) {
    const m = motivos[blanco] || [];
    const veces = m.filter((x) => x === 'escandalo').length;
    if (m.includes('encuesta') && !op) partes.push(`La encuesta no miente: ${N(blanco)} es de los Operadores.`);
    else if (m.includes('traiciono')) partes.push(`${N(blanco)} dijo que le llegó una Propuesta y publicó un Escándalo. ¿En serio?`);
    else if (m.includes('mintio')) partes.push(`Las declaraciones de ${N(blanco)} no cierran por ningún lado.`);
    else if (veces >= 2) partes.push(`Ojo con ${N(blanco)}: estuvo en ${veces} gobiernos que publicaron Escándalos.`);
    else if (veces === 1) partes.push(`A ${N(blanco)} le vengo siguiendo los pasos desde el último Escándalo.`);
    else if (op) partes.push(azar([`${N(blanco)} habla poco y vota raro. Sospechoso.`, `${N(blanco)} vota raro, revisen el historial.`]));
  }

  if (p !== j && p !== v) {
    if (g.scandals >= 3 && !op) partes.push('Estamos en zona roja: cuidado a quién hacemos Vocero.');
    partes.push(vota ? azar(['Voy a votar Sí.', 'Le doy una chance: Sí.', 'Por ahora, Sí.']) : azar(['Yo voto No.', 'No me cierra, voto No.', 'Prefiero otra fórmula: No.']));
  }
  if (!partes.length) partes.push(azar(['Hmm… quiero escuchar a los demás.', 'Miren el historial, los votos dicen mucho.']));
  // Un comentario de campaña al principio o al final, para darle color.
  if (chance(0.7)) {
    const c = comentario(S, p);
    if (chance(0.5)) partes.unshift(c); else partes.splice(partes.length - 1, 0, c);
  }
  return partes.join(' ').slice(0, 240);
}
