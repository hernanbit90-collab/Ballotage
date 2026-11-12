// Dibuja una imagen 1920x1080 por cada frase del guion.
const { chromium } = require('playwright');
const fs = require('fs');
const guion = JSON.parse(fs.readFileSync(__dirname + '/guion.json', 'utf8'));
const img = (n) => 'data:image/png;base64,' + fs.readFileSync(__dirname + '/shots/' + n + '.png').toString('base64');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const CSS = `
*{box-sizing:border-box;margin:0}
body{width:1280px;height:720px;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#f4f1ff;
 background:radial-gradient(90% 60% at 30% -10%,#3a1d6e 0%,#0d0a22 62%)}
.marco{position:absolute;inset:0;display:grid;grid-template-columns:1fr 440px;gap:24px;padding:44px 56px 150px}
.marco.solo{grid-template-columns:1fr}
.izq{display:flex;flex-direction:column;justify-content:center;gap:18px;min-width:0}
.sec{align-self:flex-start;font-size:17px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#0d0a22;background:#ffd23f;padding:6px 14px;border-radius:999px}
h1{font-family:'Space Grotesk',sans-serif;font-size:54px;line-height:1.08;font-weight:700;letter-spacing:-1px}
ul{list-style:none;display:flex;flex-direction:column;gap:14px;margin-top:8px}
li{display:flex;align-items:center;gap:14px;font-size:27px;font-weight:500;color:#e6e1ff}
li::before{content:'';flex:none;width:14px;height:14px;border-radius:50%;background:#22d3b6}
.der{display:flex;align-items:center;justify-content:center}
.cel{height:522px;width:410px;display:flex;border-radius:30px;border:6px solid #2a2360;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.55);background:#0d0a22}
.cel img{width:100%;display:block;align-self:flex-start}
.cel.abajo img{align-self:flex-end}
.sub{position:absolute;left:56px;right:56px;bottom:30px;min-height:96px;display:flex;align-items:center;justify-content:center;text-align:center;
 padding:14px 28px;border-radius:20px;background:rgba(8,6,22,.82);border:1px solid rgba(255,255,255,.1);font-size:25px;line-height:1.35;font-weight:500}
.marca{position:absolute;top:26px;right:56px;font-family:'Bowlby One',sans-serif;font-size:22px;color:#ffd23f;text-shadow:2px 2px 0 #ff3d8b}
.centro{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;text-align:center}
.centro .logo-arte svg{width:560px;height:auto;filter:drop-shadow(6px 8px 0 rgba(255,61,139,.6))}
.centro h1{font-size:60px}
.fila{display:flex;gap:18px;justify-content:center;align-items:stretch;flex-wrap:wrap}
.tar{width:270px;padding:20px;border-radius:22px;background:#16123a;border:2px solid rgba(255,255,255,.1);display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;opacity:.35}
.tar.on{opacity:1;border-color:#ffd23f;box-shadow:0 0 40px rgba(255,210,63,.25)}
.tar.todas{opacity:1}
.tar svg{width:120px;height:120px}
.tar b{font-family:'Space Grotesk',sans-serif;font-size:27px}
.tar span{font-size:19px;line-height:1.3;color:#c9c3ea}
.pasos{display:flex;gap:14px;justify-content:center}
.paso{width:200px;padding:22px 10px;border-radius:20px;background:#16123a;border:2px solid rgba(255,255,255,.1);display:flex;flex-direction:column;align-items:center;gap:12px}
.paso i{font-style:normal;width:58px;height:58px;border-radius:50%;display:grid;place-items:center;font:700 28px 'Space Grotesk',sans-serif;background:#ff3d8b}
.paso b{font-size:24px;font-family:'Space Grotesk',sans-serif}
.minipasos{display:flex;gap:8px;margin-bottom:4px}
.minipasos span{width:44px;height:8px;border-radius:4px;background:rgba(255,255,255,.16)}
.minipasos span.on{background:#ff3d8b}
.mazo{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:1100px}
.mazo svg{width:92px;height:auto}
.grande{font:700 120px 'Space Grotesk',sans-serif;line-height:1}
.verde{color:#22d3b6}.rojo{color:#ff5a64}.ama{color:#ffd23f}
.cond{display:flex;gap:22px;justify-content:center}
.cond div{width:430px;padding:26px;border-radius:22px;background:#16123a;border:2px solid rgba(255,255,255,.12);display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.cond b{font-size:30px;font-family:'Space Grotesk',sans-serif}
.cond span{font-size:22px;color:#c9c3ea}
.cond b.grande{font-size:120px}
.fila.una{flex-wrap:nowrap}
.crisis{display:flex;gap:18px;align-items:center;justify-content:center}
.crisis i{width:110px;height:110px;border-radius:50%;border:6px solid #ff9f4a;display:grid;place-items:center;font:700 44px 'Space Grotesk',sans-serif;font-style:normal;color:#ff9f4a}
.crisis i.f{background:#ff9f4a;color:#0d0a22}
.crisis em{font-style:normal;font-size:44px;color:#a9a3cc}
`;

