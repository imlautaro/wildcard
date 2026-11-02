# Notificaciones push de respuestas

La app iOS se registra en Apple Push Notification service (APNs) tras iniciar
sesión y pide permiso de alertas/sonido/badges. La fila **Notificaciones** de Cuenta
muestra el estado push y abre una hoja con estado del badge, reintento y enlace a
ajustes del sistema. Volver a primer plano actualiza registro y permisos. Se
suprimen banners de chats privados en primer plano; los de grupo aparecen cuando
se ve otra pantalla. Los sonidos se eligen según la conversación visible, como
se describe abajo. El sondeo existente actualiza respuestas mientras la app está
activa. Estas alertas visibles no requieren modo de ejecución de fondo ni push silencioso.

Una respuesta completada guarda atómicamente una entrada de salida por dispositivo
registrado de una sesión del propietario no vencida. El Workflow intenta entrega
inmediata y Cron reintenta pendientes cada minuto. Un fallo de generación no avisa;
un fallo push nunca convierte una respuesta completada en turno fallido. Registrar
un dispositivo nuevo no rellena notificaciones históricas.

El título es el nombre actual del contacto y el cuerpo la respuesta del asistente,
como pidió el propietario el 26 de octubre de 2026. `aps.badge` contiene el total
combinado de respuestas privadas y mensajes de grupo no leídos al enviar. Las
respuestas largas se truncan con puntos suspensivos para mantener el JSON completo
dentro de los 4096 bytes UTF-8 de APNs, incluidos escapes y campos personalizados.
La respuesta completa sigue en chat. `thread-id` agrupa por contacto. IDs opacos
de contacto/usuario dirigen un toque a la conversación de la cuenta correcta,
forzando actualización del historial. Un inicio en frío espera restaurar sesión.
Se ignora una notificación de otra cuenta; un contacto eliminado usa la vista
existente de no disponible. Cada solicitud de contacto/historial se autoriza en
servidor.

## Configuración Apple

1. Usa membresía Apple Developer de pago con permiso para gestionar App IDs, claves
   y perfiles. Activa **Push Notifications** y **Communication Notifications** en
   el App ID explícito de tu bundle ID. Este checkout usa `com.imlautaro.Wildcard`;
   una instalación independiente debe usar bundle ID y equipo propios.
2. El target incluye Push Notifications y `Config/Wildcard.entitlements`. Regenera
   perfiles después de activarlo. `APNS_ENVIRONMENT` controla `aps-environment` y
   `WildcardPushEnvironment` en Info.plist: Debug usa `development`; Release,
   `production`. Usa producción para TestFlight/App Store; para Release firmado
   de desarrollo, sobrescribe a `development`. Verifica que el entitlement de la
   app **firmada** coincida con Info.plist: la firma de distribución puede
   reescribirlo. No envíes tokens sandbox a producción ni al revés. El origen API
   no determina el entorno APNs.
3. Crea una clave de firma de tokens APNs con acceso al tema/app y entornos
   deseados. Descarga `.p8` una vez y guárdala fuera de Git. Anota Key ID y Team
   ID de Apple. No pegues la clave privada en el chat.
4. Añade los cuatro secretos cifrados de **Workers Builds**:
   - `APNS_PRIVATE_KEY`: contenido PKCS#8 PEM `.p8` completo. Admite saltos reales
     o secuencias literales `\n`.
   - `APNS_KEY_ID`: identificador de clave Apple.
   - `APNS_TEAM_ID`: Team ID de Apple Developer.
   - `APNS_TOPIC`: bundle ID exacto.
5. Haz commit/push de un release autorizado. El pipeline copia los cuatro a secretos
   cifrados de ejecución en el mismo archivo temporal privado de otros secretos.
   Si hay un ajuste APNs de build, los cuatro deben ser no vacíos. Sin ninguno,
   conserva los secretos existentes. Una instalación sin APNs sigue sirviendo
   chats y autenticación; las pendientes vencen tras 24 horas. No requiere otro
   servicio Cloudflare ni cuenta Firebase.
6. Instala la app iOS actualizada y correctamente firmada en dispositivo físico,
   inicia sesión y permite notificaciones. Actualizar API no actualiza la app instalada.

## API y persistencia

