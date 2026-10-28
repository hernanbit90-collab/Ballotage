// El "árbitro" de BALLOTAGE: recibe los pedidos de los celulares, verifica
// que sean legales y actualiza la sala en la base de datos.

'use strict';

const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const engine = require('./engine');

initializeApp();

const rnd = (n) => crypto.randomInt(n);
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O para no confundir

function codigoNuevo() {
  let c = '';
  for (let i = 0; i < 4; i++) c += LETRAS[rnd(LETRAS.length)];
  return c;
}

function normalizarCodigo(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (c.length !== 4) throw new HttpsError('invalid-argument', 'El código de sala tiene 4 letras.');
  return c;
}

// Corre `cambio(sala)` dentro de una transacción. `cambio` puede tirar
// ErrorJuego; en ese caso no se guarda nada y se avisa al celular.
async function transaccion(code, cambio) {
  const ref = getDatabase().ref('rooms/' + code);
  let error = null;
  let resultado;
  const res = await ref.transaction((sala) => {
    // La primera pasada puede venir vacía aunque la sala exista: devolvemos
    // null y Firebase reintenta con el valor real.
    if (sala === null) return null;
    error = null;
    try {
      resultado = cambio(sala);
      return sala;
    } catch (e) {
      error = e;
      return undefined; // aborta sin guardar
    }
  });
  if (error) {
    if (error instanceof engine.ErrorJuego) throw new HttpsError('failed-precondition', error.message);
    throw error;
  }
  if (!res.snapshot.exists()) throw new HttpsError('not-found', 'No existe una sala con ese código.');
  return resultado;
}

exports.ballotage = onCall({ region: 'us-central1', maxInstances: 10 }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Hace falta iniciar sesión.');
  const d = req.data || {};
  const ahora = Date.now();

  if (d.op === 'create') {
    let name;
    try {
      name = engine.limpiarNombre(d.name);
    } catch (e) {
      throw new HttpsError('invalid-argument', e.message);
    }
    for (let intento = 0; intento < 20; intento++) {
      const code = codigoNuevo();
      const ref = getDatabase().ref('rooms/' + code);
      const res = await ref.transaction((sala) => {
        if (sala !== null) return undefined; // código ocupado
        return engine.crearSala(code, uid, name, ahora);
      });
      if (res.committed) return { code, pid: 'p1' };
    }
    throw new HttpsError('resource-exhausted', 'No pude generar un código. Probá de nuevo.');
  }

  const code = normalizarCodigo(d.code);

  if (d.op === 'join') {
    const name = (() => {
      try {
        return engine.limpiarNombre(d.name);
      } catch (e) {
        throw new HttpsError('invalid-argument', e.message);
      }
    })();
    const pid = await transaccion(code, (sala) => {
      sala.pub.lastActivity = ahora;
      return engine.unirse(sala, uid, name, d.pin, ahora);
    });
    return { code, pid };
  }

  if (d.op === 'act') {
    await transaccion(code, (sala) => {
      const pid = sala.auth && sala.auth[uid];
      if (!pid) throw new engine.ErrorJuego('No estás en esta sala.');
      engine.aplicar(sala, pid, d.action || {}, rnd);
      sala.pub.lastActivity = ahora;
    });
    return { ok: true };
  }

  throw new HttpsError('invalid-argument', 'Pedido desconocido.');
});
