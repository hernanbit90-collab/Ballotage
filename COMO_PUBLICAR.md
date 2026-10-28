# Cómo publicar BALLOTAGE (para gente que no programa)

Hay dos formas. Para empezar a probar con amigos, usá la **A (gratis, sin tarjeta)**.

| | A. Gratis | B. Seguridad total |
|---|---|---|
| Costo | $0, sin tarjeta | $0 con amigos, pero pide tarjeta (plan Blaze) |
| Árbitro (reparte roles, mezcla) | Corre en el celular del **anfitrión** | Corre en un servidor de Google |
| ¿Alguien puede espiar? | Los jugadores no. El anfitrión, solo si sabe programar | Nadie |
| Requisito | El anfitrión deja el juego abierto mientras juegan | Ninguno |

---

# A. Camino gratis (sin tarjeta) — unos 15 minutos

### A1. Crear el proyecto
1. Entrá a <https://console.firebase.google.com> con tu cuenta de Google y tocá **Crear un proyecto**.
2. Nombre: `ballotage`. Desactivá Google Analytics. Tocá **Crear proyecto**. (Queda en el plan **Spark**, que es gratis: no pide tarjeta.)

### A2. Ingreso con mail
1. Menú izquierdo → **Compilación / Build** → **Authentication** → **Comenzar**.
2. **Método de acceso** → **Correo electrónico/contraseña** → activá el primer interruptor → **Guardar**.
3. **Agregar proveedor nuevo** → **Google** → activalo, elegí tu mail de asistencia → **Guardar**.
4. Pestaña **Configuración** → **Dominios autorizados** → **Agregar dominio** → `hernanbit90-collab.github.io`.

### A3. Base de datos y reglas de seguridad
1. Menú izquierdo → **Compilación / Build** → **Realtime Database** → **Crear base de datos** → ubicación **Estados Unidos (us-central1)** → **Comenzar en modo bloqueado** → **Habilitar**.
2. Pestaña **Reglas**: borrá todo lo que hay y pegá **el contenido completo** del archivo [`database.rules.gratis.json`](database.rules.gratis.json) (abrilo en GitHub y tocá el ícono de copiar). Tocá **Publicar**.

### A4. Datos de la app web
1. Engranaje ⚙️ → **Configuración del proyecto** → abajo, ícono **`</>`** (Web).
2. Apodo `ballotage`, **sin** Firebase Hosting → **Registrar app**.
3. Copiá el bloque `const firebaseConfig = { ... }` y **pegáselo a Claude** (o pegalo vos en `docs/config.js` desde GitHub, reemplazando los `PEGAR_ACA`).

> Si el bloque no trae `databaseURL`, copiala de Realtime Database: es la dirección de arriba (termina en `firebaseio.com` o `firebasedatabase.app`).

### A5. Publicar con GitHub Pages
1. En GitHub → **Settings** → **Pages** → Source: **Deploy from a branch** → Branch **main**, carpeta **/docs** → **Save**. (El repositorio tiene que ser público.)
2. En 1 o 2 minutos el juego queda en **<https://hernanbit90-collab.github.io/Ballotage/>**.

¡Listo! Importante: en el modo gratis, **el celular del anfitrión es el árbitro**. Tiene que dejar el juego abierto mientras juegan (si lo cierra, la partida se pausa y sigue cuando vuelve).

---

# B. Camino con seguridad total (plan Blaze, pide tarjeta)

Cuando quieras que nadie, ni el anfitrión, pueda espiar.

## Instalador automático

Son 4 cosas y tardás unos 10 minutos (más la espera):

1. **Tené una cuenta de facturación de Google** (pide tarjeta; con amigos cuesta $0). Si nunca creaste una: <https://console.cloud.google.com/billing/create>.
2. Si nunca usaste Firebase, entrá una vez a <https://console.firebase.google.com> y aceptá los términos.
3. Abrí <https://shell.cloud.google.com>, pegá esto y apretá Enter:

```bash
git clone https://github.com/hernanbit90-collab/Ballotage.git && cd Ballotage && bash instalar.sh
```

4. Cuando te pida iniciar sesión, abrí el link, elegí tu cuenta y pegá el código. Después esperá: hace todo solo (proyecto, facturación, alerta de 1 USD, ingreso con mail, base de datos, árbitro y página).

Al final te muestra **el link para jugar** (`https://ballotage-xxxxxx.web.app`) y un bloque `firebaseConfig`: **pegáselo a Claude** para que quede guardado en GitHub.

Si algo falla, el mensaje dice qué hacer; volvé a correr `bash instalar.sh` y retoma donde quedó.

---

## Camino manual del plan Blaze (si preferís hacerlo a mano)

Lo hacés una sola vez. Tardás unos 30 minutos. Necesitás una cuenta de Google y una de GitHub.

