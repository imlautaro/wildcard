# Contactos y conversaciones privadas

La barra de Chats usa el color adaptativo de etiquetas del sistema para el botón más,
que abre Contactos directamente. Los botones de compartir y programaciones usan el mismo
color neutro en apariencia clara y oscura.

Los registros de contactos persisten en Cloudflare D1; las
[fotos de perfil](profile-photos.md) opcionales se guardan privadamente en R2. Cada operación
requiere la sesión bearer firmada actual. El propietario se toma exclusivamente
de esa sesión verificada; los clientes no pueden proporcionarlo ni cambiarlo. Una identidad de contacto puede compartirse mediante [invitaciones](sharing.md); los registros de conversación siguen privados por participante. El creador controla nombre/foto compartidos y acceso de participantes.

## API

| Método | Ruta | Comportamiento |
| --- | --- | --- |
| GET | `/api/v1/contacts` | Primero actividad de conversación más reciente, 50 por página |
| POST | `/api/v1/contacts` | Crea con `{ "name": "My contact" }`; devuelve 201 |
| GET | `/api/v1/contacts/:id` | Lee tu contacto |
| PATCH | `/api/v1/contacts/:id` | El creador renombra con `{ "name": "New name" }` |
| PATCH | `/api/v1/contacts/:id/alias` | Cualquier titular fija o borra su alias privado con `{ "alias": "Berdi" }` o `{ "alias": null }`; devuelve el contacto |
| DELETE | `/api/v1/contacts/:id` | El creador elimina todo el agente; un miembro sale y elimina su conversación privada; devuelve 204 |

Un contacto contiene `id` de conversación privada, `agentID` compartido, `role` (`owner` o `member`), `name`, `photoVersion` anulable, `createdAt` y `updatedAt`; las marcas temporales son milisegundos
Unix. Crear/leer/actualizar devuelve `{ "contact": ... }`. Listar devuelve
`{ "contacts": [...], "nextCursor": string | null }`. Pasa el cursor devuelto como
`?before=<cursor>` para cargar la siguiente página. La paginación ordena por `lastMessageAt` (recurriendo a `createdAt` para chats
vacíos) e ID descendente, sin offsets. Las marcas temporales de cursor usan ese mismo
valor de actividad. Enviar un mensaje o recibir respuesta sube el chat;
renombrar, cambiar foto, abrir o marcar leído no afecta la actividad.
Los contactos nuevos y conversaciones recién activas se descubren al actualizar la
primera página. La actividad es mutable, así que la paginación no es una instantánea congelada.

Los nombres se recortan y deben tener 1–100 puntos de código Unicode sin caracteres de
control. Solo se acepta `name` al crear/actualizar; JSON malformado,
campos desconocidos, nombres vacíos y cursores inválidos devuelven 400. Los cuerpos se limitan a
4 KiB. SQL usa parámetros preparados, incluidos IDs y valores de cursor.

Todas las lecturas, actualizaciones y eliminaciones incluyen el ID de usuario de la sesión en el predicado
de base de datos. Un ID ausente y uno de otra persona devuelven el mismo 404. Una
sesión sin autenticar o inválida devuelve 401. La autenticación por cookie no
sustituye el token bearer suministrado en estas rutas. Las respuestas usan
`Cache-Control: no-store` y los contactos devueltos no exponen IDs de propietario.

## Flujo iOS

