# Contactos compartidos

Un contacto compartido es un agente con una identidad, foto de perfil, espacio de memoria,
presencia y cola de atención. Cada participante tiene una conversación privada separada,
marca de lectura, recuento de no leídos, programaciones, adjuntos y destinos push. Unirse
inicia un chat vacío. Nunca clona un agente ni copia el historial de otra persona.

Compartir por sí solo no da acceso al dispositivo. Un participante puede permitir por separado a otro
participante actual solicitar temporizadores/alarmas en su propio iPhone vinculado mediante
este agente y revocar el permiso en iOS o web. Consulta
[delegación explícita de dispositivos](native-remote.md#allow-a-shared-contact-participant).
Este permiso no expone ninguna de las conversaciones privadas.

## Flujo iOS y consentimiento

El creador abre un contacto y elige **Compartir contacto** en el menú de tres puntos del chat. **Compartir
contacto** enumera participantes e invitaciones pendientes (eliminar/revocar son botones de
icono), con la explicación general detrás de un botón de información. **Invitar a alguien**
abre una hoja que mantiene el texto de memoria compartida junto a sus interruptores y permite
introducir el email de una persona existente y tocar **Enviar invitación**, o crear un
código de invitación. Web usa el mismo diseño. El servidor resuelve esa dirección a un ID inmutable de cuenta y crea
una solicitud dentro de la app para esa cuenta. El destinatario abre **Chats → + → Contactos → Invitaciones de contactos**
y acepta o rechaza allí. Aceptar sigue
requiriendo consentimiento de memoria compartida y, cuando corresponda, Contributor. No se envía
email al buzón ni alerta push de invitación. La app en primer plano actualiza su
bandeja como máximo una vez cada 15 segundos, inmediatamente al entrar en primer plano
y mediante actualización manual. El recuento pendiente aparece en la fila Invitaciones de contactos, separado de indicadores de mensajes.

El desplegable opcional **Invitar con un código** conserva el flujo anterior:
crear código, compartirlo con la hoja del sistema y pedir al destinatario elegir
**+ → Contactos → Unirse a contacto compartido**. Los códigos vencen a las 24 horas, son capacidades bearer de un solo
uso y no están ligados a un destinatario. Las solicitudes dirigidas también vencen
tras 24 horas, pero solo la cuenta destinataria resuelta puede aceptarlas/rechazarlas,
aunque alguien conozca su ID de invitación.

La búsqueda de email recorta espacios y no distingue mayúsculas. Requiere cuenta
existente, rechaza autoinvitaciones e informa miembros ya autorizados.
Un miembro existente puede invitarse de nuevo si requiere consentimiento Contributor nuevo.
Reenviar a la misma cuenta reutiliza una solicitud pendiente sin vencer sin
extender su vencimiento; no crea duplicados. Rechazar o revocar como creador
elimina la solicitud pendiente sin cambiar pertenencia. Las solicitudes
siguen los IDs de cuenta si cambia la dirección y se eliminan si se elimina
esa cuenta. Una cuenta nueva registrada con la dirección anterior no puede reclamarlas. La verificación de propiedad
 de email sigue sin configurarse en autenticación; esta función
selecciona una cuenta por su dirección registrada y no prueba propiedad del buzón.

iOS rechaza el email propio de la cuenta autenticada antes de enviar una invitación,
ignorando espacios alrededor y mayúsculas. La API sigue siendo autoritativa.
Las solicitudes muestran los errores de validación acotados y en texto simple de la API para
autoinvitaciones, cuentas ausentes, acceso existente, invitaciones vencidas y
límites. Nunca terminan usando mensajes de nombre de contacto o registro.
Los cuerpos de error ausentes/malformados usan un mensaje de respaldo de uso compartido; HTTP 401 sigue
usando la gestión existente de sesión vencida. Instala la app actualizada con Xcode
para recibir esta corrección del cliente. Las comprobaciones estáticas de tipos Swift cubren el ajuste;
no se realizaron tests en ejecución, invitaciones reales, build ni publicación para él.

Esta implementación permite cuatro participantes por agente, incluido su creador,
y diez invitaciones pendientes. Los participantes existentes pueden aceptar otra invitación
sin crear una segunda conversación. Los reintentos exitosos de aceptación del mismo
destinatario devuelven la conversación existente, incluso tras vencer el código.

Solo el creador edita nombre/foto compartidos, crea/revoca invitaciones o
elimina participantes. Eliminar a alguien borra su conversación,
programaciones, referencias D1 de adjuntos, push pendientes y recuerdos aportados.
Los bytes R2 de adjuntos siguen la limpieza diferida existente. Un participante también puede
salir eliminando su fila de contacto. Eliminar como creador elimina todo el agente
y las conversaciones de todos; iOS lo explica antes de su
confirmación existente. No pueden retirarse llamadas a proveedores en curso ni alertas entregadas.
Un hecho eliminado puede sobrevivir en respuestas ya enviadas a otros,
solicitudes al proveedor, checkpoints de plataforma y copias de seguridad. No es borrado
exhaustivo ni un sistema granular de privacidad por hecho.

La instalación existente usa modo Contributor con el consentimiento anterior individual
del creador. Eso no autoriza a otras personas. Crear y aceptar
invitaciones explican explícitamente el posible uso de entrenamiento de Meta cuando el
modelo configurado es Contributor y requieren acuerdo. Aceptar persiste el consentimiento
Contributor del participante. La generación, admisión de transcripción, extracción de
memoria y selección de memoria compartida aplican los requisitos de consentimiento
del modelo configurado. Si un operador cambia después de Estándar a Contributor, un miembro
existente sin consentimiento debe aceptar una invitación nueva antes de generar;
sus recuerdos se omiten de entradas Contributor hasta entonces. Estándar sigue siendo
el ajuste recomendado para cuentas independientes salvo autorización separada. Para esta implementación no se cambió
configuración/modelo ni se ejecutó inferencia.

## Identidad y almacenamiento de conversación privada

La migración `0013_shared_contacts.sql` introduce `contact_agent` como identidad
y conserva `contact` como proyección privada de conversación de un participante. Los
IDs existentes y claves foráneas compuestas permanecen intactos. Los contactos existentes
se convierten en agentes con el mismo ID y creador; no se mueve ni copia historial. Un participante
nuevo obtiene otro `contact.id` privado que referencia el mismo `agent_id`.
`UNIQUE(agent_id, user_id)` evita pertenencia duplicada. Las respuestas API de contacto
incluyen `agentID` y `role` (`owner` o `member`). Usa `id`, no `agentID`, para todas
las rutas existentes de chat, programaciones, foto, no leídos y notificaciones.

La migración `0014_directed_contact_invitations.sql` añade `recipient_id` anulable,
índice de bandeja del destinatario y una solicitud pendiente única por agente/destinatario. Los códigos
existentes conservan destinatarios null y comportamiento original. Las solicitudes pendientes no
crean filas de contacto, conceden acceso a memoria ni afectan la cola de atención del agente.

Los metadatos canónicos del agente se proyectan a todas las filas de participantes mediante triggers D1;
solo endpoints autorizados al creador pueden cambiarlos. Las lecturas autenticadas de fotos y
URLs firmadas de avatares de notificación validan pertenencia/sesión del destinatario
y luego resuelven la clave R2 canónica de creador/agente. No se duplican bytes de fotos.

## Memoria compartida, historial privado

El espacio de memoria es la unión de recuerdos fundamentados aportados por sus miembros,
con `sourceUserID` y `sourceUserName` adjuntos a cada recuerdo recuperado. Cada
miembro conserva un cursor independiente de extracción y como máximo 64 recuerdos, de modo que
hay hasta 256 candidatos por agente. Las claves y derechos de corrección/eliminación
se acotan al participante que los aporta. Las claves `favorite_color` de dos personas
coexisten. La extracción recibe la identidad del interlocutor resuelta por el servidor y
solo sus mensajes/recuerdos; no puede reescribir filas ajenas.

El contexto de respuesta y `search_memories` pueden recuperar recuerdos del mismo agente
tras consentimiento de uso compartido, salvo que ese participante active **Mantener este chat privado** para
su propio chat. En grupos solo se usan los hechos de un participante si pertenece a
ese grupo ([privacidad](privacy.md)). Se comparten contenido guardado de memoria, citas de origen y atribución;
no transcripciones completas originales ni bytes de adjuntos. Los recuerdos de otros agentes
siguen inaccesibles. El interlocutor actual se identifica explícitamente en
las instrucciones. Historial reciente, `search_messages`, extractos de origen,
recuperación de adjuntos y herramientas de programación siguen acotados a la conversación
privada de ese interlocutor. Un ID de turno de origen en un hecho recordado de otra persona no
concede acceso al turno sin procesar.

Por ejemplo, si Alice dice al agente que su color favorito es rojo, Bob puede preguntar
por el color favorito de Alice y recibir el hecho recordado. El color favorito propio de Bob
usa otro ámbito de autor. Recordar depende del modelo, es léxico, acotado y
falible; los fallos de extracción difieren el aprendizaje y no hacen fallar una respuesta
guardada. Los hechos existentes conservan atribución del servidor aunque su contenido antiguo
usara la palabra genérica “user”. No hay inferencia masiva retroactiva.

## Atención exclusiva y recuperación

Un mensaje aceptado se guarda como `queued` sin leerlo ni mostrar escritura
local. Distintos participantes pueden poner en cola un turno activo cada uno; cada usuario conserva
el límite existente de diez turnos activos. `dispatchAgent` inserta atómicamente una sola
reclamación `agent_attention` para la secuencia en cola más antigua. Solo inicia el Workflow
del turno reclamado. Espera un segundo, cambia ese turno a `running` (En línea),
registra `readAt` un segundo después, pone al día recuerdos previos, marca al agente escribiendo, genera y guarda
la respuesta, intenta entregar notificaciones y mantener memoria del interlocutor actual,
y luego libera atención y despacha la siguiente conversación. Los chats en espera muestran
**Esperando al contacto…**. Las burbujas de escritura requieren que su propio turno esté en ejecución.

Un trigger de base de datos también rechaza transiciones a `running` sin la reclamación coincidente
agente/turno/intento. Los pasos Workflow son seguros para repetición; las escrituras de respuesta comprueban
intento/estado y validez de programación. Un fallo de modelo o programación cancelada conserva
atención hasta que termina ese Workflow. La reclamación deliberadamente no tiene clave foránea
 de turno en cascada: eliminar/revocar un participante no puede desbloquear una generación
en curso. Las solicitudes existentes de terminación son de mejor esfuerzo. El Cron libera reclamaciones
abandonadas solo después de que el Workflow registrado informe `complete`, `errored` o
`terminated`; luego despacha el siguiente turno en cola. El estado ausente/no disponible temporalmente
nunca concede atención simultánea a otro turno. Las instancias pausadas o
persistentemente imposibles de consultar pueden bloquear al agente y requerir intervención
operativa; no existe vencimiento inseguro por tiempo del bloqueo. Un hueco de despacho se
recupera con el Cron existente de minuto.

`agent_presence` guarda un estado/plazo/última conexión por agente. Respuestas,
rondas grupales y comprobaciones de seguimiento actualizan esa misma fila; visitar chats ya no
conecta al agente (migración 0045). Las lecturas y el Cron concilian leases vencidos. Todos
los participantes comparten conectividad en línea/sin conexión, última conexión y vencimiento, según
su momento de polling. Escribiendo solo es visible para la conversación cuyo turno en ejecución
posee reclamación e intento coincidentes de atención del agente. Los demás participantes
reciben `online`, incluso si el estado almacenado es `typing`; una conversación en cola
no muestra burbuja de escritura. Las comprobaciones usan `readAt` persistido en lugar de la simulación anterior
de tres segundos: dobles marcas atenuadas significan aceptación del servidor y dobles marcas
coloreadas que el agente empezó a atender ese turno. No certifican lectura
humana ni entrega APNs. Los turnos completados/en ejecución heredados reciben un
`readAt` histórico durante la migración.

Las programaciones siguen siendo por participante y destinatario. Los trabajos vencidos se unen a la misma cola
del agente y no pueden saltarse la atención activa. Las herramientas no pueden listar/editar/cancelar
programaciones ajenas. Completar crea entradas push de outbox solo para el usuario
del turno y sesiones vigentes; pertenencia compartida no difunde respuestas.
Indicadores, confirmaciones de lectura, deduplicación de sonidos y rutas al tocar siguen
usando el ID de conversación privada de ese participante.

## API de uso compartido

Todas las rutas requieren la sesión bearer existente y `no-store`. Prefijo:
`/api/v1/contacts/sharing`. Los cuerpos se limitan a 2 KiB y admisión a
40 solicitudes por minuto por usuario. Identidad/propiedad provienen solo de la sesión.
La búsqueda de email admite además como máximo diez intentos por usuario por minuto. No
hay endpoint de directorio ni autocompletado de usuarios y no se registran emails/solicitudes.

| Método | Ruta | Contrato |
| --- | --- | --- |
| GET | `/:id` | Solo creador: miembros, IDs/vencimiento/`recipientEmail` anulable de invitaciones pendientes y `contributorModel` |
| POST | `/:id/invitations` | Campos de consentimiento y `email` opcional; solicitudes dirigidas devuelven `invitationID`, `recipientEmail`, `expiresAt`; sin email devuelve `code`, `expiresAt` |
| POST | `/preview` | `{ "code": "..." }`; devuelve nombre de contacto, vencimiento y `contributorModel` |
| POST | `/accept` | `code` o `invitationID` dirigido y campos de consentimiento; devuelve `contactID` del destinatario |
| GET | `/inbox` | Primeras 100 invitaciones dirigidas pendientes sin vencer de la cuenta actual, primero las de vencimiento más cercano, y `contributorModel` |
| DELETE | `/inbox/:inviteID` | El destinatario actual rechaza una solicitud pendiente; 204 idempotente |
| DELETE | `/:id/invitations/:inviteID` | El creador revoca invitación pendiente |
| DELETE | `/:id/members/:memberID` | El creador elimina un participante no propietario |

`:id` es el ID privado del contacto del creador; `:memberID` es un ID de su lista
de miembros. Aceptar una sola vez e insertar pertenencia comparten un lote D1.
Los códigos UUID aleatorios solo se devuelven al crearlos; D1 guarda su digest SHA-256,
no el texto plano utilizable. Los códigos viajan en cuerpos, no en URLs de logs de acceso.
El digest es el ID de revocación y no una capacidad transferible de invitación.
Las solicitudes dirigidas exponen este ID solo al creador y destinatario previsto;
aceptar por ID requiere además la cuenta autenticada coincidente.
Vista previa, inserción de pertenencia, consumo y reintentos de aceptación aplican todos
la vinculación del destinatario cuando existe. Crear una solicitud dirigida descarta su código aleatorio
plano y no devuelve código bearer. Ningún flujo envía email, mensaje externo ni notificación
push. Solo las solicitudes dirigidas aparecen en la bandeja.

## Configuración, despliegue y estado de verificación

Consulta [infraestructura](infrastructure.md#shared-contact-migration) para pasos locales y
de publicación automática, requisitos, compatibilidad y reversión. Reutiliza D1,
R2, Workflow/Cron existentes, configuración Meta, autenticación y secretos APNs. No necesita
binding, servicio externo, permiso de cuenta ni script de aprovisionamiento
nuevo. La configuración D1 ya apunta al directorio versionado de migraciones.

Comprobaciones estáticas de tipos TypeScript y Swift, compilación de migraciones sobre un esquema
SQLite vacío, preparación SQL y espacios en blanco cubren este cambio local.
No se realizó build de app/Worker, test en ejecución, ejercicio real con dos cuentas, inferencia, migración
remota, push, commit ni despliegue. Antes de afirmar funcionamiento integral,
autoriza y ejercita con dos cuentas ficticias carreras de invitaciones,
independencia de historial/lecturas/indicadores/programaciones/adjuntos, recuerdo entre usuarios,
envíos simultáneos, cancelación/eliminación durante generación, fallo de mantenimiento
de memoria, fallos/recuperación del plano de control y presentación iOS. La validación
estática no establece corrección en ejecución ni calidad de recuerdo.

## Estado de validación de invitaciones dirigidas

La migración 0014 compila con las anteriores contra un esquema SQLite
vacío con claves foráneas habilitadas. Las 21 sentencias SQL de uso compartido se preparan con
EXPLAIN sin ejecutar sentencias de aplicación. Las comprobaciones de tipos TypeScript y Swift
y de espacios en blanco cubren esta extensión local. No se ejecutaron builds, tests
en ejecución, invitaciones reales, búsquedas de cuentas en producción, inferencia, migración
remota, push ni despliegue. Coincidencia de email de cuenta existente,
solicitudes duplicadas, aceptación por otra cuenta, rechazar/revocar/vencer,
reintentos, actualización de bandeja y comportamiento de primer plano/cambio de cuenta necesitan
verificación autorizada con cuentas ficticias antes de afirmar funcionamiento integral.


Los grupos amplían el uso compartido a una conversación común con varias personas y agentes de contacto. Los derechos de invitación se conceden por miembro; añadir un contacto requiere su creador y consentimiento explícito de memoria. Consulta [grupos](groups.md).


La pantalla iOS conserva sus metadatos cargados en una caché acotada de sesión, los muestra
inmediatamente al volver y revalida en segundo plano. Consulta
[caché de navegación](caching.md#group-navigation-and-secondary-screens) para
deduplicación, invalidación por mutación/acceso y verificación.

## Aislamiento de cuentas Contributor

Con selección por cuenta, el creador ya no tiene exención implícita
Contributor para recuperar/extraer memoria de otras cuentas. Los orígenes ajenos de
contacto/personalidad requieren consentimiento Contributor explícito; la cuenta
que procesa puede enviar su propio historial acotado. La aceptación explícita
del creador en el flujo de invitación se guarda en su propia fila de contacto.
Las filas existentes no reciben consentimiento nuevo automáticamente. El procesamiento grupal
distingue al solicitante humano del contacto de consulta del propietario del agente.
Consulta [ajustes de modelo](model-settings.md#sharing-and-mcp).

## Mensajes privados entre participantes de un contacto compartido

En tu chat privado, pide a un contacto compartido: “Dile a Alice que llegaré diez minutos tarde”.
El mismo contacto coloca un mensaje de asistente en el chat privado existente de Alice,
con prefijo `Message from "<requester name>":`. No requiere grupo. iOS
y web usan las mismas herramientas API y representación existente. La ayuda de compartir en ambos
clientes explica entrega y atribución. Es un mensaje dentro de la app, no SMS.

El contacto resuelve IDs reales con `list_message_recipients` y luego
usa `send_private_message`. El descubrimiento devuelve solo nombres/IDs elegibles actuales,
nunca mensajes, emails ni archivos ajenos. Nombres duplicados y destinatarios sin
resolver requieren aclaración. Una autorización semántica acotada separada comprueba
solicitud humana actual, texto, destinatario y como máximo tres intercambios recientes
de aclaración. Hipótesis, preguntas de capacidad, cancelaciones,
sugerencias del asistente e instrucciones recuperadas no pueden autorizar envíos. Solo
el texto solicitado cruza entre chats. Compartir no autoriza copiar transcripciones.

La entrega requiere ambas proyecciones de contacto existentes del mismo agente compartido,
participación continuada de su creador, uso compartido actual y consentimiento Contributor
aplicable. Los chats aislados por conectores en cualquier extremo son inelegibles. Las instancias de contacto
se fijan antes de autorizar y se comprueban atómicamente con el intento de origen en ejecución/
atención del agente al guardar. Tareas, programaciones, iniciativa, respuestas grupales y
respuestas devueltas de grupo no pueden invocar estas herramientas privadas. Un mensaje programado para
otro participante se autoriza cuando la persona crea la programación y se entrega
literalmente después sin inferencia, nunca mediante un turno de modelo programado. Un destinatario puede responder
normalmente al contacto; devolver esa respuesta al solicitante requiere otra
petición explícita de envío del destinatario. No se crea un bucle automático de retransmisión.

### Imágenes y mensajes programados

`send_private_message` puede adjuntar una imagen, usando el mensaje como pie:
`generatedImage` es la posición de una imagen creada antes por `generate_chat_image`
en la misma respuesta, y `chatImage` es una referencia `search_chat_images` a una foto del
chat propio del solicitante (incluida una recién enviada por la persona). La imagen se resuelve con
las mismas comprobaciones de acceso vigente que la búsqueda antes de autorizar, y la autorización
debe encontrar una solicitud para enviar una imagen a ese participante. Los bytes se copian a un objeto
nuevo bajo el prefijo y registro de adjuntos del chat destinatario, para que su
limpieza y búsqueda no dependan del chat solicitante y nunca reciba el prompt de
generación ni descripciones del solicitante. Una imagen generada también permanece en
el chat del solicitante como respuesta. Si la imagen no puede resolverse o copiarse, no se envía
nada. iOS y web la muestran como mensaje ordinario de imagen del contacto.

Para más tarde, el contacto usa `create_schedule` con `recipientUserID`; consulta
[Programaciones](schedules.md#messages-for-another-participant). Recibe instrucciones de
nunca entregar algo destinado a otro participante en el chat solicitante
como sustituto y de indicar claramente cuándo falla un envío o programación.

Se permite un mensaje/destinatario por turno humano, hasta 2.000 caracteres Unicode /
8.000 bytes UTF-8. Cada contacto origen y destino tiene un límite móvil diario de 12 mensajes.
Se aplican las seis ejecuciones de herramientas/tres rondas y límites humanos de envío existentes;
autorizar añade un completado de modelo limitado a 2.048 tokens con hasta 32 KB
de evidencia. No hay inferencia adicional para generar el texto entregado.

La migración 0084 añade `private_contact_message` y `chat_turn.is_private_relay`.
Un lote D1 guarda juntos turno completo solo de asistente, recibo único del turno de origen y
outbox push. Un reintento, argumentos cambiados o confirmación privada fallida
devuelve el resultado original; no puede cambiar contenido/destino. Vaciar historial/eliminar destinatario
conserva un recibo con destino null para no revivir el
mensaje. Vaciar/eliminar origen elimina su recibo, mientras permanece
el mensaje ya entregado al destinatario. Los intentos antiguos no pueden guardar sin
origen/atención actual. Los recibos confirman persistencia, nunca lectura ni aceptación
APNs. Las escrituras desconocidas recuperan su recibo o informan incertidumbre.

Los mensajes usan historial privado ordinario, no leídos y vistas previas de lista sin burbuja
humana falsa. iOS usa el proveedor/outbox APNs opcional existente, comprobado
contra los permisos originales de compartir/contacto/modelo antes de encolar y antes de
 enviar. Terminar acceso o añadir aislamiento de conectores detiene alertas sin enviar;
volver a unirse no crea autoridad nueva para un recibo antiguo. El texto entregado y
alertas APNs aceptadas no se retiran. Web recibe mediante polling
ordinario en primer plano; no tiene push del navegador. Las inserciones completas directas no encolan
extracción de memoria humana, memoria propia del agente ni trabajo autónomo de respuesta.

### Caché y verificación

No hay fetch nuevo de cliente, caché de directorio de destinatarios, store persistente
de cliente ni endpoint. Descubrir herramientas es una lectura pequeña en vivo del servidor por solicitud porque los permisos
actuales son esenciales. iOS/web reutilizan cachés de chat/lista de sesión, polling/
actualización explícita existentes, deduplicación, paginación/presupuestos de historial,
rechazo tardío e invalidación por cuenta/pérdida de acceso. Los IDs originales pendientes
de envío sobreviven navegación como antes. Una entrega guardada aparece en la
siguiente sincronización ordinaria del destinatario; los fallos transitorios conservan contenido cargado.
El cliente solicitante no descarga el historial de ningún otro participante.

Pasaron comprobaciones estáticas API/web, parsing Swift, las 84 migraciones compiladas en
SQLite vacío en memoria, preparación SQL de retransmisión y diff. No se ejecutaron tests, builds,
inferencia, mensajes reales, notificaciones, migraciones persistentes ni publicación.
Tras publicar automáticamente, verifica con cuentas ficticias en iOS/web:

- Un contacto compartido sin grupo entrega una vez un mensaje literal, con nombre,
  vista previa del destinatario y recuento no leído correctos y sin acceso del remitente al historial ajeno.
- Ambigüedad del destinatario, falta de contacto común, participante ausente/eliminado, aislamiento
  de conectores, consentimiento aplicable, cancelación y envíos autónomos no compatibles.
- Solicitudes transcritas de voz, aclaración inmediata, respuesta del destinatario seguida de
  retorno explícito y conversaciones privadas ordinarias en curso.
- Llamadas/reintentos duplicados, argumentos cambiados, confirmación perdida de base de datos,
  límites, vaciado/eliminación/reincorporación del destinatario y eliminación de origen alrededor de guardar/push.
- Reapertura/atrás, chat vacío en caché, actualización, recuperación sin conexión, cambio de cuenta,
  sincronización de primer plano y APNs con app iOS cerrada y claves de la instalación independiente.

Consulta [configuración reproducible y reversión](infrastructure.md#private-shared-contact-messages--migration-0084).

### Referencias de respuesta e historial autoritativo de envíos

Una solicitud humana nueva como “Dile que yo también lo adoro” puede referirse al remitente
de una retransmisión privada recibida. El servidor aporta hasta tres referencias entrantes
de los últimos doce turnos completados, más una retransmisión citada explícitamente cuando existe,
con ID de mensaje, ID/nombre real del remitente, hora guardada y hasta 1.600 bytes UTF-8
de texto recibido localmente por elemento. La identidad proviene del recibo persistido, nunca
de nombres o instrucciones incrustados en el cuerpo. Ambos contactos deben seguir
siendo elegibles según compartir/aislamiento/modelo. El autorizador ve las
mismas referencias verificadas que el planificador del chat; un remitente entrante citado tiene
prioridad; en otro caso el remitente reciente pertinente puede resolver una respuesta. Referencias
competidoras requieren aclaración. Recibir texto nunca autoriza por sí solo responder.
Nunca se recuperan para esto la solicitud original, historial privado ni respuestas posteriores
del otro participante.

Cada turno privado humano ordinario también recibe hasta seis recibos salientes recientes
de su propio chat. Identifican turno de origen, destinatario si sigue disponible, hora de
guardado, si permanece el turno entregado y un extracto acotado del texto enviado.
Estos hechos prevalecen sobre afirmaciones históricas del asistente, incluidas negaciones erróneas.
`get_private_message_receipts` busca recibos antiguos por ID de turno de origen o una
subcadena literal de solicitud original/texto enviado; nunca envía mensaje ni
lee respuestas ajenas. Eliminar origen sigue eliminando su recibo; eliminar historial
del destinatario conserva evidencia de que ocurrió el envío, con texto no disponible.
Usa los registros existentes de la migración 0084, incluidos mensajes anteriores a esta
reparación. No requiere migración ni relleno retroactivo nuevo.

Un agradecimiento, pregunta sobre estado de entrega o corrección no es una solicitud de envío.
Un intento nuevo fallido no revoca una entrega exitosa anterior. Un reintento vago
de un envío exitoso confirma su recibo; enviar otra copia requiere
solicitar explícitamente otra copia. Las repeticiones del mismo turno de origen siguen devolviendo
su único recibo original. Los recibos prueban mensaje guardado, nunca lectura ni aceptación
push. La ambigüedad semántica sigue bloqueando.

`private_relay_result` registra códigos fijos de herramienta/etapa/resultado y bandera de envío;
`private_relay_failed` registra solo etapa/código de excepción saneado. No se registran texto
de mensaje, IDs de participantes/turnos, prompts, argumentos, cuerpo del proveedor ni credenciales.
Los fallos previos a guardar, guardados inciertos y éxitos registrados son distintos.
La publicación anterior no registraba rechazos normales, por lo que el primer rechazo
exacto del incidente reportado no puede reconstruirse desde recibos de base de datos.

Esta reparación cambia la API compartida para iOS y web, sin cambios de protocolo de cliente,
UI, polling, vida de caché, IDs pendientes ni reintentos. Pasaron tipos estáticos API/web y
preparación de nueve sentencias SQL de retransmisión/acceso sobre el esquema SQLite vacío
de 84 migraciones; no se ejecutaron tests/builds locales, inferencia en vivo, envíos ni notificaciones.
Sigue siendo necesaria verificación en ejecución: responder por pronombre inmediatamente tras un
mensaje recibido, citar un remitente anterior entre varios, resolver nombres
 duplicados por ID de recibo, reconocer un envío exitoso, cuestionar una negación falsa
anterior, buscar un recibo antiguo, pedir explícitamente una segunda copia y comprobar que
cancelaciones, pérdida de acceso e instrucciones inyectadas en mensajes no puedan enviar.
