# Autenticación con email y contraseña

La API usa Better Auth 1.7.13, el adaptador Drizzle SQLite y Cloudflare D1.
El cliente nativo guarda una sesión bearer firmada en Keychain. Esta es una implementación
nueva en este repositorio; no se usan la instalación archivada ni sus datos.

## Contrato de API

Todas las rutas son relativas al origen de API configurado:

| Método | Ruta | Cuerpo / comportamiento |
| --- | --- | --- |
| POST | `/api/v1/auth/sign-up/email` | `{ "name": "New member", "email": "demo@example.com", "password": "a-long-example-password" }`; inicia el onboarding obligatorio |
| POST | `/api/v1/auth/sign-in/email` | `{ "email": "demo@example.com", "password": "a-long-example-password" }` |
| GET | `/api/v1/auth/get-session` | Sesión actual o null; acepta autenticación bearer firmada |
| POST | `/api/v1/auth/sign-out` | `{}`; revoca la sesión actual |
| GET | `/api/v1/me` | Requiere bearer firmado; devuelve `{ "user": { "id", "name", "email", "emailVerified" } }` o HTTP 401 |

El registro/inicio de sesión exitoso devuelve el usuario en JSON y una sesión firmada en
`set-auth-token`. Los clientes nativos deben guardar ese encabezado, no el token sin firmar de
la respuesta JSON, y enviarlo sin cambios como `Authorization: Bearer <token>`.
Las cookies están deshabilitadas en la URLSession efímera del cliente iOS. La API requiere
tokens bearer firmados, usa sesiones respaldadas en la base de datos y deshabilita la caché de cookies
de sesión para comprobar la revocación contra D1.

Solo se exponen las rutas de autenticación enumeradas arriba. No están configurados el cambio/restablecimiento de contraseña,
verificación de email, OAuth de inicio de sesión, cuentas compartidas ni eliminación de cuenta.
Las contraseñas deben contener entre 8 y 128 caracteres y se hashean mediante la implementación de contraseñas
de Better Auth; nunca se guardan contraseñas en texto plano. Las sesiones expiran a los siete
días y se renuevan después de un día de actividad. Esta configuración de autenticación no tiene JWT sin estado
ni caché de perfiles sin estado. La memoria compartida de contactos se documenta por separado.

**Las direcciones de email no están verificadas.** Registrarse no demuestra propiedad de
una dirección. No uses este email como identidad verificada ni habilites uso compartido privado
basándote solo en él. La verificación de email y la recuperación de contraseñas requieren un servicio de
entrega configurado por separado y callbacks documentados antes de ofrecerse.
Esta función no cambia ningún proveedor de correo, dominio ni cuenta externa.

## Controles de abuso y privacidad

Los cuerpos de autenticación se limitan a 16 KiB. Los upserts atómicos D1 aplican límites de ventana fija
por minuto, IP y endpoint: cinco registros, diez inicios de sesión, treinta cierres de sesión
y 120 lecturas de sesión. Solo se usa el encabezado `CF-Connecting-IP` de Cloudflare para
identificar al cliente remoto; las solicitudes locales comparten un bucket de respaldo. Las filas de límites
usan una clave hasheada de IP/ruta/ventana, no la dirección sin procesar. Las filas vencidas se eliminan
en lotes acotados durante solicitudes posteriores de autenticación. Los límites se comparten entre
isolates, bloquean ante errores de base de datos y devuelven HTTP 429 con `Retry-After`.
El limitador en memoria de la biblioteca se deshabilita a favor de esta admisión persistente.
Las personas detrás de la misma IP pública comparten estos límites; el límite entre ventanas puede permitir
las cuotas de dos ventanas adyacentes en un intervalo corto.

Las respuestas de autenticación y cuenta usan `Cache-Control: no-store`. Los logs de la aplicación usan
un nombre genérico de evento en lugar de credenciales, cuerpos de solicitudes o errores del proveedor.
Better Auth puede persistir metadatos de IP/user-agent de sesión en D1. Usuarios, hashes de contraseñas
y sesiones persisten en la base de datos D1 de la cuenta; el acceso y la retención
siguen los controles administrativos de esa instalación. Todavía no hay eliminación de cuenta disponible
para la persona ni política automática de retención de cuentas. Eliminar una fila de usuario elimina en cascada
sus sesiones y cuentas de credenciales y solo debe hacerse con autorización.

## App nativa

