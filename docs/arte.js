// Dibujos de BALLOTAGE. Todo hecho a mano en SVG para este juego.
// Personajes y partidos son inventados: "Tito Ventura" del
// "Movimiento Vamos Viendo" contra "Los de Enfrente".

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const COLORES_VOLANTE = ['#ffd23f', '#4cc9f0', '#ff7a1a', '#1ec8b0', '#ff8fc7', '#b8f35a'];
const PIELES = ['#f6d1b1', '#e9b48a', '#c98d5f', '#a86b43', '#7b4a2c', '#f3c4a0'];
const PELOS = ['#2b1b10', '#5a3a1a', '#9a6b2f', '#d9b44a', '#888', '#b03a2e', '#1d1a2b'];
const FONDOS = ['#ff2e88', '#ff7a1a', '#1ec8b0', '#4cc9f0', '#9b5de5', '#f15bb5', '#00bbf9', '#e63946'];

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

// Parte un texto en renglones de hasta `max` letras.
function renglones(texto, max) {
  const out = [];
  let linea = '';
  for (const pal of String(texto).split(' ')) {
    if ((linea + ' ' + pal).trim().length > max && linea) {
      out.push(linea);
      linea = pal;
    } else linea = (linea + ' ' + pal).trim();
  }
  if (linea) out.push(linea);
  return out;
}

const tspans = (lineas, x, dy) => lineas.map((l, i) => `<tspan x="${x}" dy="${i ? dy : 0}">${esc(l)}</tspan>`).join('');

// ------------------------------------------------------------------ Logo

export const logo = () => `<div class="logo-arte">
  <svg viewBox="0 0 320 120" role="img" aria-label="BALLOTAGE">
    <g transform="rotate(-4 160 60)">
      <rect x="18" y="22" width="284" height="74" rx="10" fill="#fff8e7" stroke="#1b1446" stroke-width="5"/>
      <rect x="18" y="22" width="284" height="16" rx="6" fill="#ff2e88"/>
      <text x="160" y="84" text-anchor="middle" font-family="Bowlby One, Arial Black, sans-serif" font-size="44" fill="#1b1446" letter-spacing="1">BALLOTAGE</text>
      <g transform="translate(270 4) rotate(14)">
        <rect width="34" height="44" rx="3" fill="#ffd23f" stroke="#1b1446" stroke-width="4"/>
        <path d="M8 22l7 8 12-16" stroke="#ff2e88" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </g>
  </svg>
</div>`;

export const logoChico = () => '<span class="logo-chico">BALLOTAGE</span>';

// ------------------------------------------------------------------ Caritas de jugadores

export function avatar(nombre) {
  const h = hash(nombre);
  const piel = PIELES[h % PIELES.length];
  const pelo = PELOS[(h >> 3) % PELOS.length];
  const fondo = FONDOS[(h >> 6) % FONDOS.length];
  const peinado = (h >> 9) % 5;
  const bigote = (h >> 12) % 4 === 0;
  const anteojos = (h >> 14) % 5 === 0;
  const boca = (h >> 16) % 3;
  const pelos = [
    `<path d="M14 26c0-12 8-18 18-18s18 6 18 18c-4-6-10-8-18-8s-14 2-18 8z" fill="${pelo}"/>`,
    `<path d="M13 30c-2-16 8-23 19-23s21 7 19 23c-2-5-4-9-6-10-6 3-20 3-26 0-2 1-4 5-6 10z" fill="${pelo}"/>`,
    `<circle cx="22" cy="14" r="7" fill="${pelo}"/><circle cx="32" cy="11" r="8" fill="${pelo}"/><circle cx="42" cy="14" r="7" fill="${pelo}"/>`,
    `<path d="M12 34c-4-20 6-27 20-27s24 7 20 27l-4-14c-8 4-24 4-32 0z" fill="${pelo}"/><path d="M12 30c-2 10 0 18 2 22M52 30c2 10 0 18-2 22" stroke="${pelo}" stroke-width="5" fill="none"/>`,
    `<path d="M18 16c6-6 22-6 28 0" stroke="${pelo}" stroke-width="4" fill="none"/>`,
  ][peinado];
  const bocas = [
    '<path d="M26 42q6 5 12 0" stroke="#1d1a2b" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    '<path d="M25 41q7 8 14 0z" fill="#1d1a2b"/>',
    '<path d="M27 43h10" stroke="#1d1a2b" stroke-width="2.5" stroke-linecap="round"/>',
  ][boca];
  return `<svg class="avatar" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="31" fill="${fondo}"/>
    <path d="M10 64c2-12 10-16 22-16s20 4 22 16z" fill="#fff8e7"/>
    <ellipse cx="32" cy="31" rx="17" ry="19" fill="${piel}"/>
    ${pelos}
    <circle cx="25" cy="30" r="2.6" fill="#1d1a2b"/><circle cx="39" cy="30" r="2.6" fill="#1d1a2b"/>
    ${anteojos ? '<g stroke="#1d1a2b" stroke-width="2" fill="none"><circle cx="25" cy="30" r="6"/><circle cx="39" cy="30" r="6"/><path d="M31 30h2"/></g>' : ''}
    ${bigote ? `<path d="M23 38q9-5 18 0q-9 3-18 0z" fill="${pelo}"/>` : ''}
    ${bocas}
  </svg>`;
}