En total son 5 pasos:
1. Crear el proyecto en Firebase.
2. Pasar a plan Blaze y poner una alerta de gasto.
3. Prender el ingreso con mail (y con Google) y la base de datos.
4. Subir el árbitro (el programa que reparte roles) desde Google Cloud Shell.
5. Pegar tus datos en `config.js` y prender GitHub Pages.

---

## Paso 1 – Crear el proyecto en Firebase

1. Entrá a <https://console.firebase.google.com> con tu cuenta de Google.
2. Tocá **"Crear un proyecto"** (o "Agregar proyecto").
3. Nombre: `ballotage` (o el que quieras). Firebase le agrega números al final, por ejemplo `ballotage-3f2a1`. **Anotá ese nombre con números: es tu "ID del proyecto".**
4. Cuando te pregunte por Google Analytics, desactivalo (no hace falta). Tocá **Crear proyecto**.

## Paso 2 – Plan Blaze y alerta de gasto

¿Por qué? El plan Spark (el 100 % gratis) no deja poner programas en el servidor. Sin un programa en el servidor, cualquiera podría espiar los roles desde el celular. El plan Blaze tiene una **cuota gratis enorme** (2 millones de pedidos por mes; una partida usa unos 100). Jugando con amigos el costo es **$0**, pero Google pide una tarjeta.

1. En la consola de Firebase, abajo a la izquierda, tocá **"Spark"** → **"Actualizar"** → elegí **Blaze**.
2. Seguí los pasos para agregar la tarjeta.
3. Cuando te ofrezca poner un **presupuesto**, poné **1 USD**. Si te lo saltaste:
   - Entrá a <https://console.cloud.google.com/billing>, elegí tu cuenta de facturación → **Presupuestos y alertas** → **Crear presupuesto** → monto `1` → guardá.
   - Así, si algún día se pasara de 1 dólar, te llega un mail.

## Paso 3 – Ingreso con mail y base de datos

**Ingreso con mail** (cada jugador entra con su cuenta):
1. Menú izquierdo → **Compilación / Build** → **Authentication** → **Comenzar**.
2. Pestaña **Método de acceso** → **Correo electrónico/contraseña** → activá el primer interruptor (no hace falta el de "vínculo de correo") → **Guardar**.
3. Otra vez en **Método de acceso** → **Agregar proveedor nuevo** → **Google** → activalo, elegí tu mail como "correo de asistencia" → **Guardar**. (Así, quien tenga Gmail entra de un toque.)
4. Pestaña **Configuración** → **Dominios autorizados** → **Agregar dominio** → escribí `hernanbit90-collab.github.io`. **Sin esto, "Entrar con Google" no funciona.**
5. Opcional: en **Templates** (plantillas) podés poner el mail de "Restablecer contraseña" en español y cambiar el nombre del remitente a "BALLOTAGE".

> ¿Quién entró? En **Authentication → Users** ves la lista de cuentas creadas. Si alguien no debería estar, lo podés deshabilitar o borrar desde ahí.

**Base de datos**:
1. Menú izquierdo → **Compilación / Build** → **Realtime Database** → **Crear base de datos**.
2. Ubicación: **Estados Unidos (us-central1)**.
3. Elegí **Comenzar en modo bloqueado** → **Habilitar**. (Las reglas de verdad las sube el paso 4).

**Datos de la app web** (los vas a usar en el paso 5):
1. Tocá el engranaje ⚙️ arriba a la izquierda → **Configuración del proyecto**.
2. Abajo, en "Tus apps", tocá el ícono **`</>`** (Web).
3. Apodo: `ballotage`. **No** marques Firebase Hosting. Tocá **Registrar app**.
4. Te muestra un bloque que dice `const firebaseConfig = { apiKey: "...", ... }`. **Copialo entero y guardalo** (en un mail a vos mismo, por ejemplo). Estos datos **no son secretos**: está bien que queden a la vista.

## Paso 4 – Subir el árbitro con Google Cloud Shell

Cloud Shell es una "computadora en el navegador" que te presta Google. No tenés que instalar nada.

1. Entrá a <https://shell.cloud.google.com> con la **misma cuenta de Google**. Esperá a que aparezca una pantalla negra con texto (la "terminal").
2. Copiá y pegá estos comandos **de a uno**, apretando Enter después de cada uno. Donde dice `TU-ID-DE-PROYECTO`, poné el ID del paso 1 (por ejemplo `ballotage-3f2a1`).

Bajar el juego:

```bash
git clone https://github.com/hernanbit90-collab/Ballotage.git
```

Entrar a la carpeta:

```bash
cd Ballotage
```

Instalar lo que usa el árbitro:

```bash
cd functions && npm install && cd ..
```

Iniciar sesión en Firebase (te da un link: abrilo, elegí tu cuenta, copiá el código que te muestra y pegalo en la terminal):

```bash
npx firebase-tools@13 login --no-localhost
```

Subir el árbitro y las reglas de seguridad:

```bash
npx firebase-tools@13 deploy --only functions,database --project TU-ID-DE-PROYECTO
```

3. La primera vez tarda unos 5 minutos y puede preguntarte cosas:
   - Si pregunta si querés habilitar APIs, decí que **sí** (`Y`).
   - Si pregunta **cuántos días guardar las imágenes de contenedor** ("container images"), escribí `1` y Enter. Así no ocupa espacio de más.
4. Cuando termine vas a ver **`✔ Deploy complete!`**. ¡Listo el árbitro!

> Si el repositorio de GitHub es privado, el `git clone` te va a pedir usuario y contraseña. Para usar GitHub Pages gratis el repositorio tiene que ser **público** de todos modos (Settings → General → abajo de todo → "Change visibility" → Public).
>
> Si el código todavía no está en la rama `main`, agregá `-b claude/nice-bardeen-0kefgn` al final del `git clone`.

## Paso 5 – Pegar tus datos y publicar con GitHub Pages

> En el plan Blaze, además de pegar los datos, en `docs/config.js` cambiá `export const MODO = 'gratis';` por `export const MODO = 'servidor';`.

**Pegar los datos de Firebase** (elegí una de las dos opciones):

- **Opción A (la más fácil)**: mandame el bloque `firebaseConfig` del paso 3 y yo lo pego.
- **Opción B (lo hacés vos)**: en GitHub, abrí el archivo `docs/config.js`, tocá el lápiz ✏️ (Edit), reemplazá cada `PEGAR_ACA` con lo que corresponde de tu bloque `firebaseConfig` y tocá **Commit changes**.

Tiene que quedar parecido a esto (con tus valores):

```js
export const firebaseConfig = {
  apiKey: 'AIzaSy...',
  authDomain: 'ballotage-3f2a1.firebaseapp.com',
  databaseURL: 'https://ballotage-3f2a1-default-rtdb.firebaseio.com',
  projectId: 'ballotage-3f2a1',
  storageBucket: 'ballotage-3f2a1.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123',
};
```

> Si tu bloque no trae `databaseURL`, copiala desde Realtime Database: es la dirección que aparece arriba de todo (termina en `firebaseio.com` o `firebasedatabase.app`).

**Prender GitHub Pages**:
1. En tu repositorio de GitHub → **Settings** → **Pages** (menú izquierdo).
2. En "Build and deployment" → **Source**: `Deploy from a branch`.
3. **Branch**: elegí `main` y la carpeta **`/docs`** → **Save**.
4. Esperá 1 o 2 minutos y recargá. Arriba aparece: *"Your site is live at https://hernanbit90-collab.github.io/Ballotage/"*.

**¡Ese es el link del juego!**

## Cómo se arma una partida (el administrador)

1. El administrador abre el link, pone su apodo y toca **"Crear sala nueva"**. Le aparece un **código de 4 letras**.
2. Toca **"💬 Invitar por WhatsApp"**, elige el grupo o la persona y manda. El mensaje lleva el link (con el código ya cargado) y el código escrito.
   - O toca **"🔗 Copiar link"** y lo pega donde quiera.
   - También puede dictar el código: los invitados abren el link del juego, ponen el código y su apodo.
3. Cada invitado abre el link, **entra con su mail** (la primera vez toca "Soy nuevo: crear cuenta", o "Entrar con Google"), pone su **apodo** y toca **"Entrar"**. Van apareciendo en la lista (punto verde = conectado).
4. El administrador elige los **segundos de debate**, el **tiempo para votar** y si hay **declaraciones**. Si alguien se coló, lo puede sacar.
5. Con 5 a 10 personas adentro, toca **"¡Largar la campaña!"**. A cada uno le llega su rol secreto en el celular.

Consejo: jueguen todos juntos en una llamada o en la misma mesa, porque el debate es hablado.

---

## Preguntas frecuentes

**Se me cortó el celular / se cerró el navegador.** Volvé a abrir el link: entrás directo a la partida.

**Se me rompió el celular / cambié de navegador.** Entrá con **tu mismo mail** desde el otro celular y poné el código de la sala: volvés a tu lugar con tu rol.

**Me olvidé la contraseña.** En la pantalla de ingreso tocá "Me olvidé la contraseña": te llega un mail para elegir una nueva (mirá en spam).

**¿Alguien puede hacer trampa mirando el código de la página?** No. Los roles, el mazo y los votos sin abrir están guardados en un cajón que ningún celular puede leer. Cada celular solo recibe lo que le toca ver.

**¿Cuánto me va a salir?** Para partidas entre amigos, $0. Con la alerta de 1 USD te enterás si algo raro pasa.

**Cambié algo del árbitro (la carpeta `functions`) y quiero subirlo de nuevo.** Repetí el paso 4 (si ya tenés la carpeta en Cloud Shell, alcanza con `cd Ballotage`, `git pull` y el último comando `deploy`).