La app usa una barra de navegación nativa sobre un formulario de inicio de sesión centrado
y desplazable, con títulos Manrope en negrita de dos líneas, fondos claros/oscuros neutros, entradas
redondeadas y etiquetadas con iconos, visibilidad de contraseña y un botón destacado azul de vidrio.
Los mensajes junto a los campos y bordes indican errores de validación; los errores de solicitud aparecen
en un banner separado. El cambio de modo permanece en la barra de navegación y se bloquean envíos
repetidos mientras hay una solicitud en curso.
El registro pide nombre, email y contraseña. La raíz autenticada tiene pestañas Chats
y Cuenta, con Chats seleccionada por defecto. Cuenta muestra nombre/email y foto
actuales, con menús de edición de avatar/nombre directamente en esa pantalla. Los cambios confirmados
se guardan inmediatamente; el email sigue siendo de solo lectura. Conserva el flujo existente de cierre de sesión.
Una única pila de navegación envuelve las pestañas. El botón más abre Contactos,
con acciones para crear/unirse y un directorio alfabético. Los editores se abren sobre el
diseño completo de pestañas, con navegación Atrás nativa y la pestaña seleccionada preservada al volver. La navegación y el estado
de contactos se restablecen para otra persona autenticada. Los contactos usan almacenamiento D1 privado y
autenticado; consulta [contactos](contacts.md) para creación, listado, cambio de nombre, eliminación,
paginación y gestión de expiración de sesión. No hay contactos ni mensajes
de ejemplo. La estructura autenticada actualiza periódicamente contactos mientras está activa;
consulta [caché](caching.md) para polling y comportamiento de caché.

iOS usa `Wildcard/WildcardLaunch.storyboard` mediante la entrada explícita
`UILaunchStoryboardName = WildcardLaunch` de `Config/Info.plist` tanto en Debug
como Release. El grupo sincronizado de la app incluye el storyboard como recurso.
La generación automática de pantalla de lanzamiento vacía está deshabilitada. La pantalla nativa usa el
mismo fondo `AccentColor` que SwiftUI y el recurso blanco `WildcardLaunchIsotype.png`
del bundle, con una imagen de unos 105,66 × 100 puntos con ajuste de proporción, centrada en el área segura. El fondo azul
cubre toda la pantalla en ambas apariencias; compartir assets y alineación
evita un salto de color, tamaño o posición cuando toma el control SwiftUI.

Después del lanzamiento nativo, la app muestra una pantalla completa `#045DE3` con la marca blanca Wildcard
centrada a 105,66 × 100 puntos mientras carga su token de Keychain y consulta
`/me`. SwiftUI usa el vector `WildcardLaunchMark`; el lanzamiento nativo usa versiones PNG del bundle
de esa misma fuente, exportadas del `isotype.svg` proporcionado. Consulta [marca de la app](branding.md). Los modos claro y oscuro
usan el mismo fondo azul. No hay espera artificial; la restauración selecciona
la pantalla sin sesión, autenticada o de reintento en cuanto termina.
Estos cambios de lanzamiento se comprobaron estáticamente (XML de storyboard, referencias de assets,
restricciones, plist y configuración del proyecto), sin build ni ejecución en simulador.
Verifica la transición en dispositivo después de instalar la app actualizada en modo claro/oscuro
y orientaciones compatibles.

Una sesión vencida borra el token. Los fallos de red/servidor/Keychain conservan la
sesión guardada y ofrecen reintentar en lugar de interpretar una interrupción como cierre de sesión.

Keychain usa `WhenUnlockedThisDeviceOnly`; los tokens no se guardan en UserDefaults
ni SwiftData. Cerrar sesión revoca la sesión remota antes de eliminar el token local;
si falla la red, muestra un error y permite reintentar. Las contraseñas permanecen solo en
el estado transitorio del formulario y se borran tras autenticación exitosa o cambio de modo. La app
no contiene secretos del backend, credenciales de base de datos ni código de hash de contraseñas.

Debug y Release usan por defecto `https://wildcard-api.imlautaro.workers.dev` mediante
`WILDCARD_API_URL`. La clave explícita `WildcardAPIURL` en `Config/Info.plist`
referencia `$(WILDCARD_API_URL)` para que Xcode la expanda en la app compilada. Los ajustes de build
personalizados `INFOPLIST_KEY_*` por sí solos no añaden esta clave al plist de la app.
Una instalación independiente debe reemplazar este ajuste en ambas configuraciones.
Release solo acepta HTTPS. Debug también acepta HTTP en hosts de loopback; para desarrollar localmente
en simulador, sobrescribe el ajuste Debug con `http://localhost:8787` y
permite red local en la configuración App Transport Security de esa configuración Debug
si lo requiere el dispositivo/SO. Los dispositivos físicos necesitan un origen HTTPS accesible;
su dirección loopback apunta al propio dispositivo.