// ------------------------------------------------------------------ Cargos

export const credencial = (candidato) => `<svg class="ico-cargo${candidato ? ' candidato' : ''}" viewBox="0 0 40 52" aria-label="Jefe de Campaña">
  <path d="M8 0l12 18L32 0" stroke="#ff2e88" stroke-width="5" fill="none"/>
  <rect x="11" y="15" width="18" height="6" rx="2" fill="#888"/>
  <rect x="4" y="19" width="32" height="31" rx="4" fill="#fff8e7" stroke="#1b1446" stroke-width="2.5"/>
  <rect x="4" y="19" width="32" height="9" rx="3" fill="#ffd23f"/>
  <text x="20" y="26.5" text-anchor="middle" font-size="6.5" font-weight="900" font-family="Arial Black, sans-serif" fill="#1b1446">JEFE</text>
  <circle cx="14" cy="37" r="5" fill="#4cc9f0"/>
  <path d="M22 34h10M22 39h8M10 45h22" stroke="#1b1446" stroke-width="2"/>
</svg>`;

export const microfono = (candidato) => `<svg class="ico-cargo${candidato ? ' candidato' : ''}" viewBox="0 0 40 52" aria-label="Vocero">
  <rect x="11" y="2" width="18" height="26" rx="9" fill="#1d1a2b"/>
  <path d="M13 9h14M13 14h14M13 19h14" stroke="#8a86a6" stroke-width="1.6"/>
  <rect x="9" y="24" width="22" height="8" rx="2" fill="#ff2e88"/>
  <text x="20" y="30.5" text-anchor="middle" font-size="5.5" font-weight="900" font-family="Arial Black, sans-serif" fill="#fff">VOZ</text>
  <path d="M6 22c0 10 6 16 14 16s14-6 14-16" stroke="#1d1a2b" stroke-width="2.5" fill="none"/>
  <path d="M20 38v8M12 48h16" stroke="#1d1a2b" stroke-width="3" stroke-linecap="round"/>
</svg>`;

// ------------------------------------------------------------------ Votación

export const boleta = (si) => `<svg viewBox="0 0 160 120" class="boleta-arte" aria-label="${si ? 'Sí' : 'No'}">
  <rect x="10" y="8" width="140" height="104" rx="6" fill="#fff8e7"/>
  <rect x="10" y="8" width="140" height="20" rx="6" fill="${si ? '#2bb673' : '#e63946'}"/>
  <text x="80" y="22" text-anchor="middle" font-size="10" font-weight="800" font-family="Rubik, sans-serif" fill="#fff" letter-spacing="2">BOLETA OFICIAL</text>
  <rect x="24" y="44" width="38" height="38" rx="4" fill="#fff" stroke="#1d1a2b" stroke-width="3"/>
  ${si
    ? '<path d="M31 63l8 9 17-22" stroke="#2bb673" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<path d="M32 52l22 22M54 52L32 74" stroke="#e63946" stroke-width="7" stroke-linecap="round"/>'}
  <text x="106" y="76" text-anchor="middle" font-family="Bowlby One, Arial Black, sans-serif" font-size="30" fill="#1d1a2b">${si ? '¡SÍ!' : '¡NO!'}</text>
  <path d="M24 98h112" stroke="#c9bd9c" stroke-width="2" stroke-dasharray="4 4"/>
</svg>`;

