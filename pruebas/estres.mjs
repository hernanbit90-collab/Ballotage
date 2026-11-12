// Prueba de carga: muchas salas a la vez, cada una con jugadores reales
// conectados a Firebase (emulador), jugando partidas completas.
// Uso (con los emuladores de Firebase prendidos y el paquete "firebase" instalado):
//   node pruebas/estres.mjs <salas> <jugadoresPorSala | mix>
// FIREBASE_DIR = carpeta donde está node_modules/firebase (por defecto, la actual).
import { createRequire } from 'node:module';
const require = createRequire((process.env.FIREBASE_DIR || process.cwd()).replace(/\/?$/, '/'));
const { initializeApp } = require('firebase/app');
const AU = require('firebase/auth');
const DB = require('firebase/database');

// En el navegador motor.js deja el árbitro en globalThis; en Node es CommonJS.
globalThis.BallotageEngine = createRequire(import.meta.url)('../docs/motor.js');
const SALAS = Number(process.argv[2] || 10);
const MIX = process.argv[3] === 'mix';
const POR_SALA = MIX ? 0 : Number(process.argv[3] || 5);
const tam = (n) => (MIX ? 5 + (n % 6) : POR_SALA); // de 5 a 10 jugadores
const ANF = new URL('../docs/anfitrion.js', import.meta.url).href;
const cfg = { apiKey: 'demo', projectId: 'demo-ballotage', databaseURL: 'http://127.0.0.1:9000/?ns=demo-ballotage' };
const azar = (xs) => xs[Math.floor(Math.random() * xs.length)];
const lista = (x) => (Array.isArray(x) ? x : x ? Object.values(x) : []);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let nApp = 0;

async function jugador(nombre) {
  const yo = nApp++;
  const app = initializeApp(cfg, 'a' + yo);
  const auth = AU.getAuth(app);
  AU.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = DB.getDatabase(app);
  DB.connectDatabaseEmulator(db, '127.0.0.1', 9000);
  const email = nombre.toLowerCase().replace(/\W/g, '') + Date.now() + Math.random().toString(36).slice(2, 6) + '@prueba.com';
  const cred = await AU.createUserWithEmailAndPassword(auth, email, 'secreto123');
  // Cada jugador tiene su propio "celular": su propia copia del módulo del árbitro.
  const A = await import(ANF + '?inst=' + yo);
  A.iniciar({ fb: DB, db });
  A.usuario(cred.user.uid);
  return { nombre, db, auth, A, uid: cred.user.uid, email, pid: null, pub: null, priv: null, ocupado: false };
}

// Qué haría un jugador mirando SOLO lo que puede ver (pub y su priv).
function jugada(j) {
  const g = j.pub && j.pub.game;
  if (!g || j.pub.status !== 'playing' || !g.alive || !g.alive[j.pid]) return null;
  const vivos = lista(g.order).filter((p) => g.alive[p]);
  switch (g.phase) {
    case 'nominate': return g.candidate === j.pid ? { type: 'nominate', target: azar(vivos.filter((p) => p !== j.pid)) } : null;
    case 'debate': return g.debate && lista(g.debate.order)[g.debate.idx] === j.pid ? { type: 'debateNext', idx: g.debate.idx } : null;
    case 'vote': return !(g.voted && g.voted[j.pid]) ? { type: 'vote', vote: Math.random() < 0.7 } : null;
    case 'chiefDiscard': return g.chief === j.pid ? { type: 'chiefDiscard', index: Math.floor(Math.random() * 3) } : null;
    case 'voceroDiscard': return g.vocero === j.pid ? { type: 'voceroDiscard', index: Math.floor(Math.random() * 2) } : null;
    case 'vetoReply': return g.chief === j.pid ? { type: 'vetoReply', accept: Math.random() < 0.5 } : null;
    case 'declare': {
      const r = lista(g.history)[lista(g.history).length - 1] || {};
      const ya = r.declared || {};
      if (g.chief === j.pid && !ya.chief) return { type: 'declare', proposals: Math.floor(Math.random() * 4) };
      if (g.vocero === j.pid && !ya.vocero) return { type: 'declare', proposals: Math.floor(Math.random() * 3) };
      return null;
    }
    case 'charla': return j.pub.host === j.pid ? { type: 'charlaFin' } : null;
    case 'power': return g.chief === j.pid ? { type: 'power', target: azar(vivos.filter((p) => p !== j.pid)) } : null;
    default: return null;
  }
}

async function actuar(j, code, stats) {
  if (j.ocupado) return;
  const a = jugada(j);
  if (!a) return;
  j.ocupado = true;
  try {
    await j.A.pedir({ op: 'act', code, action: a }, j.email);
    stats.jugadas++;
  } catch (e) {
    // Una jugada rechazada por las reglas (Vocero inválido, ya votó...) es normal: se reintenta.
    if (/anfitrión no responde|No pude mandar/.test(e.message)) stats.sinRespuesta++;
    else stats.rechazadas++;
  } finally {
    j.ocupado = false;
  }
}

