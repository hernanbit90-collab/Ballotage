// Dibujos del juego (etapa 1: versión simple).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const logo = () => '<h1 class="logo">BALLOTAGE</h1>';
export const logoChico = () => '<span class="logo-chico">BALLOTAGE</span>';
export const credencial = () => '<span class="ico">🪪</span>';
export const microfono = () => '<span class="ico">🎤</span>';
export const avatar = (n) => `<span class="avatar">${esc(n).slice(0, 1).toUpperCase()}</span>`;
export const boleta = (si) => `<span class="boleta-txt">${si ? '¡Sí!' : '¡No!'}</span>`;
export const urna = () => '<div class="urna-simple">🗳️</div>';
export const sobre = () => '✉️';
export const sobreSecreto = () => '<div class="emoji-grande">✉️</div>';
export const selloVetado = () => '⛔';
const ICONOS = { encuesta: '📊', carpeta: '📁', bajada: '📣', carpetazo: '🗂️', veto: '⛔' };
export const iconoPoder = (p) => ICONOS[p] || '';
export const carta = (c) => `<div class="carta ${c === 'P' ? 'prop' : 'esc'}">${c === 'P' ? 'PROPUESTA' : 'ESCÁNDALO'}</div>`;
export const volante = (t) => `<div class="carta prop">${esc(t)}</div>`;
export const titular = (t) => `<div class="carta esc">${esc(t)}</div>`;
export const retratoRol = (r) => `<div class="emoji-grande">${{ campana: '🙋', operador: '🕶️', topo: '🐀' }[r]}</div>`;
export const titularFinal = (c) => `<h1>${c ? '¡Ganó la Campaña!' : '¡Ganaron los Operadores!'}</h1>`;
export const credencialAfiliado = (n, b) => `<div class="tarjeta"><b>${esc(n)}</b>: ${b === 'campana' ? 'Campaña' : 'Operadores'}</div>`;

export function tableroPropuestas(n, frases) {
  let h = '<div class="tab-prop"><h3>Propuestas</h3><div class="casillas">';
  for (let i = 0; i < 5; i++) h += `<div class="casilla ${i < n ? 'llena' : ''}">${i < n ? esc(frases[i]) : i === 4 ? '¡Ganamos en primera vuelta!' : ''}</div>`;
  return h + '</div></div>';
}
export function tableroEscandalos(n, board, jugadores, frases) {
  let h = '<div class="tab-esc"><h3>Escándalos</h3><div class="casillas">';
  for (let i = 0; i < 6; i++) h += `<div class="casilla ${i < n ? 'llena' : ''}">${i < n ? esc(frases[i]) : iconoPoder(board[i]) + (i === 4 ? ' ⛔' : '')}</div>`;
  return h + '</div></div>';
}
export const contadorCrisis = (c) => `<div class="mini">Crisis: ${c}/3</div>`;
export const mesaEntradas = (n) => `<div class="mini">Mesa de Entradas: ${n}</div>`;
export const trituradora = (n) => `<div class="mini">Trituradora: ${n}</div>`;