Chats muestra conversaciones con al menos un mensaje persistido, incluidos
mensajes solo de adjunto, más los cinco contactos del onboarding marcados `onboardingChat: 1`.
Estas filas iniciales muestran Aún no hay mensajes hasta que empieza actividad; los contactos
vacíos ordinarios solo están disponibles en Contactos. Consulta [onboarding](onboarding.md). Chats conserva
el orden por mensajes recientes, carga la primera página al aparecer, actualiza al
volver a primer plano y permite deslizar para actualizar y Cargar más. Si una
página solo contiene contactos vacíos, continúa automáticamente hasta encontrar
conversaciones o llegar al final. Distingue estados de carga, vacío,
fallo de solicitud y poblado. Mientras está activa, la estructura autenticada actualiza
contactos cada tres segundos e inmediatamente al activarse en primer plano. Las páginas
posteriores cargadas sobreviven a actualizaciones automáticas y se ordenan con las filas actualizadas por
actividad. Se retienen filas cargadas que caen por debajo de la primera página.
Cuando cambia la pertenencia de primera página, la paginación reinicia desde su nuevo
límite; cargar más actualiza/deduplica filas existentes y llena huecos.
Puede volver a visitar una página ya cargada después de cambios de actividad. Las instantáneas de contactos se guardan en memoria;
el estado leído persiste en el servidor. El store se recrea al cambiar la persona autenticada y respuestas
de una sesión anterior o solicitud invalidada no pueden poblar el estado nuevo.

Toca **+** para abrir **Contactos** sin desplegable. Sus filas de acciones son
**Crear grupo**, **Invitaciones de grupos**, **Invitaciones de contactos**, **Crear contacto**
y **Unirse a contacto compartido**. Las invitaciones siguen visibles estando vacías y muestran
recuentos pendientes si existen. Siguen todos los contactos ordenados alfabéticamente
mediante comparación localizada de nombres, con IDs para desempatar nombres iguales.
Contactos carga automáticamente páginas restantes y reordena al llegar; los errores
conservan filas cargadas y ofrecen Reintentar. Toca un contacto para abrir su chat y volver al
inicio al navegar atrás. Editar/Eliminar al deslizar o en menú contextual siguen disponibles
en ambas listas. Elige **Crear contacto**, completa lo que quieras (el nombre vacío o una foto **Generar con IA**
se generan; consulta [creación con IA](contact-generation.md)) y toca Crear en
la barra superior para abrir el chat cuando esté listo (iOS y web). **Unirse a contacto compartido** acepta un código del creador; requiere
consentimiento de uso compartido y abre un chat privado nuevo vacío. **Compartir contacto** en el chat del creador (menú de tres puntos iOS) abre administración de uso compartido/acceso, incluidas invitaciones por email de cuenta existente. Los destinatarios abren **+ → Contactos → Invitaciones de contactos** para aceptar o rechazar; no se envía email al buzón. Desliza una fila para Editar o Eliminar; un menú
contextual ofrece lo mismo. Editar apila el editor en la pila compartida
existente. Eliminar requiere confirmación. Las mutaciones exitosas actualizan la
lista con la respuesta del servidor; crear reemplaza el editor por el chat nuevo. Los guardados fallidos conservan
el borrador y muestran error. Una eliminación fallida conserva la fila para reintentar.
Eliminar un contacto ya eliminado desde otro cliente quita su fila local desactualizada.

Abrir un contacto lee su registro actual y abre su conversación persistida.
Toca su título para editar nombre o foto. El editor comparte `ProfileIdentityView`
con Cuenta: toca el avatar centrado con su cámara para Elegir foto o
Eliminar foto y el nombre centrado debajo para Editar nombre. Crear contacto
usa los mismos controles y muestra Añadir nombre hasta introducirlo. Crear/Guardar
persiste el borrador; los miembros de contactos compartidos no tienen menús de edición. Consulta [chats](chats.md) para almacenamiento y generación. Una caché de registros por sesión
conserva detalles cuando actualizar la primera página cambia la lista visible.
Las actualizaciones simultáneas no pueden sobrescribir mutaciones exitosas y estas conservan
páginas cargadas y cursor keyset. Un rechazo de sesión borra el token guardado
y vuelve a autenticación, usando la recuperación existente de Keychain si falla
eliminar la sesión local.

## Migración D1 y configuración independiente

La migración `apps/api/migrations/0002_contacts.sql` crea `contact`, con clave
foránea a `user` usando `ON DELETE CASCADE` e índice por propietario/hora de creación/ID. No
 añade recurso Cloudflare, secreto ni servicio externo. Usa el binding `DB`