`PUT /api/v1/push/device` y `DELETE /api/v1/push/device` requieren sesión bearer
válida. Ambos aceptan exactamente `{ "token": "<hex APNs token>", "environment":
"development" }` (o `production`) y devuelven 204. Cuerpos de hasta 2 KiB,
30 operaciones/sesión/minuto y diez dispositivos activos por sesión. Se insertan
/actualizan tokens por token/entorno y reasignan a la sesión validada actual;
eliminar solo quita el registro coincidente de esta sesión. El cliente nunca
proporciona otro usuario ni URL/tema arbitrario de proveedor.

`0004_push.sql` añade `push_device` y `push_delivery` a D1 existente;
`npm run auth:setup:local` / releases automáticos la aplican. Los dispositivos
están vinculados a sesión del servidor. Cerrar sesión elimina sesión y en cascada
dispositivos/entregas. Antes de enviar se excluyen sesiones vencidas; reasignar
excluye entregas de la sesión anterior. Eliminar contactos/turnos también elimina
pendientes. Las alertas APNs enviadas no se retiran al salir. El payload ahora
contiene nombres y texto; los ajustes de vista previa del sistema controlan su
visibilidad bloqueada. La comprobación de cuenta impide abrir chats ajenos.
Al salir se borran alertas entregadas y badge. Los tokens siguen en D1 hasta
eliminar sesión, desregistrar, expulsar dispositivo o invalidar APNs; no se
registran valores de tokens ni credenciales.

La entrega usa JWT ES256 y endpoints fijos APNs, límite de 15 segundos, cinco envíos
concurrentes y lote de 30. Una concesión atómica de dos minutos evita reclamos
simultáneos Cron/Workflow. Los transitorios reintentan con espera creciente hasta
ocho intentos y 24 horas. Se eliminan tokens inválidos/no registrados. El éxito
borra la entrada. `apns-collapse-id` usa ID de turno para combinar reintentos;
un envío aceptado seguido de fallo puede duplicar alerta. Aceptar no garantiza
mostrar: sin conexión, Concentración, permisos y ajustes afectan la entrega. No
hay seguimiento de presencia; APNs recibe independientemente del estado y el
delegate suprime presentación en primer plano.

## Desarrollo, verificación y reversión

Autenticación/chats locales funcionan sin secretos APNs. Si hace falta, pon los
cuatro en `.dev.vars` ignorado, nunca control de versiones. Workerd local macOS
puede no negociar HTTP/2 requerido por APNs, aunque Workers desplegados usan el
proxy saliente Cloudflare. Verifica entrega real desde release automático autorizado;
no lo sustituyas por deploy manual. Staging necesita Worker, D1, secretos, origen
API y preferiblemente App ID/ámbito de clave separados.

Tipos TypeScript/Swift y validación plist/proyecto cubren integración de código.
No se hicieron build, tests en ejecución, inscripción de dispositivo, validación
de clave ni entrega real durante implementación. Cuando se autorice, usa contactos
ficticios: registra dispositivo, envía chat, pasa a segundo plano/cierra, comprueba
alerta y tócala en inicio frío. Comprueba también supresión en primer plano,
denegar/reactivar permisos, salir/cambiar cuenta, eliminar contacto, firmas
sandbox/producción y reintento por caída del proveedor.

Revierte código mediante commit/push autorizado. Conserva tablas aditivas que el
código anterior ignora. Los Workflows con checkpoint pueden necesitar compatibilidad
al revertir `generate-and-save` / `deliver-push`; no reescribas migraciones aplicadas.
Desactiva la clave Apple para detener acceso o quita secretos APNs de ejecución
mediante operación autorizada. Las pendientes vencen; ninguna reversión retira
alertas ya mostradas.

