# Kiosko Colombia — Versión 1

Sistema web para restaurante: carta y pedidos para clientes (sin cuenta), panel para el personal por roles, caja, mesas con QR y empleados temporales. 100 % gratis y **sin tarjeta**: Firebase (plan Spark) + Cloudinary (plan gratis) + hosting estático.

No necesita instalar nada ni compilar: son archivos HTML/CSS/JS que se suben tal cual.

---

## 1. Qué incluye

**Clientes (sin crear cuenta)**
- Carta con categorías, fotos, buscador, opciones con precio y notas por producto.
- Pedido en mesa (escaneando el QR de la mesa), para recoger o a domicilio.
- Seguimiento en vivo del pedido (recibido → confirmado → preparando → listo → entregado) y cancelación mientras no esté confirmado.
- Cada cliente recibe una identidad anónima automática: solo puede ver sus propios pedidos.

**Personal (inicia sesión)**
| Módulo | Quién lo ve |
|---|---|
| Inicio (resumen del turno) | todos |
| Pedidos (confirmar, entregar, cobrar, crear pedido) | admin, gerente, mesero, cajero, domiciliario |
| Cocina (cola de preparación con aviso sonoro) | admin, gerente, cocina |
| Caja y turno (abrir/cerrar, cuadre de efectivo) | admin, gerente, cajero (cuentas fijas) |
| Mesas y QR (crear, descargar, imprimir) | admin (edita), gerente (ve) |
| Carta | admin (edita todo); gerente y cocina (marcan «agotado») |
| Temporales | admin, gerente |
| Equipo (cuentas y roles) | admin |
| Inventario | admin, gerente, inventario |
| Gastos | admin, gerente, inventario |
| Reportes | admin, gerente |
| Auditoría (quién hizo qué) | admin, gerente |
| Escáner QR | todo el personal del turno |
| Configuración (logo, colores, horario, domicilio) | admin |

**Empleado temporal**: lo crea el gerente de turno (o el admin) con nombre, rol y vigencia. Recibe un código de un solo uso (o QR), válido 15 minutos para entrar. Su acceso termina **al cerrar la caja**, al vencer la hora o si se revoca. Todo lo que hace queda a su nombre.

**Confirmación y trazabilidad**: los pedidos de clientes entran como «Por confirmar». Un mesero (o cajero/gerente) los confirma y queda registrado **quién y cuándo**; lo mismo para preparación, entrega, cobro, rechazo y anulación. Todo se copia a la auditoría.

---

## 2. Puesta en marcha (≈ 30 minutos)

### Paso 1 — Firebase (gratis, sin tarjeta)
1. Entra a <https://console.firebase.google.com> → **Crear proyecto** (desactiva Analytics, no hace falta). Déjalo en el plan **Spark**.
2. **Authentication → Comenzar → Sign-in method**: activa **Anónimo** y **Correo electrónico/contraseña**.
3. **Firestore Database → Crear base de datos** → modo **producción** → ubicación `southamerica-east1` (São Paulo) o `us-east1`.
4. **Firestore → Reglas**: borra lo que haya, pega **todo** el contenido de `firestore.rules` y pulsa **Publicar**.
5. **Configuración del proyecto (⚙️) → Tus apps → Web (`</>`)** → registra la app → copia el objeto `firebaseConfig`.
6. Abre `js/config.js` y pega esos valores.

### Paso 2 — Cloudinary (imágenes, gratis)
1. Crea cuenta en <https://cloudinary.com> y copia tu **Cloud name** (Dashboard).
2. **Settings → Upload → Upload presets → Add**: nombre `kiosko_unsigned`, **Signing mode: Unsigned**, carpeta `kiosko`, y en *Upload control* limita formatos a `jpg,png,webp`.
3. En `js/config.js` pon tu `cloudName` (y el nombre del preset si usaste otro).

### Paso 3 — Publicar el sitio
**Opción A: GitHub Pages** (la que elegiste)
1. Crea un repositorio y sube **todo el contenido de esta carpeta** (menos `tests/` si quieres).
2. **Settings → Pages → Deploy from a branch → `main` / root**.
3. Tu sitio queda en `https://TU-USUARIO.github.io/NOMBRE-REPO/`.
4. En Firebase: **Authentication → Settings → Dominios autorizados → Agregar dominio** → `TU-USUARIO.github.io`. (Sin esto el inicio de sesión no funciona.)

**Opción B: Firebase Hosting** (también gratis, sin tarjeta): `npm i -g firebase-tools`, `firebase login`, `firebase init hosting` (carpeta pública `.`, sin SPA) y `firebase deploy`. Su dominio ya viene autorizado.

> Las cámaras (escáner QR) y el modo instalable solo funcionan en **HTTPS**; GitHub Pages y Firebase Hosting ya lo dan.

