# Cómo publicar BALLOTAGE (para gente que no programa)

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