Referencias: [registro Apple](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns),
[solicitudes APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns),
[autenticación por token](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns),
[límite HTTP/2 Cloudflare](https://github.com/cloudflare/workerd/issues/4841).

## Configuración de instalación actual (26 de octubre de 2026)

El App ID `com.imlautaro.Wildcard` ya tiene Push Notifications. Se registró una
clave **Wildcard Push Sandbox** autorizada explícitamente con acceso **Topic
Specific / Sandbox** para esta app. Los cuatro nombres `APNS_*` se guardaron como
secretos cifrados **Workers Builds** de `wildcard-api`; persistencia y cifrado se
verificaron al recargar el dashboard. No se registran valores en el repo. El
propietario conserva la clave descargada original.

Solo permite instalaciones Debug firmadas de desarrollo; no entrega en producción
TestFlight/App Store. Aprovisiona una configuración de producción revisada aparte
antes de distribuir; no reutilices claves de apps ajenas. Activar ejecución aún
requiere commit/push de la implementación pendiente por pipeline automático y
luego instalar iOS actualizado. No hubo release ni push real en este paso.

## Corrección de firma y no leídos (26 de octubre de 2026)

El diagnóstico de producción confirmó un dispositivo de desarrollo registrado y
tres entregas con cero intentos. La excepción Cron identificó que `node:crypto.sign`
de Workers rechazaba `PrivateKeyObject` antes de llamar APNs. Ahora se importa
PKCS#8 en Web Crypto y firma ES256 P-256/SHA-256, produciendo firma JWT cruda de
64 bytes. No requiere rotar clave ni cambiar permisos. Fallos de firma y códigos
APNs tienen logs propios; las aceptadas registran solo entorno, nunca tokens,
IDs de usuario ni contenido.

Los no leídos son independientes de APNs. 0005 añade marca de lectura de contacto;
las respuestas completas por encima siguen sin leer entre reinicios. Filas y
pestaña Chats muestran conteos y chats activos reconocen solo última secuencia
completa cargada. Las listas revalidan al activar y cada segundo conservando páginas
posteriores; abrir conversación fuerza historial. Obtener listas/historial no
marca leído. Consulta [contactos](contacts.md) para API, concurrencia, migración y
reversión. Se quitan pushes pendientes de respuestas reconocidas y el reclamo
atómico vuelve a comprobar marca. APNs aceptados/en vuelo no se retiran. Los badges
se añadieron en la actualización siguiente.

Swift/TypeScript estáticos cubren integración. Sin build local ni tests automáticos.
Mostrar y navegar requieren verificar instalación iOS actualizada; aceptar APNs
es una observación separada del servidor.

## Badge del icono y vistas previas (26 de octubre de 2026)

El propietario pidió nombre como título, respuesta como cuerpo y conteo no leído
en el icono, reemplazando el diseño genérico. El proveedor lee contacto/respuesta
actuales y calcula el mismo total del propietario de la API; no registra nombres,
texto, payloads, claves ni tokens. Bastan credenciales, recursos, migraciones y
comandos automáticos existentes.

La app pide `.badge` junto a alertas/sonido y muestra estado de permiso **Badge
del icono** en Cuenta. Las ya autorizadas pueden pedir la opción omitida antes
por el flujo de activación; si el usuario la desactivó, debe usar ajustes del
sistema. Tras cargar conteos o reconocer lecturas, iOS establece total de servidor
con `UNUserNotificationCenter.setBadgeCount`; cero lo quita. Activar primer plano
lo reaplica aunque APNs lo cambiara suspendida. Se serializa y combina para que
una finalización local antigua no gane a conteo nuevo o salida de sesión. Los
reconocimientos devuelven total autoritativo de todo el propietario, incluidas
páginas no cargadas. Fallos del sistema se reintentan al activar/cambiar conteo;
Cuenta muestra el fallo.

Una alerta de fondo actualiza el icono sin ejecutar app. En primer plano se
suprimen banners y sondeo actualiza icono. Es instantánea al enviar: APNs tardío/
fuera de orden o leer en otro dispositivo puede dejar badge de fondo obsoleto
hasta otro push/actualización. No se añadió sincronización silenciosa de fondo.

Sin builds locales, tests automáticos ni nuevos mensajes de prueba de inferencia/
push para esta actualización. Lo estático cubre integración; permisos instalados,
icono y disposición requieren verificar cliente nuevo. Revertir ignora campos
opcionales nuevos; conserva migraciones de lectura. Los antiguos aún abren la conversación.

## Recuperar permiso del badge

Cuenta distingue `badgeSetting.disabled` de `.notSupported`; este último se muestra
**No disponible en esta instalación**, no **Desactivado en Ajustes**. **Activar
badge del icono** vuelve a pedir alertas/sonido/badge en cualquier autorización
no denegada y lee los ajustes resultantes. No omite la petición por un
notSupported anterior. Los fallos siguen visibles en lugar de borrarse al sincronizar
dispositivo. Una denegación aún requiere ajustes del sistema. La ausencia del
interruptor Badges no debe diagnosticarse como desactivación del usuario sin
comprobar el valor devuelto. Hace falta cliente nuevo; recuperación sin verificar.

## Avatares de contactos

Las [fotos de perfil](profile-photos.md) añaden `mutable-content: 1` y, si hay foto,
`photoURL` firmada al payload. El límite JSON incluye URL. `WildcardNotificationService`
embebido descarga la imagen privada por Worker y actualiza alerta con un
INSendMessageIntent entrante. Texto/enrutamiento/badge siguen si no añade avatar.
Continúa suprimiéndose en primer plano.

Añade bucket/binding R2 privado y migración 0006 de [infraestructura](infrastructure.md).
Crea el bucket antes del release, activa Communication Notifications para App ID
principal, firma e instala app con extensión. Ambos targets usan el mismo origen
HTTPS en cada configuración. Sin secreto APNs nuevo. El bucket privado de producción
se creó y verificó el 26 de octubre de 2026. Capacidad/perfiles Apple y presentación
en iPhone pendientes; lo estático no establece avatar push visible.

## Hilo de finalización de respuesta a notificación

El delegate implementa las formas con completion-handler explícito de ambos
callbacks UserNotifications. Despacha enrutamiento y finalización a cola principal
y finaliza exactamente una vez, incluso acciones ignoradas o rutas ausentes.
Se conservan supresión, comprobaciones de cuenta/propiedad y restauración fría.

Un fallo del dispositivo capturado en Xcode el 26 de octubre mostró que el puente
async sintetizado de `PushAppDelegate.userNotificationCenter(_:didReceive:)`
llamaba finalización UIKit de restauración/instantánea desde ejecutor cooperativo
de fondo. UIKit lanzó `NSInternalInconsistencyException: Call must be made on
main thread`. Actualizar destino en MainActor dentro del método no bastaba: la
finalización sintetizada seguía fuera del hilo principal. La finalización explícita
en cola principal elimina ese puente de esta vía.

Instala el binario corregido con Xcode; cambiar servidor o reabrir la app antigua
no cambia su callback. Si Xcode sigue pausado en excepción fatal, detén esa ejecución
antes de iniciar la nueva. Sin reinstalar/borrar datos, cambiar credenciales,
limpiar notificaciones ni release backend. Swift estático cubre cambio; sigue
necesario repetir toque de notificación con app terminada/en segundo plano.

## Sonidos de mensajes (27 de octubre de 2026)

La [web](web.md#message-sounds) reproduce los mismos sonidos con iguales reglas
(`useMessageSounds.ts`, `apps/web/public/sounds`). Desde el 30 de octubre de 2026
aplica +28 dB a archivos atenuados y desbloquea AudioContext con interacción de
confianza; iOS no cambia niveles. No tiene push y por tanto tampoco sonido de fondo.

La app incluye los tres WAV Mixkit del propietario en `Wildcard/Sounds`. El grupo
sincronizado Xcode los incluye como recursos; conserva nombres. Pop/campanilla de
app se atenúan 40 dB y flauta de fondo 10 dB frente a originales, sin cambiar
duración ni metadatos. Los originales quedan fuera del repo. Son PCM de 44.1 kHz,
16 bits, cada uno menor de tres segundos, dentro de
[requisitos Apple de sonidos personalizados](https://developer.apple.com/documentation/usernotifications/unnotificationsound).

- Envío aceptado y respuesta recién completada en chat visible:
  `mixkit-hard-pop-click-2364.wav`.
- Respuesta de otra conversación u otra pantalla con app activa:
  `mixkit-alert-quick-chime-766.wav`.
- Fondo/terminada: `mixkit-flute-mobile-phone-notification-alert-2316.wav` por `aps.sound`.

En primer plano usa System Sound Services sin cambiar sesión de grabación de voz.
Volumen, silencio, estado de audio, Concentración y permiso de sonido afectan la
audibilidad. Son ordinarios, no alertas críticas. Se suprimen banners en primer plano.

`turnID` estable y cuenta autenticada deduplican APNs de primer plano y sondeo.
En chat visible ninguno reproduce ni consume el evento antes de mostrarlo. La
burbuja avisa de aparición tras 250 ms cancelables por animación de inserción/
desplazamiento, comprobando visibilidad, cuenta y actividad. Deduplicar evita
repetir al reaparecer. Actualizar chat informa turnos recién completos fuera del
visible; incrementos no leídos de lista resuelven IDs recientes por historial,
permitiendo sonido incluso sin APNs. Respuestas completadas antes del intervalo
actual en primer plano no repiten. Recién completadas obtenidas por primera vez
en el intervalo pueden notificar; historial igual y ya anunciadas se deduplican.
Sonidos salientes exigen aceptación, incluida recuperación tras timeout; envíos
fallidos y reintentos de respuesta no suenan. Se limpia al salir.

Instala el binario antes del release autorizado que use sonido APNs propio; las
instalaciones sin archivo usan el sistema. Campos nuevos no requieren migración,
binding, capacidad ni secreto. Reversión por commit/push; antiguos ignoran `turnID`.
Tipos estáticos no prueban audio. Verifica tres casos, push tardío deduplicado,
fondo/reanudar, silencio, grabación, permiso denegado y cambio de cuenta en iPhone
con datos ficticios. Sin build, test en ejecución ni push real para este cambio.

El ajuste pedido del 27 de octubre aplica -40 dB al pop/campanilla y -10 dB a flauta.
Se escalan muestras directamente de originales en
`6937d4d050f19648ecd29950c4168375bed2b536` para evitar redondeo acumulativo. El cliente
retrasa sonido visible hasta aparecer burbuja y acabar animación. Instala binario
nuevo para sonidos de primer plano/fondo; los nombres API no cambian y no hace
falta release backend. Se verificaron escala PCM y parámetros WAV sin cambios;
volumen audible en dispositivo sigue sin verificar.

## Mensajes programados

Los [programados](schedules.md) usan la misma bandeja APNs y registro actual de
sesión/dispositivo. Cancelar/editar quita no enviados e invalida generación de
revisión anterior. Entregar comprueba programación inmediatamente antes de solicitar
al externo. Alertas ya en vuelo/aceptadas no se retiran. Salir quita registro de
esta sesión, pero no cancela programaciones.

## Contactos compartidos

Los [compartidos](sharing.md) mantienen notificaciones privadas del destinatario.
Cada participante tiene IDs propios de contacto/conversación, marca de lectura,
total no leído, programaciones, dispositivos, claves de sonido y destino al tocar.
Compartir no distribuye respuestas/recordatorios a otros. Nombres/fotos usan
metadatos canónicos; leer avatar firmado resuelve objeto R2 creador/agente tras
validar pertenencia/sesión. Quitar/salir elimina pendientes de esa persona; eliminar
creador, las de todos. APNs aceptados no se retiran.

Las [invitaciones](sharing.md) dirigidas aparecen en bandeja propia en primer plano,
actualizada como máximo cada 15 segundos o manualmente. No generan APNs, emails,
turnos, sonidos ni badges de mensajes/icono. Solo la cuenta destinataria con sesión
puede aceptar/rechazar.

## Notificaciones de grupos

Los grupos participan en alertas APNs de fondo, no leídos persistentes por miembro
y banners/sonidos en primer plano. `0018_group_notifications.sql` añade
`group_member.last_read_sequence` y `group_push_delivery`, con triggers de fronteras
iniciales de lectura y distribución atómica. Miembros existentes empiezan al día;
sin pushes históricos ni relleno inferido. Nuevos empiezan en historial al unirse.

Un mensaje humano/bot encola cada dispositivo destinatario actual, excluyendo
al autor humano. La solicitud remitente o Workflow intenta entregar y Cron reintenta.
Las filas tienen FKs dispositivo/sesión/miembro, caducidad 24 horas, ocho intentos,
lotes de 30 y cinco envíos concurrentes. Concesión de dos minutos evita envíos
simultáneos; controles finales cubren lectura, pertenencia, sesión y reasignación.
Firma y transporte se comparten con privados. Aceptación Apple no prueba pantalla;
los reintentos son al menos una vez.

El payload usa título/grupo, subtítulo/remitente, texto o etiqueta de adjunto,
badge combinado, `groupID`, `userID` destinatario, ID, secuencia y fecha. Texto
largo tiene límite UTF-8 como privados. ID de colapso SHA-256 admite IDs bot largos.
Grupos usan alertas APNs ordinarias con icono de app, sin extensión de avatar
privado. Sin capacidad, tema, recurso ni secreto Apple nuevo.

Lista/detalle devuelven conteos/secuencia por miembro. Lista también devuelve
hasta 50 actividades no leídas entre membresías actuales como alternativa de
sondeo. La app consulta aproximadamente cada segundo activa y actualiza badges
de fila, Chats e icono. Espera instantáneas iniciales privada/grupo antes de
reemplazar icono. `PUT /api/v1/groups/:id/read` reconoce solo historial existente
mostrado, avanza monótonamente y limpia entregas de ese miembro. Un chat activo
visible registra observación; la sesión termina/reintenta escritura desde Home.
Home/detalles nunca crean observaciones de sus instantáneas. Revisiones de lectura
protegen ante listas obsoletas y confirmar lectura elimina notificaciones entregadas
correspondientes del dispositivo actual.

El delegate trata pushes remotos de primer plano como pistas de sincronización.
Tras aplicar actividad obtenida, iOS programa banners fuera del grupo visible con
campanilla. Sondeo usa misma vía sin APNs; IDs deduplican ambas en esa sesión de
primer plano. Dentro del grupo atendido solo suena burbuja nueva tras insertarse.
No repite sonidos/alertas antiguos al activar. Siguen permisos de alertas y audio
habitual. Tocar restaura cuenta y navega al grupo autorizado en servidor. Salir
limpia presentación/lectura y notificaciones locales programadas.

Publica automáticamente migración/API desde código commit/push e instala app.
Con miembros/dispositivos ficticios verifica push humano/bot en fondo/cerrada,
sin eco al autor, banner/campanilla en Home, sin banner y un sonido dentro del
grupo, conteos tras reabrir, badges combinados, sincronización de lectura y supresión
tardía, toques, salir/cambiar cuenta, quitar miembro, dispositivos vencidos/
reasignados, recuperación, solo adjuntos y carreras APNs/sondeo. No se hizo push,
test en ejecución ni verificación de dispositivo al implementar.

Referencias: [opciones de primer plano Apple](https://developer.apple.com/documentation/usernotifications/unnotificationpresentationoptions)
y [cabeceras/límites APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns).

## Sincronizar antes de presentar en primer plano

Los callbacks remotos APNs en primer plano encolan actualización de sesión y
suprimen audio/banner inmediatos. Se actualiza historial/resumen Home compartido
antes de solicitar presentación. Chats visibles esperan aún inserción de fila.
Audio añade 100 ms para observar cambios y comprueba de nuevo cuenta, intervalo
de primer plano y conversación visible. Los grupos usan deduplicación existente
por ID. APNs de fondo/terminada no cambia.

La sesión usa sondeo alternativo de un segundo y solicitudes independientes de
lista/historial. No es garantía de tiempo de extremo a extremo. Consulta
[sincronización compartida](caching.md#shared-conversation-synchronization) para
comandos de regresión, ciclo de vida, caché y verificación. Las comprobaciones
separadas no prueban audio, entrega ni pantalla reales. Instala binario iOS;
no necesita deploy API.

Los reconocimientos de marcas no leídas pertenecen ahora a sesión, no a tarea
cancelable de vista. Chat privado/grupo visible encola síncronamente la última
secuencia leída cargada. Salir no la abandona; el temporizador de primer plano
reintenta fallos aparte de listas y actualiza conteos fila/pestaña/icono tras
confirmar servidor. No reconoce vistas Home no vistas. Consulta
[vida del reconocimiento](caching.md#read-acknowledgement-lifetime) para retención,
protección contra obsoletas y verificación pendiente.

## Alertas de bots sin Markdown

La API convierte Markdown bot a texto plano antes de payloads privados/grupo y
límite UTF-8 serializado. Cubre también alternativa SO si la extensión no termina:
el cuerpo original ya es plano. Alertas humanas siguen literales. Se conservan
etiquetas de enlaces/imágenes, se quitan delimitadores y código queda literal.
Actividad de grupo añade `previewText` opcional y `agentID`; iOS usa resumen plano
para notificaciones locales. En instantáneas antiguas interpreta origen bot
conocido. No cambian registro, rutas, badge, recibos, fotos, consentimiento ni
almacenamiento. Alertas entregadas no se reescriben. API exige release automático
normal. Pasaron comprobaciones API/web/Swift; no se reverificó presentación real
APNs/primer plano en dispositivo.

## Respuestas de iniciativa

La [iniciativa](initiative.md) privada reutiliza turnos completados y bandeja APNs
transaccional, con vistas sin Markdown, identidad y badges. Reconocer lectura
suprime pendientes normalmente. Desactivar evita publicaciones futuras y conserva
mensajes publicados y su entrega habitual. Push de navegador sigue no disponible;
no se ha verificado de nuevo la entrega en dispositivos.

## Secuencias de respuestas

Las respuestas privadas de varios mensajes mantienen un no leído, sonido y push
por turno completado, usando texto entregado unido. Una ráfaga detenida conserva
el prefijo entregado. Partes de grupo tienen notificaciones, recibos y conteos
individuales. Consulta [mensajes sucesivos](reply-messages.md) para límites y
verificación ficticia en dispositivo; lo estático no establece entrega APNs.

## Web Push de navegador

Los navegadores reciben las mismas alertas mediante Web Push (RFC 8030), cifrado
`aes128gcm` (RFC 8291) y VAPID (RFC 8292), implementados con WebCrypto en
`apps/api/src/push/web.ts`. Una suscripción es fila `push_device` (token = SHA-256
hex del endpoint, entorno `production`) más `web_push_subscription` con endpoint
y claves (0085); se aplican sin cambios distribución (`enqueueReply`, trigger
`group_message_push`), bandejas, reintentos, caducidad y limpieza al salir.
`deliverPush` y `deliverGroupPush` usan `sendWebPush` para web y APNs para iOS;
cada protocolo solo corre con sus secretos. 404/410 elimina dispositivo, 2xx
completa, lo demás reintenta con espera existente.

Los endpoints deben ser `https` en un servicio push de proveedor de navegador
(FCM, Mozilla, Apple, hosts notify Windows); lista permitida al registrar y enviar.
Solo acepta `endpoint` y `keys.{p256dh,auth}`, comparte límite de registro APNs y
diez dispositivos/sesión. Un navegador que entra a otra cuenta se mueve a esa
sesión. Payload JSON plano (`title`, `subtitle`, `body`, `tag`, `url`, `unread`),
máximo 3000 bytes, sin Markdown bot.

Secretos (los tres o ninguno, nunca valores en Git): `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (contacto `mailto:` o `https:`). Genera par por
instalación con `node scripts/generate-vapid-keys.mjs`, añade secretos cifrados
Workers Builds (el script los pasa) o `.dev.vars` local. Rotar hace que navegadores
se resuscriban en la próxima carga. Reversión: quitar secretos (solo paran alertas
web); 0085 es aditiva.

## Chats abiertos suprimen alertas

Un privado abierto y visible en cualquier dispositivo conserva `chat_visit`
(web/iOS envían `chat/activity` y sondeo renueva), así que abrir en una plataforma
silencia alertas de la otra. Mientras hay visita del contacto, se difieren entregas
a todos —navegadores e iOS— sin consumir intentos. Leer borra entrega; si termina
visita sin leer (pestaña oculta, cerrada o inactiva), sale en el Cron del minuto
siguiente. «Abierto» significa visible, no necesariamente enfocado. Grupos todavía
sin señal de visita, por lo que no se suprimen. Solo validado preparando consultas D1 local.

## Alias del contacto en notificaciones

Los pushes directos usan el alias propio del destinatario como título; en grupos
se resuelve `subtitle` del bot por destinatario (`agentDisplayName` contra ese
usuario), por lo que miembros pueden recibir nombres distintos para el mismo
mensaje bot. Título de grupo y texto no cambian. Consulta
[contactos](contacts.md#contact-alias-private-display-name). Sin verificar en
dispositivo; cambiar alias no reescribe entregadas.