function visual(b, A) {
  const [tipo, arg] = b.vis.split(':');
  const n = Number(arg);
  const cab = `${b.sec ? `<span class="sec">${esc(b.sec)}</span>` : ''}`;
  const mini = b.paso !== undefined ? `<div class="minipasos">${[0, 1, 2, 3, 4].map((i) => `<span class="${i <= b.paso ? 'on' : ''}"></span>`).join('')}</div>` : '';
  if (tipo === 'shot') {
    return `<div class="marco"><div class="izq">${cab}${mini}<h1>${esc(b.tit)}</h1><ul>${(b.pts || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="der"><div class="cel ${arg === 'rol' ? 'abajo' : ''}"><img src="${img(arg)}"></div></div></div>`;
  }
  let cuerpo = '';
  if (tipo === 'logo') cuerpo = `${A.logo}<h1>${esc(b.tit)}</h1>`;
  if (tipo === 'roles') {
    const rs = [['campana', 'Equipo de Campaña', 'Son mayoría. Quieren publicar Propuestas.'], ['operador', 'Operadores del Rival', 'Quieren Escándalos. Se conocen entre ellos.'], ['topo', 'El Topo', 'Líder secreto de los Operadores.']];
    cuerpo = `${cab}<h1>${esc(b.tit)}</h1><div class="fila">${rs.map((r, i) => `<div class="tar ${i === n ? 'on' : ''}">${A.rol[r[0]]}<b>${r[1]}</b><span>${r[2]}</span></div>`).join('')}</div>`;
  }
  if (tipo === 'pasos') {
    cuerpo = `${cab}<h1>${esc(b.tit)}</h1><div class="pasos">${['Fórmula', 'Debate', 'Votación', 'Cartas', 'Declaraciones'].map((t, i) => `<div class="paso"><i>${i + 1}</i><b>${t}</b></div>`).join('')}</div>`;
  }
  if (tipo === 'crisis') {
    cuerpo = `${cab}${mini}<h1>${esc(b.tit)}</h1><div class="crisis"><i class="f">1</i><em>→</em><i class="f">2</i><em>→</em><i class="f">3</i><em>=</em><b class="grande ama" style="font-size:64px">¡Cacerolazo!</b></div>`;
  }
  if (tipo === 'mazo') {
    cuerpo = `${cab}${mini}<h1>${esc(b.tit)}</h1><div class="mazo">${A.props.join('')}${A.escs.join('')}</div>`;
  }
  if (tipo === 'poderes') {
    const ps = [[['encuesta', 'Encuesta', 'Ver el bando de un jugador'], ['carpeta', 'Mirar la carpeta', 'Espiar las próximas 3 cartas']], [['bajada', 'Bajada de línea', 'Elegir al próximo candidato'], ['carpetazo', 'Carpetazo', 'Eliminar a un jugador']], [['veto', 'Veto', 'Con 5 Escándalos: tirar las 2 cartas si el Jefe acepta']]];
    const todas = ps.flat();
    const activos = n >= 0 ? ps[n].map((x) => x[0]) : [];
    cuerpo = `${cab}<h1>${esc(b.tit)}</h1><div class="fila una">${todas.map((x) => `<div class="tar ${n < 0 ? 'todas' : activos.includes(x[0]) ? 'on' : ''}" style="width:205px;padding:16px 12px">${A.poder[x[0]] || A.veto}<b style="font-size:23px">${x[1]}</b><span style="font-size:17px">${x[2]}</span></div>`).join('')}</div>`;
  }
  if (tipo === 'limite') {
    cuerpo = `${cab}<h1>${esc(b.tit)}</h1><div class="cond"><div><b>El último Jefe</b><span>no puede ser Vocero en la ronda siguiente</span></div><div><b>El último Vocero</b><span>tampoco puede repetir</span></div></div><span style="font-size:20px;color:#a9a3cc">Con 5 jugadores en carrera, solo aplica al último Vocero.</span>`;
  }
  if (tipo === 'ganar') {
    cuerpo = n === 0
      ? `${cab}<h1>${esc(b.tit)}</h1><div class="cond"><div><b class="grande verde">5</b><b>Propuestas publicadas</b></div><div style="justify-content:center"><b class="verde">Carpetazo al Topo</b><span>Si eliminan al Topo, gana la Campaña</span></div></div>`
      : `${cab}<h1>${esc(b.tit)}</h1><div class="cond"><div><b class="grande rojo">6</b><b>Escándalos publicados</b></div><div style="justify-content:center"><b class="rojo">El Topo es Vocero</b><span>después del 3.er Escándalo: la zona roja</span></div></div>`;
  }
  if (tipo === 'consejos') {
    cuerpo = `${cab}<h1>${esc(b.tit)}</h1><div class="cond"><div><b>Hablen mucho</b><span>Acusen, defiéndanse, pidan explicaciones</span></div><div><b>Miren el historial</b><span>Los votos de cada uno dicen mucho</span></div></div>`;
  }
  return `<div class="marco solo"><div class="izq centro">${cuerpo}</div></div>`;
}

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 })).newPage();
  await p.goto('http://localhost:8080/?practica');
  const A = await p.evaluate(async () => {
    const A = await import('./arte.js');
    const T = await import('./textos.js');
    return {
      logo: A.logo(),
      rol: { campana: A.retratoRol('campana'), operador: A.retratoRol('operador'), topo: A.retratoRol('topo') },
      poder: { encuesta: A.iconoPoder('encuesta'), carpeta: A.iconoPoder('carpeta'), bajada: A.iconoPoder('bajada'), carpetazo: A.iconoPoder('carpetazo') },
      veto: A.selloVetado(),
      props: T.PROPUESTAS.slice(0, 6).map((t, i) => A.volante(t, i)),
      escs: T.ESCANDALOS.slice(0, 11).map((t) => A.titular(t)),
    };
  });
  fs.mkdirSync(__dirname + '/frames', { recursive: true });
  for (let i = 0; i < guion.length; i++) {
    const g = guion[i];
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Bowlby+One&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Permanent+Marker&display=swap" rel="stylesheet">
      <style>${CSS}</style></head><body>${visual(g, A)}
      ${g.vis.startsWith('logo') ? '' : '<div class="marca">BALLOTAGE</div>'}<div class="sub">${esc(g.txt)}</div></body></html>`, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${__dirname}/frames/f${String(i).padStart(2, '0')}.png` });
  }
  console.log(guion.length, 'imágenes');
  await b.close();
})();
