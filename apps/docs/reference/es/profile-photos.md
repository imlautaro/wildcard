# Fotos de perfil de contactos

Los agentes pueden tener una foto de perfil, visible para sus participantes autorizados y editable solo por su creador. Las fotos aparecen en la
lista Chats, título de conversación, editor del contacto y notificaciones de comunicación
compatibles de iOS. No crean entradas en Contactos del sistema. Los [contactos compartidos](sharing.md) reutilizan el objeto R2 canónico de creador/agente sin copiar bytes.

## Edición nativa

Elige **Editar** en el menú contextual/al deslizar una fila o toca el título de conversación.
El editor del contacto y Cuenta comparten `ProfileIdentityView`: un avatar circular
centrado con un círculo menor de cámara en su esquina inferior derecha y nombre
centrado debajo. Toca el avatar para abrir **Elegir foto** y, si existe foto,
**Eliminar foto**. Toca el nombre para abrir **Editar nombre** y luego introduce y confirma el
nombre en una alerta nativa. Un contacto nuevo muestra **Añadir nombre** hasta nombrarse. Los miembros
que no pueden administrar un contacto compartido ven la misma identidad sin menús de edición.

Los mismos controles de foto están disponibles al crear un contacto. **Elegir foto**
usa el selector del sistema Fotos sin solicitar acceso a toda la biblioteca.
La hoja de recorte permite arrastrar, pellizcar y usar un deslizador de zoom con una guía
circular de avatar. **Usar foto** prepara una imagen cuadrada; **Cancelar** conserva el borrador
anterior. **Eliminar foto** restaura el placeholder al guardar.

ImageIO reduce la imagen seleccionada a un máximo de 2048 píxeles antes de editar
y aplica su orientación. El recorte genera un JPEG nuevo de 512 × 512 a calidad 0,85,
sin copiar metadatos EXIF/GPS de origen. Las subidas se limitan a 512 KiB. Las fotos
se guardan solo después de Crear/Guardar. Nombre y foto usan solicitudes separadas: si
la foto falla después de guardar el nombre, el editor conserva el ID del contacto y la foto
seleccionada y ofrece Guardar para reintentar sin crear otro contacto. Un contacto nuevo
puede quedar sin foto después de un fallo de red.

## Edición web

Cuenta y contactos existentes propios usan `IdentityEditor` como `ProfileIdentityView`:
un botón de cámara en el avatar elige foto (o, si existe, abre una hoja con
**Elegir foto** y **Eliminar foto**) y el nombre debajo abre una hoja **Nombre**
que guarda inmediatamente. Comparten un diálogo manual **Recortar foto**. Seleccionar
un archivo abre una vista previa local; arrastra con ratón o táctil para recolocar, pellizca o
usa el deslizador **Zoom de foto** (1–4×) y elige **Usar foto** para confirmar. Las flechas
mueven la imagen con la vista previa enfocada; Shift aumenta el paso. La guía
circular anticipa el avatar dentro de la subida cuadrada. **Cancelar** o Escape
conservan la foto anterior y no envían solicitud. El modal retiene foco mediante el
elemento dialog nativo y lo restaura al cerrar.

El navegador aplica orientación, limita la fuente del editor a 2048 píxeles
y genera el recorte confirmado como JPEG de 512 × 512 sobre blanco. Recodificar elimina
metadatos de origen y reduce calidad JPEG si hace falta para quedar bajo 500 KiB. La
fuente seleccionada existe solo en memoria y se libera al cancelar, confirmar, navegar,
perder capacidad de edición o cambiar de cuenta. Las finalizaciones tardías de decodificación/codificación no pueden
aplicar una selección cancelada. El comportamiento existente de subida y caché versionada de avatar
perteneciente a sesión no cambia; no se inicia solicitud antes de confirmar.

Este cambio exclusivo de web alinea estos editores con el recortador existente de iOS.
La creación web de contactos y edición de fotos de grupo siguen sin estar disponibles como se describe en
[limitaciones web](web.md). Las comprobaciones estáticas no verifican interacciones del navegador.
Comprobaciones manuales pendientes con imágenes ficticias: retrato/paisaje y rotación EXIF,
arrastre con ratón/táctil, zoom de pellizco/deslizador en bordes, teclado/foco/Escape,
cancelar y volver a elegir el mismo archivo, imágenes transparentes, archivos ilegibles/pequeños,
recuperación de fallo de subida, navegar durante decodificación/codificación y cambiar de cuenta.