y permisos de edición D1 existentes de [configuración de infraestructura](infrastructure.md).
Localmente, aplica migraciones pendientes con `npm run db:migrate:local` antes de
iniciar la API. La publicación automática aplica la misma migración versionada a
la base remota configurada antes de desplegar el Worker enviado.

La migración es aditiva y compatible con la API anterior solo de autenticación. No
reescribas migración 0001 ni una 0002 ya aplicada. Revertir Worker no elimina
la tabla ni recupera contactos borrados. Eliminar autorizadamente un usuario/cuenta elimina en cascada
sus filas. Consulta [contactos compartidos](sharing.md) para migración 0013, proyecciones por participante, eliminación/revocación y recuperación de atención.

## Estado de validación

Pasaron comprobaciones de tipos TypeScript y Swift. La migración 0002 se aplicó a D1 local;
la revisión estática de consultas confirmó predicados de propietario en cada lectura/actualización/eliminación.
Producción recibe migración y API mediante la publicación automática documentada
tras commit y push. Verifica que termine, que la etiqueta de versión
coincida con el commit enviado y que D1 no tenga migraciones pendientes antes de usar
el cliente con la API pública. No se ejecutaron tests CRUD, de aislamiento entre dos cuentas, build iOS
ni sesión de simulador. Antes de afirmar verificación integral, usa
cuentas ficticias para comprobar crear/listar/renombrar/eliminar, lecturas/escrituras entre usuarios,
cuerpos inválidos, paginación, cerrar/volver a iniciar sesión, actualizaciones desactualizadas y estados de fallo
cuando se autorice probar en ejecución. No uses datos privados ajenos.

## Integración de conversación

Los contactos ahora abren [conversaciones privadas](chats.md). Las respuestas de lista/detalle incluyen
`lastMessageText` anulable, truncado a 500 puntos de código de la respuesta o mensaje de usuario
más reciente, y `lastMessageAt` anulable en milisegundos Unix para ese mismo
mensaje. Las respuestas completadas usan la hora de finalización del turno; en otro caso
se usa la creación del mensaje humano, incluso durante reintentos o fallos.
Las conversaciones vacías devuelven null. Renombrar no cambia la hora del mensaje.
La marca se deriva de turnos existentes y no requiere migración ni servicio
nuevo. Las respuestas anteriores sin este campo siguen siendo decodificables por iOS.

Chats usa una lista simple de ancho completo sin encabezado Contactos ni flechas.
Solo las filas interiores tienen separadores; la primera no tiene divisor superior y la última
no tiene divisor inferior.
La vista previa recorta cada línea, elimina líneas vacías y une las restantes
con espacios antes de ajustarlas a un máximo de dos líneas. Los mensajes guardados y
burbujas conservan el formato original.
Cada fila abre la conversación y muestra la hora del último mensaje a la derecha,
encima del indicador de no leídos: hora y minutos locales hoy, `Yesterday` para un día calendario
atrás, día de semana en inglés de dos a seis días atrás y `dd/MM/yyyy` para mensajes
anteriores. Las etiquetas actualizan cada minuto mientras son visibles. Los chats vacíos no tienen fecha.
Si una API anterior omite `lastMessageAt`, las filas reutilizan un turno final coincidente de la
caché de conversación o una marca retenida por ContactsStore para esa misma vista previa.
Recrear una fila o volver al inicio no borra la marca en caché. Una fila poblada
visible sin entrada coincidente solicita la página más reciente de conversación
y conserva su hora durante la sesión. Las solicitudes simultáneas para el mismo
contacto y vista previa se deduplican; se descartan resultados no coincidentes o de contactos
eliminados. Esta lectura no marca leído ni genera
respuestas. Los fallos dejan la fecha ausente y los chats vacíos no hacen solicitud de respaldo.
La primera consulta sin caché requiere red. Las vistas previas idénticas de mensajes
distintos no pueden invalidar fiablemente esta caché de compatibilidad; el
`lastMessageAt` del servidor es autoritativo una vez publicado y no requiere otra
solicitud de historial. Instala iOS actualizado para usar esta ruta de compatibilidad;
publica la API mediante el pipeline automático existente de commit/push para
proporcionar marcas directamente.

