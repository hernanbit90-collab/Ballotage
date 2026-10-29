// ⚠️ ESTE ES EL ÚNICO ARCHIVO QUE TENÉS QUE TOCAR.
// Reemplazá los valores de abajo por los que te da Firebase
// (Configuración del proyecto → Tus apps → App web → "firebaseConfig").
// Estos datos NO son secretos: está bien que estén a la vista.

export const firebaseConfig = {
  apiKey: 'AIzaSyCx1oEiU139Y2GgcYMboqFzMz1Vq5VwpBw',
  authDomain: 'ballotage-4edb5.firebaseapp.com',
  databaseURL: 'https://ballotage-4edb5-default-rtdb.firebaseio.com',
  projectId: 'ballotage-4edb5',
  storageBucket: 'ballotage-4edb5.firebasestorage.app',
  messagingSenderId: '262767289418',
  appId: '1:262767289418:web:139f87968b62966d7af2b3',
};

// Dónde corre el árbitro:
//   'gratis'   -> en el celular del anfitrión (plan gratuito, sin tarjeta).
//   'servidor' -> en Firebase Cloud Functions (plan Blaze; nadie puede espiar).
export const MODO = 'gratis';

// Región donde corre el árbitro en modo 'servidor'. No la cambies salvo que sepas lo que hacés.
export const REGION = 'us-central1';

// Audio del debate: servidores extra para redes que bloquean la conexión
// directa entre celulares (TURN). Vacío = solo conexión directa.
export const ICE_EXTRA = [];