## API y almacenamiento

Las respuestas existentes de contactos añaden `photoVersion` anulable (un UUID opaco).
Las respuestas anteriores sin esta propiedad siguen siendo decodificables por el cliente actualizado.
No se expone ID de propietario, clave R2 ni URL pública permanente de imagen en esas respuestas.

| Método | Ruta | Comportamiento |
| --- | --- | --- |
| GET | `/api/v1/contacts/:id/photo` | Lee el JPEG actual del propietario; `version` opcional debe coincidir |
| PUT | `/api/v1/contacts/:id/photo` | Reemplaza con `image/jpeg` sin procesar; devuelve el contacto actualizado |
| POST | `/api/v1/contacts/:id/photo/generate` | Retrato IA solo para creadores desde identidad guardada (`{ style, customStyle? }`); devuelve contacto actualizado. Consulta [generación de contactos](contact-generation.md#ai-photo-for-an-existing-contact) |
| DELETE | `/api/v1/contacts/:id/photo` | Elimina la imagen; devuelve el contacto actualizado |

Los tres requieren la sesión bearer firmada existente. Las lecturas comprueban pertenencia del participante en D1; las escrituras requieren además propiedad del creador.
Un contacto ausente/ajeno o foto ausente devuelve 404; sin autenticación devuelve 401.
Las subidas cuentan bytes transmitidos, rechazan más de 512 KiB con 413, exigen JPEG con
415 y comprueban marcadores JPEG y dimensiones cuadradas de 64–1024 píxeles con 422.
Es validación estructural, no decodificación ni transformación de imágenes del servidor.
La app siempre recodifica el recorte. Las subidas tienen una cuota atómica por propietario de
12 por minuto; 429 incluye Retry-After. Los cambios concurrentes usan compare-and-swap
D1 y devuelven 409 en conflicto en lugar de sobrescribir una foto más nueva.

La migración `0006_contact_photos.sql` añade `contact.photo_version` anulable. El binding
R2 `CONTACT_PHOTOS` guarda bytes en
`contacts/<owner>/<contact>/<version>.jpg`. Cada subida tiene versión/clave nueva;
D1 cambia referencias solo tras aceptar R2 la escritura. Publicaciones fallidas y
fotos reemplazadas solicitan limpieza; eliminar foto/contacto también la solicita.
La limpieza es de mejor esfuerzo y solo registra `contact_photo_cleanup_failed`, sin
claves ni datos personales. Las solicitudes interrumpidas o fallos de almacenamiento pueden dejar objetos
huérfanos privados; no hay barrido de huérfanos en segundo plano. La futura eliminación de cuentas
debe limpiar también R2 porque las cascadas SQL no pueden eliminar objetos.

Las lecturas usan `private, no-store`, tipo de contenido JPEG fijo y `nosniff`. Los fallos de caché de red
usan una URLSession efímera autenticada. La app comparte memoria de avatares decodificados
y caché de disco protegida por cuenta con imágenes del chat; consulta
[caché reciente de imágenes](caching.md#recent-chat-images-and-avatars) para presupuestos,
vencimiento, protección de archivos e invalidación. Las claves incluyen ID y versión de contacto,
para que una foto cambiada no reutilice la versión anterior. Las subidas aceptadas precargan la
caché. Cerrar sesión/expiración borra bytes en caché. No hay entrega pública del bucket;
la caché no cambia autorización del servidor ni política de caché HTTP.

## Avatares en push

Las alertas APNs incluyen `mutable-content: 1`. Cuando un contacto tiene foto, el proveedor
añade una `photoURL` HTTPS firmada limitada a esa versión de contacto, sesión receptora
y como máximo la ventana de entrega restante de 24 horas. Usa HMAC-SHA256
con separación de dominio y el secreto existente de autenticación de runtime; no requiere otro secreto.
El Worker verifica firma, vencimiento, versión actual de foto y sesión vigente del
propietario antes de transmitir bytes R2. Eliminar/reemplazar foto o eliminar la
sesión revoca lecturas posteriores. La URL es una capacidad bearer temporal;
nunca la registres, distribuyas ni incluyas en analíticas. APNs procesa esta URL
junto al nombre y texto de respuesta del contacto ya solicitados.

La extensión integrada `WildcardNotificationService` descarga solo desde el origen configurado
HTTPS de API y la ruta `/api/v1/push-photos/`. Rechaza redirecciones, limita la
respuesta a 512 KiB y usa un tiempo de espera de recurso de 15 segundos. Crea un
INSendMessageIntent con contacto como remitente y cuenta como destinataria,
dona la interacción entrante y actualiza la notificación con la imagen del
remitente. Las notificaciones de comunicación del sistema usan estas donaciones para sugerencias.
No se necesita permiso Contactos del sistema, Keychain compartido, App Group ni token
 general de sesión en APNs. Las notificaciones originales de texto siguen disponibles si fallan o vencen descarga,
conversión de intent, donación o ejecución de la extensión. Los cambios de foto
no actualizan retroactivamente notificaciones ya entregadas.

Habilita la capacidad **Communication Notifications** de la app y firma app
y extensión integrada con tu propio equipo/identificadores. Fija el mismo
`WILDCARD_API_URL` para ambos targets y configuraciones. El aprovisionamiento Apple y
presentación en dispositivo físico deben verificarse por separado; iOS controla diseño
final, vistas previas, comportamiento de Focus y si ejecuta la extensión.
Consulta [notificaciones](notifications.md) e [infraestructura](infrastructure.md).

## Reproducción y validación

Aprovisiona el bucket privado antes de una publicación autorizada por commit/push, siguiendo
[infraestructura](infrastructure.md). Wrangler local emula R2 sin bindings
remotos; la configuración local aplica la nueva migración D1. Las migraciones de producción se
aplican solo mediante la publicación automática existente. Mantén staging en buckets,
Workers, bases de datos, IDs de app y orígenes API separados. No se necesita r2.dev ni dominio público,
CORS, credenciales S3, Cloudflare Images ni servicio nuevo de procesamiento de imágenes.

Pasaron comprobaciones estáticas de TypeScript, app/extensión Swift, plist/proyecto y scripts.
El bucket R2 de producción se creó después y se verificó privado el
26 de octubre de 2026. Para este cambio no se hizo migración local, build/test, instalación iPhone ni push;
la migración y publicación de código de producción usan la publicación automática autorizada
por commit/push. Quedan comprobaciones funcionales con contactos ficticios:
recorte retrato/paisaje, cancelar/eliminar, reintento de subida, reemplazo/eliminación,
cerrar sesión/cambiar de cuenta, aislamiento entre dos propietarios, JPEGs inválidos/demasiado grandes, URLs manipuladas/
vencidas/revocadas y un push real en segundo plano a un iPhone físico firmado.

Revierte mediante commit/push autorizado. Conserva la columna D1 aditiva y el bucket/datos
R2; el código anterior ignora los campos nuevos. Nunca elimines el bucket para revertir
código. Restaurar código no recupera fotos reemplazadas/eliminadas. Exporta metadatos
D1 y objetos R2 correspondientes juntos al hacer copias de seguridad.

Referencias: [API Workers de R2](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/),
[notificaciones de comunicación Apple](https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications).

## Fotos de identidad compartida

La migración 0013 proyecta nombre/versión de foto canónicos a todos los registros de conversación de participantes. Las lecturas autenticadas y de avatares de notificación firmados validan primero el contacto/sesión privados del destinatario y después resuelven la clave de almacenamiento del creador/agente original. Eliminar un miembro revoca sus lecturas posteriores y no elimina la foto compartida. Eliminar al creador elimina el objeto compartido con la limpieza existente de mejor esfuerzo.

## Perfil de cuenta

Cuenta muestra tu nombre, email y foto actuales. Los controles compartidos de avatar/nombre
se editan directamente en Cuenta; no hay pantalla separada Editar perfil
ni botón Guardar global del perfil. Confirmar un nombre guarda solo el nombre.
Elegir **Usar foto** en el recortador guarda solo la foto; **Eliminar foto**
persiste la eliminación inmediatamente. Cancelar selector, recortador o alerta de nombre no hace
cambios. El control compartido reutiliza recortador y preparación JPEG de contactos
descritos arriba. Las escrituras fallidas muestran error en línea y Reintentar, conservando
nombre enviado o foto recortada hasta reemplazarlos con otra edición. Los controles y
cerrar sesión se deshabilitan durante la actualización. La edición de contacto sigue preparando cambios
hasta Crear/Guardar, incluida su recuperación existente de guardados parciales.

Cuenta actualiza el perfil al abrirse y espera esa actualización antes de
habilitar edición para evitar sobrescribir una edición nueva con la lectura de apertura.
Las respuestas de autenticación pueden omitir la versión opcional de foto; el cliente lee
el perfil canónico desde `/api/v1/me` después de iniciar sesión.

| Método | Ruta | Comportamiento |
| --- | --- | --- |
| GET | `/api/v1/me` | Usuario actual, incluido `photoVersion` anulable |
| PATCH | `/api/v1/me` | Exactamente un campo `name`; devuelve usuario actualizado |
| GET | `/api/v1/me/photo` | JPEG actual; la versión opcional debe coincidir |
| PUT | `/api/v1/me/photo` | Reemplaza con un JPEG cuadrado sin procesar; devuelve usuario actualizado |
| DELETE | `/api/v1/me/photo` | Elimina foto; devuelve usuario actualizado |

Cada ruta requiere sesión bearer firmada y deriva el ID exclusivamente
de ella. Los nombres se recortan, no son vacíos, se limitan a 100 escalares Unicode
y rechazan caracteres de control. Las fotos tienen el mismo límite transmitido de 512 KiB,
tipo de contenido y comprobaciones estructurales JPEG que las subidas de contactos. Las escrituras de foto comparten
una cuota por cuenta de doce cambios por minuto. Los cambios simultáneos usan
compare-and-swap y devuelven 409 en lugar de reemplazar una foto más nueva.

La migración `0015_account_photos.sql` añade `user.photo_version` anulable; no
reutiliza la URL de imagen de Better Auth. El binding privado R2 `CONTACT_PHOTOS`
existente guarda `users/<user>/<version>.jpg`. Solo el propietario de cuenta puede leer
estos bytes; no se exponen mediante contactos compartidos ni URLs de avatares push.
Las lecturas usan encabezados private/no-store. Los avatares de cuenta usan la misma
[caché protegida reciente de imágenes](caching.md#recent-chat-images-and-avatars), con clave por
photoVersion de cuenta; una versión nueva selecciona bytes nuevos inmediatamente.
Los reemplazos/eliminaciones solicitan limpieza R2 de mejor esfuerzo con el helper existente;
las solicitudes interrumpidas pueden dejar objetos huérfanos.
La futura eliminación de cuentas debe limpiar este prefijo y los objetos de contactos.

No se necesita servicio, secreto, bucket, capacidad ni permiso de biblioteca Fotos nuevo.
La configuración local y publicaciones automáticas aplican la migración aditiva mediante
el proceso existente en [infraestructura](infrastructure.md). Conserva la columna y
objetos privados al revertir código; el código anterior ignora el campo añadido al perfil.
La validación funcional sigue pendiente: persistencia de nombre/foto tras volver a iniciar sesión,
recortar/cancelar/eliminar, reintento de foto después de guardar nombre, escrituras simultáneas, subidas
inválidas y aislamiento entre dos cuentas ficticias.


Los miembros de grupo aceptan explícitamente compartir nombre visible y foto actual con los demás miembros. Las rutas autenticadas de fotos grupales comprueban pertenencia actual al grupo y del destinatario, sin conceder acceso a contacto privado ni edición de cuenta. Consulta [grupos](groups.md).


## Identidad del grupo

La creación y detalles de grupo reutilizan editor de avatar/nombre y recortador. Solo el
propietario edita estos campos; los miembros actuales pueden leer la foto. La migración 0017 añade
`chat_group.photo_version`. Los JPEGs usan `groups/<groupID>/<version>.jpg` en el bucket
R2 privado existente, con la misma validación de dimensiones/tamaño y patrón compare-and-swap.
Los avatares de encabezado/lista usan la caché protegida existente con claves distintas de
grupo. Consulta [grupos](groups.md#group-photos-attachments-and-voice) para endpoints,
limpieza, límites y validación aún pendiente en dispositivo.

## Retratos generados de onboarding

El [onboarding del primer círculo](onboarding.md) usa Meta Muse Image 1.0 para cinco retratos
JPEG privados. A diferencia de subidas manuales, las imágenes generadas pueden tener hasta 4096 píxeles
cuadrados y 8 MiB; el tamaño solicitado a Meta especifica proporción. Los límites y
validación de subida no cambian. Los retratos generados usan las mismas rutas autenticadas de fotos,
versiones inmutables, claves de caché acotadas al acceso y rutas de eliminación que los avatares
normales. Las imágenes de configuración parcial siguen privadas en R2 para reintentos hasta
completar; no se añade caché separada de imágenes ni URL pública.

## Imágenes de perfil disponibles para contactos

Los contactos pueden llamar `view_profile_photo` cuando el contexto visual de perfil ayuda a responder.
En chats privados pueden inspeccionar su avatar canónico y la foto de cuenta de la
persona actual. En un grupo también pueden inspeccionar avatares de miembros humanos y
agentes actuales usando IDs de la lista. Las llamadas privadas no pueden obtener fotos de otros miembros
mediante búsqueda de grupos compartidos. La capacidad es común a iOS y web;
no requiere selector, adjunto, interruptor ni actualización de cliente adicional.

La herramienta de solo lectura devuelve una referencia inmutable de identidad/versión. Antes de cada
inferencia posterior, el servidor comprueba acceso actual a conversación, pertenencia,
consentimiento de memoria compartida y Contributor cuando corresponda y versión exacta
actual de foto. Lee bytes privados R2 mediante el binding existente y comprueba
acceso/versión otra vez después de leer. Las fotos ausentes, eliminadas, reemplazadas o inaccesibles
producen un marcador no disponible; no se sustituyen silenciosamente bytes antiguos ni fotos de
reemplazo. Una llamada nueva puede pedir el reemplazo. Nombres y texto de imagen
son evidencia no confiable. Los avatares no establecen identidad ni apariencia real
y el contacto recibe instrucciones de no inferir rasgos sensibles ni inventar detalles no vistos.

Cada inferencia incluye como máximo tres fotos distintas y 8 MiB de bytes JPEG
combinados, permitiendo retratos generados de onboarding dentro del presupuesto. Las lecturas duplicadas
para un miembro seleccionan la última versión solicitada. Las lecturas consumen el presupuesto existente
de herramientas de conversación. Las imágenes se envían al modelo seleccionado de esa conversación
solo tras llamar a la herramienta de foto; no se adjuntan automáticamente a todos los turnos.
Las conversaciones de conectores conservan procesamiento Estándar y aislamiento existente.

No hay URL pública nueva, endpoint, migración de base de datos, bucket, secreto ni
configuración de infraestructura. Los Workflows de grupo guardan solo referencias de identidad/versión
en checkpoints; los bytes de imagen se cargan dentro de pasos de inferencia y nunca se devuelven
 desde ellos. Las entradas del modelo son transitorias; no se añade caché de imágenes ni resumen
visual guardado. La extracción existente de memoria y retención de chat siguen vigentes.
Las cachés de avatar de clientes e invalidación al subir/eliminar no cambian; consulta [caché](caching.md).

La verificación estática no establece calidad visual ni comportamiento funcional.
Comprobaciones pendientes con datos ficticios: fotos propias/de usuario en privado, fotos humanas y
de bots en grupo, fotos ausentes, reemplazo/eliminación entre herramienta e
inferencia, revocación de pertenencia/consentimiento, selección Contributor/Estándar, chats aislados
de conectores, llamadas repetidas, presupuestos de imagen y respuestas equivalentes desde iOS
y web. Las llamadas en vivo al modelo y validación en dispositivo/navegador requieren ejecución separada.

Los contactos pueden usar fotos actuales accesibles como referencias de generación cuando
un visual encaja en la conversación, además de inspeccionarlas. El ámbito privado es
el propio contacto/persona actual; los grupos usan miembros actuales autorizados. Se pueden componer hasta tres
referencias versionadas en una imagen; no se crea URL pública.
Consulta [imágenes generadas](generated-images.md) para autorización y retención de imágenes
derivadas tras cambiar un avatar.


La generación usa avatares actuales para selfies solicitadas y miembros nombrados, y
puede recuperar fotos enviadas por personas o contactos en este mismo chat como referencias de escena/edición.
Las descripciones visuales internas son solo del servidor y no se muestran en
pies, historial público ni cuadrículas multimedia. iOS y web usan la API compartida y
el visor/caché existente de imágenes entregadas; no se necesitan cambios de formato de cliente.
Consulta [referencias y descripciones de imágenes](generated-images.md#internal-image-descriptions-and-retrieval)
para ámbito, indexado diferido de historial antiguo, límites, retención y verificación.