export const urna = () => `<svg class="urna" viewBox="0 0 200 170" aria-hidden="true">
  <g class="boletas-cayendo">
    <rect class="b1" x="70" y="0" width="34" height="44" rx="3" fill="#fff8e7" stroke="#1b1446" stroke-width="2"/>
    <rect class="b2" x="96" y="0" width="34" height="44" rx="3" fill="#ffd23f" stroke="#1b1446" stroke-width="2"/>
    <rect class="b3" x="83" y="0" width="34" height="44" rx="3" fill="#4cc9f0" stroke="#1b1446" stroke-width="2"/>
  </g>
  <path d="M30 70h140l-8 92H38z" fill="#1ec8b0" stroke="#1b1446" stroke-width="5" stroke-linejoin="round"/>
  <path d="M22 56h156v18H22z" fill="#ff2e88" stroke="#1b1446" stroke-width="5" stroke-linejoin="round"/>
  <rect x="66" y="61" width="68" height="8" rx="4" fill="#1b1446"/>
  <rect x="60" y="96" width="80" height="40" rx="6" fill="#fff8e7" stroke="#1b1446" stroke-width="3"/>
  <text x="100" y="122" text-anchor="middle" font-family="Bowlby One, Arial Black, sans-serif" font-size="17" fill="#1b1446">URNA</text>
</svg>`;

export const sobre = () => `<svg viewBox="0 0 60 44" class="sobre" aria-hidden="true">
  <rect x="2" y="2" width="56" height="40" rx="4" fill="#f3e9cf" stroke="#1b1446" stroke-width="3"/>
  <path d="M2 6l28 20L58 6" stroke="#1b1446" stroke-width="3" fill="none"/>
  <circle cx="30" cy="27" r="6" fill="#e63946"/>
</svg>`;

export const sobreSecreto = () => `<svg viewBox="0 0 240 170" class="sobre-grande" aria-hidden="true">
  <g transform="rotate(-3 120 85)">
    <rect x="10" y="20" width="220" height="140" rx="8" fill="#f3e9cf" stroke="#1b1446" stroke-width="5"/>
    <path d="M10 28l110 76L230 28" stroke="#1b1446" stroke-width="5" fill="#fff8e7" stroke-linejoin="round"/>
    <circle cx="120" cy="104" r="20" fill="#e63946" stroke="#1b1446" stroke-width="4"/>
    <text x="120" y="111" text-anchor="middle" font-family="Bowlby One, Arial Black, sans-serif" font-size="18" fill="#fff8e7">B</text>
    <g transform="rotate(-12 70 140)">
      <rect x="22" y="126" width="104" height="26" rx="3" fill="none" stroke="#e63946" stroke-width="4"/>
      <text x="74" y="145" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="13" fill="#e63946">SOLO PARA VOS</text>
    </g>
  </g>
</svg>`;

export const selloVetado = () => `<svg class="sello-vetado" viewBox="0 0 110 44" aria-label="Vetado">
  <g transform="rotate(-8 55 22)">
    <rect x="5" y="6" width="100" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="4"/>
    <rect x="10" y="11" width="90" height="22" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <text x="55" y="29" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="17" fill="currentColor" letter-spacing="2">VETADO</text>
  </g>
</svg>`;

// ------------------------------------------------------------------ Íconos de poderes