async function sala(n, stats) {
  const t0 = Date.now();
  const js = [];
  for (let k = 0; k < tam(n); k++) js.push(await jugador('S' + n + 'J' + k));
  const [host, ...resto] = js;
  const { data } = await host.A.pedir({ op: 'create', name: host.nombre }, host.email);
  const code = data.code;
  host.pid = data.pid;
  await Promise.all(resto.map(async (j) => {
    const r = await j.A.pedir({ op: 'join', code, name: j.nombre }, j.email).catch(async (e) => {
      const tok = await j.auth.currentUser.getIdTokenResult();
      console.log('JOIN FALLÓ', code, j.email, 'token:', tok.claims.email, e.message);
      throw e;
    });
    j.pid = r.data.pid;
  }));
  for (const j of js) {
    DB.onValue(DB.ref(j.db, 'rooms/' + code + '/pub'), (s) => { j.pub = s.val(); actuar(j, code, stats); });
    DB.onValue(DB.ref(j.db, 'rooms/' + code + '/priv/' + j.pid), (s) => { j.priv = s.val(); });
  }
  await host.A.pedir({ op: 'act', code, action: { type: 'settings', debate: 0, voteTime: 0, declare: true, charla: 0, voice: false } }, host.email);
  await host.A.pedir({ op: 'act', code, action: { type: 'start' } }, host.email);
  // Juega hasta que termine (con un "latido" por si algún evento se perdió).
  const limite = Date.now() + 240000;
  while (Date.now() < limite) {
    const g = host.pub && host.pub.game;
    if (g && g.phase === 'ended') break;
    for (const j of js) actuar(j, code, stats);
    await dormir(400);
  }
  // Los demás celulares reciben el final un instante después: se espera hasta 10 s.
  for (let i = 0; i < 50 && !js.every((j) => j.pub && j.pub.game && j.pub.game.phase === 'ended'); i++) await dormir(200);
  const g = host.pub && host.pub.game;
  // Controles: cada jugador está en SU sala y ve el mismo final; nadie ve roles ajenos.
  const pids = Object.keys(host.pub.players || {});
  const nombresOk = pids.every((p) => host.pub.players[p].name.startsWith('S' + n + 'J'));
  const todosVenFinal = js.every((j) => j.pub && j.pub.game && j.pub.game.phase === 'ended' && j.pub.game.winner === g.winner);
  let espiaron = 0;
  for (const j of resto) {
    const otro = js.find((x) => x !== j);
    const intento = await DB.get(DB.ref(j.db, 'rooms/' + code + '/priv/' + otro.pid)).then(() => 'leyo').catch(() => 'bloqueado');
    const secreto = await DB.get(DB.ref(j.db, 'rooms/' + code + '/hostsec')).then(() => 'leyo').catch(() => 'bloqueado');
    if (intento === 'leyo' || secreto === 'leyo') espiaron++;
  }
  for (const j of js) j.A.detener();
  return { n, code, fin: g && g.phase === 'ended', ganador: g && g.winner, rondas: g && g.round, seg: Math.round((Date.now() - t0) / 1000), nombresOk, todosVenFinal, espiaron };
}

const stats = { jugadas: 0, rechazadas: 0, sinRespuesta: 0 };
const t0 = Date.now();
const total = Array.from({ length: SALAS }, (_, i) => tam(i)).reduce((a, b) => a + b, 0);
console.log(`Prueba: ${SALAS} salas a la vez, ${MIX ? 'de 5 a 10' : POR_SALA} jugadores por sala = ${total} jugadores conectados`);
const res = await Promise.all(Array.from({ length: SALAS }, (_, i) => sala(i, stats).catch((e) => ({ n: i, error: e.message }))));
const ok = res.filter((r) => r.fin && r.nombresOk && r.todosVenFinal && !r.espiaron);
const codigos = new Set(res.map((r) => r.code).filter(Boolean));
console.log(JSON.stringify({
  salas: SALAS,
  terminadas_ok: ok.length,
  con_error: res.filter((r) => r.error).map((r) => r.error).slice(0, 5),
  sin_terminar: res.filter((r) => !r.error && !r.fin).length,
  codigos_unicos: codigos.size,
  mezcla_de_salas: res.filter((r) => r.nombresOk === false).length,
  vieron_final_distinto: res.filter((r) => r.todosVenFinal === false).length,
  intentos_de_espiar_que_funcionaron: res.reduce((a, r) => a + (r.espiaron || 0), 0),
  ganadores: res.reduce((a, r) => { if (r.ganador) a[r.ganador] = (a[r.ganador] || 0) + 1; return a; }, {}),
  rondas_promedio: Math.round(res.reduce((a, r) => a + (r.rondas || 0), 0) / Math.max(1, ok.length) * 10) / 10,
  jugadas: stats.jugadas,
  rechazadas_por_reglas: stats.rechazadas,
  pedidos_sin_respuesta: stats.sinRespuesta,
  segundos: Math.round((Date.now() - t0) / 1000),
}, null, 1));
process.exit(0);
