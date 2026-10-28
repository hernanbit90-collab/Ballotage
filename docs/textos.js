// Todos los textos graciosos del juego. 100 % inventados.

export const PROPUESTAS = [
  'Asado gratis los domingos',
  'Feriado puente todos los meses',
  'Wifi libre en cada plaza',
  'Colectivo que pasa cuando decís',
  'Medialunas al precio de 2003',
  'Siesta obligatoria de 14 a 16',
  'Un parrillero por cuadra',
  'Bajamos la luz (y la boleta también)',
];

export const ESCANDALOS = [
  '¡Encontraron los bolsos!',
  'Audio filtrado: "Esto no sale de acá"',
  'El asesor cobraba de tres ministerios',
  'Choripanes truchos en el acto central',
  'La encuesta la pagó el propio candidato',
  'Fiesta clandestina en el búnker',
  '¡El puntero se fue con la caja chica!',
  'Contrataron 40 "ñoquis" para el escrutinio',
];

export const ROLES = {
  campana: {
    titulo: 'Equipo de Campaña',
    bando: 'Campaña',
    texto: 'Militás de verdad. Querés ganar la elección limpio: publicá Propuestas y descubrí al Topo antes de que sea tarde.',
  },
  operador: {
    titulo: 'Operador del Rival',
    bando: 'Operadores',
    texto: 'Te pagan desde el búnker de enfrente. Hundí la campaña desde adentro: llená la tapa de Escándalos o hacé que el Topo llegue a Vocero.',
  },
  topo: {
    titulo: 'El Topo',
    bando: 'Operadores',
    texto: 'Sos el líder secreto de los Operadores. Hacete el buenito, ganá confianza y conseguí que te elijan Vocero después del 3.er Escándalo.',
  },
};

export const PODERES = {
  encuesta: { nombre: 'Encuesta', texto: 'El Jefe ve en secreto el bando de un jugador.' },
  carpeta: { nombre: 'Mirar la carpeta', texto: 'El Jefe espía las próximas 3 cartas.' },
  bajada: { nombre: 'Bajada de línea', texto: 'El Jefe elige al próximo candidato.' },
  carpetazo: { nombre: 'Carpetazo', texto: 'El Jefe elimina a un jugador.' },
};

export const ESPERAS = [
  'Se está cocinando la rosca…',
  'Hay reunión a puertas cerradas…',
  'Los punteros están llamando por teléfono…',
  'Están mirando las encuestas…',
];

export const REGLAS = `
<h2>¿De qué se trata?</h2>
<p>Hay elecciones en la República de Ballotagia y vos estás en el búnker de campaña. El problema: <b>entre ustedes hay infiltrados</b> del rival. Y uno de ellos es <b>El Topo</b>, su jefe secreto.</p>

<h2>Los bandos</h2>
<ul>
  <li><b>Equipo de Campaña</b> (son mayoría): quieren ganar limpio.</li>
  <li><b>Operadores del Rival</b>: quieren hundir la campaña. Saben quién es El Topo.</li>
  <li><b>El Topo</b>: juega con los Operadores. Con 5 o 6 jugadores sabe quiénes son sus Operadores; con 7 o más, no tiene idea.</li>
</ul>

<h2>Cómo es una ronda</h2>
<ol>
  <li>El <b>Candidato a Jefe de Campaña</b> (va rotando) elige a un <b>Vocero</b>.</li>
  <li>Todos votan con boleta: <b>¡Sí!</b> o <b>¡No!</b>. Las boletas se abren todas juntas.</li>
  <li>Si gana el Sí (más de la mitad), el Jefe agarra 3 cartas de la <b>Mesa de Entradas</b>, manda 1 a <b>La Trituradora</b> y le pasa 2 al Vocero. El Vocero tritura 1 y <b>publica la otra</b>.</li>
  <li>Si empata o gana el No, el cargo pasa al siguiente y sube la <b>Crisis</b>. Con 3 rechazos seguidos hay <b>¡Cacerolazo!</b>: se publica la carta de arriba sin poderes.</li>
</ol>
<p>Las cartas trituradas nunca se muestran. <b>Se vale mentir</b> sobre lo que viste. Ese es el juego.</p>

<h2>Quién no puede ser Vocero</h2>
<p>El último Jefe y el último Vocero electos no pueden ser Vocero en la ronda siguiente (con 5 jugadores en carrera, solo el último Vocero).</p>

<h2>Cómo se gana</h2>
<ul>
  <li><b>Campaña</b>: 5 Propuestas publicadas, o hacerle un Carpetazo al Topo.</li>
  <li><b>Operadores</b>: 6 Escándalos publicados, o que El Topo sea elegido Vocero después del 3.er Escándalo (la <b>zona roja</b>).</li>
</ul>

<h2>Poderes</h2>
<p>Algunos Escándalos le dan un poder al Jefe de Campaña, que <b>está obligado</b> a usarlo:</p>
<ul>
  <li><b>Encuesta</b>: ve el bando (no el rol) de alguien. No se puede encuestar dos veces a la misma persona.</li>
  <li><b>Mirar la carpeta</b>: espía las próximas 3 cartas.</li>
  <li><b>Bajada de línea</b>: elige al próximo candidato. Después la ronda sigue en orden normal.</li>
  <li><b>Carpetazo</b>: elimina a alguien. Si era El Topo, gana la Campaña. Si no, nadie sabe qué era. Los eliminados no votan, no hablan y no son candidatos.</li>
</ul>
<p>Con 5 Escándalos se habilita el <b>Veto</b>: el Vocero puede pedir triturar las 2 cartas. Si el Jefe acepta, se tiran y sube la Crisis; si no, el Vocero tiene que publicar.</p>

<h2>Consejos de la vieja guardia</h2>
<ul>
  <li>Hablen mucho. Acusen. Defiéndanse. Pidan explicaciones.</li>
  <li>Miren cómo vota cada uno en el historial: los votos dicen mucho.</li>
  <li>Si te volaron con un Carpetazo, a partir de ahí sos un fantasma: calladito.</li>
</ul>
`;