const ICONOS = {
  encuesta: `<svg viewBox="0 0 48 48" class="ico-poder" aria-label="Encuesta">
    <circle cx="24" cy="24" r="19" fill="#4cc9f0" stroke="#1b1446" stroke-width="3"/>
    <path d="M24 24V5a19 19 0 0 1 17.5 26.5z" fill="#ffd23f" stroke="#1b1446" stroke-width="3" stroke-linejoin="round"/>
    <path d="M24 24l17.5 7.5A19 19 0 0 1 14 40.3z" fill="#ff2e88" stroke="#1b1446" stroke-width="3" stroke-linejoin="round"/>
  </svg>`,
  carpeta: `<svg viewBox="0 0 48 48" class="ico-poder" aria-label="Mirar la carpeta">
    <path d="M4 12h14l4 5h22v23H4z" fill="#f4b740" stroke="#1b1446" stroke-width="3" stroke-linejoin="round"/>
    <rect x="9" y="14" width="28" height="16" fill="#fff8e7" stroke="#1b1446" stroke-width="2" transform="rotate(-6 23 22)"/>
    <path d="M4 20h40v20H4z" fill="#ffd23f" stroke="#1b1446" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="33" cy="31" r="6" fill="#fff" stroke="#1b1446" stroke-width="3"/><path d="M37.5 35.5l5 5" stroke="#1b1446" stroke-width="3.5" stroke-linecap="round"/>
  </svg>`,
  bajada: `<svg viewBox="0 0 48 48" class="ico-poder" aria-label="Bajada de línea">
    <path d="M6 19h8l20-11v32L14 29H6z" fill="#ff7a1a" stroke="#1b1446" stroke-width="3" stroke-linejoin="round"/>
    <path d="M10 29l3 12h6l-3-12" fill="#fff8e7" stroke="#1b1446" stroke-width="3" stroke-linejoin="round"/>
    <path d="M38 17c3 2 3 10 0 12M41 12c6 4 6 18 0 22" stroke="#1b1446" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`,
  carpetazo: `<svg viewBox="0 0 48 48" class="ico-poder" aria-label="Carpetazo">
    <path d="M4 12h14l4 5h22v25H4z" fill="#d9a441" stroke="#1b1446" stroke-width="3" stroke-linejoin="round"/>
    <path d="M4 19h40v23H4z" fill="#f4b740" stroke="#1b1446" stroke-width="3" stroke-linejoin="round"/>
    <g transform="rotate(-14 24 31)"><rect x="5" y="25" width="38" height="12" rx="2" fill="#fff8e7" stroke="#e63946" stroke-width="2.5"/>
    <text x="24" y="34" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="6.4" fill="#e63946">CONFIDENCIAL</text></g>
  </svg>`,
};
export const iconoPoder = (p) => ICONOS[p] || '';

const NOMBRE_PODER = { encuesta: 'Encuesta', carpeta: 'Mirar la carpeta', bajada: 'Bajada de línea', carpetazo: 'Carpetazo' };

// ------------------------------------------------------------------ Cartas

export function volante(texto, i, grande) {
  const color = COLORES_VOLANTE[i % COLORES_VOLANTE.length];
  const giro = [-4, 3, -2, 5, -3, 2][i % 6];
  const l = renglones(texto, 11).slice(0, 4);
  return `<svg class="volante${grande ? ' grande' : ''}" viewBox="0 0 100 130" style="--giro:${giro}deg" aria-label="Propuesta: ${esc(texto)}">
    <rect x="6" y="8" width="88" height="116" fill="${color}" stroke="#1b1446" stroke-width="2.5"/>
    <rect x="32" y="2" width="36" height="12" fill="rgba(255,255,255,.65)" transform="rotate(-4 50 8)"/>
    <text x="50" y="30" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="8.5" fill="#1b1446" letter-spacing="1">PROPUESTA</text>
    <path d="M18 36h64" stroke="#1b1446" stroke-width="2"/>
    <text x="50" y="${66 - l.length * 6}" text-anchor="middle" font-family="Permanent Marker, Comic Sans MS, cursive" font-size="12.5" fill="#1b1446">${tspans(l, 50, 14)}</text>
    <text x="50" y="116" text-anchor="middle" font-family="Rubik, sans-serif" font-size="6" font-weight="800" fill="#1b1446">TITO VENTURA · VAMOS VIENDO</text>
  </svg>`;
}