Renombrar proyecta el nombre compartido a todos y conserva conversaciones privadas. Eliminar como creador elimina en cascada los turnos de todos; salir como miembro solo elimina su propia proyección. Ambos solicitan terminación de mejor esfuerzo; el trabajo de proveedor en curso puede consumir créditos. La [memoria compartida](sharing.md) expone hechos atribuidos, mientras las transcripciones sin procesar siguen privadas.

## Respuestas sin leer

Las respuestas de contacto incluyen `lastReadSequence`; las lecturas de lista/detalle incluyen además
`unreadCount`, contando respuestas completadas del asistente posteriores a esa secuencia. La
respuesta de lista añade `totalUnreadCount` entre todos los contactos propios, incluidas páginas no
cargadas. iOS muestra contadores en filas y pestaña Chats. La respuesta se confirma
solo después de cargarla en la conversación activa mediante
`PUT /api/v1/contacts/:id/chat/read` con `{ "sequence": <last displayed completed reply> }`.
La confirmación devuelve `lastReadSequence`, `unreadCount` y
`totalUnreadCount`; el último es el total autoritativo del icono de app, incluidos
contactos de páginas no cargadas. Esta actualización monótona autorizada al propietario no puede confirmar una respuesta posterior a
la secuencia suministrada ni retroceder la marca. Solo obtener contactos o
historial no marca nada leído. Las confirmaciones fallidas reintentan en la siguiente
consulta activa. Otros dispositivos observan el estado leído compartido del propietario.

La migración `0005_read_state.sql` añade una marca no negativa, inicialmente cero, a los
contactos. Las respuestas completadas existentes aparecen inicialmente sin leer hasta abrirse porque
las versiones anteriores no registraban lecturas. La configuración local y publicaciones automáticas aplican
la migración aditiva con comandos y credenciales existentes. La reversión conserva
la columna; los clientes antiguos siguen funcionando pero no pueden confirmar respuestas nuevas.

La API de fotos, recorte, recuperación de fallos, migración 0006, retención R2
y avatares de notificación se documentan en [fotos de perfil](profile-photos.md).

## Orden de más recientes primero (27 de octubre de 2026)

La API y store iOS usan la misma marca descendente de último mensaje/creación
e ID para desempatar en todas las rutas de actualización, paginación y mutación local. Se reutilizan
marca derivada de turnos e índices D1 existentes; no requiere migración, binding
ni cambio de infraestructura. Las respuestas programadas participan normalmente.
Se registran comprobaciones estáticas TypeScript, Swift y SQL con este cambio. No se ejercitaron
paginación en ejecución ni comportamiento visual; en este turno de implementación no se ejecutaron tests/builds
ni publicación.


Las conversaciones grupales se intercalan con chats privados poblados en la misma
sección, ordenadas por la hora del último mensaje. Ambas usan botones simples sin
chevrones, avatares de 48 puntos y la misma presentación de fecha. Las vistas previas grupales añaden
prefijo de remitente en negrita. Siguen disponibles las acciones existentes privadas al deslizar/menú contextual y el
directorio alfabético Contactos. Los grupos anteriores al límite actual de paginación
privada aparecen solo al llegar Cargar más a esa hora.
Consulta [grupos](groups.md).

## Diseño de detalles de contacto

Los detalles siguen el patrón de ajustes de ambos clientes:

- **Encabezado de identidad.** Avatar con botón de cámara (elegir o eliminar foto) y
  nombre debajo; tocarlo lo edita (editor iOS; `AppSheet` web). Los participantes
  compartidos ven "Contacto compartido · administrado por su creador".
- **Filas de ajustes** con iconos iniciales. Los interruptores siguen en línea (Iniciativa de conversación,
  Mensajes de voz). Cualquier opción o detalle es una fila con valor actual
  que abre una hoja: **Voz** (acento y voz) y, para el creador, **Energía de
  grupo**. Las explicaciones están detrás de botones de información (`InfoButton` popover iOS, hoja
  `InfoButton` web), no párrafos al pie.