## Configuración y validación

Sigue la [configuración de infraestructura](infrastructure.md) antes de ejecutar el cliente.
`npm run auth:setup:local` genera un secreto local ignorado sin imprimirlo
y aplica migraciones locales. Conserva un archivo `.dev.vars` existente, que
debe definir tanto `BETTER_AUTH_URL` como `BETTER_AUTH_SECRET`.

Las comprobaciones estáticas son `npm run typecheck`, `node --check scripts/release-worker.mjs`
y comprobaciones de sintaxis/tipos Swift. Durante la implementación no se ejecutaron tests de autenticación en ejecución
ni builds iOS. Con cuentas ficticias, una futura verificación autorizada debería
cubrir registro, registro duplicado, contraseña incorrecta, tokens inválidos/sin firmar/vencidos,
restauración de sesión, revocación al cerrar sesión, reintento sin conexión, fallos de Keychain,
límites y preservación de sesión entre publicaciones automáticas. No interpretes
comprobaciones de sintaxis como prueba de comportamiento en dispositivo ni test de autenticación integral.

Fuentes: [email/contraseña de Better Auth](https://better-auth.com/docs/authentication/email-password),
[plugin bearer firmado](https://better-auth.com/docs/plugins/bearer) y
[adaptador Drizzle](https://better-auth.com/docs/adapters/drizzle).

## Editar el perfil actual

El endpoint solo bearer `/api/v1/me` devuelve `photoVersion` anulable junto a
los campos existentes del usuario. `PATCH /api/v1/me` acepta solo un `name` validado.
Leer/reemplazar/eliminar fotos usa `/api/v1/me/photo`, restringido a la cuenta
actual. El email, contraseña, propiedad de sesión y estado de verificación no pueden
cambiarse por estas rutas. La lista general permitida de endpoints Better Auth permanece
sin cambios. Consulta [perfil de cuenta](profile-photos.md#account-profile) e
[infraestructura](infrastructure.md#account-profile-storage) para la migración 0015
y reproducir almacenamiento privado.

El OAuth de cuentas externas para [conexiones MCP](connectors.md#oauth-setup-and-lifecycle)
es independiente del inicio de sesión en Wildcard. Requiere una sesión Wildcard firmada existente
y nunca crea una cuenta Wildcard ni cambia la identidad autenticada.

## Registro, onboarding y modelo de cuenta

El registro reabrió el 28 de octubre de 2026, reemplazando el cierre del 27 de octubre.
La lista pública permitida de autenticación y Better Auth permiten registro por email, con un
límite atómico por IP de cinco intentos por minuto. Ambos clientes ofrecen creación
de cuentas y dirigen las cuentas nuevas al [onboarding](onboarding.md). `GET /me`
y las mutaciones de perfil incluyen `user.onboardingRequired`. La migración 0041 exime
las cuentas existentes y requiere configuración para las futuras. Los clientes vuelven a cargar `/me`
tras autenticarse en lugar de confiar en la respuesta más limitada de Better Auth.

Los superadministradores pueden cerrar el registro en ejecución desde el [panel de administración](admin.md)
(`registration_enabled`, sin publicación). Mientras está cerrado, el registro devuelve
HTTP 403 `REGISTRATION_CLOSED` tras comprobar admisión por IP y ambos clientes
muestran "No se aceptan cuentas nuevas en este momento. Las cuentas existentes pueden seguir
iniciando sesión". La opción para crear cuenta sigue visible porque los clientes todavía no
leen los ajustes. El inicio de sesión nunca se afecta. Los superadministradores también pueden eliminar
cuentas; consulta [eliminar una cuenta](admin.md#deleting-an-account) para saber qué elimina
la cascada.

Cuenta incluye un selector Estándar/Contributor con aceptación explícita de
Contributor. `GET /me` y las mutaciones de perfil incluyen `user.chatModel`;
`PUT /me/model` guarda solo la cuenta autenticada. Consulta [ajustes de modelo](model-settings.md)
para selección de modelo, consentimiento de uso compartido, Estándar para MCP, caché y trabajos
en segundo plano. El onboarding siempre usa Estándar sin cambiar la elección posterior de modelo
de la cuenta. Durante esta implementación no se ejecutó ningún registro real ni inferencia en vivo.