export function titular(texto, grande) {
  const l = renglones(texto.toUpperCase(), 10).slice(0, 4);
  return `<svg class="titular${grande ? ' grande' : ''}" viewBox="0 0 100 130" aria-label="Escándalo: ${esc(texto)}">
    <path d="M5 6h90l-2 8 3 8-2 10 2 90H6l2-12-3-10 2-8z" fill="#f2efe6" stroke="#1b1446" stroke-width="2"/>
    <rect x="10" y="12" width="80" height="14" fill="#e63946"/>
    <text x="50" y="23" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="9" fill="#fff" letter-spacing="1">¡ESCÁNDALO!</text>
    <text x="50" y="${48 - (l.length - 1) * 2}" text-anchor="middle" font-family="Bowlby One, Arial Black, sans-serif" font-size="10.5" fill="#1d1a2b">${tspans(l, 50, 12)}</text>
    <rect x="12" y="98" width="30" height="20" fill="#8a86a6"/>
    <path d="M47 100h40M47 105h40M47 110h34M47 115h38" stroke="#8a86a6" stroke-width="2"/>
  </svg>`;
}

// Carta en la mano (privada). `i` solo cambia el dibujo, no el contenido.
export function carta(c, i) {
  const frases = c === 'P'
    ? ['Asado gratis los domingos', 'Wifi libre en cada plaza', 'Feriado puente todos los meses', 'Siesta obligatoria']
    : ['¡Encontraron los bolsos!', 'Audio filtrado', 'Choripanes truchos', 'Fiesta en el búnker'];
  const f = frases[i % frases.length];
  return `<div class="carta-mano ${c === 'P' ? 'prop' : 'esc'}">${c === 'P' ? volante(f, i) : titular(f)}<span>${c === 'P' ? 'Propuesta' : 'Escándalo'}</span></div>`;
}

// ------------------------------------------------------------------ Roles

const RETRATOS = {
  campana: `<svg viewBox="0 0 160 170" class="retrato" aria-label="Militante de campaña">
    <circle cx="80" cy="82" r="76" fill="#1ec8b0"/>
    <path d="M118 30l8 90" stroke="#5a3a1a" stroke-width="5"/>
    <path d="M126 32l28 6-3 22-28-4z" fill="#ffd23f" stroke="#1b1446" stroke-width="3"/>
    <path d="M24 170c4-34 24-46 56-46s52 12 56 46z" fill="#ff2e88" stroke="#1b1446" stroke-width="4"/>
    <text x="80" y="160" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="13" fill="#fff">VAMOS VIENDO</text>
    <ellipse cx="80" cy="80" rx="34" ry="38" fill="#f3c4a0" stroke="#1b1446" stroke-width="4"/>
    <path d="M44 62c4-26 22-34 36-34s32 8 36 34z" fill="#ffd23f" stroke="#1b1446" stroke-width="4"/>
    <path d="M40 62h70l-6 8H44z" fill="#ffd23f" stroke="#1b1446" stroke-width="4" stroke-linejoin="round"/>
    <path d="M80 34l4 9h9l-7 6 3 9-9-5-9 5 3-9-7-6h9z" fill="#ff2e88"/>
    <circle cx="67" cy="82" r="4.5" fill="#1d1a2b"/><circle cx="93" cy="82" r="4.5" fill="#1d1a2b"/>
    <circle cx="58" cy="94" r="6" fill="#ff8fc7" opacity=".6"/><circle cx="102" cy="94" r="6" fill="#ff8fc7" opacity=".6"/>
    <path d="M66 98q14 14 28 0" stroke="#1d1a2b" stroke-width="4" fill="#fff" stroke-linecap="round"/>
    <circle cx="112" cy="140" r="11" fill="#4cc9f0" stroke="#1b1446" stroke-width="3"/><circle cx="112" cy="140" r="4" fill="#fff"/>
  </svg>`,
  operador: `<svg viewBox="0 0 160 170" class="retrato" aria-label="Operador del Rival">
    <circle cx="80" cy="82" r="76" fill="#9b5de5"/>
    <path d="M20 170c4-36 26-50 60-50s56 14 60 50z" fill="#5e5a7a" stroke="#1b1446" stroke-width="4"/>
    <path d="M52 124l28 30 28-30 10 46H42z" fill="#3b375a" stroke="#1b1446" stroke-width="4" stroke-linejoin="round"/>
    <path d="M74 128h12l-2 30h-8z" fill="#e63946"/>
    <ellipse cx="80" cy="84" rx="32" ry="36" fill="#e9b48a" stroke="#1b1446" stroke-width="4"/>
    <path d="M36 58h88l-10 6H46z" fill="#1d1a2b"/>
    <path d="M50 58c2-22 14-30 30-30s28 8 30 30z" fill="#3b375a" stroke="#1b1446" stroke-width="4"/>
    <rect x="50" y="52" width="60" height="6" fill="#e63946"/>
    <path d="M52 78h56v6c0 8-6 12-14 12s-12-4-14-10c-2 6-6 10-14 10s-14-4-14-12z" fill="#1d1a2b"/>
    <path d="M60 82l8-3" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M68 104q12 6 24-2" stroke="#1d1a2b" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M112 86c6 0 8 6 6 12" stroke="#1d1a2b" stroke-width="3" fill="none"/><circle cx="117" cy="100" r="3" fill="#1d1a2b"/>
  </svg>`,
  topo: `<svg viewBox="0 0 160 170" class="retrato" aria-label="El Topo">
    <circle cx="80" cy="82" r="76" fill="#e63946"/>
    <path d="M20 170c4-36 26-48 60-48s56 12 60 48z" fill="#1d1a2b" stroke="#1b1446" stroke-width="4"/>
    <path d="M60 122l20 26 20-26" fill="#fff8e7" stroke="#1b1446" stroke-width="3"/>
    <path d="M74 128l6 4 6-4-6 22z" fill="#ffd23f"/>
    <ellipse cx="80" cy="84" rx="42" ry="40" fill="#7b5a44" stroke="#1b1446" stroke-width="4"/>
    <circle cx="44" cy="54" r="10" fill="#7b5a44" stroke="#1b1446" stroke-width="4"/><circle cx="116" cy="54" r="10" fill="#7b5a44" stroke="#1b1446" stroke-width="4"/>
    <ellipse cx="80" cy="104" rx="24" ry="16" fill="#c9a185"/>
    <ellipse cx="80" cy="96" rx="9" ry="7" fill="#ff8fc7" stroke="#1b1446" stroke-width="3"/>
    <path d="M50 74h60v6c0 7-5 11-13 11s-12-4-13-9h-8c-1 5-5 9-13 9s-13-4-13-11z" fill="#1d1a2b"/>
    <path d="M58 78l8-2" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M66 106c-8 0-16 4-22 2M94 106c8 0 16 4 22 2" stroke="#1b1446" stroke-width="2.5" fill="none"/>
    <path d="M74 112h12v6h-12z" fill="#fff" stroke="#1b1446" stroke-width="2"/>
    <path d="M30 150c-6-4-8-12-2-16M130 150c6-4 8-12 2-16" stroke="#7b5a44" stroke-width="10" stroke-linecap="round"/>
  </svg>`,
};
export const retratoRol = (rol) => RETRATOS[rol] || '';