- **Filas de navegación** con iconos: Personalidad, Conexiones, Miniapps, Tareas y, en web,
  Compartir contacto.
- Multimedia y documentos compartidos; luego (web) archivar, vaciar y eliminar al final.

La pantalla de edición iOS conserva **Guardar** en la barra para cambios de nombre y foto; web guarda
el nombre o foto nuevos inmediatamente. Siguen pendientes comprobaciones en dispositivo/navegador de hojas, popovers,
foco y lectores de pantalla.

## Compartido en este chat

Los detalles de contacto iOS y web muestran las fotos y archivos de tu chat privado con
ese contacto en pestañas Multimedia y Documentos. Consulta [adjuntos](attachments.md#shared-in-this-chat).
Los chats privados también pueden mantener [listas de tareas](tasks.md) en las que trabaja el contacto.

## Personalidad

Tras crear un contacto, abre **Detalles del contacto → Personalidad** en iOS o web.
El creador edita identidad ficticia compartida, especialidades opcionales (fortalezas relativas
que no limitan temas), fecha de nacimiento y zona horaria
opcionales y quince controles enteros de temperamento; otros participantes pueden
inspeccionarlos sin editar. La edad se deriva de la fecha actual. El experimento empieza
deshabilitado y los ajustes usan un endpoint versionado separado, conservando los contratos existentes
solo de nombre para creación/renombrado. Guardar cambios borra
sus observaciones emocionales entre conversaciones y conserva transcripciones y
recuerdos factuales. Las relaciones siguen a cada persona entre chats elegibles y
grupos mediante dirección de actuación por destinatario; las causas privadas siguen privadas y
las conversaciones de conectores permanecen aisladas. Consulta [personalidad](personality.md) para API completa, comportamiento,
privacidad, caché y verificación pendiente de dispositivo/modelo.

## Contactos del primer círculo

El [onboarding](onboarding.md) de cuentas nuevas crea cinco contactos propios con personalidades
contrastantes habilitadas, nombres propuestos como comunes en el país elegido e
idioma preferido de conversación. Meta Muse Image 1.0 genera avatares privados
en el estilo seleccionado. Usan trigger normal de contacto/agente, rutas de fotos
y cachés. El grupo de onboarding referencia las mismas cinco identidades.
No afecta cuentas existentes ni sus contactos.

## Creación con IA y borradores de personalidad

iOS y web crean contactos con [un formulario](contact-generation.md) donde los campos vacíos
se generan con IA, con contexto de onboarding persistido y selectores solo del bot. Crear
usa borrador/ID pendiente de sesión y trabajo D1 duradero sobre el Workflow
existente; navegar reutiliza caché y luego revalida. Los contactos nuevos generados
reciben cumpleaños adultos aleatorios. Editar cumpleaños debe mantener al menos 18 años.
Los creadores existentes pueden generar/regenerar todos los campos en el borrador existente de
sesión, revisarlos y guardar con protección de conflicto de revisión. Generar
conserva nombre y cumpleaños adulto. Cambiar cuenta/perder acceso descarta estado
privado en caché; las cachés existentes de fotos siguen siendo autoritativas para bytes. Consulta la guía
vinculada para recuperación, retención, límites, caché y comprobaciones pendientes en dispositivo.

## Voz

Los contactos exponen `voiceID`, `voiceName` y `voiceMessagesEnabled` del participante.
La voz pertenece al agente compartido (`PUT /:id/voice` solo del creador); la habilitación es
por participante (`PUT /:id/voice-messages`). Los detalles muestran estos controles solo
cuando `GET /me` informa `features.voiceMessages`. Consulta [mensajes de voz](voice.md).

## Acciones de ciclo de vida

Ambos clientes exponen [archivar, vaciar y eliminar](chat-lifecycle.md). Vaciar afecta solo la conversación privada de este participante, conservando opcionalmente conocimiento extraído. Eliminar como creador ahora también elimina sus mensajes/multimedia grupales y trabajo asignado; eliminar como miembro mantiene el acceso de los demás. Los fallos externos de eliminación se reintentan duraderamente.

## Alias de contacto (nombre visible privado)

Cada persona puede dar a un contacto un nombre visible privado. Existe solo en su propia
fila `contact` (`contact.alias`, anulable, migración `0075_contact_alias.sql`), para que
los demás participantes, invitaciones compartidas y grupos sigan mostrando el nombre compartido. Creador
y miembro pueden fijar alias; los miembros no pueden renombrar el contacto compartido.

- Respuestas de contacto: `name` es el **nombre visible** (`alias` o nombre compartido), `realName`
  es el nombre compartido y `alias` es el valor sin procesar o `null`. Renombrar, solo para creador, edita
  `realName`; los clientes deben completar ese campo desde `realName`, no `name`.
- `PATCH /api/v1/contacts/:id/alias` acepta solo `alias`: 1–100 puntos de código, sin caracteres de
  control y recortado. `null` o una cadena en blanco lo borra. 404 si quien llama no tiene el contacto.
- El servidor resuelve para quien solicita (alias o nombre compartido): lista/detalle de contactos,
  títulos/subtítulos push directos y grupales, feed Novedades (tarjetas, progreso, programaciones, tareas, miniapps),
  `senderName` de mensajes grupales, citas, vista previa/actividad de lista grupal, miembros,
  actividad de escritura/investigación/grabación, recibos de información del mensaje, reacciones, nombres de
  responsables/autores de tareas y documentos, perfiles de aprendizaje y acceso grupal MCP.
- Conciencia del contacto (2026-10-31): en el chat privado propio del titular, el prompt de respuesta y el
  de iniciativa añaden una línea que indica cómo guardó la persona al contacto
  (`aliasAwareness` en `contacts/alias.ts`). Es solo contexto: conserva su nombre compartido, no se le
  pide mencionar el alias y se le indica no presentarse con él, guardarlo como hecho propio ni
  repetirlo en grupos o a otras personas. Sus turnos propios de tareas y programados en ese chat también lo reciben;
  los prompts de grupo, chats de otros titulares
  y curación de Novedades no lo reciben. Sin cambio de cliente: ya envían el alias.
- Nunca se resuelve: otros prompts de modelos y resultados de herramientas (el bot sigue conociéndose y a sus pares por el nombre compartido),
  texto escrito o generado dentro de mensajes (una mención `@Alberdi` o nombre en una respuesta de bot es
  texto guardado y no se reescribe), invitaciones/uso compartido (el destinatario ve el nombre compartido y fija su alias)
  y app administrativa.
- Renombrar (solo creador, `PATCH /contacts/:id`) cambia el nombre compartido en todas partes en un lote D1:
  `contact_agent.name` y `contact.name` de cada titular, actualizando su `updated_at`. Los alias no cambian,
  de modo que el titular con alias lo sigue viendo. Las invitaciones nuevas, mensajes grupales nuevos y prompts propios del bot
  usan el nombre nuevo; los mensajes anteriores conservan su `sender_name` guardado. Los clientes ajenos recogen el
  nombre nuevo al actualizar la lista; no hay push por ello. Comprobado en D1 local de
  workerd: un intento de miembro no cambia nada; renombrar como creador actualiza agente y todas las copias.
- Los mensajes grupales conservan una instantánea inmutable compartida `sender_name`; el alias se superpone al leer
  por `agent_id` (`apps/api/src/contacts/alias.ts`). Eliminarlo restaura el nombre compartido
  en todas partes en la siguiente lectura.
- Caché: las cachés con nombres resueltos por el servidor (conversación/miembros/lista grupales, tareas, documentos,
  reacciones, aprendizaje, feed Novedades) se invalidan y recuperan tras cambiar alias; consulta
  [caché](caching.md) y [web](web.md).
- Verificación (31 de octubre de 2026): el SQL de superposición se ejercitó en D1 local de workerd con dos usuarios
  titulares del mismo agente (alias solo para uno): mensajes, citas, miembros, resumen de grupo,
  actividad y filas de contacto devolvieron alias al titular y nombre compartido al otro.
  Entrega push, ambos clientes y consultas restantes solo se comprobaron estáticamente.

**iOS:** el editor (`ContactEditorView`) tiene una sección **Alias** para todo titular, con botones propios Guardar alias
y Eliminar alias porque los miembros no tienen Guardar en la barra; el campo de renombrado se completa desde el nombre
compartido. `Contact.realName`/`alias` se decodifican opcionalmente para cargar instantáneas anteriores. Solo comprobación estática de tipos;
no se ejecutó en simulador ni dispositivo.

## Recuerdo por temas

Desde el 2026-10-31, antes de responder por privado la API busca lo ya dicho sobre
el tema, en lugar de depender de los doce turnos recientes. Las palabras temáticas provienen
del mensaje actual y el anterior (`topicTerms` en `chat/memory.ts`:
palabras de cuatro o más caracteres menos palabras funcionales españolas/inglesas y verbos
de recuerdo como "contame", "hablamos", "remember"). Con ellas precarga, clasificadas por
FTS5 `bm25`:

- hasta cinco afirmaciones grupales (`relevantGroupMessages` en `groups/retrieval.ts`) con
  las mismas reglas de acceso de `search_group_messages`; sin palabras temáticas, el bloque recurre
  al comportamiento previo (afirmaciones recientes que coinciden con palabras del mensaje);
- hasta cuatro turnos anteriores de este chat privado más antiguos que el historial reciente
  (`relatedPrivateTurns`), como fragmentos recortados con IDs de turno para
  `get_conversation_excerpt`.

El prompt añade `topicRecallInstruction`: ante una pregunta sobre un tema concreto o
solicitud de detalles, comprueba esa evidencia, busca en grupos y mensajes anteriores si
parece parcial, responde con todo lo pertinente de ambos y nunca pidas repetir
lo que puede consultarse. Las respuestas vinculadas usan los mismos helpers (ver abajo). La búsqueda
sigue siendo léxica: un tema tratado con palabras totalmente distintas solo se encuentra cuando el
modelo busca otra vez con ellas. El bloque grupal también incluye las afirmaciones
junto a los dos mejores resultados, porque un tema abarca mensajes adyacentes que no repiten sus
palabras.

Comprobado el 2026-10-31 con `conversation-style-live-eval.mjs` en
`muse-spark-1.3-contributor` y chats ficticios (el `scenario.groupAgents` opcional nuevo
mantiene otros agentes fuera del grupo). Una fiesta sorpresa planeada en grupo, diez
mensajes grupales no relacionados y luego "qué teníamos armado para el cumple de Juli?" en el
chat privado: antes el contacto solo contestaba con la fecha del privado
(2 de 2 ejecuciones); después enumeró todos los detalles grupales (2 de 2). Un contacto vinculado fuera del
grupo preguntó los detalles: antes el otro dijo no saber nada (2 de 2);
después leyó el grupo y el contacto solicitante transmitió todos los detalles (3 de 3). El SQL
nuevo se preparó y ejecutó en D1 local de workerd. No verificado en dispositivos ni chats
reales.

## Contactos vinculados

Desde el 2026-10-31 una persona puede dar acceso mutuo a dos contactos propios
(**Detalles del contacto → Contactos vinculados** en iOS y web). El vínculo es mutuo: vincular Vale
a Tomi también vincula Tomi a Vale. Los contactos con conectores privados
(aislados por conector, `mcp_private_contact`) o todavía en creación no pueden vincularse,
para que los datos de conectores nunca crucen vínculos.

- **Almacenamiento** (migración 0078): `contact_link` guarda una fila por par de filas de contacto
  propias de la persona, en orden fijo (`contact_a < contact_b`); `contact_note` conserva
  lo que un contacto preguntó o contó a otro. Ambos se eliminan en cascada con cualquier contacto o
  cuenta. Cada titular puede vincular contactos compartidos solo para sus propios chats.
- **API**: `GET /contacts/:id/links` devuelve `links`, `available` (otros contactos
  vinculables, nombres visibles con alias) y `unavailable` (razón si este contacto no
  puede vincularse); `PUT` y `DELETE /contacts/:id/links/:otherID` vinculan y desvinculan
  y devuelven la misma estructura (30 cambios por minuto; 409 para contactos no
  vinculables).
- **En chats privados** (no chats aislados por conectores ni mensajes programados; incluye turnos de
  trabajo de tareas), el prompt enumera vinculados (nombre compartido, alias
  guardado, descripción y especialidades) y ofrece dos herramientas:
  - `ask_linked_contact {contactID, question}`: el contacto vinculado se conecta
    (presencia `online` por 90 segundos, `connectAgent`) y comprueba lo hablado
    con esta persona antes de responder: recuerdos sobre ella (solo con origen
    en ella, también en contactos compartidos), sus ocho turnos más recientes,
    hasta seis turnos privados anteriores y seis afirmaciones grupales clasificadas por pertinencia a la
    pregunta ([recuerdo por temas](#topic-recall)), y los grupos compartidos con ella. Si
    parece parcial puede ejecutar hasta dos rondas (seis llamadas) de herramientas solo de recuperación:
    `search_messages` en su chat privado propio con ella y
    `search_group_messages`/`get_group_excerpt` con el acceso grupal de ella (grupos
    donde están ambos, desde que cada uno se unió). Responde luego con su voz con los
    detalles concretos hallados y de dónde proceden, brevemente si la pregunta es simple;
    lo indica si no sabe. Devuelve la respuesta al contacto solicitante,
    al que se indica transmitir los detalles sin reducirlos. El intercambio se
    guarda como nota para el contacto vinculado.
  - `tell_linked_contact {contactID, message}`: guarda una nota. El contacto vinculado ve
    notas de los últimos siete días en sus siguientes turnos privados con la persona; una nota
    más nueva que su última respuesta se marca nueva y se transmite una vez naturalmente ("Vale
    me contó…"). No se notifica a la persona.
  Las notas usan un ID por turno, intento, herramienta y contacto, para que repetir pasos no
  las duplique y una pregunta repetida reutilice la respuesta guardada. Notas y respuestas son
  datos no confiables en prompts. Se usa el modelo del contacto solicitante para responder (y el
  vinculado debe permitirlo, como en su propio chat).
- **Privacidad** (2026-11-01, [privacidad](privacy.md)): un chat con **Mantener este chat privado**
  no puede vincularse y se pausan sus vínculos existentes. Con **Los contactos comparten entre sí**,
  cada contacto elegible cuenta como vinculado al responder (hasta 12, primero explícitos,
  luego chats más recientes); `GET /links` devuelve `allContacts: true` y sigue enumerando solo
  vínculos explícitos.
- **Clientes**: la página Contactos vinculados enumera vinculados con **Desvincular** y un
  selector para vincular otro. iOS la guarda en `ContactsStore.linkSnapshots`, web en
  `useContactLinks` (una instantánea por contacto, hasta ocho, descartadas con sesión);
  al ser mutuos, cada cambio invalida todas las instantáneas y su respuesta
  reemplaza la actual. Eliminar un contacto borra las instantáneas iOS.

Comprobado el 2026-10-31 con `conversation-style-live-eval.mjs` (`scenario.links`
opcional nuevo) en `muse-spark-1.3-contributor` y chats ficticios: al pedir "preguntale
a Tomi a dónde te dije que me iba el finde", Vale respondió "Tomi dice que le contaste que
te vas a Mar del Plata con tu hermana este finde"; después de "decile a Tomi que al final vamos
el sábado temprano", la siguiente respuesta de Tomi a un saludo lo transmitió. El SQL de vínculos y
cascadas se ejecutó en D1 local de workerd. No verificado en dispositivos.