### Paso 4 — Primer ingreso
1. Abre `https://TU-SITIO/#/setup` **inmediatamente después de publicar las reglas** y crea la cuenta del administrador. Solo funciona mientras el sitio no esté configurado.
2. Entra al panel (**Personal** arriba a la derecha) y sigue la lista de «Primeros pasos»: categorías → productos → mesas → configuración → abrir caja.
3. En **Mesas y QR** imprime los QR y pégalos en cada mesa.

### Paso 5 (recomendado) — App Check
Protege tu base de datos de bots. **Firebase → App Check → Apps → Web → reCAPTCHA v3**, copia la *clave de sitio* a `appCheckSiteKey` en `js/config.js` y, cuando todo funcione, activa «Aplicar» en Firestore. Es gratis.

---

## 3. Uso diario
1. El gerente o cajero **abre caja** (efectivo inicial). Sin turno abierto no se reciben pedidos.
2. Los clientes piden por QR/web → el mesero **confirma** → cocina **empieza / marca listo** → mesero o domiciliario **entrega** → cajero **cobra**.
3. ¿Falta personal? Gerente → **Temporales** → nombre, rol, vigencia → entrega el código/QR.
4. Al final: **Caja y turno → Cerrar caja** (cuenta el efectivo). Se cierran los accesos temporales y queda el resumen en **Reportes**.

---

## 4. Seguridad: qué protege y qué no

Al ser 100 % gratis no hay servidor propio: la protección vive en `firestore.rules`.

**Lo que las reglas garantizan**
- Un cliente solo crea pedidos «Por confirmar» y solo lee los suyos.
- Cada rol solo puede hacer sus transiciones (cocina no cobra, mesero no anula, etc.).
- La constancia de quién confirmó, preparó, entregó, cobró, rechazó o anuló un pedido debe llevar el uid real de quien actúa.
- Los temporales: código de un solo uso, caducidad máxima de 24 h, solo roles operativos, y mueren al cerrar caja (las reglas consultan el estado del turno en cada operación).
- Nadie puede volverse admin después de la configuración inicial; la auditoría no se puede editar ni borrar.

**Limitaciones que debes conocer**
- Sin servidor, **los precios los calcula el navegador**. Por eso cada pedido lo recalcula y confirma una persona con los precios vigentes. Un empleado malintencionado podría alterar un total; para eso existen la auditoría y el cuadre de caja.
- Un bot podría crear muchos pedidos falsos «Por confirmar». Se mitiga con App Check y con que nada llega a cocina sin confirmación humana.
- Un cliente que borra los datos de su navegador pierde el acceso a sus pedidos anteriores (sigue teniendo el código impreso/mostrado).
- Firebase Spark: ≈ 50 000 lecturas y 20 000 escrituras al día en Firestore. Para un local es suficiente; la app ya evita lecturas innecesarias (carta en caché, una sola escucha de pedidos por turno). Si se agotara, la app deja de responder hasta el día siguiente.
- **Si algún día quieres más seguridad** (precios y accesos validados en servidor), el modelo de datos ya está preparado para moverlo a Cloud Functions (requiere plan Blaze con tarjeta).

---

## 5. Qué se probó y qué no

**Probado:** revisión de sintaxis de todos los módulos, y un recorrido completo de la interfaz en un navegador real contra una base de datos **simulada**: configuración inicial, carta, mesas con QR, apertura de caja, pedido de cliente por QR, confirmación, cocina, entrega, cobro, empleado temporal (creación, canje, no reutilizable, menú limitado), cierre de caja y auditoría. Sin errores en consola.

**NO probado (hazlo antes de usarlo con clientes reales):**
- Las **reglas de seguridad contra el emulador real de Firebase** (no pude descargarlo). Las revisé a mano y dejé pruebas listas en `tests/`: ejecuta `cd tests && npm install && npm test` (necesita Java).
- Conexión real con Firebase y Cloudinary (subida de imágenes), y el lector de QR con cámara en un celular.
- Pruebas con varios dispositivos a la vez y con conexión lenta.

Haz una **ronda de prueba con datos falsos** (varios pedidos, un temporal, cierre de caja) y revisa la pestaña Uso del plan en Firebase.

---

## 6. Estructura
```
index.html            página única (rutas con #/…)
firestore.rules       reglas de seguridad (se pegan en la consola de Firebase)
firebase.json         configuración opcional para Firebase Hosting / emulador
sw.js, manifest…      app instalable y carga rápida
css/styles.css        diseño caribeño moderno (colores editables desde Configuración)
vendor/               librerías de QR (incluidas, sin depender de internet)
js/config.js          ← aquí pegas tus claves
js/session.js         sesión, roles, acceso temporal, auditoría
js/acciones.js        cambios de estado de pedidos con constancia de quién los hizo
js/views/             sitio público, login, configuración inicial, panel
js/views/panel/       un archivo por módulo del panel
tests/                pruebas de reglas (para correr en tu computador)
```

## 7. Ideas para la V2
Reservas, cupones y puntos, división de cuenta, llamar al mesero desde el QR, impresión de comandas, recetas que descuenten inventario, pagos en línea (Wompi), notificaciones push y modo multi-sucursal.