export function titularFinal(ganoCampana) {
  const sup = ganoCampana ? 'EDICIÓN ESPECIAL' : 'ÚLTIMO MOMENTO';
  const tit = ganoCampana ? ['¡GANAMOS EN', 'PRIMERA VUELTA!'] : ['¡OPERACIÓN', 'CONSUMADA!'];
  const baj = ganoCampana ? 'Festejos con bombos y choripán en el búnker' : 'Los de Enfrente brindan: la campaña se hundió';
  return `<svg class="titular-final" viewBox="0 0 320 150" aria-label="${esc(tit.join(' '))}">
    <rect x="6" y="6" width="308" height="138" fill="#f2efe6" stroke="#1b1446" stroke-width="3"/>
    <text x="160" y="30" text-anchor="middle" font-family="Bowlby One, Arial Black, sans-serif" font-size="20" fill="#1d1a2b">EL BOCHINCHE</text>
    <path d="M16 38h288M16 42h288" stroke="#1d1a2b" stroke-width="1.5"/>
    <text x="160" y="56" text-anchor="middle" font-family="Rubik, sans-serif" font-size="9" font-weight="800" fill="#e63946" letter-spacing="2">${sup}</text>
    <text x="160" y="86" text-anchor="middle" font-family="Bowlby One, Arial Black, sans-serif" font-size="26" fill="#1d1a2b">${tit[0]}</text>
    <text x="160" y="114" text-anchor="middle" font-family="Bowlby One, Arial Black, sans-serif" font-size="26" fill="#1d1a2b">${tit[1]}</text>
    <text x="160" y="134" text-anchor="middle" font-family="Rubik, sans-serif" font-size="10" fill="#5e5a7a">${esc(baj)}</text>
  </svg>`;
}

export function credencialAfiliado(nombre, bando) {
  const camp = bando === 'campana';
  return `<div class="credencial-afiliado">
    <svg viewBox="0 0 300 180" aria-label="Credencial de ${esc(nombre)}: ${camp ? 'Campaña' : 'Operadores'}">
      <rect x="4" y="4" width="292" height="172" rx="14" fill="#fff8e7" stroke="#1b1446" stroke-width="4"/>
      <rect x="4" y="4" width="292" height="36" rx="12" fill="#1b1446"/>
      <text x="150" y="28" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="13" fill="#ffd23f" letter-spacing="1">CREDENCIAL DE AFILIADO</text>
      <rect x="20" y="54" width="74" height="92" rx="6" fill="#4cc9f0" stroke="#1b1446" stroke-width="3"/>
      <circle cx="57" cy="86" r="18" fill="#f3c4a0" stroke="#1b1446" stroke-width="3"/>
      <path d="M30 146c2-22 12-30 27-30s25 8 27 30z" fill="#1b1446"/>
      <text x="57" y="94" text-anchor="middle" font-family="Bowlby One, Arial Black, sans-serif" font-size="20" fill="#1b1446">?</text>
      <text x="108" y="66" font-family="Rubik, sans-serif" font-size="10" font-weight="800" fill="#8a86a6">NOMBRE</text>
      <text x="108" y="86" font-family="Bowlby One, Arial Black, sans-serif" font-size="18" fill="#1d1a2b">${esc(String(nombre).slice(0, 14))}</text>
      <text x="108" y="108" font-family="Rubik, sans-serif" font-size="10" font-weight="800" fill="#8a86a6">BANDO</text>
      <g transform="rotate(-8 196 136)">
        <rect x="110" y="114" width="172" height="40" rx="6" fill="none" stroke="${camp ? '#0b8a78' : '#e63946'}" stroke-width="5"/>
        <text x="196" y="142" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="${camp ? 22 : 18}" fill="${camp ? '#0b8a78' : '#e63946'}">${camp ? 'CAMPAÑA' : 'OPERADORES'}</text>
      </g>
    </svg>
  </div>`;
}

// ------------------------------------------------------------------ Tableros

export function tableroPropuestas(n, frases) {
  let casillas = '';
  for (let i = 0; i < 5; i++) {
    const llena = i < n;
    casillas += `<div class="casillero ${llena ? 'lleno' : ''} ${i === 4 ? 'meta' : ''}">
      ${llena ? volante(frases[i % frases.length], i) : `<span class="num">${i + 1}</span>${i === 4 ? '<span class="meta-txt">¡Ganamos en primera vuelta!</span>' : ''}`}
    </div>`;
  }
  return `<div class="tab-prop">
    <div class="afiche">
      <div class="afiche-cab">
        <span class="afiche-sup">Movimiento Vamos Viendo</span>
        <span class="afiche-tit">PROPUESTAS</span>
        <span class="afiche-sub">Tito Ventura presidente · ${n}/5</span>
      </div>
      <div class="casilleros cinco">${casillas}</div>
    </div>
  </div>`;
}

export function tableroEscandalos(n, board, jugadores, frases) {
  const edicion = jugadores <= 6 ? '5-6' : jugadores <= 8 ? '7-8' : '9-10';
  let casillas = '';
  for (let i = 0; i < 6; i++) {
    const llena = i < n;
    const poder = board[i];
    const roja = i >= 2;
    const contenido = llena
      ? titular(frases[i % frases.length])
      : `<span class="num">${i + 1}</span>
         ${poder ? `${iconoPoder(poder)}<span class="poder-txt">${NOMBRE_PODER[poder]}</span>` : ''}
         ${i === 4 ? `<span class="veto-mini">${selloVetado()}</span>` : ''}
         ${i === 5 ? '<span class="poder-txt fin">¡Se hundió la campaña!</span>' : ''}`;
    casillas += `<div class="casillero ${llena ? 'lleno' : ''} ${roja ? 'rojo' : ''}">${contenido}</div>`;
  }
  return `<div class="tab-esc">
    <div class="diario">
      <div class="diario-cab">
        <span class="diario-nom">EL BOCHINCHE</span>
        <span class="diario-sub">Diario sensacionalista · Edición ${edicion} jugadores · ${n}/6 escándalos</span>
      </div>
      <div class="casilleros seis">${casillas}</div>
      <div class="zona-roja ${n >= 3 ? 'activa' : ''}"><span>⚠ ZONA ROJA</span> desde el 3.er Escándalo: si El Topo es Vocero, ganan los Operadores</div>
    </div>
  </div>`;
}

export function contadorCrisis(c) {
  // Gráfico de encuestas que se desploma en 3 escalones.
  const pts = [[14, 22], [46, 40], [78, 58], [110, 80]];
  const camino = 'M' + pts.map((p, i) => (i ? `H${p[0]}V${p[1]}` : `${p[0]} ${p[1]}`)).join('');
  const etiquetas = ['Estable', 'Baja', 'Se cae', '¡Cacerolazo!'];
  return `<div class="mini crisis">
    <svg viewBox="0 0 124 100" aria-label="Crisis ${c} de 3">
      <rect x="2" y="2" width="120" height="96" rx="8" fill="#fff8e7"/>
      <path d="M12 12v74h106" stroke="#c9bd9c" stroke-width="2" fill="none"/>
      <path d="${camino}" stroke="#e63946" stroke-width="4" fill="none" stroke-linejoin="round"/>
      ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === c ? 8 : 5}" fill="${i <= c ? '#e63946' : '#fff8e7'}" stroke="#1b1446" stroke-width="2.5" class="${i === c ? 'pulso' : ''}"/>`).join('')}
      <text x="112" y="96" text-anchor="end" font-family="Arial Black, sans-serif" font-size="9" fill="#e63946">¡CACEROLAZO!</text>
    </svg>
    <span>Crisis ${c}/3 · ${etiquetas[c]}</span>
  </div>`;
}

export function mesaEntradas(n) {
  const pila = Math.min(6, Math.ceil(n / 3));
  let hojas = '';
  for (let i = 0; i < pila; i++) hojas += `<rect x="${24 + (i % 2) * 3}" y="${56 - i * 6}" width="64" height="10" rx="1.5" fill="${i % 2 ? '#fff8e7' : '#f3e9cf'}" stroke="#1b1446" stroke-width="1.5"/>`;
  return `<div class="mini">
    <svg viewBox="0 0 112 90" aria-label="Mesa de Entradas: ${n} cartas">
      ${hojas}
      <path d="M10 60h92l-8 20H18z" fill="#4cc9f0" stroke="#1b1446" stroke-width="3" stroke-linejoin="round"/>
      <text x="56" y="75" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="8" fill="#1b1446">ENTRADA</text>
    </svg>
    <span>Mesa de Entradas · ${n}</span>
  </div>`;
}

export function trituradora(n) {
  let tiras = '';
  const cant = Math.min(8, n);
  for (let i = 0; i < cant; i++) tiras += `<path d="M${30 + i * 7} 62 q${i % 2 ? 3 : -3} 9 0 ${12 + (i % 3) * 4}" stroke="${i % 2 ? '#fff8e7' : '#f3e9cf'}" stroke-width="4" fill="none"/>`;
  return `<div class="mini">
    <svg viewBox="0 0 112 90" aria-label="La Trituradora: ${n} cartas">
      <rect x="34" y="4" width="44" height="22" fill="#fff8e7" stroke="#1b1446" stroke-width="2" class="hoja-tritu"/>
      <rect x="16" y="20" width="80" height="40" rx="6" fill="#8a86a6" stroke="#1b1446" stroke-width="3"/>
      <rect x="24" y="24" width="64" height="5" rx="2" fill="#1b1446"/>
      <circle cx="84" cy="46" r="4" fill="${n ? '#2bb673' : '#e63946'}"/>
      <text x="48" y="50" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="7" fill="#1b1446">TRITURA</text>
      ${tiras}
    </svg>
    <span>La Trituradora · ${n}</span>
  </div>`;
}
